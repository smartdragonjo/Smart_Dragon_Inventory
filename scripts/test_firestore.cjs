const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness(seed = {}, queryError = null, hooks = {}) {
    const docs = new Map(Object.entries(seed));
    const reads = [];
    let writes = 0;
    const snapshot = (path) => ({ id: path.split('/').pop(), exists: docs.has(path), data: () => docs.get(path), ref: ref(path) });
    const apply = (path, value, options) => {
        writes++;
        const result = options?.merge ? { ...docs.get(path) } : {};
        for (const [key, val] of Object.entries(value)) result[key] = val?.increment ? (result[key] || 0) + val.increment : val;
        docs.set(path, result);
    };
    const ref = (path) => ({ id: path.split('/').pop(), path,
        get: async () => { reads.push(path); return snapshot(path); },
        set: async (value, options) => apply(path, value, options)
    });
    const query = (name, filters = []) => ({
        doc: (id = 'generated') => ref(`${name}/${id}`),
        where: (field, op, value) => query(name, [...filters, [field, value]]),
        limit() { return this; },
        add: async (value) => { apply(`${name}/audit`, value); return ref(`${name}/audit`); },
        get: async () => {
            reads.push({ name, filters });
            if (hooks.beforeQuery) hooks.beforeQuery(name, filters, docs);
            if (queryError && filters.length > 1) throw queryError;
            const rows = [...docs].filter(([path, value]) => path.startsWith(name + '/') && filters.every(([key, wanted]) => value[key] === wanted));
            return { docs: rows.map(([path]) => snapshot(path)), empty: rows.length === 0 };
        }
    });
    const database = {
        collection: query,
        batch: () => {
            const ops = [];
            return { set: (...args) => ops.push(() => apply(args[0].path, args[1], args[2])),
                delete: (doc) => ops.push(() => docs.delete(doc.path)),
                commit: async () => ops.forEach((op) => op()) };
        },
        runTransaction: async (fn) => {
            if (hooks.beforeTransaction) hooks.beforeTransaction(docs);
            return fn({ get: async (doc) => snapshot(doc.path), set: (doc, data) => apply(doc.path, data) });
        }
    };
    const storage = () => {
        const data = new Map();
        return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
    };
    const firestore = () => database;
    firestore.FieldValue = { serverTimestamp: () => 1, increment: (value) => ({ increment: value }) };
    const firebase = { apps: [{}], firestore };
    const window = { firebase, dispatchEvent() {},
        SmartDragonFirebaseConfig: { enabled: true, projectConfigured: true, collections: { vehicleFitments: 'vehicle_fitments' } },
        SmartDragonAuth: { getCurrentUser: () => ({ uid: 'owner', email: 'owner@example.test' }),
            getCurrentUserProfile: () => ({ enabled: true, role: 'owner' }), isOwner: () => true }
    };
    vm.runInNewContext(fs.readFileSync('js/firebase/firestore.js', 'utf8'), {
        window, firebase, sessionStorage: storage(), localStorage: storage(), CustomEvent: class {}, console: { warn() {} }
    });
    return { api: window.SmartDragonFirestore, docs, reads, writes: () => writes };
}

test('cold make list reads only the summary document', async () => {
    const h = harness({ 'meta/makes': { makes: ['Toyota', 'Ford', 'Toyota'], dirty: false } });
    assert.deepEqual(Array.from(await h.api.getVehicleMakes()), ['Ford', 'Toyota']);
    await h.api.getVehicleMakes();
    assert.deepEqual(h.reads, ['meta/makes']);
});

test('missing or dirty summary does not scan vehicles', async () => {
    for (const seed of [{}, { 'meta/makes': { makes: ['Toyota'], dirty: true } }]) {
        const h = harness(seed);
        await assert.rejects(h.api.getVehicleMakes());
        assert.deepEqual(h.reads, ['meta/makes']);
        assert.equal(h.api.getHealthWarnings().length, 1);
    }
});

test('index fallback reports a warning; permission failures never scan', async () => {
    const seed = { 'vehicles/one': { status: 'approved', make: 'Toyota', model: 'Corolla' } };
    const h = harness(seed, { code: 'failed-precondition', message: 'The query requires an index' });
    assert.deepEqual(Array.from(await h.api.getVehicleModels('Toyota')), ['Corolla']);
    assert.equal(h.api.getHealthWarnings().length, 1);
    const denied = harness(seed, { code: 'permission-denied', message: 'denied' });
    await assert.rejects(denied.api.getVehicleModels('Toyota'));
    assert.equal(denied.reads.length, 1);
});

const record = (row, make) => ({ source: { type: 'legacy_csv', sourceRow: row, migrationStatus: 'ready' },
    vehicle: { make, model: 'Model', yearStart: 2020, yearEnd: 2021 },
    fitments: [{ categorySlug: 'lighting', fields: { fogLight: { notApplicable: true } } }] });

test('import is repeatable, rebuilds summary, and deletion removes the last make', async () => {
    const h = harness();
    await h.api.importLegacyVehicles([record(2, 'Toyota'), record(3, 'Ford')]);
    await h.api.importLegacyVehicles([record(2, 'Toyota'), record(3, 'Ford')]);
    assert.equal([...h.docs.keys()].filter((key) => key.startsWith('vehicles/')).length, 2);
    assert.deepEqual(Array.from(h.docs.get('meta/makes').makes), ['Ford', 'Toyota']);
    assert.equal(h.docs.get('meta/makes').dirty, false);
    await h.api.deleteVehicleRecord('legacy_3');
    assert.deepEqual(Array.from(h.docs.get('meta/makes').makes), ['Toyota']);
});

test('all import records are validated before any write', async () => {
    const h = harness();
    const invalid = record(3, 'Ford');
    invalid.source.migrationStatus = 'needs_review';
    await assert.rejects(h.api.importLegacyVehicles([record(2, 'Toyota'), invalid]));
    assert.equal(h.writes(), 0);
});

test('renaming the last vehicle removes its old make from the summary', async () => {
    const h = harness();
    await h.api.importLegacyVehicles([record(2, 'Toyota')]);
    await h.api.saveVehicleRecord('legacy_2', record(2, 'Ford'));
    assert.deepEqual(Array.from(h.docs.get('meta/makes').makes), ['Ford']);
});

test('summary rebuild retries a concurrent vehicle mutation', async () => {
    let changed = false;
    const h = harness({ 'meta/makes': { revision: 1, dirty: true },
        'vehicles/one': { make: 'Toyota', status: 'approved' } }, null, {
        beforeTransaction(docs) {
            if (changed) return;
            changed = true;
            docs.set('meta/makes', { revision: 2, dirty: true });
            docs.set('vehicles/two', { make: 'Ford', status: 'approved' });
        }
    });
    await h.api.rebuildMakesSummary();
    assert.equal(h.docs.get('meta/makes').revision, 2);
    assert.deepEqual(Array.from(h.docs.get('meta/makes').makes), ['Ford', 'Toyota']);
});

test('failed summary rebuild preserves committed data and exposes repair', async () => {
    let fail = true;
    const h = harness({}, null, { beforeQuery(name) {
        if (fail && name === 'vehicles') throw new Error('offline');
    } });
    await assert.rejects(h.api.importLegacyVehicles([record(2, 'Toyota')]));
    assert.equal(h.docs.get('vehicles/legacy_2').make, 'Toyota');
    assert.equal(h.docs.get('meta/makes').dirty, true);
    assert.equal(h.api.getHealthWarnings().length, 1);
    fail = false;
    await h.api.rebuildMakesSummary();
    assert.equal(h.docs.get('meta/makes').dirty, false);
    assert.equal(h.api.getHealthWarnings().length, 0);
});

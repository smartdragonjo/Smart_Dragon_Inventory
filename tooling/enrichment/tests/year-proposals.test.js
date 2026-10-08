import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidate, mergeProposal } from '../confidence.js';
import { CarapiProvider } from '../providers/carapi-provider.js';
const identity = { make: 'Toyota', model: 'Camry' };
const carapi = { provider: 'carapi', ...new CarapiProvider({ env: {} }).normalizeResponse({
    data: [2015, 2017, 2018, 2019, 2020].map(year => ({ ...identity, year, trim: 'LE' }))
}, identity) };
for (const field of ['yearStart', 'yearEnd']) {
    for (const value of [0, '0', null, undefined, 1949, 2101, 2018.5, 'bad']) {
        test(`${field}=${value} is missing, not protected`, () => {
            const result = mergeProposal({ ...identity, [field]: value }, identity, []);
            assert.equal(result[field].protected, false);
            assert.equal(result[field].value, null);
            assert.notEqual(result[field].source, 'existing_preserved');
        });
    }
    test(`${field}=2018 remains protected against partial and full evidence`, () => {
        const vehicle = { ...identity, [field]: 2018 };
        const before = structuredClone(vehicle);
        const full = { provider: 'local_dataset', candidates: [candidate('local_dataset', { ...identity, yearStart: 2010, yearEnd: 2021 })] };
        const result = mergeProposal(vehicle, identity, [carapi, full]);
        assert.equal(result[field].protected, true);
        assert.equal(result[field].value, 2018);
        assert.equal(result[field].source, 'existing_preserved');
        assert.deepEqual(vehicle, before);
    });
}
test('CarAPI range is observed coverage only; original names remain unchanged', () => {
    const vehicle = { ...identity, model: 'Toyota Camry', yearStart: 0, yearEnd: 0 };
    const before = structuredClone(vehicle);
    const result = mergeProposal(vehicle, identity, [carapi]);
    for (const [field, value] of [['yearStart', 2015], ['yearEnd', 2020]]) {
        assert.equal(result[field].value, null);
        assert.equal(result[field].protected, false);
        assert.equal(result[field].partialCoverage, true);
        assert.equal(result[field].interpretation, 'unresolved');
        assert.deepEqual(result[field].alternatives[0], { value, source: 'carapi', sources: ['carapi'],
            partialCoverage: true, coverageLimited: true, coverageMin: 2015, coverageMax: 2020,
            interpretation: 'observed_coverage', confidence: .3 });
    }
    assert.equal(result.make.value, vehicle.make); assert.equal(result.model.value, vehicle.model);
    assert.deepEqual(vehicle, before);
});
test('unrestricted dataset years outrank partial CarAPI observations in either order', () => {
    const full = { provider: 'local_dataset', candidates: [candidate('local_dataset', { ...identity, yearStart: 2010, yearEnd: 2023 })] };
    for (const results of [[carapi, full], [full, carapi]]) {
        const result = mergeProposal({ ...identity, yearStart: 0, yearEnd: null }, identity, results);
        assert.equal(result.yearStart.value, 2010); assert.equal(result.yearEnd.value, 2023);
        assert.deepEqual(result.yearStart.source, ['local_dataset']);
        assert.equal(result.yearStart.partialCoverage, false);
        assert.ok(result.yearStart.confidence > result.yearStart.alternatives.find(a => a.source === 'carapi').confidence);
    }
});
test('partial metadata from unmatched identity cannot propose years', () => {
    const result = mergeProposal(identity, { make: 'BMW', model: '525' }, [carapi]);
    assert.deepEqual(result.yearStart.alternatives, []);
});

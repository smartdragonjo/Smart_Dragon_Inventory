const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('actual backup exporter preserves absent years, numeric years and admin fitments without writes', async () => {
    const source = fs.readFileSync('js/firebase/firestore.js', 'utf8');
    const start = source.indexOf('    async function exportVehicleBackupData()');
    const end = source.indexOf('    async function recordBackupExport', start);
    const vehicles = [null, undefined, 2020, '2021'].map((year, i) => ({ id: String(i), data: () => ({ make: 'BMW', model: '525', yearStart: year, yearEnd: year }) }));
    const context = { authContext() {}, isOwner: () => true, col: x => x, cleanText: x => x,
        db: () => ({ collection: name => ({ get: async () => ({ docs: name === 'vehicles' ? vehicles : [{ data: () => ({ vehicleId: '0', categoryId: 'lighting', source: 'admin', fields: { bulb: 'H7' } }) }] }) }) }) };
    vm.createContext(context);
    vm.runInContext(source.slice(start, end) + '; result = exportVehicleBackupData();', context);
    const rows = JSON.parse(JSON.stringify(await context.result));
    assert.deepEqual(rows.map(r => r.vehicle.yearStart).sort(), [null, null, 2020, 2021].sort());
    assert.equal(rows.find(r => r.source.backupVehicleId === '0').fitments[0].source, 'admin');
    assert.ok(rows.every(r => r.vehicle.yearStart === r.vehicle.yearEnd));
});

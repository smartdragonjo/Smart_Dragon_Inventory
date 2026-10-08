import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LocalDatasetProvider } from '../providers/local-dataset-provider.js';
import { enrich } from '../enrichment-engine.js';
const engines = [{ label: '2.0', transmission: 'automatic', drivetrain: 'FWD' },
    { drivetrain: 'FWD', transmission: 'automatic', label: '2.0' },
    { label: '2.0', transmission: 'manual', drivetrain: 'FWD' }];
const data = { group: 'audi', makes: [{ name: 'Audi', models: [{ name: 'A6', generations: [
    { name: 'A6 (2001)', yearStart: 2001, yearEnd: 2004, engines },
    { name: 'A6 (2005)', yearStart: 2005, yearEnd: 2011, engines }
] }] }] };
test('groups generations, deduplicates engines and keeps distinct transmissions nested', async () => {
    const p = new LocalDatasetProvider(data);
    const result = await p.lookup({ make: ' AUDI ', model: 'a6' });
    assert.equal(result.candidates.length, 2);
    assert.equal(result.metadata.engineVariantCount, 4);
    assert.equal(result.metadata.ambiguousGeneration, true);
    assert.equal(result.candidates[0].engines.length, 2);
    assert.equal(result.candidates[0].generation, 'A6 (2001)');
    assert.equal((await p.lookup({ make: 'Audi', model: 'A6 Allroad' })).candidates.length, 0);
});
test('no valid year leaves generation, production years and engine unresolved even for one generation', async () => {
    const single = structuredClone(data); single.makes[0].models[0].generations.pop();
    for (const yearStart of [undefined, 0, 1949, 2101]) {
        const result = await enrich({ make: 'Audi', model: 'A6', yearStart }, [new LocalDatasetProvider(single)]);
        for (const field of ['generation', 'yearStart', 'yearEnd', 'engineLabel', 'drivetrain']) assert.equal(result.proposal[field].value, null);
        assert.equal(result.results[0].candidates[0].resolution.engine, 'unresolved');
    }
});
test('valid year narrows generations but never selects an engine', async () => {
    const p = new LocalDatasetProvider(data);
    const result = await p.lookup({ make: 'Audi', model: 'A6', yearHint: 2003 });
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].match.generation, 'A6 (2001)');
    assert.equal(result.candidates[0].match.engineLabel, null);
    assert.equal(result.candidates[0].confidence.engine, 0);
    assert.equal(result.metadata.ambiguousGeneration, false);
    assert.equal((await p.lookup({ make: 'Audi', model: 'A6', yearStart: 2008 })).candidates[0].generation, 'A6 (2005)');
});
test('manual values remain protected and lookup results cannot mutate provider data', async () => {
    const p = new LocalDatasetProvider(data);
    const vehicle = { make: 'Audi', model: 'A6', yearStart: 2003, yearEnd: 2003, generation: 'Manual', engineLabel: 'Manual engine' };
    const before = structuredClone(vehicle);
    const result = await enrich(vehicle, [p]);
    for (const field of ['yearStart', 'yearEnd', 'generation', 'engineLabel']) {
        assert.equal(result.proposal[field].value, vehicle[field]); assert.equal(result.proposal[field].protected, true);
    }
    result.results[0].candidates[0].engines[0].label = 'changed';
    assert.equal((await p.lookup(vehicle)).candidates[0].engines[0].label, '2.0');
    assert.deepEqual(vehicle, before);
});
test('local Audi A6 dataset returns generation groups rather than 167 engine candidates', async t => {
    let raw;
    try { raw = await readFile(new URL('../local/vehicle-makes-models.json', import.meta.url), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return t.skip('Optional local dataset absent'); throw error; }
    const p = new LocalDatasetProvider(JSON.parse(raw));
    const result = await p.lookup({ make: 'Audi', model: 'A6' });
    assert.ok(result.candidates.length > 1 && result.candidates.length < 167);
    assert.ok(result.candidates.every(c => c.match.generation === null && c.match.engineLabel === null));
    const narrow = await p.lookup({ make: 'Audi', model: 'A6', yearHint: 2003 });
    assert.ok(narrow.candidates.length > 0 && narrow.candidates.length < result.candidates.length);
    t.diagnostic(JSON.stringify({ withoutYear: result.metadata, year2003: narrow.metadata }));
});

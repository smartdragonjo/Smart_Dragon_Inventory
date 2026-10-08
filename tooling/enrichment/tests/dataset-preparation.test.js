import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareDataset } from '../prepare-dataset.js';
import { LocalDatasetProvider } from '../providers/local-dataset-provider.js';
test('offline dataset preparation preserves schema, names, nulls and input', async () => {
    const original = { group: 'test', makes: [{ name: 'Example Make', models: [{ name: 'Example Model', yearStart: 2018, yearEnd: null, generations: [{ name: 'Example generation', yearStart: 2018, yearEnd: null, engines: [{ label: 'Example engine', displacementCc: 1500 }] }] }] }] };
    const before = structuredClone(original);
    const output = prepareDataset(original, { revision: 'test-revision', license: 'ODbL-1.0' });
    assert.deepEqual(original, before);
    assert.deepEqual(output[0].makes, original.makes);
    assert.equal(output[0].enrichmentProvenance.revision, 'test-revision');
    const result = await new LocalDatasetProvider(output).lookup({ make: 'Example Make', model: 'Example Model' });
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].engines[0].displacementCc, 1500);
    assert.equal(result.candidates[0].match.yearEnd, null);
});
test('preparation rejects incompatible schema rather than silently creating empty data', () => {
    assert.throws(() => prepareDataset({ vehicles: [] }, {}));
    assert.throws(() => prepareDataset({ group: 'test', makes: [{ name: 'Test', models: {} }] }, {}));
});

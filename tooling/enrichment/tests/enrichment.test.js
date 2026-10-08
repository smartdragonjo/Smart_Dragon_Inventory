import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeVehicle } from '../vehicle-normalizer.js';
import { enrich } from '../enrichment-engine.js';
import { candidate, mergeProposal } from '../confidence.js';
import { readSnapshot } from '../runtime.js';
import { NhtsaProvider } from '../providers/nhtsa-provider.js';
import { LocalDatasetProvider } from '../providers/local-dataset-provider.js';
import { CarapiProvider } from '../providers/carapi-provider.js';
for (const [make, model, expected, year] of [
    ['BMW', 'BMW 525', '525', null], ['BMW', 'BMW 520', '520', null],
    ['Changan', 'Changan S07', 'S07', null], ['Jetour', 'Jetour T2', 'T2', null],
    ['BYD', 'BYD QIN PLUS', 'QIN PLUS', null], ['Changan', 'EADO 2022', 'EADO', 2022],
    ['Mazda', 'Mazda 6', '6', null], ['Tesla', 'Model 3', 'Model 3', null],
    [' BMW ', ' bMw   525 ', '525', null], ['BMW', 'BMWish 525', 'BMWish 525', null],
    ['Toyota', 'Model 1949', 'Model 1949', null], ['Toyota', 'Model 2101', 'Model 2101', null]
]) test(`normalize ${make}/${model}`, () => {
    const v = Object.freeze({ make, model });
    const n = normalizeVehicle(v);
    assert.equal(n.lookup.model, expected); assert.equal(n.lookup.yearHint, year);
    assert.deepEqual(n.original, { make, model }); assert.equal(v.model, model);
});
const dataset = { group: 'synthetic-test', makes: [{ name: 'Toyota', models: [{ name: 'Corolla', generations: [{ name: 'Test generation', yearStart: 2018, yearEnd: 2020, engines: [{ label: 'Test A', displacementCc: 1000 }, { label: 'Test B', displacementCc: 2000 }] }] }] }] };
test('variants conflict, repeat rows do not count as independent agreement, input preserved', async () => {
    const v = { make: 'Toyota', model: 'Corolla', source: 'admin', generation: 'Manual generation', lighting: { source: 'admin', bulb: 'H7' } };
    const before = structuredClone(v);
    const result = await enrich(v, [new LocalDatasetProvider(dataset)]);
    assert.equal(result.proposal.engineLabel.value, null);
    assert.equal(result.results[0].candidates[0].engines.length, 2);
    assert.equal(result.proposal.generation.value, 'Manual generation');
    assert.equal(result.proposal.generation.protected, true);
    assert.deepEqual(v, before);
    assert.equal(result.proposal.bodyType.confidence, 0);
});
test('independent provider agreement increases field confidence; conflict decreases it', () => {
    const v = { make: 'Toyota', model: 'Corolla', yearHint: 2020 };
    const result = (name, gen) => ({ provider: name, candidates: [candidate(name, { ...v, generation: gen })] });
    const single = mergeProposal({}, v, [result('a', 'G')]);
    const agree = mergeProposal({}, v, [result('a', 'G'), result('b', 'G')]);
    const conflict = mergeProposal({}, v, [result('a', 'G'), result('b', 'Other')]);
    assert.ok(agree.generation.confidence > single.generation.confidence);
    assert.ok(conflict.generation.confidence < single.generation.confidence);
});
test('NHTSA uses encoded make URL, exact match and cached response, without inventing years', async () => {
    let calls = 0;
    const p = new NhtsaProvider({ interval: 0, fetcher: async (url, options) => {
        calls++; assert.match(url, /GetModelsForMake\/Toyota\?format=json/); assert.ok(options.signal);
        return { ok: true, json: async () => ({ Results: [{ Make_Name: 'TOYOTA', Model_Name: 'Corolla', Model_ID: 1 }, { Make_Name: 'Toyota', Model_Name: 'Corolla Cross' }] }) };
    } });
    const v = { make: 'Toyota', model: 'Corolla' };
    const result = await p.lookup(v); await p.lookup(v);
    assert.equal(calls, 1); assert.equal(result.candidates.length, 1); assert.equal(result.candidates[0].match.yearStart, null);
});
test('failed provider and missing keys do not stop dataset', async () => {
    const result = await enrich({ make: 'Toyota', model: 'Corolla' }, [new NhtsaProvider({ interval: 0, fetcher: async () => { throw new Error('secret-must-not-escape'); } }), new LocalDatasetProvider(dataset), new CarapiProvider({ env: {} })]);
    assert.equal(result.results[0].error, 'provider_unavailable'); assert.equal(result.results[1].candidates.length, 1);
    assert.equal(result.results[2].reason, 'missing_api_key');
    assert.ok(!JSON.stringify(result).includes('secret-must-not-escape'));
});
test('CarAPI only requests covered years, uses server credentials and v2 response', async () => {
    let calls = 0;
    const p = new CarapiProvider({ env: { CARAPI_TOKEN: 'test-token', CARAPI_SECRET: 'test-secret' }, fetcher: async (url, opts) => {
        calls++;
        if (url.endsWith('/login')) { assert.equal(JSON.parse(opts.body).api_secret, 'test-secret'); return { ok: true, text: async () => 'test-jwt' }; }
        assert.ok(url.includes('/trims/v2?')); assert.equal(opts.headers.Authorization, 'Bearer test-jwt');
        return { ok: true, json: async () => ({ data: [{ make: 'Toyota', model: 'Camry', year: 2018, trim: 'LE', id: 1 }] }) };
    } });
    assert.equal(p.supports({ yearHint: 2022 }), false); assert.equal(p.supports({}), false); assert.equal(calls, 0);
    const result = await p.lookup({ make: 'Toyota', model: 'Camry', yearHint: 2018 });
    assert.equal(result.candidates[0].match.trim, 'LE'); assert.ok(!JSON.stringify(result).includes('test-secret'));
});
test('snapshot filter supports backup metadata and excludes complete records', async () => {
    const rows = JSON.parse(await readFile(new URL('../fixtures/vehicles.json', import.meta.url)));
    assert.equal(readSnapshot(rows).length, 10);
    assert.equal(readSnapshot([{ vehicle: { make: 'BYD', model: 'Song Plus' }, source: { dataQuality: 'incomplete' } }]).length, 1);
    assert.throws(() => readSnapshot({}));
});

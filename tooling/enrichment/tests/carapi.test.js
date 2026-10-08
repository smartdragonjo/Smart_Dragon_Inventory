import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CarapiProvider } from '../providers/carapi-provider.js';
const identity = { make: 'Toyota', model: 'Camry' };
const env = { CARAPI_TOKEN: 'test-token', CARAPI_SECRET: 'test-secret' };
for (const [label, input, supported, reason] of [
    ['no year', identity, true, null],
    ['zero years', { ...identity, yearStart: 0, yearEnd: 0 }, true, null],
    ['2018 hint', { ...identity, yearHint: 2018 }, true, null],
    ['2022 hint', { ...identity, yearHint: 2022 }, false, 'outside_free_coverage'],
    ['single known year', { ...identity, yearStart: '2018', yearEnd: 2018 }, true, null],
    ['outside single year', { ...identity, yearStart: 2022, yearEnd: 2022 }, false, 'outside_free_coverage'],
    ['missing make', { model: 'Camry' }, false, 'missing_vehicle_identity'],
    ['blank model', { make: 'Toyota', model: '  ' }, false, 'missing_vehicle_identity'],
    ...[1949, 2101, 2018.5, 0, null, undefined, '', 'invalid', true].map(yearHint => [`invalid hint ${yearHint}`, { ...identity, yearHint }, true, null])
]) test(`CarAPI supports: ${label}`, () => {
    const p = new CarapiProvider({ env });
    assert.equal(p.supports(input), supported); assert.equal(p.reason, reason);
});
test('missing credentials take precedence and skip all requests', async () => {
    for (const credentials of [{}, { CARAPI_TOKEN: 'test' }, { CARAPI_SECRET: 'test' }]) {
        const p = new CarapiProvider({ env: credentials, fetcher: () => assert.fail('Unexpected request') });
        assert.equal(p.supports(identity), false); assert.equal(p.reason, 'missing_api_key');
        assert.deepEqual(await p.lookup(identity), { skipped: true, reason: 'missing_api_key' });
    }
});
for (const input of [identity, { ...identity, yearStart: 0, yearEnd: 0 }, { ...identity, yearHint: 2018 }]) {
    test(`CarAPI request query ${JSON.stringify(input)}`, async () => {
        let lookups = 0;
        const p = new CarapiProvider({ env, fetcher: async url => {
            if (url.endsWith('/login')) return { ok: true, text: async () => 'fake-jwt' };
            lookups++;
            const params = new URL(url).searchParams;
            assert.equal(params.get('make'), 'Toyota'); assert.equal(params.get('model'), 'Camry');
            assert.equal(params.get('limit'), '100');
            assert.equal(params.has('year'), input.yearHint === 2018);
            assert.equal(params.get('year'), input.yearHint === 2018 ? '2018' : null);
            return { ok: true, json: async () => ({ data: [] }) };
        } });
        await p.lookup(input); assert.equal(lookups, 1);
    });
}
test('observed range deduplicates years, preserves trims and excludes other identities', () => {
    const p = new CarapiProvider({ env });
    const data = [2017, 2018, 2018, 2019, '2020'].map((year, id) => ({ make: ' toyota ', model: 'CAMRY', year, id, trim: `Trim ${id}` }));
    data.push({ make: 'Toyota', model: 'Camry Hybrid', year: 2015 }, { make: 'Other', model: 'Camry', year: 2016 });
    const result = p.normalizeResponse({ data }, identity);
    assert.equal(result.candidates.length, 5);
    assert.deepEqual(result.metadata, { coverageLimited: true, coverageMin: 2015, coverageMax: 2020,
        observedYears: [2017, 2018, 2019, 2020], observedYearStart: 2017, observedYearEnd: 2020 });
    assert.ok(result.candidates.every(c => c.match.yearStart === null && c.match.yearEnd === null));
    assert.equal(result.candidates[2].match.trim, 'Trim 2');
    assert.equal(result.candidates[2].rawReference.observedYear, 2018);
});
test('empty or invalid observed years produce no range', () => {
    const p = new CarapiProvider({ env });
    for (const data of [[], [0, null, undefined, 2101, 2018.5].map(year => ({ ...identity, year }))]) {
        const { metadata } = p.normalizeResponse({ data }, identity);
        assert.deepEqual(metadata.observedYears, []);
        assert.equal(metadata.observedYearStart, null); assert.equal(metadata.observedYearEnd, null);
    }
});

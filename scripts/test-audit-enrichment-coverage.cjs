const { test } = require('node:test');
const assert = require('node:assert/strict');
const { auditCoverage, renderMarkdown } = require('./audit-enrichment-coverage.js');

test('all backup rows processed sequentially in batches of 20; overlap and aliases counted', async () => {
    const { candidate } = await import('../tooling/enrichment/confidence.js');
    const backup = [
        { vehicle: { make: 'BMW', model: 'BMW E46', status: 'approved' } },
        { make: 'BYD', model: 'BYD YUAN PLUS' },
        ...Array.from({ length: 19 }, (_, i) => ({ make: 'Unknown', model: `Model ${i}` }))
    ];
    const before = structuredClone(backup), progress = [];
    let active = 0, maxActive = 0, persisted = 0;
    const provider = name => ({ name, supports: () => true, lookup: async query => {
        active++; maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setImmediate(resolve));
        active--;
        return { candidates: query.make === 'BMW' || (name === 'local_dataset' && query.model === 'Atto 3') ? [candidate(name, query)] : [] };
    } });
    const runtime = { providers: [provider('nhtsa'), provider('local_dataset'), { name: 'carapi', reason: 'missing_api_key', supports: () => false }], persist: async () => { persisted++; } };
    const r = await auditCoverage(backup, runtime, { progress: line => progress.push(line) });
    assert.equal(maxActive, 1); assert.equal(persisted, 2);
    assert.deepEqual(progress, ['Processed 20/21', 'Processed 21/21']);
    assert.equal(r.totalVehicles, 21); assert.equal(r.processed, 21);
    assert.equal(r.matchedAny, 2); assert.equal(r.noMatch, 19); assert.equal(r.coveragePercent, 9.52);
    assert.equal(r.providerCoverage.local_dataset, 2); assert.equal(r.uniqueMatchesByProvider.local_dataset, 1);
    assert.equal(r.pairwiseOverlap['nhtsa + local_dataset'], 1);
    assert.equal(r.noMatchByMake.Unknown, 19); assert.equal(r.matchedByMake.BMW, 1);
    assert.deepEqual(r.identityResolverStats, { vehiclesUsingAlias: 2, removed_make_prefix: 2, bmwChassisMappings: 1, bmwVariantMappings: 0, bydAliases: 1 });
    assert.equal(r.noMatchVehicles[0].providerResults.find(p => p.provider === 'carapi').reason, 'missing_api_key');
    assert.equal(r.matchedVehicles[1].providerResults.find(p => p.provider === 'local_dataset').matchedLookupIdentity.model, 'Atto 3');
    const md = renderMarkdown(r);
    assert.ok(md.includes('BMW E46') && md.includes('missing_api_key') && md.includes('does not resolve generation or engine'));
    assert.deepEqual(backup, before);
});

test('empty backup produces zero coverage, no requests and valid reports', async () => {
    const r = await auditCoverage([], { providers: [], persist: () => assert.fail('Unexpected persist') }, { progress: () => assert.fail('Unexpected progress') });
    assert.equal(r.coveragePercent, 0); assert.equal(r.processed, 0);
    assert.ok(renderMarkdown(r).includes('No-match vehicles'));
    await assert.rejects(auditCoverage({}, { providers: [] }), /backup JSON array/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIdentity, lookupIdentity } from '../identity-resolver.js';
import { enrich } from '../enrichment-engine.js';
import { candidate } from '../confidence.js';
for (const [make, model, expected, generation, variant] of [
    ['BMW', 'BMW 525', '5 Series', null, '525'], ['BMW', '525', '5 Series', null, '525'],
    ['BMW', 'BMW BMW 525', '5 Series', null, '525'], ['BMW', '520', '5 Series', null, '520'],
    ...['E46', 'E90'].map(code => ['BMW', code, '3 Series', code, null]),
    ...['E39', 'E60', 'F10'].map(code => ['BMW', code, '5 Series', code, null]),
    ['BYD', 'Atto3 (Yuan Plus)', 'Atto 3', null, null], ['BYD', 'BYD YUAN PLUS', 'Yuan Plus', null, null],
    ['BYD', 'BYD QIN PLUS', 'QIN PLUS', null, null], ['BYD', 'Qin', 'Qin', null, null],
    ['BYD', 'Dolphin', 'Dolphin', null, null], ['BYD', 'Han', 'Han', null, null], ['BYD', 'E2', 'E2', null, null],
    ['BMW', '3 Series', '3 Series', null, null], ...['A6', 'Q5', 'Q7'].map(model => ['Audi', model, model, null, null])
]) test(`identity ${make}/${model}`, () => {
    const vehicle = Object.freeze({ make, model }); const identity = resolveIdentity(vehicle);
    assert.equal(identity.originalModel, model); assert.equal(identity.originalMake, make);
    assert.equal(identity.lookupModel, expected); assert.equal(identity.generationHint, generation); assert.equal(identity.variantHint, variant);
});
test('Atto is only a low-confidence suggestion, never automatic replacement', () => {
    const identity = resolveIdentity({ make: 'BYD', model: 'Atto' });
    assert.equal(identity.lookupModel, 'Atto'); assert.deepEqual(identity.lookupAliases, []);
    assert.equal(identity.aliasCandidates[0].requiresConfirmation, true);
    assert.equal(identity.aliasCandidates[0].confidence, .3);
    assert.deepEqual(resolveIdentity({ make: 'BYD', model: 'Qin' }).lookupAliases, []);
});
test('allowed aliases are tried sequentially and provenance retained without combining', async () => {
    const identity = resolveIdentity({ make: 'BYD', model: 'BYD YUAN PLUS' });
    const calls = [];
    const provider = { name: 'local_dataset', supports: () => true, lookup: async q => {
        calls.push(q.model); return { candidates: q.model === 'Atto 3' ? [candidate('local_dataset', q)] : [] };
    } };
    const result = await lookupIdentity(provider, {}, identity);
    assert.deepEqual(calls, ['Yuan Plus', 'Atto 3']); assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].identityResolution.aliasUsed, 'Atto 3');
});
test('identity confidence ordering and manual values are preserved', async () => {
    const exact = resolveIdentity({ make: 'BMW', model: '3 Series' });
    const prefix = resolveIdentity({ make: 'BMW', model: 'BMW 3 Series' });
    const alias = resolveIdentity({ make: 'BMW', model: 'E46' });
    assert.ok(exact.identityConfidence > prefix.identityConfidence && prefix.identityConfidence > alias.identityConfidence);
    const vehicle = { make: 'BMW', model: 'E46', generation: 'Manual generation', engineLabel: 'Manual engine' };
    const before = structuredClone(vehicle);
    const provider = { name: 'local_dataset', supports: () => true, lookup: async q => ({ candidates: [candidate('local_dataset', { ...q, generation: 'Other', yearStart: 2020, engineLabel: 'Other' })] }) };
    const result = await enrich(vehicle, [provider]);
    assert.deepEqual(vehicle, before); assert.equal(result.proposal.model.value, 'E46');
    assert.equal(result.proposal.generation.value, 'Manual generation'); assert.equal(result.proposal.yearStart.value, null);
});

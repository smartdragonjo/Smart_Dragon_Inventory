import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LocalDatasetProvider } from '../providers/local-dataset-provider.js';
import { resolveIdentity } from '../identity-resolver.js';
import { enrich } from '../enrichment-engine.js';
test('six diagnosed ranges overlap real local generations without selecting production years', async t => {
    let data;
    try { data = JSON.parse(await readFile(new URL('../local/vehicle-makes-models.json', import.meta.url))); }
    catch (e) { if (e.code === 'ENOENT') return t.skip('Local dataset not installed'); throw e; }
    const provider = new LocalDatasetProvider(data);
    for (const [make, model, start, end] of [['BMW', '3 Series', 2012, 2019], ['BYD', 'Atto 3', 2023, 2026], ['Nissan', 'Sunny', 2015, 2026], ['Renault', 'Clio', 2015, 2019], ['Toyota', 'Fortuner', 2015, 2026], ['Toyota', 'Hilux', 2015, 2021]]) {
        const result = await provider.lookup({ make, model, yearStart: start, yearEnd: end });
        assert.ok(result.candidates.length > 0, `${make}/${model}`);
        assert.equal(result.metadata.yearMatchMode, 'range_overlap');
        assert.equal(result.metadata.overlappingGenerationCount, result.candidates.length);
        assert.ok(result.candidates.every(c => c.match.generation === null && c.match.yearStart === null && c.match.engineLabel === null));
    }
});
test('single year remains containment; ranges use inclusive overlap and reject reversed ranges', async () => {
    const p = new LocalDatasetProvider({ group: 'x', makes: [{ name: 'X', models: [{ name: 'M', generations: [
        { name: 'A', yearStart: 2000, yearEnd: 2005 }, { name: 'B', yearStart: 2006, yearEnd: 2010 }
    ] }] }] });
    assert.equal((await p.lookup({ make: 'X', model: 'M', yearStart: 2004, yearEnd: 2007 })).candidates.length, 2);
    const single = await p.lookup({ make: 'X', model: 'M', yearHint: 2005 });
    assert.equal(single.metadata.yearMatchMode, 'single_year'); assert.equal(single.candidates[0].match.generation, 'A');
    assert.equal((await p.lookup({ make: 'X', model: 'M', yearHint: 1999 })).candidates.length, 0);
    assert.equal((await p.lookup({ make: 'X', model: 'M', yearStart: 2010, yearEnd: 2000 })).candidates.length, 0);
});
for (const [make, model, targetMake, targetModel, type] of [
    ['Honda','CRV','Honda','CR-V','punctuation'], ['Hyundai','Avante','Hyundai','Elantra','regional_name'],
    ['Kia','Morning','Kia','Picanto','regional_name'], ['Mitsubishi','L200','Mitsubishi','L 200','punctuation'],
    ['Range Rover','Evoque','Land Rover','Range Rover Evoque','alternate_name'], ['Toyota','BZ4','Toyota','bZ4X','alternate_name'],
    ...['3','4','7'].map(n=>['Volkswagen',`ID${n}`,'Volkswagen',`ID.${n}`,'punctuation'])
]) test(`safe lookup alias ${make}/${model}`, () => {
    const r = resolveIdentity({ make, model });
    assert.equal(r.originalModel, model); assert.equal(r.lookupModel, model);
    assert.ok(r.lookupCandidates.some(c=>c.make===targetMake&&c.model===targetModel&&c.aliasType===type));
});
test('Optima alternatives have no canonical replacement and prohibited identities have no new aliases', () => {
    const r = resolveIdentity({ make:'Kia',model:'Optima (K5)' });
    assert.equal(r.lookupModel,'Optima (K5)'); assert.deepEqual(r.lookupCandidates.map(c=>c.model),['Optima','K5']);
    for(const [make,model] of [['Hyundai','Lancer'],['Range Rover','Land Rover'],['Mitsubishi','GLX'],...['AD','MD','XD','HD'].map(m=>['Hyundai',m]),['Mercedes','W204']]) assert.deepEqual(resolveIdentity({make,model}).lookupCandidates,[]);
});
test('Atto low-confidence match stays outside merge and preserves originals', async () => {
    const p = new LocalDatasetProvider({ group:'byd', makes:[{name:'BYD',models:[{name:'Atto 3',generations:[{name:'G',yearStart:2022,bodyType:'SUV'}]}]}] });
    const v = {make:'BYD',model:'Atto',yearStart:0,yearEnd:0}; const before=structuredClone(v);
    const result=await enrich(v,[p]);
    assert.equal(result.results[0].candidates.length,1);
    assert.equal(result.results[0].candidates[0].identityResolution.aliasConfidence,.3);
    assert.equal(result.proposal.bodyType.value,null); assert.equal(result.proposal.generation.value,null);
    assert.equal(result.proposal.model.value,'Atto'); assert.deepEqual(v,before);
});

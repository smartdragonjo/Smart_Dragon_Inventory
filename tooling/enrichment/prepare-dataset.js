// Offline preparation only. Upstream nested JSON already matches the provider.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function prepareDataset(input, provenance) {
    const groups = Array.isArray(input) ? input : [input];
    const array = (value, label) => { if (!Array.isArray(value)) throw new Error(`Expected array: ${label}`); };
    const name = (value, label) => { if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing name: ${label}`); };
    for (const group of groups) {
        name(group.group, 'group'); array(group.makes, 'makes');
        for (const make of group.makes) {
            name(make.name, 'make'); array(make.models, 'models');
            for (const model of make.models) {
                name(model.name, 'model');
                if (model.generations != null) array(model.generations, 'generations');
                for (const gen of model.generations || []) {
                    if (gen.engines != null) array(gen.engines, 'engines');
                }
            }
        }
    }
    // Preserve names, unknown/null fields, source specs and existing provenance.
    return groups.map(group => ({ ...structuredClone(group), enrichmentProvenance: { ...provenance } }));
}

async function main() {
    const [inputPath, metadataPath, outputPath] = process.argv.slice(2);
    if (!inputPath || !metadataPath || !outputPath) throw new Error('Usage: node tooling/enrichment/prepare-dataset.js INPUT.json SOURCE.json OUTPUT.json');
    if ([inputPath, metadataPath].some(path => resolve(path) === resolve(outputPath))) throw new Error('Output must differ from inputs');
    const raw = await readFile(inputPath);
    const provenance = { ...JSON.parse(await readFile(metadataPath, 'utf8')),
        sourceSha256: createHash('sha256').update(raw).digest('hex'),
        preparedAt: new Date().toISOString(), transformation: 'validated nested schema; no vehicle values changed' };
    const output = prepareDataset(JSON.parse(raw.toString('utf8')), provenance);
    // Never overwrite existing local datasets/cache by accident.
    await writeFile(outputPath, JSON.stringify(output), { flag: 'wx' });
    console.log(JSON.stringify({ groups: output.length, makes: output.reduce((sum, group) => sum + group.makes.length, 0), outputPath }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

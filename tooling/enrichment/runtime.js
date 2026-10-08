import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { NhtsaProvider } from './providers/nhtsa-provider.js';
import { LocalDatasetProvider } from './providers/local-dataset-provider.js';
import { CarapiProvider } from './providers/carapi-provider.js';
const local = new URL('./local/', import.meta.url);
export function readSnapshot(data) {
    if (!Array.isArray(data)) throw new Error('Expected a backup JSON array');
    return data.map((r, index) => ({ id: String(index), vehicle: structuredClone(r.vehicle || r), source: structuredClone(r.source || {}), fitments: structuredClone(r.fitments || []) }))
        .filter(r => r.vehicle.status === 'incomplete' || r.vehicle.dataQuality === 'incomplete' || r.source.dataQuality === 'incomplete');
}
export async function createRuntime({ datasetPath, offline = false, provider: selectedProvider } = {}) {
    let data = [];
    if (datasetPath) data = JSON.parse(await readFile(datasetPath, 'utf8'));
    const cache = new Map();
    try { for (const [k, v] of JSON.parse(await readFile(new URL('nhtsa-cache.json', local), 'utf8'))) cache.set(k, v); } catch { /* cache is disposable */ }
    let providers = [new LocalDatasetProvider(data)];
    if (!offline) providers.unshift(new NhtsaProvider({ cache }), new CarapiProvider());
    else providers.unshift(...['nhtsa', 'carapi'].map(name => ({ name, reason: 'offline_mode', supports: () => false })));
    if (selectedProvider) providers = providers.filter(p => p.name === selectedProvider);
    return { providers, async persist() {
        await mkdir(local, { recursive: true });
        await writeFile(new URL('nhtsa-cache.json', local), JSON.stringify([...cache]));
    }, async clear() { cache.clear(); await this.persist(); } };
}

import { candidate } from '../confidence.js';
import { key } from '../vehicle-normalizer.js';
export class NhtsaProvider {
    name = 'nhtsa';
    constructor({ fetcher = fetch, cache = new Map(), timeout = 10000, interval = 1000 } = {}) {
        Object.assign(this, { fetcher, cache, timeout, interval });
        this.lastRequest = 0;
    }
    supports(v) { return Boolean(v.make && v.model); }
    normalizeResponse(response) {
        if (!Array.isArray(response.Results)) throw new Error('invalid_response');
        return response.Results.map(r => candidate(this.name, { make: r.Make_Name, model: r.Model_Name }, { modelId: r.Model_ID, makeId: r.Make_ID }));
    }
    async lookup(v) {
        const cacheKey = key(v.make);
        let entry = this.cache.get(cacheKey);
        if (!entry || Date.now() - entry.time > 86400000) {
            const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMake/${encodeURIComponent(v.make)}?format=json`;
            for (let attempt = 0; attempt < 2; attempt++) {
                await new Promise(r => setTimeout(r, Math.max(0, this.interval - (Date.now() - this.lastRequest))));
                this.lastRequest = Date.now();
                const response = await this.fetcher(url, { signal: AbortSignal.timeout(this.timeout), redirect: 'error' });
                if ((response.status === 429 || response.status >= 500) && attempt === 0) {
                    const retry = Number(response.headers?.get('retry-after'));
                    if (retry > 30) throw new Error('rate_limited');
                    await new Promise(r => setTimeout(r, Math.max(1000, (retry || 0) * 1000)));
                    continue;
                }
                if (!response.ok) throw new Error('http_error');
                entry = { time: Date.now(), candidates: this.normalizeResponse(await response.json()) };
                this.cache.set(cacheKey, entry);
                break;
            }
        }
        return { candidates: entry.candidates.filter(c => key(c.match.make) === key(v.make) && key(c.match.model) === key(v.model)) };
    }
}

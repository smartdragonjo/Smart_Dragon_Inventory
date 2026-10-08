import { candidate } from '../confidence.js';
import { key } from '../vehicle-normalizer.js';
const coverage = { coverageLimited: true, coverageMin: 2015, coverageMax: 2020 };
function validYear(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const year = Number(value);
    return Number.isInteger(year) && year >= 1950 && year <= 2100 ? year : null;
}
function explicitYear(v) {
    const start = validYear(v.yearStart), end = validYear(v.yearEnd);
    return validYear(v.yearHint) ?? (start === end ? start : null);
}
// Server-side only. No credentials or bearer tokens enter a response/cache/report.
export class CarapiProvider {
    name = 'carapi';
    constructor({ env = process.env, fetcher = fetch } = {}) { this.env = env; this.fetcher = fetcher; }
    supports(v) {
        const year = explicitYear(v);
        this.reason = !this.env.CARAPI_TOKEN || !this.env.CARAPI_SECRET ? 'missing_api_key'
            : !key(v.make) || !key(v.model) ? 'missing_vehicle_identity'
            : year !== null && (year < 2015 || year > 2020) ? 'outside_free_coverage' : null;
        return !this.reason;
    }
    normalizeResponse(response, v) {
        if (!Array.isArray(response.data)) throw new Error('invalid_response');
        const year = explicitYear(v);
        const rows = response.data.filter(r => key(r.make) === key(v.make) && key(r.model) === key(v.model)
            && (year === null || validYear(r.year) === year));
        const observedYears = [...new Set(rows.map(r => validYear(r.year)).filter(y => y !== null))].sort((a, b) => a - b);
        // Observations from one demo page are not global production boundaries.
        // Keep them out of match.yearStart/yearEnd consumed by the proposal engine.
        const candidates = rows.map(r => candidate(this.name, { make: r.make, model: r.model, trim: r.trim },
            { id: r.id, observedYear: validYear(r.year), ...coverage }));
        return { candidates, metadata: { ...coverage, observedYears,
            observedYearStart: observedYears[0] ?? null,
            observedYearEnd: observedYears.at(-1) ?? null } };
    }
    async lookup(v) {
        if (!this.supports(v)) return { skipped: true, reason: this.reason };
        const request = async (url, options = {}) => {
            const response = await this.fetcher(url, { ...options, signal: AbortSignal.timeout(10000), redirect: 'error' });
            if (!response.ok) throw new Error('carapi_unavailable');
            return response;
        };
        if (!this.jwt || Date.now() >= this.expires) {
            const response = await request('https://carapi.app/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_token: this.env.CARAPI_TOKEN, api_secret: this.env.CARAPI_SECRET }) });
            this.jwt = (await response.text()).replace(/^"|"$/g, '');
            this.expires = Date.now() + 300000;
        }
        const params = new URLSearchParams({ make: v.make, model: v.model });
        const year = explicitYear(v);
        if (year !== null) params.set('year', String(year));
        params.set('limit', '100');
        const response = await request(`https://carapi.app/api/trims/v2?${params}`, { headers: { Authorization: `Bearer ${this.jwt}` } });
        return { ...this.normalizeResponse(await response.json(), v), partial: true };
    }
}

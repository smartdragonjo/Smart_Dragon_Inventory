import { candidate } from '../confidence.js';
import { key } from '../vehicle-normalizer.js';
function validYear(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const year = Number(value);
    return Number.isInteger(year) && year >= 1950 && year <= 2100 ? year : null;
}
function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
    return typeof value === 'string' ? key(value) : value;
}
export class LocalDatasetProvider {
    name = 'local_dataset';
    constructor(data = []) { this.rows = this.normalizeResponse(data); }
    supports(v) { return Boolean(v.make && v.model); }
    normalizeResponse(data) {
        const groups = new Map();
        for (const group of Array.isArray(data) ? data : [data]) {
            for (const make of group.makes || []) for (const model of make.models || []) {
                for (const gen of model.generations?.length ? model.generations : [{}]) {
                    const identity = { make: make.name, model: model.name, generation: gen.name ?? null,
                        yearStart: validYear(gen.yearStart ?? model.yearStart), yearEnd: validYear(gen.yearEnd) };
                    const id = JSON.stringify([key(identity.make), key(identity.model), key(identity.generation), identity.yearStart, identity.yearEnd]);
                    if (!groups.has(id)) groups.set(id, { ...identity, bodyType: gen.bodyType ?? null, engines: [],
                        rawReference: { group: group.group, dataset: 'gor3a/vehicle-makes-models', displacementUnit: 'cc' }, engineKeys: new Set() });
                    const row = groups.get(id);
                    for (const engine of gen.engines || []) {
                        if (!Object.keys(engine).length) continue;
                        const engineKey = JSON.stringify(canonical(engine));
                        if (!row.engineKeys.has(engineKey)) {
                            row.engineKeys.add(engineKey);
                            row.engines.push(structuredClone(engine));
                        }
                    }
                }
            }
        }
        return [...groups.values()].map(({ engineKeys, ...row }) => row);
    }
    async lookup(v) {
        if (!this.rows.length) return { skipped: true, reason: 'dataset_not_loaded', candidates: [] };
        const hint = validYear(v.yearHint);
        const start = hint ?? validYear(v.yearStart);
        const end = hint ?? validYear(v.yearEnd) ?? start;
        const yearMatchMode = start === null ? 'none' : start === end ? 'single_year' : 'range_overlap';
        const rows = this.rows.filter(c => key(c.make) === key(v.make) && key(c.model) === key(v.model)
            && (start === null || (end >= start && c.yearStart !== null && c.yearStart <= end
                && (c.yearEnd === null || c.yearEnd >= start))));
        const resolved = yearMatchMode === 'single_year' && rows.length === 1;
        const candidates = rows.map(row => {
            const result = candidate(this.name, { make: row.make, model: row.model,
                generation: resolved ? row.generation : null,
                yearStart: resolved ? row.yearStart : null, yearEnd: resolved ? row.yearEnd : null,
                bodyType: row.bodyType }, row.rawReference);
            return { ...result, ...structuredClone(row),
                confidence: { ...result.confidence, generation: resolved && row.generation ? .8 : 0, years: resolved ? .7 : 0, engine: 0 },
                resolution: { generation: resolved ? 'year_matched_candidate' : 'unresolved',
                    years: resolved ? 'year_matched_candidate' : 'unresolved', engine: 'unresolved' } };
        });
        return { candidates, metadata: { generationCandidateCount: candidates.length,
            engineVariantCount: rows.reduce((sum, row) => sum + row.engines.length, 0),
            ambiguousGeneration: rows.length > 1, yearKnown: start !== null,
            yearMatchMode, overlappingGenerationCount: start === null ? 0 : rows.length } };
    }
}

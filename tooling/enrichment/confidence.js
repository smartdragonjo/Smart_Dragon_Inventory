import { key } from './vehicle-normalizer.js';
export const fields = ['make', 'model', 'yearStart', 'yearEnd', 'generation', 'bodyType', 'trim', 'engineCode', 'engineLabel', 'engineDisplacement', 'cylinders', 'fuelType', 'drivetrain'];
function validYear(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const year = Number(value);
    return Number.isInteger(year) && year >= 1950 && year <= 2100 ? year : null;
}
function mergeYear(field, vehicle, lookup, results) {
    const alternatives = [];
    for (const result of results) {
        const matches = (result.candidates || []).filter(item => key(item.match.make) === key(lookup.make)
            && key(item.match.model) === key(lookup.model));
        if (result.skipped || result.error || !matches.length) continue;
        const metadata = result.metadata || {};
        const partialCoverage = result.provider === 'carapi' || metadata.coverageLimited === true;
        const values = partialCoverage
            ? [metadata[field === 'yearStart' ? 'observedYearStart' : 'observedYearEnd']]
            : matches.map(item => item.match[field]);
        for (const value of new Set(values.map(validYear).filter(year => year !== null))) {
            alternatives.push({ value, source: result.provider, sources: [result.provider], partialCoverage,
                coverageLimited: partialCoverage,
                ...(partialCoverage ? { coverageMin: metadata.coverageMin ?? null, coverageMax: metadata.coverageMax ?? null } : {}),
                interpretation: partialCoverage ? 'observed_coverage' : 'production_range_candidate',
                confidence: partialCoverage ? .3 : .65 });
        }
    }
    const existing = validYear(vehicle[field]);
    const protectedValue = existing !== null;
    // Only unrestricted evidence participates in selecting a production-year proposal.
    const full = alternatives.filter(option => !option.partialCoverage);
    const fullYears = [...new Set(full.map(option => option.value))];
    const selected = fullYears.length === 1 ? fullYears[0] : null;
    const sources = [...new Set(full.filter(option => option.value === selected).map(option => option.source))];
    const conflicts = alternatives.filter(option => protectedValue ? option.value !== existing
        : selected !== null ? option.value !== selected : fullYears.length > 1 && !option.partialCoverage);
    return { value: protectedValue ? vehicle[field] : selected,
        source: protectedValue ? 'existing_preserved' : sources,
        confidence: protectedValue ? 1 : selected !== null ? Math.min(.95, .65 + .15 * (sources.length - 1)) : 0,
        conflicts, alternatives, protected: protectedValue,
        partialCoverage: !protectedValue && selected === null && alternatives.some(option => option.partialCoverage),
        interpretation: protectedValue ? 'existing_preserved' : selected !== null ? 'production_range_candidate' : 'unresolved' };
}
export function candidate(provider, values, rawReference = {}) {
    const match = Object.fromEntries(fields.map(f => [f, values[f] ?? null]));
    return { provider, match, confidence: { make: .8, model: .8, years: match.yearStart ? .5 : 0, generation: match.generation ? .5 : 0, engine: match.engineLabel ? .5 : 0 }, rawReference };
}
export function mergeProposal(vehicle, lookup, results) {
    const proposals = {};
    for (const field of fields) {
        if (field === 'yearStart' || field === 'yearEnd') {
            proposals[field] = mergeYear(field, vehicle, lookup, results);
            continue;
        }
        const groups = new Map();
        for (const result of results) for (const item of result.candidates || []) {
            if (key(item.match.make) !== key(lookup.make) || key(item.match.model) !== key(lookup.model)) continue;
            const value = item.match[field];
            if (value == null || value === '') continue;
            const id = key(value);
            if (!groups.has(id)) groups.set(id, { value, sources: new Set() });
            groups.get(id).sources.add(result.provider);
        }
        const options = [...groups.values()].map(g => ({ value: g.value, sources: [...g.sources] }));
        const existing = vehicle[field];
        // Existing identity is never overwritten, even when provenance was lost in a backup.
        const protectedValue = existing != null && existing !== '';
        const unique = options.length === 1;
        let confidence = unique ? Math.min(.95, .65 + .15 * (options[0].sources.length - 1)) : options.length ? .25 : 0;
        if (unique && ['make', 'model'].includes(field) && key(options[0].value) === key(lookup[field])) confidence = Math.min(.98, confidence + .15);
        if (unique && ['yearStart', 'yearEnd'].includes(field) && options[0].value === lookup.yearHint) confidence = Math.min(.95, confidence + .1);
        const conflicts = options.filter(o => protectedValue ? key(o.value) !== key(existing) : !unique);
        if (conflicts.length) confidence = Math.min(confidence, .35);
        proposals[field] = { value: protectedValue ? existing : unique ? options[0].value : null,
            source: protectedValue ? 'existing_preserved' : unique ? options[0].sources : [],
            confidence, conflicts, alternatives: options, protected: protectedValue };
    }
    return proposals;
}

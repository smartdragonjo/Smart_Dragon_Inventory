import { normalizeVehicle, key } from './vehicle-normalizer.js';

const chassis = { E46: '3 Series', E90: '3 Series', E39: '5 Series', E60: '5 Series', F10: '5 Series' };
export function resolveIdentity(vehicle) {
    const normalized = normalizeVehicle(vehicle);
    const lookupMake = normalized.lookup.make;
    let lookupModel = normalized.lookup.model;
    const aliasesApplied = [...normalized.transformations];
    let generationHint = null, variantHint = null;
    let identityConfidence = aliasesApplied.length ? .95 : 1;
    const lookupAliases = [], aliasCandidates = [];
    // Handle repeated prefixes without modifying the stored identity.
    while (lookupMake && key(lookupModel).startsWith(key(lookupMake) + ' ')) {
        lookupModel = lookupModel.slice(lookupMake.length).trim();
        aliasesApplied.push('removed_make_prefix'); identityConfidence = .95;
    }
    if (key(lookupMake) === 'bmw') {
        const code = lookupModel.toUpperCase();
        if (chassis[code]) {
            generationHint = code; lookupModel = chassis[code];
            aliasesApplied.push(`bmw_chassis:${code}->${lookupModel}`); identityConfidence = .85;
        } else if (['520', '525'].includes(code)) {
            variantHint = code; lookupModel = '5 Series';
            aliasesApplied.push(`bmw_variant:${code}->5 Series`); identityConfidence = .85;
        }
    }
    if (key(lookupMake) === 'byd') {
        const model = key(lookupModel);
        if (['atto3 (yuan plus)', 'atto 3 (yuan plus)', 'atto3', 'atto 3'].includes(model)) {
            lookupModel = 'Atto 3'; lookupAliases.push('Yuan Plus');
            aliasesApplied.push('byd_atto3_yuan_plus'); identityConfidence = .85;
        } else if (model === 'yuan plus') {
            lookupModel = 'Yuan Plus'; lookupAliases.push('Atto 3');
            aliasesApplied.push('byd_yuan_plus_atto3'); identityConfidence = .85;
        } else if (model === 'atto') {
            aliasCandidates.push({ model: 'Atto 3', confidence: .3, requiresConfirmation: true });
        }
    }
    const lookupCandidates = [];
    const safe = {
        'honda/crv': ['Honda', 'CR-V', 'punctuation', .95],
        'hyundai/avante': ['Hyundai', 'Elantra', 'regional_name', .8],
        'kia/morning': ['Kia', 'Picanto', 'regional_name', .8],
        'mitsubishi/l200': ['Mitsubishi', 'L 200', 'punctuation', .95],
        'range rover/evoque': ['Land Rover', 'Range Rover Evoque', 'alternate_name', .85],
        'toyota/bz4': ['Toyota', 'bZ4X', 'alternate_name', .75],
        'volkswagen/id3': ['Volkswagen', 'ID.3', 'punctuation', .95],
        'volkswagen/id4': ['Volkswagen', 'ID.4', 'punctuation', .95],
        'volkswagen/id7': ['Volkswagen', 'ID.7', 'punctuation', .95],
        'byd/atto': ['BYD', 'Atto 3', 'low_confidence_candidate', .3]
    };
    const selected = safe[`${key(lookupMake)}/${key(lookupModel)}`];
    if (selected) {
        const [make, model, aliasType, aliasConfidence] = selected;
        lookupCandidates.push({ make, model, aliasType, aliasConfidence });
    }
    if (key(lookupMake) === 'kia' && key(lookupModel) === 'optima (k5)') {
        for (const model of ['Optima', 'K5']) lookupCandidates.push({ make: 'Kia', model, aliasType: 'alternate_name', aliasConfidence: .8 });
    }
    return { originalMake: vehicle.make, originalModel: vehicle.model, lookupMake, lookupModel, lookupCandidates,
        generationHint, variantHint, aliasesApplied, identityConfidence, lookupAliases, aliasCandidates,
        yearHint: normalized.lookup.yearHint };
}

export async function lookupIdentity(provider, query, identity) {
    const models = [{ make: identity.lookupMake, model: identity.lookupModel },
        ...(provider.name === 'local_dataset' ? [
            ...identity.lookupAliases.map(model => ({ make: identity.lookupMake, model, aliasType: 'alternate_name', aliasConfidence: .85 })),
            ...(identity.lookupCandidates || [])] : [])];
    const attempts = [];
    let lastResult = { candidates: [] };
    for (const entry of models) {
        const { model, aliasType = null, aliasConfidence = identity.identityConfidence } = entry;
        const lookup = { ...query, make: entry.make, model };
        const aliasesApplied = [...identity.aliasesApplied, ...(aliasType ? [`${aliasType}:${lookup.make}/${model}`] : [])];
        if (!provider.supports(lookup)) return { skipped: true, reason: provider.reason || 'unsupported', identityAttempts: attempts };
        const result = await provider.lookup(lookup);
        lastResult = result;
        if (result.candidates) result.candidates = result.candidates.filter(item => key(item.match.make) === key(lookup.make) && key(item.match.model) === key(model));
        attempts.push({ make: lookup.make, model, alias: Boolean(aliasType), aliasType, aliasConfidence, aliasesApplied, matched: Boolean(result.candidates?.length) });
        if (result.candidates?.length) {
            // A series match does not resolve a chassis or numbered engine variant.
            const candidates = result.candidates.map(item => {
                const copy = structuredClone(item);
                if (identity.generationHint || identity.variantHint || aliasType === 'low_confidence_candidate') {
                    for (const field of ['generation', 'yearStart', 'yearEnd', 'engineCode', 'engineLabel', 'engineDisplacement', 'cylinders', 'fuelType', 'drivetrain']) copy.match[field] = null;
                    copy.confidence = { ...copy.confidence, generation: 0, years: 0, engine: 0 };
                }
                copy.identityResolution = { lookupMake: lookup.make, lookupModel: model,
                    aliasUsed: aliasType ? model : null, aliasesApplied, aliasType, aliasConfidence,
                    requiresConfirmation: aliasType === 'low_confidence_candidate',
                    identityConfidence: Math.min(identity.identityConfidence, aliasConfidence), generationHint: identity.generationHint, variantHint: identity.variantHint };
                return copy;
            });
            return { ...result, candidates, identityAttempts: attempts, matchedLookupIdentity: { make: lookup.make, model } };
        }
        if (result.skipped || result.error) return { ...result, identityAttempts: attempts };
    }
    return { ...lastResult, candidates: [], identityAttempts: attempts };
}

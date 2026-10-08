import { normalizeVehicle } from './vehicle-normalizer.js';
import { mergeProposal } from './confidence.js';
import { resolveIdentity, lookupIdentity } from './identity-resolver.js';
export async function enrich(vehicle, providers) {
    const normalized = normalizeVehicle(vehicle);
    const identity = resolveIdentity(vehicle);
    const query = { ...normalized.lookup, yearStart: vehicle.yearStart, yearEnd: vehicle.yearEnd };
    const results = [];
    for (const provider of providers) {
        try {
            results.push({ provider: provider.name, ...await lookupIdentity(provider, query, identity) });
        } catch {
            // Never echo request headers, credentials, or provider error bodies.
            results.push({ provider: provider.name, error: 'provider_unavailable', candidates: [] });
        }
    }
    const lookup = { make: identity.lookupMake, model: identity.lookupModel, yearHint: identity.yearHint };
    // Project only verified alias matches for merging; reports retain the source identity.
    const mergeResults = results.map(result => ({ ...result, candidates: (result.candidates || []).filter(item => !item.identityResolution?.requiresConfirmation).map(item => ({ ...item,
        match: { ...item.match, make: lookup.make, model: lookup.model } })) }));
    const proposal = mergeProposal(vehicle, lookup, mergeResults);
    for (const field of Object.values(proposal)) if (!field.protected) field.confidence = Math.min(field.confidence, identity.identityConfidence);
    return { normalized, results, proposal, metadata: { originalIdentity: { make: identity.originalMake, model: identity.originalModel },
        lookupIdentity: lookup, aliasesApplied: identity.aliasesApplied, identityConfidence: identity.identityConfidence,
        generationHint: identity.generationHint, variantHint: identity.variantHint, aliasCandidates: identity.aliasCandidates },
        identity, previewOnly: true, precedence: ['manual', 'approved_external', 'candidate_external'] };
}

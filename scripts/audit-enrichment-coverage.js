const PROVIDERS = ['nhtsa', 'carapi', 'local_dataset'];
const counts = () => Object.fromEntries(PROVIDERS.map(name => [name, 0]));

async function auditCoverage(backup, runtime, { progress = console.log, recordIndices, detail = () => {} } = {}) {
    const { enrich } = await import('../tooling/enrichment/enrichment-engine.js');
    if (!Array.isArray(backup)) throw new Error('Expected a backup JSON array');
    // Audit all records, including complete ones; do not use the incomplete-only reader.
    const vehicles = backup.map(record => {
        const vehicle = record?.vehicle ?? record;
        if (!vehicle || typeof vehicle !== 'object' || Array.isArray(vehicle)) throw new Error('Invalid vehicle record');
        return structuredClone(vehicle);
    });
    const report = { experimental: true, scope: 'all_backup_records', batchSize: 20,
        coverageDefinition: 'At least one identity candidate; does not resolve generation or engine',
        totalVehicles: vehicles.length, processed: 0, matchedAny: 0, noMatch: 0, coveragePercent: 0,
        providerCoverage: counts(), uniqueMatchesByProvider: counts(), pairwiseOverlap: {}, providerCombinations: {},
        matchedByMake: {}, noMatchByMake: {}, matchedVehicles: [], noMatchVehicles: [],
        identityResolverStats: { vehiclesUsingAlias: 0, removed_make_prefix: 0, bmwChassisMappings: 0, bmwVariantMappings: 0, bydAliases: 0 } };
    const matchedByMake = new Map(), noMatchByMake = new Map();
    for (let i = 0; i < PROVIDERS.length; i++) for (let j = i + 1; j < PROVIDERS.length; j++) report.pairwiseOverlap[`${PROVIDERS[i]} + ${PROVIDERS[j]}`] = 0;
    for (let offset = 0; offset < vehicles.length; offset += 20) {
        for (const vehicle of vehicles.slice(offset, offset + 20)) {
            const result = await enrich(vehicle, runtime.providers);
            const providers = result.results.filter(p => p.candidates?.length > 0).map(p => p.provider);
            const meta = result.metadata;
            const aliases = meta.aliasesApplied || [];
            const stats = report.identityResolverStats;
            // Count vehicles, not repeated transformations on the same vehicle.
            if (aliases.some(a => a === 'removed_make_prefix' || a.startsWith('bmw_') || a.startsWith('byd_')) || result.results.some(p => p.identityAttempts?.some(a => a.alias && a.matched))) stats.vehiclesUsingAlias++;
            if (aliases.includes('removed_make_prefix')) stats.removed_make_prefix++;
            if (aliases.some(a => a.startsWith('bmw_chassis:'))) stats.bmwChassisMappings++;
            if (aliases.some(a => a.startsWith('bmw_variant:'))) stats.bmwVariantMappings++;
            if (aliases.some(a => a.startsWith('byd_'))) stats.bydAliases++;
            const row = { recordIndex: recordIndices?.[report.processed] ?? report.processed, ...meta, providers,
                providerResults: result.results.map(p => ({ provider: p.provider, candidateCount: p.candidates?.length || 0,
                    skipped: p.skipped === true, reason: p.reason ?? null, error: p.error ?? null,
                    identityAttempts: p.identityAttempts || [], matchedLookupIdentity: p.matchedLookupIdentity ?? null,
                    metadata: p.metadata ?? null, identityResolution: p.candidates?.[0]?.identityResolution ?? null })) };
            detail(row);
            const make = String(meta.originalIdentity.make ?? '(missing make)');
            const grouped = providers.length ? matchedByMake : noMatchByMake;
            grouped.set(make, (grouped.get(make) || 0) + 1);
            if (providers.length) {
                report.matchedAny++; report.matchedVehicles.push(row);
                for (const provider of providers) report.providerCoverage[provider]++;
                if (providers.length === 1) report.uniqueMatchesByProvider[providers[0]]++;
                const combination = [...providers].sort().join(' + ');
                report.providerCombinations[combination] = (report.providerCombinations[combination] || 0) + 1;
                for (const pair of Object.keys(report.pairwiseOverlap)) if (pair.split(' + ').every(p => providers.includes(p))) report.pairwiseOverlap[pair]++;
            } else { report.noMatch++; report.noMatchVehicles.push(row); }
            report.processed++;
        }
        await runtime.persist();
        progress(`Processed ${report.processed}/${report.totalVehicles}`);
    }
    report.coveragePercent = report.processed ? Number((100 * report.matchedAny / report.processed).toFixed(2)) : 0;
    report.matchedByMake = Object.fromEntries(matchedByMake);
    report.noMatchByMake = Object.fromEntries(noMatchByMake);
    return report;
}

function renderMarkdown(report) {
    const cell = value => String(value ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/[\r\n]+/g, ' ');
    const identity = value => `${value.make ?? ''} / ${value.model ?? ''}`;
    const table = (headers, rows) => [headers, headers.map(() => '---'), ...rows].map(row => `| ${row.map(cell).join(' | ')} |`).join('\n');
    const sections = ['# Enrichment coverage audit', report.coverageDefinition,
        table(['Metric', 'Value'], ['totalVehicles', 'processed', 'matchedAny', 'noMatch', 'coveragePercent'].map(k => [k, report[k]])),
        '## Provider coverage', table(['Provider', 'Matched', 'Exclusive matches'], PROVIDERS.map(p => [p, report.providerCoverage[p], report.uniqueMatchesByProvider[p]])),
        '## Pairwise overlap (inclusive)', table(['Providers', 'Count'], Object.entries(report.pairwiseOverlap)),
        '## Exact provider combinations', table(['Combination', 'Count'], Object.entries(report.providerCombinations)),
        '## Identity resolver statistics (vehicle counts)', table(['Rule', 'Count'], Object.entries(report.identityResolverStats)),
        '## Matched by make', table(['Make', 'Count'], Object.entries(report.matchedByMake)),
        '## No match by make', table(['Make', 'Count'], Object.entries(report.noMatchByMake))];
    for (const [title, rows] of [['Matched vehicles', report.matchedVehicles], ['No-match vehicles', report.noMatchVehicles]]) {
        sections.push(`## ${title}`, table(['Index', 'Original', 'Lookup', 'Aliases applied', 'Generation hint', 'Variant hint', 'Matching providers', 'Provider results / attempts'], rows.map(r => [
            r.recordIndex, identity(r.originalIdentity), identity(r.lookupIdentity), r.aliasesApplied.join(', '), r.generationHint, r.variantHint, r.providers.join(', '),
            r.providerResults.map(p => `${p.provider}: ${p.error || p.reason || (p.candidateCount ? `${p.candidateCount} candidates` : 'no match')}; attempts=${p.identityAttempts.map(a => `${a.make}/${a.model}: ${a.matched ? 'matched' : 'no match'}`).join(', ')}`).join('; ')
        ])));
    }
    return sections.join('\n\n') + '\n';
}

async function main() {
    const { readFile, mkdir, writeFile } = await import('node:fs/promises');
    const args = process.argv.slice(2), positional = args.filter(arg => !arg.startsWith('--'));
    const allowed = arg => arg === '--offline';
    if (positional.length < 1 || positional.length > 2 || args.some(arg => arg.startsWith('--') && !allowed(arg))) throw new Error('Invalid audit arguments');
    const backup = JSON.parse(await readFile(positional[0], 'utf8'));
    const { createRuntime } = await import('../tooling/enrichment/runtime.js');
    const offline = args.includes('--offline');
    const runtime = await createRuntime({ datasetPath: positional[1], offline });
    const report = await auditCoverage(backup, runtime);
    report.offline = offline;
    report.generatedAt = new Date().toISOString();
    await mkdir('reports', { recursive: true });
    const output = 'reports/enrichment-coverage';
    await writeFile(`${output}.json`, JSON.stringify(report, null, 2));
    await writeFile(`${output}.md`, renderMarkdown(report));
    console.log(JSON.stringify({ totalVehicles: report.totalVehicles, processed: report.processed, matchedAny: report.matchedAny,
        noMatch: report.noMatch, coveragePercent: report.coveragePercent, providerCoverage: report.providerCoverage }, null, 2));
}
module.exports = { auditCoverage, renderMarkdown };
if (require.main === module) main().catch(() => { console.error('Coverage audit failed. Check input files and local output permissions.'); process.exitCode = 1; });

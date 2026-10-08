function selectBatch(records, args) {
    const option = (name, fallback) => {
        const argument = args.find(x => x.startsWith(`--${name}=`));
        const value = argument === undefined ? String(fallback) : argument.slice(name.length + 3);
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`${name} must be a non-negative integer`);
        return Number(value);
    };
    const offset = option('offset', 0);
    const limit = option('limit', 10);
    if (limit < 1 || limit > 20) throw new Error('Limit must be 1–20');
    return { offset, limit, records: records.slice(offset, offset + limit) };
}
module.exports = { selectBatch };

// Dynamic import keeps the existing repository's CommonJS configuration unchanged.
if (require.main === module) (async () => {
    const { readFile, mkdir, writeFile } = await import('node:fs/promises');
    const { createRuntime, readSnapshot } = await import('../tooling/enrichment/runtime.js');
    const { enrich } = await import('../tooling/enrichment/enrichment-engine.js');
    const args = process.argv.slice(2), input = args[0];
    if (!input || input.startsWith('--')) throw new Error('Usage: node scripts/test-enrichment.js BACKUP.json [DATASET.json] [--offline] [--offset=0] [--limit=10]');
    // Offset counts incomplete records after filtering, preserving snapshot order.
    const { offset, records } = selectBatch(readSnapshot(JSON.parse(await readFile(input, 'utf8'))), args);
    const runtime = await createRuntime({ datasetPath: args[1]?.startsWith('--') ? undefined : args[1], offline: args.includes('--offline') });
    const results = [];
    for (const record of records) results.push(await enrich(record.vehicle, runtime.providers));
    await runtime.persist();
    const matched = Object.fromEntries(runtime.providers.map(p => [p.name, results.filter(r => r.results.some(x => x.provider === p.name && x.candidates?.length)).length]));
    const averageConfidence = Object.fromEntries(['make', 'model', 'yearStart', 'generation', 'engineLabel'].map(f => [f, results.length ? results.reduce((n, r) => n + r.proposal[f].confidence, 0) / results.length : 0]));
    const summary = { offset, processed: results.length, matched, noMatch: results.filter(r => !r.results.some(p => p.candidates?.length)).length, averageConfidence };
    await mkdir('reports', { recursive: true });
    await writeFile('reports/enrichment-prototype.json', JSON.stringify({ experimental: true, summary, results }, null, 2));
    console.log(JSON.stringify(summary, null, 2));
})().catch((error) => {
    console.error("Batch failed:");
    console.error(error);
    process.exitCode = 1;
});

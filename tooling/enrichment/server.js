import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRuntime, readSnapshot } from './runtime.js';
import { enrich } from './enrichment-engine.js';
const runtime = await createRuntime({ datasetPath: process.argv.slice(2).find(arg => !arg.startsWith('--')), offline: process.argv.includes('--offline') });
const origin = 'http://127.0.0.1:8787';
let records = [], busy = false;
const assets = new Map([['/prototype/enrichment.html', ['../../prototype/enrichment.html', 'text/html']], ['/prototype/enrichment.js', ['../../prototype/enrichment.js', 'text/javascript']], ['/prototype/enrichment.css', ['../../prototype/enrichment.css', 'text/css']]]);
const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.headers.host !== '127.0.0.1:8787' || (req.headers.origin && req.headers.origin !== origin)) return send(403, { error: 'Local origin required' });
    if (req.method === 'GET' && assets.has(req.url)) {
        const [path, type] = assets.get(req.url);
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
        return res.end(await readFile(new URL(path, import.meta.url)));
    }
    if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') return send(404, { error: 'Not found' });
    if (busy) return send(409, { error: 'Lookup in progress' });
    busy = true;
    try {
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 10000000) throw new Error('Input exceeds 10 MB'); }
        const input = JSON.parse(body);
        if (req.url === '/api/load') {
            records = readSnapshot(input);
            return send(200, records.map(r => ({ id: r.id, make: r.vehicle.make, model: r.vehicle.model })));
        }
        if (req.url === '/api/clear') { await runtime.clear(); return send(200, { cleared: true }); }
        if (req.url === '/api/lookup') {
            const record = records.find(r => r.id === input.id);
            if (!record) return send(400, { error: 'Select an incomplete vehicle from the loaded snapshot' });
            const result = await enrich(record.vehicle, runtime.providers);
            await runtime.persist();
            return send(200, result);
        }
        send(404, { error: 'Not found' });
    } catch { send(400, { error: 'Unable to process local JSON or lookup' }); }
    finally { busy = false; }
});
server.listen(8787, '127.0.0.1', () => console.log(`${origin}/prototype/enrichment.html`));

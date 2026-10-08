import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
test('local HTTP flow loads only incomplete records, previews, clears cache and rejects foreign origins', async () => {
    const child = spawn(process.execPath, ['tooling/enrichment/server.js', '--offline'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    try {
        await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Server exited before startup'); })]);
        const origin = 'http://127.0.0.1:8787';
        const post = (path, body, source = origin) => fetch(origin + path, { method: 'POST', headers: { Origin: source, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const page = await fetch(origin + '/prototype/enrichment.html');
        assert.equal(page.status, 200); assert.ok(page.headers.get('content-security-policy').includes("connect-src 'self'"));
        const html = await page.text(); assert.ok(!/firebase|auth\.js/i.test(html));
        assert.equal((await fetch(origin + '/.env')).status, 404);
        assert.equal((await fetch(origin + '/tooling/enrichment/providers/carapi-provider.js')).status, 404);
        assert.equal((await post('/api/load', [], 'https://example.com')).status, 403);
        const fixture = JSON.parse(await readFile(new URL('../fixtures/vehicles.json', import.meta.url)));
        const rows = await (await post('/api/load', fixture)).json(); assert.equal(rows.length, 10);
        assert.equal((await post('/api/lookup', { id: '10' })).status, 400);
        const result = await (await post('/api/lookup', { id: '0' })).json();
        assert.equal(result.previewOnly, true); assert.equal(result.normalized.lookup.model, '525');
        assert.equal((await post('/api/clear', {})).status, 200);
    } finally { const stopped = once(child, 'exit'); child.kill(); await stopped; }
});

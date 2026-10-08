const $ = id => document.getElementById(id);
async function api(path, input) {
    const response = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
}
function reset() { $('normalized').textContent = ''; $('providers').textContent = ''; $('proposal').replaceChildren(); }
async function action(fn) {
    for (const id of ['file', 'vehicle', 'run', 'clear']) $(id).disabled = true;
    try { await fn(); } catch (error) { $('status').textContent = error.message; }
    finally { $('file').disabled = $('clear').disabled = false; $('vehicle').disabled = $('run').disabled = !$('vehicle').options.length; }
}
$('file').addEventListener('change', () => action(async () => {
    reset(); $('vehicle').replaceChildren();
    const file = $('file').files[0];
    if (!file) return;
    if (file.size > 10000000) throw new Error('Maximum file size: 10 MB');
    const rows = await api('load', JSON.parse(await file.text()));
    for (const row of rows) $('vehicle').add(new Option(`${row.make} / ${row.model}`, row.id));
    $('status').textContent = `${rows.length} incomplete vehicles loaded.`;
}));
$('vehicle').addEventListener('change', reset);
$('clear').addEventListener('click', () => action(async () => { await api('clear', {}); $('status').textContent = 'Local NHTSA cache cleared.'; }));
$('run').addEventListener('click', () => action(async () => {
    reset(); $('status').textContent = 'Looking up the selected vehicle…';
    const result = await api('lookup', { id: $('vehicle').value });
    $('normalized').textContent = JSON.stringify(result.normalized, null, 2);
    $('providers').textContent = result.results.map(r => `${r.provider}: ${r.error || r.reason || (r.candidates?.length ? `Matched (${r.candidates.length} candidates)` : 'Not found')}`).join('\n');
    for (const [field, item] of Object.entries(result.proposal)) {
        const tr = document.createElement('tr');
        for (const value of [field, item.value ?? 'Unknown', item.source, item.confidence.toFixed(2), item.conflicts.length ? item.conflicts : item.alternatives]) {
            const td = document.createElement('td'); td.textContent = typeof value === 'object' ? JSON.stringify(value) : String(value); tr.append(td);
        }
        $('proposal').append(tr);
    }
    $('status').textContent = 'Preview complete. No vehicle data was changed.';
}));

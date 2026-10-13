export const enrichmentFields = ['make','model','yearStart','yearEnd','generation','bodyType','trim','engineCode','engineLabel','engineDisplacement','cylinders','fuelType','drivetrain'];
export class EnrichmentClientError extends Error {
    constructor(code) { super(code); this.code = code; }
}
const serverEndpoint = 'https://smartdragonjo.com/smart-dragon-api/vehicle-enrichment/';
const adminOrigins = ['https://smartdragonjo.github.io', 'https://smartdragonjo.com'];
async function firebaseToken(signal) {
    const user = globalThis.SmartDragonAuth?.getCurrentUser();
    if (!user?.getIdToken) throw new EnrichmentClientError('unauthenticated');
    let abort;
    try {
        const token = await Promise.race([
            Promise.resolve().then(() => user.getIdToken()),
            new Promise((resolve, reject) => {
                abort = () => reject(new Error('cancelled'));
                signal.addEventListener('abort', abort, { once: true });
                if (signal.aborted) abort();
            })
        ]);
        if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new EnrichmentClientError('unauthenticated');
        return token;
    } catch (error) {
        if (signal.aborted) throw error;
        throw new EnrichmentClientError('unauthenticated');
    } finally { signal.removeEventListener('abort', abort); }
}
export async function requestSuggestions(vehicle, { config = globalThis.SmartDragonVehicleEnrichmentConfig, fetcher = globalThis.fetch, timeoutMs = 45000, signal } = {}) {
    if (config?.enabled !== true) throw new EnrichmentClientError('disabled');
    const origin = globalThis.location?.origin || 'http://127.0.0.1:8787';
    let endpoint;
    try { endpoint = new URL(config.endpoint, globalThis.location?.href || origin); }
    catch { throw new EnrichmentClientError('invalid_endpoint'); }
    const production = endpoint.href === serverEndpoint && adminOrigins.includes(origin);
    const local = endpoint.origin === origin && ['127.0.0.1', 'localhost'].includes(endpoint.hostname)
        && endpoint.protocol === 'http:' && endpoint.pathname === '/api/vehicle-enrichment/suggest';
    if ((!production && !local) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new EnrichmentClientError('invalid_endpoint');
    const controller = new AbortController(); let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) controller.abort();
    try {
        if (controller.signal.aborted) throw new Error('cancelled');
        const headers = { 'Content-Type': 'application/json' };
        if (production) headers.Authorization = 'Bearer ' + await firebaseToken(controller.signal);
        if (controller.signal.aborted) throw new Error('cancelled');
        const existingData = Object.fromEntries(enrichmentFields.map(name => [name, vehicle[name] ?? null]));
        const response = await fetcher(endpoint.href, { method: 'POST', credentials: production ? 'omit' : 'same-origin', headers, redirect: 'error', signal: controller.signal,
            body: JSON.stringify({ vehicleId: vehicle.id ?? null, make: vehicle.make, model: vehicle.model, yearStart: vehicle.yearStart ?? null, yearEnd: vehicle.yearEnd ?? null, existingData }) });
        if (!response.ok) throw new EnrichmentClientError(({ 401: 'unauthenticated', 403: 'forbidden', 409: 'busy', 429: 'rate_limited' })[response.status] || 'backend_unavailable');
        const r = await response.json(), statuses = ['manual','candidate','ambiguous','unavailable'];
        if (r.success !== true || r.previewOnly !== true || !r.identity || !Array.isArray(r.identity.aliasesApplied) || !Array.isArray(r.ambiguities) || !r.providers ||
            !r.fields || enrichmentFields.some(name => !r.fields[name] || !statuses.includes(r.fields[name].status) || !Array.isArray(r.fields[name].sources) ||
                !Array.isArray(r.fields[name].alternatives) || !Number.isFinite(r.fields[name].confidence) || r.fields[name].confidence < 0 || r.fields[name].confidence > 1 ||
                r.fields[name].sources.some(source => !['nhtsa','carapi','local_dataset'].includes(source)) ||
                r.fields[name].alternatives.some(option => !option || !['string','number'].includes(typeof option.value) || !Array.isArray(option.sources)))) throw new EnrichmentClientError('invalid_response');
        return r;
    } catch (error) {
        if (error instanceof EnrichmentClientError) throw error;
        throw new EnrichmentClientError(timedOut ? 'timeout' : controller.signal.aborted ? 'cancelled' : 'backend_unavailable');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

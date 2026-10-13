import { requestSuggestions, enrichmentFields } from './vehicle-enrichment-client.js';
const sourceNames = { nhtsa: 'NHTSA', carapi: 'CarAPI', local_dataset: 'Local Dataset' };
const messages = { timeout: 'انتهت مهلة الاتصال بالخادم. حاول مجددًا.', busy: 'يوجد تحليل قيد التنفيذ. حاول بعد اكتماله.',
    backend_unavailable: 'خادم الإثراء غير متاح. تحقق من تشغيل الخادم المحلي.', invalid_response: 'تعذر قراءة استجابة خادم الإثراء.', invalid_endpoint: 'عنوان خادم الإثراء غير صالح.' };
const labels = { make: 'الشركة', model: 'الموديل', yearStart: 'من سنة', yearEnd: 'إلى سنة', generation: 'الجيل', bodyType: 'الهيكل', trim: 'الفئة',
    engineCode: 'رمز المحرك', engineLabel: 'المحرك', engineDisplacement: 'سعة المحرك (cc)', cylinders: 'الأسطوانات', fuelType: 'الوقود', drivetrain: 'نظام الدفع' };
const visible = v => v !== null && v !== undefined && v !== '';
function element(tag, text, className) { const n = document.createElement(tag); if (text != null) n.textContent = String(text); if (className) n.className = className; return n; }
export function mountEnrichmentPanel(host, getVehicle, { config = globalThis.SmartDragonVehicleEnrichmentConfig, client = requestSuggestions } = {}) {
    if (!host || config?.enabled !== true) return { reset() {}, destroy() {} };
    host.hidden = false; host.classList.add('vehicle-enrichment-panel');
    const title = element('h3', 'اقتراحات إثراء بيانات السيارة');
    const button = element('button', 'اقتراح بيانات السيارة', 'admin-secondary-button'); button.type = 'button';
    const notice = element('p', 'الحفظ إلى قاعدة البيانات غير مفعّل في هذه المرحلة');
    const message = element('p'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
    const output = element('div'), actions = element('div', null, 'admin-panel-actions');
    for (const text of ['اعتماد','رفض','اعتماد الحقول المحددة']) { const a = element('button', text, 'admin-secondary-button'); a.type = 'button'; a.disabled = true; actions.append(a); }
    host.replaceChildren(title, button, notice, message, output, actions);
    let sequence = 0, active;
    function reset() { sequence++; active?.abort(); active = null; output.replaceChildren(); message.textContent = ''; button.disabled = false; host.removeAttribute('aria-busy'); }
    button.addEventListener('click', async () => {
        active?.abort(); active = new AbortController(); const current = ++sequence, vehicle = getVehicle();
        if (!vehicle?.make || !vehicle?.model) { message.textContent = 'افتح سيارة وحدد الشركة والموديل أولًا.'; return; }
        button.disabled = true; host.setAttribute('aria-busy', 'true'); message.textContent = 'جاري تحليل بيانات السيارة...'; output.replaceChildren();
        try {
            const r = await client(vehicle, { config, signal: active.signal });
            if (current !== sequence) return;
            message.textContent = r.noMatch ? 'لم يتم العثور على مطابقة تلقائية موثوقة — manual_review_required' :
                r.status === 'manual_review_required' ? 'تحتاج الاقتراحات إلى مراجعة يدوية — manual_review_required' : 'اقتراحات أولية للمراجعة اليدوية فقط';
            output.append(element('p', 'هوية البحث: ' + r.identity.lookupMake + ' / ' + r.identity.lookupModel));
            if (r.identity.aliasesApplied.length) output.append(element('p', 'التحويلات: ' + r.identity.aliasesApplied.join('، ')));
            for (const [source, p] of Object.entries(r.providers)) {
                output.append(element('p', (sourceNames[source] || source) + ': ' + p.status + (p.reason ? ' — ' + p.reason : '')));
                for (const a of p.attempts || []) if (a.aliasType) output.append(element('p', sourceNames[source] + ': ' + a.make + ' / ' + a.model + ' (' + a.aliasType + ')'));
            }
            const wrap = element('div', null, 'vehicle-enrichment-table'), table = element('table'), head = element('thead'), heading = element('tr');
            for (const text of ['الحقل','الحالي','المقترح / البدائل','المصدر','الثقة','الحالة']) heading.append(element('th', text));
            head.append(heading); table.append(head); const body = element('tbody');
            for (const name of enrichmentFields) {
                const f = r.fields[name];
                if (!visible(f.current) && !visible(f.value) && !f.alternatives.length && f.status === 'unavailable') continue;
                const row = element('tr'), suggested = element('td');
                if (!f.protected && visible(f.value)) suggested.append(element('span', f.value));
                else for (const o of f.alternatives) suggested.append(element('div', o.value + ' (' + o.sources.map(s => sourceNames[s] || s).join('، ') + ')' + (o.partialCoverage ? ' — تغطية مرصودة فقط' : '')));
                if (!suggested.hasChildNodes()) suggested.append(element('span', 'غير محسوم'));
                row.append(element('td', labels[name]), element('td', f.current ?? '—'), suggested,
                    element('td', f.sources.map(s => sourceNames[s] || s).join('، ') || '—'), element('td', f.confidence),
                    element('td', f.status === 'manual' ? 'manual — قيمة يدوية — محمية من الاستبدال التلقائي' : f.status));
                body.append(row);
            }
            table.append(body); wrap.append(table); output.append(wrap);
            for (const a of r.ambiguities) {
                output.append(element('h4', a.message)); const list = element('ul');
                for (const o of a.options) list.append(element('li', Object.entries(o).filter(([k,v]) => visible(v)).map(([k,v]) => k + ': ' + (sourceNames[v] || v)).join(' / ')));
                output.append(list);
                if (a.totalOptions > a.options.length) output.append(element('p', 'يعرض ' + a.options.length + ' من ' + a.totalOptions + ' خيارًا.'));
            }
        } catch (error) { if (current === sequence && error.code !== 'cancelled') message.textContent = messages[error.code] || messages.backend_unavailable; }
        finally { if (current === sequence) { button.disabled = false; host.removeAttribute('aria-busy'); } }
    });
    return { reset, destroy() { reset(); host.replaceChildren(); host.hidden = true; } };
}
if (typeof window !== 'undefined') {
    let panel;
    window.SmartDragonVehicleEnrichment = {
        open(getVehicle) { panel?.destroy(); panel = mountEnrichmentPanel(document.getElementById('vehicleEnrichmentPanel'), getVehicle); },
        reset() { panel?.destroy(); panel = null; }
    };
}

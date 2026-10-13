import { requestSuggestions, enrichmentFields } from './vehicle-enrichment-client.js';
const sourceNames = { nhtsa: 'NHTSA', carapi: 'CarAPI', local_dataset: 'Local Dataset' };
const messages = { timeout: 'انتهت مهلة الاتصال بالخادم. حاول مجددًا.', busy: 'يوجد تحليل قيد التنفيذ.',
    backend_unavailable: 'خادم الإثراء غير متاح.', invalid_response: 'تعذر قراءة استجابة خادم الإثراء.', invalid_endpoint: 'عنوان خادم الإثراء غير صالح.',
    unauthenticated: 'سجل الدخول مجددًا.', forbidden: 'هذا الحساب غير مخول بطلب الإثراء.' };
const labels = { make: 'الشركة', model: 'الموديل', yearStart: 'من سنة', yearEnd: 'إلى سنة', generation: 'الجيل', bodyType: 'الهيكل', trim: 'الفئة',
    engineCode: 'رمز المحرك', engineLabel: 'المحرك', engineDisplacement: 'سعة المحرك (cc)', cylinders: 'الأسطوانات', fuelType: 'الوقود', drivetrain: 'نظام الدفع' };
const identityFields = ['make','model','yearStart','yearEnd'];
const generationFields = ['generation','yearStart','yearEnd'];
const engineFields = ['engineCode','engineLabel','engineDisplacement','cylinders','fuelType','drivetrain'];
const visible = v => v !== null && v !== undefined && String(v).trim() !== '';
const equal = (a,b) => (!visible(a) && !visible(b)) || String(a).trim() === String(b).trim();
const owner = () => globalThis.SmartDragonAuth?.isOwner?.() === true;
function element(tag,text,className) { const n = document.createElement(tag); if (text != null) n.textContent = String(text); if (className) n.className = className; return n; }
function sourceList(value) { return (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []).filter(source => Object.hasOwn(sourceNames,source)); }
function optionValues(option,names) {
    const values = {};
    for (const name of names) {
        const raw = option?.[name] ?? option?.fields?.[name];
        const value = raw && typeof raw === 'object' ? raw.value : raw;
        if (['string','number'].includes(typeof value) && visible(value)) values[name] = value;
    }
    return values;
}

export function mountEnrichmentPanel(host,getVehicle,{ config = globalThis.SmartDragonVehicleEnrichmentConfig, client = requestSuggestions, onApplied = async () => {} } = {}) {
    if (!host || config?.enabled !== true) return { reset() {},destroy() {} };
    host.hidden = false; host.classList.add('vehicle-enrichment-panel');
    const title = element('h3','اقتراحات إثراء بيانات السيارة');
    const request = element('button','اقتراح بيانات السيارة','admin-secondary-button'); request.type = 'button';
    const notice = element('p','اختر القيم للمراجعة. الاعتماد متاح للمالك، ولا يغيّر بيانات التوافق الموجودة.');
    const message = element('p'); message.setAttribute('role','status'); message.setAttribute('aria-live','polite');
    const output = element('div'),actions = element('div',null,'admin-panel-actions');
    const complete = element('button','اعتماد الاستكمال','admin-secondary-button');
    const reject = element('button','رفض','admin-secondary-button');
    const selected = element('button','اعتماد الحقول المحددة','admin-secondary-button');
    for (const button of [complete,reject,selected]) { button.type = 'button'; button.disabled = true; actions.append(button); }
    host.replaceChildren(title,request,notice,message,output,actions);
    let sequence = 0,active,result,baseline,controls = [],generationRequired = false,applying = false;
    function actionState() {
        complete.disabled = selected.disabled = !result || !owner() || applying;
        reject.disabled = !result || applying; request.disabled = applying || Boolean(active);
    }
    function reset() {
        sequence++; active?.abort(); active = null; result = null; baseline = null; controls = [];
        output.replaceChildren(); message.textContent = ''; host.removeAttribute('aria-busy'); actionState();
    }
    reject.addEventListener('click',() => { reset(); message.textContent = 'تم رفض الاقتراحات في الواجهة فقط.'; });

    function addControl(cell,values,evidence,description) {
        if (!Object.keys(values).length) return;
        const row = element('div',null,'enrichment-review-option');
        const choice = element('input'); choice.type = 'checkbox'; choice.disabled = !owner();
        const label = element('label'); label.append(choice,document.createTextNode(' ' + description)); row.append(label);
        const replaces = Object.keys(values).some(name => visible(baseline[name]) && !equal(baseline[name],values[name]));
        let replace;
        if (replaces) {
            replace = element('input'); replace.type = 'checkbox'; replace.disabled = !owner();
            const confirmation = element('label'); confirmation.append(replace,document.createTextNode(' أوافق صراحة على استبدال القيم الحالية الموضحة'));
            row.append(confirmation);
        }
        choice.addEventListener('change',() => {
            if (choice.checked) for (const control of controls) {
                if (control.choice !== choice && Object.keys(control.values).some(name => Object.hasOwn(values,name))) control.choice.checked = false;
            }
        });
        const partial = evidence.partialCoverage === true;
        if (partial || !evidence.sources.length) {
            choice.disabled = true;
            row.append(element('small',partial ? 'تغطية جزئية؛ لا تصلح لاعتماد نطاق إنتاج نهائي.' : 'المصدر غير واضح؛ غير قابل للاعتماد.'));
        }
        controls.push({ choice,replace,values,evidence }); cell.append(row);
    }

    function renderResponse(r) {
        controls = []; generationRequired = false;
        const grouped = new Set();
        output.append(element('p','هوية البحث: ' + (r.identity.lookupMake || '') + ' / ' + (r.identity.lookupModel || '')));
        for (const [source,provider] of Object.entries(r.providers)) output.append(element('p',(sourceNames[source] || source) + ': ' + provider.status));
        for (const ambiguity of r.ambiguities) {
            const options = Array.isArray(ambiguity.options) ? ambiguity.options : [];
            const hasGenerationOptions = options.some(option => Object.keys(optionValues(option,generationFields)).length > 0);
            const generationOptions = options.filter(option => generationFields.every(name => visible(optionValues(option,generationFields)[name])));
            const engineOptions = options.filter(option => Object.keys(optionValues(option,engineFields)).length > 0);
            const names = hasGenerationOptions ? generationFields : engineOptions.length ? engineFields : [];
            if (!names.length) { output.append(element('p',ambiguity.message || 'خيارات غير مدعومة؛ تحتاج مراجعة المصدر.')); continue; }
            names.forEach(name => grouped.add(name));
            if (names === generationFields) generationRequired = true;
            const section = element('fieldset'); section.append(element('legend',ambiguity.message || (names === generationFields ? 'اختر الجيل ونطاقه معًا' : 'اختر حزمة المحرك')));
            for (const name of names) section.append(element('p',labels[name] + ' الحالي: ' + (baseline[name] ?? '—')));
            if (names === generationFields && !generationOptions.length) section.append(element('p','خيارات الجيل لا تحتوي حزمة سنوات كاملة؛ لا يمكن اعتماد السنوات من خيارات منفصلة.'));
            for (const option of names === generationFields ? generationOptions : engineOptions) {
                const values = optionValues(option,names);
                // Use only explicit option/field evidence, never guess a provider.
                const matching = Object.keys(values).flatMap(name => r.fields[name].alternatives.filter(a => equal(a.value,values[name])));
                const sources = [...new Set([...sourceList(option.sources || option.source),...matching.flatMap(a => sourceList(a.sources)),
                    ...Object.keys(values).flatMap(name => sourceList(r.fields[name].sources))])];
                const partialCoverage = option.partialCoverage === true || matching.some(a => a.partialCoverage === true);
                const confidences = Object.keys(values).map(name => r.fields[name].confidence);
                const confidence = Number.isFinite(option.confidence) ? option.confidence : Math.min(...confidences);
                const description = Object.entries(values).map(([name,value]) => labels[name] + ': ' + value).join(' — ');
                addControl(section,values,{ sources,confidence,partialCoverage },description + ' (' + sources.map(s => sourceNames[s]).join('، ') + ')');
            }
            output.append(section);
        }
        const wrap = element('div',null,'vehicle-enrichment-table'),table = element('table'),head = element('thead'),heading = element('tr');
        for (const text of ['الحقل','الحالي','المقترح / البدائل','المصدر','الثقة','الحالة']) heading.append(element('th',text));
        head.append(heading); table.append(head); const body = element('tbody');
        for (const name of enrichmentFields) {
            const field = r.fields[name];
            if (!visible(baseline[name]) && !visible(field.value) && !field.alternatives.length && field.status === 'unavailable') continue;
            const row = element('tr'),suggested = element('td');
            if (grouped.has(name)) suggested.append(element('span','راجع الحزمة أعلاه'));
            else if (field.status !== 'unavailable') {
                const options = [...field.alternatives];
                if (field.status === 'candidate' && visible(field.value) && !options.some(option => equal(option.value,field.value))) {
                    options.push({ value: field.value,sources: field.sources,confidence: field.confidence,partialCoverage: field.partialCoverage });
                }
                for (const option of options) addControl(suggested,{ [name]: option.value },{
                    sources: sourceList(option.sources),confidence: Number.isFinite(option.confidence) ? option.confidence : field.confidence,
                    partialCoverage: option.partialCoverage === true
                },String(option.value));
            }
            if (!suggested.hasChildNodes()) suggested.append(element('span',field.status === 'manual' ? 'قيمة حالية محمية' : 'غير متوفر'));
            row.append(element('td',labels[name]),element('td',baseline[name] ?? '—'),suggested,
                element('td',field.sources.map(source => sourceNames[source] || source).join('، ') || '—'),element('td',field.confidence),
                element('td',field.status + (visible(baseline[name]) ? ' — الحالية محمية من الاستبدال التلقائي' : '')));
            body.append(row);
        }
        table.append(body); wrap.append(table); output.append(wrap);
    }

    request.addEventListener('click',async () => {
        reset(); active = new AbortController(); const current = sequence,vehicle = getVehicle();
        if (!vehicle?.id || !vehicle.make || !vehicle.model) { active = null; message.textContent = 'افتح سجل سيارة محفوظًا وحدد الشركة والموديل أولًا.'; actionState(); return; }
        baseline = Object.fromEntries(enrichmentFields.map(name => [name,vehicle[name] ?? null]));
        baseline.id = vehicle.id;
        actionState(); host.setAttribute('aria-busy','true'); message.textContent = 'جاري تحليل بيانات السيارة...';
        try {
            const response = await client(vehicle,{ config,signal: active.signal });
            if (current !== sequence) return;
            result = response; renderResponse(response);
            message.textContent = 'اقتراحات للمراجعة اليدوية. لا يتم اعتماد أي قيمة تلقائيًا.';
        } catch (error) { if (current === sequence && error.code !== 'cancelled') message.textContent = messages[error.code] || error.message; }
        finally { if (current === sequence) { active = null; host.removeAttribute('aria-busy'); actionState(); } }
    });

    async function apply(requireCompletion) {
        if (!owner() || !result || applying) return;
        try {
            const current = getVehicle();
            if (current.id !== baseline.id || enrichmentFields.some(name => !equal(current[name],baseline[name]))) throw new Error('تم تعديل بيانات السيارة بعد التحليل. أعد تشغيل الإثراء.');
            const selection = {};
            for (const control of controls.filter(item => item.choice.checked && !item.choice.disabled)) {
                if (control.replace && !control.replace.checked) throw new Error('أكد استبدال القيم الحالية صراحةً قبل الاعتماد.');
                for (const [name,value] of Object.entries(control.values)) selection[name] = { ...control.evidence,value,replace: control.replace?.checked === true };
            }
            if (!Object.keys(selection).length) throw new Error('لم يتم اختيار أي حقول للاعتماد.');
            if (requireCompletion && generationRequired && !generationFields.every(name => selection[name])) throw new Error('اختر الجيل ونطاق السنوات معًا قبل اعتماد الاستكمال.');
            const finalIdentity = { ...baseline,...Object.fromEntries(Object.entries(selection).map(([name,item]) => [name,item.value])) };
            if (requireCompletion && (!visible(finalIdentity.make) || !visible(finalIdentity.model) || !['yearStart','yearEnd'].every(name => visible(finalIdentity[name])))) throw new Error('اختر السنوات لإكمال هوية السيارة.');
            applying = true; actionState(); message.textContent = 'جاري اعتماد الحقول المحددة...';
            await globalThis.SmartDragonFirestore.applyVehicleEnrichment(baseline.id,selection,{ expected: Object.fromEntries(enrichmentFields.map(name => [name,baseline[name]])) });
            await onApplied();
            result = null; controls = []; output.replaceChildren(); message.textContent = 'تم اعتماد البيانات. بيانات التوافق الحالية محفوظة.';
        } catch (error) { message.textContent = error.message || 'تعذر الاعتماد.'; }
        finally { applying = false; actionState(); }
    }
    complete.addEventListener('click',() => apply(true)); selected.addEventListener('click',() => apply(false));
    return { reset,destroy() { reset(); host.replaceChildren(); host.hidden = true; } };
}
if (typeof window !== 'undefined') {
    let panel;
    window.SmartDragonVehicleEnrichment = {
        open(getVehicle,onApplied) { panel?.destroy(); panel = mountEnrichmentPanel(document.getElementById('vehicleEnrichmentPanel'),getVehicle,{ onApplied }); },
        reset() { panel?.destroy(); panel = null; }
    };
}

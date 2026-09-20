/** Smart Dragon Inventory - Admin Dashboard */
(() => {
    "use strict";

    const state = {
        profile: null,
        vehicles: [],
        requests: [],
        currentVehicle: null,
        currentView: "dashboard",
        validationTimer: null,
        validationSequence: 0,
        currentConflicts: { duplicates: [], overlaps: [] },
        overlapOverviewOpen: false,
        categories: [],
        editingCategorySlug: null,
        users: []
    };

    const $ = (id) => document.getElementById(id);

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function message(element, text, type = "info") {
        if (!element) return;
        element.hidden = !text;
        element.className = `admin-message ${type}`;
        element.textContent = text || "";
    }

    function setBusy(button, busy, busyText = "جاري التنفيذ...") {
        if (!button) return;
        if (busy) {
            button.dataset.originalText = button.textContent;
            button.textContent = busyText;
            button.disabled = true;
        } else {
            button.textContent = button.dataset.originalText || button.textContent;
            button.disabled = false;
        }
    }

    function normalizeInputValue(value) {
        return window.SmartDragonValidation?.normalizePlainText?.(String(value ?? "")) ?? String(value ?? "").trim();
    }

    function canonicalVehicleText(value) {
        return normalizeInputValue(value).normalize("NFKC").toLocaleLowerCase("en");
    }

    function findLocalExactDuplicate(vehicle) {
        const currentId = String($("vehicleId").value || "");
        const make = canonicalVehicleText(vehicle.make);
        const model = canonicalVehicleText(vehicle.model);
        const yearStart = Number(vehicle.yearStart);
        const yearEnd = Number(vehicle.yearEnd);

        return state.vehicles.find((item) => {
            if (String(item.id || "") === currentId) return false;
            return canonicalVehicleText(item.make) === make &&
                canonicalVehicleText(item.model) === model &&
                Number(item.yearStart) === yearStart &&
                Number(item.yearEnd) === yearEnd;
        }) || null;
    }

    function activeCategories() {
        return state.categories.filter((category) => category.active !== false);
    }

    function fieldInputId(categorySlug, fieldKey) {
        return `fit_${categorySlug}_${fieldKey}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    }

    function categoryFieldDefinitions(category) {
        return Array.isArray(category?.fieldsDefinition) ? category.fieldsDefinition : [];
    }

    function renderDynamicFitmentSections() {
        const container = $("dynamicFitmentSections");
        if (!container) return;

        const categories = activeCategories();
        if (!categories.length) {
            container.innerHTML = '<div class="admin-empty-state compact"><strong>لا توجد أصناف فعالة</strong><span>أضف صنفًا من صفحة الأصناف أولًا.</span></div>';
            return;
        }

        container.innerHTML = categories.map((category) => {
            const fields = categoryFieldDefinitions(category);
            const controls = fields.map((field) => {
                const id = fieldInputId(category.slug, field.key);
                const type = field.type === "number" ? "number" : "text";
                const attrs = [];
                if (field.type === "number") {
                    if (field.min !== null && field.min !== undefined && field.min !== "" && Number.isFinite(Number(field.min))) attrs.push(`min="${escapeHtml(field.min)}"`);
                    if (field.max !== null && field.max !== undefined && field.max !== "" && Number.isFinite(Number(field.max))) attrs.push(`max="${escapeHtml(field.max)}"`);
                    attrs.push(`step="${escapeHtml(field.step || 1)}"`);
                } else {
                    attrs.push(`maxlength="${escapeHtml(field.maxLength || 300)}"`);
                }
                if (field.placeholder) attrs.push(`placeholder="${escapeHtml(field.placeholder)}"`);
                return `<label>${escapeHtml(field.label || field.key)}${field.unit ? ` <small>(${escapeHtml(field.unit)})</small>` : ""}<input id="${id}" data-fit-category="${escapeHtml(category.slug)}" data-fit-field="${escapeHtml(field.key)}" data-fit-type="${escapeHtml(field.type || "text")}" ${attrs.join(" ")}></label>`;
            }).join("");

            return `<div class="admin-form-section dynamic-fitment-section" data-category-slug="${escapeHtml(category.slug)}"><div class="admin-section-heading"><h3>${escapeHtml(category.name)}</h3><span>${escapeHtml(category.slug)}</span></div><div class="admin-form-grid three">${controls || '<span class="admin-muted">هذا الصنف لا يحتوي حقولًا بعد.</span>'}</div></div>`;
        }).join("");
    }

    function validateFitmentForm() {
        const errors = [];
        let hasAnyFitment = false;

        activeCategories().forEach((category) => {
            categoryFieldDefinitions(category).forEach((field) => {
                const input = $(fieldInputId(category.slug, field.key));
                if (!input) return;
                const raw = normalizeInputValue(input.value);
                if (!raw) return;
                hasAnyFitment = true;

                if (field.type === "number") {
                    const number = Number(raw);
                    const min = field.min === null || field.min === undefined || field.min === "" ? null : Number(field.min);
                    const max = field.max === null || field.max === undefined || field.max === "" ? null : Number(field.max);
                    if (!Number.isFinite(number) || (min !== null && number < min) || (max !== null && number > max)) {
                        errors.push(`قيمة ${category.name} / ${field.label || field.key} خارج النطاق المسموح.`);
                    }
                    return;
                }

                if (field.type === "bulb") {
                    if (!SmartDragonValidation.validateFitmentValue(raw)) {
                        errors.push(`قيمة ${category.name} / ${field.label || field.key} غير صالحة.`);
                    }
                    return;
                }

                if (!SmartDragonValidation.validateNote(raw)) {
                    errors.push(`قيمة ${category.name} / ${field.label || field.key} تحتوي على نص غير صالح.`);
                }
            });
        });

        if (!hasAnyFitment) {
            errors.push("أدخل بيانات توافق واحدة على الأقل في أحد الأصناف الفعالة.");
        }

        return errors;
    }

    function localVehicleValidation() {
        const vehicle = {
            make: normalizeInputValue($("vehicleMake").value),
            model: normalizeInputValue($("vehicleModel").value),
            yearStart: Number($("vehicleYearStart").value),
            yearEnd: Number($("vehicleYearEnd").value)
        };
        const result = SmartDragonValidation.validateVehicleRecord(vehicle);
        const errors = [...result.errors];

        const arabicMake = normalizeInputValue($("vehicleArabicMake").value);
        if (arabicMake && !SmartDragonValidation.isSafePlainText(arabicMake, 100)) {
            errors.push("اسم الشركة بالعربي يحتوي على رموز غير مسموحة.");
        }

        const keywords = $("vehicleArabicKeywords").value.trim();
        if (keywords) {
            const keywordList = keywords.split(/[,،]/).map((x) => normalizeInputValue(x)).filter(Boolean);
            if (keywordList.some((x) => !SmartDragonValidation.isSafePlainText(x, 80))) {
                errors.push("إحدى الكلمات العربية تحتوي على رموز غير مسموحة.");
            }
        }

        errors.push(...validateFitmentForm());

        const overlapReason = normalizeInputValue($("vehicleOverlapReason")?.value || "");
        if ($("vehicleHasOverlap")?.checked && overlapReason && !SmartDragonValidation.validateNote(overlapReason)) {
            errors.push("سبب التداخل يحتوي على نص غير صالح.");
        }

        return { valid: errors.length === 0, errors, vehicle };
    }

    function renderValidationSummary(localErrors = [], conflicts = state.currentConflicts) {
        const box = $("vehicleValidationSummary");
        if (!box) return;
        const duplicates = conflicts?.duplicates || [];
        const overlaps = conflicts?.overlaps || [];
        const overlapAcknowledged = $("vehicleHasOverlap").checked;
        const items = [];

        localErrors.forEach((text) => items.push({ type: "error", text }));
        duplicates.forEach((item) => items.push({ type: "error", text: `سجل مكرر مطابق موجود: ${item.label}` }));
        overlaps.forEach((item) => items.push({
            type: overlapAcknowledged ? "warning" : "error",
            text: `تداخل سنوات مع: ${item.label}${overlapAcknowledged ? " — تم تأكيد أن التداخل مقصود." : " — عدّل النطاق أو فعّل خيار التداخل المقصود."}`
        }));

        const reasonWrap = $("vehicleOverlapReasonWrap");
        const reason = normalizeInputValue($("vehicleOverlapReason")?.value || "");
        const needsReason = overlaps.length > 0 && overlapAcknowledged;
        if (reasonWrap) reasonWrap.hidden = !needsReason;
        if (needsReason && !reason) {
            items.push({ type: "error", text: "اكتب سبب التداخل المقصود قبل الحفظ." });
        }

        if (!items.length) {
            box.hidden = false;
            box.className = "admin-validation-summary success";
            box.innerHTML = "<strong>البيانات سليمة</strong><span>لا يوجد تكرار أو تداخل مع السجلات المنشورة.</span>";
            return;
        }

        box.hidden = false;
        box.className = `admin-validation-summary ${items.some((x) => x.type === "error") ? "error" : "warning"}`;
        box.innerHTML = `<strong>${items.some((x) => x.type === "error") ? "راجع البيانات قبل الحفظ" : "تنبيه"}</strong><ul>${items.map((x) => `<li>${escapeHtml(x.text)}</li>`).join("")}</ul>`;
    }

    async function validateVehicleFormLive() {
        const sequence = ++state.validationSequence;
        const local = localVehicleValidation();
        state.currentConflicts = { duplicates: [], overlaps: [] };

        const enoughForConflictCheck =
            SmartDragonValidation.validateVehicleMake(local.vehicle.make) &&
            SmartDragonValidation.validateVehicleModel(local.vehicle.model) &&
            SmartDragonValidation.validateYearRange(local.vehicle.yearStart, local.vehicle.yearEnd);

        if (enoughForConflictCheck) {
            try {
                const conflicts = await SmartDragonFirestore.checkVehicleConflicts(
                    $("vehicleId").value || null,
                    { ...local.vehicle, hasOverlap: $("vehicleHasOverlap").checked }
                );
                if (sequence !== state.validationSequence) return;
                state.currentConflicts = conflicts;
            } catch (error) {
                if (sequence !== state.validationSequence) return;
                console.error(error);
                local.errors.push(error.message || "تعذر التحقق من التكرار والتداخل.");
            }
        }

        renderValidationSummary(local.errors, state.currentConflicts);
    }

    function scheduleVehicleValidation() {
        clearTimeout(state.validationTimer);
        state.validationTimer = setTimeout(validateVehicleFormLive, 250);
    }

    function assertVehicleFormCanSubmit() {
        const local = localVehicleValidation();
        if (!local.valid) {
            renderValidationSummary(local.errors, state.currentConflicts);
            throw new Error(local.errors[0]);
        }

        // Second independent guard using the vehicles already loaded in the admin
        // table. This makes exact duplicates impossible even if the remote conflict
        // query is stale or an older imported record has unusual status metadata.
        const localDuplicate = findLocalExactDuplicate(local.vehicle);
        if (localDuplicate) {
            throw new Error(`يوجد سجل مكرر مطابق بالفعل: ${localDuplicate.make} ${localDuplicate.model} ${localDuplicate.yearStart}-${localDuplicate.yearEnd}`);
        }

        if (state.currentConflicts.duplicates.length) {
            throw new Error(`يوجد سجل مكرر مطابق: ${state.currentConflicts.duplicates[0].label}`);
        }

        if (state.currentConflicts.overlaps.length && !$("vehicleHasOverlap").checked) {
            throw new Error("يوجد تداخل في نطاق السنوات. عدّل النطاق أو فعّل خيار التداخل المقصود بعد التحقق.");
        }

        if (state.currentConflicts.overlaps.length && $("vehicleHasOverlap").checked) {
            const reason = normalizeInputValue($("vehicleOverlapReason").value);
            if (!reason) {
                throw new Error("اكتب سبب التداخل المقصود قبل الحفظ.");
            }
        }
    }

    function isOwner() {
        return state.profile?.role === "owner" && state.profile?.enabled === true;
    }

    function isEditor() {
        return state.profile?.role === "editor" && state.profile?.enabled === true;
    }

    function updateRoleUI() {
        document.querySelectorAll(".owner-only").forEach((el) => {
            el.hidden = !isOwner();
        });

        $("userRole").textContent = isOwner() ? "Owner" : isEditor() ? "Editor" : "غير مصرح";
        $("userEmail").textContent = state.profile?.email || "—";
        $("userAvatar").textContent = (state.profile?.displayName || state.profile?.email || "S").trim().charAt(0).toUpperCase();
        $("saveVehicleButton").textContent = isOwner() ? "حفظ ونشر" : "إرسال للمراجعة";
    }

    function showApp() {
        $("loginGate").hidden = true;
        $("adminSidebar").hidden = false;
        $("adminMain").hidden = false;
        $("adminStatusText").textContent = isOwner()
            ? "متصل بحساب المالك"
            : "متصل بحساب محرر — التعديلات تحتاج اعتماد";
        updateRoleUI();
    }

    function showLogin(text = "سجل الدخول بحساب Google المصرح له.") {
        $("loginGate").hidden = false;
        $("adminSidebar").hidden = true;
        $("adminMain").hidden = true;
        $("adminStatusText").textContent = text;
    }

    function switchView(view) {
        state.currentView = view;
        document.querySelectorAll(".admin-view").forEach((el) => el.classList.remove("active"));
        document.querySelectorAll(".admin-nav-item[data-view]").forEach((el) => el.classList.toggle("active", el.dataset.view === view));

        const map = {
            dashboard: ["dashboardView", "لوحة التحكم", "إدارة بيانات توافق السيارات والمراجعات."],
            vehicles: ["vehiclesView", "السيارات", "إضافة وتعديل سجلات السيارات وبيانات التوافق."],
            reviews: ["reviewsView", "طلبات المراجعة", "اعتماد أو رفض تعديلات المحررين."],
            categories: ["categoriesView", "الأصناف", "إدارة فئات وحقول بيانات التوافق بشكل ديناميكي."],
            users: ["usersView", "المستخدمون", "إدارة المحررين ودعوات الدخول إلى لوحة الإدارة."]
        };

        const [id, title, subtitle] = map[view] || map.dashboard;
        $(id).classList.add("active");
        $("pageTitle").textContent = title;
        $("pageSubtitle").textContent = subtitle;

        if (view === "dashboard") loadStats();
        if (view === "vehicles") loadVehicles();
        if (view === "reviews") loadReviews();
        if (view === "categories") loadCategories();
        if (view === "users") loadUsers();
    }

    async function loadStats() {
        try {
            const stats = await SmartDragonFirestore.getDashboardStats();
            $("statVehicles").textContent = stats.vehicles;
            $("statPending").textContent = stats.pending;
            $("statCategories").textContent = stats.categories;
            $("statUsers").textContent = stats.users;
        } catch (error) {
            console.error(error);
            message($("dashboardMessage"), error.message || "تعذر تحميل الإحصائيات.", "error");
        }
    }

    async function loadVehicles() {
        message($("vehiclesMessage"), "");
        $("vehiclesTableBody").innerHTML = '<tr><td colspan="6"><div class="admin-empty-state"><strong>جاري التحميل...</strong></div></td></tr>';
        try {
            state.vehicles = await SmartDragonFirestore.listVehicles({ limit: 500 });
            renderVehicles();
        } catch (error) {
            console.error(error);
            $("vehiclesTableBody").innerHTML = '<tr><td colspan="6"><div class="admin-empty-state"><strong>تعذر تحميل البيانات</strong></div></td></tr>';
            message($("vehiclesMessage"), error.message || "تعذر تحميل السيارات.", "error");
        }
    }

    function yearRangesOverlap(aStart, aEnd, bStart, bEnd) {
        return Number(aStart) <= Number(bEnd) && Number(bStart) <= Number(aEnd);
    }

    function vehicleGroupKey(vehicle) {
        return `${canonicalVehicleText(vehicle.make)}|${canonicalVehicleText(vehicle.model)}`;
    }

    function collectCurrentOverlaps() {
        const groups = new Map();
        state.vehicles.forEach((vehicle) => {
            const key = vehicleGroupKey(vehicle);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(vehicle);
        });

        const overlaps = [];
        groups.forEach((items) => {
            const sorted = [...items].sort((a, b) => Number(a.yearStart) - Number(b.yearStart));
            for (let i = 0; i < sorted.length; i += 1) {
                for (let j = i + 1; j < sorted.length; j += 1) {
                    const a = sorted[i];
                    const b = sorted[j];
                    const exact = Number(a.yearStart) === Number(b.yearStart) && Number(a.yearEnd) === Number(b.yearEnd);
                    if (!exact && yearRangesOverlap(a.yearStart, a.yearEnd, b.yearStart, b.yearEnd)) {
                        overlaps.push({ a, b });
                    }
                }
            }
        });
        return overlaps;
    }

    function renderOverlapOverview() {
        const panel = $("overlapOverview");
        const details = $("overlapOverviewDetails");
        const button = $("toggleOverlapOverviewButton");
        const overlaps = collectCurrentOverlaps();

        panel.hidden = false;
        $("overlapOverviewCount").textContent = overlaps.length
            ? `${overlaps.length} تداخل يحتاج مراجعة`
            : "لا توجد تداخلات حالية";

        if (!overlaps.length) {
            panel.classList.add("clean");
            details.hidden = true;
            button.hidden = true;
            details.innerHTML = "";
            return;
        }

        panel.classList.remove("clean");
        button.hidden = false;
        button.textContent = state.overlapOverviewOpen ? "إخفاء التفاصيل" : "عرض التفاصيل";
        details.hidden = !state.overlapOverviewOpen;
        details.innerHTML = overlaps.map(({ a, b }) => `
            <div class="admin-overlap-item">
                <div>
                    <strong>${escapeHtml(a.make)} ${escapeHtml(a.model)}</strong>
                    <span>${escapeHtml(a.yearStart)}–${escapeHtml(a.yearEnd)} ↔ ${escapeHtml(b.yearStart)}–${escapeHtml(b.yearEnd)}</span>
                    ${a.overlapReason || b.overlapReason ? `<small>${escapeHtml(a.overlapReason || b.overlapReason)}</small>` : '<small>لا يوجد سبب موثق للتداخل.</small>'}
                </div>
                <div class="admin-overlap-actions">
                    <button class="admin-link-button" type="button" data-edit-vehicle="${escapeHtml(a.id)}">فتح الأول</button>
                    <button class="admin-link-button" type="button" data-edit-vehicle="${escapeHtml(b.id)}">فتح الثاني</button>
                </div>
            </div>
        `).join("");
    }

    function renderVehicles() {
        const term = $("vehicleSearchInput").value.trim().toLowerCase();
        const rows = state.vehicles.filter((v) => {
            if (!term) return true;
            return `${v.make || ""} ${v.model || ""} ${v.arabicMake || ""}`.toLowerCase().includes(term);
        });

        renderOverlapOverview();

        if (!rows.length) {
            $("vehiclesTableBody").innerHTML = '<tr><td colspan="6"><div class="admin-empty-state"><strong>لا توجد سجلات مطابقة</strong><span>يمكنك إضافة سجل جديد أو استيراد البيانات الحالية.</span></div></td></tr>';
            return;
        }

        $("vehiclesTableBody").innerHTML = rows.map((v) => `
            <tr>
                <td>${escapeHtml(v.make)}</td>
                <td>${escapeHtml(v.model)}</td>
                <td>${escapeHtml(v.yearStart)}–${escapeHtml(v.yearEnd)}</td>
                <td><span class="admin-badge approved">${escapeHtml(v.status || "approved")}</span></td>
                <td>${v.hasOverlap ? '<span class="admin-badge warning">يوجد تداخل</span>' : '<span class="admin-badge neutral">لا</span>'}</td>
                <td><button class="admin-link-button" type="button" data-edit-vehicle="${escapeHtml(v.id)}">فتح / تعديل</button></td>
            </tr>
        `).join("");
    }

    function parseBulbValue(value) {
        const raw = String(value || "").trim();
        if (!raw) return null;
        if (/^(n\/a|na|غير منطبق)$/i.test(raw)) {
            return { raw: "N/A", type: null, code: null, aliases: [], technology: null, dependsOnTrim: false, notApplicable: true, notes: null };
        }
        if (/led|oem/i.test(raw) && raw.includes("/")) {
            return { raw, type: "oem_led", code: null, aliases: [], technology: "LED", dependsOnTrim: true, notApplicable: false, notes: raw };
        }
        return { raw, type: "replaceable_bulb", code: raw, aliases: [], technology: null, dependsOnTrim: false, notApplicable: false, notes: null };
    }

    function dynamicFieldValue(field, raw) {
        const value = normalizeInputValue(raw);
        if (!value) return null;
        if (field.type === "bulb") return parseBulbValue(value);
        if (field.type === "number") {
            const number = Number(value);
            if (!Number.isFinite(number)) return null;
            return { value: number, unit: normalizeInputValue(field.unit || "") || null, raw: String(number) };
        }
        return { raw: value, options: [], notes: value };
    }

    function buildDynamicFitments() {
        const fitments = [];
        activeCategories().forEach((category) => {
            const fields = {};
            categoryFieldDefinitions(category).forEach((field) => {
                const input = $(fieldInputId(category.slug, field.key));
                if (!input) return;
                const parsed = dynamicFieldValue(field, input.value);
                if (parsed) fields[field.key] = parsed;
            });
            if (Object.keys(fields).length) {
                fitments.push({ categorySlug: category.slug, fields, source: "admin" });
            }
        });
        return fitments;
    }

    function buildPayloadFromForm() {
        return {
            vehicle: {
                make: $("vehicleMake").value,
                model: $("vehicleModel").value,
                arabicMake: $("vehicleArabicMake").value,
                arabicKeywords: $("vehicleArabicKeywords").value,
                yearStart: Number($("vehicleYearStart").value),
                yearEnd: Number($("vehicleYearEnd").value),
                dataQuality: "complete",
                hasOverlap: $("vehicleHasOverlap").checked,
                overlapReason: $("vehicleHasOverlap").checked ? $("vehicleOverlapReason").value : ""
            },
            fitments: buildDynamicFitments()
        };
    }

    function findFitment(record, slug) {
        return record?.fitments?.find((f) => (f.categoryId || f.categorySlug) === slug) || null;
    }

    function storedFieldText(field) {
        if (!field) return "";
        if (field.notApplicable) return "N/A";
        if (field.value !== null && field.value !== undefined) return String(field.value);
        return field.raw || field.code || field.notes || "";
    }

    function fillDynamicFitments(record) {
        activeCategories().forEach((category) => {
            const fitment = findFitment(record, category.slug);
            categoryFieldDefinitions(category).forEach((field) => {
                const input = $(fieldInputId(category.slug, field.key));
                if (input) input.value = storedFieldText(fitment?.fields?.[field.key]);
            });
        });
    }

    async function ensureCategoriesLoaded() {
        if (state.categories.length) return;
        state.categories = await SmartDragonFirestore.getCategories();
        renderDynamicFitmentSections();
    }

    async function openVehicleModal(vehicleId = null) {
        await ensureCategoriesLoaded();
        state.currentVehicle = null;
        $("vehicleForm").reset();
        renderDynamicFitmentSections();
        state.currentConflicts = { duplicates: [], overlaps: [] };
        $("vehicleValidationSummary").hidden = true;
        $("vehicleOverlapReasonWrap").hidden = true;
        $("vehicleOverlapReason").value = "";
        $("vehicleId").value = vehicleId || "";
        $("deleteVehicleButton").hidden = true;
        message($("vehicleFormMessage"), "");

        if (!vehicleId) {
            $("vehicleModalTitle").textContent = "إضافة سيارة";
            $("vehicleModalHint").textContent = isOwner() ? "سيتم نشر السجل مباشرة بعد الحفظ." : "سيتم إرسال السجل للمالك للمراجعة.";
            $("vehicleModal").hidden = false;
            scheduleVehicleValidation();
            return;
        }

        $("vehicleModalTitle").textContent = "تحميل السجل...";
        $("vehicleModal").hidden = false;

        try {
            const record = await SmartDragonFirestore.getVehicleRecord(vehicleId);
            if (!record) throw new Error("السجل غير موجود.");
            state.currentVehicle = record;
            $("vehicleModalTitle").textContent = `${record.make} ${record.model}`;
            $("vehicleModalHint").textContent = isOwner() ? "التعديل سيُنشر مباشرة." : "التعديل سيُرسل للمراجعة.";
            $("vehicleMake").value = record.make || "";
            $("vehicleModel").value = record.model || "";
            $("vehicleArabicMake").value = record.arabicMake || "";
            $("vehicleArabicKeywords").value = (record.arabicKeywords || []).join("، ");
            $("vehicleYearStart").value = record.yearStart || "";
            $("vehicleYearEnd").value = record.yearEnd || "";
            $("vehicleHasOverlap").checked = record.hasOverlap === true;
            $("vehicleOverlapReason").value = record.overlapReason || "";
            fillDynamicFitments(record);
            $("deleteVehicleButton").hidden = !isOwner();
            scheduleVehicleValidation();
        } catch (error) {
            console.error(error);
            message($("vehicleFormMessage"), error.message || "تعذر فتح السجل.", "error");
        }
    }

    function closeVehicleModal() {
        $("vehicleModal").hidden = true;
        state.currentVehicle = null;
    }

    async function submitVehicle(event) {
        event.preventDefault();
        const button = $("saveVehicleButton");
        message($("vehicleFormMessage"), "");
        try {
            setBusy(button, true, isOwner() ? "جاري الحفظ..." : "جاري الإرسال...");
            await validateVehicleFormLive();
            assertVehicleFormCanSubmit();
            const payload = buildPayloadFromForm();
            const vehicleId = $("vehicleId").value || null;
            const label = `${payload.vehicle.make} ${payload.vehicle.model} ${payload.vehicle.yearStart}-${payload.vehicle.yearEnd}`;

            if (isOwner()) {
                await SmartDragonFirestore.saveVehicleRecord(vehicleId, payload);
                message($("vehicleFormMessage"), "تم الحفظ والنشر بنجاح.", "success");
            } else {
                await SmartDragonFirestore.createChangeRequest({
                    operation: vehicleId ? "update" : "create",
                    targetVehicleId: vehicleId,
                    payload,
                    vehicleLabel: label
                });
                message($("vehicleFormMessage"), "تم إرسال التعديل للمراجعة.", "success");
            }

            await loadVehicles();
            await loadStats();
            setTimeout(closeVehicleModal, 700);
        } catch (error) {
            console.error(error);
            message($("vehicleFormMessage"), error.message || "تعذر حفظ السجل.", "error");
        } finally {
            setBusy(button, false);
        }
    }

    async function deleteCurrentVehicle() {
        const id = $("vehicleId").value;
        if (!id || !isOwner()) return;
        if (!confirm("سيتم حذف السيارة وبيانات التوافق المرتبطة بها. هل أنت متأكد؟")) return;
        const button = $("deleteVehicleButton");
        try {
            setBusy(button, true, "جاري الحذف...");
            await SmartDragonFirestore.deleteVehicleRecord(id);
            closeVehicleModal();
            await loadVehicles();
            await loadStats();
        } catch (error) {
            console.error(error);
            message($("vehicleFormMessage"), error.message || "تعذر حذف السجل.", "error");
        } finally {
            setBusy(button, false);
        }
    }

    async function loadReviews() {
        $("reviewsTableBody").innerHTML = '<tr><td colspan="6"><div class="admin-empty-state"><strong>جاري التحميل...</strong></div></td></tr>';
        try {
            state.requests = await SmartDragonFirestore.listPendingChangeRequests();
            renderReviews();
        } catch (error) {
            console.error(error);
            message($("reviewsMessage"), error.message || "تعذر تحميل طلبات المراجعة.", "error");
        }
    }

    function renderReviews() {
        if (!state.requests.length) {
            $("reviewsTableBody").innerHTML = '<tr><td colspan="6"><div class="admin-empty-state"><strong>لا توجد طلبات معلقة</strong></div></td></tr>';
            $("bulkApproveButton").disabled = true;
            return;
        }

        $("reviewsTableBody").innerHTML = state.requests.map((r) => `
            <tr>
                <td>${isOwner() ? `<input type="checkbox" class="review-checkbox" value="${escapeHtml(r.id)}">` : "—"}</td>
                <td>${escapeHtml(r.vehicleLabel || r.targetVehicleId || "سجل جديد")}</td>
                <td>${r.operation === "create" ? "إضافة" : r.operation === "delete" ? "حذف" : "تعديل"}</td>
                <td>${escapeHtml(r.createdByEmail || "—")}</td>
                <td><span class="admin-badge warning">بانتظار المراجعة</span></td>
                <td>${isOwner() ? `
                    <div class="admin-row-actions">
                        <button class="admin-link-button" data-approve-request="${escapeHtml(r.id)}" type="button">اعتماد</button>
                        <button class="admin-link-button danger" data-reject-request="${escapeHtml(r.id)}" type="button">رفض</button>
                    </div>` : "بانتظار المالك"}</td>
            </tr>
        `).join("");
        updateBulkButton();
    }

    function selectedReviewIds() {
        return [...document.querySelectorAll(".review-checkbox:checked")].map((x) => x.value);
    }

    function updateBulkButton() {
        if (!isOwner()) return;
        $("bulkApproveButton").disabled = selectedReviewIds().length === 0;
    }

    async function approveRequest(id) {
        try {
            message($("reviewsMessage"), "جاري الاعتماد...", "info");
            await SmartDragonFirestore.approveChangeRequest(id);
            message($("reviewsMessage"), "تم اعتماد التعديل ونشره.", "success");
            await Promise.all([loadReviews(), loadStats()]);
        } catch (error) {
            console.error(error);
            message($("reviewsMessage"), error.message || "تعذر اعتماد الطلب.", "error");
        }
    }

    async function rejectRequest(id) {
        const reason = prompt("سبب الرفض (اختياري):", "");
        if (reason === null) return;
        try {
            await SmartDragonFirestore.rejectChangeRequest(id, reason);
            message($("reviewsMessage"), "تم رفض الطلب.", "success");
            await Promise.all([loadReviews(), loadStats()]);
        } catch (error) {
            console.error(error);
            message($("reviewsMessage"), error.message || "تعذر رفض الطلب.", "error");
        }
    }

    async function bulkApprove() {
        const ids = selectedReviewIds();
        if (!ids.length || !confirm(`اعتماد ${ids.length} طلب/طلبات؟`)) return;
        const button = $("bulkApproveButton");
        try {
            setBusy(button, true, "جاري الاعتماد...");
            await SmartDragonFirestore.bulkApproveChanges(ids);
            message($("reviewsMessage"), `تم اعتماد ${ids.length} طلب/طلبات.`, "success");
            await Promise.all([loadReviews(), loadStats()]);
        } catch (error) {
            console.error(error);
            message($("reviewsMessage"), error.message || "تعذر الاعتماد الجماعي.", "error");
        } finally {
            setBusy(button, false);
        }
    }

    async function importLegacy() {
        if (!isOwner()) return;
        if (!confirm("سيتم استيراد البيانات الحالية من data/vehicles.json إلى Firestore. يمكن تشغيل العملية مرة أخرى بدون إنشاء نسخ مكررة للسجلات القديمة. متابعة؟")) return;
        const button = $("importLegacyButton");
        try {
            setBusy(button, true, "جاري الاستيراد...");
            message($("dashboardMessage"), "جاري تحميل ملف البيانات...", "info");
            const response = await fetch("../data/vehicles.json", { cache: "no-store" });
            if (!response.ok) throw new Error(`تعذر تحميل vehicles.json (HTTP ${response.status}).`);
            const records = await response.json();
            const count = await SmartDragonFirestore.importLegacyVehicles(records);
            message($("dashboardMessage"), `تم استيراد/تحديث ${count} سجل بنجاح.`, "success");
            await loadStats();
        } catch (error) {
            console.error(error);
            message($("dashboardMessage"), error.message || "تعذر استيراد البيانات.", "error");
        } finally {
            setBusy(button, false);
        }
    }

    function normalizeCategorySlug(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9_-]/g, "")
            .replace(/-+/g, "-")
            .slice(0, 80);
    }

    async function loadCategories() {
        message($("categoriesMessage"), "");
        try {
            state.categories = await SmartDragonFirestore.getCategories();
            renderCategories();
            renderDynamicFitmentSections();
            $("addCategoryButton").hidden = !isOwner();
        } catch (error) {
            console.error(error);
            message($("categoriesMessage"), error.message || "تعذر تحميل الأصناف.", "error");
        }
    }

    function renderCategories() {
        const body = $("categoriesTableBody");
        if (!body) return;
        if (!state.categories.length) {
            body.innerHTML = '<tr><td colspan="5"><div class="admin-empty-state"><strong>لا توجد أصناف</strong><span>سيتم إنشاء الأصناف الأساسية تلقائيًا للمالك، أو يمكنك إضافة صنف جديد.</span></div></td></tr>';
            return;
        }
        body.innerHTML = state.categories.map((category) => `
            <tr>
                <td>${escapeHtml(category.name)}</td>
                <td><code>${escapeHtml(category.slug)}</code></td>
                <td>${categoryFieldDefinitions(category).length}</td>
                <td><span class="admin-badge ${category.active === false ? "neutral" : "approved"}">${category.active === false ? "غير فعال" : "فعال"}</span></td>
                <td>${isOwner() ? `<button class="admin-link-button" type="button" data-edit-category="${escapeHtml(category.slug)}">تعديل</button>` : "عرض فقط"}</td>
            </tr>
        `).join("");
    }

    function categoryFieldRow(field = {}) {
        const type = field.type || "text";
        return `<div class="admin-category-field-row">
            <input data-category-field="key" value="${escapeHtml(field.key || "")}" placeholder="key مثل oilGrade" maxlength="80">
            <input data-category-field="label" value="${escapeHtml(field.label || "")}" placeholder="اسم الحقل بالعربي" maxlength="120">
            <select data-category-field="type">
                <option value="text" ${type === "text" ? "selected" : ""}>نص</option>
                <option value="number" ${type === "number" ? "selected" : ""}>رقم</option>
                <option value="bulb" ${type === "bulb" ? "selected" : ""}>كود لمبة</option>
            </select>
            <input data-category-field="unit" value="${escapeHtml(field.unit || "")}" placeholder="الوحدة (اختياري)" maxlength="30">
            <input data-category-field="placeholder" value="${escapeHtml(field.placeholder || "")}" placeholder="مثال / تلميح" maxlength="150">
            <button class="admin-icon-button danger" type="button" data-remove-category-field aria-label="حذف الحقل">×</button>
        </div>`;
    }

    function addCategoryField(field = {}) {
        $("categoryFieldsBuilder").insertAdjacentHTML("beforeend", categoryFieldRow(field));
    }

    function openCategoryModal(slug = null) {
        if (!isOwner()) return;
        state.editingCategorySlug = slug;
        $("categoryForm").reset();
        $("categoryFieldsBuilder").innerHTML = "";
        message($("categoryFormMessage"), "");
        const category = slug ? state.categories.find((item) => item.slug === slug || item.id === slug) : null;
        $("categoryModalTitle").textContent = category ? "تعديل الصنف" : "إضافة صنف";
        $("categoryName").value = category?.name || "";
        $("categorySlug").value = category?.slug || "";
        $("categorySlug").disabled = Boolean(category);
        $("categoryActive").checked = category ? category.active !== false : true;
        (categoryFieldDefinitions(category).length ? categoryFieldDefinitions(category) : [{}]).forEach(addCategoryField);
        $("categoryModal").hidden = false;
    }

    function closeCategoryModal() {
        $("categoryModal").hidden = true;
        state.editingCategorySlug = null;
    }

    function collectCategoryFields() {
        const rows = [...document.querySelectorAll(".admin-category-field-row")];
        const seen = new Set();
        return rows.map((row) => {
            const value = (name) => normalizeInputValue(row.querySelector(`[data-category-field="${name}"]`)?.value || "");
            const key = value("key").replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "").slice(0, 80);
            const label = value("label");
            const type = value("type") || "text";
            if (!key && !label) return null;
            if (!key || !label) throw new Error("كل حقل يحتاج key واسم ظاهر.");
            if (seen.has(key)) throw new Error(`الحقل ${key} مكرر داخل الصنف.`);
            seen.add(key);
            return {
                key,
                label,
                type: ["text", "number", "bulb"].includes(type) ? type : "text",
                unit: value("unit") || null,
                placeholder: value("placeholder") || null
            };
        }).filter(Boolean);
    }

    async function submitCategory(event) {
        event.preventDefault();
        if (!isOwner()) return;
        const button = $("saveCategoryButton");
        try {
            setBusy(button, true, "جاري الحفظ...");
            const name = normalizeInputValue($("categoryName").value);
            const slug = state.editingCategorySlug || normalizeCategorySlug($("categorySlug").value);
            if (!name || !slug) throw new Error("اسم الصنف وslug مطلوبان.");
            const fieldsDefinition = collectCategoryFields();
            if (!fieldsDefinition.length) throw new Error("أضف حقلًا واحدًا على الأقل للصنف.");
            await SmartDragonFirestore.createCategory({
                name,
                slug,
                active: $("categoryActive").checked,
                fieldsDefinition
            });
            message($("categoryFormMessage"), "تم حفظ الصنف.", "success");
            await Promise.all([loadCategories(), loadStats()]);
            setTimeout(closeCategoryModal, 500);
        } catch (error) {
            console.error(error);
            message($("categoryFormMessage"), error.message || "تعذر حفظ الصنف.", "error");
        } finally {
            setBusy(button, false);
        }
    }


    async function loadUsers() {
        if (!isOwner()) return;
        message($("usersMessage"), "");
        $("usersTableBody").innerHTML = '<tr><td colspan="6"><div class="admin-empty-state"><strong>جاري التحميل...</strong></div></td></tr>';
        try {
            state.users = await SmartDragonFirestore.listManagedUsers();
            renderUsers();
        } catch (error) {
            console.error(error);
            $("usersTableBody").innerHTML = '<tr><td colspan="6"><div class="admin-empty-state"><strong>تعذر تحميل المستخدمين</strong></div></td></tr>';
            message($("usersMessage"), error.message || "تعذر تحميل المستخدمين.", "error");
        }
    }

    function renderUsers() {
        const body = $("usersTableBody");
        if (!body) return;

        const ownerRow = `
            <tr>
                <td>Smart Dragon Owner</td>
                <td dir="ltr">smartdragonjordan@gmail.com</td>
                <td><span class="admin-badge approved">Owner</span></td>
                <td><span class="admin-badge approved">فعال</span></td>
                <td>مسجل</td>
                <td>محمي</td>
            </tr>`;

        const rows = state.users.map((user) => {
            const activeLabel = user.enabled ? "فعال" : "معطل";
            const activeClass = user.enabled ? "approved" : "neutral";
            const joinedLabel = user.joined ? "مسجل" : "بانتظار أول دخول";
            const actionLabel = user.enabled ? "تعطيل" : "تفعيل";
            const actionAttr = user.joined
                ? `data-toggle-user="${escapeHtml(user.uid)}" data-next-enabled="${user.enabled ? "false" : "true"}`
                : `data-toggle-invite="${escapeHtml(user.email)}" data-next-enabled="${user.enabled ? "false" : "true"}`;
            return `
                <tr>
                    <td>${escapeHtml(user.displayName || "—")}</td>
                    <td dir="ltr">${escapeHtml(user.email)}</td>
                    <td><span class="admin-badge">Editor</span></td>
                    <td><span class="admin-badge ${activeClass}">${activeLabel}</span></td>
                    <td>${joinedLabel}</td>
                    <td><button class="admin-link-button ${user.enabled ? "danger" : ""}" type="button" ${actionAttr}>${actionLabel}</button></td>
                </tr>`;
        }).join("");

        body.innerHTML = ownerRow + (rows || '<tr><td colspan="6"><div class="admin-empty-state"><strong>لا يوجد محررون بعد</strong></div></td></tr>');
    }

    function openUserModal() {
        if (!isOwner()) return;
        $("userForm").reset();
        message($("userFormMessage"), "");
        $("userModal").hidden = false;
        setTimeout(() => $("userInviteEmail")?.focus(), 0);
    }

    function closeUserModal() {
        $("userModal").hidden = true;
    }

    async function submitUserInvite(event) {
        event.preventDefault();
        if (!isOwner()) return;
        const button = $("saveUserButton");
        try {
            setBusy(button, true, "جاري الحفظ...");
            const email = normalizeInputValue($("userInviteEmail").value).toLowerCase();
            const displayName = normalizeInputValue($("userDisplayName").value);
            await SmartDragonFirestore.createEditorInvite(email, displayName);
            message($("userFormMessage"), "تمت إضافة الدعوة. يستطيع المستخدم الآن تسجيل الدخول بحساب Google نفسه.", "success");
            await Promise.all([loadUsers(), loadStats()]);
            setTimeout(closeUserModal, 700);
        } catch (error) {
            console.error(error);
            message($("userFormMessage"), error.message || "تعذر إضافة المستخدم.", "error");
        } finally {
            setBusy(button, false);
        }
    }

    async function toggleManagedUser(kind, id, nextEnabled) {
        if (!isOwner()) return;
        const enabled = nextEnabled === true || nextEnabled === "true";
        try {
            message($("usersMessage"), enabled ? "جاري التفعيل..." : "جاري التعطيل...", "info");
            if (kind === "user") {
                await SmartDragonFirestore.setUserEnabled(id, enabled);
            } else {
                await SmartDragonFirestore.setInviteEnabled(id, enabled);
            }
            message($("usersMessage"), enabled ? "تم تفعيل المستخدم." : "تم تعطيل المستخدم.", "success");
            await Promise.all([loadUsers(), loadStats()]);
        } catch (error) {
            console.error(error);
            message($("usersMessage"), error.message || "تعذر تحديث حالة المستخدم.", "error");
        }
    }

    function bindEvents() {
        $("googleSignInButton").addEventListener("click", async () => {
            const button = $("googleSignInButton");
            try {
                setBusy(button, true, "جاري تسجيل الدخول...");
                message($("loginMessage"), "");
                const result = await SmartDragonAuth.signInWithGoogle();
                if (result?.redirecting) return;
                await handleSignedIn(result.profile);
            } catch (error) {
                console.error(error);
                message($("loginMessage"), error.message || "تعذر تسجيل الدخول.", "error");
            } finally {
                setBusy(button, false);
            }
        });

        $("signOutButton").addEventListener("click", async () => {
            await SmartDragonAuth.signOut();
            state.profile = null;
            showLogin("تم تسجيل الخروج.");
        });

        document.querySelectorAll(".admin-nav-item[data-view]").forEach((button) => {
            button.addEventListener("click", () => switchView(button.dataset.view));
        });

        $("vehicleSearchInput").addEventListener("input", renderVehicles);
        $("toggleOverlapOverviewButton").addEventListener("click", () => {
            state.overlapOverviewOpen = !state.overlapOverviewOpen;
            renderOverlapOverview();
        });
        $("addVehicleButton").addEventListener("click", () => openVehicleModal());
        $("vehicleForm").addEventListener("submit", submitVehicle);
        [
            "vehicleMake", "vehicleModel", "vehicleArabicMake", "vehicleArabicKeywords",
            "vehicleYearStart", "vehicleYearEnd", "vehicleHasOverlap", "vehicleOverlapReason"
        ].forEach((id) => {
            $(id).addEventListener(id === "vehicleHasOverlap" ? "change" : "input", scheduleVehicleValidation);
        });
        $("dynamicFitmentSections").addEventListener("input", scheduleVehicleValidation);
        $("deleteVehicleButton").addEventListener("click", deleteCurrentVehicle);
        $("closeVehicleModalButton").addEventListener("click", closeVehicleModal);
        document.querySelectorAll("[data-close-modal='true']").forEach((el) => el.addEventListener("click", closeVehicleModal));
        $("importLegacyButton").addEventListener("click", importLegacy);
        $("bulkApproveButton").addEventListener("click", bulkApprove);
        $("addCategoryButton").addEventListener("click", () => openCategoryModal());
        $("addUserButton").addEventListener("click", openUserModal);
        $("userForm").addEventListener("submit", submitUserInvite);
        $("closeUserModalButton").addEventListener("click", closeUserModal);
        document.querySelectorAll("[data-close-user-modal='true']").forEach((el) => el.addEventListener("click", closeUserModal));
        $("addCategoryFieldButton").addEventListener("click", () => addCategoryField());
        $("categoryForm").addEventListener("submit", submitCategory);
        $("closeCategoryModalButton").addEventListener("click", closeCategoryModal);

        $("selectAllReviews").addEventListener("change", (event) => {
            document.querySelectorAll(".review-checkbox").forEach((box) => { box.checked = event.target.checked; });
            updateBulkButton();
        });

        document.addEventListener("change", (event) => {
            if (event.target.classList.contains("review-checkbox")) updateBulkButton();
        });

        document.addEventListener("click", (event) => {
            const edit = event.target.closest("[data-edit-vehicle]");
            if (edit) openVehicleModal(edit.dataset.editVehicle);
            const approve = event.target.closest("[data-approve-request]");
            if (approve) approveRequest(approve.dataset.approveRequest);
            const reject = event.target.closest("[data-reject-request]");
            if (reject) rejectRequest(reject.dataset.rejectRequest);
            const editCategory = event.target.closest("[data-edit-category]");
            if (editCategory) openCategoryModal(editCategory.dataset.editCategory);
            const removeField = event.target.closest("[data-remove-category-field]");
            if (removeField) removeField.closest(".admin-category-field-row")?.remove();
            const toggleUser = event.target.closest("[data-toggle-user]");
            if (toggleUser) toggleManagedUser("user", toggleUser.dataset.toggleUser, toggleUser.dataset.nextEnabled);
            const toggleInvite = event.target.closest("[data-toggle-invite]");
            if (toggleInvite) toggleManagedUser("invite", toggleInvite.dataset.toggleInvite, toggleInvite.dataset.nextEnabled);
            if (event.target.matches("[data-close-category-modal='true']")) closeCategoryModal();
        });
    }

    async function handleSignedIn(profile) {
        state.profile = profile;
        if (!profile?.enabled || !["owner", "editor"].includes(profile.role)) {
            await SmartDragonAuth.signOut();
            showLogin("هذا الحساب غير مصرح له باستخدام لوحة الإدارة.");
            message($("loginMessage"), "الحساب مسجل في Google لكنه غير موجود كمحرر مصرح له.", "error");
            return;
        }
        showApp();
        if (isOwner()) {
            try {
                await SmartDragonFirestore.ensureDefaultCategories();
            } catch (error) {
                console.warn("[Smart Dragon Admin] Could not seed default categories", error);
            }
        }
        state.categories = await SmartDragonFirestore.getCategories();
        renderDynamicFitmentSections();
        await loadStats();
    }

    async function initialize() {
        bindEvents();
        try {
            const result = await SmartDragonAuth.initialize();
            if (result.user && result.profile) {
                await handleSignedIn(result.profile);
            } else {
                showLogin();
            }
        } catch (error) {
            console.error(error);
            showLogin("تعذر تهيئة Firebase Authentication.");
            message($("loginMessage"), error.message || "خطأ في تهيئة تسجيل الدخول.", "error");
        }
    }

    document.addEventListener("DOMContentLoaded", initialize);
})();

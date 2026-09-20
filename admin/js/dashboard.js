/** Smart Dragon Inventory - Admin Dashboard */
(() => {
    "use strict";

    const state = {
        profile: null,
        vehicles: [],
        requests: [],
        currentVehicle: null,
        currentView: "dashboard"
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
            reviews: ["reviewsView", "طلبات المراجعة", "اعتماد أو رفض تعديلات المحررين."]
        };

        const [id, title, subtitle] = map[view] || map.dashboard;
        $(id).classList.add("active");
        $("pageTitle").textContent = title;
        $("pageSubtitle").textContent = subtitle;

        if (view === "dashboard") loadStats();
        if (view === "vehicles") loadVehicles();
        if (view === "reviews") loadReviews();
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

    function renderVehicles() {
        const term = $("vehicleSearchInput").value.trim().toLowerCase();
        const rows = state.vehicles.filter((v) => {
            if (!term) return true;
            return `${v.make || ""} ${v.model || ""} ${v.arabicMake || ""}`.toLowerCase().includes(term);
        });

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

    function wiperValue(value) {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) return null;
        return { value: number, unit: "inch", raw: String(number) };
    }

    function buildPayloadFromForm() {
        const lightingFields = {};
        const low = parseBulbValue($("fitLowBeam").value);
        const high = parseBulbValue($("fitHighBeam").value);
        const fog = parseBulbValue($("fitFogLight").value);
        if (low) lightingFields.lowBeam = low;
        if (high) lightingFields.highBeam = high;
        if (fog) lightingFields.fogLight = fog;

        const wiperFields = {};
        const driver = wiperValue($("fitWiperDriver").value);
        const passenger = wiperValue($("fitWiperPassenger").value);
        const rear = wiperValue($("fitWiperRear").value);
        if (driver) wiperFields.driver = driver;
        if (passenger) wiperFields.passenger = passenger;
        if (rear) wiperFields.rear = rear;

        const screen = $("fitScreen").value.trim();
        const fitments = [];
        if (Object.keys(lightingFields).length) fitments.push({ categorySlug: "lighting", fields: lightingFields, source: "admin" });
        if (Object.keys(wiperFields).length) fitments.push({ categorySlug: "wipers", fields: wiperFields, source: "admin" });
        if (screen) fitments.push({ categorySlug: "screens", fields: { screen: { raw: screen, options: [], notes: screen } }, source: "admin" });

        return {
            vehicle: {
                make: $("vehicleMake").value,
                model: $("vehicleModel").value,
                arabicMake: $("vehicleArabicMake").value,
                arabicKeywords: $("vehicleArabicKeywords").value,
                yearStart: Number($("vehicleYearStart").value),
                yearEnd: Number($("vehicleYearEnd").value),
                dataQuality: "complete",
                hasOverlap: $("vehicleHasOverlap").checked
            },
            fitments
        };
    }

    function findFitment(record, slug) {
        return record?.fitments?.find((f) => (f.categoryId || f.categorySlug) === slug) || null;
    }

    function bulbText(field) {
        if (!field) return "";
        if (field.notApplicable) return "N/A";
        return field.raw || field.code || field.notes || "";
    }

    async function openVehicleModal(vehicleId = null) {
        state.currentVehicle = null;
        $("vehicleForm").reset();
        $("vehicleId").value = vehicleId || "";
        $("deleteVehicleButton").hidden = true;
        message($("vehicleFormMessage"), "");

        if (!vehicleId) {
            $("vehicleModalTitle").textContent = "إضافة سيارة";
            $("vehicleModalHint").textContent = isOwner() ? "سيتم نشر السجل مباشرة بعد الحفظ." : "سيتم إرسال السجل للمالك للمراجعة.";
            $("vehicleModal").hidden = false;
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

            const lighting = findFitment(record, "lighting")?.fields || {};
            $("fitLowBeam").value = bulbText(lighting.lowBeam);
            $("fitHighBeam").value = bulbText(lighting.highBeam);
            $("fitFogLight").value = bulbText(lighting.fogLight);

            const wipers = findFitment(record, "wipers")?.fields || {};
            $("fitWiperDriver").value = wipers.driver?.value ?? "";
            $("fitWiperPassenger").value = wipers.passenger?.value ?? "";
            $("fitWiperRear").value = wipers.rear?.value ?? "";

            const screens = findFitment(record, "screens")?.fields || {};
            $("fitScreen").value = screens.screen?.raw || screens.screen?.notes || "";
            $("deleteVehicleButton").hidden = !isOwner();
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
        $("addVehicleButton").addEventListener("click", () => openVehicleModal());
        $("vehicleForm").addEventListener("submit", submitVehicle);
        $("deleteVehicleButton").addEventListener("click", deleteCurrentVehicle);
        $("closeVehicleModalButton").addEventListener("click", closeVehicleModal);
        document.querySelectorAll("[data-close-modal='true']").forEach((el) => el.addEventListener("click", closeVehicleModal));
        $("importLegacyButton").addEventListener("click", importLegacy);
        $("bulkApproveButton").addEventListener("click", bulkApprove);

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

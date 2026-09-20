/**
 * Smart Dragon Inventory
 * Firestore Data Layer
 */

(() => {
    "use strict";

    let approvedVehiclesCache = null;

    function cfg() {
        return window.SmartDragonFirebaseConfig;
    }

    function assertFirestoreReady() {
        if (!cfg()?.enabled || !cfg()?.projectConfigured || !window.firebase) {
            throw new Error("Firestore is not configured.");
        }

        if (!firebase.apps.length) {
            firebase.initializeApp(cfg().config);
        }
    }

    function db() {
        assertFirestoreReady();
        return firebase.firestore();
    }

    function col(name) {
        return cfg()?.collections?.[name] || name;
    }

    function authContext() {
        const user = window.SmartDragonAuth?.getCurrentUser?.();
        const profile = window.SmartDragonAuth?.getCurrentUserProfile?.();
        if (!user || !profile?.enabled) {
            throw new Error("يجب تسجيل الدخول بحساب مصرح له.");
        }
        return { user, profile };
    }

    function isOwner() {
        return window.SmartDragonAuth?.isOwner?.() === true;
    }

    function cleanText(value, max = 200) {
        return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
    }

    function vehicleKey(value, max = 150) {
        return cleanText(value, max).normalize("NFKC").toLocaleLowerCase("en");
    }

    function vehicleIdentityKey(vehicle) {
        return [
            vehicleKey(vehicle?.make, 100),
            vehicleKey(vehicle?.model, 150),
            Number(vehicle?.yearStart),
            Number(vehicle?.yearEnd)
        ].join("|");
    }

    function yearRangesOverlap(aStart, aEnd, bStart, bEnd) {
        return Number(aStart) <= Number(bEnd) && Number(bStart) <= Number(aEnd);
    }

    function describeVehicleConflict(vehicle) {
        return `${cleanText(vehicle.make, 100)} ${cleanText(vehicle.model, 150)} ${Number(vehicle.yearStart)}-${Number(vehicle.yearEnd)}`.trim();
    }

    function validateVehiclePayload(payload) {
        const make = cleanText(payload?.make, 100);
        const model = cleanText(payload?.model, 150);
        const arabicMake = cleanText(payload?.arabicMake, 100);
        const yearStart = Number(payload?.yearStart);
        const yearEnd = Number(payload?.yearEnd);

        if (!make || !model) {
            throw new Error("الشركة والموديل مطلوبان.");
        }

        if (!Number.isInteger(yearStart) || !Number.isInteger(yearEnd)) {
            throw new Error("سنة البداية والنهاية يجب أن تكونا أرقامًا صحيحة.");
        }

        if (yearStart < 1950 || yearEnd > 2100 || yearStart > yearEnd) {
            throw new Error("نطاق السنوات غير صالح.");
        }

        const arabicKeywords = Array.isArray(payload?.arabicKeywords)
            ? payload.arabicKeywords.map((x) => cleanText(x, 80)).filter(Boolean).slice(0, 20)
            : cleanText(payload?.arabicKeywords, 500)
                .split(/[,،]/)
                .map((x) => cleanText(x, 80))
                .filter(Boolean)
                .slice(0, 20);

        return {
            make,
            model,
            arabicMake,
            arabicKeywords,
            yearStart,
            yearEnd,
            dataQuality: cleanText(payload?.dataQuality || "complete", 30),
            hasOverlap: payload?.hasOverlap === true,
            overlapReason: cleanText(payload?.overlapReason, 500)
        };
    }

    function normalizeFitments(fitments) {
        if (!Array.isArray(fitments)) return [];
        return fitments
            .filter((item) => item && typeof item === "object")
            .map((item) => ({
                categorySlug: cleanText(item.categorySlug, 80),
                fields: item.fields && typeof item.fields === "object" ? item.fields : {},
                notes: cleanText(item.notes, 500) || null,
                source: cleanText(item.source || "admin", 80)
            }))
            .filter((item) => item.categorySlug);
    }

    function vehicleFromSnapshot(snapshot) {
        return { id: snapshot.id, ...snapshot.data() };
    }

    async function loadApprovedVehicles(force = false) {
        if (!force && approvedVehiclesCache) {
            return approvedVehiclesCache;
        }

        const snapshot = await db().collection(col("vehicles"))
            .where("status", "==", "approved")
            .get();

        approvedVehiclesCache = snapshot.docs
            .map(vehicleFromSnapshot)
            .sort((a, b) => `${a.make || ""} ${a.model || ""}`.localeCompare(`${b.make || ""} ${b.model || ""}`));

        return approvedVehiclesCache;
    }

    function clearPublicVehicleCache() {
        approvedVehiclesCache = null;
    }

    async function getVehicleMakes() {
        const vehicles = await loadApprovedVehicles();
        return [...new Set(vehicles.map((v) => cleanText(v.make)).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
    }

    async function getVehicleModels(make) {
        const makeKey = cleanText(make, 100);
        const vehicles = await loadApprovedVehicles();
        return [...new Set(vehicles
            .filter((v) => cleanText(v.make, 100) === makeKey)
            .map((v) => cleanText(v.model))
            .filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
    }

    async function getVehicleYears(make, model) {
        const makeKey = cleanText(make, 100);
        const modelKey = cleanText(model, 150);
        const vehicles = await loadApprovedVehicles();
        const years = new Set();

        vehicles.forEach((data) => {
            if (cleanText(data.make, 100) !== makeKey || cleanText(data.model, 150) !== modelKey) return;
            const start = Number(data.yearStart);
            const end = Number(data.yearEnd);
            if (!Number.isInteger(start) || !Number.isInteger(end)) return;
            for (let y = start; y <= end; y += 1) years.add(y);
        });

        return [...years].sort((a, b) => b - a);
    }

    async function findVehicleMatches(make, model, year) {
        const y = Number(year);
        const makeKey = cleanText(make, 100);
        const modelKey = cleanText(model, 150);
        if (!Number.isInteger(y)) return [];

        const vehicles = await loadApprovedVehicles();
        return vehicles.filter((v) =>
            cleanText(v.make, 100) === makeKey &&
            cleanText(v.model, 150) === modelKey &&
            y >= Number(v.yearStart) &&
            y <= Number(v.yearEnd)
        );
    }

    async function getVehicleFitment(make, model, year) {
        const matches = await findVehicleMatches(make, model, year);
        if (matches.length !== 1) return null;
        return getVehicleRecord(matches[0].id);
    }

    async function getAccessoriesLink(make, model) {
        const snapshot = await db().collection(col("accessoryLinks"))
            .where("car", "==", cleanText(make, 100))
            .where("model", "==", cleanText(model, 150))
            .limit(1)
            .get();

        if (snapshot.empty) return null;
        return cleanText(snapshot.docs[0].data().url, 1000) || null;
    }

    async function checkVehicleConflicts(vehicleId, payload) {
        authContext();
        const vehicle = validateVehiclePayload(payload?.vehicle || payload);
        const currentId = vehicleId ? String(vehicleId) : null;
        const makeKey = vehicleKey(vehicle.make, 100);
        const modelKey = vehicleKey(vehicle.model, 150);

        // IMPORTANT: conflict detection must inspect ALL vehicle documents, not only
        // approved ones. This prevents duplicates from slipping through when an old
        // imported record has a missing/different status value.
        const snapshot = await db().collection(col("vehicles")).get();

        const duplicates = [];
        const overlaps = [];
        const wantedIdentity = vehicleIdentityKey(vehicle);

        snapshot.docs.forEach((doc) => {
            if (doc.id === currentId) return;
            const other = { id: doc.id, ...doc.data() };
            if (vehicleKey(other.make, 100) !== makeKey || vehicleKey(other.model, 150) !== modelKey) return;

            const otherStart = Number(other.yearStart);
            const otherEnd = Number(other.yearEnd);
            if (!Number.isInteger(otherStart) || !Number.isInteger(otherEnd)) return;

            const exact =
                vehicleIdentityKey(other) === wantedIdentity ||
                (otherStart === vehicle.yearStart && otherEnd === vehicle.yearEnd);
            if (exact) {
                duplicates.push({
                    id: doc.id,
                    label: describeVehicleConflict(other),
                    yearStart: otherStart,
                    yearEnd: otherEnd
                });
                return;
            }

            if (yearRangesOverlap(vehicle.yearStart, vehicle.yearEnd, otherStart, otherEnd)) {
                overlaps.push({
                    id: doc.id,
                    label: describeVehicleConflict(other),
                    yearStart: otherStart,
                    yearEnd: otherEnd
                });
            }
        });

        return {
            valid: duplicates.length === 0 && overlaps.length === 0,
            duplicates,
            overlaps
        };
    }

    async function listVehicles(options = {}) {
        authContext();
        const snapshot = await db().collection(col("vehicles")).limit(Number(options.limit) || 300).get();
        return snapshot.docs
            .map(vehicleFromSnapshot)
            .sort((a, b) => `${a.make || ""} ${a.model || ""}`.localeCompare(`${b.make || ""} ${b.model || ""}`));
    }

    async function getVehicleRecord(vehicleId) {
        const vehicleRef = db().collection(col("vehicles")).doc(String(vehicleId));
        const vehicleSnap = await vehicleRef.get();
        if (!vehicleSnap.exists) return null;

        const fitmentSnap = await db().collection(col("vehicleFitments"))
            .where("vehicleId", "==", vehicleRef.id)
            .where("status", "==", "approved")
            .get();

        const fitments = fitmentSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        return { id: vehicleRef.id, ...vehicleSnap.data(), fitments };
    }

    async function saveVehicleRecord(vehicleId, payload) {
        const { user } = authContext();
        if (!isOwner()) throw new Error("الحفظ المباشر متاح للمالك فقط.");

        const vehicle = validateVehiclePayload(payload?.vehicle || payload);
        const fitments = normalizeFitments(payload?.fitments || []);
        if (!fitments.length) {
            throw new Error("أدخل بيانات توافق واحدة على الأقل قبل الحفظ.");
        }

        const conflicts = await checkVehicleConflicts(vehicleId, vehicle);
        if (conflicts.duplicates.length) {
            throw new Error(`يوجد سجل مكرر مطابق لنفس الشركة والموديل ونطاق السنوات: ${conflicts.duplicates[0].label}`);
        }
        if (conflicts.overlaps.length && vehicle.hasOverlap !== true) {
            throw new Error(`يوجد تداخل في السنوات مع: ${conflicts.overlaps.map((x) => x.label).join("، ")}. راجع النطاق أو فعّل خيار التداخل المعروف إذا كان مقصودًا.`);
        }
        if (conflicts.overlaps.length && vehicle.hasOverlap === true && !vehicle.overlapReason) {
            throw new Error("اكتب سبب التداخل المقصود قبل الحفظ.");
        }

        vehicle.hasOverlap = conflicts.overlaps.length > 0 && vehicle.hasOverlap === true;
        if (!vehicle.hasOverlap) vehicle.overlapReason = "";

        const database = db();
        const vehicleRef = vehicleId
            ? database.collection(col("vehicles")).doc(String(vehicleId))
            : database.collection(col("vehicles")).doc();

        const batch = database.batch();
        const now = firebase.firestore.FieldValue.serverTimestamp();
        const previous = await vehicleRef.get();

        batch.set(vehicleRef, {
            ...vehicle,
            identityKey: vehicleIdentityKey(vehicle),
            status: "approved",
            createdAt: previous.exists ? (previous.data().createdAt || now) : now,
            createdBy: previous.exists ? (previous.data().createdBy || user.uid) : user.uid,
            updatedAt: now,
            updatedBy: user.uid,
            approvedAt: now,
            approvedBy: user.uid
        }, { merge: true });

        if (conflicts.overlaps.length && vehicle.hasOverlap === true) {
            conflicts.overlaps.forEach((conflict) => {
                batch.set(database.collection(col("vehicles")).doc(conflict.id), {
                    hasOverlap: true,
                    updatedAt: now,
                    updatedBy: user.uid
                }, { merge: true });
            });
        }

        const oldFitments = await database.collection(col("vehicleFitments"))
            .where("vehicleId", "==", vehicleRef.id)
            .get();
        oldFitments.docs.forEach((doc) => batch.delete(doc.ref));

        fitments.forEach((fitment) => {
            const fitRef = database.collection(col("vehicleFitments"))
                .doc(`${vehicleRef.id}_${fitment.categorySlug}`);
            batch.set(fitRef, {
                vehicleId: vehicleRef.id,
                categoryId: fitment.categorySlug,
                fields: fitment.fields,
                notes: fitment.notes,
                source: fitment.source,
                status: "approved",
                createdAt: now,
                createdBy: user.uid,
                updatedAt: now,
                updatedBy: user.uid
            });
        });

        await batch.commit();
        clearPublicVehicleCache();
        await writeAudit("vehicle_saved", vehicleRef.id, { fitmentCount: fitments.length });
        return vehicleRef.id;
    }

    async function deleteVehicleRecord(vehicleId) {
        const { user } = authContext();
        if (!isOwner()) throw new Error("الحذف متاح للمالك فقط.");
        const database = db();
        const vehicleRef = database.collection(col("vehicles")).doc(String(vehicleId));
        const fitmentSnap = await database.collection(col("vehicleFitments"))
            .where("vehicleId", "==", vehicleRef.id)
            .get();
        const batch = database.batch();
        fitmentSnap.docs.forEach((doc) => batch.delete(doc.ref));
        batch.delete(vehicleRef);
        await batch.commit();
        clearPublicVehicleCache();
        await writeAudit("vehicle_deleted", vehicleRef.id, { deletedBy: user.uid });
    }

    async function createChangeRequest(changeRequest) {
        const { user, profile } = authContext();
        const operation = ["create", "update", "delete"].includes(changeRequest?.operation)
            ? changeRequest.operation
            : "update";

        if (operation === "delete" && profile.role !== "owner") {
            throw new Error("المحرر لا يستطيع طلب الحذف من هذه النسخة.");
        }

        const payload = operation === "delete"
            ? null
            : {
                vehicle: validateVehiclePayload(changeRequest?.payload?.vehicle || {}),
                fitments: normalizeFitments(changeRequest?.payload?.fitments || [])
            };

        if (payload && !payload.fitments.length) {
            throw new Error("أدخل بيانات توافق واحدة على الأقل قبل إرسال الطلب.");
        }

        if (payload) {
            const conflicts = await checkVehicleConflicts(changeRequest?.targetVehicleId || null, payload.vehicle);
            if (conflicts.duplicates.length) {
                throw new Error(`يوجد سجل مكرر مطابق: ${conflicts.duplicates[0].label}`);
            }
            if (conflicts.overlaps.length && payload.vehicle.hasOverlap !== true) {
                throw new Error(`يوجد تداخل في السنوات مع: ${conflicts.overlaps.map((x) => x.label).join("، ")}. راجع النطاق أو فعّل خيار التداخل المعروف إذا كان مقصودًا.`);
            }
            if (conflicts.overlaps.length && payload.vehicle.hasOverlap === true && !payload.vehicle.overlapReason) {
                throw new Error("اكتب سبب التداخل المقصود قبل إرسال الطلب للمراجعة.");
            }
            payload.vehicle.hasOverlap = conflicts.overlaps.length > 0 && payload.vehicle.hasOverlap === true;
            if (!payload.vehicle.hasOverlap) payload.vehicle.overlapReason = "";
        }

        const ref = await db().collection(col("changeRequests")).add({
            operation,
            targetVehicleId: cleanText(changeRequest?.targetVehicleId, 150) || null,
            payload,
            vehicleLabel: cleanText(changeRequest?.vehicleLabel, 250),
            status: "pending_review",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdByUid: user.uid,
            createdByEmail: cleanText(user.email, 200),
            createdByRole: profile.role
        });

        return ref.id;
    }

    async function listPendingChangeRequests() {
        authContext();
        const snapshot = await db().collection(col("changeRequests"))
            .where("status", "==", "pending_review")
            .limit(200)
            .get();
        return snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    }

    async function approveChangeRequest(requestId) {
        const { user } = authContext();
        if (!isOwner()) throw new Error("الاعتماد متاح للمالك فقط.");

        const requestRef = db().collection(col("changeRequests")).doc(String(requestId));
        const snap = await requestRef.get();
        if (!snap.exists) throw new Error("طلب المراجعة غير موجود.");
        const request = snap.data();
        if (request.status !== "pending_review") throw new Error("تمت معالجة الطلب سابقًا.");

        let targetId = request.targetVehicleId || null;
        if (request.operation === "delete") {
            if (!targetId) throw new Error("طلب الحذف لا يحتوي على سجل مستهدف.");
            await deleteVehicleRecord(targetId);
        } else {
            targetId = await saveVehicleRecord(targetId, request.payload || {});
        }

        await requestRef.update({
            status: "approved",
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedByUid: user.uid,
            resultVehicleId: targetId
        });

        await writeAudit("change_request_approved", requestRef.id, { targetVehicleId: targetId });
        return targetId;
    }

    async function rejectChangeRequest(requestId, reason = "") {
        const { user } = authContext();
        if (!isOwner()) throw new Error("الرفض متاح للمالك فقط.");
        await db().collection(col("changeRequests")).doc(String(requestId)).update({
            status: "rejected",
            rejectionReason: cleanText(reason, 500),
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            rejectedByUid: user.uid
        });
        await writeAudit("change_request_rejected", String(requestId), { reason: cleanText(reason, 500) });
    }

    async function bulkApproveChanges(requestIds) {
        const ids = Array.from(new Set((requestIds || []).map(String))).slice(0, 50);
        const results = [];
        for (const id of ids) {
            results.push(await approveChangeRequest(id));
        }
        return results;
    }

    async function getCategories() {
        const snapshot = await db().collection(col("categories")).orderBy("name").get();
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }

    async function createCategory(category) {
        authContext();
        if (!isOwner()) throw new Error("إدارة الأصناف متاحة للمالك فقط.");
        const slug = cleanText(category?.slug, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
        const name = cleanText(category?.name, 120);
        if (!slug || !name) throw new Error("اسم وslug الصنف مطلوبان.");
        await db().collection(col("categories")).doc(slug).set({
            name,
            slug,
            active: category?.active !== false,
            fieldsDefinition: Array.isArray(category?.fieldsDefinition) ? category.fieldsDefinition : [],
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return slug;
    }

    async function listUsers() {
        authContext();
        if (!isOwner()) return [];
        const snapshot = await db().collection(col("users")).orderBy("email").get();
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }

    async function getDashboardStats() {
        authContext();
        const [vehicles, requests, categories] = await Promise.all([
            db().collection(col("vehicles")).get(),
            db().collection(col("changeRequests")).where("status", "==", "pending_review").get(),
            db().collection(col("categories")).get()
        ]);
        let users = { size: 0 };
        if (isOwner()) users = await db().collection(col("users")).get();
        return {
            vehicles: vehicles.size,
            pending: requests.size,
            categories: categories.size,
            users: users.size + 1
        };
    }

    async function importLegacyVehicles(records) {
        authContext();
        if (!isOwner()) throw new Error("الاستيراد متاح للمالك فقط.");
        if (!Array.isArray(records)) throw new Error("ملف البيانات غير صالح.");

        const database = db();
        const now = firebase.firestore.FieldValue.serverTimestamp();
        const user = window.SmartDragonAuth.getCurrentUser();
        let written = 0;
        let batch = database.batch();
        let operations = 0;

        async function flush() {
            if (operations === 0) return;
            await batch.commit();
            batch = database.batch();
            operations = 0;
        }

        for (const record of records.slice(0, 1000)) {
            const sourceRow = Number(record?.source?.sourceRow) || (written + 1);
            const vehicleId = `legacy_${sourceRow}`;
            const vehicle = validateVehiclePayload(record?.vehicle || {});
            const vehicleRef = database.collection(col("vehicles")).doc(vehicleId);

            batch.set(vehicleRef, {
                ...vehicle,
                identityKey: vehicleIdentityKey(vehicle),
                status: "approved",
                source: record?.source || { type: "legacy_csv", sourceRow },
                createdAt: now,
                createdBy: user.uid,
                updatedAt: now,
                updatedBy: user.uid,
                approvedAt: now,
                approvedBy: user.uid
            }, { merge: true });
            operations += 1;

            normalizeFitments(record?.fitments || []).forEach((fitment) => {
                const fitRef = database.collection(col("vehicleFitments"))
                    .doc(`${vehicleId}_${fitment.categorySlug}`);
                batch.set(fitRef, {
                    vehicleId,
                    categoryId: fitment.categorySlug,
                    fields: fitment.fields,
                    notes: fitment.notes,
                    source: fitment.source || "legacy_csv",
                    status: "approved",
                    createdAt: now,
                    createdBy: user.uid,
                    updatedAt: now,
                    updatedBy: user.uid
                }, { merge: true });
                operations += 1;
            });

            written += 1;
            if (operations >= 450) await flush();
        }

        await flush();
        clearPublicVehicleCache();
        await writeAudit("legacy_import", "vehicles", { recordCount: written });
        return written;
    }

    async function writeAudit(action, targetId, details = {}) {
        const user = window.SmartDragonAuth?.getCurrentUser?.();
        if (!user || !isOwner()) return;
        try {
            await db().collection(col("auditLogs")).add({
                action: cleanText(action, 100),
                targetId: cleanText(targetId, 200),
                details,
                actorUid: user.uid,
                actorEmail: cleanText(user.email, 200),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.warn("[Smart Dragon Firestore] Audit log write failed", error);
        }
    }

    window.SmartDragonFirestore = Object.freeze({
        getVehicleMakes,
        getVehicleModels,
        getVehicleYears,
        findVehicleMatches,
        getVehicleFitment,
        clearPublicVehicleCache,
        getAccessoriesLink,
        checkVehicleConflicts,
        listVehicles,
        getVehicleRecord,
        saveVehicleRecord,
        deleteVehicleRecord,
        createChangeRequest,
        listPendingChangeRequests,
        approveChangeRequest,
        rejectChangeRequest,
        bulkApproveChanges,
        getCategories,
        createCategory,
        listUsers,
        getDashboardStats,
        importLegacyVehicles
    });
})();

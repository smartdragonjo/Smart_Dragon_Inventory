#!/usr/bin/env python3
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parent

FILES = {
    "firestore": ROOT / "js/firebase/firestore.js",
    "dashboard": ROOT / "admin/js/dashboard.js",
    "html": ROOT / "admin/index.html",
    "rules": ROOT / "firestore.rules",
}

def must_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Anchor not found: {label}")
    if text.count(old) != 1:
        raise RuntimeError(f"Anchor is not unique ({text.count(old)} matches): {label}")
    return text.replace(old, new, 1)

def backup(path: Path):
    backup_path = path.with_suffix(path.suffix + ".before-search-app-sync")
    shutil.copy2(path, backup_path)
    return backup_path

for name, path in FILES.items():
    if not path.exists():
        print(f"Missing file: {path}", file=sys.stderr)
        sys.exit(1)

fs = FILES["firestore"].read_text(encoding="utf-8")
dash = FILES["dashboard"].read_text(encoding="utf-8")
html = FILES["html"].read_text(encoding="utf-8")
rules = FILES["rules"].read_text(encoding="utf-8")

sync_code = r'''
    function searchAppSyncRef() {
        return db().collection("meta").doc("search_app_sync");
    }

    function searchVehiclePairKey(make, model) {
        return [
            vehicleKey(make, 100),
            vehicleKey(model, 150)
        ].join("|");
    }

    function validSearchAppVehicle(data) {
        const make = cleanText(data?.car || data?.make, 100);
        const model = cleanText(data?.model, 150);

        if (!make || !model || make === "-" || model === "-") {
            return null;
        }

        const universalText = `${make} ${model}`.toLocaleLowerCase("ar");

        if (
            universalText.includes("جميع السيارات") ||
            universalText.includes("كل السيارات") ||
            universalText.includes("universal")
        ) {
            return null;
        }

        return { make, model };
    }

    async function getSearchAppSyncState() {
        authContext();

        if (!isOwner()) {
            return {
                initialized: false,
                ownerOnly: true
            };
        }

        const snapshot =
            await searchAppSyncRef()
                .get({ source: "server" });

        if (!snapshot.exists) {
            return {
                initialized: false
            };
        }

        return {
            initialized:
                snapshot.data()?.initialized === true,
            ...snapshot.data()
        };
    }

    async function syncSearchAppVehicles(options = {}) {
        const { user } =
            authContext();

        if (!isOwner()) {
            throw new Error(
                "مزامنة Search App متاحة للمالك فقط."
            );
        }

        const initialize =
            options?.initialize === true;

        const stateSnapshot =
            await searchAppSyncRef()
                .get({ source: "server" });

        const initialized =
            stateSnapshot.exists &&
            stateSnapshot.data()?.initialized === true;

        if (!initialized && !initialize) {
            return {
                initialized: false,
                requiresInitialSync: true,
                scanned: 0,
                candidates: 0,
                added: 0
            };
        }

        const database =
            db();

        const [
            carsSnapshot,
            vehiclesSnapshot
        ] =
            await Promise.all([
                database
                    .collection(
                        col("accessoryLinks")
                    )
                    .get({ source: "server" }),

                database
                    .collection(
                        col("vehicles")
                    )
                    .get({ source: "server" })
            ]);

        const existingPairs =
            new Set();

        vehiclesSnapshot
            .docs
            .forEach(
                (doc) => {

                    const vehicle =
                        doc.data() || {};

                    const make =
                        cleanText(
                            vehicle.make,
                            100
                        );

                    const model =
                        cleanText(
                            vehicle.model,
                            150
                        );

                    if (!make || !model) {
                        return;
                    }

                    existingPairs.add(
                        searchVehiclePairKey(
                            make,
                            model
                        )
                    );
                }
            );

        const candidates =
            new Map();

        carsSnapshot
            .docs
            .forEach(
                (doc) => {

                    const vehicle =
                        validSearchAppVehicle(
                            doc.data() || {}
                        );

                    if (!vehicle) {
                        return;
                    }

                    const key =
                        searchVehiclePairKey(
                            vehicle.make,
                            vehicle.model
                        );

                    if (
                        existingPairs.has(key) ||
                        candidates.has(key)
                    ) {
                        return;
                    }

                    candidates.set(
                        key,
                        {
                            ...vehicle,
                            sourceId:
                                doc.id
                        }
                    );
                }
            );

        const now =
            firebase
                .firestore
                .FieldValue
                .serverTimestamp();

        const additions =
            [
                ...candidates.values()
            ];

        let written = 0;

        let batch =
            database.batch();

        let operations = 0;

        async function flush() {
            if (!operations) {
                return;
            }

            await batch.commit();

            batch =
                database.batch();

            operations = 0;
        }

        for (
            const vehicle
            of additions
        ) {

            const ref =
                database
                    .collection(
                        col("vehicles")
                    )
                    .doc(
                        `search_${vehicle.sourceId}`
                    );

            batch.set(
                ref,
                {
                    make:
                        vehicle.make,

                    model:
                        vehicle.model,

                    arabicMake:
                        "",

                    arabicKeywords:
                        [],

                    yearStart:
                        null,

                    yearEnd:
                        null,

                    status:
                        "incomplete",

                    dataQuality:
                        "incomplete",

                    hasOverlap:
                        false,

                    overlapReason:
                        "",

                    source: {
                        type:
                            "search_app",

                        collection:
                            col(
                                "accessoryLinks"
                            ),

                        sourceId:
                            vehicle.sourceId
                    },

                    syncedFromSearchApp:
                        true,

                    createdAt:
                        now,

                    createdBy:
                        user.uid,

                    updatedAt:
                        now,

                    updatedBy:
                        user.uid
                },
                {
                    merge:
                        false
                }
            );

            operations +=
                1;

            written +=
                1;

            if (
                operations >=
                400
            ) {
                await flush();
            }
        }

        await flush();

        await searchAppSyncRef()
            .set(
                {
                    initialized:
                        true,

                    lastRunAt:
                        now,

                    lastRunBy:
                        user.uid,

                    lastScannedCount:
                        carsSnapshot.size,

                    lastCandidateCount:
                        additions.length,

                    lastAddedCount:
                        written
                },
                {
                    merge:
                        true
                }
            );

        if (written) {
            clearPublicVehicleCache();
        }

        await writeAudit(
            "search_app_sync",
            "cars",
            {
                initial:
                    !initialized,

                scanned:
                    carsSnapshot.size,

                candidateCount:
                    additions.length,

                added:
                    written
            }
        );

        return {
            initialized:
                true,

            requiresInitialSync:
                false,

            scanned:
                carsSnapshot.size,

            candidates:
                additions.length,

            added:
                written
        };
    }

'''

fs = must_replace(
    fs,
    '    async function listVehicles(options = {}) {\n',
    sync_code + '    async function listVehicles(options = {}) {\n',
    "insert Search App sync functions",
)

fs = must_replace(
    fs,
    '''        return {
            vehicles: vehicles.size,
            pending,
            categories: categories.size,
            users: userCount
        };
''',
    '''        const incomplete = profile.role === "owner"
            ? vehicles.docs.filter(
                (doc) =>
                    doc.data()?.status === "incomplete"
            ).length
            : 0;

        return {
            vehicles: vehicles.size,
            incomplete,
            pending,
            categories: categories.size,
            users: userCount
        };
''',
    "dashboard incomplete count",
)

fs = must_replace(
    fs,
    '''        getAccessoriesLink,
        checkVehicleConflicts,
        listVehicles,
''',
    '''        getAccessoriesLink,
        getSearchAppSyncState,
        syncSearchAppVehicles,
        checkVehicleConflicts,
        listVehicles,
''',
    "export Search App sync API",
)

html = must_replace(
    html,
    '''                <article class="admin-stat-card"><span>السيارات</span><strong id="statVehicles">—</strong><small>السجلات في Firestore</small></article>
                <article class="admin-stat-card"><span>بانتظار المراجعة</span><strong id="statPending">—</strong><small>طلبات المحررين</small></article>
''',
    '''                <article class="admin-stat-card"><span>السيارات</span><strong id="statVehicles">—</strong><small>السجلات في Firestore</small></article>
                <article class="admin-stat-card"><span>تحتاج استكمال</span><strong id="statIncomplete">—</strong><small>قادمة من Search App ولا تظهر للعامة</small></article>
                <article class="admin-stat-card"><span>بانتظار المراجعة</span><strong id="statPending">—</strong><small>طلبات المحررين</small></article>
''',
    "add incomplete stat card",
)

html = must_replace(
    html,
    '''                    <button id="importLegacyButton" class="admin-primary-button owner-only" type="button">استيراد البيانات الحالية</button>
''',
    '''                    <div class="admin-panel-actions">
                        <button id="syncSearchAppButton" class="admin-primary-button owner-only" type="button">مزامنة سيارات Search App</button>
                        <button id="importLegacyButton" class="admin-secondary-button owner-only" type="button">استيراد البيانات الحالية</button>
                    </div>
''',
    "add Search App sync button",
)

dash = must_replace(
    dash,
    '''            $("statVehicles").textContent = stats.vehicles;
            $("statPending").textContent = stats.pending;
''',
    '''            $("statVehicles").textContent = stats.vehicles;
            $("statIncomplete").textContent = stats.incomplete ?? 0;
            $("statPending").textContent = stats.pending;
''',
    "render incomplete dashboard count",
)

dash = must_replace(
    dash,
    '''            state.vehicles = await SmartDragonFirestore.listVehicles({ limit: 500 });
''',
    '''            state.vehicles = await SmartDragonFirestore.listVehicles({ limit: 5000 });
''',
    "increase admin vehicle list limit",
)

dash = must_replace(
    dash,
    '''        state.vehicles.forEach((vehicle) => {
            const key = vehicleGroupKey(vehicle);
''',
    '''        state.vehicles.forEach((vehicle) => {
            if (
                vehicle.yearStart === null ||
                vehicle.yearEnd === null ||
                vehicle.yearStart === "" ||
                vehicle.yearEnd === "" ||
                !Number.isInteger(Number(vehicle.yearStart)) ||
                !Number.isInteger(Number(vehicle.yearEnd))
            ) {
                return;
            }

            const key = vehicleGroupKey(vehicle);
''',
    "exclude incomplete vehicles from overlap analysis",
)

dash = must_replace(
    dash,
    '''                <td>${escapeHtml(v.yearStart)}–${escapeHtml(v.yearEnd)}</td>
                <td><span class="admin-badge approved">${escapeHtml(v.status || "approved")}</span></td>
''',
    '''                <td>${v.status === "incomplete"
                    ? "غير محددة"
                    : `${escapeHtml(v.yearStart)}–${escapeHtml(v.yearEnd)}`}</td>
                <td>${v.status === "incomplete"
                    ? '<span class="admin-badge warning">يحتاج استكمال</span>'
                    : `<span class="admin-badge approved">${escapeHtml(v.status || "approved")}</span>`}</td>
''',
    "render incomplete vehicle rows",
)

sync_action = r'''
    async function syncSearchAppVehicles(initial = false, silent = false) {
        if (!isOwner()) {
            return null;
        }

        const button =
            $("syncSearchAppButton");

        try {
            if (!silent) {
                setBusy(
                    button,
                    true,
                    "جاري المزامنة..."
                );

                message(
                    $("dashboardMessage"),
                    initial
                        ? "جاري تنفيذ المزامنة الأولى مع Search App..."
                        : "جاري فحص السيارات الجديدة في Search App...",
                    "info"
                );
            }

            const result =
                await SmartDragonFirestore
                    .syncSearchAppVehicles({
                        initialize:
                            initial
                    });

            if (
                result
                    ?.requiresInitialSync
            ) {
                if (!silent) {
                    message(
                        $("dashboardMessage"),
                        "المزامنة التلقائية لم تبدأ بعد. اضغط زر مزامنة سيارات Search App لتنفيذ المزامنة الأولى.",
                        "info"
                    );
                }

                return result;
            }

            if (
                !silent ||
                result.added > 0
            ) {
                message(
                    $("dashboardMessage"),
                    result.added > 0
                        ? `تمت المزامنة: أضيفت ${result.added} سيارة جديدة كـ «تحتاج استكمال» ولن تظهر للعامة قبل استكمال بياناتها ونشرها.`
                        : "تم فحص Search App ولا توجد سيارات جديدة لإضافتها.",
                    "success"
                );
            }

            await loadStats();

            if (
                $("vehiclesView")
                    ?.classList
                    .contains("active")
            ) {
                await loadVehicles();
            }

            return result;

        } catch (error) {

            console.error(
                error
            );

            if (!silent) {
                message(
                    $("dashboardMessage"),
                    error.message ||
                        "تعذر مزامنة سيارات Search App.",
                    "error"
                );
            }

            return null;

        } finally {

            if (!silent) {
                setBusy(
                    button,
                    false
                );
            }
        }
    }

'''

dash = must_replace(
    dash,
    '    async function importLegacy() {\n',
    sync_action + '    async function importLegacy() {\n',
    "insert dashboard sync action",
)

dash = must_replace(
    dash,
    '''        $("importLegacyButton").addEventListener("click", importLegacy);
''',
    '''        $("syncSearchAppButton").addEventListener(
            "click",
            () =>
                syncSearchAppVehicles(
                    true,
                    false
                )
        );
        $("importLegacyButton").addEventListener("click", importLegacy);
''',
    "bind Search App sync button",
)

dash = must_replace(
    dash,
    '''        state.categories = await SmartDragonFirestore.getCategories();
        renderDynamicFitmentSections();
        await loadStats();
''',
    '''        state.categories = await SmartDragonFirestore.getCategories();
        renderDynamicFitmentSections();
        await loadStats();

        if (isOwner()) {
            try {
                const syncState =
                    await SmartDragonFirestore
                        .getSearchAppSyncState();

                if (
                    syncState
                        ?.initialized === true
                ) {
                    await syncSearchAppVehicles(
                        false,
                        true
                    );
                }
            } catch (error) {
                console.warn(
                    "[Smart Dragon Admin] Search App auto-sync skipped",
                    error
                );
            }
        }
''',
    "auto sync after owner login",
)

dash = must_replace(
    dash,
    '''        legacy_import: "استيراد البيانات القديمة"
''',
    '''        legacy_import: "استيراد البيانات القديمة",
        search_app_sync: "مزامنة سيارات Search App"
''',
    "audit label for Search App sync",
)

rules = must_replace(
    rules,
    '''    match /meta/makes {
      allow read: if true;
      allow create, update, delete: if isOwner();
    }

    match /cars/{carId} {
''',
    '''    match /meta/makes {
      allow read: if true;
      allow create, update, delete: if isOwner();
    }

    match /meta/search_app_sync {
      allow read, create, update, delete: if isOwner();
    }

    match /cars/{carId} {
''',
    "allow Owner to persist Search App sync state",
)

backups = []
for path in FILES.values():
    backups.append(backup(path))

FILES["firestore"].write_text(fs, encoding="utf-8", newline="\n")
FILES["dashboard"].write_text(dash, encoding="utf-8", newline="\n")
FILES["html"].write_text(html, encoding="utf-8", newline="\n")
FILES["rules"].write_text(rules, encoding="utf-8", newline="\n")

print("Search App sync patch applied successfully.")
print("Backups:")
for b in backups:
    print(f"  {b.relative_to(ROOT)}")

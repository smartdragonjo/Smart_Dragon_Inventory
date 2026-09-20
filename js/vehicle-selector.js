/**
 * Smart Dragon Inventory
 * Vehicle Selector Controller
 *
 * Public vehicle search backed by Firestore.
 * Only approved records are exposed to customers.
 */

function getSmartDragonConfig() {
    return window.SmartDragonConfig || null;
}

function getVehicleSelectorElements() {
    return {
        make: document.getElementById("vehicleMake"),
        model: document.getElementById("vehicleModel"),
        year: document.getElementById("vehicleYear"),
        searchButton: document.getElementById(
            "searchVehicleButton"
        )
    };
}

function resetSelect(
    selectElement,
    placeholder
) {
    if (!selectElement) {
        return;
    }

    selectElement.replaceChildren();

    const option =
        document.createElement("option");

    option.value = "";
    option.textContent = placeholder;

    selectElement.appendChild(option);

    selectElement.value = "";
}

function populateSelect(
    selectElement,
    values,
    placeholder
) {
    if (!selectElement) {
        return;
    }

    resetSelect(
        selectElement,
        placeholder
    );

    values.forEach((value) => {
        const option =
            document.createElement("option");

        option.value =
            String(value);

        option.textContent =
            String(value);

        selectElement.appendChild(
            option
        );
    });
}

function setControlState(
    element,
    enabled
) {
    if (!element) {
        return;
    }

    element.disabled =
        !enabled;

    element.setAttribute(
        "aria-disabled",
        String(!enabled)
    );
}

function setVehicleSelectorEnabled(
    enabled
) {
    const elements =
        getVehicleSelectorElements();

    setControlState(
        elements.make,
        enabled
    );

    setControlState(
        elements.model,
        false
    );

    setControlState(
        elements.year,
        false
    );

    setControlState(
        elements.searchButton,
        false
    );
}


/**
 * Return one category from the structured
 * local migration data.
 */
function getFitment(
    record,
    slug
) {
    const fitments =
        Array.isArray(
            record?.fitments
        )
            ? record.fitments
            : [];

    return (
        fitments.find(
            (item) =>
                (item?.categorySlug || item?.categoryId) ===
                slug
        ) || null
    );
}


/**
 * Format bulb data for the UI.
 */
function bulbValue(field) {

    if (!field) {
        return {
            value: "غير متوفر",
            tone: "muted",
            dir: "rtl"
        };
    }

    if (field.notApplicable) {
        return {
            value:
                "غير منطبق / لا يوجد",

            tone: "muted",

            dir: "rtl"
        };
    }

    if (field.code) {

        let value =
            field.code;

        if (
            Array.isArray(
                field.aliases
            ) &&
            field.aliases.length > 0
        ) {
            value +=
                ` (${field.aliases.join(", ")})`;
        }

        return {
            value,
            tone: "normal",
            dir: "ltr"
        };
    }

    const raw =
        field.raw ||
        field.notes ||
        "غير متوفر";

    return {
        value: raw,

        tone:
            field.dependsOnTrim
                ? "warning"
                : "normal",

        dir:
            /[\u0600-\u06FF]/.test(
                raw
            )
                ? "auto"
                : "ltr",

        hint:
            field.dependsOnTrim
                ? "قد تختلف حسب الفئة / Trim"
                : null
    };
}


/**
 * Format wiper data.
 */
function wiperValue(field) {

    if (!field) {
        return {
            value: "غير متوفر",
            tone: "muted",
            dir: "rtl"
        };
    }

    if (
        field.value !== null &&
        field.value !== undefined
    ) {
        return {
            value:
                `${field.value} inch`,

            tone: "normal",

            dir: "ltr"
        };
    }

    return {
        value:
            field.raw ||
            "غير متوفر",

        tone: "muted",

        dir: "auto"
    };
}


/**
 * Format screen data.
 */
function screenValue(field) {

    if (!field) {
        return {
            value: "غير متوفر",
            tone: "muted",
            dir: "rtl"
        };
    }

    return {
        value:
            field.raw ||
            field.notes ||
            "غير متوفر",

        tone: "normal",

        dir: "ltr"
    };
}


/**
 * Firestore public data provider.
 *
 * Only records with status = "approved" are visible to
 * the public UI. Firestore Security Rules enforce the same
 * rule server-side, so unpublished admin changes cannot
 * appear here.
 */
const VehicleDataProvider =
(() => {

    function api() {
        const firestore =
            window.SmartDragonFirestore;

        if (!firestore) {
            throw new Error(
                "Smart Dragon Firestore data layer is not available."
            );
        }

        return firestore;
    }


    function overlapResult(
        make,
        model,
        year,
        matches
    ) {
        return {
            vehicle: {
                make,
                model,
                year
            },

            meta: {
                hasOverlap: true,
                blockingWarning: true,
                warning:
                    "يوجد أكثر من سجل معتمد يطابق نفس السيارة والسنة. لم يتم اختيار سجل تلقائياً حتى تتم مراجعة نطاقات السنوات."
            },

            categories: [
                {
                    name: "تنبيه مراجعة",
                    items: [
                        {
                            label: "الحالة",
                            value: "تداخل يحتاج مراجعة",
                            tone: "warning",
                            dir: "rtl"
                        },
                        {
                            label: "عدد السجلات المطابقة",
                            value: matches.length,
                            tone: "warning",
                            dir: "ltr"
                        }
                    ]
                }
            ]
        };
    }


    function buildVehicleResult(
        record,
        selectedYear
    ) {
        const lighting =
            getFitment(
                record,
                "lighting"
            );

        const wipers =
            getFitment(
                record,
                "wipers"
            );

        const screens =
            getFitment(
                record,
                "screens"
            );

        const hasOverlap =
            Boolean(
                record?.hasOverlap ||
                record?.source?.hasOverlap
            );

        return {
            vehicle: {
                make: record.make,
                model: record.model,
                year: selectedYear,
                yearStart: Number(record.yearStart),
                yearEnd: Number(record.yearEnd)
            },

            meta: {
                hasOverlap,
                blockingWarning: false,
                warning:
                    hasOverlap
                        ? "يوجد تداخل مسجل في نطاق السنوات. راجع بيانات السيارة إذا ظهرت نتائج غير متوقعة."
                        : null
            },

            categories: [
                {
                    name: "اللمبات",
                    items: [
                        {
                            label: "الواطي",
                            ...bulbValue(
                                lighting?.fields?.lowBeam
                            )
                        },
                        {
                            label: "العالي",
                            ...bulbValue(
                                lighting?.fields?.highBeam
                            )
                        },
                        {
                            label: "الضباب",
                            ...bulbValue(
                                lighting?.fields?.fogLight
                            )
                        }
                    ]
                },
                {
                    name: "المساحات",
                    items: [
                        {
                            label: "جهة السائق",
                            ...wiperValue(
                                wipers?.fields?.driver
                            )
                        },
                        {
                            label: "جهة الراكب",
                            ...wiperValue(
                                wipers?.fields?.passenger
                            )
                        }
                    ]
                },
                {
                    name: "الشاشات",
                    items: [
                        {
                            label: "المقاس / النوع",
                            ...screenValue(
                                screens?.fields?.screen
                            )
                        }
                    ]
                }
            ]
        };
    }


    return Object.freeze({

        async getMakes() {
            return api().getVehicleMakes();
        },


        async getModels(make) {
            return api().getVehicleModels(make);
        },


        async getYears(make, model) {
            return api().getVehicleYears(
                make,
                model
            );
        },


        async getVehicleResult(
            make,
            model,
            year
        ) {
            const matches =
                await api().findVehicleMatches(
                    make,
                    model,
                    year
                );

            if (matches.length === 0) {
                return null;
            }

            if (matches.length > 1) {
                return overlapResult(
                    make,
                    model,
                    year,
                    matches
                );
            }

            const record =
                await api().getVehicleFitment(
                    make,
                    model,
                    year
                );

            if (!record) {
                return null;
            }

            return buildVehicleResult(
                record,
                year
            );
        },


        clearCache() {
            api().clearPublicVehicleCache?.();
        }
    });

})();


async function loadMakes() {

    const elements =
        getVehicleSelectorElements();

    try {

        const makes =
            await VehicleDataProvider
                .getMakes();

        if (makes.length === 0) {
            resetSelect(
                elements.make,
                "لا توجد بيانات منشورة"
            );

            setControlState(
                elements.make,
                false
            );

            console.warn(
                "[Smart Dragon] Firestore contains no approved vehicle records."
            );

            return;
        }

        populateSelect(
            elements.make,
            makes,
            "اختر الشركة"
        );

        setControlState(
            elements.make,
            true
        );

    } catch (error) {

        console.error(
            "[Smart Dragon] Failed to load vehicle makes.",
            error
        );

        resetSelect(
            elements.make,
            "تعذر تحميل الشركات"
        );
    }
}


async function handleMakeChange() {

    const elements =
        getVehicleSelectorElements();

    const selectedMake =
        elements.make
            ?.value || "";

    resetSelect(
        elements.model,
        "اختر الموديل"
    );

    resetSelect(
        elements.year,
        "اختر السنة"
    );

    setControlState(
        elements.model,
        false
    );

    setControlState(
        elements.year,
        false
    );

    setControlState(
        elements.searchButton,
        false
    );

    if (!selectedMake) {
        return;
    }

    try {

        const models =
            await VehicleDataProvider
                .getModels(
                    selectedMake
                );

        populateSelect(
            elements.model,
            models,
            "اختر الموديل"
        );

        setControlState(
            elements.model,
            models.length > 0
        );

    } catch (error) {

        console.error(
            "[Smart Dragon] Failed to load vehicle models.",
            error
        );
    }
}


async function handleModelChange() {

    const elements =
        getVehicleSelectorElements();

    const selectedMake =
        elements.make
            ?.value || "";

    const selectedModel =
        elements.model
            ?.value || "";

    resetSelect(
        elements.year,
        "اختر السنة"
    );

    setControlState(
        elements.year,
        false
    );

    setControlState(
        elements.searchButton,
        false
    );

    if (
        !selectedMake ||
        !selectedModel
    ) {
        return;
    }

    try {

        const years =
            await VehicleDataProvider
                .getYears(
                    selectedMake,
                    selectedModel
                );

        populateSelect(
            elements.year,
            years,
            "اختر السنة"
        );

        setControlState(
            elements.year,
            years.length > 0
        );

    } catch (error) {

        console.error(
            "[Smart Dragon] Failed to load vehicle years.",
            error
        );
    }
}


function handleYearChange() {

    const elements =
        getVehicleSelectorElements();

    const ready =
        Boolean(
            elements.make
                ?.value &&

            elements.model
                ?.value &&

            elements.year
                ?.value
        );

    setControlState(
        elements.searchButton,
        ready
    );
}


async function handleVehicleSearch() {

    const elements =
        getVehicleSelectorElements();

    const make =
        elements.make
            ?.value || "";

    const model =
        elements.model
            ?.value || "";

    const year =
        elements.year
            ?.value || "";


    if (
        !make ||
        !model ||
        !year
    ) {
        return;
    }


    const validator =
        window
            .SmartDragonValidation;


    if (
        validator &&
        (
            !validator
                .validateVehicleMake(
                    make
                ) ||

            !validator
                .validateVehicleModel(
                    model
                ) ||

            !validator
                .validateVehicleYear(
                    year
                )
        )
    ) {

        console.warn(
            "[Smart Dragon] Vehicle selection validation failed."
        );

        return;
    }


    try {

        setControlState(
            elements.searchButton,
            false
        );


        if (
            window
                .SmartDragonVehicleResults &&

            typeof window
                .SmartDragonVehicleResults
                .renderLoading ===
                "function"
        ) {

            window
                .SmartDragonVehicleResults
                .renderLoading();
        }


        const result =
            await VehicleDataProvider
                .getVehicleResult(
                    make,
                    model,
                    Number(year)
                );


        if (
            window
                .SmartDragonVehicleResults &&

            typeof window
                .SmartDragonVehicleResults
                .render ===
                "function"
        ) {

            window
                .SmartDragonVehicleResults
                .render(
                    result
                );
        }

    } catch (error) {

        console.error(
            "[Smart Dragon] Failed to load vehicle result.",
            error
        );

    } finally {

        handleYearChange();
    }
}


function attachVehicleSelectorEvents() {

    const elements =
        getVehicleSelectorElements();

    elements.make
        ?.addEventListener(
            "change",
            handleMakeChange
        );

    elements.model
        ?.addEventListener(
            "change",
            handleModelChange
        );

    elements.year
        ?.addEventListener(
            "change",
            handleYearChange
        );

    elements.searchButton
        ?.addEventListener(
            "click",
            handleVehicleSearch
        );
}


function initializeVehicleSelector() {

    const config =
        getSmartDragonConfig();

    if (!config) {

        console.error(
            "[Smart Dragon] Vehicle selector could not find application configuration."
        );

        return;
    }


    attachVehicleSelectorEvents();


    const localPreviewEnabled =
        config.APP_MODE ===
            "development" &&

        config.FEATURES
            .localDataPreview;


    const productionSearchEnabled =
        config.APP_MODE ===
            "production" &&

        config.FEATURES
            .vehicleSearch;


    if (
        !localPreviewEnabled &&
        !productionSearchEnabled
    ) {

        setVehicleSelectorEnabled(
            false
        );

        console.info(
            "[Smart Dragon] Vehicle selector is disabled."
        );

        return;
    }


    setVehicleSelectorEnabled(
        true
    );

    loadMakes();
}


window.SmartDragonVehicleSelector =
    Object.freeze({

        initialize:
            initializeVehicleSelector,

        refreshMakes:
            loadMakes,

        dataProvider:
            VehicleDataProvider
    });


document.addEventListener(
    "DOMContentLoaded",
    initializeVehicleSelector
);
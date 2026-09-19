/**
 * =========================================================
 * Smart Dragon Inventory
 * Vehicle Selector Controller
 * =========================================================
 *
 * Customer selection flow:
 *
 * Make
 *   ↓
 * Model
 *   ↓
 * Year
 *
 * Current stage:
 * - Development preview only
 * - Firebase is NOT connected
 * - Vehicle controls remain disabled
 *
 * Future stage:
 * - Makes will be loaded from approved database records
 * - Models will depend on the selected make
 * - Years will depend on approved year ranges
 */


/**
 * Get application configuration safely.
 */
function getSmartDragonConfig() {
    return window.SmartDragonConfig || null;
}


/**
 * Get selector elements.
 */
function getVehicleSelectorElements() {
    return {
        make:
            document.getElementById("vehicleMake"),

        model:
            document.getElementById("vehicleModel"),

        year:
            document.getElementById("vehicleYear"),

        searchButton:
            document.getElementById(
                "searchVehicleButton"
            )
    };
}


/**
 * Reset a select element.
 */
function resetSelect(
    selectElement,
    placeholder
) {
    if (!selectElement) {
        return;
    }

    selectElement.innerHTML = "";

    const option =
        document.createElement("option");

    option.value = "";
    option.textContent = placeholder;

    selectElement.appendChild(option);

    selectElement.value = "";
}


/**
 * Add safe options to a select.
 *
 * Important:
 * textContent is used instead of innerHTML.
 */
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

        option.value = String(value);

        option.textContent =
            String(value);

        selectElement.appendChild(option);

    });
}


/**
 * Enable or disable one field.
 */
function setControlState(
    element,
    enabled
) {
    if (!element) {
        return;
    }

    element.disabled = !enabled;

    element.setAttribute(
        "aria-disabled",
        String(!enabled)
    );
}


/**
 * Enable or disable all vehicle controls.
 */
function setVehicleSelectorEnabled(enabled) {

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
 * Future database adapter.
 *
 * This object intentionally contains stub methods.
 *
 * Later, Firebase/Firestore logic should be connected here
 * instead of being mixed directly into UI event handlers.
 */
const VehicleDataProvider = (() => {
    let recordsCache = null;

    async function loadRecords() {
        if (recordsCache) {
            return recordsCache;
        }

        const response = await fetch(
            "data/vehicles.json",
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(
                `Failed to load vehicles.json: ${response.status}`
            );
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error(
                "vehicles.json must contain an array."
            );
        }

        recordsCache = data;

        console.info(
            `[Smart Dragon] Loaded ${recordsCache.length} local vehicle records.`
        );

        return recordsCache;
    }


    function getFitment(record, slug) {
        const fitments =
            Array.isArray(record?.fitments)
                ? record.fitments
                : [];

        return (
            fitments.find(
                (item) =>
                    item?.categorySlug === slug
            ) || null
        );
    }


    function bulbValue(field) {
        if (!field) {
            return "غير متوفر";
        }

        if (field.notApplicable) {
            return "غير منطبق / لا يوجد";
        }

        if (field.code) {
            if (
                Array.isArray(field.aliases) &&
                field.aliases.length > 0
            ) {
                return `${field.code} (${field.aliases.join(", ")})`;
            }

            return field.code;
        }

        return (
            field.raw ||
            field.notes ||
            "غير متوفر"
        );
    }


    function wiperValue(field) {
        if (!field) {
            return "غير متوفر";
        }

        if (
            field.value !== null &&
            field.value !== undefined
        ) {
            return `${field.value} inch`;
        }

        return (
            field.raw ||
            "غير متوفر"
        );
    }


    function screenValue(field) {
        if (!field) {
            return "غير متوفر";
        }

        return (
            field.raw ||
            field.notes ||
            "غير متوفر"
        );
    }


    return {

        async getMakes() {
            const records =
                await loadRecords();

            return [
                ...new Set(
                    records
                        .map(
                            (record) =>
                                record?.vehicle?.make
                        )
                        .filter(Boolean)
                )
            ].sort();
        },


        async getModels(make) {
            const records =
                await loadRecords();

            return [
                ...new Set(
                    records
                        .filter(
                            (record) =>
                                record?.vehicle?.make === make
                        )
                        .map(
                            (record) =>
                                record?.vehicle?.model
                        )
                        .filter(Boolean)
                )
            ].sort();
        },


        async getYears(make, model) {
            const records =
                await loadRecords();

            const years =
                new Set();

            records
                .filter(
                    (record) =>
                        record?.vehicle?.make === make &&
                        record?.vehicle?.model === model
                )
                .forEach((record) => {
                    const start =
                        Number(
                            record.vehicle.yearStart
                        );

                    const end =
                        Number(
                            record.vehicle.yearEnd
                        );

                    if (
                        !Number.isInteger(start) ||
                        !Number.isInteger(end)
                    ) {
                        return;
                    }

                    for (
                        let year = start;
                        year <= end;
                        year += 1
                    ) {
                        years.add(year);
                    }
                });

            return [...years].sort(
                (a, b) => b - a
            );
        },


        async getVehicleResult(
            make,
            model,
            year
        ) {
            const records =
                await loadRecords();

            const matches =
                records.filter(
                    (record) => {
                        const vehicle =
                            record?.vehicle;

                        return (
                            vehicle?.make === make &&
                            vehicle?.model === model &&
                            year >= vehicle.yearStart &&
                            year <= vehicle.yearEnd
                        );
                    }
                );


            if (matches.length === 0) {
                return null;
            }


            if (matches.length > 1) {
                return {
                    vehicle: {
                        make,
                        model,
                        year
                    },

                    categories: [
                        {
                            name: "تنبيه مراجعة",

                            items: [
                                {
                                    label: "الحالة",

                                    value:
                                        "يوجد أكثر من سجل يطابق هذه السنة."
                                },

                                {
                                    label:
                                        "عدد السجلات المطابقة",

                                    value:
                                        matches.length
                                }
                            ]
                        }
                    ]
                };
            }


            const record =
                matches[0];

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


            return {
                vehicle: {
                    make:
                        record.vehicle.make,

                    model:
                        record.vehicle.model,

                    year,

                    yearStart:
                        record.vehicle.yearStart,

                    yearEnd:
                        record.vehicle.yearEnd
                },

                categories: [
                    {
                        name: "اللمبات",

                        items: [
                            {
                                label: "الواطي",

                                value:
                                    bulbValue(
                                        lighting?.fields?.lowBeam
                                    )
                            },

                            {
                                label: "العالي",

                                value:
                                    bulbValue(
                                        lighting?.fields?.highBeam
                                    )
                            },

                            {
                                label: "الضباب",

                                value:
                                    bulbValue(
                                        lighting?.fields?.fogLight
                                    )
                            }
                        ]
                    },

                    {
                        name: "المساحات",

                        items: [
                            {
                                label:
                                    "جهة السائق",

                                value:
                                    wiperValue(
                                        wipers?.fields?.driver
                                    )
                            },

                            {
                                label:
                                    "جهة الراكب",

                                value:
                                    wiperValue(
                                        wipers?.fields?.passenger
                                    )
                            }
                        ]
                    },

                    {
                        name: "الشاشات",

                        items: [
                            {
                                label:
                                    "المقاس / النوع",

                                value:
                                    screenValue(
                                        screens?.fields?.screen
                                    )
                            }
                        ]
                    }
                ]
            };
        }
    };
})();


/**
 * Load approved vehicle makes.
 */
async function loadMakes() {

    const elements =
        getVehicleSelectorElements();


    try {

        const makes =
            await VehicleDataProvider.getMakes();


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


/**
 * Handle make selection.
 */
async function handleMakeChange() {

    const elements =
        getVehicleSelectorElements();

    const selectedMake =
        elements.make?.value || "";


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
            await VehicleDataProvider.getModels(
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


/**
 * Handle model selection.
 */
async function handleModelChange() {

    const elements =
        getVehicleSelectorElements();

    const selectedMake =
        elements.make?.value || "";

    const selectedModel =
        elements.model?.value || "";


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
            await VehicleDataProvider.getYears(
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


/**
 * Handle year selection.
 */
function handleYearChange() {

    const elements =
        getVehicleSelectorElements();


    const ready =
        Boolean(
            elements.make?.value &&
            elements.model?.value &&
            elements.year?.value
        );


    setControlState(
        elements.searchButton,
        ready
    );

}


/**
 * Handle vehicle search.
 */
async function handleVehicleSearch() {

    const elements =
        getVehicleSelectorElements();


    const make =
        elements.make?.value || "";

    const model =
        elements.model?.value || "";

    const year =
        elements.year?.value || "";


    if (
        !make ||
        !model ||
        !year
    ) {
        return;
    }


    /**
     * Additional client-side validation.
     */
    const validator =
        window.SmartDragonValidation;


    if (validator) {

        if (
            !validator.validateVehicleMake(
                make
            ) ||
            !validator.validateVehicleModel(
                model
            ) ||
            !validator.validateVehicleYear(
                year
            )
        ) {

            console.warn(
                "[Smart Dragon] Vehicle selection validation failed."
            );

            return;
        }

    }


    try {

        setControlState(
            elements.searchButton,
            false
        );

        if (
    window.SmartDragonVehicleResults &&
    typeof window
        .SmartDragonVehicleResults
        .renderLoading === "function"
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


        /**
         * Result rendering is delegated to
         * vehicle-results.js
         */
        if (
            window.SmartDragonVehicleResults &&
            typeof window
                .SmartDragonVehicleResults
                .render === "function"
        ) {

            window
                .SmartDragonVehicleResults
                .render(result);

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


/**
 * Attach UI event listeners.
 */
function attachVehicleSelectorEvents() {

    const elements =
        getVehicleSelectorElements();


    elements.make?.addEventListener(
        "change",
        handleMakeChange
    );


    elements.model?.addEventListener(
        "change",
        handleModelChange
    );


    elements.year?.addEventListener(
        "change",
        handleYearChange
    );


    elements.searchButton
        ?.addEventListener(
            "click",
            handleVehicleSearch
        );

}


/**
 * Initialize selector.
 */
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


    /**
     * Development mode:
     * Keep everything disabled.
     */
    const localPreviewEnabled =
    config.APP_MODE === "development" &&
    config.FEATURES.localDataPreview;

const productionSearchEnabled =
    config.APP_MODE === "production" &&
    config.FEATURES.vehicleSearch;

if (
    !localPreviewEnabled &&
    !productionSearchEnabled
) {
    setVehicleSelectorEnabled(false);

    console.info(
        "[Smart Dragon] Vehicle selector is disabled."
    );

    return;
}

setVehicleSelectorEnabled(true);

loadMakes();

}


/**
 * Public API.
 *
 * Keeping a small public interface makes it easier
 * to test and replace the data provider later.
 */
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
/**
 * =========================================================
 * Smart Dragon Inventory
 * Vehicle Results Renderer
 * =========================================================
 *
 * SECURITY NOTE:
 *
 * Database values must never be inserted into the page
 * through raw HTML strings.
 *
 * This renderer intentionally uses DOM APIs and textContent.
 */


/**
 * Get the result container.
 */
function getResultsContainer() {
    return document.getElementById(
        "resultsContainer"
    );
}


/**
 * Remove all existing child elements safely.
 */
function clearElement(element) {

    if (!element) {
        return;
    }


    while (element.firstChild) {
        element.removeChild(
            element.firstChild
        );
    }

}


/**
 * Create an element with optional class name.
 */
function createElement(
    tagName,
    className = ""
) {

    const element =
        document.createElement(tagName);


    if (className) {
        element.className = className;
    }


    return element;
}


/**
 * Render empty state.
 */
function renderEmptyState() {

    const container =
        getResultsContainer();


    if (!container) {
        return;
    }


    clearElement(container);


    container.className =
        "results-placeholder";


    const icon =
        createElement(
            "div",
            "results-placeholder__icon"
        );

    icon.textContent = "🚗";


    const title =
        createElement("h3");

    title.textContent =
        "لم يتم العثور على بيانات";


    const text =
        createElement("p");

    text.textContent =
        "لا توجد بيانات توافق معتمدة لهذه السيارة حالياً.";


    container.append(
        icon,
        title,
        text
    );

}


/**
 * Render one fitment value.
 */
function createFitmentRow(
    label,
    value
) {

    const row =
        createElement(
            "div",
            "fitment-row"
        );


    const labelElement =
        createElement(
            "span",
            "fitment-row__label"
        );

    labelElement.textContent =
        String(label);


    const valueElement =
        createElement(
            "span",
            "fitment-row__value"
        );

    valueElement.textContent =
        value === null ||
        value === undefined ||
        value === ""
            ? "غير متوفر"
            : String(value);


    row.append(
        labelElement,
        valueElement
    );


    return row;
}


/**
 * Render one dynamic category.
 *
 * Expected future structure:
 *
 * {
 *   name: "اللمبات",
 *   items: [
 *      {
 *          label: "الواطي",
 *          value: "H11"
 *      }
 *   ]
 * }
 */
function createCategoryCard(category) {

    const card =
        createElement(
            "article",
            "fitment-category"
        );


    const title =
        createElement(
            "h3",
            "fitment-category__title"
        );

    title.textContent =
        category?.name ||
        "صنف";


    card.appendChild(title);


    const list =
        createElement(
            "div",
            "fitment-category__items"
        );


    const items =
        Array.isArray(category?.items)
            ? category.items
            : [];


    items.forEach((item) => {

        list.appendChild(
            createFitmentRow(
                item?.label || "بيان",
                item?.value
            )
        );

    });


    if (items.length === 0) {

        const empty =
            createElement(
                "p",
                "fitment-category__empty"
            );

        empty.textContent =
            "لا توجد بيانات ضمن هذا الصنف.";

        list.appendChild(empty);

    }


    card.appendChild(list);


    return card;
}


/**
 * Main result renderer.
 *
 * Expected future structure:
 *
 * {
 *   vehicle: {
 *      make: "Toyota",
 *      model: "Corolla",
 *      year: 2019,
 *      yearStart: 2017,
 *      yearEnd: 2020
 *   },
 *
 *   categories: [
 *      ...
 *   ]
 * }
 */
function renderVehicleResult(result) {

    if (
        !result ||
        typeof result !== "object"
    ) {

        renderEmptyState();

        return;
    }


    const container =
        getResultsContainer();


    if (!container) {
        return;
    }


    clearElement(container);


    container.className =
        "vehicle-result";


    const vehicle =
        result.vehicle || {};


    /**
     * Header
     */
    const header =
        createElement(
            "div",
            "vehicle-result__header"
        );


    const vehicleTitle =
        createElement(
            "h3",
            "vehicle-result__title"
        );


    const titleParts = [
        vehicle.make,
        vehicle.model,
        vehicle.year
    ].filter(Boolean);


    vehicleTitle.textContent =
        titleParts.join(" ");


    header.appendChild(
        vehicleTitle
    );


    /**
     * Compatibility range
     */
    if (
        vehicle.yearStart &&
        vehicle.yearEnd
    ) {

        const range =
            createElement(
                "p",
                "vehicle-result__range"
            );


        range.textContent =
            `نطاق التوافق المعتمد: ${vehicle.yearStart} - ${vehicle.yearEnd}`;


        header.appendChild(
            range
        );

    }


    container.appendChild(header);


    /**
     * Dynamic categories
     */
    const categories =
        Array.isArray(result.categories)
            ? result.categories
            : [];


    const categoryContainer =
        createElement(
            "div",
            "fitment-categories"
        );


    categories.forEach(
        (category) => {

            categoryContainer.appendChild(
                createCategoryCard(category)
            );

        }
    );


    if (categories.length === 0) {

        const empty =
            createElement(
                "p",
                "vehicle-result__empty"
            );

        empty.textContent =
            "لا توجد بيانات توافق معتمدة لهذه السيارة.";

        categoryContainer.appendChild(
            empty
        );

    }


    container.appendChild(
        categoryContainer
    );


    /**
     * Future AI hook.
     *
     * The AI module receives only VERIFIED vehicle
     * and fitment data.
     */
    if (
        window.SmartDragonAI &&
        typeof window
            .SmartDragonAI
            .vehicleContextUpdated ===
            "function"
    ) {

        window
            .SmartDragonAI
            .vehicleContextUpdated(
                result
            );

    }

}

function renderLoadingState() {

    const container =
        getResultsContainer();

    if (!container) {
        return;
    }

    clearElement(container);

    container.className =
        "results-placeholder results-placeholder--loading";

    const icon =
        createElement(
            "div",
            "results-placeholder__icon"
        );

    icon.textContent = "◌";

    const title =
        createElement("h3");

    title.textContent =
        "جاري تحميل بيانات التوافق";

    const text =
        createElement("p");

    text.textContent =
        "يتم الآن تجهيز بيانات السيارة المختارة.";

    container.append(
        icon,
        title,
        text
    );
}

/**
 * Public API.
 */
window.SmartDragonVehicleResults =
    Object.freeze({

        render:
            renderVehicleResult,

        renderLoading:
            renderLoadingState,

        renderEmpty:
            renderEmptyState
    });
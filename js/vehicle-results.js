/**
 * Smart Dragon Inventory
 * Vehicle Results Renderer
 *
 * Database values are rendered using
 * DOM APIs + textContent only.
 */

function getResultsContainer() {

    return document.getElementById(
        "resultsContainer"
    );
}


function clearElement(element) {

    if (!element) {
        return;
    }

    element.replaceChildren();
}


function createElement(
    tagName,
    className = ""
) {

    const element =
        document.createElement(
            tagName
        );

    if (className) {
        element.className =
            className;
    }

    return element;
}


function renderEmptyState() {

    const container =
        getResultsContainer();

    if (!container) {
        return;
    }

    clearElement(
        container
    );

    container.className =
        "results-placeholder";


    const icon =
        createElement(
            "div",
            "results-placeholder__icon"
        );

    icon.textContent =
        "🚗";


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


function renderLoadingState() {

    const container =
        getResultsContainer();

    if (!container) {
        return;
    }

    clearElement(
        container
    );

    container.className =
        "results-placeholder results-placeholder--loading";


    const icon =
        createElement(
            "div",
            "results-placeholder__icon"
        );

    icon.textContent =
        "◌";


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


function createFitmentRow(item) {

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
        String(
            item?.label ||
            "بيان"
        );


    const valueWrapper =
        createElement(
            "div",
            "fitment-row__value-wrap"
        );


    const valueElement =
        createElement(
            "span",
            "fitment-row__value"
        );


    valueElement.textContent =
        item?.value === null ||
        item?.value === undefined ||
        item?.value === ""
            ? "غير متوفر"
            : String(
                item.value
            );


    valueElement.dir =
        item?.dir ||
        "auto";


    if (item?.tone) {

        valueElement
            .classList
            .add(
                `fitment-row__value--${item.tone}`
            );
    }


    valueWrapper.appendChild(
        valueElement
    );


    if (item?.hint) {

        const hint =
            createElement(
                "small",
                "fitment-row__hint"
            );

        hint.textContent =
            String(
                item.hint
            );

        valueWrapper.appendChild(
            hint
        );
    }


    row.append(
        labelElement,
        valueWrapper
    );


    return row;
}


function createCategoryCard(
    category
) {

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


    card.appendChild(
        title
    );


    const list =
        createElement(
            "div",
            "fitment-category__items"
        );


    const items =
        Array.isArray(
            category?.items
        )
            ? category.items
            : [];


    items.forEach(
        (item) => {

            list.appendChild(
                createFitmentRow(
                    item
                )
            );
        }
    );


    if (
        items.length === 0
    ) {

        const empty =
            createElement(
                "p",
                "fitment-category__empty"
            );

        empty.textContent =
            "لا توجد بيانات ضمن هذا الصنف.";

        list.appendChild(
            empty
        );
    }


    card.appendChild(
        list
    );


    return card;
}


function createNotice(
    message,
    blocking = false
) {

    const notice =
        createElement(
            "div",
            "vehicle-result__notice"
        );


    if (blocking) {

        notice.classList.add(
            "vehicle-result__notice--blocking"
        );
    }


    const text =
        createElement("p");

    text.textContent =
        message;


    notice.appendChild(
        text
    );


    return notice;
}


function renderVehicleResult(
    result
) {

    if (
        !result ||
        typeof result !==
            "object"
    ) {

        renderEmptyState();

        return;
    }


    const container =
        getResultsContainer();


    if (!container) {
        return;
    }


    clearElement(
        container
    );


    container.className =
        "vehicle-result";


    const vehicle =
        result.vehicle ||
        {};


    const meta =
        result.meta ||
        {};


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


    vehicleTitle.dir =
        "ltr";


    const titleParts = [

        vehicle.make,

        vehicle.model,

        vehicle.year

    ].filter(
        Boolean
    );


    vehicleTitle.textContent =
        titleParts.join(
            " "
        );


    header.appendChild(
        vehicleTitle
    );


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


    container.appendChild(
        header
    );


    /**
     * Overlap / review warning.
     */
    if (
        meta.hasOverlap &&
        meta.warning
    ) {

        container.appendChild(
            createNotice(
                meta.warning,
                Boolean(
                    meta
                        .blockingWarning
                )
            )
        );
    }


    const categories =
        Array.isArray(
            result.categories
        )
            ? result.categories
            : [];


    const categoryContainer =
        createElement(
            "div",
            "fitment-categories"
        );


    categories.forEach(
        (category) => {

            categoryContainer
                .appendChild(
                    createCategoryCard(
                        category
                    )
                );
        }
    );


    if (
        categories.length === 0
    ) {

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
     * AI still remains disabled.
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


window.SmartDragonVehicleResults =
    Object.freeze({

        render:
            renderVehicleResult,

        renderLoading:
            renderLoadingState,

        renderEmpty:
            renderEmptyState
    });
/**
 * =========================================================
 * Smart Dragon Inventory
 * AI Product Recommendations
 * =========================================================
 *
 * Security model:
 *
 * Browser
 *   ↓
 * Smart Dragon PHP API
 *   ↓
 * WooCommerce
 *   ↓
 * Z.ai / GLM
 *
 * GLM_API_KEY is NEVER stored in this file.
 *
 * IMPORTANT:
 *
 * AI does not determine vehicle compatibility.
 *
 * Verified vehicle fitment comes from Smart Dragon data.
 * AI only ranks real WooCommerce product candidates.
 */


window.SmartDragonAI =
(() => {

    const state = {

        vehicleContext:
            null,

        requestSequence:
            0,

        controller:
            null
    };


    /**
     * =====================================================
     * DOM helpers
     * =====================================================
     */

    function getSection() {

        return document.getElementById(
            "smartDragonAiSection"
        );
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


    function clearElement(
        element
    ) {

        if (!element) {
            return;
        }


        element.replaceChildren();
    }


    /**
     * =====================================================
     * Safe verified vehicle context
     * =====================================================
     */

    function buildSafeVehicleContext(
        result
    ) {

        if (
            !result ||
            typeof result !==
                "object"
        ) {

            return null;
        }


        const vehicle =
            result.vehicle || {};


        const meta =
            result.meta || {};


        /**
         * Do not ask AI for recommendations
         * when the vehicle result itself is blocked
         * because of overlapping fitment records.
         */
        if (
            meta.blockingWarning
        ) {

            return null;
        }


        if (
            !vehicle.make ||
            !vehicle.model ||
            !vehicle.year
        ) {

            return null;
        }


        const categories =
            Array.isArray(
                result.categories
            )
                ? result.categories
                : [];


        const safeCategories =
            categories
                .map(
                    (category) => {

                        const items =
                            Array.isArray(
                                category?.items
                            )
                                ? category.items
                                : [];


                        return {

                            name:
                                String(
                                    category?.name
                                    || ""
                                ).trim(),

                            items:
                                items
                                    .map(
                                        (item) => ({

                                            label:
                                                String(
                                                    item?.label
                                                    || ""
                                                ).trim(),

                                            value:
                                                String(
                                                    item?.value
                                                    ?? ""
                                                ).trim()
                                        })
                                    )
                                    .filter(
                                        (item) => (
                                            item.label &&
                                            item.value
                                        )
                                    )
                        };
                    }
                )
                .filter(
                    (category) => (
                        category.name &&
                        category.items.length >
                            0
                    )
                );


        if (
            safeCategories.length ===
            0
        ) {

            return null;
        }


        return {

            vehicle: {

                make:
                    String(
                        vehicle.make
                    ).trim(),

                model:
                    String(
                        vehicle.model
                    ).trim(),

                year:
                    Number(
                        vehicle.year
                    )
            },

            categories:
                safeCategories
        };
    }


    /**
     * =====================================================
     * AI section base
     * =====================================================
     */

    function prepareAiSection() {

        const section =
            getSection();


        if (!section) {
            return null;
        }


        const badge =
            section.querySelector(
                ".coming-soon-badge"
            );


        if (badge) {

            badge.textContent =
                "مفعّل";

            badge.classList.add(
                "coming-soon-badge--active"
            );
        }


        const intro =
            section.querySelector(
                ":scope > p"
            );


        if (intro) {

            intro.textContent =
                "اقتراحات منتجات من متجر Smart Dragon اعتماداً على بيانات التوافق الموثقة لسيارتك.";
        }


        return section;
    }


    /**
     * =====================================================
     * Loading state
     * =====================================================
     */

    function renderLoading() {

        const section =
            prepareAiSection();


        if (!section) {
            return;
        }


        const container =
            section.querySelector(
                ".ai-feature-preview"
            );


        if (!container) {
            return;
        }


        clearElement(
            container
        );


        const loading =
            createElement(
                "div",
                "ai-recommendations-status ai-recommendations-status--loading"
            );


        const title =
            createElement(
                "strong"
            );


        title.textContent =
            "جاري البحث عن منتجات مناسبة";


        const text =
            createElement(
                "span"
            );


        text.textContent =
            "يتم الآن مقارنة بيانات سيارتك مع المنتجات المتوفرة في متجر Smart Dragon.";


        loading.append(
            title,
            text
        );


        container.appendChild(
            loading
        );
    }


    /**
     * =====================================================
     * Empty state
     * =====================================================
     */

    function renderEmpty(
        message =
            "لا توجد اقتراحات منتجات مناسبة حالياً."
    ) {

        const section =
            prepareAiSection();


        if (!section) {
            return;
        }


        const container =
            section.querySelector(
                ".ai-feature-preview"
            );


        if (!container) {
            return;
        }


        clearElement(
            container
        );


        const empty =
            createElement(
                "div",
                "ai-recommendations-status"
            );


        const title =
            createElement(
                "strong"
            );


        title.textContent =
            "لا توجد اقتراحات حالياً";


        const text =
            createElement(
                "span"
            );


        text.textContent =
            message;


        empty.append(
            title,
            text
        );


        container.appendChild(
            empty
        );
    }


    /**
     * =====================================================
     * Error state
     * =====================================================
     */

    function renderError() {

        const section =
            prepareAiSection();


        if (!section) {
            return;
        }


        const container =
            section.querySelector(
                ".ai-feature-preview"
            );


        if (!container) {
            return;
        }


        clearElement(
            container
        );


        const error =
            createElement(
                "div",
                "ai-recommendations-status ai-recommendations-status--error"
            );


        const title =
            createElement(
                "strong"
            );


        title.textContent =
            "تعذر تحميل الاقتراحات";


        const text =
            createElement(
                "span"
            );


        text.textContent =
            "بيانات التوافق الأساسية ما زالت متاحة، ويمكنك المحاولة مرة أخرى لاحقاً.";


        error.append(
            title,
            text
        );


        container.appendChild(
            error
        );
    }


    /**
     * =====================================================
     * Recommendation card
     * =====================================================
     */

    function createRecommendationCard(
        product
    ) {

        const card =
            createElement(
                "article",
                "ai-product-card"
            );


        if (
            product?.image
        ) {

            const image =
                document.createElement(
                    "img"
                );


            image.className =
                "ai-product-card__image";


            image.src =
                String(
                    product.image
                );


            image.alt =
                String(
                    product?.name
                    || "منتج Smart Dragon"
                );


            image.loading =
                "lazy";


            card.appendChild(
                image
            );
        }


        const content =
            createElement(
                "div",
                "ai-product-card__content"
            );


        const title =
            createElement(
                "h3",
                "ai-product-card__title"
            );


        title.textContent =
            String(
                product?.name
                || "منتج"
            );


        content.appendChild(
            title
        );


        if (
            product?.reason
        ) {

            const reason =
                createElement(
                    "p",
                    "ai-product-card__reason"
                );


            reason.textContent =
                String(
                    product.reason
                );


            content.appendChild(
                reason
            );
        }


        const meta =
            createElement(
                "div",
                "ai-product-card__meta"
            );


        if (
            product?.sku
        ) {

            const sku =
                createElement(
                    "span"
                );


            sku.textContent =
                `SKU: ${product.sku}`;


            meta.appendChild(
                sku
            );
        }


        if (
            product?.price_jod !==
                null &&
            product?.price_jod !==
                undefined &&
            product?.price_jod !==
                ""
        ) {

            const price =
                createElement(
                    "strong"
                );


            price.textContent =
                `${product.price_jod} د.أ`;


            meta.appendChild(
                price
            );
        }


        if (
            meta.childNodes.length >
            0
        ) {

            content.appendChild(
                meta
            );
        }


        if (
            product?.url
        ) {

            const link =
                document.createElement(
                    "a"
                );


            link.className =
                "ai-product-card__link";


            link.href =
                String(
                    product.url
                );


            link.target =
                "_blank";


            link.rel =
                "noopener noreferrer";


            link.textContent =
                "عرض المنتج";


            content.appendChild(
                link
            );
        }


        card.appendChild(
            content
        );


        return card;
    }


    /**
     * =====================================================
     * Recommendations renderer
     * =====================================================
     */

    function renderRecommendations(
        payload
    ) {

        const section =
            prepareAiSection();


        if (!section) {
            return;
        }


        const container =
            section.querySelector(
                ".ai-feature-preview"
            );


        if (!container) {
            return;
        }


        const recommendations =
            Array.isArray(
                payload?.recommendations
            )
                ? payload.recommendations
                : [];


        if (
            recommendations.length ===
            0
        ) {

            renderEmpty(
                payload?.message
                || "لم يتم العثور على منتجات مناسبة ضمن المنتجات المتوفرة حالياً."
            );

            return;
        }


        clearElement(
            container
        );


        const heading =
            createElement(
                "div",
                "ai-recommendations-heading"
            );


        const headingTitle =
            createElement(
                "strong"
            );


        headingTitle.textContent =
            "اقتراحات التنين الذكي";


        const headingText =
            createElement(
                "span"
            );


        headingText.textContent =
            `${recommendations.length} منتج/منتجات مقترحة من المتجر`;


        heading.append(
            headingTitle,
            headingText
        );


        container.appendChild(
            heading
        );


        const grid =
            createElement(
                "div",
                "ai-products-grid"
            );


        recommendations.forEach(
            (product) => {

                grid.appendChild(
                    createRecommendationCard(
                        product
                    )
                );
            }
        );


        container.appendChild(
            grid
        );


        if (
            payload?.model
        ) {

            const modelInfo =
                createElement(
                    "small",
                    "ai-model-info"
                );


            modelInfo.textContent =
                `Smart Dragon AI • ${payload.model}`;


            container.appendChild(
                modelInfo
            );
        }
    }


    /**
     * =====================================================
     * Backend request
     * =====================================================
     */

    async function requestProductRecommendations(
        vehicleContext
    ) {

        const config =
            window.SmartDragonConfig;


        const endpoint =
            config
                ?.API
                ?.vehicleRecommendations;


        if (
            !endpoint
        ) {

            throw new Error(
                "Smart Dragon recommendation endpoint is not configured."
            );
        }


        /**
         * Cancel any previous request.
         *
         * This prevents an older vehicle selection
         * from replacing a newer result.
         */
        if (
            state.controller
        ) {

            state.controller.abort();
        }


        state.controller =
            new AbortController();


        const response =
            await fetch(
                endpoint,
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            vehicleContext
                        ),

                    signal:
                        state
                            .controller
                            .signal,

                    cache:
                        "no-store",

                    credentials:
                        "omit"
                }
            );


        let payload =
            null;


        try {

            payload =
                await response.json();

        } catch {

            throw new Error(
                `Smart Dragon API returned invalid JSON (${response.status}).`
            );
        }


        if (
            !response.ok ||
            payload?.success !== true
        ) {

            const message =
                payload?.message
                || payload?.error
                || `HTTP ${response.status}`;


            throw new Error(
                String(
                    message
                )
            );
        }


        return payload;
    }


    /**
     * =====================================================
     * Verified vehicle update
     * =====================================================
     */

    async function vehicleContextUpdated(
        result
    ) {

        const config =
            window.SmartDragonConfig;


        if (
            !config
                ?.FEATURES
                ?.aiRecommendations
        ) {

            return;
        }


        const meta =
            result?.meta || {};


        /**
         * Never call AI when fitment is blocked
         * by an unresolved overlap.
         */
        if (
            meta.blockingWarning
        ) {

            state.vehicleContext =
                null;


            renderEmpty(
                "اقتراحات المنتجات متوقفة لهذه السيارة حتى تتم مراجعة تداخل بيانات التوافق."
            );


            return;
        }


        const context =
            buildSafeVehicleContext(
                result
            );


        state.vehicleContext =
            context;


        if (!context) {

            renderEmpty(
                "لا توجد بيانات توافق موثقة كافية لإنشاء اقتراحات."
            );

            return;
        }


        const requestId =
            ++state.requestSequence;


        renderLoading();


        try {

            const payload =
                await requestProductRecommendations(
                    context
                );


            /**
             * Ignore stale responses.
             */
            if (
                requestId !==
                state.requestSequence
            ) {

                return;
            }


            renderRecommendations(
                payload
            );


            console.info(
                "[Smart Dragon AI] Recommendations loaded.",
                {
                    vehicle:
                        context.vehicle,

                    count:
                        Array.isArray(
                            payload
                                ?.recommendations
                        )
                            ? payload
                                .recommendations
                                .length
                            : 0,

                    model:
                        payload?.model
                        || null
                }
            );

        } catch (error) {

            if (
                error?.name ===
                "AbortError"
            ) {

                return;
            }


            if (
                requestId !==
                state.requestSequence
            ) {

                return;
            }


            console.error(
                "[Smart Dragon AI] Recommendation request failed:",
                error
            );


            renderError();
        }
    }


    /**
     * =====================================================
     * Optional future intent request
     * =====================================================
     */

    async function requestIntentRecommendations(
        intent
    ) {

        void intent;


        if (
            !state.vehicleContext
        ) {

            throw new Error(
                "No verified vehicle context is available."
            );
        }


        /**
         * Reserved for future category-specific
         * recommendation requests.
         */
        return requestProductRecommendations(
            state.vehicleContext
        );
    }


    /**
     * =====================================================
     * Initial UI
     * =====================================================
     */

    document.addEventListener(
        "DOMContentLoaded",
        () => {

            const config =
                window.SmartDragonConfig;


            if (
                config
                    ?.FEATURES
                    ?.aiRecommendations
            ) {

                prepareAiSection();


                renderEmpty(
                    "اختر سيارتك أولاً، وبعد ظهور بيانات التوافق سيبحث مساعد التنين الذكي عن منتجات مناسبة."
                );
            }
        }
    );


    /**
     * =====================================================
     * Public API
     * =====================================================
     */

    return Object.freeze({

        vehicleContextUpdated,

        requestProductRecommendations,

        requestIntentRecommendations,


        isEnabled() {

            return Boolean(
                window
                    .SmartDragonConfig
                    ?.FEATURES
                    ?.aiRecommendations
            );
        },


        getVehicleContext() {

            if (
                !state.vehicleContext
            ) {

                return null;
            }


            return JSON.parse(
                JSON.stringify(
                    state.vehicleContext
                )
            );
        }
    });

})();
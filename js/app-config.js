/**
 * =========================================================
 * Smart Dragon Inventory
 * Application Configuration
 * =========================================================
 *
 * This file controls the current application mode.
 *
 * IMPORTANT:
 * - Firebase is NOT connected yet.
 * - Do NOT place secrets, private keys, service-account data,
 *   or administrative credentials in this file.
 */

window.SmartDragonConfig = Object.freeze({

    /**
     * Application mode
     *
     * Available values:
     * - "development"
     * - "production"
     */
    APP_MODE: "development",

    /**
     * Current project stage.
     */
    PROJECT_STAGE: "UI_FOUNDATION",

    /**
     * Public website information.
     */
    WEBSITE: Object.freeze({
        name: "Smart Dragon Jordan",
        domain: "https://www.smartdragonjo.com"
    }),

    /**
     * Feature flags.
     *
     * These flags allow us to prepare features now
     * without enabling them before the system is ready.
     */
    FEATURES: Object.freeze({

        vehicleSearch: false,

        firebase: false,

        authentication: false,

        adminPanel: false,

        dataEditing: false,

        bulkApproval: false,

        auditLog: false,

        backups: false,

        aiRecommendations: false
    }),

    /**
     * Future role model.
     *
     * These names are reserved now so the frontend and
     * Firebase rules can use the same terminology later.
     */
    ROLES: Object.freeze({

        OWNER: "owner",

        EDITOR: "editor"
    }),

    /**
     * Vehicle selection order.
     *
     * Customer workflow:
     *
     * Make
     *   ↓
     * Model
     *   ↓
     * Year
     */
    VEHICLE_SELECTION: Object.freeze({

        order: Object.freeze([
            "make",
            "model",
            "year"
        ])
    }),

    /**
     * Change request statuses.
     *
     * Editors will not publish data directly.
     * Their changes will be submitted for owner review.
     */
    CHANGE_STATUS: Object.freeze({

        PENDING_REVIEW: "pending_review",

        APPROVED: "approved",

        REJECTED: "rejected",

        NEEDS_REVIEW: "needs_review"
    }),

    /**
     * Development interface settings.
     */
    DEVELOPMENT: Object.freeze({

        disableVehicleControls: true,

        showDevelopmentBanner: true,

        showAiPreview: true
    })

});


/**
 * =========================================================
 * Development Safety Lock
 * =========================================================
 *
 * During the current development phase, the public vehicle
 * selector must remain disabled even if HTML is accidentally
 * modified.
 *
 * This is NOT a security mechanism.
 *
 * Real authorization and data protection will later be
 * enforced by Firebase Authentication + Firestore Rules.
 */

document.addEventListener("DOMContentLoaded", () => {

    const config = window.SmartDragonConfig;

    if (!config) {
        console.error(
            "[Smart Dragon] Application configuration could not be loaded."
        );

        return;
    }


    console.info(
        `[Smart Dragon] Application mode: ${config.APP_MODE}`
    );


    if (
        config.APP_MODE === "development" &&
        config.DEVELOPMENT.disableVehicleControls
    ) {

        const protectedControls = [
            "vehicleMake",
            "vehicleModel",
            "vehicleYear",
            "searchVehicleButton"
        ];


        protectedControls.forEach((elementId) => {

            const element =
                document.getElementById(elementId);


            if (!element) {
                return;
            }


            element.disabled = true;

            element.setAttribute(
                "aria-disabled",
                "true"
            );

        });

    }

});
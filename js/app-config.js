/**
 * Smart Dragon Inventory
 * Local Data Preview Configuration
 *
 * Firebase remains disabled.
 * Vehicle search is enabled only against local JSON data.
 */

window.SmartDragonConfig = Object.freeze({
    APP_MODE: "development",

    PROJECT_STAGE: "LOCAL_DATA_PREVIEW",

    WEBSITE: Object.freeze({
        name: "Smart Dragon Jordan",
        domain: "https://www.smartdragonjo.com"
    }),

    FEATURES: Object.freeze({
        vehicleSearch: true,
        localDataPreview: true,

        firebase: false,
        authentication: false,
        adminPanel: false,
        dataEditing: false,
        bulkApproval: false,
        auditLog: false,
        backups: false,
        aiRecommendations: false
    }),

    ROLES: Object.freeze({
        OWNER: "owner",
        EDITOR: "editor"
    }),

    VEHICLE_SELECTION: Object.freeze({
        order: Object.freeze([
            "make",
            "model",
            "year"
        ])
    }),

    CHANGE_STATUS: Object.freeze({
        PENDING_REVIEW: "pending_review",
        APPROVED: "approved",
        REJECTED: "rejected",
        NEEDS_REVIEW: "needs_review"
    }),

    LOCAL_DATA: Object.freeze({
        vehiclesUrl: "data/vehicles.json"
    }),

    DEVELOPMENT: Object.freeze({
        disableVehicleControls: false,
        showDevelopmentBanner: true,
        showAiPreview: true
    })
});


/**
 * Development safety behavior.
 *
 * This is NOT an authorization/security boundary.
 * Firebase and its security rules remain disabled for now.
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

    console.info(
        `[Smart Dragon] Project stage: ${config.PROJECT_STAGE}`
    );

    if (
        config.APP_MODE === "development" &&
        config.DEVELOPMENT.disableVehicleControls
    ) {
        [
            "vehicleMake",
            "vehicleModel",
            "vehicleYear",
            "searchVehicleButton"
        ].forEach((elementId) => {
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
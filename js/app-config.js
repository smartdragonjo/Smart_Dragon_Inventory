/**
 * Smart Dragon Inventory
 * Public Beta Configuration
 */

window.SmartDragonConfig =
    Object.freeze({

        APP_MODE:
            "production",

        PROJECT_STAGE:
            "PUBLIC_BETA_AI",


        WEBSITE:
            Object.freeze({

                name:
                    "Smart Dragon Jordan",

                domain:
                    "https://www.smartdragonjo.com"
            }),


        FEATURES:
            Object.freeze({

                vehicleSearch:
                    true,

                localDataPreview:
                    false,

                firebase:
                    true,

                authentication:
                    false,

                adminPanel:
                    false,

                dataEditing:
                    false,

                bulkApproval:
                    false,

                auditLog:
                    false,

                backups:
                    false,

                /**
                 * Smart Dragon AI product recommendations.
                 */
                aiRecommendations:
                    true
            }),


        /**
         * Smart Dragon backend.
         *
         * No GLM secret is stored here.
         */
        API:
            Object.freeze({

                vehicleRecommendations:
                    "https://smartdragonjo.com/smart-dragon-api/vehicle-recommendations.php"
            }),


        ROLES:
            Object.freeze({

                OWNER:
                    "owner",

                EDITOR:
                    "editor"
            }),


        VEHICLE_SELECTION:
            Object.freeze({

                order:
                    Object.freeze([
                        "make",
                        "model",
                        "year"
                    ])
            }),


        CHANGE_STATUS:
            Object.freeze({

                PENDING_REVIEW:
                    "pending_review",

                APPROVED:
                    "approved",

                REJECTED:
                    "rejected",

                NEEDS_REVIEW:
                    "needs_review"
            }),


        LOCAL_DATA:
            Object.freeze({

                vehiclesUrl:
                    "data/vehicles.json"
            }),


        DEVELOPMENT:
            Object.freeze({

                disableVehicleControls:
                    false,

                showDevelopmentBanner:
                    false,

                showAiPreview:
                    true
            })
    });


document.addEventListener(
    "DOMContentLoaded",
    () => {

        const config =
            window.SmartDragonConfig;


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
            config
                .DEVELOPMENT
                .disableVehicleControls
        ) {

            [
                "vehicleMake",
                "vehicleModel",
                "vehicleYear",
                "searchVehicleButton"
            ]
            .forEach(
                (elementId) => {

                    const element =
                        document.getElementById(
                            elementId
                        );


                    if (!element) {
                        return;
                    }


                    element.disabled =
                        true;


                    element.setAttribute(
                        "aria-disabled",
                        "true"
                    );
                }
            );
        }
    }
);
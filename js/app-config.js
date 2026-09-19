/**
 * Smart Dragon Inventory
 * Public Beta Configuration
 *
 * Current public architecture:
 *
 * - Vehicle compatibility data:
 *   data/vehicles.json
 *
 * - Accessory links:
 *   Real Firestore collection "cars"
 *
 * - Firebase Authentication:
 *   Not enabled on the public Inventory interface
 *
 * - Admin / editing:
 *   Not enabled on the public interface
 *
 * - Smart Dragon AI:
 *   Reserved for future integration
 */

window.SmartDragonConfig =
    Object.freeze({

        /**
         * Public website mode.
         */
        APP_MODE:
            "production",


        /**
         * Current project stage.
         */
        PROJECT_STAGE:
            "PUBLIC_BETA",


        WEBSITE:
            Object.freeze({

                name:
                    "Smart Dragon Jordan",

                domain:
                    "https://www.smartdragonjo.com"
            }),


        /**
         * Feature flags.
         */
        FEATURES:
            Object.freeze({

                /**
                 * Public vehicle selector.
                 */
                vehicleSearch:
                    true,


                /**
                 * Vehicle compatibility currently comes
                 * from the prepared local JSON dataset.
                 *
                 * This can later be replaced by Firestore
                 * without changing the public UI flow.
                 */
                localDataPreview:
                    true,


                /**
                 * Firebase is currently used for
                 * read-only accessory-link integration.
                 */
                firebase:
                    true,


                /**
                 * Public Inventory does not require login.
                 */
                authentication:
                    false,


                /**
                 * Admin features remain separate.
                 */
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
                 * Future Smart Dragon AI.
                 */
                aiRecommendations:
                    false
            }),


        /**
         * Planned application roles.
         */
        ROLES:
            Object.freeze({

                OWNER:
                    "owner",

                EDITOR:
                    "editor"
            }),


        /**
         * Required customer selection flow.
         */
        VEHICLE_SELECTION:
            Object.freeze({

                order:
                    Object.freeze([
                        "make",
                        "model",
                        "year"
                    ])
            }),


        /**
         * Review workflow statuses.
         */
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


        /**
         * Current structured vehicle dataset.
         */
        LOCAL_DATA:
            Object.freeze({

                vehiclesUrl:
                    "data/vehicles.json"
            }),


        /**
         * UI behavior.
         */
        DEVELOPMENT:
            Object.freeze({

                /**
                 * Keep false on public beta.
                 */
                disableVehicleControls:
                    false,

                showDevelopmentBanner:
                    false,

                showAiPreview:
                    true
            })
    });


/**
 * Basic application initialization.
 *
 * This is NOT a security boundary.
 * Security is enforced by Firestore Security Rules.
 */
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


        /**
         * Emergency/development lock.
         */
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
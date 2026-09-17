/**
 * =========================================================
 * Smart Dragon Inventory
 * Admin Dashboard Controller
 * =========================================================
 *
 * Current stage:
 * Development Preview
 *
 * Firebase Authentication and Firestore are intentionally
 * not connected yet.
 */


/**
 * Get application configuration.
 */
function getAdminConfig() {
    return window.SmartDragonConfig || null;
}


/**
 * =========================================================
 * Development Lock
 * =========================================================
 *
 * All interactive administration controls remain disabled
 * until authentication and authorization are implemented.
 */
function applyDevelopmentAdminLock() {

    const config =
        getAdminConfig();


    if (!config) {

        console.error(
            "[Smart Dragon Admin] Application configuration is missing."
        );

        return;
    }


    if (
        config.APP_MODE !== "development"
    ) {
        return;
    }


    const interactiveElements =
        document.querySelectorAll(
            ".admin-navigation button, " +
            ".admin-primary-button, " +
            ".admin-table input, " +
            ".admin-table button"
        );


    interactiveElements.forEach(
        (element) => {

            /**
             * Dashboard button remains visible as active,
             * but no other administration actions are enabled.
             */
            if (
                element.classList.contains(
                    "active"
                )
            ) {
                return;
            }


            element.disabled = true;

            element.setAttribute(
                "aria-disabled",
                "true"
            );

        }
    );


    console.info(
        "[Smart Dragon Admin] Dashboard is running in development preview mode."
    );

}


/**
 * =========================================================
 * Future Role Helpers
 * =========================================================
 *
 * These functions do NOT provide security.
 *
 * Firestore Security Rules and trusted backend logic will
 * later enforce actual permissions.
 */

function isOwner(userProfile) {

    return (
        userProfile?.role ===
        window
            .SmartDragonConfig
            ?.ROLES
            ?.OWNER
    );

}


function isEditor(userProfile) {

    return (
        userProfile?.role ===
        window
            .SmartDragonConfig
            ?.ROLES
            ?.EDITOR
    );

}


/**
 * Future permission map.
 *
 * Owner:
 * - Create categories
 * - Edit categories
 * - Delete categories
 * - Create users
 * - Disable users
 * - Add records
 * - Edit records
 * - Delete records
 * - Approve changes
 * - Bulk approve changes
 *
 * Editor:
 * - Add records
 * - Edit records
 * - Submit changes for review
 *
 * Editor CANNOT:
 * - Delete records
 * - Create categories
 * - Manage users
 * - Approve changes
 */
function getRoleCapabilities(
    userProfile
) {

    if (isOwner(userProfile)) {

        return Object.freeze({

            addData: true,

            editData: true,

            deleteData: true,

            manageCategories: true,

            manageUsers: true,

            approveChanges: true,

            bulkApprove: true,

            viewAuditLog: true,

            manageBackups: true

        });

    }


    if (isEditor(userProfile)) {

        return Object.freeze({

            addData: true,

            editData: true,

            deleteData: false,

            manageCategories: false,

            manageUsers: false,

            approveChanges: false,

            bulkApprove: false,

            viewAuditLog: false,

            manageBackups: false

        });

    }


    return Object.freeze({

        addData: false,

        editData: false,

        deleteData: false,

        manageCategories: false,

        manageUsers: false,

        approveChanges: false,

        bulkApprove: false,

        viewAuditLog: false,

        manageBackups: false

    });

}


/**
 * Public API.
 */
window.SmartDragonAdmin =
    Object.freeze({

        isOwner,

        isEditor,

        getRoleCapabilities

    });


document.addEventListener(
    "DOMContentLoaded",
    applyDevelopmentAdminLock
);
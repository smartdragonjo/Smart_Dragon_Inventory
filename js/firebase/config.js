/**
 * =========================================================
 * Smart Dragon Inventory
 * Firebase Configuration Placeholder
 * =========================================================
 *
 * Firebase is intentionally NOT connected yet.
 *
 * DO NOT place:
 * - Service Account JSON
 * - Private keys
 * - Admin credentials
 * - Secret tokens
 * inside frontend files or GitHub.
 *
 * Future integration may reuse the existing
 * "smart-dragon-search" Firebase project after
 * security rules are reviewed.
 */

window.SmartDragonFirebaseConfig = Object.freeze({

    enabled: false,

    projectConfigured: false,

    /**
     * Public Firebase web config will be placed here later.
     *
     * Example only:
     *
     * firebaseConfig: {
     *   apiKey: "...",
     *   authDomain: "...",
     *   projectId: "...",
     *   storageBucket: "...",
     *   messagingSenderId: "...",
     *   appId: "..."
     * }
     */
    firebaseConfig: null,

    /**
     * Planned collection names.
     *
     * Existing Firebase project already uses:
     * - cars
     *
     * These new collections are reserved for the
     * Smart Dragon Inventory system.
     */
    collections: Object.freeze({

        vehicles: "vehicles",

        categories: "categories",

        changeRequests: "change_requests",

        users: "users",

        auditLogs: "audit_logs",

        backups: "backups",

        /**
         * Existing collection from Smart Dragon Search.
         */
        accessoryLinks: "cars"

    })

});
/**
 * Smart Dragon Firebase Web Configuration
 *
 * Web config is not a secret.
 * Security is enforced by Firebase Authentication
 * and Firestore Security Rules.
 */

window.SmartDragonFirebaseConfig =
    Object.freeze({

        enabled: true,

        projectConfigured: true,

        config: Object.freeze({
            apiKey:
                "AIzaSyDBw9UD-7L-2KJlKvSdBs-jZV22uSyOECI",

            authDomain:
                "smart-dragon-search.firebaseapp.com",

            projectId:
                "smart-dragon-search",

            storageBucket:
                "smart-dragon-search.firebasestorage.app",

            messagingSenderId:
                "771483738093",

            appId:
                "1:771483738093:web:6d69177091ae6d3984d1e4"
        }),

        collections:
            Object.freeze({

                vehicles:
                    "vehicles",

                categories:
                    "categories",

                changeRequests:
                    "change_requests",

                users:
                    "users",

                auditLogs:
                    "audit_logs",

                backups:
                    "backups",

                vehicleFitments:
                    "vehicle_fitments",

                /**
                 * Existing collection used by:
                 * https://smartdragonjo.com/search
                 */
                accessoryLinks:
                    "cars"
            })
    });
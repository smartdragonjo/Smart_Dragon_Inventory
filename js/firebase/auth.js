/**
 * =========================================================
 * Smart Dragon Inventory
 * Authentication Placeholder
 * =========================================================
 *
 * Planned authentication:
 *
 * - Google Sign-In
 *
 * Roles:
 *
 * OWNER
 *   - Full administrative access
 *   - Manage users
 *   - Manage categories
 *   - Approve changes
 *   - Bulk approve
 *   - Delete records
 *
 * EDITOR
 *   - Add data
 *   - Edit data
 *   - Submit changes for review
 *   - Cannot delete
 *   - Cannot approve
 *
 * IMPORTANT:
 *
 * Frontend role checks are for UI only.
 *
 * Real authorization MUST be enforced later by:
 * - Firestore Security Rules
 * - trusted server/backend logic where required
 */


const SmartDragonAuthState = {

    initialized: false,

    user: null,

    profile: null

};


/**
 * Initialize Firebase Authentication.
 *
 * Placeholder only.
 */
async function initializeAuth() {

    const config =
        window.SmartDragonFirebaseConfig;


    if (
        !config ||
        !config.enabled
    ) {

        console.info(
            "[Smart Dragon Auth] Firebase authentication is not enabled."
        );


        return {
            initialized: false,
            user: null
        };

    }


    throw new Error(
        "Firebase Authentication has not been implemented yet."
    );

}


/**
 * Future Google sign-in handler.
 */
async function signInWithGoogle() {

    throw new Error(
        "Google Sign-In is not enabled yet."
    );

}


/**
 * Future sign-out handler.
 */
async function signOutUser() {

    throw new Error(
        "Firebase Authentication is not enabled yet."
    );

}


/**
 * Get current user.
 */
function getCurrentUser() {

    return SmartDragonAuthState.user;

}


/**
 * Get current user profile.
 */
function getCurrentUserProfile() {

    return SmartDragonAuthState.profile;

}


/**
 * Check authenticated state.
 */
function isAuthenticated() {

    return Boolean(
        SmartDragonAuthState.user
    );

}


/**
 * Public API.
 */
window.SmartDragonAuth =
    Object.freeze({

        initialize:
            initializeAuth,

        signInWithGoogle,

        signOut:
            signOutUser,

        getCurrentUser,

        getCurrentUserProfile,

        isAuthenticated

    });
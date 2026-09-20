/**
 * Smart Dragon Inventory
 * Firebase Authentication
 *
 * Uses Firebase compat SDK loaded by admin/index.html.
 * Frontend role checks are UI only. Firestore Security Rules remain authoritative.
 */

(() => {
    "use strict";

    const OWNER_EMAILS = Object.freeze([
        "smartdragonjordan@gmail.com"
    ]);

    const state = {
        initialized: false,
        user: null,
        profile: null,
        auth: null,
        db: null,
        listeners: new Set()
    };

    function firebaseConfig() {
        return window.SmartDragonFirebaseConfig?.config || null;
    }

    function collectionName(key, fallback) {
        return window.SmartDragonFirebaseConfig?.collections?.[key] || fallback;
    }

    function usersCollection() {
        return collectionName("users", "users");
    }

    function invitesCollection() {
        return collectionName("userInvites", "user_invites");
    }

    function normalizeEmail(email) {
        return String(email || "").trim().toLowerCase();
    }

    function isOwnerEmail(email) {
        return OWNER_EMAILS.includes(normalizeEmail(email));
    }

    function ensureFirebaseApp() {
        if (!window.firebase) throw new Error("Firebase SDK is not loaded.");
        const config = firebaseConfig();
        if (!config) throw new Error("Firebase web configuration is missing.");
        if (!firebase.apps.length) firebase.initializeApp(config);
        return firebase.app();
    }

    function editorProfile(user, data = {}, source = "firestore") {
        const email = normalizeEmail(user.email);
        return {
            uid: user.uid,
            email,
            displayName: data.displayName || user.displayName || email,
            role: data.role === "editor" ? "editor" : "unauthorized",
            enabled: data.enabled === true,
            source
        };
    }

    async function redeemInvite(user) {
        const email = normalizeEmail(user?.email);
        if (!email) return null;

        const inviteRef = state.db.collection(invitesCollection()).doc(email);
        const inviteSnap = await inviteRef.get();
        if (!inviteSnap.exists) return null;

        const invite = inviteSnap.data() || {};
        if (invite.enabled !== true || invite.role !== "editor") return null;

        const profileRef = state.db.collection(usersCollection()).doc(user.uid);
        const profileData = {
            uid: user.uid,
            email,
            displayName: invite.displayName || user.displayName || email,
            role: "editor",
            enabled: true,
            source: "email_invite",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await profileRef.set(profileData, { merge: false });
        return editorProfile(user, profileData, "redeemed_invite");
    }

    async function loadProfile(user) {
        if (!user) return null;
        const email = normalizeEmail(user.email);

        if (isOwnerEmail(email)) {
            return {
                uid: user.uid,
                email,
                displayName: user.displayName || "Owner",
                role: "owner",
                enabled: true,
                source: "owner_allowlist"
            };
        }

        const snapshot = await state.db.collection(usersCollection()).doc(user.uid).get();
        if (snapshot.exists) return editorProfile(user, snapshot.data() || {});

        try {
            const redeemed = await redeemInvite(user);
            if (redeemed) return redeemed;
        } catch (error) {
            console.warn("[Smart Dragon Auth] Invite redemption failed", error);
        }

        return {
            uid: user.uid,
            email,
            displayName: user.displayName || email,
            role: "unauthorized",
            enabled: false,
            source: "missing_profile"
        };
    }

    function emit() {
        const payload = { initialized: state.initialized, user: state.user, profile: state.profile };
        state.listeners.forEach((listener) => {
            try { listener(payload); }
            catch (error) { console.error("[Smart Dragon Auth] listener failed", error); }
        });
    }

    async function initializeAuth() {
        if (state.initialized) return { initialized: true, user: state.user, profile: state.profile };
        ensureFirebaseApp();
        state.auth = firebase.auth();
        state.db = firebase.firestore();
        await state.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

        return new Promise((resolve, reject) => {
            const unsubscribe = state.auth.onAuthStateChanged(
                async (user) => {
                    try {
                        state.user = user || null;
                        state.profile = user ? await loadProfile(user) : null;
                        state.initialized = true;
                        emit();
                        unsubscribe();
                        resolve({ initialized: true, user: state.user, profile: state.profile });
                    } catch (error) {
                        unsubscribe();
                        reject(error);
                    }
                },
                (error) => { unsubscribe(); reject(error); }
            );
        });
    }

    async function signInWithGoogle() {
        ensureFirebaseApp();
        if (!state.auth) {
            state.auth = firebase.auth();
            state.db = firebase.firestore();
        }

        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });

        try {
            const result = await state.auth.signInWithPopup(provider);
            state.user = result.user || null;
            state.profile = state.user ? await loadProfile(state.user) : null;
            state.initialized = true;
            emit();
            return { user: state.user, profile: state.profile };
        } catch (error) {
            if (error?.code === "auth/popup-blocked" || error?.code === "auth/cancelled-popup-request") {
                await state.auth.signInWithRedirect(provider);
                return { user: null, profile: null, redirecting: true };
            }
            throw error;
        }
    }

    async function signOutUser() {
        if (!state.auth) return;
        await state.auth.signOut();
        state.user = null;
        state.profile = null;
        emit();
    }

    function onAuthStateChanged(listener) {
        if (typeof listener !== "function") return () => {};
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
    }

    function getCurrentUser() { return state.user; }
    function getCurrentUserProfile() { return state.profile; }
    function isAuthenticated() { return Boolean(state.user && state.profile?.enabled); }
    function isOwner() { return state.profile?.enabled === true && state.profile?.role === "owner"; }
    function isEditor() { return state.profile?.enabled === true && state.profile?.role === "editor"; }

    window.SmartDragonAuth = Object.freeze({
        initialize: initializeAuth,
        signInWithGoogle,
        signOut: signOutUser,
        onAuthStateChanged,
        getCurrentUser,
        getCurrentUserProfile,
        isAuthenticated,
        isOwner,
        isEditor
    });
})();

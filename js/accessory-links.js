/**
 * Smart Dragon Inventory
 * Accessory Links Adapter
 *
 * Uses the shared Firestore data layer to read the existing
 * public `cars` collection. No second Firebase SDK instance
 * is created in the customer page.
 */
window.SmartDragonAccessoryLinks =
(() => {
    "use strict";

    function validateSmartDragonUrl(value) {
        if (!value) return null;

        try {
            const url = new URL(String(value));
            if (url.protocol !== "https:" && url.protocol !== "http:") {
                return null;
            }

            const hostname = url.hostname.toLowerCase();
            const allowed =
                hostname === "smartdragonjo.com" ||
                hostname === "www.smartdragonjo.com" ||
                hostname.endsWith(".smartdragonjo.com");

            return allowed ? url.href : null;
        } catch {
            return null;
        }
    }

    async function findLink(make, model) {
        const api = window.SmartDragonFirestore;
        if (!api?.getAccessoriesLink) {
            throw new Error("Smart Dragon Firestore data layer is not available.");
        }

        const storedUrl = await api.getAccessoriesLink(make, model);
        const safeUrl = validateSmartDragonUrl(storedUrl);
        return safeUrl ? { url: safeUrl, carId: null } : null;
    }

    function removeOldButton() {
        document.getElementById("vehicleAccessoryLink")?.remove();
    }

    async function renderForVehicle(vehicle) {
        removeOldButton();

        if (!vehicle?.make || !vehicle?.model) return;

        try {
            const match = await findLink(vehicle.make, vehicle.model);
            if (!match) return;

            const container = document.getElementById("resultsContainer");
            if (!container) return;

            const wrapper = document.createElement("div");
            wrapper.id = "vehicleAccessoryLink";
            wrapper.className = "vehicle-accessory-link";

            const link = document.createElement("a");
            link.href = match.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.className = "vehicle-accessory-link__button";
            link.textContent = "تعرف على الإكسسوارات المخصصة لسيارتك";

            wrapper.appendChild(link);
            container.appendChild(wrapper);
        } catch (error) {
            console.error(
                "[Smart Dragon] Failed to retrieve accessory link from Firestore.",
                error
            );
        }
    }

    return Object.freeze({
        renderForVehicle,
        findLink,
        clearCache() {
            // Shared Firestore layer manages its own caches.
        }
    });
})();

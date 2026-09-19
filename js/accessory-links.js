/**
 * =========================================================
 * Smart Dragon Inventory
 * Firebase Accessory Links Adapter
 * =========================================================
 *
 * Reads the EXISTING Firestore collection:
 *
 * cars
 *
 * Existing approximate structure:
 *
 * {
 *   car: "Toyota",
 *   model: "Fortuner",
 *   year: "...",
 *   url: "https://smartdragonjo.com/..."
 * }
 *
 * This module:
 * - READS ONLY.
 * - Does not write to Firebase.
 * - Does not authenticate users.
 * - Does not guess URLs.
 * - Uses the real URL stored in Firestore.
 */


window.SmartDragonAccessoryLinks =
(() => {

    /**
     * Firebase SDK version.
     *
     * Same generation already used by
     * Smart Dragon Search.
     */
    const FIREBASE_VERSION =
        "10.7.1";


    let firestoreDb =
        null;


    let carsCache =
        null;


    let firebaseModulesPromise =
        null;


    /**
     * Normalize values only for matching.
     *
     * Original Firestore values are never modified.
     */
    function normalize(value) {

        return String(
            value ?? ""
        )
            .trim()
            .replace(
                /\s+/g,
                " "
            )
            .toLocaleLowerCase();
    }


    /**
     * Validate a stored destination URL.
     *
     * Only Smart Dragon domains are accepted.
     */
    function validateSmartDragonUrl(
        value
    ) {

        if (!value) {
            return null;
        }


        try {

            const url =
                new URL(
                    String(value)
                );


            if (
                url.protocol !==
                    "https:" &&
                url.protocol !==
                    "http:"
            ) {
                return null;
            }


            const hostname =
                url.hostname
                    .toLowerCase();


            const allowed =
                hostname ===
                    "smartdragonjo.com" ||

                hostname ===
                    "www.smartdragonjo.com" ||

                hostname.endsWith(
                    ".smartdragonjo.com"
                );


            if (!allowed) {

                console.warn(
                    "[Smart Dragon] Ignored accessory URL outside smartdragonjo.com:",
                    url.href
                );

                return null;
            }


            return url.href;

        } catch {

            return null;
        }
    }


    /**
     * Dynamically load Firebase modules.
     *
     * No build system is required.
     */
    async function loadFirebaseModules() {

        if (
            firebaseModulesPromise
        ) {
            return firebaseModulesPromise;
        }


        firebaseModulesPromise =
            Promise.all([

                import(
                    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`
                ),

                import(
                    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`
                )
            ])
            .then(
                ([
                    appModule,
                    firestoreModule
                ]) => {

                    return {
                        appModule,
                        firestoreModule
                    };
                }
            );


        return firebaseModulesPromise;
    }


    /**
     * Initialize Firestore once.
     */
    async function getFirestoreDb() {

        if (firestoreDb) {
            return firestoreDb;
        }


        const firebaseSettings =
            window
                .SmartDragonFirebaseConfig;


        if (
            !firebaseSettings ||
            !firebaseSettings.enabled ||
            !firebaseSettings.projectConfigured ||
            !firebaseSettings.config
        ) {

            throw new Error(
                "Smart Dragon Firebase configuration is not enabled."
            );
        }


        const {
            appModule,
            firestoreModule
        } =
            await loadFirebaseModules();


        const {
            initializeApp,
            getApps,
            getApp
        } =
            appModule;


        const {
            getFirestore
        } =
            firestoreModule;


        const app =
            getApps().length > 0

                ? getApp()

                : initializeApp(
                    firebaseSettings.config
                );


        firestoreDb =
            getFirestore(
                app
            );


        console.info(
            "[Smart Dragon] Firebase Firestore connected in read-only accessory-link mode."
        );


        return firestoreDb;
    }


    /**
     * Load the real cars collection.
     *
     * Cached after the first successful read.
     */
    async function loadCars() {

        if (carsCache) {
            return carsCache;
        }


        const db =
            await getFirestoreDb();


        const {
            firestoreModule
        } =
            await loadFirebaseModules();


        const {
            collection,
            getDocs
        } =
            firestoreModule;


        const firebaseSettings =
            window
                .SmartDragonFirebaseConfig;


        const collectionName =
            firebaseSettings
                ?.collections
                ?.accessoryLinks ||
            "cars";


        const snapshot =
            await getDocs(
                collection(
                    db,
                    collectionName
                )
            );


        const rows =
            [];


        snapshot.forEach(
            (documentSnapshot) => {

                const data =
                    documentSnapshot.data();


                rows.push({

                    id:
                        documentSnapshot.id,

                    car:
                        data?.car ?? "",

                    model:
                        data?.model ?? "",

                    year:
                        data?.year ?? null,

                    url:
                        data?.url ?? null
                });
            }
        );


        carsCache =
            rows;


        console.info(
            `[Smart Dragon] Loaded ${carsCache.length} accessory vehicle records from Firestore.`
        );


        return carsCache;
    }


    /**
     * Find a real stored URL using:
     *
     * vehicle.make + vehicle.model
     */
    async function findLink(
        make,
        model
    ) {

        const normalizedMake =
            normalize(
                make
            );


        const normalizedModel =
            normalize(
                model
            );


        if (
            !normalizedMake ||
            !normalizedModel
        ) {
            return null;
        }


        const cars =
            await loadCars();


        const match =
            cars.find(
                (item) => {

                    return (
                        normalize(
                            item.car
                        ) ===
                            normalizedMake &&

                        normalize(
                            item.model
                        ) ===
                            normalizedModel
                    );
                }
            );


        if (!match) {

            console.info(
                "[Smart Dragon] No accessory page found for:",
                make,
                model
            );

            return null;
        }


        const safeUrl =
            validateSmartDragonUrl(
                match.url
            );


        if (!safeUrl) {

            console.warn(
                "[Smart Dragon] Matching car exists but its URL is missing or invalid:",
                match.id
            );

            return null;
        }


        return {
            url:
                safeUrl,

            carId:
                match.id
        };
    }


    /**
     * Remove a previously rendered button.
     */
    function removeOldButton() {

        const oldElement =
            document.getElementById(
                "vehicleAccessoryLink"
            );


        if (oldElement) {

            oldElement.remove();
        }
    }


    /**
     * Render the direct accessory-page button.
     */
    async function renderForVehicle(
        vehicle
    ) {

        removeOldButton();


        if (
            !vehicle?.make ||
            !vehicle?.model
        ) {

            return;
        }


        try {

            const match =
                await findLink(
                    vehicle.make,
                    vehicle.model
                );


            if (!match) {

                return;
            }


            const container =
                document.getElementById(
                    "resultsContainer"
                );


            if (!container) {

                return;
            }


            const wrapper =
                document.createElement(
                    "div"
                );


            wrapper.id =
                "vehicleAccessoryLink";


            wrapper.className =
                "vehicle-accessory-link";


            const link =
                document.createElement(
                    "a"
                );


            /**
             * IMPORTANT:
             *
             * This is the REAL URL stored
             * in Firestore cars/{document}.
             *
             * It is not generated or guessed.
             */
            link.href =
                match.url;


            link.target =
                "_blank";


            link.rel =
                "noopener noreferrer";


            link.className =
                "vehicle-accessory-link__button";


            link.textContent =
                "تعرف على الإكسسوارات المخصصة لسيارتك";


            wrapper.appendChild(
                link
            );


            container.appendChild(
                wrapper
            );


            console.info(
                "[Smart Dragon] Accessory page matched:",
                {
                    make:
                        vehicle.make,

                    model:
                        vehicle.model,

                    carId:
                        match.carId
                }
            );

        } catch (error) {

            /**
             * Failure here must NOT break
             * the vehicle fitment result.
             */
            console.error(
                "[Smart Dragon] Failed to retrieve accessory link from Firestore.",
                error
            );
        }
    }


    /**
     * Public API.
     */
    return Object.freeze({

        renderForVehicle,

        async findLink(
            make,
            model
        ) {

            return findLink(
                make,
                model
            );
        },


        clearCache() {

            carsCache =
                null;
        }
    });

})();
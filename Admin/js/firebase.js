/**
 * ROSHANI ERP | FIREBASE SERVICE
 * Handles Firebase initialization, database references, and outlet scoping.
 */

import { showToast } from './utils.js';

// Initialize Firebase if not already done
if (!firebase.apps.length) {
    if (window.firebaseConfig) {
        firebase.initializeApp(window.firebaseConfig);



    } else {
        console.error("[Firebase] Configuration missing!");
    }
}

export const db = firebase.database();
export const auth = firebase.auth();

// Initialize App Check (Phase 2.16)
if (window.reCaptchaSiteKey) {
    try {
        const appCheck = firebase.appCheck();
        appCheck.activate(
            new firebase.appCheck.ReCaptchaV3Provider(window.reCaptchaSiteKey),
            true // isTokenAutoRefreshEnabled
        );
        console.log("[App Check] Activated with site key:", window.reCaptchaSiteKey);
    } catch (e) {
        console.error("[App Check] Initialization failed:", e);
    }
}

/**
 * OUTLET SEPARATION HELPER
 * Handles path resolution for multi-outlet data isolation.
 */
export const Outlet = {
    get current() {
        return (window.currentOutlet || 'pizza').toLowerCase();
    },
    ref(path) {
        if (!path) return db.ref();

        // Shared paths that stay at root level
        const shared = ['admins', 'riders', 'riderStats', 'botStatus', 'migrationStatus', 'bot', 'logs'];
        const rootPath = path.split('/')[0];

        if (shared.includes(rootPath)) return db.ref(path);

        // Outlet-specific paths
        return db.ref(`${this.current}/${path}`);
    }
};

/**
 * FILE UPLOAD UTILITY (Base64)
 * Converts images to compressed Base64 for database storage.
 */
export async function uploadImage(fileOrBlob, path) {
    if (!fileOrBlob) return null;
    console.log(`[Database Store] Converting ${path || 'image'} to text-based Base64...`);

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(fileOrBlob);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 600;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = (MAX_WIDTH / width) * height;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                console.log(`[Database Store] Image converted. Size: ${(dataUrl.length / 1024).toFixed(1)} KB`);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(new Error("Image processing failed"));
        };
        reader.onerror = (err) => reject(new Error("File reading failed"));
    });
}

export async function deleteImage(url) {
    if (!url) return;
    if (url.includes("firebasestorage.googleapis.com")) {
        console.log("Old storage image skipped (Storage disabled):", url);
    }
}

/**
 * SECONDARY AUTH FOR RIDER CREATION
 * Prevents admin logout while creating rider accounts.
 */
export let secondaryAuth;
export let secondaryAuthAvailable = false;

export function initSecondaryAuth() {
    try {
        if (!window.firebaseConfig) {
            secondaryAuthAvailable = false;
            return;
        }

        if (firebase.apps.some(app => app.name === "secondary_auth")) {
            secondaryAuth = firebase.app("secondary_auth").auth();
        } else {
            const secondaryApp = firebase.initializeApp(window.firebaseConfig, "secondary_auth");
            secondaryAuth = secondaryApp.auth();
        }

        if (firebase.auth) {
            secondaryAuth.setPersistence(firebase.auth.Auth.Persistence.NONE);
        }
        secondaryAuthAvailable = true;
        console.log("Secondary Auth initialized successfully.");
    } catch (e) {
        console.error("Secondary Auth Init Error:", e);
        secondaryAuthAvailable = false;
    }
}

// Initialize secondary auth immediately
initSecondaryAuth();

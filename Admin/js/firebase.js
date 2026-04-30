/**
 * ROSHANI ERP | FIREBASE SERVICE
 * Handles Firebase initialization, database references, and outlet scoping.
 */

import { showToast } from './ui-utils.js';

// Helper to safely access global firebase (compat mode)
const getFirebase = () => {
    if (typeof firebase !== 'undefined') return firebase;
    if (typeof window.firebase !== 'undefined') return window.firebase;
    return null;
};

export const fb = getFirebase();

if (!fb) {
    console.error("[Firebase] SDK not found! Ensure compat scripts are loaded in index.html.");
    throw new Error("Firebase SDK missing");
}

// Initialize Firebase if not already done
if (!fb.apps.length) {
    if (window.firebaseConfig) {
        fb.initializeApp(window.firebaseConfig);
        console.log("[Firebase] Manual App Init Success");
    } else {
        console.error("[Firebase] Configuration missing! Falling back to empty init.");
        fb.initializeApp({ apiKey: "MISSING", projectId: "MISSING" });
    }
}

export const db = fb.database();
export const auth = fb.auth();
export const ServerValue = fb.database.ServerValue;
export const EmailAuthProvider = fb.auth.EmailAuthProvider;

// Initialize App Check (Phase 2.16)
/*
if (window.reCaptchaSiteKey) {
    try {
        const appCheck = fb.appCheck();
        appCheck.activate(
            new fb.appCheck.ReCaptchaV3Provider(window.reCaptchaSiteKey),
            true // isTokenAutoRefreshEnabled
        );
        console.log("[App Check] Activated with site key:", window.reCaptchaSiteKey);
    } catch (e) {
        console.error("[App Check] Initialization failed:", e);
    }
}
*/

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

        let finalPath;
        if (shared.includes(rootPath)) {
            finalPath = path;
        } else {
            // Outlet-specific paths
            finalPath = `${this.current}/${path}`;
        }
        
        console.log(`[Outlet] Resolving path: "${path}" -> "${finalPath}" (Outlet: ${this.current})`);
        return db.ref(finalPath);
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

        if (fb.apps.some(app => app.name === "secondary_auth")) {
            secondaryAuth = fb.app("secondary_auth").auth();
        } else {
            const secondaryApp = fb.initializeApp(window.firebaseConfig, "secondary_auth");
            secondaryAuth = secondaryApp.auth();
        }

        if (fb.auth) {
            secondaryAuth.setPersistence(fb.auth.Auth.Persistence.NONE);
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

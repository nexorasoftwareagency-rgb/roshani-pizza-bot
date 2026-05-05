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

        // Initialize App Check immediately after app init
        if (fb.appCheck && window.reCaptchaSiteKey) {
            try {
                const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                if (isLocal) {
                    console.log("[App Check] 🛠️ Localhost detected, enabling Debug Token...");
                    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
                }
                const appCheck = fb.appCheck();
                appCheck.activate(
                    new fb.appCheck.ReCaptchaV3Provider(window.reCaptchaSiteKey),
                    true
                );
                console.log("[App Check] ✅ Activated Successfully (Consolidated)");
            } catch (e) {
                console.warn("[App Check] ⚠️ Activation failed:", e);
            }
        }
    } else {
        console.error("[Firebase] Configuration missing! Firing fatal error.");
        throw new Error("Firebase configuration (window.firebaseConfig) is missing. Check firebase-config.js.");
    }
}

export const db = fb.database();
export const auth = fb.auth();
export const ServerValue = fb.database.ServerValue;
export const EmailAuthProvider = fb.auth.EmailAuthProvider;

// Monitor Connection State
const connectedRef = db.ref('.info/connected');
connectedRef.on('value', (snap) => {
    const connected = snap.val() === true;
    console.log(`[Firebase] Connection status: ${connected ? '🟢 Connected' : '🔴 Disconnected'}`);

    const indicator = document.getElementById('syncStatus');
    if (indicator) {
        if (connected) {
            indicator.classList.remove('disconnected', 'connecting');
            indicator.classList.add('connected');
            indicator.title = "Firebase: Connected";
        } else {
            indicator.classList.remove('connected', 'connecting');
            indicator.classList.add('disconnected');
            indicator.title = "Firebase: Disconnected - Check Network";
        }
    }

    if (typeof updateConnectionIndicator === 'function') {
        updateConnectionIndicator(connected);
    }

    if (!connected) {
        console.warn('[Firebase] Lost connection - data may not sync. Retrying...');
        // Proactively try to reconnect
        setTimeout(() => {
            if (db) db.goOnline();
        }, 5000);
    } else {
        console.log('[Firebase] Connection restored.');
    }
});

// Proactive Connection Heartbeat (Every 30 seconds)
setInterval(() => {
    if (db) {
        db.ref('.info/connected').once('value', snap => {
            if (!snap.val()) {
                console.log("[Firebase Heartbeat] Disconnected, forcing online...");
                db.goOnline();
            }
        });
    }
}, 30000);

// Test database connectivity
setTimeout(() => {
    console.log("[Firebase] Testing database connectivity...");
    db.ref('test').once('value')
        .then(snap => console.log("[Firebase] Database test successful:", snap.val() || "null"))
        .catch(err => console.error("[Firebase] Database test failed:", err));
}, 2000);

// Diagnostic function for debugging data loading issues
window.diagnoseDatabase = async () => {
    console.log("🔍 DATABASE DIAGNOSTIC START");
    console.log("1. Firebase initialized:", !!fb);
    console.log("2. Database reference:", !!db);
    console.log("3. Current user:", auth.currentUser?.email || "Not logged in");
    console.log("4. Current outlet:", window.currentOutlet || "Not set");
    console.log("5. Outlet resolved path:", Outlet.ref("orders").toString());

    // Test basic connectivity
    try {
        const testRef = db.ref('.info/connected');
        const connected = (await testRef.once('value')).val();
        console.log("6. Connection status:", connected ? "🟢 Connected" : "🔴 Disconnected");
    } catch (e) {
        console.error("6. Connection test failed:", e);
    }

    // Test admin access
    if (auth.currentUser) {
        try {
            const adminSnap = await Outlet.ref(`admins/${auth.currentUser.uid}`).once('value');
            console.log("7. Admin data exists:", adminSnap.exists());
            console.log("8. Admin data:", adminSnap.val());
        } catch (e) {
            console.error("7. Admin data fetch failed:", e);
        }
    }

    // Test orders access
    try {
        const ordersRef = Outlet.ref("orders");
        const ordersSnap = await ordersRef.limitToLast(1).once('value');
        console.log("9. Orders path:", ordersRef.path.toString());
        console.log("10. Orders accessible:", ordersSnap.exists());
        console.log("11. Sample order count:", ordersSnap.numChildren());
        if (ordersSnap.exists()) {
            console.log("12. Sample order data:", Object.keys(ordersSnap.val())[0]);
        }
    } catch (e) {
        console.error("9. Orders fetch failed:", e);
    }

    console.log("🔍 DATABASE DIAGNOSTIC COMPLETE");
    console.log("💡 If issues found, check Firebase Console and database rules");
};

/**
 * OUTLET SEPARATION HELPER
 * Handles path resolution for multi-outlet data isolation.
 */
export const Outlet = {
    get current() {
        // Fallback chain: Window -> SessionStorage -> Default
        let outlet = window.currentOutlet || sessionStorage.getItem('adminSelectedOutlet') || 'pizza';
        outlet = outlet.toLowerCase().trim();
        if (!outlet) outlet = 'pizza';
        return outlet;
    },
    ref(path) {
        if (!path) return db.ref();

        // Shared paths that stay at root level
        const globalPaths = ['admins', 'riders', 'logs', 'bot', 'riderStats', 'migrationStatus', 'admins_list'];

        // Normalize path and get first segment
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        const firstSegment = cleanPath.split('/')[0];
        
        let finalPath;

        // If path is global, do not prefix
        if (globalPaths.includes(firstSegment)) {
            finalPath = cleanPath;
            console.log(`[Outlet] Global Path: "${path}" -> "${finalPath}"`);
        } else {
            // All other paths are outlet-specific
            finalPath = `${this.current}/${cleanPath}`;
            console.log(`[Outlet] Scoped Path: "${path}" -> "${finalPath}" (Outlet: ${this.current})`);
        }

        return db.ref(finalPath);
    }
};

// Emergency debugging tool
window.forceOutlet = (name) => {
    console.warn(`[Outlet] EMERGENCY OVERRIDE: ${name}`);
    window.currentOutlet = name;
    sessionStorage.setItem('adminSelectedOutlet', name);
    if (window.diagnoseDatabase) window.diagnoseDatabase();
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

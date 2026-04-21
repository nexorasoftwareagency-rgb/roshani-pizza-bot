const admin = require('firebase-admin');

// =============================
// FIREBASE CONFIG
// =============================
const FIREBASE_URL = "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com";

// Try to load service account from file
try {
    const fs = require('fs');
    const path = require('path');
    const serviceAccountPath = path.join(__dirname, 'service-account.json');
    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: FIREBASE_URL
            });
        }
    } else {
        // No service account file - use default
        if (!admin.apps.length) {
            admin.initializeApp({
                databaseURL: FIREBASE_URL
            });
        }
    }
} catch (e) {
    console.log("Firebase init:", e.message);
    if (!admin.apps.length) {
        admin.initializeApp({
            databaseURL: FIREBASE_URL
        });
    }
}

const db = admin.database();

/**
 * Resolves a database path based on the selected outlet.
 * @param {string} path - The relative path.
 * @param {string} [outlet='pizza'] - The outlet ID.
 */
function resolvePath(path, outlet = 'pizza') {
    if (!path) return '';
    
    // Shared nodes that remain at root level
    const shared = ['admins', 'settings', 'uiConfig', 'appConfig', 'Menu', 'botStatus', 'migrationStatus', 'bot'];
    const rootNode = path.split('/')[0];

    // If already absolute or shared, return as is
    if (shared.includes(rootNode)) return path;
    
    // Default to outlet-prefixed path
    return `${outlet}/${path}`;
}

// =============================
// HELPERS
// =============================

async function getData(path, outlet = 'pizza') {
    try {
        const resolved = resolvePath(path, outlet);
        const snap = await db.ref(resolved).once('value');
        return snap.val();
    } catch (err) {
        console.error("GET ERROR:", err, "Path:", path);
        return null;
    }
}

async function setData(path, data, outlet = 'pizza') {
    try {
        const resolved = resolvePath(path, outlet);
        await db.ref(resolved).set(data);
    } catch (err) {
        console.error("SET ERROR:", err, "Path:", path);
    }
}

async function updateData(path, data, outlet = 'pizza') {
    try {
        const resolved = resolvePath(path, outlet);
        await db.ref(resolved).update(data);
    } catch (err) {
        console.error("UPDATE ERROR:", err, "Path:", path);
    }
}

async function deleteData(path, outlet = 'pizza') {
    try {
        const resolved = resolvePath(path, outlet);
        await db.ref(resolved).remove();
    } catch (err) {
        console.error("DELETE ERROR:", err, "Path:", path);
    }
}

// =============================
// EXPORT
// =============================
module.exports = {
    db,
    resolvePath,
    getData,
    setData,
    updateData,
    deleteData
};

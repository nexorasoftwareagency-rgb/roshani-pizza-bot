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
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: FIREBASE_URL
        });
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

// =============================
// HELPERS
// =============================

async function getData(path) {
    try {
        const snap = await db.ref(path).once('value');
        return snap.val();
    } catch (err) {
        console.error("GET ERROR:", err);
        return null;
    }
}

async function setData(path, data) {
    try {
        await db.ref(path).set(data);
    } catch (err) {
        console.error("SET ERROR:", err);
    }
}

async function updateData(path, data) {
    try {
        await db.ref(path).update(data);
    } catch (err) {
        console.error("UPDATE ERROR:", err);
    }
}

async function deleteData(path) {
    try {
        await db.ref(path).remove();
    } catch (err) {
        console.error("DELETE ERROR:", err);
    }
}

// =============================
// EXPORT
// =============================
module.exports = {
    db,
    getData,
    setData,
    updateData,
    deleteData
};

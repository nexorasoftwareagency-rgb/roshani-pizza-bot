const admin = require('firebase-admin');

// =============================
// FIREBASE CONFIG
// =============================
const FIREBASE_URL = "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com";

if (!admin.apps.length) {
    admin.initializeApp({
        databaseURL: FIREBASE_URL
    });
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
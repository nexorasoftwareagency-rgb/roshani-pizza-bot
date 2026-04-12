// =============================
// FIREBASE CONFIG
// =============================
const firebaseConfig = {
    apiKey: "YOUR_API_KEY", // Please replace with your actual API Key
    authDomain: "prashant-pizza-e86e4.firebaseapp.com",
    databaseURL: "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com",
    projectId: "prashant-pizza-e86e4",
    storageBucket: "prashant-pizza-e86e4.appspot.com",
    messagingSenderId: "XXXX",
    appId: "XXXX"
};

// =============================
// INITIALIZE FIREBASE
// =============================
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();
const auth = firebase.auth();

// =============================
// DATABASE HELPERS
// =============================

// GET DATA (once)
async function getData(path) {
    try {
        const snap = await db.ref(path).once('value');
        return snap.val();
    } catch (err) {
        console.error("GET ERROR:", err);
        return null;
    }
}

// SET DATA (overwrite)
async function setData(path, data) {
    try {
        await db.ref(path).set(data);
    } catch (err) {
        console.error("SET ERROR:", err);
    }
}

// UPDATE DATA (partial)
async function updateData(path, data) {
    try {
        await db.ref(path).update(data);
    } catch (err) {
        console.error("UPDATE ERROR:", err);
    }
}

// DELETE DATA
async function deleteData(path) {
    try {
        await db.ref(path).remove();
    } catch (err) {
        console.error("DELETE ERROR:", err);
    }
}

// REALTIME LISTENER
function onValue(path, callback) {
    db.ref(path).on('value', (snap) => {
        callback(snap.val());
    });
}

// =============================
// GLOBAL EXPORT (FOR app.js)
// =============================
window.db = db;
window.auth = auth;
window.getData = getData;
window.setData = setData;
window.updateData = updateData;
window.deleteData = deleteData;
window.onValue = onValue;
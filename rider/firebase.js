const firebaseConfig = {
  apiKey: "AIzaSyAAHuSGwulRO3QhrOD4zK3ZRISivBi7jOM",
  authDomain: "prashant-pizza-e86e4.firebaseapp.com",
  databaseURL: "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com",
  projectId: "prashant-pizza-e86e4",
  storageBucket: "prashant-pizza-e86e4.firebasestorage.app",
  messagingSenderId: "857471482885",
  appId: "1:857471482885:web:9eb8bbb90c77c588fbb06c"
};
window.firebaseConfig = firebaseConfig;

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
        throw err;
    }
}

// SET DATA (overwrite)
async function setData(path, data) {
    try {
        await db.ref(path).set(data);
    } catch (err) {
        console.error("SET ERROR:", err);
        throw err;
    }
}

// UPDATE DATA (partial)
async function updateData(path, data) {
    try {
        await db.ref(path).update(data);
    } catch (err) {
        console.error("UPDATE ERROR:", err);
        throw err;
    }
}

// DELETE DATA
async function deleteData(path) {
    try {
        await db.ref(path).remove();
    } catch (err) {
        console.error("DELETE ERROR:", err);
        throw err;
    }
}

// REALTIME LISTENER
function onValue(path, callback) {
    const ref = db.ref(path);
    const cb = ref.on('value', (snap) => {
        callback(snap.val());
    });
    return () => ref.off('value', cb);
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
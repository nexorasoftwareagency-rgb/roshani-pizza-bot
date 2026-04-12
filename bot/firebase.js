const fetch = require('node-fetch');

// =============================
// FIREBASE CONFIG
// =============================
const FIREBASE_URL = "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com";

// =============================
// GET DATA
// =============================
async function getData(path) {
    try {
        const res = await fetch(`${FIREBASE_URL}/${path}.json`);
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.error("GET ERROR:", err);
        return null;
    }
}

// =============================
// SET DATA (overwrite)
// =============================
async function setData(path, data) {
    try {
        await fetch(`${FIREBASE_URL}/${path}.json`, {
            method: "PUT",
            body: JSON.stringify(data)
        });
    } catch (err) {
        console.error("SET ERROR:", err);
    }
}

// =============================
// UPDATE DATA (partial)
// =============================
async function updateData(path, data) {
    try {
        await fetch(`${FIREBASE_URL}/${path}.json`, {
            method: "PATCH",
            body: JSON.stringify(data)
        });
    } catch (err) {
        console.error("UPDATE ERROR:", err);
    }
}

// =============================
// DELETE DATA
// =============================
async function deleteData(path) {
    try {
        await fetch(`${FIREBASE_URL}/${path}.json`, {
            method: "DELETE"
        });
    } catch (err) {
        console.error("DELETE ERROR:", err);
    }
}

// =============================
// EXPORT
// =============================
module.exports = {
    FIREBASE_URL,
    getData,
    setData,
    updateData,
    deleteData
};
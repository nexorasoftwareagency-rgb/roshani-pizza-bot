/**
 * RIDER Firebase initialization — single source of truth for the rider app.
 * Uses inline firebaseConfig (rider runs independently from Admin).
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, onValue, get, set, update, runTransaction, query, orderByChild, equalTo, off, serverTimestamp, remove, limitToLast, push, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";

// Firebase config — the real values are in this file (not shared/firebase-config.js)
// because the rider project ID differs from the Admin project ID.
// TODO: reconcile project IDs or use env-based config.
const firebaseConfig = {
    apiKey: "AIzaSyDcx-SN5eak8PAs-8NtTGelJ_sICr5yb7Y",
    authDomain: "prashant-pizza-e86e4.firebaseapp.com",
    databaseURL: "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com",
    projectId: "prashant-pizza-e86e4",
    storageBucket: "prashant-pizza-e86e4.firebasestorage.app",
    messagingSenderId: "857471482885",
    appId: "1:857471482885:web:9eb8bbb90c77c588fbb06c"
};

const reCaptchaSiteKey = "6LeAlcwsAAAAAH4F3p5aCNvyPlhC3BRHOXTdDEGK";

let app, auth, db, dbStorage, messaging;

try {
    app = initializeApp(firebaseConfig);
    initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(reCaptchaSiteKey),
        isTokenAutoRefreshEnabled: true
    });
    console.log("[App Check] Activated for Rider Portal");

    auth = getAuth(app);
    setPersistence(auth, browserLocalPersistence).catch(e => console.error("[Auth] Persistence Error:", e));
    db = getDatabase(app);
    console.log("[Firebase] Modular SDK initialized");

    dbStorage = getStorage(app);
    try {
        messaging = getMessaging(app);
    } catch (e) {
        console.warn("FCM not supported in this browser:", e);
    }
} catch (e) {
    console.error("Firebase Init Error:", e);
}

export { app, auth, db, dbStorage, messaging, ref, onValue, get, set, update, runTransaction, query, orderByChild, equalTo, off, serverTimestamp, remove, limitToLast, push, onDisconnect, storageRef, uploadBytes, getDownloadURL, getToken, onMessage, onAuthStateChanged, signInWithEmailAndPassword, signOut };

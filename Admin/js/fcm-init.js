import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { app, auth, db, ref, update } from './firebase.js';

let messaging = null;
let fcmInitDone = false;

function getMessagingInstance() {
  if (typeof Capacitor !== 'undefined') return null;
  if (!messaging) {
    try {
      messaging = getMessaging(app);
    } catch (e) {
      console.warn('[FCM] Messaging init failed:', e);
    }
  }
  return messaging;
}

async function storeToken(userId, token) {
  try {
    if (userId) {
      await update(ref(db, `admins/${userId}`), { fcmToken: token });
    }
  } catch (e) {
    console.error('[FCM] Failed to store token:', e);
  }
}

function initFCM() {
  if (fcmInitDone) return;
  const msg = getMessagingInstance();
  if (!msg) return;
  fcmInitDone = true;

  onMessage(msg, (payload) => {
    const title = payload.notification?.title || 'New Alert';
    const body = payload.notification?.body || '';
    if (window.showToast) {
      window.showToast(`${title}: ${body}`, 'info');
    }
  });
}

initFCM();

export async function setupAdminFCM(userId) {
  if (!('Notification' in window) || !userId) return;

  try {
    const m = getMessagingInstance();
    if (!m) return;

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // getToken() requires an active service worker. Wait for one to be
      // ready before calling, so we don't throw "no active Service Worker"
      // when the SW hasn't finished installing yet.
      if ('serviceWorker' in navigator) {
        try {
          const reg = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error('SW ready timeout')), 4000))
          ]);
          const token = await getToken(m, { serviceWorkerRegistration: reg });
          if (token) await storeToken(userId, token);
        } catch (swErr) {
          console.warn('[FCM] No active service worker; push notifications disabled. Foreground messages still work via onMessage.');
        }
      } else {
        const token = await getToken(m);
        if (token) await storeToken(userId, token);
      }
    }
  } catch (e) {
    console.error('[FCM] Setup error:', e);
  }
}

export async function refreshFCMToken(userId) {
  try {
    const m = getMessagingInstance();
    if (!m || !userId) return;
    if ('serviceWorker' in navigator) {
      try {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) => setTimeout(() => reject(new Error('SW ready timeout')), 4000))
        ]);
        const token = await getToken(m, { serviceWorkerRegistration: reg });
        if (token) await storeToken(userId, token);
        return;
      } catch (swErr) {
        // fall through
      }
    }
    const token = await getToken(m);
    if (token) await storeToken(userId, token);
  } catch (e) {
    console.error('[FCM] Refresh error:', e);
  }
}

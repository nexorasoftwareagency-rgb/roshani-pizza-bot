import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { app, auth, db, ref, update } from './firebase.js';
import { showToast } from '../../shared/dom/modal.js';

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
    const data = payload.data || {};
    const title = data.title || payload.notification?.title || 'New Alert';
    const body = data.body || payload.notification?.body || '';
    showToast(`${title}: ${body}`, 'info');
  });
}

initFCM();

// When a new SW takes over, refresh FCM token for the next login
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[FCM] New SW activated, token will refresh on next setup');
  });
}

async function subscribeAndStore(userId) {
  const m = getMessagingInstance();
  if (!m || !userId) return false;
  if ('serviceWorker' in navigator) {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('SW ready timeout')), 4000))
    ]);
    const token = await getToken(m, { serviceWorkerRegistration: reg });
    if (token) { await storeToken(userId, token); return true; }
  } else {
    const token = await getToken(m);
    if (token) { await storeToken(userId, token); return true; }
  }
  return false;
}

export async function setupAdminFCM(userId) {
  if (!('Notification' in window) || !userId) return;
  try {
    // Try to subscribe during page load (works if subscription already exists)
    const gotToken = await subscribeAndStore(userId);
    // If subscribe failed (no subscription, needs user gesture), try again on click
    const permission = Notification.permission;
    if (!gotToken || permission === 'default') {
      const onClick = () => {
        subscribeAndStore(userId);
        if (permission === 'default') {
          Notification.requestPermission().then(p => {
            if (p === 'granted') console.log('[FCM] Notification permission granted');
          });
        }
        document.removeEventListener('click', onClick);
      };
      document.addEventListener('click', onClick, { once: true });
    }
  } catch (e) {
    console.error('[FCM] Setup error:', e);
  }
}

export async function refreshFCMToken(userId) {
  await subscribeAndStore(userId);
}

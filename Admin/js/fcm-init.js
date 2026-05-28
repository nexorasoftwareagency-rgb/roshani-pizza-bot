let messaging = null;

function getMessaging() {
  if (typeof Capacitor !== 'undefined') return null;
  if (!messaging && typeof firebase !== 'undefined') {
    messaging = firebase.messaging();
  }
  return messaging;
}

function getDb() {
  return typeof firebase !== 'undefined' ? firebase.database() : null;
}

async function storeToken(userId, token) {
  try {
    const db = getDb();
    if (db && userId) {
      await db.ref(`admins/${userId}`).update({ fcmToken: token });
    }
  } catch (e) {
    console.error('[FCM] Failed to store token:', e);
  }
}

const msg = getMessaging();
if (msg) {
  msg.onTokenRefresh(async () => {
    const user = firebase.auth()?.currentUser;
    if (!user) return;
    try {
      const t = await msg.getToken();
      if (t) await storeToken(user.uid, t);
    } catch (e) {
      console.error('[FCM] Token refresh error:', e);
    }
  });

  msg.onMessage((payload) => {
    const title = payload.notification?.title || 'New Alert';
    const body = payload.notification?.body || '';
    if (window.showToast) {
      window.showToast(`${title}: ${body}`, 'info');
    }
  });
}

export async function setupAdminFCM(userId) {
  if (!('Notification' in window) || !userId) return;

  try {
    const m = getMessaging();
    if (!m) return;

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await m.getToken();
      if (token) await storeToken(userId, token);
    }
  } catch (e) {
    console.error('[FCM] Setup error:', e);
  }
}

export async function refreshFCMToken(userId) {
  try {
    const m = getMessaging();
    if (!m || !userId) return;
    const token = await m.getToken();
    if (token) await storeToken(userId, token);
  } catch (e) {
    console.error('[FCM] Refresh error:', e);
  }
}

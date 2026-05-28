import { db, ref, get } from './firebase.js';

const FCM_SERVER_KEY = window.firebaseConfig?.fcmServerKey || '';

export async function sendFCM(token, title, body, data = {}) {
    if (!FCM_SERVER_KEY || !token) return;
    try {
        const res = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `key=${FCM_SERVER_KEY}`
            },
            body: JSON.stringify({
                to: token,
                notification: { title, body },
                data: { click_action: 'FLUTTER_NOTIFICATION_CLICK', ...data }
            })
        });
        if (!res.ok) {
            const text = await res.text();
            console.error('[FCM] Send failed:', res.status, text);
        }
    } catch (e) {
        console.error('[FCM] Error:', e);
    }
}

export async function sendToRider(riderId, title, body, data = {}) {
    try {
        const snap = await get(ref(db, `riders/${riderId}`));
        const rider = snap.val();
        const token = rider?.fcmToken;
        if (token) {
            await sendFCM(token, title, body, data);
        }
    } catch (e) {
        console.error('[FCM] sendToRider error:', e);
    }
}

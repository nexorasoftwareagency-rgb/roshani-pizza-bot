/**
 * SHARED RIDER NOTIFICATION WRITER — single source for riders/${uid}/notifications.
 *
 * Usage (browser ESM):
 *   import { addRiderNotification } from '../shared/notifications.js';
 *   // uses firebase.js from the consuming app via globalThis.__fb
 *
 * Usage (bot CJS): see addInAppNotification wrapper in bot/src/notifications.js
 *
 * NOTE: This module uses Date.now() for timestamps to stay Firebase-agnostic.
 *       For server-side timestamps, callers should use serverTimestamp() from
 *       the Firebase SDK directly in their own wrapper.
 */

/**
 * Write an in-app notification to riders/${uid}/notifications.
 *
 * @param {string} uid - Rider's Firebase UID
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {string} type - Category: 'info', 'new', 'delivered', 'settlement', 'success'
 * @param {object} dbRef - A firebase database ref helper (must provide push + set)
 *   For browser: pass { push: firebasePush, set: firebaseSet, ref: firebaseRef, db }
 *   For bot: pass { setData: botSetData }
 */
export function buildRiderNotificationPayload(uid, title, body, type = 'info') {
    const icon = type === 'new' ? 'package' : type === 'settlement' ? 'wallet' : 'bell';
    return {
        title,
        body: body || 'New update available',
        type,
        icon,
        timestamp: Date.now(),
        read: false
    };
}

/**
 * Browser-side helper — requires the consuming app's firebase db + helpers to be
 * passed in. This keeps the module decoupled from any specific firebase import.
 *
 * @example
 *   import { ref, push, set, db } from '../Admin/js/firebase.js';
 *   import { writeRiderNotification } from '../shared/notifications.js';
 *   await writeRiderNotification(db, ref, push, set, uid, title, body, type);
 */
export async function writeRiderNotification(db, refFn, pushFn, setFn, uid, title, body, type = 'info') {
    if (!uid) return;
    try {
        const notifRef = pushFn(refFn(db, `riders/${uid}/notifications`));
        await setFn(notifRef, {
            id: notifRef.key,
            ...buildRiderNotificationPayload(uid, title, body, type)
        });
    } catch (e) {
        console.warn('[Rider Notif] Failed:', e);
    }
}

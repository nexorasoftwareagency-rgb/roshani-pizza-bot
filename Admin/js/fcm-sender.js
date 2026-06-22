/**
 * FCM Sender — DEPRECATED STUB.
 *
 * Push notifications are now handled by Firebase Cloud Functions:
 *   functions/index.js → onOrderUpdate (rider assignment + status changes)
 *   functions/index.js → onNewOrder (admin notifications)
 *
 * Deploy with: firebase deploy --only functions
 *
 * This file is kept for backward compatibility but all functions are no-ops.
 */

let _warned = false;

export async function sendFCM(token, title, body, data = {}) {
    if (!_warned) {
        console.warn('[FCM] sendFCM is deprecated. Push notifications are now handled by Cloud Functions (functions/index.js).');
        _warned = true;
    }
}

export async function sendToRider(riderId, title, body, data = {}) {
    if (!_warned) {
        console.warn('[FCM] sendToRider is deprecated. Push notifications are now handled by Cloud Functions (functions/index.js).');
        _warned = true;
    }
}

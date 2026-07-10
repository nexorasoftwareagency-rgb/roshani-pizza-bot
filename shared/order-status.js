/**
 * SHARED ORDER STATUS — single source of truth for all 3 surfaces (Admin, Rider, Bot).
 *
 * Usage:
 *   import { STATUS_SEQUENCE, STATUS_SEQUENCES, STATUS_WEIGHT, isLiveStatus, normalizeStatus }
 *     from '../shared/order-status.js';
 */

/**
 * Canonical delivery status sequence (online orders).
 */
export const STATUS_SEQUENCE = [
    "Placed",
    "Confirmed",
    "Ready",
    "Arriving at Restaurant",
    "Arrived at Restaurant",
    "Picked Up",
    "Out for Delivery",
    "Reached Drop Location",
    "Delivered"
];

/**
 * Per-type sequences.
 */
export const STATUS_SEQUENCES = {
    'Online': STATUS_SEQUENCE,
    'Dine-in': ["Placed", "Confirmed", "Ready", "Delivered"],
    'Default': STATUS_SEQUENCE
};

/**
 * Canonical status → numeric weight (for sorting / progress bars).
 * Higher = further along in the delivery lifecycle.
 */
export const STATUS_WEIGHT = {
    "new": 0, "pending": 0, "placed": 0, "cancelled": 0,
    "confirmed": 1,
    "ready": 2, "cooked": 2, "preparing": 2, "in kitchen": 2, "packed": 2,
    "arriving at restaurant": 3, "arrived at restaurant": 3, "arrived at outlet": 3,
    "picked up": 4,
    "out for delivery": 4,
    "reached drop location": 5,
    "delivered": 6, "served": 6
};

/**
 * Statuses that count as "live" (actively in progress).
 */
export const LIVE_STATUSES = [
    "Placed", "Confirmed", "Ready",
    "Arriving at Restaurant", "Arrived at Restaurant",
    "Picked Up", "Out for Delivery", "Reached Drop Location",
    "Pending", "New", "Dispatched"
];

/**
 * Returns true if the given status is a "live" (in-progress) status.
 */
export function isLiveStatus(status) {
    const lower = String(status || '').toLowerCase();
    return LIVE_STATUSES.some(s => s.toLowerCase() === lower);
}

/**
 * Normalize a status string to its canonical form.
 * Maps aliases like "Cooked" → "Ready", "Served" → "Delivered", etc.
 */
const STATUS_ALIASES = {
    "cooked": "Ready",
    "preparing": "Ready",
    "in kitchen": "Ready",
    "packed": "Ready",
    "new": "Placed",
    "pending": "Placed",
    "served": "Delivered",
    "arrived at outlet": "Arrived at Restaurant"
};

export function normalizeStatus(status) {
    if (!status) return '';
    const trimmed = String(status).trim();
    const lower = trimmed.toLowerCase();
    return STATUS_ALIASES[lower] || trimmed;
}

/**
 * Get the numeric weight for a status (for sorting / progress bars).
 */
export function getStatusWeight(status) {
    const lower = String(status || '').toLowerCase().trim();
    return STATUS_WEIGHT[lower] ?? -1;
}

/**
 * Get the step index (0-based) for a status in the given sequence type.
 */
export function getStatusStep(status, type = 'Online') {
    const seq = STATUS_SEQUENCES[type] || STATUS_SEQUENCES['Default'];
    const normalized = normalizeStatus(status);
    return seq.indexOf(normalized);
}

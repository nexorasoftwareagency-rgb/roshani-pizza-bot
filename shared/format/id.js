/**
 * SHARED ORDER-ID UTILITIES — single source for short-id display.
 *
 * Usage:
 *   import { shortOrderId } from '../shared/format/id.js';
 *   shortOrderId({ orderId: '20260604-0012' }, 'abc123') → '0012'
 *   shortOrderId({}, 'abc123') → 'C123'   (falls back to Firebase key slice)
 */

const SLICE_LEN = 5;

/**
 * Return the last 5 chars of orderId (or key) as the short display ID.
 * Always uppercased.
 */
export function shortOrderId(order, key) {
    const raw = order?.orderId || key || '';
    const s = String(raw);
    return s.slice(-SLICE_LEN).toUpperCase() || 'N/A';
}

/**
 * Format for display with prefix: "Order #0012"
 */
export function formatOrderRef(order, key) {
    return `#${shortOrderId(order, key)}`;
}

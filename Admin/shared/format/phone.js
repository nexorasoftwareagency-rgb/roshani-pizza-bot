/**
 * SHARED PHONE UTILITIES — single source for Indian phone normalization.
 *
 * Usage:
 *   import { cleanPhone, isValidIndianPhone, toWaMe } from '../shared/format/phone.js';
 */

/**
 * Strip all non-digits and keep last 10. Returns "" on invalid input.
 */
export function cleanPhone(phone) {
    return String(phone || '').replace(/\D/g, '').slice(-10);
}

/**
 * Returns true if the cleaned phone is a valid 10-digit Indian number.
 */
export function isValidIndianPhone(phone) {
    const c = cleanPhone(phone);
    return c.length === 10 && /^[6-9]\d{9}$/.test(c);
}

/**
 * Build a WhatsApp click-to-chat link.
 * toWaMe("9876543210") → "https://wa.me/919876543210"
 */
export function toWaMe(phone) {
    const c = cleanPhone(phone);
    return c ? `https://wa.me/91${c}` : '';
}

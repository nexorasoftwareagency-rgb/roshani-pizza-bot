/**
 * SHARED MONEY FORMATTER — Single source for ₹ / INR display.
 *
 * Usage:
 *   import { formatINR } from '../shared/format/money.js';
 *   formatINR(1234.5)  → "₹1,235"
 *   formatINR(1234.5, { signed: true }) → "+₹1,235"
 *   formatINR(-50, { signed: true }) → "-₹50"
 *   formatINR(0) → "₹0"
 */
export function formatINR(n, { signed = false, showDecimal = false } = {}) {
    const num = Number(n) || 0;
    const abs = Math.abs(num);
    const formatted = showDecimal
        ? abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : Math.round(abs).toLocaleString('en-IN');
    const sign = signed ? (num > 0 ? '+' : num < 0 ? '-' : '') : (num < 0 ? '-' : '');
    return `${sign}₹${formatted}`;
}

/**
 * Convenience for inline template literals.
 * formatRs(1234) → "₹1,234"
 */
export const formatRs = (n) => formatINR(n);

/**
 * For negative amounts (discounts, refunds).
 * formatDelta(-50) → "-₹50"
 */
export const formatDelta = (n) => formatINR(n, { signed: true });

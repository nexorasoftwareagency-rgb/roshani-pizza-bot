/**
 * Menu/js/cart.js
 * Local (in-memory) cart for the CURRENT order being built.
 * This is intentionally separate from the session's running total —
 * the cart only represents items not yet submitted. Once "PLACE ORDER"
 * is pressed, order.js writes the cart to /orders and session.js folds
 * the totals into the session's running bill, then the cart is cleared.
 */

export const Cart = {
    lines: {},   // { lineId: { dishId, name, img, size, addons:[names], qty, unitPrice, instructions } }
};

export function addLine(line) {
    const lineId = `${line.dishId}_${line.size}_${(line.addons || []).join('-')}_${Date.now()}`;
    Cart.lines[lineId] = { ...line, qty: line.qty || 1 };
    window.dispatchEvent(new CustomEvent('cart:changed'));
    return lineId;
}

export function setQty(lineId, qty) {
    if (!Cart.lines[lineId]) return;
    if (qty <= 0) { delete Cart.lines[lineId]; }
    else { Cart.lines[lineId].qty = qty; }
    window.dispatchEvent(new CustomEvent('cart:changed'));
}

export function removeLine(lineId) {
    delete Cart.lines[lineId];
    window.dispatchEvent(new CustomEvent('cart:changed'));
}

export function clearCart() {
    Cart.lines = {};
    window.dispatchEvent(new CustomEvent('cart:changed'));
}

export function lineCount() {
    return Object.values(Cart.lines).reduce((s, l) => s + l.qty, 0);
}

export function subtotal() {
    return Object.values(Cart.lines).reduce((s, l) => s + l.unitPrice * l.qty, 0);
}

export function isEmpty() {
    return Object.keys(Cart.lines).length === 0;
}

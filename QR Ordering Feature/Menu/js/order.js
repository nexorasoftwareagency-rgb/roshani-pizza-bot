/**
 * Menu/js/order.js
 * Places orders into the EXISTING pizza/orders node (Decision #2 — single
 * source of truth, no parallel dineinOrders/qrOrders node).
 *
 * Additional fields written onto the standard order record, exactly as
 * specified in "ORDER STRUCTURE":
 *   type, source, table, tableId, tableToken, sessionId
 *
 * COMPATIBILITY NOTE: the architecture doc's example uses type:"DineIn"
 * (no hyphen). This implementation writes type:"Dine-in" (with hyphen)
 * instead, because the EXISTING Admin/js/features/orders.js already
 * defines STATUS_SEQUENCES['Dine-in'] = ["Confirmed","Ready","Delivered"]
 * and getStatusOptions() branches on that exact literal string. Writing
 * "DineIn" would silently fall through to the default/Online status
 * pipeline in the existing code, breaking the printing/notifications/
 * KDS grouping. Using "Dine-in" makes this order indistinguishable from
 * any other admin-side dine-in order for every existing downstream
 * system, while source:"QR" is added so reports can still tell a
 * QR-originated order apart from a staff-entered POS dine-in order.
 * See the "Compatibility Notes" section of the Commands & Guidance doc
 * for how to change this if you would rather standardize on "DineIn"
 * and update orders.js's STATUS_SEQUENCES key to match.
 */
import { outletRef, push, set } from './firebase.js';
import { Session, attachOrderToSession } from './session.js';
import { Cart, clearCart } from './cart.js';

function round2(n) { return Math.round(n * 100) / 100; }

export async function placeOrder({ taxPercent = 5, taxEnabled = true, serviceChargeEnabled = false, serviceChargeRate = 0, customerName = '', customerPhone = '' } = {}) {
    if (Object.keys(Cart.lines).length === 0) throw new Error('Cart is empty');

    const items = {};
    Object.values(Cart.lines).forEach((l, i) => {
        items[`item_${i}`] = {
            name: l.name + (l.size && l.size !== 'Regular' ? ` (${l.size})` : ''),
            qty: l.qty,
            price: l.unitPrice,
            addons: l.addons || [],
            instructions: l.instructions || ''
        };
    });

    const subtotal = round2(Object.values(Cart.lines).reduce((s, l) => s + l.unitPrice * l.qty, 0));
    const tax = taxEnabled ? round2(subtotal * (taxPercent / 100)) : 0;
    const serviceCharge = serviceChargeEnabled ? round2(subtotal * (serviceChargeRate / 100)) : 0;
    const total = round2(subtotal + tax + serviceCharge);

    const orderPayload = {
        // --- Standard fields every existing order has ---
        status: 'Placed',
        items,
        subtotal, tax, serviceCharge, total,
        paymentStatus: 'Pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),

        // --- Dine-in / QR specific fields (additive only) ---
        type: 'Dine-in',              // see compatibility note above
        source: 'QR',
        table: String(Session.table.number),
        tableId: Session.tableId,
        sessionId: Session.sessionId,

        // --- Optional contact, collected at checkout only ---
        customerName: customerName || '',
        customerPhone: customerPhone || '',
        phone: customerPhone
    };

    const newOrderRef = push(outletRef('orders'));
    await set(newOrderRef, orderPayload);

    // Fold this order's totals into the session's running bill
    await attachOrderToSession(newOrderRef.key, { subtotal, tax, serviceCharge, total });

    clearCart();
    return { orderId: newOrderRef.key, ...orderPayload };
}

/**
 * Menu/js/session.js
 * Implements:
 *   - Decision #5/#6: secure token validation — NEVER trust a ?table= number
 *   - "Active Session Behavior": if a session is already open for the
 *     table, every subsequent QR scan joins that SAME session so a
 *     family of 5 all order into one bill, not five separate ones.
 *   - "Customer App Validation Flow":
 *       Scan QR → Read Token → Validate Token → Find Table →
 *       Load Active Session → (join or create) → Load Menu
 */
import { db, outletRef, get, set, push, update, runTransaction } from './firebase.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

export const Session = {
    table: null,      // { id, number, capacity, status, token, currentSession, ... }
    tableId: null,
    session: null,     // { sessionId, tableId, status, orders:[...], runningTotal, grandTotal, ... }
    sessionId: null,
    _sessionUnsub: null,
};

/**
 * Reads ?t=TOKEN from the URL. Returns null if absent.
 * This is the ONLY table-identifying value ever read from the URL —
 * no ?table=07 style parameter is supported anywhere in this app.
 */
function getTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('t');
}

/**
 * Validates the token against /tables and returns the matching table
 * record, or null if no table has this token (Decision #5/#6).
 *
 * NOTE: this performs a single read of the whole /tables node and
 * filters client-side. This matches the architecture's "One Listener"
 * performance rule — there is no per-table read here, and the lookup
 * only happens once at boot, not on every render.
 */
async function validateToken(token) {
    if (!token) return null;
    const snap = await get(outletRef('tables'));
    const tables = snap.val() || {};
    const entry = Object.entries(tables).find(([, t]) => t.token === token && t.active !== false);
    if (!entry) return null;
    return { id: entry[0], ...entry[1] };
}

/**
 * Join-or-create logic (the "Active Session Behavior" spec):
 *   - If table.currentSession already points to an open session, join it.
 *   - Otherwise, create a new tableSessions/{sessionId} and point the
 *     table at it.
 * Uses a transaction on the table's currentSession field to avoid a
 * race when two people scan the same QR within the same second.
 */
async function joinOrCreateSession(table) {
    const sessionsSnap = await get(outletRef(`tableSessions`));
    const allSessions = sessionsSnap.val() || {};

    // If the table already has a currentSession AND it's still active, join it.
    if (table.currentSession && allSessions[table.currentSession] && allSessions[table.currentSession].status !== 'closed') {
        return { id: table.currentSession, ...allSessions[table.currentSession] };
    }

    // Otherwise create a new session via a transaction on the table's
    // currentSession pointer — this prevents two concurrent scans from
    // each creating their own session for the same table.
    let createdSessionId = null;
    let createdSessionData = null;

    await runTransaction(ref(db, `${table.__outlet}/tables/${table.id}/currentSession`), (current) => {
        if (current) {
            // Someone else's transaction already created a session —
            // abort this one (return undefined cancels the transaction).
            return undefined;
        }
        const newRef = push(outletRef('tableSessions'));
        createdSessionId = newRef.key;
        createdSessionData = {
            sessionId: newRef.key,
            tableId: table.id,
            tableNumber: table.number,
            tableToken: table.token,
            status: 'active',
            openedAt: Date.now(),
            closedAt: null,
            customerName: '',
            customerPhone: '',
            guestCount: 1,
            orders: [],
            runningTotal: 0,
            discount: 0,
            tax: 0,
            grandTotal: 0
        };
        return newRef.key;
    });

    if (createdSessionId && createdSessionData) {
        await set(outletRef(`tableSessions/${createdSessionId}`), createdSessionData);
        await update(outletRef(`tables/${table.id}`), { status: 'occupied', updatedAt: Date.now() });
        return { id: createdSessionId, ...createdSessionData };
    }

    // Transaction was aborted because another scan won the race —
    // re-read the table to pick up the session it created.
    const freshSnap = await get(outletRef(`tables/${table.id}`));
    const freshTable = freshSnap.val();
    const sessSnap = await get(outletRef(`tableSessions/${freshTable.currentSession}`));
    return { id: freshTable.currentSession, ...sessSnap.val() };
}

/**
 * Bootstraps the session for the current page load.
 * Returns { ok: true } on success or { ok: false, reason } on failure.
 */
export async function initSession() {
    const token = getTokenFromUrl();
    const table = await validateToken(token);
    if (!table) return { ok: false, reason: 'invalid-token' };

    table.__outlet = (await import('./firebase.js')).OUTLET;
    Session.table = table;
    Session.tableId = table.id;

    const session = await joinOrCreateSession(table);
    Session.session = session;
    Session.sessionId = session.id;

    watchSession();
    return { ok: true };
}

/**
 * Live-watches the session so the running bill and order list update
 * in real time as the kitchen/admin (or other guests at the table)
 * change order statuses or add items.
 */
function watchSession() {
    if (Session._sessionUnsub) Session._sessionUnsub();
    Session._sessionUnsub = onValue(outletRef(`tableSessions/${Session.sessionId}`), (snap) => {
        const data = snap.val();
        if (!data) return;
        Session.session = { id: Session.sessionId, ...data };
        window.dispatchEvent(new CustomEvent('session:updated', { detail: Session.session }));
    });
}

/**
 * Appends a newly placed order's id into the session's orders[] array
 * and recomputes the running totals — this is what turns "3 separate
 * orders" into "1 running bill" (Decision #4).
 */
export async function attachOrderToSession(orderId, orderTotals) {
    await runTransaction(ref(db, `${Session.table.__outlet}/tableSessions/${Session.sessionId}`), (sess) => {
        if (!sess) return sess;
        sess.orders = Array.isArray(sess.orders) ? sess.orders : [];
        sess.orders.push(orderId);
        sess.runningTotal = (sess.runningTotal || 0) + (orderTotals.subtotal || 0);
        sess.tax = (sess.tax || 0) + (orderTotals.tax || 0);
        sess.serviceCharge = (sess.serviceCharge || 0) + (orderTotals.serviceCharge || 0);
        sess.grandTotal = (sess.grandTotal || 0) + (orderTotals.total || 0);
        return sess;
    });
}

/** Customer-initiated "Request Bill" — flips session + table to billing. */
export async function requestBill() {
    if (!Session.sessionId) return;
    await update(outletRef(`tableSessions/${Session.sessionId}`), { status: 'billing' });
    await update(outletRef(`tables/${Session.tableId}`), { status: 'billing', updatedAt: Date.now() });
}

/** Saves customer name and phone on the session record. */
export async function saveCheckoutContact(name, phone) {
    if (!Session.sessionId) return;
    await update(outletRef(`tableSessions/${Session.sessionId}`), { customerName: name || '', customerPhone: phone || '' });
}

export function cleanupSession() {
    if (Session._sessionUnsub) { Session._sessionUnsub(); Session._sessionUnsub = null; }
}

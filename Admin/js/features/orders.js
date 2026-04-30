/**
 * ROSHANI ERP | ORDERS FEATURE
 * Handles real-time order synchronization, rendering, and status updates.
 */

import { db, Outlet } from '../firebase.js';
import { state } from '../state.js';
import { escapeHtml, showToast, playNotificationSound, validateUrl, logAudit } from '../utils.js';
import { showAlert, addNotification, highlightOrder } from './notifications.js';

// Order callback storage for safe detachment
let _ordersValueCb = null;
let _ordersChildCb = null;
let _ordersChangedCb = null;

/**
 * INITIALIZE REAL-TIME LISTENERS
 * Syncs orders across outlets and triggers alerts for new ones.
 */
export function initRealtimeListeners() {
    // Detach any previous listeners
    ['pizza', 'cake'].forEach(o => {
        const r = db.ref(`${o}/orders`);
        if (_ordersChildCb) r.off("child_added", _ordersChildCb);
        if (_ordersChangedCb) r.off("child_changed", _ordersChangedCb);
    });

    if (_ordersValueCb) {
        const ordersRef = Outlet.ref("orders");
        ordersRef.off("value", _ordersValueCb);
    }

    let firstLoad = true;
    const loadTime = Date.now();

    // 1. New Orders Listener (Alerts)
    _ordersChildCb = snap => {
        if (!firstLoad) {
            const order = snap.val();
            if (!order) return;
            const orderTime = typeof order.createdAt === 'number' ? order.createdAt : new Date(order.createdAt).getTime();
            const isRecent = orderTime && (Date.now() - orderTime) < 120000;
            const isPostLoad = orderTime && orderTime > loadTime - 5000;

            if (order.status === "Placed" && isRecent && isPostLoad) {
                showAlert(order);
                playNotificationSound();
                addNotification(`New Order #${snap.key.slice(-5)}`, `Order for ₹${order.total} is placed.`, 'new', order.outlet);
                setTimeout(() => { highlightOrder(snap.key); }, 1000);
            }
        }
    };

    db.ref("pizza/orders").on("child_added", _ordersChildCb);
    db.ref("cake/orders").on("child_added", _ordersChildCb);

    // 2. Status Transitions
    _ordersChangedCb = snap => {
        const order = snap.val();
        if (order && order.status === "Delivered") {
            addNotification(`Order Delivered (#${snap.key.slice(-5)})`, `Customer: ${order.customerName || 'Walk-in'} • ₹${order.total}`, 'delivered', order.outlet);
        }
    };

    db.ref("pizza/orders").on("child_changed", _ordersChangedCb);
    db.ref("cake/orders").on("child_changed", _ordersChangedCb);

    // 3. Main Value Sync (Rendering) with Pagination
    const ordersRef = Outlet.ref("orders");
    const limit = state.orderLimit || 50;
    
    _ordersValueCb = snap => {
        firstLoad = false;
        renderOrders(snap);
    };

    ordersRef.orderByChild("createdAt").limitToLast(limit).on("value", _ordersValueCb, err => console.error("Firebase Read Error:", err));
}

/**
 * LOAD MORE ORDERS
 * Increases the limit and re-initializes listeners.
 */
export function loadMoreOrders() {
    state.orderLimit = (state.orderLimit || 50) + 50;
    initRealtimeListeners();
}

/**
 * RENDER ORDERS
 */
export function renderOrders(snap) {
    if (!snap) return;

    const activeTab = state.currentActiveTab || 'dashboard';
    const containers = {
        'dashboard': document.getElementById('ordersTable'),
        'orders': document.getElementById('ordersTableFull'),
        'live': document.getElementById('liveOrdersTable'),
        'payments': document.getElementById('paymentsTable')
    };

    // Clear and build map
    Object.values(containers).forEach(c => { if (c) c.innerHTML = ""; });
    window.ordersMap.clear();
    snap.forEach(child => {
        window.ordersMap.set(child.key, child.val());
    });

    const sortedOrders = Array.from(window.ordersMap.entries())
        .map(([id, o]) => ({ id, ...o }))
        .sort((a, b) => {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return timeB - timeA;
        });

    let liveCount = 0;
    sortedOrders.forEach(o => {
        const id = o.id;
        if (o.outlet && window.currentOutlet && o.outlet.toLowerCase() !== window.currentOutlet.toLowerCase()) return;

        const isLive = ["Placed", "Confirmed", "Preparing", "Cooked", "Out for Delivery"].includes(o.status);
        if (isLive) liveCount++;

        const tr = document.createElement('tr');
        tr.id = `row-${id}`;
        tr.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'A') {
                openOrderDrawer(id);
            }
        };
        
        const safeOrderId = escapeHtml(o.orderId || id.slice(-5));
        const safeCustomerName = escapeHtml(o.customerName || "Customer");
        const safeStatus = escapeHtml(o.status || "Unknown");
        const safeStatusClass = safeStatus.replace(/ /g, '');
        const truncatedAddress = o.address ? (o.address.length > 30 ? o.address.substring(0, 30) + "..." : o.address) : "Counter Sale";

        tr.innerHTML = `
            <td data-label="Order ID" class="font-mono font-600">#${safeOrderId}</td>
            <td data-label="Customer">
                ${safeCustomerName}<br>
                <small class="text-muted">${escapeHtml(o.phone || 'Guest')}</small>
                ${o.phone ? `<button data-action="chatOnWhatsapp" data-phone="${o.phone}" class="btn-chat">💬</button>` : ''}
            </td>
            <td data-label="Address">
                <span title="${escapeHtml(o.address || '')}">${escapeHtml(truncatedAddress)}</span>
                ${o.locationLink ? `<br><a href="${escapeHtml(o.locationLink)}" target="_blank" rel="noopener noreferrer" class="color-primary fs-11">📍 Map</a>` : ""}
            </td>
            <td data-label="Total" class="font-bold">₹${escapeHtml(o.total || '0')}</td>
            <td data-label="Status"><span class="status ${safeStatusClass}">${safeStatus}</span></td>
            <td data-label="Actions">
                <div class="flex-row flex-gap-5">
                    <select data-action="updateStatus" data-id="${id}" class="status-select">
                        <option value="">Status</option>
                        <option value="Confirmed" ${safeStatus === "Confirmed" ? "selected" : ""}>Confirm</option>
                        <option value="Preparing" ${safeStatus === "Preparing" ? "selected" : ""}>Preparing</option>
                        <option value="Cooked" ${safeStatus === "Cooked" ? "selected" : ""}>Cooked</option>
                        <option value="Out for Delivery" ${safeStatus === "Out for Delivery" ? "selected" : ""}>Out for Delivery</option>
                        <option value="Delivered" ${safeStatus === "Delivered" ? "selected" : ""}>Delivered</option>
                        <option value="Cancelled" ${safeStatus === "Cancelled" ? "selected" : ""}>Cancelled X</option>
                    </select>
                    <button data-action="printReceiptById" data-id="${o.orderId || id}" class="btn-table-icon">🖨️</button>
                </div>
            </td>
        `;

        if (containers[activeTab]) containers[activeTab].appendChild(tr);
    });

    // Add Load More Button if on 'orders' tab
    if (activeTab === 'orders' && snap.numChildren() >= (state.orderLimit || 50)) {
        const fullTable = containers['orders'];
        const existingBtn = document.getElementById('loadMoreOrdersBtn');
        if (!existingBtn) {
            const footer = document.createElement('div');
            footer.id = 'loadMoreContainer';
            footer.className = 'flex-center p-20';
            footer.innerHTML = `<button id="loadMoreOrdersBtn" class="btn-secondary" onclick="window.loadMoreOrders()">Load More Orders</button>`;
            fullTable.parentNode.appendChild(footer);
        }
    } else {
        const existingContainer = document.getElementById('loadMoreContainer');
        if (existingContainer) existingContainer.remove();
    }

    const liveBadge = document.getElementById('liveCountBadge');
    if (liveBadge) liveBadge.innerText = liveCount;
}

/**
 * ORDER MANAGEMENT ACTIONS
 */

export async function updateStatus(id, status) {
    if (!id || !status) return;
    try {
        await Outlet.ref(`orders/${id}`).update({ status });
        logAudit("Orders", `Updated Status: #${id.slice(-5)} -> ${status}`, id);
        showToast(`Order status updated to ${status}`, "success");
        if (status === "Delivered") {
            // Check if it's a home delivery to mark as paid if COD was selected?
            // Actually usually we ask for payment method on delivery
        }
    } catch (e) {
        showToast("Update failed: " + e.message, "error");
    }
}

export async function assignRider(id, riderId) {
    if (!id || !riderId) return;
    try {
        const riderSnap = await db.ref(`riders/${riderId}`).once('value');
        const rider = riderSnap.val();
        if (!rider) throw new Error("Rider not found");

        await Outlet.ref(`orders/${id}`).update({
            status: "Out for Delivery",
            riderId: riderId,
            riderName: rider.name,
            riderPhone: rider.phone,
            outForDeliveryAt: firebase.database.ServerValue.TIMESTAMP
        });
        logAudit("Orders", `Assigned Rider: ${rider.name} to #${id.slice(-5)}`, id);
        showToast(`Assigned to ${rider.name}`, "success");
    } catch (e) {
        showToast("Assignment failed: " + e.message, "error");
    }
}

export async function markAsPaid(id) {
    try {
        await Outlet.ref(`orders/${id}`).update({ paymentStatus: "Paid" });
        logAudit("Payments", `Marked Order Paid: #${id.slice(-5)}`, id);
        showToast("Order marked as PAID", "success");
    } catch (e) {
        showToast("Update failed: " + e.message, "error");
    }
}

export async function saveDeliveredOrder(id, data) {
    try {
        await Outlet.ref(`orders/${id}`).update({
            ...data,
            status: "Delivered",
            deliveredAt: firebase.database.ServerValue.TIMESTAMP
        });
        logAudit("Orders", `Order Delivered: #${id.slice(-5)}`, id);
        showToast("Order finalized and delivered!", "success");
    } catch (e) {
        showToast("Finalization failed: " + e.message, "error");
    }
}

/**
 * ORDER DRAWER (DETAILS)
 */
export async function openOrderDrawer(id) {
    const order = window.ordersMap.get(id);
    if (!order) return;

    const drawer = document.getElementById('orderDrawer');
    if (!drawer) return;

    const content = document.getElementById('orderDrawerContent');
    if (!content) return;

    // Render items
    const itemsHtml = order.items.map(item => `
        <div class="drawer-item">
            <div class="flex-between">
                <div>
                    <span class="font-600">${escapeHtml(item.name)}</span>
                    <span class="text-muted fs-11">(${escapeHtml(item.size)})</span>
                </div>
                <div class="font-600">₹${item.price} x ${item.qty}</div>
            </div>
            ${item.addons ? `<div class="text-muted-small">+ ${item.addons.map(a => a.name).join(', ')}</div>` : ''}
        </div>
    `).join('');

    content.innerHTML = `
        <div class="drawer-header p-20">
            <h3 class="m-0">Order #${escapeHtml(order.orderId || id.slice(-5))}</h3>
            <span class="status ${order.status.replace(/ /g, '')}">${order.status}</span>
        </div>
        <div class="drawer-body p-20">
            <div class="drawer-section">
                <label>Customer Details</label>
                <p><strong>${escapeHtml(order.customerName || 'Guest')}</strong></p>
                <p>${escapeHtml(order.phone || 'No Phone')}</p>
                <p class="fs-12 text-muted">${escapeHtml(order.address || 'Walk-in')}</p>
            </div>
            <div class="drawer-section">
                <label>Items</label>
                <div class="drawer-items-list">${itemsHtml}</div>
            </div>
            <div class="drawer-section">
                <div class="flex-between m-b-5"><span class="text-muted">Subtotal</span><span>₹${order.subtotal || 0}</span></div>
                <div class="flex-between m-b-5"><span class="text-muted">Discount</span><span>-₹${order.discount || 0}</span></div>
                <div class="flex-between m-b-5"><span class="text-muted">Delivery</span><span>₹${order.deliveryFee || 0}</span></div>
                <div class="flex-between font-bold fs-16"><span class="color-primary">Total</span><span>₹${order.total || 0}</span></div>
            </div>
            <div class="drawer-section">
                <label>Rider Assignment</label>
                ${order.riderName ? `<p>Assigned to: <strong>${escapeHtml(order.riderName)}</strong></p>` : `<p class="text-muted">No rider assigned</p>`}
            </div>
        </div>
    `;

    drawer.classList.add('active');
}

export function closeOrderDrawer() {
    const drawer = document.getElementById('orderDrawer');
    if (drawer) drawer.classList.remove('active');
}

export function filterOrders(searchTerm) {
    const term = (searchTerm || '').toLowerCase().trim();
    const rows = document.querySelectorAll('#ordersTableFull tr');
    
    rows.forEach(row => {
        if (!term) {
            row.style.display = '';
            return;
        }
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

// No window re-exposures here. Functions are exported as needed.

/**
 * ROSHANI ERP | ORDERS FEATURE
 * Handles real-time order synchronization, rendering, and status updates.
 */

import { db, Outlet, ServerValue } from '../firebase.js';
import { state } from '../state.js';
import { escapeHtml, showToast, playNotificationSound, validateUrl, logAudit } from '../utils.js';
import { showAlert, addNotification, highlightOrder } from './notifications.js';

// Order callback storage for safe detachment
let _ordersRef = null;
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

    if (_ordersValueCb && _ordersRef) {
        _ordersRef.off("value", _ordersValueCb);
        _ordersRef = null;
        _ordersValueCb = null;
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
    const fromDate = document.getElementById("orderFrom")?.value;
    const toDate = document.getElementById("orderTo")?.value;

    try {
        _ordersRef = Outlet.ref("orders");
        if (!_ordersRef) throw new Error("Could not resolve orders reference");
    } catch (err) {
        console.error("[Orders] Fatal: Failed to initialize orders reference:", err);
        return;
    }

    console.log(`[Orders] Initializing listeners for: ${_ordersRef.toString()} (Filter: ${fromDate || 'ALL'} to ${toDate || 'ALL'})`);
    const limit = state.orderLimit || 50;
    
    _ordersValueCb = snap => {
        firstLoad = false;
        console.log(`[Orders] Received snapshot: ${snap.numChildren()} orders`);
        state.lastOrdersSnap = snap;
        renderOrders(snap);
    };

    let query = _ordersRef.orderByChild("createdAt");
    
    if (fromDate && toDate) {
        // Query by date range (inclusive)
        // We append 'T00:00:00.000Z' and 'T23:59:59.999Z' to cover the whole day
        query = query.startAt(`${fromDate}T00:00:00.000Z`).endAt(`${toDate}T23:59:59.999Z`);
    } else {
        // Fallback to recent 50
        query = query.limitToLast(limit);
    }

    query.on("value", _ordersValueCb, err => {
        console.error("[Orders] Firebase Read Error:", err);
        showToast("Error loading orders: " + err.message, "error");
    });
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

    // Build map for calculations
    state.ordersMap.clear();
    snap.forEach(child => {
        state.ordersMap.set(child.key, child.val());
    });

    const allOrders = Array.from(state.ordersMap.entries())
        .map(([id, o]) => ({ id, ...o }));

    const fromDate = document.getElementById('orderFrom')?.value;
    const toDate = document.getElementById('orderTo')?.value;

    const sortedOrders = [...allOrders].filter(o => {
        if (!fromDate || !toDate) return true;
        const oDate = new Date(o.createdAt).toISOString().split('T')[0];
        return oDate >= fromDate && oDate <= toDate;
    }).sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
    });

    // Update Dashboard Elements regardless of current tab
    updateDashboardStats(allOrders);
    renderPriorityOrders(allOrders);
    renderTopItems(allOrders);
    renderTopCustomers(allOrders);

    // Clear active containers
    Object.values(containers).forEach(c => { if (c) c.innerHTML = ""; });

    let liveCount = 0;
    sortedOrders.forEach(o => {
        const id = o.id;
        // Normalize items for rendering and calculations
        let items = [];
        if (Array.isArray(o.cart)) {
            items = o.cart;
        } else if (o.items) {
            items = Array.isArray(o.items) ? o.items : Object.values(o.items);
        } else if (o.item) {
            // Legacy single-item format
            items = [{
                name: o.item,
                size: o.size || 'Regular',
                addon: o.addon || 'None',
                qty: 1,
                price: o.total || 0
            }];
        }
        o.normalizedItems = items;

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

        if (activeTab === 'dashboard') {
            // Dashboard Table: ID, Customer, Total, Payment, Status (5 columns)
            tr.innerHTML = `
                <td class="font-mono font-600">#${safeOrderId}</td>
                <td>
                    <div class="flex-column">
                        <span>${safeCustomerName}</span>
                        <small class="text-muted">${escapeHtml(o.phone || 'Guest')}</small>
                    </div>
                </td>
                <td class="font-bold">₹${escapeHtml(o.total || '0')}</td>
                <td><span class="badge-payment">${escapeHtml(o.paymentMethod || 'Cash')}</span></td>
                <td><span class="status ${safeStatusClass}">${safeStatus}</span></td>
            `;
        } else {
            // Full Tables: ID, Customer, Address, Total, Status, Actions (6 columns)
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
        }

        if (containers[activeTab]) containers[activeTab].appendChild(tr);
    });

    // Add Load More Button if on 'orders' tab
    if (activeTab === 'orders' && snap.numChildren() >= (state.orderLimit || 50)) {
        const fullTable = containers['orders'];
        if (fullTable) {
            const existingBtn = document.getElementById('loadMoreOrdersBtn');
            if (!existingBtn) {
                const footer = document.createElement('div');
                footer.id = 'loadMoreContainer';
                footer.className = 'flex-center p-20';
                footer.innerHTML = `<button id="loadMoreOrdersBtn" class="btn-secondary" onclick="window.loadMoreOrders()">Load More Orders</button>`;
                fullTable.parentNode.appendChild(footer);
            }
        }
    } else {
        const existingContainer = document.getElementById('loadMoreContainer');
        if (existingContainer) existingContainer.remove();
    }

    const liveBadge = document.getElementById('liveCountBadge');
    if (liveBadge) liveBadge.innerText = liveCount;
}

/**
 * DASHBOARD CALCULATIONS
 */

function updateDashboardStats(orders) {
    const today = new Date().toLocaleDateString('sv-SE'); // Local YYYY-MM-DD
    
    const todayOrders = orders.filter(o => {
        if (!o.createdAt) return false;
        const date = new Date(o.createdAt).toLocaleDateString('sv-SE');
        return date === today;
    });

    const revenue = todayOrders
        .filter(o => o.status === "Delivered")
        .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

    const pending = orders.filter(o => ["Placed", "Confirmed", "Preparing"].includes(o.status)).length;

    // Update UI
    const els = {
        'statOrders': todayOrders.length,
        'statPending': pending,
        'statRevenue': `₹${revenue.toLocaleString()}`,
        'statRidersActive': (state.ridersList || []).filter(r => r.status === "Online" || r.status === "On Delivery").length
    };

    Object.entries(els).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    });
}

function renderPriorityOrders(orders) {
    const container = document.getElementById('priorityOrderList');
    if (!container) return;

    // Remove old listener if any and add delegation
    if (!container.dataset.hasListener) {
        container.addEventListener('click', (e) => {
            const card = e.target.closest('.priority-card');
            if (card && card.dataset.orderId) {
                window.openOrderDrawer(card.dataset.orderId);
            }
        });
        container.dataset.hasListener = "true";
    }

    const priority = orders
        .filter(o => ["Placed", "Confirmed", "Preparing"].includes(o.status))
        .sort((a, b) => {
            const weights = { "Placed": 3, "Confirmed": 2, "Preparing": 1 };
            return (weights[b.status] || 0) - (weights[a.status] || 0);
        })
        .slice(0, 5);

    if (priority.length === 0) {
        container.innerHTML = `<div class="empty-state-mini">✅ All caught up! No pending orders.</div>`;
        return;
    }

    container.innerHTML = priority.map(o => `
        <div class="priority-card ${o.status.toLowerCase().replace(/ /g, '')}" data-order-id="${o.id}">
            <div class="flex-row flex-between">
                <div>
                    <span class="p-id">#${escapeHtml(o.orderId || o.id.slice(-5))}</span>
                    <h4 class="p-name">${escapeHtml(o.customerName || 'Walk-in')}</h4>
                </div>
                <div class="p-status-pill">${escapeHtml(o.status)}</div>
            </div>
            <div class="p-meta">
                <span>₹${o.total}</span> • <span>${o.items ? Object.keys(o.items).length : 0} items</span>
            </div>
        </div>
    `).join('');
}

function renderTopItems(orders) {
    const container = document.getElementById('topItemsList');
    if (!container) return;

    const itemCounts = {};
    orders.forEach(o => {
        const items = o.normalizedItems || (Array.isArray(o.cart) ? o.cart : (o.items ? Object.values(o.items) : []));
        items.forEach(item => {
            const name = (item.name && String(item.name).trim()) || (item.item && String(item.item).trim()) || item.sku || item.id;
            if (name) {
                itemCounts[name] = (itemCounts[name] || 0) + (Number(item.qty) || 1);
            }
        });
    });

    const topItems = Object.entries(itemCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (topItems.length === 0) {
        container.innerHTML = `<p class="text-muted-small">No sales data yet.</p>`;
        return;
    }

    container.innerHTML = topItems.map(([name, qty], i) => `
        <div class="top-item-row">
            <span class="rank">#${i+1}</span>
            <span class="name">${escapeHtml(name)}</span>
            <span class="qty">${qty} sold</span>
        </div>
    `).join('');
}

function renderTopCustomers(orders) {
    const container = document.getElementById('topCustomersList');
    if (!container) return;

    const custData = {};
    orders.forEach(o => {
        const phone = o.phone || "Walk-in";
        if (!custData[phone]) custData[phone] = { name: o.customerName || "Walk-in", total: 0, count: 0 };
        custData[phone].total += (Number(o.total) || 0);
        custData[phone].count += 1;
    });

    const topCusts = Object.values(custData)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

    if (topCusts.length === 0) {
        container.innerHTML = `<p class="text-muted-small">No customer data yet.</p>`;
        return;
    }

    container.innerHTML = topCusts.map(c => `
        <div class="top-cust-row">
            <div class="cust-info">
                <span class="name">${escapeHtml(c.name)}</span>
                <small>${c.count} orders</small>
            </div>
            <span class="total">₹${c.total.toLocaleString()}</span>
        </div>
    `).join('');
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
            outForDeliveryAt: ServerValue.TIMESTAMP
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
            deliveredAt: ServerValue.TIMESTAMP
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
    const order = state.ordersMap.get(id);
    if (!order) return;

    const drawer = document.getElementById('orderDrawer');
    if (!drawer) return;

    const content = document.getElementById('orderDrawerContent');
    if (!content) return;

    // Render items using normalized array
    const items = order.normalizedItems || [];
    const itemsHtml = items.map(item => `
        <div class="drawer-item">
            <div class="flex-between">
                <div>
                    <span class="font-600">${escapeHtml(item.name || "Item")}</span>
                    <span class="text-muted fs-11">(${escapeHtml(item.size || 'N/A')})</span>
                </div>
                <div class="font-600">₹${item.price || item.total || 0} x ${item.qty || 1}</div>
            </div>
            ${item.addon && item.addon !== 'None' ? `<div class="text-muted-small">+ ${escapeHtml(item.addon)}</div>` : ''}
            ${item.addons && Array.isArray(item.addons) ? `<div class="text-muted-small">+ ${item.addons.map(a => escapeHtml(a.name || '')).filter(n => n).join(', ')}</div>` : ''}
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

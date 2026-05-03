/**
 * ROSHANI ERP | ORDERS FEATURE
 * Handles real-time order synchronization, rendering, and status updates.
 */

import { db, Outlet, ServerValue } from '../firebase.js';
import { state } from '../state.js';
import { escapeHtml, showToast, playNotificationSound, validateUrl, logAudit, calculateDistance, getFeeFromSlabs, addRiderNotification } from '../utils.js';
import { showAlert, addNotification, highlightOrder } from './notifications.js';
import { showPaymentPicker } from '../ui-utils.js';

/**
 * STATUS WORKFLOW CONFIGURATION
 */
export const STATUS_SEQUENCE = ["Placed", "Confirmed", "Preparing", "Cooked", "Ready", "Out for Delivery", "Delivered"];
export const STATUS_SEQUENCES = {
    'Online': ["Placed", "Confirmed", "Preparing", "Cooked", "Ready", "Out for Delivery", "Delivered"],
    'Dine-in': ["Confirmed", "Preparing", "Cooked", "Ready", "Delivered"],
    'Default': ["Placed", "Confirmed", "Preparing", "Cooked", "Ready", "Out for Delivery", "Delivered"]
};
export const STATUS_MAPPING = {
    "New": 0, "Pending": 0, "Placed": 0,
    "Confirmed": 1,
    "Preparing": 2, "In Kitchen": 2,
    "Cooked": 3,
    "Ready": 4,
    "Picked Up": 5,
    "Out for Delivery": 6,
    "Delivered": 7,
    "Cancelled": 0
};

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
    const limit = state.orderLimit || 100;
    
    _ordersValueCb = snap => {
        firstLoad = false;
        console.log(`[Orders] Received snapshot: ${snap.numChildren()} orders at ${_ordersRef.toString()}`);
        state.lastOrdersSnap = snap;
        renderOrders(snap);
    };

    let query = _ordersRef.orderByChild("createdAt");
    
    // For Live Ops stability, we fetch at least the last 2 days even if date filter is narrow
    // but we honor the manual date filter for the "Orders" tab history
    if (fromDate && toDate) {
        query = query.startAt(`${fromDate}T00:00:00.000Z`).endAt(`${toDate}T23:59:59.999Z`);
    } else {
        // Fallback to recent 100 orders
        query = query.limitToLast(limit);
    }

    query.on("value", _ordersValueCb, err => {
        console.error("[Orders] Firebase Read Error:", err);
        showToast("Error loading orders: " + err.message, "error");
    });

    // 4. PERSISTENT LIVE-OPS SYNC (Always active for recent data)
    // We fetch the last 100 orders specifically for the 'Live Ops' tab to ensure it
    // doesn't get empty if the main History tab is filtered to a specific old date.
    _ordersRef.orderByChild("createdAt").limitToLast(100).on("value", snap => {
        state.liveOrdersMap.clear();
        snap.forEach(child => {
            state.liveOrdersMap.set(child.key, child.val());
        });
        // If we are currently on the live tab, re-render immediately
        if (state.currentActiveTab === 'live') {
            renderOrders(state.lastOrdersSnap); 
        }
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
 * GET STATUS OPTIONS
 * Filters available status transitions based on current status
 */
function getStatusOptions(currentStatus, type = 'Online') {
    const sequence = STATUS_SEQUENCES[type] || STATUS_SEQUENCES['Default'];
    const currentLevel = sequence.indexOf(currentStatus);
    const options = [];
    
    // Always show current status as selected
    options.push({ value: currentStatus, label: currentStatus, selected: true });

    // Show next step if exists
    // If current status is not in sequence, offer the first step
    const nextStep = (currentLevel !== -1) ? sequence[currentLevel + 1] : sequence[0];
    
    if (nextStep && nextStep !== currentStatus) {
        options.push({ value: nextStep, label: `Move to ${nextStep}`, selected: false });
    }

    // Always allow cancellation (unless already delivered or cancelled)
    if (currentStatus !== "Delivered" && currentStatus !== "Cancelled") {
        options.push({ value: "Cancelled", label: "Cancel Order X", selected: false });
    }

    return options.map(opt => `
        <option value="${opt.value}" ${opt.selected ? 'selected disabled' : ''}>
            ${opt.label}
        </option>
    `).join('');
}

/**
 * RENDER ORDERS
 */
export function renderOrders(snap) {
    const activeTab = state.currentActiveTab || 'dashboard';
    const containers = {
        'dashboard': document.getElementById('ordersTable'),
        'orders': document.getElementById('ordersTableFull'),
        'live': document.getElementById('liveOrdersTable'),
        'payments': document.getElementById('paymentsTable')
    };

    console.log(`[Orders] Rendering started for tab: ${activeTab}. Snap: ${snap ? 'Yes' : 'No'}. LiveMap: ${state.liveOrdersMap.size}`);

    // Update global maps
    if (snap) {
        state.ordersMap.clear();
        snap.forEach(child => {
            state.ordersMap.set(child.key, child.val());
        });
    }

    // Decide which data source to use
    let ordersToProcess = [];
    if (activeTab === 'live') {
        // Use live map if available, fallback to main map
        const sourceMap = state.liveOrdersMap.size > 0 ? state.liveOrdersMap : state.ordersMap;
        ordersToProcess = Array.from(sourceMap.entries()).map(([id, o]) => ({ id, ...o }));
    } else {
        ordersToProcess = Array.from(state.ordersMap.entries()).map(([id, o]) => ({ id, ...o }));
    }

    const allOrders = ordersToProcess;

    const fromDate = document.getElementById('orderFrom')?.value;
    const toDate = document.getElementById('orderTo')?.value;

    const sortedOrders = [...allOrders].filter(o => {
        // Live tab should ALWAYS show its orders regardless of date range
        if (activeTab === 'live') return true;
        
        if (!fromDate || !toDate) return true;
        const oDate = o.createdAt ? new Date(o.createdAt).toISOString().split('T')[0] : null;
        return oDate && oDate >= fromDate && oDate <= toDate;
    }).sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
    });

    console.log(`[Orders] Processed ${allOrders.length} total orders from snapshot.`);
    console.log(`[Orders] Filtered ${sortedOrders.length} orders for current tab: ${activeTab}`);

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

        const status = (o.status || "Unknown").trim();
        const liveStatuses = ["Placed", "Confirmed", "Preparing", "Cooked", "Ready", "Out for Delivery", "Pending", "New", "Dispatched", "In Kitchen"];
        const isLive = liveStatuses.some(s => s.toLowerCase() === status.toLowerCase());
        
        if (isLive) liveCount++;

        // Filter for Live Tab: Only show live orders
        if (activeTab === 'live') {
            if (!isLive) {
                return;
            }
            console.log(`[Orders] Rendering live order: #${id.slice(-5)} (Status: ${status})`);
        }

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
            // Dashboard Table: ID, Customer, Items, Total, Status, Assign Rider, Actions (7 columns)
            const itemSummary = items.length > 0 ? `${items.length} Items` : "No Items";
            const onlineRiders = (state.ridersList || []).filter(r => r.status === "Online" || r.status === "On Delivery");
            const riderOptions = onlineRiders.map(r => `
                <option value="${r.id}" ${o.riderId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>
            `).join('');

            tr.innerHTML = `
                <td data-label="Order ID" class="font-mono font-600">#${safeOrderId}</td>
                <td data-label="Customer">
                    <div class="flex-column">
                        <span>${safeCustomerName}</span>
                        <small class="text-muted">${escapeHtml(o.phone || 'Guest')}</small>
                    </div>
                </td>
                <td data-label="Items">${itemSummary}</td>
                <td data-label="Total" class="font-bold">₹${escapeHtml(o.total || '0')}</td>
                <td data-label="Status"><span class="status ${safeStatusClass}">${safeStatus}</span></td>
                <td data-label="Assign Rider">
                    <select data-action="assignRider" data-id="${id}" class="status-select" ${o.type === 'Dine-in' ? 'disabled' : ''}>
                        <option value="">Select Rider</option>
                        ${riderOptions}
                    </select>
                </td>
                <td data-label="Actions">
                    <div class="flex-row flex-gap-5">
                        <select data-action="updateStatus" data-id="${id}" class="status-select">
                            <option value="">Actions</option>
                            ${getStatusOptions(o.status || "Placed", o.type || 'Online')}
                        </select>
                        <button data-action="printReceiptById" data-id="${o.orderId || id}" class="btn-table-icon">🖨️</button>
                    </div>
                </td>
            `;
        } else if (activeTab === 'live') {
            // Live Ops Table: ID, Customer, Items, Total, Status, Assign Rider, Actions (7 columns)
            const itemSummary = items.length > 0 ? `${items.length} Items` : "No Items";
            
            // Rider options
            const onlineRiders = (state.ridersList || []).filter(r => r.status === "Online" || r.status === "On Delivery");
            const riderOptions = onlineRiders.map(r => `
                <option value="${r.id}" ${o.riderId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>
            `).join('');

            tr.innerHTML = `
                <td data-label="Order ID" class="font-mono font-600">#${safeOrderId}</td>
                <td data-label="Customer">
                    ${safeCustomerName}<br>
                    <small class="text-muted">${escapeHtml(o.phone || 'Guest')}</small>
                </td>
                <td data-label="Items">${itemSummary}</td>
                <td data-label="Total" class="font-bold">₹${escapeHtml(o.total || '0')}</td>
                <td data-label="Status"><span class="status ${safeStatusClass}">${safeStatus}</span></td>
                <td data-label="Assign Rider">
                    <select data-action="assignRider" data-id="${id}" class="status-select" ${o.type === 'Dine-in' ? 'disabled' : ''}>
                        <option value="">Select Rider</option>
                        ${riderOptions}
                    </select>
                </td>
                <td data-label="Actions">
                    <div class="flex-row flex-gap-5">
                        <select data-action="updateStatus" data-id="${id}" class="status-select">
                            <option value="">Actions</option>
                            ${getStatusOptions(o.status || "Placed", o.type || 'Online')}
                        </select>
                        <button data-action="printReceiptById" data-id="${o.orderId || id}" class="btn-table-icon">🖨️</button>
                    </div>
                </td>
            `;
        } else {
            // Full Tables (Orders/Payments): ID, Customer, Address, Total, Status, Actions (6 columns)
            tr.innerHTML = `
                <td data-label="Order ID" class="font-mono font-600">#${safeOrderId}</td>
                <td data-label="Customer">
                    ${safeCustomerName}<br>
                    <small class="text-muted">${escapeHtml(o.phone || 'Guest')}</small>
                    ${o.phone ? `<button data-action="chatOnWhatsapp" data-phone="${o.phone}" class="btn-chat">💬</button>` : ''}
                </td>
                <td data-label="Address">
                    <span title="${escapeHtml(o.address || '')}">${escapeHtml(truncatedAddress)}</span>
                    ${(o.locationLink || (o.lat && o.lng)) ? 
                        `<br><a href="${escapeHtml(o.locationLink || `https://www.google.com/maps?q=${o.lat},${o.lng}`)}" target="_blank" rel="noopener noreferrer" class="color-primary fs-11">📍 View Location</a>` 
                        : ""
                    }
                </td>
                <td data-label="Total" class="font-bold">₹${escapeHtml(o.total || '0')}</td>
                <td data-label="Status"><span class="status ${safeStatusClass}">${safeStatus}</span></td>
                <td data-label="Actions">
                    <div class="flex-row flex-gap-5">
                        <select data-action="updateStatus" data-id="${id}" class="status-select">
                            <option value="">Actions</option>
                            ${getStatusOptions(o.status || "Placed", o.type || 'Online')}
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

    const liveBadge = document.getElementById('badge-live');
    if (liveBadge) {
        liveBadge.innerText = liveCount;
        if (liveCount > 0) {
            liveBadge.classList.remove('hidden');
        } else {
            liveBadge.classList.add('hidden');
        }
    }
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

    const priorityStatuses = ["placed", "confirmed", "preparing", "cooked", "ready", "pending"];
    const priority = orders
        .filter(o => priorityStatuses.includes(String(o.status || "").toLowerCase()))
        .sort((a, b) => {
            const weights = { "placed": 6, "confirmed": 5, "preparing": 4, "cooked": 3, "pending": 2, "ready": 1 };
            const statusA = String(a.status || "").toLowerCase();
            const statusB = String(b.status || "").toLowerCase();
            return (weights[statusB] || 0) - (weights[statusA] || 0);
        })
        .slice(0, 8); // Show a few more on dashboard

    if (priority.length === 0) {
        container.innerHTML = `<div class="empty-state-mini">✅ All caught up! No pending orders.</div>`;
        return;
    }

    container.innerHTML = priority.map(o => {
        const id = o.id;
        const status = o.status || "Placed";
        const type = o.type || 'Online';
        const safeStatusClass = status.replace(/ /g, '');
        
        // Rider options for this card
        const onlineRiders = (state.ridersList || []).filter(r => r.status === "Online" || r.status === "On Delivery");
        const riderOptions = onlineRiders.map(r => `
            <option value="${r.id}" ${o.riderId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>
        `).join('');

        return `
            <div class="priority-card ${safeStatusClass.toLowerCase()}" data-order-id="${id}">
                <div class="flex-row flex-between">
                    <div>
                        <span class="p-id">#${escapeHtml(o.orderId || id.slice(-5))}</span>
                        <h4 class="p-name">${escapeHtml(o.customerName || 'Walk-in')}</h4>
                    </div>
                    <div class="p-status-pill ${safeStatusClass}">${escapeHtml(status)}</div>
                </div>
                <div class="p-meta">
                    <span>₹${o.total}</span> • <span>${o.normalizedItems ? o.normalizedItems.length : 0} items</span>
                </div>
                
                <div class="priority-actions flex-row flex-gap-5 mt-10" onclick="event.stopPropagation()">
                    <select data-action="assignRider" data-id="${id}" class="status-select-mini" ${type === 'Dine-in' ? 'disabled' : ''}>
                        <option value="">Rider</option>
                        ${riderOptions}
                    </select>
                    <select data-action="updateStatus" data-id="${id}" class="status-select-mini">
                        ${getStatusOptions(status, type)}
                    </select>
                </div>
            </div>
        `;
    }).join('');
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

    const order = state.ordersMap.get(id) || (state.liveOrdersMap.get(id));
    if (!order) return;

    const currentStatus = order.status || "Placed";
    const type = order.type || 'Online';
    const sequence = STATUS_SEQUENCES[type] || STATUS_SEQUENCES['Default'];
    
    const currentLevel = sequence.indexOf(currentStatus);
    const nextLevel = sequence.indexOf(status);

    // Rule 1: Allow cancellation from any state EXCEPT "Delivered"
    const isCancelling = status === "Cancelled";
    const canCancel = isCancelling && currentStatus !== "Delivered";

    // Rule 2: Allow ONLY the exact next step in the sequence
    const isNextStep = nextLevel === currentLevel + 1;

    // Rule 3: Allow "Resurrection" from Cancelled to Placed
    const isResurrecting = currentStatus === "Cancelled" && status === "Placed";

    if (!isNextStep && !canCancel && !isResurrecting && status !== currentStatus) {
        if (nextLevel <= currentLevel && nextLevel !== -1 && !isCancelling) {
            showToast(`⚠️ Status Reversal Blocked: Cannot go from ${currentStatus} to ${status}`, "error");
        } else if (isCancelling && currentStatus === "Delivered") {
            showToast(`⚠️ Cannot cancel an order that is already Delivered`, "error");
        } else {
            const expectedNext = sequence[currentLevel + 1] || "None";
            showToast(`⚠️ Sequence Violation: Next step for ${type} order must be "${expectedNext}" (not "${status}")`, "error");
        }
        
        // Re-render to reset select dropdowns
        renderOrders(state.lastOrdersSnap);
        return;
    }

    // Enforce Rider Assignment for Out for Delivery
    if (status === "Out for Delivery" && !order.riderId) {
        showToast("⚠️ Please assign a Rider before marking as Out for Delivery", "error");
        renderOrders(state.lastOrdersSnap);
        return;
    }

    // Payment Confirmation for Delivered
    let paymentMethod = order.paymentMethod || "Cash";
    let paymentStatus = order.paymentStatus || "Pending";

    if (status === "Delivered") {
        const method = await showPaymentPicker(order.total);
        if (!method) {
            renderOrders(state.lastOrdersSnap);
            return; // Cancelled payment selection
        }
        paymentMethod = method;
        paymentStatus = "Paid";
    }

    // Recalculate Delivery Fee for Resurrection
    let updates = { status, paymentMethod, paymentStatus };
    if (isResurrecting) {
        let lat = order.lat;
        let lng = order.lng;
        let address = order.address;

        // Fetch from customer if missing
        if ((!lat || !lng) && order.phone && order.phone.length >= 10) {
            try {
                let cleanPhone = String(order.phone).replace(/\D/g, '').slice(-10);
                const custSnap = await Outlet.ref(`customers/${cleanPhone}`).once('value');
                const c = custSnap.val();
                if (c && c.location && c.location.lat && c.location.lng) {
                    lat = c.location.lat;
                    lng = c.location.lng;
                    address = c.address || address;
                    updates.lat = lat;
                    updates.lng = lng;
                    updates.address = address;
                    showToast("Restored saved customer location.", "info");
                }
            } catch (err) {
                console.error("Failed to load customer loc:", err);
            }
        }

        if (lat && lng) {
            try {
                const outletKey = (order.outlet || 'pizza').toLowerCase();
                const delSnap = await db.ref(`${outletKey}/settings/Delivery`).once('value');
                const storeSnap = await db.ref(`${outletKey}/settings/Store`).once('value');
                const delSettings = delSnap.val() || {};
                const storeSettings = storeSnap.val() || {};

                const outletCoords = {
                    lat: parseFloat(storeSettings.lat || (outletKey === 'cake' ? 25.887472 : 25.887944)),
                    lng: parseFloat(storeSettings.lng || (outletKey === 'cake' ? 85.026861 : 85.026194))
                };

                const dist = calculateDistance(lat, lng, outletCoords.lat, outletCoords.lng);
                const fee = getFeeFromSlabs(dist, delSettings.slabs || []);
                
                const subtotal = parseFloat(order.subtotal || order.itemTotal || 0);
                updates.deliveryFee = fee;
                updates.total = subtotal + fee - (order.discount || 0);
                showToast(`Re-calculated delivery fee: ₹${fee} for ${dist.toFixed(1)}km`, "info");
            } catch (err) {
                console.error("Resurrection recalc error:", err);
            }
        }
    }

    try {
        await Outlet.ref(`orders/${id}`).update(updates);
        logAudit("Orders", `Updated Status: #${id.slice(-5)} -> ${status}`, id);
        showToast(`Order status updated to ${status}`, "success");
    } catch (e) {
        showToast("Update failed: " + e.message, "error");
        renderOrders(state.lastOrdersSnap);
    }
}

export async function assignRider(id, riderId) {
    if (!id || !riderId) return;
    try {
        const riderSnap = await db.ref(`riders/${riderId}`).once('value');
        const rider = riderSnap.val();
        if (!rider) throw new Error("Rider not found");

        const order = state.ordersMap.get(id) || state.liveOrdersMap.get(id);

        const updateData = {
            riderId: riderId,
            assignedRider: rider.email.toLowerCase(), // Essential for Rider Panel filtering
            riderName: rider.name,
            riderPhone: rider.phone,
            assignedAt: ServerValue.TIMESTAMP
        };

        // Manual assignment only - Rider will handle status advancement via "PICKUP"
        showToast(`Rider ${rider.name} assigned. Rider will update status upon pickup.`, "success");

        await Outlet.ref(`orders/${id}`).update(updateData);
        
        // Notify Rider
        await addRiderNotification(riderId, "New Order Assigned!", `Order #${id.slice(-5)} for ₹${order.total} assigned to you.`, 'new');

        logAudit("Orders", `Assigned Rider: ${rider.name} to #${id.slice(-5)}`, id);
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
                ${(order.locationLink || (order.lat && order.lng)) ? 
                    `<a href="${escapeHtml(order.locationLink || `https://www.google.com/maps?q=${order.lat},${order.lng}`)}" target="_blank" rel="noopener noreferrer" class="btn-map-drawer">📍 View on Google Maps</a>` 
                    : ""
                }
            </div>
            <div class="drawer-section">
                <label>Items</label>
                <div class="drawer-items-list">${itemsHtml}</div>
            </div>
            <div class="drawer-section">
                <div class="flex-between m-b-5"><span class="text-muted">Subtotal</span><span>₹${order.subtotal || 0}</span></div>
                <div class="flex-between m-b-5"><span class="text-muted">Discount Allotted</span><span>-₹${order.discount || 0}</span></div>
                <div class="flex-between m-b-5"><span class="text-muted">Delivery</span><span>₹${order.deliveryFee || 0}</span></div>
                <div class="flex-between font-bold fs-16"><span class="color-primary">Total</span><span>₹${order.total || 0}</span></div>
            </div>
            <div class="drawer-section">
                <label>Rider Assignment</label>
                <div class="flex-column flex-gap-10">
                    ${order.riderName ? `<p class="m-0">Assigned to: <strong>${escapeHtml(order.riderName)}</strong></p>` : `<p class="m-0 text-muted">No rider assigned</p>`}
                    
                    <div class="flex-row flex-gap-10 m-t-10">
                        <div class="flex-1">
                            <small class="text-muted d-block m-b-5">Update Status</small>
                            <select data-action="updateStatus" data-id="${id}" class="form-input w-100">
                                <option value="">Select Next Step</option>
                                ${getStatusOptions(order.status || "Placed", order.type || 'Online')}
                            </select>
                        </div>
                    </div>
                    
                    <div class="flex-row flex-gap-8 flex-center">
                        <select data-action="assignRider" data-id="${id}" class="form-input flex-1">
                            <option value="">${order.riderId ? 'Change Rider' : 'Select Rider'}</option>
                            ${(state.ridersList || [])
                                .filter(r => r.status === "Online" || r.status === "On Delivery")
                                .map(r => `<option value="${r.id}" ${order.riderId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`)
                                .join('')}
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;

    drawer.classList.add('active');
    
    // Push state so back button closes the drawer
    history.pushState({ action: 'closeDrawer', targetId: 'orderDrawer' }, "", window.location.hash);
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

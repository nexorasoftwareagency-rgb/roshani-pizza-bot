/**
 * ROSHANI ERP | ORDERS FEATURE
 * Handles real-time order synchronization, rendering, and status updates.
 */

import { db, Outlet, serverTimestamp, ref, get, set, update, query, orderByChild, orderByKey, equalTo, limitToLast, startAt, endAt, endBefore, onValue, onChildAdded, onChildChanged } from '../firebase.js';
import { state } from '../state.js';
import { escapeHtml, showToast, playNotificationSound, validateUrl, logAudit, calculateDistance, getFeeFromSlabs, addRiderNotification, getISTDateString, getSkeletonRows } from '../utils.js';
import { showAlert, addNotification, highlightOrder } from './notifications.js';
import { showPaymentPicker } from '../ui-utils.js';
import { autoDeductStock } from './inventory.js';
import { sendToRider } from '../fcm-sender.js';


/**
 * STATUS WORKFLOW CONFIGURATION
 */
export const STATUS_SEQUENCE = ["Placed", "Confirmed", "Preparing", "Cooked", "Ready", "Out for Delivery", "Reached Drop Location", "Delivered"];
export const STATUS_SEQUENCES = {
    'Online': ["Placed", "Confirmed", "Preparing", "Cooked", "Ready", "Out for Delivery", "Reached Drop Location", "Delivered"],
    'Dine-in': ["Confirmed", "Preparing", "Cooked", "Ready", "Delivered"],
    'Default': ["Placed", "Confirmed", "Preparing", "Cooked", "Ready", "Out for Delivery", "Reached Drop Location", "Delivered"]
};
export const STATUS_MAPPING = {
    "New": 0, "Pending": 0, "Placed": 0,
    "Confirmed": 1,
    "Preparing": 2, "In Kitchen": 2,
    "Cooked": 3,
    "Ready": 4,
    "Picked Up": 5,
    "Out for Delivery": 6,
    "Reached Drop Location": 7,
    "Delivered": 8,
    "Cancelled": 0
};

// Order callback storage for safe detachment
let _ordersUnsub = null;
let _ordersChildUnsub = null;
let _ordersChangedUnsub = null;
let _liveOrdersUnsub = null;

export function initRealtimeListeners() {
    if (_ordersUnsub) { _ordersUnsub(); _ordersUnsub = null; }
    if (_ordersChildUnsub) { _ordersChildUnsub(); _ordersChildUnsub = null; }
    if (_ordersChangedUnsub) { _ordersChangedUnsub(); _ordersChangedUnsub = null; }
    if (_liveOrdersUnsub) { _liveOrdersUnsub(); _liveOrdersUnsub = null; }

    // Show skeleton while data loads
    ['ordersTable','ordersTableFull','liveOrdersTable','paymentsTable'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = getSkeletonRows(5, el.closest('table').querySelectorAll('thead th').length || 7);
    });

    let firstLoad = true;
    const loadTime = Date.now();
    const currentOrdersRef = Outlet.ref("orders");

    _ordersChildUnsub = onChildAdded(currentOrdersRef, snap => {
        if (!firstLoad) {
            const order = snap.val();
            if (!order) return;
            const orderTime = typeof order.createdAt === 'number' ? order.createdAt : new Date(order.createdAt).getTime();
            const isRecent = orderTime && (Date.now() - orderTime) < 120000;
            const isPostLoad = orderTime && orderTime > loadTime - 5000;
            if (order.status === "Placed" && isRecent && isPostLoad) {
                showAlert(order);
                playNotificationSound();
                addNotification(`New Order #${snap.key.slice(-5)}`, `Order for ₹${order.total} is placed.`, 'new', state.currentOutlet);
                setTimeout(() => { highlightOrder(snap.key); }, 1000);
            }
        }
    });

    _ordersChangedUnsub = onChildChanged(currentOrdersRef, snap => {
        const order = snap.val();
        if (order && order.status === "Delivered") {
            addNotification(`Order Delivered (#${snap.key.slice(-5)})`, `Customer: ${order.customerName || 'Walk-in'} • ₹${order.total}`, 'delivered', state.currentOutlet);
        }
    });

    const fromDate = document.getElementById("orderFrom")?.value;
    const toDate = document.getElementById("orderTo")?.value;

    let ordersRef;
    try {
        ordersRef = Outlet.ref("orders");
        if (!ordersRef) throw new Error("Could not resolve orders reference");
    } catch (err) {
        console.error("[Orders] Fatal: Failed to initialize orders reference:", err);
        return;
    }

    console.log(`[Orders] Initializing listeners for: ${ordersRef} (Filter: ${fromDate || 'ALL'} to ${toDate || 'ALL'})`);

    _ordersUnsub = onValue(buildOrdersQuery(ordersRef, fromDate, toDate, 50), snap => {
        firstLoad = false;
        console.log(`[Orders] Received snapshot: ${Object.keys(snap.val() || {}).length} orders at ${ordersRef}`);
        state.lastOrdersSnap = snap;
        if (window._renderDebounce) clearTimeout(window._renderDebounce);
        window._renderDebounce = setTimeout(() => {
            renderOrders(snap);
        }, 120);
    }, err => {
        console.error("[Orders] Firebase Read Error:", err);
        showToast("Error loading orders: " + err.message, "error");
    });

    const liveOrdersRef = Outlet.ref("orders");
    _liveOrdersUnsub = onValue(query(liveOrdersRef, orderByChild("createdAt"), limitToLast(100)), snap => {
        state.liveOrdersMap.clear();
        snap.forEach(child => {
            state.liveOrdersMap.set(child.key, child.val());
        });
        if (state.currentActiveTab === 'live') {
            renderOrders(state.lastOrdersSnap);
        }
    });
}

function buildOrdersQuery(ordersRef, fromDate, toDate, limit) {
    if (fromDate && toDate) {
        const d1 = new Date(fromDate);
        const d2 = new Date(toDate);
        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
            return query(ordersRef, orderByChild("createdAt"), limitToLast(limit));
        }
        const qStart = new Date(d1); qStart.setDate(qStart.getDate() - 1);
        const qEnd = new Date(d2); qEnd.setDate(qEnd.getDate() + 1);
        return query(ordersRef, orderByChild("createdAt"),
            startAt(`${qStart.toISOString().split('T')[0]}T00:00:00.000Z`),
            endAt(`${qEnd.toISOString().split('T')[0]}T23:59:59.999Z`),
            limitToLast(limit));
    }
    return query(ordersRef, orderByChild("createdAt"), limitToLast(limit));
}

export function cleanupOrders() {
    console.log("[Orders] Detaching listeners...");
    if (_ordersUnsub) { _ordersUnsub(); _ordersUnsub = null; }
    if (_ordersChildUnsub) { _ordersChildUnsub(); _ordersChildUnsub = null; }
    if (_ordersChangedUnsub) { _ordersChangedUnsub(); _ordersChangedUnsub = null; }
    if (_liveOrdersUnsub) { _liveOrdersUnsub(); _liveOrdersUnsub = null; }
}

/**
 * LOAD MORE ORDERS (Cursor-Based Pagination)
 * Fetches the next page of older orders using endBefore cursor.
 */
export function loadMoreOrders() {
    if (state.ordersPageLoading || !state.hasMoreOrders) return;
    loadOrdersPage(false);
}

const PAGE_SIZE = 50;

/**
 * Load a page of orders for the Orders tab using cursor-based pagination.
 * @param {boolean} reset - If true, clears pagination state and loads the first page.
 */
export function loadOrdersPage(reset = false) {
    if (state.ordersPageLoading && !reset) return;
    state.ordersPageLoading = true;

    if (reset) {
        state.ordersPageData = [];
        state.ordersPageCursor = null;
        state.ordersLoadedKeys = new Set();
        state.hasMoreOrders = true;
    }

    const fromDate = document.getElementById("orderFrom")?.value;
    const toDate = document.getElementById("orderTo")?.value;
    const ordersRef = Outlet.ref("orders");

    const DATERANGE_LIMIT = 200;

    let queryRef;
    if (fromDate && toDate) {
        // Date-filtered: use createdAt ordering with a limit for safety
        const d1 = new Date(fromDate);
        const d2 = new Date(toDate);
        if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
            const qStart = new Date(d1); qStart.setDate(qStart.getDate() - 1);
            const qEnd = new Date(d2); qEnd.setDate(qEnd.getDate() + 1);
            queryRef = query(ordersRef, orderByChild("createdAt"),
                startAt(`${qStart.toISOString().split('T')[0]}T00:00:00.000Z`),
                endAt(`${qEnd.toISOString().split('T')[0]}T23:59:59.999Z`),
                limitToLast(DATERANGE_LIMIT));
        } else {
            queryRef = query(ordersRef, orderByKey(), limitToLast(PAGE_SIZE));
        }
    } else {
        // No date filter: cursor-based pagination via push keys
        if (reset) {
            queryRef = query(ordersRef, orderByKey(), limitToLast(PAGE_SIZE));
        } else if (state.ordersPageCursor) {
            queryRef = query(ordersRef, orderByKey(), endBefore(state.ordersPageCursor), limitToLast(PAGE_SIZE));
        } else {
            queryRef = query(ordersRef, orderByKey(), limitToLast(PAGE_SIZE));
        }
    }

    const loadLabel = reset ? 'Initial' : 'Next';
    console.log(`[Orders] ${loadLabel} page load (cursor: ${state.ordersPageCursor || 'none'})`);

    get(queryRef).then(snap => {
        if (!snap.exists() || !snap.val()) {
            state.hasMoreOrders = false;
            state.ordersPageLoading = false;
            renderOrders(null);
            return;
        }

        const entries = [];
        snap.forEach(child => {
            const key = child.key;
            if (!state.ordersLoadedKeys.has(key)) {
                state.ordersLoadedKeys.add(key);
                entries.push({ id: key, ...child.val() });
            }
        });

        if (entries.length === 0 && !reset) {
            state.hasMoreOrders = false;
            state.ordersPageLoading = false;
            renderOrders(null);
            return;
        }

        // For date-filtered queries, store all results (capped at DATERANGE_LIMIT)
        if (fromDate && toDate) {
            const seen = new Map();
            // Keep existing entries first
            state.ordersPageData.forEach(o => seen.set(o.id, o));
            // Merge new entries (newer ones overwrite on conflict)
            entries.forEach(o => seen.set(o.id, o));
            state.ordersPageData = Array.from(seen.values());
            // No more server-side pages — all data loaded within the range+limit
            state.ordersPageCursor = null;
            state.hasMoreOrders = false;
        } else {
            // Cursor-based: update cursor to the earliest (first) key in this batch
            // Firebase returns entries in ascending key order with limitToLast,
            // so the first entry is the oldest in this batch
            const keys = entries.map(e => e.id);
            state.ordersPageCursor = keys[0]; // oldest key = cursor for next page

            // Append to existing data (newest entries are appended at end after sort)
            state.ordersPageData = [...state.ordersPageData, ...entries];

            // If fewer than PAGE_SIZE results, no more on server
            if (entries.length < PAGE_SIZE) {
                state.hasMoreOrders = false;
            } else {
                state.hasMoreOrders = true;
            }
        }

        state.ordersPageLoading = false;
        renderOrders(null);
    }).catch(err => {
        console.error("[Orders] Page load error:", err);
        state.ordersPageLoading = false;
        showToast("Error loading more orders: " + err.message, "error");
    });
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
        const fromDate = document.getElementById("orderFrom")?.value;
        const toDate = document.getElementById("orderTo")?.value;

        state.ordersMap.clear();
        snap.forEach(child => {
            const o = child.val();
            if (!o) return;

            // Strict IST Date filtering for History/Payments tabs
            if (activeTab === 'orders' || activeTab === 'payments') {
                if (fromDate && toDate) {
                    const dateStr = getISTDateString(o.createdAt);
                    if (dateStr < fromDate || dateStr > toDate) return;
                }
            }

            state.ordersMap.set(child.key, o);
        });
    }

    // Decide which data source to use
    let ordersToProcess = [];
    if (activeTab === 'orders') {
        // Use paginated data for orders tab
        ordersToProcess = state.ordersPageData;
    } else if (activeTab === 'live') {
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
        const d = o.createdAt ? new Date(o.createdAt) : null;
        const oDate = (d && !isNaN(d.getTime())) ? d.toISOString().split('T')[0] : null;
        return oDate && oDate >= fromDate && oDate <= toDate;
    }).sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
    });

    console.log(`[Orders] Processed ${allOrders.length} total orders from snapshot.`);
    console.log(`[Orders] Filtered ${sortedOrders.length} orders for current tab: ${activeTab}`);

    // Update Dashboard Elements using snapshot data (not paginated).
    // Use ordersMap which is populated from the latest onValue snapshot.
    const snapshotOrders = Array.from(state.ordersMap.entries()).map(([id, o]) => ({ id, ...o }));
    updateDashboardStats(snapshotOrders);
    renderPriorityOrders(snapshotOrders);
    renderTopItems(snapshotOrders);
    renderTopCustomers(snapshotOrders);
    // Clear active containers
    Object.values(containers).forEach(c => { if (c) c.innerHTML = ""; });

    // Performance Optimization: Cleanup listeners once, not per item
    if (state._activeListeners) {
        state._activeListeners.forEach(l => {
            if (typeof l === 'function') l();
            else if (l && l.off) l.off();
        });
        state._activeListeners = [];
    }

    // Create fragments for each container to avoid reflows
    const fragments = {
        'dashboard': document.createDocumentFragment(),
        'orders': document.createDocumentFragment(),
        'live': document.createDocumentFragment(),
        'payments': document.createDocumentFragment()
    };

    // For orders tab with no paginated data yet, show loading/empty state
    if (activeTab === 'orders' && state.ordersPageData.length === 0 && containers['orders']) {
        if (state.ordersPageLoading) {
            containers['orders'].innerHTML = '<tr><td colspan="7"><div class="flex-center p-20"><div class="spinner"></div><span class="text-muted ml-10">Loading orders...</span></div></td></tr>';
        } else {
            containers['orders'].innerHTML = '<tr><td colspan="7" class="empty-state-cell"><div class="empty-state"><i data-lucide="inbox"></i><p>No orders yet</p><span>New orders will appear here in real-time</span></div></td></tr>';
            if (window.lucide) window.lucide.createIcons();
        }
    }
    
    // Empty state for live tab
    if (activeTab === 'live' && sortedOrders.filter(o => {
        const status = (o.status || "Unknown").trim();
        const liveStatuses = ["Placed", "Confirmed", "Preparing", "Cooked", "Ready", "Out for Delivery", "Pending", "New", "Dispatched", "In Kitchen"];
        return liveStatuses.some(s => s.toLowerCase() === status.toLowerCase());
    }).length === 0 && containers['live']) {
        containers['live'].innerHTML = '<tr><td colspan="7" class="empty-state-cell"><div class="empty-state"><i data-lucide="activity"></i><p>No live orders</p><span>Active orders will appear here</span></div></td></tr>';
        if (window.lucide) window.lucide.createIcons();
    }

    let liveCount = 0;
    sortedOrders.forEach(o => {
        const id = o.id;
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
        tr.className = "premium-row-v4";
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
            const itemSummary = items.length > 0 ? `${items.length} Items` : "No Items";
            const onlineRiders = (state.ridersList || []).filter(r => r.status === "Online" || r.status === "On Delivery");
            const riderOptions = onlineRiders.map(r => `
                <option value="${r.id}" ${o.riderId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>
            `).join('');

            tr.innerHTML = `
                <td data-label="Order">
                    <div class="identity-chip-v4">
                        <div class="kpi-icon-box ${o.type === 'Online' ? 'blue' : 'orange'}" style="width:32px; height:32px; font-size:14px;">
                            <i data-lucide="${o.type === 'Online' ? 'globe' : 'store'}"></i>
                        </div>
                        <div class="identity-info-v4">
                            <span class="name">#${safeOrderId}</span>
                            <span class="sub">${escapeHtml(o.type || 'Online')}</span>
                        </div>
                    </div>
                </td>
                <td data-label="Customer">
                    <div class="identity-info-v4">
                        <span class="name">${safeCustomerName}</span>
                        <span class="sub">${escapeHtml(o.phone || 'Guest')}</span>
                    </div>
                </td>
                <td data-label="Details">
                    <div class="flex-col">
                        <span class="font-600 fs-13">${itemSummary}</span>
                        <span class="text-muted-small">${escapeHtml(truncatedAddress)}</span>
                    </div>
                </td>
                <td data-label="Total">
                    <span class="font-bold color-primary fs-15">₹${escapeHtml(o.total || '0')}</span>
                </td>
                <td data-label="Payment">
                    <div class="badge-payment-v4" data-method="${escapeHtml((o.paymentMethod || '---').toLowerCase())}">
                        <i data-lucide="${(o.paymentMethod || '').toLowerCase() === 'cash' ? 'banknote' : (o.paymentMethod || '').toLowerCase() === 'upi' ? 'smartphone' : 'credit-card'}" style="width:12px;height:12px;"></i>
                        <span>${escapeHtml(o.paymentMethod || '---')}</span>
                    </div>
                </td>
                <td data-label="Status">
                    <span class="status ${safeStatusClass}">${safeStatus}</span>
                </td>
                <td data-label="Rider">
                    <div class="flex-row flex-center flex-gap-8">
                        <i data-lucide="bike" style="width:14px;" class="text-muted"></i>
                        <select data-action="assignRider" data-id="${id}" class="status-select-mini" ${o.type === 'Dine-in' ? 'disabled' : ''}>
                            <option value="">Assign</option>
                            ${riderOptions}
                        </select>
                    </div>
                </td>
                <td data-label="Actions">
                    <div class="action-group-v4">
                        <select data-action="updateStatus" data-id="${id}" class="status-select-mini" style="width: 100px;">
                            ${getStatusOptions(o.status || "Placed", o.type || 'Online')}
                        </select>
                        <button data-action="printReceiptById" data-id="${o.orderId || id}" class="btn-action-v4" title="Print Receipt">
                            <i data-lucide="printer"></i>
                        </button>
                    </div>
                </td>
            `;
        } else if (activeTab === 'live') {
            const itemSummary = items.length > 0 ? `${items.length} Items` : "No Items";
            const onlineRiders = (state.ridersList || []).filter(r => r.status === "Online" || r.status === "On Delivery");
            const riderOptions = onlineRiders.map(r => `
                <option value="${r.id}" ${o.riderId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>
            `).join('');

            tr.innerHTML = `

                <td data-label="Order">
                    <div class="identity-chip-v4">
                        <div class="kpi-icon-box" style="width:32px; height:32px; font-size:14px;">
                            <i data-lucide="zap"></i>
                        </div>
                        <div class="identity-info-v4">
                            <span class="name">#${safeOrderId}</span>
                            <span class="sub">${escapeHtml(o.outlet.toUpperCase())}</span>
                        </div>
                    </div>
                </td>
                <td data-label="Customer">
                    <div class="identity-info-v4">
                        <span class="name">${safeCustomerName}</span>
                        <span class="sub">${escapeHtml(o.phone || 'Guest')}</span>
                    </div>
                </td>
                <td data-label="Kitchen">
                    <div class="flex-col">
                        <span class="font-600 fs-13">${itemSummary}</span>
                        <span class="text-muted-small">${escapeHtml(o.type)}</span>
                    </div>
                </td>
                <td data-label="Total">
                    <span class="font-bold color-primary">₹${escapeHtml(o.total || '0')}</span>
                </td>
                <td data-label="Status">
                    <span class="status ${safeStatusClass}">${safeStatus}</span>
                </td>
                <td data-label="Rider">
                    <select data-action="assignRider" data-id="${id}" class="status-select-mini" ${o.type === 'Dine-in' ? 'disabled' : ''}>
                        <option value="">Assign</option>
                        ${riderOptions}
                    </select>
                </td>
                <td data-label="Actions">
                    <div class="action-group-v4">
                        <select data-action="updateStatus" data-id="${id}" class="status-select-mini">
                            ${getStatusOptions(o.status || "Placed", o.type || 'Online')}
                        </select>
                        <button data-action="printReceiptById" data-id="${o.orderId || id}" class="btn-action-v4">
                            <i data-lucide="printer"></i>
                        </button>
                    </div>
                </td>
            `;
        } else if (activeTab === 'payments') {
            const method = o.paymentMethod || "Cash";
            tr.innerHTML = `
                <td data-label="Date">
                    <div class="identity-chip-v4 ml-15">
                        <div class="kpi-icon-box glass" style="width:32px; height:32px; font-size:14px;">
                            <i data-lucide="calendar"></i>
                        </div>
                        <div class="identity-info-v4">
                            <span class="name">#${safeOrderId}</span>
                            <span class="sub">${new Date(o.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                    </div>
                </td>
                <td data-label="Customer">
                    <div class="identity-info-v4">
                        <span class="name">${safeCustomerName}</span>
                        <span class="sub">${escapeHtml(o.phone || 'Guest')}</span>
                    </div>
                </td>
                <td data-label="Method">
                    <div class="flex-row flex-center flex-gap-8">
                        <span class="badge-payment-v4">${escapeHtml(method)}</span>
                    </div>
                </td>
                <td data-label="Status">
                    <span class="status ${safeStatusClass}">${safeStatus}</span>
                </td>
                <td data-label="Amount" class="text-right pr-25">
                    <span class="font-bold color-primary fs-16">₹${escapeHtml(o.total || '0')}</span>
                </td>
            `;
        } else {
            tr.innerHTML = `

                <td data-label="Order">
                    <div class="identity-chip-v4">
                        <div class="kpi-icon-box" style="width:32px; height:32px; font-size:14px;">
                            <i data-lucide="package"></i>
                        </div>
                        <div class="identity-info-v4">
                            <span class="name">#${safeOrderId}</span>
                            <span class="sub">${new Date(o.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                </td>
                <td data-label="Customer">
                    <div class="identity-info-v4">
                        <span class="name">${safeCustomerName}</span>
                        <div class="action-group-v4 mt-5">
                            <span class="sub">${escapeHtml(o.phone || 'Guest')}</span>
                            ${o.phone ? `<button data-action="chatOnWhatsapp" data-phone="${o.phone}" class="btn-action-v4 success" style="width:20px;height:20px;font-size:10px;"><i data-lucide="message-square" style="width:10px;"></i></button>` : ''}
                        </div>
                    </div>
                </td>
                <td data-label="Address">
                    <div class="identity-info-v4">
                        <span class="sub" title="${escapeHtml(o.address || '')}">${escapeHtml(truncatedAddress)}</span>
                        ${(o.locationLink || (o.lat && o.lng)) ? 
                            `<a href="${escapeHtml(o.locationLink || `https://www.google.com/maps?q=${o.lat},${o.lng}`)}" target="_blank" rel="noopener noreferrer" class="link-premium fs-10 font-bold">📍 VIEW MAP</a>` 
                            : ""
                        }
                    </div>
                </td>
                <td data-label="Total">
                    <span class="font-bold color-primary">₹${escapeHtml(o.total || '0')}</span>
                </td>
                <td data-label="Payment">
                    <div class="badge-payment-v4" data-method="${escapeHtml((o.paymentMethod || '---').toLowerCase())}">
                        <i data-lucide="${(o.paymentMethod || '').toLowerCase() === 'cash' ? 'banknote' : (o.paymentMethod || '').toLowerCase() === 'upi' ? 'smartphone' : 'credit-card'}" style="width:12px;height:12px;"></i>
                        <span>${escapeHtml(o.paymentMethod || '---')}</span>
                    </div>
                </td>
                <td data-label="Status">
                    <span class="status ${safeStatusClass}">${safeStatus}</span>
                </td>
                <td data-label="Actions">
                    <div class="action-group-v4">
                        <select data-action="updateStatus" data-id="${id}" class="status-select-mini">
                            ${getStatusOptions(o.status || "Placed", o.type || 'Online')}
                        </select>
                        <button data-action="printReceiptById" data-id="${o.orderId || id}" class="btn-action-v4">
                            <i data-lucide="printer"></i>
                        </button>
                    </div>
                </td>
            `;
        }

        if (fragments[activeTab]) fragments[activeTab].appendChild(tr);
    });

    // Bulk append fragments to containers
    Object.keys(containers).forEach(key => {
        if (containers[key] && fragments[key]) {
            containers[key].appendChild(fragments[key]);
        }
    });

    // Add Load More Button for cursor-based pagination
    if (activeTab === 'orders') {
        if (state.hasMoreOrders) {
            const fullTable = containers['orders'];
            let footer = document.getElementById('loadMoreContainer');
            if (!footer && fullTable) {
                footer = document.createElement('div');
                footer.id = 'loadMoreContainer';
                footer.className = 'flex-center p-20';
                footer.innerHTML = `<button id="loadMoreOrdersBtn" class="btn-secondary" data-action="loadMoreOrders">Load more orders <span id="loadMoreCount">(${state.ordersPageData.length} loaded)</span></button>`;
                fullTable.parentNode.appendChild(footer);
            }
            const countEl = document.getElementById('loadMoreCount');
            if (countEl) countEl.textContent = `${state.ordersPageData.length} loaded`;
        } else {
            const existingContainer = document.getElementById('loadMoreContainer');
            if (existingContainer) existingContainer.remove();
            if (state.ordersPageData.length > 0) {
                // Show "all loaded" hint once at the bottom
                const fullTable = containers['orders'];
                if (fullTable && !document.getElementById('allOrdersLoadedHint')) {
                    const hint = document.createElement('div');
                    hint.id = 'allOrdersLoadedHint';
                    hint.className = 'flex-center p-10';
                    hint.innerHTML = `<span class="text-muted-small">All ${state.ordersPageData.length} orders loaded</span>`;
                    fullTable.parentNode.appendChild(hint);
                }
            }
        }
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

    // Refresh icons only for the active container to reduce lag
    if (window.lucide && containers[activeTab]) {
        window.lucide.createIcons({
            nameAttr: 'data-lucide',
            root: containers[activeTab]
        });
    }
}

/**
 * DASHBOARD CALCULATIONS
 */

function updateDashboardStats(orders) {
    const today = new Date().toISOString().split('T')[0];
    
    const todayOrders = orders.filter(o => {
        if (!o.createdAt) return false;
        const d = new Date(o.createdAt);
        if (isNaN(d.getTime())) return false;
        const date = d.toISOString().split('T')[0];
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
            const card = e.target.closest('.priority-card-v4');
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
        const safeStatusClass = status.toLowerCase().replace(/ /g, '');
        const timeStr = o.createdAt ? new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently';
        
        // Extract items summary
        const items = o.cart || o.items || (o.normalizedItems ? o.normalizedItems : []);
        const itemsSummary = Array.isArray(items) ? items.map(i => `${i.qty}x ${i.name || i.item}`).join(', ') : "Items hidden";

        return `
            <div class="priority-card-v4 status-${safeStatusClass}" data-order-id="${id}">
                <div class="header">
                    <span class="order-id">#${id.slice(-5).toUpperCase()}</span>
                    <span class="time">${timeStr}</span>
                </div>
                <div class="cust-info">
                    <div class="identity-info-v4">
                        <span class="name">${escapeHtml(o.customerName || 'Walk-in')}</span>
                        <span class="sub">${escapeHtml(o.phone || 'No Phone')}</span>
                    </div>
                </div>
                <div class="items-summary">${escapeHtml(itemsSummary)}</div>
                <div class="footer">
                    <span class="status-badge-v4 status-${safeStatusClass}">${escapeHtml(status)}</span>
                    <span class="font-bold color-primary">₹${escapeHtml(o.total)}</span>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons({ root: container });
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
        <div class="premium-stat-row">
            <div class="flex-row flex-center">
                <div class="rank-box">#${i+1}</div>
                <div class="info-main">
                    <span class="title">${escapeHtml(name)}</span>
                    <span class="sub">Popular Choice</span>
                </div>
            </div>
            <div class="value-chip">${qty} SOLD</div>
        </div>
    `).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons({ root: container });
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

    container.innerHTML = topCusts.map((c, i) => `
        <div class="premium-stat-row">
            <div class="flex-row flex-center">
                <div class="rank-box" style="background: var(--info)">#${i+1}</div>
                <div class="identity-info-v4">
                    <span class="name">${escapeHtml(c.name)}</span>
                    <span class="sub">${c.count} Orders Placed</span>
                </div>
            </div>
            <div class="value-chip success">₹${c.total.toLocaleString()}</div>
        </div>
    `).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons({ root: container });
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
    if (status === "Out for Delivery") {
        const orderCheck = state.ordersMap.get(id) || state.liveOrdersMap.get(id); // Defensive lookup (both maps)
        if (!orderCheck) {
            showToast("⚠️ Order data not found. Refreshing...", "error");
            renderOrders(state.lastOrdersSnap);
            return;
        }
        if (!orderCheck.riderId) {
            showToast("⚠️ Please assign a Rider before marking as Out for Delivery", "error");
            renderOrders(state.lastOrdersSnap);
            return;
        }
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
                const custSnap = await get(Outlet.ref(`customers/${cleanPhone}`));
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
                const delSnap = await get(ref(db, `${outletKey}/settings/Delivery`));
                const storeSnap = await get(ref(db, `${outletKey}/settings/Store`));
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

    // Handle Stock Deduction on Confirmation
    if (status === "Confirmed" && !order.stockDeducted) {
        const items = order.normalizedItems || order.cart || [];
        if (items.length > 0) {
            autoDeductStock(items);
            updates.stockDeducted = true;
        }
    }

    try {
        await update(Outlet.ref(`orders/${id}`), updates);
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
        const riderSnap = await get(ref(db, `riders/${riderId}`));
        const rider = riderSnap.val();
        if (!rider) throw new Error("Rider not found");

        const order = state.ordersMap.get(id) || state.liveOrdersMap.get(id);
        if (!order) {
            showToast("⚠️ Order data not found. Please refresh.", "error");
            return;
        }

        const updateData = {
            riderId: riderId,
            assignedRider: rider.email.toLowerCase(),
            riderName: rider.name,
            riderPhone: rider.phone,
            assignedAt: serverTimestamp()
        };

        // Automate status transition on assignment
        const currentStatus = (order.status || "").toLowerCase();
        if (currentStatus === "placed") {
            updateData.status = "Confirmed";
            
            // Handle Stock Deduction on Auto-Confirmation during Rider Assignment
            if (!order.stockDeducted) {
                const items = order.normalizedItems || order.cart || [];
                if (items.length > 0) {
                    autoDeductStock(items);
                    updateData.stockDeducted = true;
                }
            }
        }

        // Manual assignment only - Rider will handle status advancement via "PICKUP"
        showToast(`Rider ${rider.name} assigned. Status updated if needed.`, "success");

        await update(Outlet.ref(`orders/${id}`), updateData);
        
        // Notify Rider
        await addRiderNotification(riderId, "New Order Assigned!", `Order #${id.slice(-5)} for ₹${order.total} assigned to you.`, 'new');
        sendToRider(riderId, "🚚 New Order Assigned!", `Order #${id.slice(-5)} for ₹${order.total} — Please check the app.`, { orderId: id });

        logAudit("Orders", `Assigned Rider: ${rider.name} to #${id.slice(-5)}`, id);
    } catch (e) {
        showToast("Assignment failed: " + e.message, "error");
    }
}

export async function markAsPaid(id) {
    try {
        await update(Outlet.ref(`orders/${id}`), { paymentStatus: "Paid" });
        logAudit("Payments", `Marked Order Paid: #${id.slice(-5)}`, id);
        showToast("Order marked as PAID", "success");
    } catch (e) {
        showToast("Update failed: " + e.message, "error");
    }
}

export async function saveDeliveredOrder(id, data) {
    try {
        await update(Outlet.ref(`orders/${id}`), {
            ...data,
            status: "Delivered",
            deliveredAt: serverTimestamp()
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

    const content = document.getElementById('orderDrawerBody');
    if (!content) return;

    // Render items using normalized array
    const items = order.normalizedItems || [];
    const itemsHtml = items.map(item => `
        <div class="premium-row-v4 p-12 mb-8 br-12" style="background: #f8fafc; border: 1px solid #e2e8f0;">
            <div class="flex-between flex-center">
                <div class="identity-info-v4">
                    <span class="name font-600 color-primary" style="font-size:14px;">${escapeHtml(item.name || "Item")}</span>
                    <span class="sub" style="font-size:11px;">${escapeHtml(item.size || 'N/A')}</span>
                </div>
                <div class="identity-info-v4 text-right">
                    <span class="name font-700" style="font-size:14px;">₹${item.price || item.total || 0}</span>
                    <span class="sub" style="font-size:10px;">Qty: ${item.qty || 1}</span>
                </div>
            </div>
            ${(item.addon && item.addon !== 'None') || (item.addons && item.addons.length > 0) ? `
                <div class="mt-8 pt-8 border-t-ghost">
                    <div class="text-muted-small ls-sm text-upper" style="font-size:8px; margin-bottom:4px;">Extras</div>
                    <div class="flex-row flex-wrap flex-gap-4">
                        ${item.addon && item.addon !== 'None' ? `<span class="status-badge-v4 info" style="font-size:9px; padding:2px 6px;">${escapeHtml(item.addon)}</span>` : ''}
                        ${item.addons && Array.isArray(item.addons) ? item.addons.map(a => `<span class="status-badge-v4 success" style="font-size:9px; padding:2px 6px;">${escapeHtml(a.name || '')}</span>`).join('') : ''}
                    </div>
                </div>
            ` : ''}
        </div>
    `).join('');

    content.innerHTML = `
        <div class="drawer-header-v4 p-20 border-b-ghost">
            <div class="flex-between flex-center mb-10">
                <div class="identity-info-v4">
                    <span class="name fs-20 font-800 color-primary">Order #${escapeHtml(order.orderId || id.slice(-5))}</span>
                    <span class="sub">${new Date(order.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
                <span class="status-badge-v4 ${order.status.toLowerCase().replace(/\s+/g, '')}" style="font-size:11px; padding:6px 12px;">${order.status}</span>
            </div>
        </div>
        
        <div class="drawer-scroll-body p-20" style="max-height: calc(85vh - 180px); overflow-y: auto;">
            <div class="drawer-section mb-24">
                <div class="section-label-v4 mb-12">Customer Details</div>
                <div class="identity-chip-v4 p-15 br-16 bg-ghost" style="background: #fef2f2;">
                    <div class="kpi-icon-box glass" style="width:40px; height:40px;">
                        <i data-lucide="user"></i>
                    </div>
                    <div class="identity-info-v4">
                        <span class="name font-700 fs-16">${escapeHtml(order.customerName || 'Guest')}</span>
                        <span class="sub fs-13">${escapeHtml(order.phone || 'No Phone')}</span>
                    </div>
                </div>
                <div class="mt-12 p-12 br-12 border-ghost flex-row flex-gap-10">
                    <i data-lucide="map-pin" class="text-muted" style="width:16px;"></i>
                    <div class="flex-1">
                        <p class="fs-13 m-0 line-height-14">${escapeHtml(order.address || 'Counter Sale / Walk-in')}</p>
                        ${(order.locationLink || (order.lat && order.lng)) ? 
                            `<a href="${escapeHtml(order.locationLink || `https://www.google.com/maps?q=${order.lat},${order.lng}`)}" target="_blank" rel="noopener noreferrer" class="link-premium fs-11 font-700 mt-8 d-inline-block">📍 TRACK ON LIVE MAP</a>` 
                            : ""
                        }
                    </div>
                </div>
            </div>

            <div class="drawer-section mb-24">
                <div class="section-label-v4 mb-12">Order Items (${items.length})</div>
                <div class="drawer-items-list">${itemsHtml}</div>
            </div>

            <div class="drawer-section mb-24 p-20 br-16" style="background: #0f172a; color: #f1f5f9;">
                <div class="flex-between mb-8"><span class="text-white-50 fs-13">Subtotal</span><span class="fs-13">₹${order.subtotal || 0}</span></div>
                <div class="flex-between mb-8"><span class="text-white-50 fs-13">Discount</span><span class="text-success fs-13">-₹${order.discount || 0}</span></div>
                <div class="flex-between mb-12"><span class="text-white-50 fs-13">Delivery Fee</span><span class="fs-13">₹${order.deliveryFee || 0}</span></div>
                <div class="border-t-white-10 pt-12 flex-between flex-center">
                    <span class="font-600 fs-14">Grand Total</span>
                    <span class="fs-22 font-800 color-primary">₹${order.total || 0}</span>
                </div>
            </div>

            <div class="drawer-section mb-20">
                <div class="section-label-v4 mb-12">Operational Controls</div>
                <div class="panel-v4 p-15 br-16">
                    <div class="form-group mb-15">
                        <label class="form-label-small mb-8 d-block">ORDER STATUS</label>
                        <select data-action="updateStatus" data-id="${id}" class="form-input-v4 w-100">
                            ${getStatusOptions(order.status || "Placed", order.type || 'Online')}
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label-small mb-8 d-block">DELIVERY RIDER</label>
                        <select data-action="assignRider" data-id="${id}" class="form-input-v4 w-100" ${order.type === 'Dine-in' ? 'disabled' : ''}>
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

    if (window.lucide) window.lucide.createIcons({ root: content });
    
    const overlay = document.getElementById('orderDrawerOverlay');
    if (drawer) drawer.classList.add('active');
    if (overlay) overlay.classList.add('active');
    
    // Push state so back button closes the drawer
    history.pushState({ action: 'closeDrawer', targetId: 'orderDrawer' }, "", window.location.hash);
}

export function closeOrderDrawer() {
    const drawer = document.getElementById('orderDrawer');
    const overlay = document.getElementById('orderDrawerOverlay');
    if (drawer) drawer.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
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




/**
 * ROSHANI ERP | TABLE MANAGEMENT MODULE  (Admin/js/features/tables.js)
 * ============================================================================
 * Implements the session-based Dine-In architecture:
 *   pizza/tables          — floor plan, status, capacity, secure token
 *   pizza/tableSessions   — one session = one running bill, holds an array
 *                            of orderIds; multiple orders roll into ONE total
 *   pizza/orders           — UNCHANGED existing node. Dine-in orders get
 *                            extra fields: type, source, table, tableId,
 *                            tableToken, sessionId. No parallel orders system.
 *
 * Matches "Decision #2": orders reuse the EXISTING /orders node for Online,
 * Walk-in POS, and QR Dine-In. This module never writes a competing
 * dineinOrders/qrOrders node.
 *
 * COMPATIBILITY NOTE on type string: this codebase's STATUS_SEQUENCES
 * already defines  'Dine-in': ["Confirmed", "Ready", "Delivered"]  in
 * orders.js. The architecture doc specifies type:"DineIn" (no hyphen).
 * To avoid breaking the EXISTING getStatusOptions()/STATUS_SEQUENCES
 * lookup (keyed on the literal string 'Dine-in'), this module writes
 * type:"Dine-in" — identical spelling to the pre-existing constant —
 * while adding source:"QR" to distinguish QR-originated orders from a
 * counter/POS dine-in entry. This is the ONLY deviation from the literal
 * spec text, made specifically so orders.js's status pipeline keeps
 * working without modification. See "Compatibility Notes" in the
 * Commands & Guidance document.
 * ============================================================================
 */

import { Outlet, ref, get, onValue, set, update, remove, push, runTransaction, isConnected, onConnectionChange } from '../firebase.js';
import { state } from '../state.js';
import { showToast, showConfirm, showDeleteConfirm, showPaymentPicker } from '../ui-utils.js';
import { printOrderReceipt } from './printing.js';
import { haptic } from '../utils.js';

// ---------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------
let _tablesListener = null;
let _sessionsListener = null;
let _ordersListener = null;
let _requestsListener = null;
let _connUnsub = null;
let _kdsTickInterval = null;

let _tables = {};
let _sessions = {};
let _orders = {};
let _tableRequests = {};
let _seenRequestIds = null;
let _drawerTableId = null;
let _qrModalOpening = false; // guard against double-fire from #tab-tables + main.js

function _outlet() { return state.currentOutlet || 'pizza'; }
function _tblRef(sub) { return Outlet.ref(`tables${sub ? '/' + sub : ''}`); }
function _ms(v) { return typeof v === 'number' ? v : new Date(v || 0).getTime(); }
function _sessRef(sub) { return Outlet.ref(`tableSessions${sub ? '/' + sub : ''}`); }
function _ordersRef(sub) { return Outlet.ref(`orders${sub ? '/' + sub : ''}`); }
function _settingsRef(sub) { return Outlet.ref(`dineinSettings${sub ? '/' + sub : ''}`); }
function _reqRef(sub) { return Outlet.ref(`tableRequests${sub ? '/' + sub : ''}`); }
function _nowMs() { return Date.now(); }
function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _pad2(n) { return String(n).padStart(2, '0'); }

// Secure token generator — NEVER a sequential/guessable value (Decision #6)
function _secureToken() {
    const bytes = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(36)).join('').slice(0, 16).toUpperCase();
}

// ---------------------------------------------------------------------
// STATUS META
// ---------------------------------------------------------------------
const TABLE_STATUS_META = {
    free:     { label: 'Free',     icon: 'check-circle', cls: 'table-status-free' },
    occupied: { label: 'Occupied', icon: 'users',         cls: 'table-status-occupied' },
    billing:  { label: 'Billing',  icon: 'receipt',       cls: 'table-status-billing' },
    disabled: { label: 'Disabled', icon: 'ban',           cls: 'table-status-disabled' }
};
function _statusMeta(status) { return TABLE_STATUS_META[status] || TABLE_STATUS_META.free; }

// ---------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------
function _sessionForTable(tableId) {
    const t = _tables[tableId];
    if (!t?.currentSession) return null;
    return _sessions[t.currentSession] || null;
}

function _ordersForSession(sessionId) {
    const sess = _sessions[sessionId];
    if (!sess?.orders) return [];
    return sess.orders.map(oid => ({ id: oid, ...(_orders[oid] || {}) })).filter(o => o.id);
}

function _dineInOrders() {
    return Object.entries(_orders)
        .map(([id, o]) => ({ id, ...o }))
        .filter(o => o.type === 'Dine-in' && o.status !== 'Delivered' && o.status !== 'Cancelled')
        .sort((a, b) => _ms(b.createdAt) - _ms(a.createdAt));
}

function _sessionElapsedMinutes(sess) {
    if (!sess?.openedAt) return 0;
    return Math.floor((_nowMs() - sess.openedAt) / 60000);
}

const REQUEST_TYPE_META = {
    waiter: { label: 'Call Waiter', icon: 'bell' },
    water: { label: 'Request Water', icon: 'glass-water' },
    bill: { label: 'Request Bill', icon: 'receipt' },
    clean: { label: 'Clean Table', icon: 'sparkles' }
};

function _pendingRequests() {
    return Object.entries(_tableRequests)
        .map(([id, r]) => ({ id, ...r }))
        .filter(r => r.status !== 'resolved')
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function _requestChip(r) {
    const meta = REQUEST_TYPE_META[r.type] || { label: r.type || 'Request', icon: 'bell' };
    const mins = Math.max(0, Math.floor((_nowMs() - (r.createdAt || _nowMs())) / 60000));
    return `
    <div class="table-request-chip" data-id="${_esc(r.id)}">
        <i data-lucide="${meta.icon}" class="icon-14"></i>
        <span class="table-request-text"><strong>Table ${_esc(r.tableNumber || '')}</strong> · ${_esc(meta.label)} · ${mins} min ago</span>
        <button class="btn-text btn-small" data-action="resolveTableRequest" data-id="${_esc(r.id)}">Resolve</button>
    </div>`;
}

function _renderRequestsBanner() {
    const banner = document.getElementById('tableRequestsBanner');
    const pending = _pendingRequests();

    if (banner) {
        if (pending.length === 0) {
            banner.classList.add('hidden');
            banner.innerHTML = '';
        } else {
            banner.classList.remove('hidden');
            banner.innerHTML = pending.map(_requestChip).join('');
            if (window.lucide) window.lucide.createIcons({ root: banner });
        }
    }

    const kpiEl = document.getElementById('tblKpiRequests');
    if (kpiEl) kpiEl.textContent = String(pending.length);
    const kpiCard = document.getElementById('tblKpiRequestsCard');
    if (kpiCard) kpiCard.classList.toggle('table-kpi-card-alert', pending.length > 0);

    const sidebarBadge = document.getElementById('badge-tables');
    if (sidebarBadge) {
        sidebarBadge.textContent = String(pending.length);
        sidebarBadge.classList.toggle('hidden', pending.length === 0);
    }
}

async function _resolveTableRequest(reqId) {
    try {
        await update(_reqRef(reqId), { status: 'resolved', resolvedAt: _nowMs() });
        showToast('Request resolved', 'danger');
        haptic(15);
    } catch (e) {
        showToast('Could not resolve request: ' + (e?.message || e), 'error');
    }
}

// ---------------------------------------------------------------------
// RENDER: KPI cards
// ---------------------------------------------------------------------
function _renderKpis() {
    const tables = Object.values(_tables);
    const counts = { free: 0, occupied: 0, billing: 0, disabled: 0 };
    tables.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });

    const activeSessions = Object.values(_sessions).filter(s => s.status !== 'closed');
    const totalGuests = activeSessions.reduce((s, sess) => s + (sess.guestCount || 0), 0);
    const revenueToday = activeSessions.reduce((s, sess) => s + (sess.grandTotal || 0), 0);
    const avgMins = activeSessions.length
        ? Math.round(activeSessions.reduce((s, sess) => s + _sessionElapsedMinutes(sess), 0) / activeSessions.length)
        : 0;

    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
    setText('tblKpiFree', counts.free);
    setText('tblKpiOccupied', counts.occupied);
    setText('tblKpiBilling', counts.billing);
    setText('tblKpiSessions', activeSessions.length);
    setText('tblKpiGuests', totalGuests);
    setText('tblKpiRevenue', '₹' + revenueToday.toLocaleString('en-IN'));
    setText('tblKpiAvgTime', avgMins + ' min');
}

// ---------------------------------------------------------------------
// RENDER: Floor grid
// ---------------------------------------------------------------------
function _tableCard(t) {
    const meta = _statusMeta(t.status);
    const sess = _sessionForTable(t.id);
    let metaLine = '';
    if (sess && t.status !== 'free') {
        const orderCount = (sess.orders || []).length;
        const mins = _sessionElapsedMinutes(sess);
        metaLine = `<div class="table-card-bill">₹${Number(sess.grandTotal || sess.runningTotal || 0).toLocaleString('en-IN')}</div>
                     <div class="table-card-meta-row">${orderCount} Order${orderCount !== 1 ? 's' : ''} · ${mins} min</div>`;
    }
    const disabledAttr = t.status === 'disabled' ? 'disabled' : '';
    return `
    <button type="button" class="table-grid-card ${meta.cls}" data-action="openTableDrawer" data-id="${_esc(t.id)}" ${disabledAttr} title="Table ${_esc(t.number)} — ${meta.label}">
        <div class="table-card-top">
            <span class="table-card-number">${_esc(t.number)}</span>
        </div>
        <div class="table-card-seats">${t.capacity || 0} Seats</div>
        ${metaLine || `<span class="table-card-status-pill"><i data-lucide="${meta.icon}" class="icon-12"></i> ${meta.label}</span>`}
    </button>`;
}

function _renderFloorGrid() {
    const grid = document.getElementById('tableManagementGrid');
    if (!grid) return;
    const tables = Object.values(_tables).sort((a, b) => Number(a.number) - Number(b.number));

    if (tables.length === 0) {
        grid.innerHTML = `<div class="empty-state"><i data-lucide="layout-grid" class="icon-32 text-muted"></i><p>No tables yet. Click "Add Table" to create your first one.</p></div>`;
    } else {
        grid.innerHTML = tables.map(_tableCard).join('');
    }
    if (window.lucide) window.lucide.createIcons({ root: grid });
}

// ---------------------------------------------------------------------
// RENDER: Live Orders (Dine-In) panel
// ---------------------------------------------------------------------
function _statusPillClass(status) {
    const map = { Placed: 'badge-placed', Confirmed: 'badge-confirmed', Ready: 'badge-ready', Preparing: 'badge-preparing', Delivered: 'badge-delivered' };
    return map[status] || 'badge-pending';
}

function _orderListRow(o) {
    const t = _tables[o.tableId];
    const tNum = t ? _esc(t.number) : (o.table || '--');
    const itemsLine = Object.values(o.items || {}).slice(0, 2).map(it => `${it.qty || 1} × ${_esc(it.name || 'Item')}`).join(', ');
    const isNew = (_nowMs() - _ms(o.createdAt)) < 120000;
    return `
    <div class="live-order-row" data-action="openTableDrawerByOrder" data-order-id="${_esc(o.id)}">
        <div class="live-order-row-main">
            <span class="live-order-table-chip">Table ${tNum}</span>
            <span class="live-order-id">#${_esc(String(o.id).slice(-6).toUpperCase())}</span>
            <span class="live-order-time">${new Date(o.createdAt || _nowMs()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="live-order-row-items">${itemsLine || 'No items'}</div>
        <span class="badge ${_statusPillClass(o.status)}">${isNew ? 'NEW' : _esc(o.status || 'Placed')}</span>
    </div>`;
}

function _renderLiveOrdersList() {
    const list = document.getElementById('tableLiveOrdersList');
    const countEl = document.getElementById('tableLiveOrdersCount');
    if (!list) return;
    const orders = _dineInOrders();
    if (countEl) countEl.textContent = String(orders.length);
    list.innerHTML = orders.length
        ? orders.map(_orderListRow).join('')
        : `<p class="text-muted-small">No active dine-in orders right now.</p>`;
    if (window.lucide) window.lucide.createIcons({ root: list });
}

// ---------------------------------------------------------------------
// RENDER: Kitchen Display System (KDS)
// ---------------------------------------------------------------------
function _elapsedLabel(createdAt) {
    const diff = Math.max(0, _nowMs() - _ms(createdAt));
    return `${Math.floor(diff / 60000)}:${_pad2(Math.floor((diff % 60000) / 1000))}`;
}

function _kdsCard(o) {
    const t = _tables[o.tableId];
    const tNum = t ? _esc(t.number) : (o.table || '--');
    const itemsLines = Object.values(o.items || {}).map(it => `<div class="kds-item-line">${it.qty || 1} × ${_esc(it.name || 'Item')}</div>`).join('');
    const mins = Math.floor((_nowMs() - _ms(o.createdAt)) / 60000);
    const urgentCls = mins >= 15 ? 'kds-card-urgent' : (mins >= 8 ? 'kds-card-warn' : '');
    return `
    <div class="kds-card ${urgentCls}" data-order-id="${_esc(o.id)}">
        <div class="kds-card-top">
            <span class="kds-card-table">Table ${tNum}</span>
            <span class="kds-card-id">#${_esc(String(o.id).slice(-6).toUpperCase())}</span>
        </div>
        <div class="kds-card-items">${itemsLines}</div>
        <div class="kds-card-footer">
            <span class="kds-elapsed" data-created-at="${_ms(o.createdAt)}">${_elapsedLabel(o.createdAt)}</span>
            <span class="kds-time-label">${new Date(o.createdAt || _nowMs()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
    </div>`;
}

function _renderKDS() {
    const newCol = document.getElementById('kdsColumnNew');
    const prepCol = document.getElementById('kdsColumnPreparing');
    const readyCol = document.getElementById('kdsColumnReady');
    if (!newCol || !prepCol || !readyCol) return;

    const groups = { New: [], Confirmed: [], Ready: [] };
    _dineInOrders().forEach(o => {
        const st = o.status || 'Placed';
        if (st === 'Placed') groups.New.push(o);
        else if (st === 'Confirmed' || st === 'Preparing') groups.Confirmed.push(o);
        else if (st === 'Ready') groups.Ready.push(o);
    });
    const fill = (col, list, emptyMsg) => { col.innerHTML = list.length ? list.map(_kdsCard).join('') : `<p class="text-muted-small kds-empty">${emptyMsg}</p>`; };
    fill(newCol, groups.New, 'No new orders');
    fill(prepCol, groups.Confirmed, 'Nothing preparing');
    fill(readyCol, groups.Ready, 'Nothing ready');

    const setCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = String(n); };
    setCount('kdsCountNew', groups.New.length);
    setCount('kdsCountPreparing', groups.Confirmed.length);
    setCount('kdsCountReady', groups.Ready.length);
}

function _tickKDS() {
    document.querySelectorAll('.kds-elapsed').forEach(el => {
        const created = Number(el.getAttribute('data-created-at')) || _nowMs();
        el.textContent = _elapsedLabel(created);
        const mins = Math.floor((_nowMs() - created) / 60000);
        const card = el.closest('.kds-card');
        if (card) {
            card.classList.toggle('kds-card-warn', mins >= 8 && mins < 15);
            card.classList.toggle('kds-card-urgent', mins >= 15);
        }
    });
    if (_drawerTableId) _renderDrawerSessionMeta();
}

// ---------------------------------------------------------------------
// RENDER: Table Drawer (right-side slide-over panel)
// ---------------------------------------------------------------------
function _renderDrawerSessionMeta() {
    const t = _tables[_drawerTableId];
    const sess = t ? _sessionForTable(t.id) : null;
    const runEl = document.getElementById('tableDrawerRunningTime');
    if (runEl && sess) runEl.textContent = _sessionElapsedMinutes(sess) + ' min';
}

function _orderActionButtons(o) {
    const id = _esc(o.id);
    if (o.status === 'Placed' || !o.status) {
        return `<button class="btn-action-blue btn-small" data-action="advanceTableOrder" data-id="${id}" data-next="Confirmed">
                    <i data-lucide="check" class="icon-12"></i> Accept Order
                </button>
                <button class="btn-text text-danger btn-small" data-action="advanceTableOrder" data-id="${id}" data-next="Cancelled">Cancel</button>`;
    }
    if (o.status === 'Confirmed' || o.status === 'Preparing') {
        return `<button class="btn-action-orange btn-small" data-action="advanceTableOrder" data-id="${id}" data-next="Ready">
                    <i data-lucide="chef-hat" class="icon-12"></i> Mark Ready
                </button>
                <button class="btn-text text-danger btn-small" data-action="advanceTableOrder" data-id="${id}" data-next="Cancelled">Cancel</button>`;
    }
    if (o.status === 'Ready') {
        return `<button class="btn-action-green btn-small" data-action="advanceTableOrder" data-id="${id}" data-next="Delivered">
                    <i data-lucide="check-check" class="icon-12"></i> Mark Served
                </button>`;
    }
    return '';
}

function _orderCardInDrawer(o) {
    const items = Object.values(o.items || {});
    const itemLines = items.map(it => `<div class="order-details-item-row"><span>${it.qty || 1} × ${_esc(it.name || 'Item')}</span><span>₹${Number((it.price || 0) * (it.qty || 1)).toFixed(0)}</span></div>`).join('');
    return `
    <div class="drawer-order-block">
        <div class="drawer-order-block-head">
            <span>#${_esc(String(o.id).slice(-6).toUpperCase())}</span>
            <span class="badge ${_statusPillClass(o.status)}">${_esc(o.status || 'Placed')}</span>
        </div>
        ${itemLines}
        <div class="drawer-order-actions">${_orderActionButtons(o)}</div>
        <button class="btn-text btn-small drawer-order-jump" data-action="jumpToOrderInOrdersTab" data-id="${_esc(o.id)}">
            <i data-lucide="external-link" class="icon-12"></i> Open in Orders tab
        </button>
    </div>`;
}

function _renderTableDrawer() {
    const drawer = document.getElementById('tableDrawer');
    const overlay = document.getElementById('tableDrawerOverlay');
    if (!drawer) return;

    if (!_drawerTableId || !_tables[_drawerTableId]) {
        drawer.classList.remove('active');
        overlay?.classList.remove('active');
        return;
    }

    const t = _tables[_drawerTableId];
    const meta = _statusMeta(t.status);
    const sess = _sessionForTable(t.id);

    drawer.classList.add('active');
    overlay?.classList.add('active');

    document.getElementById('tableDrawerTitle').textContent = `Table ${t.number}`;
    const statusBadge = document.getElementById('tableDrawerStatusBadge');
    statusBadge.textContent = meta.label;
    statusBadge.className = `table-drawer-status-badge ${meta.cls}`;
    document.getElementById('tableDrawerSessionState').textContent = sess ? (sess.status === 'billing' ? 'Billing requested' : 'Session active') : 'No active session';

    document.getElementById('tableDrawerCapacity').textContent = t.capacity || '—';
    document.getElementById('tableDrawerSessionStarted').textContent = sess?.openedAt
        ? new Date(sess.openedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : '—';
    document.getElementById('tableDrawerRunningTime').textContent = sess ? _sessionElapsedMinutes(sess) + ' min' : '—';

    const ordersWrap = document.getElementById('tableDrawerOrders');
    const totalWrap = document.getElementById('tableDrawerTotalCard');
    const actionsWrap = document.getElementById('tableDrawerActions');

    if (!sess) {
        ordersWrap.innerHTML = `<p class="text-muted-small">No active session for this table.</p>`;
        totalWrap.innerHTML = '';
        actionsWrap.innerHTML = `
            <button class="btn-secondary btn-small" data-action="openTableQr" data-id="${_esc(t.id)}"><i data-lucide="qr-code" class="icon-14"></i> View / Print QR</button>
            <button class="btn-secondary btn-small" data-action="editTable" data-id="${_esc(t.id)}"><i data-lucide="pencil" class="icon-14"></i> Edit Table</button>
            ${t.status === 'disabled'
                ? `<button class="btn-action-green btn-small" data-action="enableTable" data-id="${_esc(t.id)}"><i data-lucide="check" class="icon-14"></i> Enable Table</button>`
                : `<button class="btn-text text-danger btn-small" data-action="disableTable" data-id="${_esc(t.id)}"><i data-lucide="ban" class="icon-14"></i> Disable Table</button>`}
            <button class="btn-text text-danger btn-small" data-action="deleteTable" data-id="${_esc(t.id)}"><i data-lucide="trash-2" class="icon-14"></i> Delete Table</button>`;
        if (window.lucide) window.lucide.createIcons({ root: drawer });
        return;
    }

    const orders = _ordersForSession(sess.sessionId || t.currentSession);
    ordersWrap.innerHTML = `
        <h5 class="text-muted-small mb-8" style="margin:0;">Current Orders (${orders.length})</h5>
        ${orders.map(_orderCardInDrawer).join('') || '<p class="text-muted-small">No orders yet.</p>'}`;

    const runningTotal = sess.grandTotal ?? sess.runningTotal ?? 0;
    totalWrap.innerHTML = `
        <div class="table-drawer-total-card">
            <div><span class="table-drawer-total-label">Current Total</span><div class="text-muted-small">${orders.length} Order${orders.length !== 1 ? 's' : ''} · Pending Payment</div></div>
            <span class="table-drawer-total-amount">₹${Number(runningTotal).toLocaleString('en-IN')}</span>
        </div>`;

    const btns = [];
    if (sess.status !== 'billing') {
        btns.push(`<button class="btn-action-orange btn-small" data-action="requestBillForTable" data-id="${_esc(t.id)}"><i data-lucide="receipt" class="icon-14"></i> Generate Bill</button>`);
    } else {
        btns.push(`<button class="btn-action-green btn-small" data-action="closeSessionForTable" data-id="${_esc(t.id)}"><i data-lucide="check-check" class="icon-14"></i> Close Table (Paid)</button>`);
    }
    btns.push(`<button class="btn-secondary btn-small" data-action="printTableKOT" data-id="${_esc(t.id)}"><i data-lucide="printer" class="icon-14"></i> Print KOT</button>`);
    btns.push(`<button class="btn-secondary btn-small" data-action="printSessionBill" data-id="${_esc(t.id)}"><i data-lucide="receipt-text" class="icon-14"></i> Print Bill</button>`);
    btns.push(`<button class="btn-secondary btn-small" data-action="openTableQr" data-id="${_esc(t.id)}"><i data-lucide="qr-code" class="icon-14"></i> View QR</button>`);
    btns.push(`<button class="btn-text text-danger btn-small" data-action="cancelSessionForTable" data-id="${_esc(t.id)}"><i data-lucide="x-circle" class="icon-14"></i> Cancel / Free Table</button>`);
    actionsWrap.innerHTML = btns.join('');

    if (window.lucide) window.lucide.createIcons({ root: drawer });
}

function _renderAll() {
    _renderKpis();
    _renderFloorGrid();
    _renderLiveOrdersList();
    _renderKDS();
    _renderTableDrawer();
    _renderRequestsBanner();
}

// ---------------------------------------------------------------------
// ACTIONS — Table CRUD
// ---------------------------------------------------------------------
let _editingTableId = null;

function _openTableEditor(id) {
    _editingTableId = id || null;
    const t = id ? _tables[id] : null;
    document.getElementById('tableEditorTitle').textContent = t ? 'Edit Table' : 'Add Table';
    const el = (eid, val) => { const e = document.getElementById(eid); if (e != null) e.value = val ?? ''; };
    el('tblNumber', t?.number ?? _pad2(Object.keys(_tables).length + 1));
    el('tblCapacity', t?.capacity ?? 4);
    document.getElementById('tableEditorModal')?.classList.add('active');
}
function _closeTableEditor() {
    document.getElementById('tableEditorModal')?.classList.remove('active');
    _editingTableId = null;
}

async function _saveTable() {
    const number = String(document.getElementById('tblNumber')?.value || '').trim();
    const capacity = Number(document.getElementById('tblCapacity')?.value) || 2;
    if (!number) { showToast('Please enter a table number', 'warning'); return; }

    const duplicate = Object.entries(_tables).find(([id, t]) => t.number === number && id !== _editingTableId);
    if (duplicate) { showToast(`Table ${number} already exists`, 'warning'); return; }

    try {
        if (_editingTableId) {
            await update(_tblRef(_editingTableId), { number, capacity, updatedAt: _nowMs() });
            showToast('Table updated', 'success');
        } else {
            const newRef = push(_tblRef());
            const token = _secureToken();
            await set(newRef, {
                id: newRef.key, number, capacity, status: 'free', active: true,
                token, currentSession: null, createdAt: _nowMs(), updatedAt: _nowMs()
            });
            showToast(`Table ${number} created`, 'success');
        }
        haptic(20);
        _closeTableEditor();
    } catch (e) {
        showToast('Save failed: ' + (e?.message || e), 'error');
    }
}

async function _deleteTable(id) {
    const t = _tables[id];
    if (!t) return;
    if (t.currentSession) { showToast('Cannot delete a table with an active session', 'warning'); return; }
    const ok = await showDeleteConfirm(`Table ${t.number}`, 'This will permanently remove the table and invalidate its QR code.');
    if (!ok) return;
    try {
        await remove(_tblRef(id));
        if (_drawerTableId === id) { _drawerTableId = null; _renderTableDrawer(); }
        showToast('Table deleted', 'success');
    } catch (e) {
        showToast('Delete failed', 'error');
    }
}

async function _setTableEnabled(id, enabled) {
    try {
        await update(_tblRef(id), { status: enabled ? 'free' : 'disabled', active: enabled, updatedAt: _nowMs() });
        showToast(enabled ? 'Table enabled' : 'Table disabled', 'success');
    } catch (e) {
        showToast('Update failed', 'error');
    }
}

function _openTableDrawer(id) {
    if (_drawerTableId === id && document.getElementById('tableDrawer')?.classList.contains('active')) return;
    _drawerTableId = id;
    _renderTableDrawer();
    haptic(10);
}
function _closeTableDrawer() {
    _drawerTableId = null;
    _renderTableDrawer();
}
function _openTableDrawerByOrder(orderId) {
    const o = _orders[orderId];
    if (o?.tableId) _openTableDrawer(o.tableId);
}

// ---------------------------------------------------------------------
// ACTIONS — Session lifecycle (Decision #4: session-based billing)
// ---------------------------------------------------------------------
async function _requestBillForTable(tableId) {
    const t = _tables[tableId];
    const sess = _sessionForTable(tableId);
    if (!t || !sess) return;
    try {
        await update(_sessRef(sess.sessionId), { status: 'billing' });
        await update(_tblRef(tableId), { status: 'billing', updatedAt: _nowMs() });
        showToast('Bill generated — table marked for billing', 'success');
        haptic(20);
    } catch (e) {
        showToast('Failed to generate bill: ' + (e?.message || e), 'error');
    }
}

async function _closeSessionForTable(tableId) {
    const t = _tables[tableId];
    const sess = _sessionForTable(tableId);
    if (!t || !sess) return;
    const total = Number(sess.grandTotal || sess.runningTotal || 0);
    const method = await showPaymentPicker(total);
    if (!method) return;
    try {
        await update(_sessRef(sess.sessionId), { status: 'closed', closedAt: _nowMs(), paymentMethod: method, paidAt: _nowMs() });
        await update(_tblRef(tableId), { status: 'free', currentSession: null, updatedAt: _nowMs() });
        await runTransaction(Outlet.ref(`tableAnalytics/${tableId}`), (cur) => {
            cur = cur || { totalOrders: 0, totalRevenue: 0, avgSessionTime: 0, occupancyRate: 0 };
            const orderCount = (sess.orders || []).length;
            const mins = _sessionElapsedMinutes(sess);
            cur.totalOrders = (cur.totalOrders || 0) + orderCount;
            cur.totalRevenue = (cur.totalRevenue || 0) + total;
            cur.avgSessionTime = cur.avgSessionTime ? Math.round((cur.avgSessionTime + mins) / 2) : mins;
            return cur;
        });
        if (_drawerTableId === tableId) _closeTableDrawer();
        showToast(`Table closed — ₹${total.toLocaleString('en-IN')} via ${method}`, 'success');
        haptic(30);
    } catch (e) {
        showToast('Failed to close table: ' + (e?.message || e), 'error');
    }
}

async function _cancelSessionForTable(tableId) {
    const t = _tables[tableId];
    const sess = _sessionForTable(tableId);
    if (!t) return;
    const ok = await showConfirm('Cancel this session and free the table? Existing orders remain in Orders history but the running bill is discarded.', 'Cancel Session');
    if (!ok) return;
    try {
        if (sess) await update(_sessRef(sess.sessionId), { status: 'closed', closedAt: _nowMs() });
        await update(_tblRef(tableId), { status: 'free', currentSession: null, updatedAt: _nowMs() });
        if (_drawerTableId === tableId) _closeTableDrawer();
        showToast('Session cancelled, table freed', 'success');
    } catch (e) {
        showToast('Failed: ' + (e?.message || e), 'error');
    }
}

// ---------------------------------------------------------------------
// ACTIONS — Order status advance (writes the SAME /orders node)
// ---------------------------------------------------------------------
async function _advanceOrder(orderId, nextStatus) {
    try {
        await update(_ordersRef(orderId), { status: nextStatus, updatedAt: _nowMs() });
        showToast(`Order moved to ${nextStatus}`, 'success');
        haptic(20);
    } catch (e) {
        showToast('Update failed: ' + (e?.message || e), 'error');
    }
}

// ---------------------------------------------------------------------
// Cross-tab navigation — opens a specific order on the existing Orders
// tab using its own search box. The current orders.js render does not
// surface a table number in row text, so searching by table would not
// reliably match; the order's own ID (which IS rendered and searchable)
// is used instead. This avoids touching orders.js's render logic.
// ---------------------------------------------------------------------
function _jumpToOrderInOrdersTab(orderId) {
    const shortId = String(orderId).slice(-6);
    // window.switchTab is the global entry point main.js wires to every
    // data-action="switchTab" button; calling it directly here follows
    // the same call path a sidebar click would make.
    if (typeof window.switchTab === 'function') {
        window.switchTab('orders');
    } else {
        document.querySelector('[data-action="switchTab"][data-tab="orders"]')?.click();
    }
    // Give switchTab's lazy module import a moment to resolve and render
    // before touching the search input it creates.
    setTimeout(() => {
        const input = document.getElementById('orderSearch');
        if (input) {
            input.value = shortId;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
        }
    }, 350);
}

// ---------------------------------------------------------------------
// KOT printing — lightweight kitchen ticket (printing.js handles the
// customer-facing receipt; KOT is a separate, simpler print job)
// ---------------------------------------------------------------------
function _printTableKOT(tableId) {
    const t = _tables[tableId];
    const sess = _sessionForTable(tableId);
    if (!t || !sess) { showToast('No active session to print', 'warning'); return; }
    const orders = _ordersForSession(sess.sessionId || t.currentSession);
    const allItems = [];
    orders.forEach(o => Object.values(o.items || {}).forEach(it => allItems.push(it)));

    const itemRows = allItems.map(it => `<div class="kot-item-row"><span>${it.qty || 1} ×</span><span>${_esc(it.name || 'Item')}</span></div>`).join('');
    const w = window.open('', '_blank', 'width=380,height=600');
    w.document.write(`<html><head><title>KOT — Table ${_esc(t.number)}</title><style>
        body{font-family:'Courier New',monospace;padding:16px;width:280px;}
        h2{text-align:center;margin-bottom:2px;font-size:18px;}
        .sub{text-align:center;font-size:11px;color:#555;margin-bottom:14px;border-bottom:1px dashed #000;padding-bottom:10px;}
        .kot-item-row{display:flex;gap:8px;font-size:14px;padding:4px 0;border-bottom:1px dotted #ccc;}
        .kot-item-row span:first-child{font-weight:700;min-width:30px;}
        .foot{margin-top:14px;font-size:11px;text-align:center;color:#777;}
        </style></head><body>
        <h2>KOT — TABLE ${_esc(t.number)}</h2>
        <div class="sub">${new Date().toLocaleString('en-IN')} · Session ${_esc(sess.sessionId || '')}</div>
        ${itemRows || '<p>No items</p>'}
        <div class="foot">Roshani Pizza — Kitchen Copy</div>
        <script>window.onload=function(){window.print();};</script></body></html>`);
    w.document.close();
}

async function _printSessionBill(tableId) {
    const t = _tables[tableId];
    const sess = _sessionForTable(tableId);
    if (!t || !sess) { showToast('No active session to print', 'warning'); return; }

    const orders = _ordersForSession(sess.sessionId || t.currentSession);
    if (!orders.length) { showToast('No orders to bill', 'warning'); return; }

    let subtotal = 0;
    const allItems = [];
    orders.forEach(o => {
        Object.values(o.items || {}).forEach(it => {
            const qty = Number(it.qty || 1);
            const price = Number(it.price || 0);
            allItems.push({ name: it.name || 'Item', qty, price, size: it.size || '', addon: it.addon || '' });
            subtotal += price * qty;
        });
    });

    const dineSnap = await get(_settingsRef());
    const dine = dineSnap.val() || {};
    const taxRate = typeof dine.taxRate === 'number' ? dine.taxRate : 5;
    const scRate = typeof dine.serviceChargeRate === 'number' ? dine.serviceChargeRate : 0;
    const tax = Number(sess.tax ?? 0) || Math.round(subtotal * (taxRate / 100) * 100) / 100;
    const serviceCharge = Number(sess.serviceCharge ?? 0) || (dine.serviceChargeEnabled ? Math.round(subtotal * (scRate / 100) * 100) / 100 : 0);
    const grandTotal = Number(sess.grandTotal ?? (subtotal + tax + serviceCharge));

    const combinedOrder = {
        orderId: `TABLE-${t.number}`,
        type: 'Dine-in',
        items: allItems,
        total: grandTotal,
        subtotal,
        discount: 0,
        deliveryFee: 0,
        createdAt: sess.openedAt || Date.now(),
        paymentMethod: 'Cash',
        status: 'Delivered',
        customerName: `Table ${t.number}`
    };

    await printOrderReceipt(combinedOrder, true);
}

// ---------------------------------------------------------------------
// QR generation — client-side only, no external API call
// ---------------------------------------------------------------------
async function _dineInBaseUrl() {
    const snap = await get(_settingsRef('qrBaseUrl'));
    return snap.exists() ? snap.val() : `${window.location.origin}/menu/`;
}

async function _ensureQrLib() {
    if (window.QRCode) return true;
    return new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
    });
}

async function _qrDataUri(text, size = 220) {
    const ok = await _ensureQrLib();
    if (!ok || !window.QRCode) return null;
    return new Promise((resolve) => {
        const holder = document.createElement('div');
        new window.QRCode(holder, { text, width: size, height: size, colorDark: '#1a1a1a', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
        setTimeout(() => {
            const img = holder.querySelector('img');
            const canvas = holder.querySelector('canvas');
            resolve(img?.src || canvas?.toDataURL('image/png') || null);
        }, 100);
    });
}

// Secure URL shape — TOKEN ONLY, never a table number (Decision #5/#6)
async function _qrUrlForTable(t) {
    const base = await _dineInBaseUrl();
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}t=${t.token}`;
}

async function _openQrModal(id) {
    if (_qrModalOpening) return;
    _qrModalOpening = true;
    try {
        const t = _tables[id];
        if (!t) return;
        const url = await _qrUrlForTable(t);
        document.getElementById('tableQrModalTitle').textContent = `Table ${t.number} QR Code`;
        document.getElementById('tableQrModalUrl').textContent = url;
        const img = document.getElementById('tableQrModalImage');
        img.removeAttribute('src');
        img.alt = 'Generating QR…';
        const modal = document.getElementById('tableQrModal');
        if (modal) modal.dataset.tableId = id;
        modal?.classList.add('active');
        const dataUri = await _qrDataUri(url, 240);
        if (dataUri) { img.src = dataUri; img.alt = `QR code for Table ${t.number}`; }
        else showToast('QR generation failed — check connection', 'error');
    } finally {
        _qrModalOpening = false;
    }
}
function _closeQrModal() { document.getElementById('tableQrModal')?.classList.remove('active'); }

function _copyQrLink() {
    const url = document.getElementById('tableQrModalUrl')?.textContent;
    if (!url) return;
    navigator.clipboard?.writeText(url).then(() => showToast('Link copied', 'success')).catch(() => showToast('Could not copy link', 'error'));
}

function _printSingleQr() {
    const img = document.getElementById('tableQrModalImage');
    const title = document.getElementById('tableQrModalTitle')?.textContent || 'Table QR';
    if (!img?.src) return;
    const w = window.open('', '_blank', 'width=400,height=560');
    w.document.write(`<html><head><title>${_esc(title)}</title><style>
        body{font-family:sans-serif;text-align:center;padding:24px;}
        h2{margin-bottom:4px;} .sub{color:#777;margin-bottom:18px;font-size:13px;}
        img{width:240px;height:240px;} .foot{margin-top:14px;font-size:12px;color:#999;}
        </style></head><body><h2>${_esc(title)}</h2><div class="sub">Scan to order</div>
        <img src="${img.src}"><div class="foot">Roshani Pizza — Thank You!</div>
        <script>window.onload=function(){window.print();};</script></body></html>`);
    w.document.close();
}

async function _bulkQrPrint() {
    const tables = Object.values(_tables).filter(t => t.status !== 'disabled').sort((a, b) => Number(a.number) - Number(b.number));
    if (tables.length === 0) { showToast('No tables to print', 'warning'); return; }
    const ok = await showConfirm(`Generate printable QR cards for all ${tables.length} tables?`, 'Bulk QR Print');
    if (!ok) return;

    showToast('Generating QR codes…', 'info');
    const cards = [];
    for (const t of tables) {
        const url = await _qrUrlForTable(t);
        const dataUri = await _qrDataUri(url, 200);
        cards.push({ t, dataUri });
    }
    const w = window.open('', '_blank');
    const cardsHtml = cards.map(({ t, dataUri }) => `
        <div class="qr-card">
            <div class="qr-card-label">TABLE</div>
            <div class="qr-card-number">${_esc(t.number)}</div>
            <div class="qr-card-scan">SCAN TO ORDER</div>
            ${dataUri ? `<img src="${dataUri}">` : '<p>QR failed</p>'}
            <div class="qr-card-thanks">Thank You!</div>
        </div>`).join('');
    w.document.write(`<html><head><title>Bulk QR Print — Roshani Pizza</title><style>
        body{font-family:sans-serif;margin:0;padding:16px;}
        .qr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
        .qr-card{border:2px solid #E84908;border-radius:12px;padding:16px;text-align:center;break-inside:avoid;page-break-inside:avoid;}
        .qr-card-label{font-size:11px;letter-spacing:2px;color:#E84908;font-weight:700;}
        .qr-card-number{font-size:36px;font-weight:900;color:#1a1a1a;margin:2px 0 6px;}
        .qr-card-scan{font-size:11px;color:#777;margin-bottom:8px;font-weight:600;}
        .qr-card img{width:140px;height:140px;}
        .qr-card-thanks{font-size:11px;color:#999;margin-top:8px;}
        @media print{ .qr-grid{grid-template-columns:repeat(2,1fr);} }
        </style></head><body><div class="qr-grid">${cardsHtml}</div>
        <script>window.onload=function(){setTimeout(function(){window.print();},300);};</script></body></html>`);
    w.document.close();
}

function _exportTablesCsv() {
    const rows = [['Table', 'Capacity', 'Status', 'Current Session', 'Running Total']];
    Object.values(_tables).sort((a, b) => Number(a.number) - Number(b.number)).forEach(t => {
        const sess = _sessionForTable(t.id);
        rows.push([t.number, t.capacity, t.status, sess?.sessionId || '', sess ? (sess.grandTotal ?? sess.runningTotal ?? 0) : '']);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tables-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ---------------------------------------------------------------------
// Firebase listeners — exactly 3 listeners total, NEVER one-per-table
// (matches "Performance Architecture" rule in the spec)
// ---------------------------------------------------------------------
function _attachListeners() {
    if (_tablesListener) { _tablesListener(); _tablesListener = null; }
    if (_sessionsListener) { _sessionsListener(); _sessionsListener = null; }
    if (_ordersListener) { _ordersListener(); _ordersListener = null; }
    if (_requestsListener) { _requestsListener(); _requestsListener = null; }

    _tablesListener = onValue(_tblRef(), (snap) => {
        _tables = snap.val() || {};
        _renderAll();
    }, (err) => {
        console.error('[Tables] Read error:', err);
        const grid = document.getElementById('tableManagementGrid');
        if (grid) grid.innerHTML = `<div class="offline-placeholder"><i data-lucide="alert-triangle" class="icon-32"></i><h4>Permission denied</h4><p>Could not load table data.</p></div>`;
    });

    _sessionsListener = onValue(_sessRef(), (snap) => {
        _sessions = snap.val() || {};
        _renderAll();
    });

    // Reuses the existing /orders node — this is NOT a new listener pattern,
    // it is the same path orders.js already subscribes to. tables.js attaches
    // its own because it is lazy-loaded independently of orders.js and must
    // not assume orders.js's listener is currently active when this tab opens.
    _ordersListener = onValue(_ordersRef(), (snap) => {
        _orders = snap.val() || {};
        _renderAll();
    });

    _requestsListener = onValue(_reqRef(), (snap) => {
        _tableRequests = snap.val() || {};
        const currentIds = new Set(Object.keys(_tableRequests));

        if (_seenRequestIds !== null) {
            const newOnes = [...currentIds].filter(id => !_seenRequestIds.has(id) && _tableRequests[id]?.status !== 'resolved');
            newOnes.forEach(id => {
                const r = _tableRequests[id];
                const meta = REQUEST_TYPE_META[r.type] || { label: r.type || 'Request' };
                showToast(`Table ${r.tableNumber || ''}: ${meta.label}`, 'info');
            });
            if (newOnes.length) haptic(25);
        }
        _seenRequestIds = currentIds;
        _renderAll();
    });
}

export function cleanupTables() {
    if (_tablesListener) { _tablesListener(); _tablesListener = null; }
    if (_sessionsListener) { _sessionsListener(); _sessionsListener = null; }
    if (_ordersListener) { _ordersListener(); _ordersListener = null; }
    if (_requestsListener) { _requestsListener(); _requestsListener = null; }
    if (_connUnsub) { _connUnsub(); _connUnsub = null; }
    if (_kdsTickInterval) { clearInterval(_kdsTickInterval); _kdsTickInterval = null; }
    _seenRequestIds = null;
    _closeTableDrawer();
}

export function loadTableManagement() {
    console.log('[Tables] Loading tab…');
    if (_connUnsub) { _connUnsub(); _connUnsub = null; }

    if (isConnected()) {
        _attachListeners();
    } else {
        const grid = document.getElementById('tableManagementGrid');
        if (grid) grid.innerHTML = `<div class="offline-placeholder"><i data-lucide="wifi-off" class="icon-32"></i><h4>Waiting for connection</h4><p>Table data will load automatically when the connection is restored.</p></div>`;
        if (!_connUnsub) _connUnsub = onConnectionChange(function _retryTables(online) {
            if (!online) return;
            if (_connUnsub) { _connUnsub(); _connUnsub = null; }
            cleanupTables();
            loadTableManagement();
        });
    }

    if (!_kdsTickInterval) _kdsTickInterval = setInterval(_tickKDS, 1000);

    const tabRoot = document.getElementById('tab-tables');
    if (tabRoot && !tabRoot.__tablesWired) {
        tabRoot.__tablesWired = true;
        tabRoot.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            switch (action) {
                case 'openTableDrawer': _openTableDrawer(id); break;
                case 'openTableDrawerByOrder': _openTableDrawerByOrder(btn.dataset.orderId); break;
                case 'openAddTable': _openTableEditor(null); break;
                case 'editTable': _openTableEditor(id); break;
                case 'deleteTable': _deleteTable(id); break;
                case 'enableTable': _setTableEnabled(id, true); break;
                case 'disableTable': _setTableEnabled(id, false); break;
                case 'openTableQr': _openQrModal(id); break;
                case 'bulkQrPrint': _bulkQrPrint(); break;
                case 'exportTables': _exportTablesCsv(); break;
                case 'advanceTableOrder': _advanceOrder(id, btn.dataset.next); break;
                case 'requestBillForTable': _requestBillForTable(id); break;
                case 'closeSessionForTable': _closeSessionForTable(id); break;
                case 'cancelSessionForTable': _cancelSessionForTable(id); break;
                case 'printTableKOT': _printTableKOT(id); break;
                case 'printSessionBill': _printSessionBill(id); break;
                case 'resolveTableRequest': _resolveTableRequest(btn.dataset.id); break;
                case 'jumpToOrderInOrdersTab': _jumpToOrderInOrdersTab(id); break;
                case 'closeTableDrawer': _closeTableDrawer(); break;
            }
        });
    }

    if (!window.__tablesModalsWired) {
        window.__tablesModalsWired = true;
        document.getElementById('tableEditorSaveBtn')?.addEventListener('click', _saveTable);
        document.getElementById('tableEditorCancelBtn')?.addEventListener('click', _closeTableEditor);
        document.getElementById('tableEditorCloseBtn')?.addEventListener('click', _closeTableEditor);
        document.getElementById('tableQrCloseBtn')?.addEventListener('click', _closeQrModal);
        document.getElementById('tableQrPrintBtn')?.addEventListener('click', _printSingleQr);
        document.getElementById('tableQrCopyLinkBtn')?.addEventListener('click', _copyQrLink);
        document.getElementById('tableDrawerOverlay')?.addEventListener('click', _closeTableDrawer);
        document.getElementById('tableDrawerCloseBtn')?.addEventListener('click', _closeTableDrawer);
    }
}

window.__tables = {
    openEditor: _openTableEditor, closeEditor: _closeTableEditor, save: _saveTable,
    delete: _deleteTable, openDrawer: _openTableDrawer, closeDrawer: _closeTableDrawer,
    openQr: _openQrModal, closeQr: _closeQrModal, bulkPrint: _bulkQrPrint, exportCsv: _exportTablesCsv,
    openDrawerByOrder: _openTableDrawerByOrder, requestBill: _requestBillForTable,
    printKOT: _printTableKOT, jumpToOrder: _jumpToOrderInOrdersTab,
    closeSession: _closeSessionForTable, cancelSession: _cancelSessionForTable,
    printSessionBill: _printSessionBill,
    editTable: _openTableEditor, setTableEnabled: _setTableEnabled
};

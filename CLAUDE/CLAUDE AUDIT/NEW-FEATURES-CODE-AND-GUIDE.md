# New Updates — Exact Code + Placement Guide

Every block below is **copy-paste ready**. Each one shows: the file,
the exact anchor text to find in that file, and the exact code to
insert relative to it. Apply in the order given (rules first).

---

## 0. `database.rules.json` — REQUIRED for Feature 3 to work at all

**Find** your existing `tableRequests` node under `$outletId` and
**replace the entire block** with:

```json
"tableRequests": {
  ".read": "auth != null && (root.child('admins').child(auth.uid).child('outlet').val() == $outletId || auth.token.email == 'nexorasoftware@gmail.com' || auth.token.email == 'roshanisudha@gmail.com' || root.child('admins').child(auth.uid).child('isSuper').val() == true || root.child('admins').child(auth.uid).child('isSupreme').val() == true)",
  "$reqId": {
    ".write": "(!data.exists() && newData.hasChildren(['tableId','type','createdAt'])) || (auth != null && (root.child('admins').child(auth.uid).child('outlet').val() == $outletId || auth.token.email == 'nexorasoftware@gmail.com' || auth.token.email == 'roshanisudha@gmail.com' || root.child('admins').child(auth.uid).child('isSuper').val() == true || root.child('admins').child(auth.uid).child('isSupreme').val() == true))",
    ".validate": "newData.hasChildren(['tableId','type','createdAt'])"
  }
}
```

**Why:** the previous version had `.validate: "!data.exists() && ..."`,
which is create-only — it silently blocked admin from ever marking a
request resolved. This version moves that restriction into `.write`
(gated by an admin-OR clause) and leaves `.validate` to just check shape.

**Then run:** `firebase deploy --only database`

---

## 1. Hero Banner — `Menu/css/app.css`

**Find:**
```css
.welcome-screen{ background:linear-gradient(160deg,#1a1a1a,#2a2a2a); color:#fff; justify-content:flex-end; padding:0; background-size:cover; background-position:center; }
.welcome-overlay{ background:linear-gradient(to top, rgba(0,0,0,.85) 10%, rgba(0,0,0,.3) 60%, transparent); padding:32px 24px calc(32px + var(--safe-bottom)); }
```

**Replace with:**
```css
.welcome-screen{
    background:
        radial-gradient(circle at 20% 15%, rgba(243,107,33,.35), transparent 45%),
        radial-gradient(circle at 85% 75%, rgba(243,107,33,.18), transparent 50%),
        linear-gradient(160deg,#1a1a1a,#2a2a2a);
    color:#fff; justify-content:flex-end; padding:0;
    background-size:cover; background-position:center;
    position:relative; overflow:hidden;
}
.welcome-screen.has-photo{ animation: heroPhotoFadeIn .6s ease both; }
@keyframes heroPhotoFadeIn{ from{ filter:brightness(.7) saturate(.8); } to{ filter:brightness(1) saturate(1); } }
@media (prefers-reduced-motion: reduce){ .welcome-screen.has-photo{ animation:none; } }
.welcome-overlay{ background:linear-gradient(to top, rgba(0,0,0,.88) 8%, rgba(0,0,0,.35) 55%, rgba(0,0,0,.05) 100%); padding:32px 24px calc(32px + var(--safe-bottom)); position:relative; z-index:1; }
```

**Also find** (a few lines below, same file):
```css
.welcome-table-num{font-size:38px; font-weight:900; line-height:1; margin-bottom:14px;}
```
**Replace with:**
```css
.welcome-table-num{font-size:38px; font-weight:900; line-height:1; margin-bottom:14px; text-shadow:0 2px 12px rgba(0,0,0,.4);}
```

---

## 2. Hero Banner — `Menu/js/app.js`

**Find:**
```javascript
    const bgSnap = await get(outletRef('settings/customerMenuBgImage'));
    if (bgSnap.exists()) document.getElementById('screenWelcome').style.backgroundImage = `url('${bgSnap.val()}')`;
```

**Replace with:**
```javascript
    const bgSnap = await get(outletRef('settings/customerMenuBgImage'));
    if (bgSnap.exists() && bgSnap.val()) {
        const welcomeEl = document.getElementById('screenWelcome');
        const img = new Image();
        img.onload = () => {
            welcomeEl.style.backgroundImage = `url('${bgSnap.val()}')`;
            welcomeEl.classList.add('has-photo');
        };
        img.src = bgSnap.val();
    }
```

---

## 3. Haptics — `Menu/js/ui.js`

**Find** (top of file, after `fmtMoney`):
```javascript
export function fmtMoney(n) { return '₹' + Number(n || 0).toFixed(0); }

export function showScreen(id) {
```

**Replace with:**
```javascript
export function fmtMoney(n) { return '₹' + Number(n || 0).toFixed(0); }

/**
 * Tactile feedback for touch interactions. Feature-detected — silently
 * does nothing on browsers without the Vibration API (notably iOS Safari).
 * @param {number|number[]} pattern - ms, or [on, off, on...] pattern
 */
export function haptic(pattern = 15) {
    try {
        if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (_) { /* no-op */ }
}

export function showScreen(id) {
```

---

## 4. Haptics — `Menu/js/app.js`

**Find** (top import block):
```javascript
import * as UI from './ui.js';
```

**Replace with:**
```javascript
import * as UI from './ui.js';
import { haptic } from './ui.js';
```

**Find:**
```javascript
function renderCustomizeSections() {
    const dish = M.draftDish;
    const sizes = dish.sizes && dish.sizes.length ? dish.sizes : [{ label: 'Regular', price: dish.price }];
    UI.renderSizeOptions(sizes, M.draftSize.label, (idx) => { M.draftSize = sizes[idx]; renderCustomizeSections(); updateCustomizePrice(); });
    UI.renderAddonRows(dish.addons || [], M.draftAddons, (idx) => {
        const pos = M.draftAddons.indexOf(idx);
        if (pos >= 0) M.draftAddons.splice(pos, 1); else M.draftAddons.push(idx);
        renderCustomizeSections();
        updateCustomizePrice();
    });
    updateCustomizePrice();
}
```

**Replace with:**
```javascript
function renderCustomizeSections() {
    const dish = M.draftDish;
    const sizes = dish.sizes && dish.sizes.length ? dish.sizes : [{ label: 'Regular', price: dish.price }];
    UI.renderSizeOptions(sizes, M.draftSize.label, (idx) => { haptic(12); M.draftSize = sizes[idx]; renderCustomizeSections(); updateCustomizePrice(); });
    UI.renderAddonRows(dish.addons || [], M.draftAddons, (idx) => {
        haptic(12);
        const pos = M.draftAddons.indexOf(idx);
        if (pos >= 0) M.draftAddons.splice(pos, 1); else M.draftAddons.push(idx);
        renderCustomizeSections();
        updateCustomizePrice();
    });
    updateCustomizePrice();
}
```

**Find:**
```javascript
document.getElementById('btnDraftQtyMinus')?.addEventListener('click', () => { M.draftQty = Math.max(1, M.draftQty - 1); document.getElementById('draftQtyVal').textContent = String(M.draftQty); updateCustomizePrice(); });
document.getElementById('btnDraftQtyPlus')?.addEventListener('click', () => { M.draftQty += 1; document.getElementById('draftQtyVal').textContent = String(M.draftQty); updateCustomizePrice(); });

document.getElementById('btnAddToOrder')?.addEventListener('click', () => {
    const addonNames = M.draftAddons.map(i => M.draftDish.addons[i]?.name).filter(Boolean);
```

**Replace with:**
```javascript
document.getElementById('btnDraftQtyMinus')?.addEventListener('click', () => { haptic(10); M.draftQty = Math.max(1, M.draftQty - 1); document.getElementById('draftQtyVal').textContent = String(M.draftQty); updateCustomizePrice(); });
document.getElementById('btnDraftQtyPlus')?.addEventListener('click', () => { haptic(10); M.draftQty += 1; document.getElementById('draftQtyVal').textContent = String(M.draftQty); updateCustomizePrice(); });

document.getElementById('btnAddToOrder')?.addEventListener('click', () => {
    haptic([15, 40, 15]);
    const addonNames = M.draftAddons.map(i => M.draftDish.addons[i]?.name).filter(Boolean);
```

**Find:**
```javascript
function renderCartScreen() {
    UI.renderCartList(Cart.lines, { onStep: (id, delta) => setQty(id, (Cart.lines[id]?.qty || 0) + delta) });
```

**Replace with:**
```javascript
function renderCartScreen() {
    UI.renderCartList(Cart.lines, { onStep: (id, delta) => { haptic(10); setQty(id, (Cart.lines[id]?.qty || 0) + delta); } });
```

**Find:**
```javascript
document.getElementById('btnPlaceOrder')?.addEventListener('click', async () => {
    if (cartIsEmpty()) { UI.showToast('Your cart is empty'); return; }
    const btn = document.getElementById('btnPlaceOrder');
```

**Replace with:**
```javascript
document.getElementById('btnPlaceOrder')?.addEventListener('click', async () => {
    if (cartIsEmpty()) { UI.showToast('Your cart is empty'); return; }
    haptic([20, 50, 20]);
    const btn = document.getElementById('btnPlaceOrder');
```

**Find:**
```javascript
document.querySelectorAll('[data-request]').forEach(btn => {
    btn.addEventListener('click', async () => {
        const type = btn.dataset.request;
```

**Replace with:**
```javascript
document.querySelectorAll('[data-request]').forEach(btn => {
    btn.addEventListener('click', async () => {
        haptic(15);
        const type = btn.dataset.request;
```

---

## 5. "Need Assistance" Notifications — `Admin/js/features/tables.js`

### 5a. Module state — find:
```javascript
let _tablesListener = null;
let _sessionsListener = null;
let _ordersListener = null;
let _connUnsub = null;
let _kdsTickInterval = null;

let _tables = {};      // { tableId: {...} }
let _sessions = {};    // { sessionId: {...} }
let _orders = {};      // FULL /orders map (we filter Dine-in client-side, matching "one listener" perf rule)
let _drawerTableId = null;   // table currently open in the side drawer
```

### Replace with:
```javascript
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
```

### 5b. Ref helper — find:
```javascript
function _settingsRef(sub) { return Outlet.ref(`dineinSettings${sub ? '/' + sub : ''}`); }
```

### Add right after it:
```javascript
function _reqRef(sub) { return Outlet.ref(`tableRequests${sub ? '/' + sub : ''}`); }
```

### 5c. New block — find:
```javascript
function _sessionElapsedMinutes(sess) {
    if (!sess?.openedAt) return 0;
    return Math.floor((_nowMs() - sess.openedAt) / 60000);
}
```

### Add this entire block right after it:
```javascript
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
        haptic(15);
    } catch (e) {
        showToast('Could not resolve request: ' + (e?.message || e), 'error');
    }
}
```

### 5d. Render pass — find:
```javascript
function _renderAll() {
    _renderKpis();
    _renderFloorGrid();
    _renderLiveOrdersList();
    _renderKDS();
    _renderTableDrawer();
}
```

### Replace with:
```javascript
function _renderAll() {
    _renderKpis();
    _renderFloorGrid();
    _renderLiveOrdersList();
    _renderKDS();
    _renderTableDrawer();
    _renderRequestsBanner();
}
```

### 5e. Listener + cleanup — find:
```javascript
function _attachListeners() {
    if (_tablesListener) { _tablesListener(); _tablesListener = null; }
    if (_sessionsListener) { _sessionsListener(); _sessionsListener = null; }
    if (_ordersListener) { _ordersListener(); _ordersListener = null; }

    _tablesListener = onValue(_tblRef(), (snap) => {
```

### Replace with:
```javascript
function _attachListeners() {
    if (_tablesListener) { _tablesListener(); _tablesListener = null; }
    if (_sessionsListener) { _sessionsListener(); _sessionsListener = null; }
    if (_ordersListener) { _ordersListener(); _ordersListener = null; }
    if (_requestsListener) { _requestsListener(); _requestsListener = null; }

    _tablesListener = onValue(_tblRef(), (snap) => {
```

### Find (end of the same function, the closing `}` of `_ordersListener`):
```javascript
    _ordersListener = onValue(_ordersRef(), (snap) => {
        _orders = snap.val() || {};
        _renderAll();
    });
}

export function cleanupTables() {
    if (_tablesListener) { _tablesListener(); _tablesListener = null; }
    if (_sessionsListener) { _sessionsListener(); _sessionsListener = null; }
    if (_ordersListener) { _ordersListener(); _ordersListener = null; }
    if (_connUnsub) { _connUnsub(); _connUnsub = null; }
    if (_kdsTickInterval) { clearInterval(_kdsTickInterval); _kdsTickInterval = null; }
}
```

### Replace with:
```javascript
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
}
```

### 5f. Click delegation — find:
```javascript
                case 'closeTableDrawer': _closeTableDrawer(); break;
```

### Replace with:
```javascript
                case 'closeTableDrawer': _closeTableDrawer(); break;
                case 'resolveTableRequest': _resolveTableRequest(btn.dataset.id); break;
```

---

## 6. "Need Assistance" Notifications — `Admin/index.html`

**Find** (inside `#tab-tables`, right after the closing `</div>` of `.panel-header`):
```html
            <div class="table-kpi-grid">
```

**Replace with:**
```html
            <div id="tableRequestsBanner" class="table-requests-banner hidden"></div>

            <div class="table-kpi-grid">
```

**Find** (the last KPI card, "Avg. Session Time"):
```html
                <div class="table-kpi-card">
                    <i data-lucide="clock" class="icon-20" style="color:var(--text-secondary)"></i>
                    <div><span class="table-kpi-num" id="tblKpiAvgTime">0 min</span><span class="table-kpi-label">Avg. Session Time</span></div>
                </div>
            </div>
```

**Replace with:**
```html
                <div class="table-kpi-card">
                    <i data-lucide="clock" class="icon-20" style="color:var(--text-secondary)"></i>
                    <div><span class="table-kpi-num" id="tblKpiAvgTime">0 min</span><span class="table-kpi-label">Avg. Session Time</span></div>
                </div>
                <div class="table-kpi-card" id="tblKpiRequestsCard">
                    <i data-lucide="bell-ring" class="icon-20" style="color:var(--error)"></i>
                    <div><span class="table-kpi-num" id="tblKpiRequests" style="color:var(--error)">0</span><span class="table-kpi-label">Pending Requests</span></div>
                </div>
            </div>
```

**Find** (your sidebar Tables nav item — wherever you placed it earlier):
```html
<li id="menu-tables" title="Manage Dine-In Tables, Sessions, QR Codes &amp; Kitchen Display">
    <button data-action="switchTab" data-tab="tables" class="nav-btn">
        <i data-lucide="layout-grid"></i> <span>Tables</span>
        <span id="badge-tables" class="nav-badge count hidden">0</span>
    </button>
</li>
```
**Confirm `id="badge-tables"` is present exactly like this** — it already
should be if you used the earlier package; this is just the element the
new code writes into. No change needed if it's already there.

---

## 7. "Need Assistance" Notifications — `Admin/style.css`

**Add this entire block anywhere after your existing table-management CSS:**
```css
.table-requests-banner {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
}
.table-request-chip {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 12px;
    background: rgba(239,68,68,.08);
    border: 1px solid rgba(239,68,68,.25);
    animation: requestSlideIn .25s ease;
}
.table-request-chip i { color: var(--error, #ef4444); flex-shrink: 0; }
.table-request-text { flex: 1; font-size: 13px; color: var(--text-primary, #0f172a); }
.table-request-text strong { color: var(--error, #ef4444); }
@keyframes requestSlideIn {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
    .table-request-chip { animation: none; }
}

.table-kpi-card-alert {
    border-color: rgba(239,68,68,.4) !important;
    animation: kpiAlertPulse 1.8s ease-in-out infinite;
}
@keyframes kpiAlertPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,.25); }
    50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
}
@media (prefers-reduced-motion: reduce) {
    .table-kpi-card-alert { animation: none; }
}

#badge-tables {
    background: var(--error, #ef4444);
    color: #fff;
}

.drawer-order-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0;
}
.drawer-order-actions .btn-action-green,
.drawer-order-actions .btn-action-orange,
.drawer-order-actions .btn-action-blue {
    padding: 6px 10px;
    font-size: 12px;
}
```

---

## 8. Print Bill — `Admin/js/features/tables.js`

**Find** (the closing of `_printTableKOT`):
```javascript
        <div class="foot">Roshani Pizza — Kitchen Copy</div>
        <script>window.onload=function(){window.print();};</script></body></html>`);
    w.document.close();
}

// ---------------------------------------------------------------------
// QR generation — client-side only, no external API call
// ---------------------------------------------------------------------
```

**Replace with:**
```javascript
        <div class="foot">Roshani Pizza — Kitchen Copy</div>
        <script>window.onload=function(){window.print();};</script></body></html>`);
    w.document.close();
}

function _printSessionBill(tableId) {
    const t = _tables[tableId];
    const sess = _sessionForTable(tableId);
    if (!t || !sess) { showToast('No active session to print', 'warning'); return; }

    const orders = _ordersForSession(sess.sessionId || t.currentSession);
    if (!orders.length) { showToast('No orders to bill', 'warning'); return; }

    let subtotal = 0;
    const allRows = [];
    orders.forEach(o => {
        Object.values(o.items || {}).forEach(it => {
            const lineTotal = Number(it.price || 0) * Number(it.qty || 1);
            subtotal += lineTotal;
            allRows.push(`<div class="bill-item-row"><span>${it.qty || 1} × ${_esc(it.name || 'Item')}</span><span>₹${lineTotal.toFixed(2)}</span></div>`);
        });
    });

    const tax = Number(sess.tax ?? 0) || Math.round(subtotal * 0.05 * 100) / 100;
    const grandTotal = Number(sess.grandTotal ?? (subtotal + tax));

    const w = window.open('', '_blank', 'width=400,height=620');
    w.document.write(`<html><head><title>Bill — Table ${_esc(t.number)}</title><style>
        body{font-family:'Courier New',monospace;padding:20px;width:300px;color:#111;}
        h2{text-align:center;margin-bottom:2px;font-size:18px;}
        .sub{text-align:center;font-size:11px;color:#555;margin-bottom:14px;border-bottom:1px dashed #000;padding-bottom:10px;}
        .bill-item-row{display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:4px 0;border-bottom:1px dotted #ccc;}
        .bill-totals{margin-top:10px;border-top:1px dashed #000;padding-top:8px;}
        .bill-totals-row{display:flex;justify-content:space-between;font-size:13px;padding:2px 0;}
        .bill-grand{font-size:16px;font-weight:700;border-top:1px solid #000;margin-top:6px;padding-top:6px;}
        .foot{margin-top:16px;font-size:11px;text-align:center;color:#777;}
        </style></head><body>
        <h2>ROSHANI PIZZA</h2>
        <div class="sub">TABLE ${_esc(t.number)} · ${orders.length} Order${orders.length !== 1 ? 's' : ''} · ${new Date().toLocaleString('en-IN')}</div>
        ${allRows.join('') || '<p>No items</p>'}
        <div class="bill-totals">
            <div class="bill-totals-row"><span>Subtotal</span><span>₹${subtotal.toFixed(2)}</span></div>
            <div class="bill-totals-row"><span>Tax</span><span>₹${tax.toFixed(2)}</span></div>
            <div class="bill-totals-row bill-grand"><span>TOTAL</span><span>₹${grandTotal.toFixed(2)}</span></div>
        </div>
        <div class="foot">Thank you for dining with us!</div>
        <script>window.onload=function(){window.print();};</script></body></html>`);
    w.document.close();
}

// ---------------------------------------------------------------------
// QR generation — client-side only, no external API call
// ---------------------------------------------------------------------
```

**Find** (the drawer's action button list):
```javascript
    btns.push(`<button class="btn-secondary btn-small" data-action="printTableKOT" data-id="${_esc(t.id)}"><i data-lucide="printer" class="icon-14"></i> Print KOT</button>`);
    btns.push(`<button class="btn-secondary btn-small" data-action="openTableQr" data-id="${_esc(t.id)}"><i data-lucide="qr-code" class="icon-14"></i> View QR</button>`);
```

**Replace with:**
```javascript
    btns.push(`<button class="btn-secondary btn-small" data-action="printTableKOT" data-id="${_esc(t.id)}"><i data-lucide="printer" class="icon-14"></i> Print KOT</button>`);
    btns.push(`<button class="btn-secondary btn-small" data-action="printSessionBill" data-id="${_esc(t.id)}"><i data-lucide="receipt-text" class="icon-14"></i> Print Bill</button>`);
    btns.push(`<button class="btn-secondary btn-small" data-action="openTableQr" data-id="${_esc(t.id)}"><i data-lucide="qr-code" class="icon-14"></i> View QR</button>`);
```

**Find** (click delegation):
```javascript
                case 'printTableKOT': _printTableKOT(id); break;
```

**Replace with:**
```javascript
                case 'printTableKOT': _printTableKOT(id); break;
                case 'printSessionBill': _printSessionBill(id); break;
```

---

## 9. Order Action Buttons in Drawer — `Admin/js/features/tables.js`

**Find:**
```javascript
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
        <button class="btn-text btn-small drawer-order-jump" data-action="jumpToOrderInOrdersTab" data-id="${_esc(o.id)}">
            <i data-lucide="external-link" class="icon-12"></i> Open in Orders tab
        </button>
    </div>`;
}
```

**Replace with:**
```javascript
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
```

This button writes the literal status `"Confirmed"`/`"Ready"`/`"Delivered"`/
`"Cancelled"` — matching your existing `STATUS_SEQUENCES['Dine-in']` in
`orders.js` exactly, so nothing else needs to change.

---

## ✅ Apply order

1. `database.rules.json` → deploy
2. `Menu/css/app.css`, `Menu/js/app.js`, `Menu/js/ui.js` → push
3. `Admin/js/features/tables.js`, `Admin/index.html`, `Admin/style.css` → push
4. Hard-refresh Admin, re-test Tables tab

## ⚠️ Still true from before (no code fix exists)

- Haptics don't work on iOS Safari (Apple platform limit, not a bug)
- "Need Assistance" listener only runs while the Tables tab is open
  (lazy-loaded module) — say so if you want it moved to a global listener

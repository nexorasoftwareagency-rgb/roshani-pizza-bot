# Bottom Nav + History + Promotions + Customer Data — Code & Placement Guide

Five interconnected features on the customer QR menu app, plus admin-side
social links management and customer LTV sync. Apply in order.

---

## 0. `database.rules.json` — FIX the settings path (it was wrong before)

**Find** your existing `settings` block under `$outletId`:
```json
"settings": {
  ".read": "auth != null && (root.child('admins').child(auth.uid).exists() || root.child('riders').child(auth.uid).exists())",
  ".write": "auth != null && (auth.token.email == 'nexorasoftware@gmail.com' || auth.token.email == 'roshanisudha@gmail.com' || root.child('admins').child(auth.uid).exists())",
  "storeName": {
    ".read": "true"
  },
  "customerMenuBgImage": {
    ".read": "true"
  }
}
```

**Replace with:**
```json
"settings": {
  ".read": "auth != null && (root.child('admins').child(auth.uid).exists() || root.child('riders').child(auth.uid).exists())",
  ".write": "auth != null && (auth.token.email == 'nexorasoftware@gmail.com' || auth.token.email == 'roshanisudha@gmail.com' || root.child('admins').child(auth.uid).exists())",
  "Store": {
    "storeName": {".read": "true"},
    "customerMenuBgImage": {".read": "true"},
    "instagram": {".read": "true"},
    "facebook": {".read": "true"},
    "googleReviewLink": {".read": "true"},
    "whatsappNumber": {".read": "true"}
  }
}
```

**Why:** The real data lives at `settings/Store/{field}` (confirmed against the
live Admin/js/features/settings.js save paths), not flat under `settings/`.
Also extends the rule to cover the 4 social/review fields.

**Then run:** `firebase deploy --only database`

---

## 1. Admin Settings Panel — Add Social Links Fields

### 1a. `Admin/js/features/settings.js` — Load block

**Find:**
```javascript
        document.getElementById('settingInstagram').value = s.instagram || '';
        document.getElementById('settingFacebook').value = s.facebook || '';
        document.getElementById('settingReviewUrl').value = s.reviewUrl || '';
```

**Replace with:**
```javascript
        document.getElementById('settingInstagram').value = s.instagram || '';
        document.getElementById('settingFacebook').value = s.facebook || '';
        document.getElementById('settingGoogleReviewLink').value = s.googleReviewLink || '';
        document.getElementById('settingWhatsappNumber').value = s.whatsappNumber || '';
        document.getElementById('settingReviewUrl').value = s.reviewUrl || '';
        document.getElementById('settingCustomerMenuBgImage').value = s.customerMenuBgImage || '';
```

### 1b. `Admin/js/features/settings.js` — Save block

**Find:**
```javascript
            instagram: document.getElementById('settingInstagram').value,
            facebook: document.getElementById('settingFacebook').value,
            reviewUrl: document.getElementById('settingReviewUrl').value,
```

**Replace with:**
```javascript
            instagram: document.getElementById('settingInstagram').value,
            facebook: document.getElementById('settingFacebook').value,
            googleReviewLink: document.getElementById('settingGoogleReviewLink').value,
            whatsappNumber: document.getElementById('settingWhatsappNumber').value,
            reviewUrl: document.getElementById('settingReviewUrl').value,
            customerMenuBgImage: document.getElementById('settingCustomerMenuBgImage').value,
```

### 1c. `Admin/index.html` — HTML fields in Settings tab

**Find** (the Instagram/Facebook row):
```html
                                        <div class="flex-row flex-gap-12 mb-14">

                                            <div class="flex-1">

                                                <label class="form-label-small">Instagram Handle</label>

                                                <input type="text" id="settingInstagram" class="form-input"

                                                    placeholder="e.g. @roshani_pizza">

                                            </div>

                                            <div class="flex-1">

                                                <label class="form-label-small">Facebook Page URL</label>

                                                <input type="text" id="settingFacebook" class="form-input"

                                                    placeholder="Facebook Profile Link">

                                            </div>

                                        </div>



                                        <div class="flex-row flex-gap-12">

                                            <div class="flex-1">

                                                <label class="form-label-small">Receipt Feedback URL (Base)</label>

                                                <input type="text" id="settingReviewUrl" class="form-input"

                                                    placeholder="https://yourwebsite.com/feedback">

                                                <small class="fs-10 text-muted">This URL will be used for the Receipt QR.

                                                    Order details will be appended automatically.</small>
```

**Replace with:**
```html
                                        <div class="flex-row flex-gap-12 mb-14">

                                            <div class="flex-1">

                                                <label class="form-label-small">Instagram Handle</label>

                                                <input type="text" id="settingInstagram" class="form-input"

                                                    placeholder="e.g. @roshani_pizza">

                                            </div>

                                            <div class="flex-1">

                                                <label class="form-label-small">Facebook Page URL</label>

                                                <input type="text" id="settingFacebook" class="form-input"

                                                    placeholder="Facebook Profile Link">

                                            </div>

                                        </div>

                                        <div class="flex-row flex-gap-12 mb-14">

                                            <div class="flex-1">

                                                <label class="form-label-small">Google Maps Review Link</label>

                                                <input type="text" id="settingGoogleReviewLink" class="form-input"

                                                    placeholder="https://g.page/r/.../review">

                                                <small class="fs-10 text-muted">Shown as "Rate us on Google" on the customer QR menu's Promotions page.</small>

                                            </div>

                                            <div class="flex-1">

                                                <label class="form-label-small">WhatsApp Number</label>

                                                <input type="text" id="settingWhatsappNumber" class="form-input"

                                                    placeholder="e.g. 919876543210 (with country code, no +)">

                                                <small class="fs-10 text-muted">Used to build the "Chat with us" link on the customer Promotions page.</small>

                                            </div>

                                        </div>

                                        <div class="flex-row flex-gap-12 mb-14">

                                            <div class="flex-1">

                                                <label class="form-label-small">Customer Menu Background Image (URL)</label>

                                                <input type="text" id="settingCustomerMenuBgImage" class="form-input"

                                                    placeholder="https://.../hero-photo.jpg">

                                                <small class="fs-10 text-muted">Optional. Shown as the hero banner on the QR menu's Welcome screen. Leave blank to use the default design.</small>

                                            </div>

                                        </div>



                                        <div class="flex-row flex-gap-12">

                                            <div class="flex-1">

                                                <label class="form-label-small">Receipt Feedback URL (Base)</label>

                                                <input type="text" id="settingReviewUrl" class="form-input"

                                                    placeholder="https://yourwebsite.com/feedback">

                                                <small class="fs-10 text-muted">This URL will be used for the Receipt QR.

                                                    Order details will be appended automatically.</small>
```

---

## 2. Customer App — Fix Settings Paths (from earlier hero-banner feature)

### 2a. `Menu/js/app.js` — paths must point to settings/Store/* not settings/*

**Find:**
```javascript
    const bgSnap = await get(outletRef('settings/customerMenuBgImage'));
```

**Replace with:**
```javascript
    const bgSnap = await get(outletRef('settings/Store/customerMenuBgImage'));
```

**Also find:**
```javascript
        get(outletRef('settings/storeName')),
```

**Replace with:**
```javascript
        get(outletRef('settings/Store/storeName')),
```

---

## 3. Customer App — Bottom Navigation Bar & Screen Stack

### 3a. `Menu/index.html` — Insert 2 new screens + bottom nav

**Find** (end of the file, inside the `#app` div, right before the closing tag):
```html
    </div>

    <!-- ============== INVALID TOKEN STATE ============== -->
    <div id="screenInvalid" class="screen">
        <div class="invalid-token-body">
            <svg class="icon" style="width:48px;height:48px;color:var(--error);" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            <h3>This QR code is invalid</h3>
            <p>The table link could not be verified, or this table is no longer available. Please ask a staff member for assistance.</p>
        </div>
    </div>

</div>
```

**Replace with:**
```html
    </div>

    <!-- ============== INVALID TOKEN STATE ============== -->
    <div id="screenInvalid" class="screen">
        <div class="invalid-token-body">
            <svg class="icon" style="width:48px;height:48px;color:var(--error);" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            <h3>This QR code is invalid</h3>
            <p>The table link could not be verified, or this table is no longer available. Please ask a staff member for assistance.</p>
        </div>
    </div>

    <!-- ============== SCREEN: ORDER HISTORY (this visit) ============== -->
    <div id="screenHistory" class="screen">
        <div class="topbar">
            <span class="topbar-logo" style="margin:0 auto;">Roshani</span>
        </div>
        <div style="padding:14px 16px 0; font-size:15px; font-weight:800;">Your Orders This Visit</div>
        <div id="historyListContainer" class="history-list"></div>
    </div>

    <!-- ============== SCREEN: PROMOTIONS ============== -->
    <div id="screenPromotions" class="screen">
        <div class="topbar">
            <span class="topbar-logo" style="margin:0 auto;">Roshani</span>
        </div>
        <div style="padding:14px 16px 0; font-size:15px; font-weight:800;">Stay Connected</div>
        <div style="padding:2px 16px 12px; font-size:12px; color:var(--text-sub);">Loved the food? Let others know, and stay in touch with us.</div>
        <div id="promotionsLinksContainer" class="promotions-links"></div>
    </div>

    <!-- ============== BOTTOM NAVIGATION ============== -->
    <nav id="bottomNav" class="bottom-nav hidden">
        <button class="bottom-nav-item" data-bottom-tab="screenMenu">
            <svg class="icon" viewBox="0 0 24 24"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>
            <span>Menu</span>
        </button>
        <button class="bottom-nav-item" data-bottom-tab="screenCart">
            <span class="bottom-nav-icon-wrap">
                <svg class="icon" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                <span class="bottom-nav-badge hidden" id="bottomNavCartCount">0</span>
            </span>
            <span>Cart</span>
        </button>
        <button class="bottom-nav-item" data-bottom-tab="screenTracking">
            <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span>Status</span>
        </button>
        <button class="bottom-nav-item" data-bottom-tab="screenHistory">
            <svg class="icon" viewBox="0 0 24 24"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
            <span>History</span>
        </button>
        <button class="bottom-nav-item" data-bottom-tab="screenPromotions">
            <svg class="icon" viewBox="0 0 24 24"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
            <span>Promos</span>
        </button>
    </nav>

</div>
```

### 3b. `Menu/css/app.css` — Reposition the cart bar + add bottom nav + history + promos CSS

**Find** (the menu-cart-bar rule):
```css
.menu-cart-bar{ position:fixed; bottom:0; left:0; right:0; max-width:480px; margin:0 auto; padding:0 16px calc(14px + var(--safe-bottom)); z-index:30; }
```

**Replace with:**
```css
.menu-cart-bar{ position:fixed; bottom:calc(60px + var(--safe-bottom)); left:0; right:0; max-width:480px; margin:0 auto; padding:0 16px 10px; z-index:30; }
```

**Then append this entire block at the end of the file:**
```css

/* ---------- Bottom Navigation Bar ---------- */
.bottom-nav{
    position:fixed; bottom:0; left:0; right:0; max-width:480px; margin:0 auto;
    display:flex; background:var(--card); border-top:1px solid var(--border);
    padding:6px 4px calc(6px + var(--safe-bottom)); z-index:35;
    box-shadow:0 -4px 16px rgba(0,0,0,.05);
}
.bottom-nav.hidden{ display:none; }
.bottom-nav-item{
    flex:1; display:flex; flex-direction:column; align-items:center; gap:2px;
    padding:6px 2px; color:var(--text-tertiary); font-size:10px; font-weight:700;
    border-radius:10px; transition:color .15s ease;
}
.bottom-nav-item .icon{ width:21px; height:21px; }
.bottom-nav-item.active{ color:var(--primary); }
.bottom-nav-item.active .icon{ stroke-width:2.4; }
.bottom-nav-icon-wrap{ position:relative; display:inline-flex; }
.bottom-nav-badge{
    position:absolute; top:-4px; right:-7px; background:var(--primary); color:#fff;
    font-size:9px; font-weight:800; min-width:15px; height:15px; border-radius:8px;
    display:flex; align-items:center; justify-content:center; padding:0 3px;
}

#dishListContainer{ padding-bottom:148px !important; }
.cart-summary{ padding-bottom:calc(16px + 60px + var(--safe-bottom)); }
.tracking-body{ padding-bottom:calc(24px + 60px + var(--safe-bottom)); }
.history-list, .promotions-links{ padding-bottom:calc(16px + 60px + var(--safe-bottom)); }

/* ---------- History Screen ---------- */
.history-list{ padding:14px 16px; display:flex; flex-direction:column; gap:10px; flex:1; overflow-y:auto; }
.history-order-card{ background:var(--card); border:1px solid var(--border); border-radius:14px; padding:12px 14px; }
.history-order-head{ display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
.history-order-id{ font-size:13px; font-weight:800; }
.history-order-time{ font-size:11px; color:var(--text-tertiary); }
.history-order-items{ font-size:12px; color:var(--text-sub); margin-bottom:6px; }
.history-order-foot{ display:flex; justify-content:space-between; align-items:center; padding-top:6px; border-top:1px dashed var(--border); }
.history-order-total{ font-size:14px; font-weight:800; color:var(--primary); }
.history-status-pill{ font-size:10px; font-weight:800; padding:3px 9px; border-radius:8px; text-transform:uppercase; letter-spacing:.03em; }
.history-status-placed{ background:rgba(100,116,139,.12); color:#475569; }
.history-status-confirmed, .history-status-preparing{ background:rgba(59,130,246,.12); color:#1d4ed8; }
.history-status-ready{ background:rgba(245,158,11,.12); color:#b45309; }
.history-status-delivered{ background:rgba(34,197,94,.12); color:#166534; }
.history-status-cancelled{ background:rgba(239,68,68,.12); color:#991b1b; }
.history-empty{ text-align:center; padding:60px 24px; color:var(--text-sub); font-size:13px; }

/* ---------- Promotions Screen ---------- */
.promotions-links{ padding:6px 16px; display:flex; flex-direction:column; gap:12px; flex:1; overflow-y:auto; }
.promo-link-card{
    display:flex; align-items:center; gap:14px; background:var(--card);
    border:1px solid var(--border); border-radius:16px; padding:16px;
    text-decoration:none; color:var(--text); transition:transform .12s ease;
}
.promo-link-card:active{ transform:scale(.98); }
.promo-link-icon{
    width:46px; height:46px; border-radius:14px; flex-shrink:0;
    display:flex; align-items:center; justify-content:center; color:#fff;
}
.promo-link-icon svg{ width:24px; height:24px; }
.promo-link-google{ background:#ea4335; }
.promo-link-instagram{ background:linear-gradient(135deg,#f58529,#dd2a7b,#8134af); }
.promo-link-facebook{ background:#1877f2; }
.promo-link-whatsapp{ background:#25d366; }
.promo-link-body{ flex:1; }
.promo-link-title{ font-size:14px; font-weight:800; margin-bottom:2px; }
.promo-link-sub{ font-size:11px; color:var(--text-sub); }
.promo-link-arrow{ color:var(--text-tertiary); flex-shrink:0; }
.promotions-empty{ text-align:center; padding:60px 24px; color:var(--text-sub); font-size:13px; }
```

### 3c. `Menu/js/ui.js` — Extend showScreen() + add render functions

**Find** (the showScreen function):
```javascript
export function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    window.scrollTo(0, 0);
}
```

**Replace with:**
```javascript
const BOTTOM_NAV_SCREENS = {
    screenMenu: 'screenMenu', screenCart: 'screenCart', screenTracking: 'screenTracking',
    screenHistory: 'screenHistory', screenPromotions: 'screenPromotions'
};

export function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    window.scrollTo(0, 0);

    const nav = document.getElementById('bottomNav');
    if (!nav) return;
    const isBottomNavScreen = id in BOTTOM_NAV_SCREENS;
    nav.classList.toggle('hidden', !isBottomNavScreen);
    nav.querySelectorAll('.bottom-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.bottomTab === id);
    });
}
```

**Find** (the updateCartBadges function):
```javascript
export function updateCartBadges(count) {
    ['menuCartCount', 'customizeCartCount'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = String(count);
        el.classList.toggle('hidden', count === 0);
    });
}
```

**Replace with:**
```javascript
export function updateCartBadges(count) {
    ['menuCartCount', 'customizeCartCount'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = String(count);
        el.classList.toggle('hidden', count === 0);
    });
    const bottomBadge = document.getElementById('bottomNavCartCount');
    if (bottomBadge) {
        bottomBadge.textContent = String(count);
        bottomBadge.classList.toggle('hidden', count === 0);
    }
}
```

**Then append this entire block at the end of the file:**
```javascript

const HISTORY_STATUS_LABEL = { Placed: 'Placed', Confirmed: 'Confirmed', Preparing: 'Preparing', Ready: 'Ready', Delivered: 'Delivered', Cancelled: 'Cancelled' };

export function renderHistoryList(orderIds, ordersMap) {
    const list = document.getElementById('historyListContainer');
    if (!list) return;

    if (!orderIds || orderIds.length === 0) {
        list.innerHTML = `<div class="history-empty">No orders yet this visit.<br>Head to the menu to get started!</div>`;
        return;
    }

    const rows = [...orderIds].reverse().map((oid, i) => {
        const o = ordersMap[oid];
        if (!o) return `<div class="history-order-card"><div class="history-order-items">Loading…</div></div>`;
        const itemCount = Object.keys(o.items || {}).length;
        const itemNames = Object.values(o.items || {}).slice(0, 3).map(it => `${it.qty || 1}× ${esc(it.name || 'Item')}`).join(', ');
        const statusKey = (o.status || 'Placed').toLowerCase();
        const time = o.createdAt ? new Date(o.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
        return `
        <div class="history-order-card">
            <div class="history-order-head">
                <span class="history-order-id">Order ${orderIds.length - i}</span>
                <span class="history-status-pill history-status-${statusKey}">${esc(HISTORY_STATUS_LABEL[o.status] || o.status || 'Placed')}</span>
            </div>
            <div class="history-order-items">${esc(itemNames)}${itemCount > 3 ? ` +${itemCount - 3} more` : ''}</div>
            <div class="history-order-foot">
                <span style="font-size:11px;color:var(--text-tertiary);">${esc(time)}</span>
                <span class="history-order-total">${fmtMoney(o.total || 0)}</span>
            </div>
        </div>`;
    }).join('');

    list.innerHTML = rows;
}

function buildInstagramUrl(handle) {
    if (!handle) return null;
    if (/^https?:\/\//i.test(handle)) return handle;
    return `https://instagram.com/${handle.replace(/^@/, '').trim()}`;
}
function buildWhatsappUrl(number) {
    if (!number) return null;
    const clean = String(number).replace(/[^\d]/g, '');
    if (!clean) return null;
    return `https://wa.me/${clean}?text=${encodeURIComponent('Hi! I just dined at Roshani Pizza 🍕')}`;
}

export function renderPromotionsLinks(store) {
    const wrap = document.getElementById('promotionsLinksContainer');
    if (!wrap) return;
    const s = store || {};

    const links = [
        { key: 'google', title: 'Rate us on Google', sub: 'Leave a review — it helps a lot!', url: s.googleReviewLink, cls: 'promo-link-google',
          icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5L18 21l-6-4.4L6 21l2.2-7.1L2 9.4h7.6z"/></svg>' },
        { key: 'instagram', title: 'Follow on Instagram', sub: 'See our latest dishes & offers', url: buildInstagramUrl(s.instagram), cls: 'promo-link-instagram',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>' },
        { key: 'facebook', title: 'Like us on Facebook', sub: 'Stay updated with news & events', url: s.facebook, cls: 'promo-link-facebook',
          icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 2h-3a5 5 0 0 0-5 5v3H6v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>' },
        { key: 'whatsapp', title: 'Chat on WhatsApp', sub: 'Questions or feedback? Message us', url: buildWhatsappUrl(s.whatsappNumber), cls: 'promo-link-whatsapp',
          icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 3.5A11 11 0 0 0 2.1 17.6L1 23l5.5-1.4A11 11 0 1 0 20.5 3.5zM12 20.9a9 9 0 0 1-4.6-1.3l-.3-.2-3.4.9.9-3.3-.2-.3A9 9 0 1 1 12 20.9z"/></svg>' }
    ].filter(l => l.url);

    if (links.length === 0) {
        wrap.innerHTML = `<div class="promotions-empty">No promotion links have been set up yet. Check back soon!</div>`;
        return;
    }

    wrap.innerHTML = links.map(l => `
        <a class="promo-link-card" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">
            <span class="promo-link-icon ${l.cls}">${l.icon}</span>
            <span class="promo-link-body">
                <span class="promo-link-title">${esc(l.title)}</span>
                <span class="promo-link-sub">${esc(l.sub)}</span>
            </span>
            <svg class="promo-link-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        </a>`).join('');
}
```

### 3d. `Menu/js/app.js` — Wire bottom nav, History, Promotions

**Find** (near the end, before `// Boot`):
```javascript
document.querySelectorAll('[data-request]').forEach(btn => {
    btn.addEventListener('click', async () => {
        haptic(15);
        const type = btn.dataset.request;
        const labels = { waiter: 'Waiter called', water: 'Water requested', bill: 'Bill requested', clean: 'Table cleaning requested' };
        try {
            if (type === 'bill') {
                await requestBill();
            } else {
                const { push, set } = await import('./firebase.js');
                await set(push(outletRef('tableRequests')), {
                    tableId: Session.tableId, tableNumber: Session.table.number,
                    type, status: 'pending', createdAt: Date.now()
                });
            }
            UI.showToast(labels[type] || 'Request sent');
        } catch (e) {
            UI.showToast('Could not send request. Please try again.');
        }
    });
});

// Boot
boot();
```

**Replace with:**
```javascript
document.querySelectorAll('[data-request]').forEach(btn => {
    btn.addEventListener('click', async () => {
        haptic(15);
        const type = btn.dataset.request;
        const labels = { waiter: 'Waiter called', water: 'Water requested', bill: 'Bill requested', clean: 'Table cleaning requested' };
        try {
            if (type === 'bill') {
                await requestBill();
            } else {
                const { push, set } = await import('./firebase.js');
                await set(push(outletRef('tableRequests')), {
                    tableId: Session.tableId, tableNumber: Session.table.number,
                    type, status: 'pending', createdAt: Date.now()
                });
            }
            UI.showToast(labels[type] || 'Request sent');
        } catch (e) {
            UI.showToast('Could not send request. Please try again.');
        }
    });
});

// ---------------------------------------------------------------
// BOTTOM NAVIGATION (Menu / Cart / Status / History / Promos)
// ---------------------------------------------------------------
document.querySelectorAll('#bottomNav .bottom-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        haptic(10);
        const target = btn.dataset.bottomTab;
        if (target === 'screenCart') renderCartScreen();
        if (target === 'screenTracking') renderTrackingOrEmptyState();
        if (target === 'screenHistory') renderHistoryScreen();
        if (target === 'screenPromotions') renderPromotionsScreen();
        UI.showScreen(target);
    });
});

function renderTrackingOrEmptyState() {
    if (M.currentOrderId) return;
    const hasSessionOrders = Session.session && (Session.session.orders || []).length > 0;
    if (hasSessionOrders) {
        const lastOrderId = Session.session.orders[Session.session.orders.length - 1];
        watchOrder(lastOrderId);
        return;
    }
    document.getElementById('trackingOrderId').textContent = '';
    document.getElementById('trackingTableLabel').textContent = 'No orders yet';
    document.getElementById('trackerStepsContainer').innerHTML = `<div class="history-empty">Nothing to track yet.<br>Place an order from the menu first.</div>`;
    document.getElementById('trackingThanksCard').innerHTML = '';
    document.getElementById('sessionBillCard')?.classList.add('hidden');
}

function renderHistoryScreen() {
    const orderIds = Session.session?.orders || [];
    Promise.all(orderIds.map(oid => M.ordersCache[oid]
        ? Promise.resolve()
        : new Promise(resolve => onValue(outletRef(`orders/${oid}`), (snap) => { M.ordersCache[oid] = snap.val(); resolve(); }, { onlyOnce: true }))
    )).then(() => UI.renderHistoryList(orderIds, M.ordersCache));
    UI.renderHistoryList(orderIds, M.ordersCache);
}

let _storeSettingsCache = null;
async function renderPromotionsScreen() {
    if (!_storeSettingsCache) {
        const snap = await get(outletRef('settings/Store'));
        _storeSettingsCache = snap.val() || {};
    }
    UI.renderPromotionsLinks(_storeSettingsCache);
}

// Boot
boot();
```

---

## 4. Admin Side — Customer Data LTV Sync

### 4a. `Admin/js/features/tables.js` — Add customer sync to module state

**Find** (the orders listener block):
```javascript
    _ordersListener = onValue(_ordersRef(), (snap) => {
        _orders = snap.val() || {};
        _renderAll();
    });
```

**Replace with:**
```javascript
    _ordersListener = onValue(_ordersRef(), (snap) => {
        _orders = snap.val() || {};
        _syncCustomersFromOrders(_orders);
        _renderAll();
    });
```

### 4b. `Admin/js/features/tables.js` — Add the sync functions

**Find** (right after the `_dineInOrders()` function):
```javascript
function _dineInOrders() {
    return Object.entries(_orders)
        .map(([id, o]) => ({ id, ...o }))
        .filter(o => o.type === 'Dine-in' && o.status !== 'Delivered' && o.status !== 'Cancelled')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function _sessionElapsedMinutes(sess) {
```

**Replace with:**
```javascript
function _dineInOrders() {
    return Object.entries(_orders)
        .map(([id, o]) => ({ id, ...o }))
        .filter(o => o.type === 'Dine-in' && o.status !== 'Delivered' && o.status !== 'Cancelled')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

const _customerSyncedOrderIds = new Set();

function _syncCustomersFromOrders(orders) {
    Object.entries(orders).forEach(([id, o]) => {
        if (_customerSyncedOrderIds.has(id)) return;
        if (o.type !== 'Dine-in' || o.source !== 'QR') return;
        const phone = String(o.customerPhone || '').replace(/[^\d]/g, '');
        if (phone.length < 10) return;
        _customerSyncedOrderIds.add(id);
        _syncCustomerFromOrder({ ...o, customerPhone: phone, id });
    });
}

async function _syncCustomerFromOrder(o) {
    const phone = o.customerPhone;
    const name = (o.customerName || '').trim();
    const total = Number(o.total || 0);
    const tableLabel = `QR Dine-In — Table ${o.table || ''}`.trim();
    const custRef = Outlet.ref(`customers/${phone}`);
    try {
        await runTransaction(custRef, (c) => {
            if (!c) {
                return { name, phone, orderCount: 1, totalSpent: total, lastSeen: _nowMs(), lastAddress: tableLabel };
            }
            return {
                ...c,
                name: name || c.name,
                address: c.address || 'Walk-in',
                mapsLink: c.mapsLink || '',
                promotionalConsent: c.promotionalConsent !== undefined ? c.promotionalConsent : true,
                orderCount: (c.orderCount || 0) + 1,
                totalSpent: (c.totalSpent || 0) + total,
                lastSeen: _nowMs(),
                lastAddress: tableLabel
            };
        });
    } catch (e) {
        console.warn('[Tables] Customer sync failed for order', o.id, e?.message || e);
    }
}

function _sessionElapsedMinutes(sess) {
```

---

## ✅ Apply Order (Final Checklist)

1. **database.rules.json** → fix `settings/Store/*` paths → `firebase deploy --only database`
2. **Admin/index.html** → add 3 new settings fields (Google Review, WhatsApp, Customer Menu Background Image)
3. **Admin/js/features/settings.js** → load + save the 3 new fields
4. **Menu/js/app.js** → fix the 2 broken path reads (settings/storeName → settings/Store/storeName, etc.)
5. **Menu/index.html** → insert History screen, Promotions screen, bottom nav bar
6. **Menu/css/app.css** → reposition cart bar + append all new CSS (bottom nav, history, promos)
7. **Menu/js/ui.js** → extend showScreen(), update updateCartBadges(), append History + Promotions render functions
8. **Menu/js/app.js** → append bottom nav wiring + History + Promotions + empty state logic
9. **Admin/js/features/tables.js** → add customer LTV sync functions + hook it into orders listener
10. Push all to GitHub, hard-refresh both Admin and Menu apps in browser

---

## 📋 What Customers See

- **Bottom nav** always visible (5 quick-access tabs: Menu / Cart / Status / History / Promos)
- **Status tab** shows "Nothing to track yet" on first tap (before any order placed)
- **History tab** lists every order this session, most recent first, with order number + item count + total + status badge + time
- **Promotions tab** dynamically shows 1–4 cards (Google Review, Instagram, Facebook, WhatsApp) based on what the admin configured; tapping opens the link in a new tab

---

## 👨‍💼 What Admin Controls

- In Settings, 6 fields drive everything: Instagram, Facebook, Google Review Link, WhatsApp Number, Customer Menu Background, Receipt Feedback URL
- When a QR dine-in order is placed, the customer's name + phone auto-sync into the **Customers** CRM section (same data structure as POS already uses)
- No additional "customer consent" burden — phone is already collected in order.js; this just feeds it to the admin's CRM for follow-up/repeat-customer analysis

---

## ⚠️ Still True from Before

- Haptics don't work on iOS Safari (Apple platform limit)
- "Call Waiter" notifications only fire while Tables tab is open (lazy-loaded module)
- No login/account system — "History" scope is *this session only*, not cross-visit

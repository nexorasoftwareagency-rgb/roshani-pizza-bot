/**
 * Menu/js/ui.js
 * Pure rendering helpers — no Firebase calls live here. app.js calls these
 * functions and wires their button events.
 */

export function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
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

export function updateGreeting(name) {
    const el = document.getElementById('menuGreeting');
    if (!el) return;
    if (name) {
        el.textContent = `Hello, ${esc(name)}`;
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}

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

export function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t.__hideTimer);
    t.__hideTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

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

export function updateCartBar(count, total) {
    const bar = document.getElementById('menuCartBar');
    if (!bar) return;
    bar.classList.toggle('hidden', count === 0);
    const countEl = document.getElementById('menuCartBarCount');
    const totalEl = document.getElementById('menuCartBarTotal');
    if (countEl) countEl.textContent = `${count} item${count !== 1 ? 's' : ''}`;
    if (totalEl) totalEl.textContent = fmtMoney(total);
}

export function updateRunningBillStrip(session) {
    const strip = document.getElementById('runningBillStrip');
    if (!strip) return;
    const hasOrders = session && (session.orders || []).length > 0 && session.status !== 'closed';
    strip.classList.toggle('hidden', !hasOrders);
    if (hasOrders) {
        const countEl = document.getElementById('runningBillOrderCount');
        const amountEl = document.getElementById('runningBillAmount');
        if (countEl) countEl.textContent = `${session.orders.length} order${session.orders.length !== 1 ? 's' : ''} this session`;
        if (amountEl) amountEl.textContent = fmtMoney(session.grandTotal || session.runningTotal || 0);
    }
}

const CATEGORY_ICONS = { pizza: '🍕', burger: '🍔', pasta: '🍝', beverages: '🥤', desserts: '🍰' };

export function renderCategoryPills(categories, activeId, onSelect) {
    const row = document.getElementById('categoryPillsRow');
    if (!row) return;
    const pills = [{ id: 'all', name: 'All' }, ...categories];
    row.innerHTML = pills.map(c => `
        <button class="category-pill ${activeId === c.id ? 'active' : ''}" data-cat="${esc(c.id)}">
            <span class="category-pill-icon">${CATEGORY_ICONS[c.id] || c.icon || '🍽️'}</span>
            <span class="category-pill-label">${esc(c.name)}</span>
        </button>`).join('');
    row.querySelectorAll('.category-pill').forEach(btn => btn.addEventListener('click', () => onSelect(btn.dataset.cat)));
}

export function renderDishList(dishes, { searchTerm, activeCategoryName }, onOpenDish) {
    const list = document.getElementById('dishListContainer');
    const title = document.getElementById('menuSectionTitle');
    if (!list || !title) return;

    title.textContent = searchTerm ? `Results for "${searchTerm}"` : (activeCategoryName || 'Popular Items');

    if (dishes.length === 0) {
        list.innerHTML = '<div class="empty-cart">No dishes found.</div>';
        return;
    }
    list.innerHTML = dishes.map(d => `
        <div class="dish-card" data-dish-id="${esc(d.id)}">
            <img class="dish-card-img" src="${esc(d.image || '')}" alt="${esc(d.name)}" onerror="this.style.visibility='hidden'">
            <div class="dish-card-body">
                <div class="dish-card-name">${esc(d.name)}</div>
                <div class="dish-card-price">${fmtMoney(d.price)}</div>
            </div>
            <button class="dish-card-add" data-open-dish="${esc(d.id)}" aria-label="Add ${esc(d.name)}">+</button>
        </div>`).join('');

    list.querySelectorAll('[data-open-dish]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); onOpenDish(btn.dataset.openDish); }));
    list.querySelectorAll('.dish-card').forEach(card => card.addEventListener('click', () => onOpenDish(card.dataset.dishId)));
}

export function renderSizeOptions(sizes, selectedLabel, onSelect) {
    const wrap = document.getElementById('sizeOptionsRow');
    if (!wrap) return;
    const sizeSection = document.getElementById('sizeSection');
    if (sizeSection) sizeSection.style.display = sizes.length > 1 ? '' : 'none';
    wrap.innerHTML = sizes.map((s, i) => `
        <button class="size-opt ${s.label === selectedLabel ? 'selected' : ''}" data-size-idx="${i}">
            <div class="size-opt-label">${esc(s.label)}</div>
            <div class="size-opt-price">${fmtMoney(s.price)}</div>
        </button>`).join('');
    wrap.querySelectorAll('.size-opt').forEach(btn => btn.addEventListener('click', () => onSelect(Number(btn.dataset.sizeIdx))));
}

export function renderAddonRows(addons, selectedIdxs, onToggle) {
    const wrap = document.getElementById('addonRows');
    if (!wrap) return;
    const addonSection = document.getElementById('addonSection');
    if (addonSection) addonSection.style.display = addons.length ? '' : 'none';
    wrap.innerHTML = addons.map((a, i) => {
        const checked = selectedIdxs.includes(i);
        return `<div class="addon-row" data-addon-idx="${i}">
            <div class="addon-label"><span class="addon-checkbox ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</span><span>${esc(a.name)}</span></div>
            <span class="addon-price">+${fmtMoney(a.price)}</span>
        </div>`;
    }).join('');
    wrap.querySelectorAll('.addon-row').forEach(row => row.addEventListener('click', () => onToggle(Number(row.dataset.addonIdx))));
}

export function renderCartList(lines, { onStep }) {
    const list = document.getElementById('cartListContainer');
    const summaryWrap = document.getElementById('cartSummaryWrap');
    const checkoutWrap = document.getElementById('checkoutFieldsWrap');
    if (!list) return;
    const entries = Object.entries(lines);

    if (entries.length === 0) {
        list.innerHTML = '<div class="empty-cart">Your cart is empty.<br>Add some delicious items!</div>';
        if (summaryWrap) summaryWrap.style.display = 'none';
        if (checkoutWrap) checkoutWrap.classList.add('hidden');
        return;
    }
    if (summaryWrap) summaryWrap.style.display = '';
    if (checkoutWrap) checkoutWrap.classList.remove('hidden');

    list.innerHTML = entries.map(([id, l]) => `
        <div class="cart-item-row" data-line-id="${esc(id)}">
            <img class="cart-item-img" src="${esc(l.img || '')}" alt="" onerror="this.style.visibility='hidden'">
            <div class="cart-item-info">
                <div class="cart-item-name">${esc(l.name)}</div>
                <div class="cart-item-variant">${esc(l.size)}${(l.addons || []).length ? ' · ' + esc((l.addons || []).join(', ')) : ''}</div>
            </div>
            <div class="qty-stepper"><button class="qty-btn" data-step="-1">−</button><span class="qty-val">${l.qty}</span><button class="qty-btn" data-step="1">+</button></div>
            <span class="cart-item-price">${fmtMoney(l.unitPrice * l.qty)}</span>
        </div>`).join('');

    list.querySelectorAll('.cart-item-row').forEach(row => {
        const id = row.dataset.lineId;
        row.querySelectorAll('.qty-btn').forEach(btn => btn.addEventListener('click', () => onStep(id, Number(btn.dataset.step))));
    });
}

export function updateCartTotals(subtotal, taxPercent, taxName, taxEnabled, serviceChargeEnabled, serviceChargeName, serviceChargeRate) {
    const taxRow = document.getElementById('cartTaxRow');
    const taxEnabledVal = taxEnabled !== false;
    const tax = taxEnabledVal ? Math.round(subtotal * (taxPercent / 100) * 100) / 100 : 0;
    const scEnabled = serviceChargeEnabled === true;
    const scRate = typeof serviceChargeRate === 'number' ? serviceChargeRate : 0;
    const sc = scEnabled ? Math.round(subtotal * (scRate / 100) * 100) / 100 : 0;

    const el = (id) => document.getElementById(id);
    if (el('cartSubtotal')) el('cartSubtotal').textContent = fmtMoney(subtotal);

    // Tax row
    if (taxRow) taxRow.classList.toggle('hidden', !taxEnabledVal);
    if (el('cartTaxName')) el('cartTaxName').textContent = taxName || 'Tax';
    if (el('cartTaxPct')) el('cartTaxPct').textContent = String(taxPercent);
    if (el('cartTax')) el('cartTax').textContent = fmtMoney(tax);

    // Service charge row
    const scRow = document.getElementById('cartServiceChargeRow');
    if (scRow) scRow.classList.toggle('hidden', !scEnabled);
    if (el('cartServiceChargeName')) el('cartServiceChargeName').textContent = serviceChargeName || 'Service Charge';
    if (el('cartServiceChargePct')) el('cartServiceChargePct').textContent = String(scRate);
    if (el('cartServiceCharge')) el('cartServiceCharge').textContent = fmtMoney(sc);

    if (el('cartTotal')) el('cartTotal').textContent = fmtMoney(subtotal + tax + sc);
    return { tax, serviceCharge: sc, total: subtotal + tax + sc };
}

export function updateSessionNoteInCart(session) {
    const note = document.getElementById('cartSessionNote');
    if (!note) return;
    const hasOrders = session && (session.orders || []).length > 0;
    note.classList.toggle('hidden', !hasOrders);
    if (hasOrders) note.textContent = `This will be added to your running bill (currently ${fmtMoney(session.grandTotal || session.runningTotal || 0)} across ${session.orders.length} order${session.orders.length !== 1 ? 's' : ''}).`;
}

const DINE_IN_STEPS = [
    { key: 'Placed', label: 'Order Received' },
    { key: 'Confirmed', label: 'Preparing' },
    { key: 'Ready', label: 'Ready To Serve' },
    { key: 'Delivered', label: 'Served' }
];
function dineInStepIndex(status) {
    const map = { Placed: 0, Confirmed: 1, Preparing: 1, Ready: 2, Delivered: 3 };
    return map[status] ?? 0;
}

export function renderTracking(orderId, order, tableNumber) {
    const orderIdEl = document.getElementById('trackingOrderId');
    const tableLabelEl = document.getElementById('trackingTableLabel');
    const container = document.getElementById('trackerStepsContainer');
    if (!container) return;
    if (orderIdEl) orderIdEl.textContent = `#RP-T${String(tableNumber).padStart(2, '0')}-${String(orderId).slice(-3).toUpperCase()}`;
    if (tableLabelEl) tableLabelEl.textContent = `Table ${String(tableNumber).padStart(2, '0')}`;

    const currentIdx = dineInStepIndex(order.status);
    container.innerHTML = DINE_IN_STEPS.map((step, i) => {
        const cls = i < currentIdx ? 'done' : (i === currentIdx ? 'active' : '');
        const time = i <= currentIdx ? new Date(order.updatedAt || order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
        const dotContent = i < currentIdx ? '✓' : (i + 1);
        return `<div class="tracker-step ${cls}"><div class="tracker-dot">${dotContent}</div><div><div class="tracker-label">${esc(step.label)}</div><div class="tracker-time">${time}</div></div></div>`;
    }).join('');

    // Show estimate only while order is in progress (not delivered/cancelled)
    const estimateEl = document.getElementById('trackingEstimate');
    if (estimateEl) {
        estimateEl.classList.toggle('hidden', order.status === 'Delivered' || order.status === 'Cancelled');
    }

    const thanksCard = document.getElementById('trackingThanksCard');
    if (!thanksCard) return;
    if (order.status === 'Delivered') {
        thanksCard.innerHTML = '<strong>Order served!</strong><p style="font-size:12px;color:var(--text-sub);margin-top:4px;">Enjoy your meal. Tap "Call Waiter" → "Request Bill" when ready to pay.</p>';
    } else if (order.status === 'Cancelled') {
        thanksCard.innerHTML = '<strong style="color:var(--error);">Order cancelled</strong><p style="font-size:12px;color:var(--text-sub);margin-top:4px;">Please speak to a staff member.</p>';
    } else {
        thanksCard.innerHTML = '<strong>Thank you!</strong><p style="font-size:12px;color:var(--text-sub);margin-top:4px;">We will serve your order shortly.</p>';
    }
}

export function renderSessionBillCard(session, ordersMap, taxName, taxPercent, taxEnabled, serviceChargeEnabled, serviceChargeName, serviceChargeRate) {
    const card = document.getElementById('sessionBillCard');
    if (!card) return;
    const orderIds = session?.orders || [];
    card.classList.toggle('hidden', orderIds.length <= 1);
    if (orderIds.length <= 1) return;

    const orderCountEl = document.getElementById('sessionBillOrderCount');
    if (orderCountEl) orderCountEl.textContent = `${orderIds.length} orders`;

    // Order-level summary lines
    const linesWrap = document.getElementById('sessionBillLines');
    if (linesWrap) linesWrap.innerHTML = orderIds.map((oid, i) => {
        const o = ordersMap[oid];
        const itemCount = o ? Object.values(o.items || {}).reduce((s, it) => s + (it.qty || 1), 0) : 0;
        return `<div class="session-bill-line"><span>Order ${i + 1} (${itemCount} item${itemCount !== 1 ? 's' : ''})</span><span>${fmtMoney(o?.total || 0)}</span></div>`;
    }).join('');

    // Itemized details per order
    const itemsWrap = document.getElementById('sessionBillItems');
    if (itemsWrap) itemsWrap.innerHTML = orderIds.map((oid, i) => {
        const o = ordersMap[oid];
        if (!o) return '';
        const items = Object.values(o.items || {});
        if (items.length === 0) return '';
        const itemRows = items.map(it => {
            const name = it.name || 'Item';
            const qty = it.qty || 1;
            const price = it.price || 0;
            return `<div class="session-bill-item"><span class="session-bill-item-name">${esc(name)}</span><span class="session-bill-item-qty">x${qty}</span><span class="session-bill-item-price">${fmtMoney(price * qty)}</span></div>`;
        }).join('');
        return `<div class="session-bill-order-section"><div class="session-bill-order-title">Order ${i + 1}</div>${itemRows}</div>`;
    }).join('');

    // Compute totals from session
    let subtotal = 0, totalTax = 0, totalSC = 0;
    orderIds.forEach(oid => {
        const o = ordersMap[oid];
        if (!o) return;
        subtotal += Number(o.subtotal || 0);
        totalTax += Number(o.tax || 0);
        totalSC += Number(o.serviceCharge || 0);
    });

    const tEnabled = taxEnabled !== false;
    const scEnabled = serviceChargeEnabled === true;
    const scRate = typeof serviceChargeRate === 'number' ? serviceChargeRate : 0;

    const el = (id) => document.getElementById(id);
    if (el('sessionBillSubtotal')) el('sessionBillSubtotal').textContent = fmtMoney(subtotal);

    const taxRow = document.getElementById('sessionBillTaxRow');
    if (taxRow) taxRow.classList.toggle('hidden', !tEnabled);
    if (el('sessionBillTaxLabel')) el('sessionBillTaxLabel').textContent = `${taxName || 'Tax'} (${taxPercent || 5}%)`;
    if (el('sessionBillTax')) el('sessionBillTax').textContent = fmtMoney(totalTax);

    const scRow = document.getElementById('sessionBillSCRow');
    if (scRow) scRow.classList.toggle('hidden', !scEnabled);
    if (el('sessionBillSCLabel')) el('sessionBillSCLabel').textContent = `${serviceChargeName || 'Service Charge'} (${scRate}%)`;
    if (el('sessionBillSC')) el('sessionBillSC').textContent = fmtMoney(totalSC);

    if (el('sessionBillTotal')) el('sessionBillTotal').textContent = fmtMoney(session.grandTotal || session.runningTotal || 0);
}

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

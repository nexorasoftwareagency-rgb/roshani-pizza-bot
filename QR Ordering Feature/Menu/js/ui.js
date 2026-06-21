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

export function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    window.scrollTo(0, 0);
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
        document.getElementById('runningBillOrderCount').textContent = `${session.orders.length} order${session.orders.length !== 1 ? 's' : ''} this session`;
        document.getElementById('runningBillAmount').textContent = fmtMoney(session.grandTotal || session.runningTotal || 0);
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
    document.getElementById('sizeSection').style.display = sizes.length > 1 ? '' : 'none';
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
    document.getElementById('addonSection').style.display = addons.length ? '' : 'none';
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
        summaryWrap.style.display = 'none';
        checkoutWrap.classList.add('hidden');
        return;
    }
    summaryWrap.style.display = '';
    checkoutWrap.classList.remove('hidden');

    list.innerHTML = entries.map(([id, l]) => `
        <div class="cart-item-row" data-line-id="${esc(id)}">
            <img class="cart-item-img" src="${esc(l.img || '')}" alt="" onerror="this.style.visibility='hidden'">
            <div class="cart-item-info">
                <div class="cart-item-name">${esc(l.name)}</div>
                <div class="cart-item-variant">${esc(l.size)}${l.addons.length ? ' · ' + esc(l.addons.join(', ')) : ''}</div>
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

    document.getElementById('cartSubtotal').textContent = fmtMoney(subtotal);

    // Tax row
    if (taxRow) taxRow.classList.toggle('hidden', !taxEnabledVal);
    document.getElementById('cartTaxName').textContent = taxName || 'Tax';
    document.getElementById('cartTaxPct').textContent = String(taxPercent);
    document.getElementById('cartTax').textContent = fmtMoney(tax);

    // Service charge row
    const scRow = document.getElementById('cartServiceChargeRow');
    if (scRow) scRow.classList.toggle('hidden', !scEnabled);
    document.getElementById('cartServiceChargeName').textContent = serviceChargeName || 'Service Charge';
    document.getElementById('cartServiceChargePct').textContent = String(scRate);
    document.getElementById('cartServiceCharge').textContent = fmtMoney(sc);

    document.getElementById('cartTotal').textContent = fmtMoney(subtotal + tax + sc);
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
    document.getElementById('trackingOrderId').textContent = `#RP-T${String(tableNumber).padStart(2, '0')}-${String(orderId).slice(-3).toUpperCase()}`;
    document.getElementById('trackingTableLabel').textContent = `Table ${String(tableNumber).padStart(2, '0')}`;

    const currentIdx = dineInStepIndex(order.status);
    const container = document.getElementById('trackerStepsContainer');
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

    document.getElementById('sessionBillOrderCount').textContent = `${orderIds.length} orders`;

    // Order-level summary lines
    const linesWrap = document.getElementById('sessionBillLines');
    linesWrap.innerHTML = orderIds.map((oid, i) => {
        const o = ordersMap[oid];
        const itemCount = o ? Object.values(o.items || {}).reduce((s, it) => s + (it.qty || 1), 0) : 0;
        return `<div class="session-bill-line"><span>Order ${i + 1} (${itemCount} item${itemCount !== 1 ? 's' : ''})</span><span>${fmtMoney(o?.total || 0)}</span></div>`;
    }).join('');

    // Itemized details per order
    const itemsWrap = document.getElementById('sessionBillItems');
    itemsWrap.innerHTML = orderIds.map((oid, i) => {
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

    document.getElementById('sessionBillSubtotal').textContent = fmtMoney(subtotal);

    const taxRow = document.getElementById('sessionBillTaxRow');
    if (taxRow) taxRow.classList.toggle('hidden', !tEnabled);
    document.getElementById('sessionBillTaxLabel').textContent = `${taxName || 'Tax'} (${taxPercent || 5}%)`;
    document.getElementById('sessionBillTax').textContent = fmtMoney(totalTax);

    const scRow = document.getElementById('sessionBillSCRow');
    if (scRow) scRow.classList.toggle('hidden', !scEnabled);
    document.getElementById('sessionBillSCLabel').textContent = `${serviceChargeName || 'Service Charge'} (${scRate}%)`;
    document.getElementById('sessionBillSC').textContent = fmtMoney(totalSC);

    document.getElementById('sessionBillTotal').textContent = fmtMoney(session.grandTotal || session.runningTotal || 0);
}

/**
 * Menu/js/app.js
 * Wires together firebase.js, session.js, cart.js, order.js, ui.js.
 * This is the only file with top-level event listener registration.
 */
import { outletRef, get, onValue, push, set } from './firebase.js';
import { initSession, Session, requestBill, saveCheckoutContact, cleanupSession } from './session.js';
import { Cart, addLine, setQty, clearCart, lineCount, subtotal as cartSubtotal, isEmpty as cartIsEmpty } from './cart.js';
import { placeOrder } from './order.js';
import { validateCoupon } from './discount.js';
import * as UI from './ui.js';
import { haptic } from './ui.js';

// ---------------------------------------------------------------
// Module state for menu browsing
// ---------------------------------------------------------------
const M = {
    categories: [], dishes: [],
    activeCategory: 'all',
    draftDish: null, draftSize: null, draftAddons: [], draftQty: 1,
    taxEnabled: true, taxName: 'GST', taxPercent: 5,
    serviceChargeEnabled: false, serviceChargeName: 'Service Charge', serviceChargeRate: 0,
    ordersCache: {},     // local cache of orders belonging to this session, for the bill summary
    currentOrderId: null,
    _orderUnsub: null,
    guestCount: 1,
    _guestCountDirty: false,
    _placing: false,
    appliedDiscount: null,  // { discountId, name, couponCode, amount, ... }
};

// ---------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------
async function boot() {
    const result = await initSession();
    if (!result.ok) {
        document.getElementById('loadingOverlay').style.display = 'none';
        UI.showScreen('screenInvalid');
        return;
    }

    // Register event listeners immediately after session init
    // so the first session:updated event from watchSession() is captured
    window.addEventListener('session:updated', (e) => onSessionUpdated(e.detail));
    window.addEventListener('cart:changed', onCartChanged);

    const t = Session.table;
    document.getElementById('welcomeTableNum').textContent = String(t.number).padStart(2, '0');
    document.querySelectorAll('#menuTableChip').forEach(el => el.textContent = `TABLE ${String(t.number).padStart(2, '0')}`);
    document.getElementById('cartHeaderTitle').textContent = `Your Cart (Table ${String(t.number).padStart(2, '0')})`;

    // Branding + dine-in settings (tax %, etc.)
    const [brandSnap, dineSettingsSnap] = await Promise.all([
        get(outletRef('settings/Store/storeName')),
        get(outletRef('dineinSettings'))
    ]);
    if (brandSnap.exists()) document.getElementById('welcomeBrandName').textContent = brandSnap.val();
    const dineSettings = dineSettingsSnap.val() || {};
    M.taxEnabled = dineSettings.taxEnabled !== false;
    M.taxName = dineSettings.taxName || 'GST';
    M.taxPercent = typeof dineSettings.taxRate === 'number' ? dineSettings.taxRate : 5;
    M.serviceChargeEnabled = dineSettings.serviceChargeEnabled === true;
    M.serviceChargeName = dineSettings.serviceChargeName || 'Service Charge';
    M.serviceChargeRate = typeof dineSettings.serviceChargeRate === 'number' ? dineSettings.serviceChargeRate : 0;

    // Render today's offers on welcome screen
    const offersRaw = dineSettings.offers;
    const offers = Array.isArray(offersRaw) ? offersRaw : (offersRaw ? Object.values(offersRaw) : []);
    if (offers.length > 0) {
        const offersEl = document.getElementById('welcomeOffers');
        offersEl.innerHTML = offers.slice(0, 3).map(o => `
            <div class="welcome-offer-card">
                <div class="welcome-offer-title">${UI.esc(o.title || '')}</div>
                ${o.description ? `<div class="welcome-offer-desc">${UI.esc(o.description)}</div>` : ''}
                ${o.code ? `<span class="welcome-offer-code">${UI.esc(o.code)}</span>` : ''}
            </div>`).join('');
        offersEl.classList.remove('hidden');
    }

    const bgSnap = await get(outletRef('settings/Store/customerMenuBgImage'));
    if (bgSnap.exists() && bgSnap.val()) {
        const welcomeEl = document.getElementById('screenWelcome');
        const img = new Image();
        img.onload = () => {
            welcomeEl.style.backgroundImage = `url('${bgSnap.val()}')`;
            welcomeEl.classList.add('has-photo');
        };
        img.src = bgSnap.val();
    }

    await loadMenu();

    document.getElementById('loadingOverlay').style.display = 'none';

    // If a session already exists with an active order, jump straight to
    // tracking instead of showing the welcome screen again.
    if (Session.session && (Session.session.orders || []).length > 0 && Session.session.status !== 'closed') {
        const lastOrderId = Session.session.orders[Session.session.orders.length - 1];
        watchOrder(lastOrderId);
        UI.showScreen('screenTracking');
    } else {
        UI.showScreen('screenWelcome');
    }
}

function onSessionUpdated(session) {
    UI.updateRunningBillStrip(session);
    UI.updateSessionNoteInCart(session);
    // Show greeting when customer name is known
    if (session.customerName) {
        UI.updateGreeting(session.customerName);
        // Pre-fill checkout fields from session data
        const nameInput = document.getElementById('checkoutName');
        const phoneInput = document.getElementById('checkoutPhone');
        if (nameInput && !nameInput.value) nameInput.value = session.customerName;
        if (phoneInput && !phoneInput.value) phoneInput.value = session.customerPhone || '';
    }
    // Pre-fill guest count from session (only if user hasn't manually changed it)
    if (!M._guestCountDirty && session.guestCount && session.guestCount > 0) {
        M.guestCount = session.guestCount;
        const gcEl = document.getElementById('guestCountVal');
        if (gcEl) gcEl.textContent = String(M.guestCount);
    }
    // Pre-fill special note from session
    const noteInput = document.getElementById('checkoutNote');
    if (noteInput && session.specialNote && !noteInput.value) noteInput.value = session.specialNote;
    // Keep local orders cache fresh for the bill summary
    (session.orders || []).forEach(oid => {
        if (!M.ordersCache[oid]) {
            onValue(outletRef(`orders/${oid}`), (snap) => {
                M.ordersCache[oid] = snap.val();
                UI.renderSessionBillCard(Session.session, M.ordersCache, M.taxName, M.taxPercent, M.taxEnabled, M.serviceChargeEnabled, M.serviceChargeName, M.serviceChargeRate);
            }, { onlyOnce: true });
        }
    });
    UI.renderSessionBillCard(session, M.ordersCache, M.taxName, M.taxPercent, M.taxEnabled, M.serviceChargeEnabled, M.serviceChargeName, M.serviceChargeRate);
}

function onCartChanged() {
    UI.updateCartBadges(lineCount());
    UI.updateCartBar(lineCount(), cartSubtotal());
    if (document.getElementById('screenCart')?.classList.contains('active')) renderCartScreen();
}

// ---------------------------------------------------------------
// MENU
// ---------------------------------------------------------------
async function loadMenu() {
    const [catSnap, dishSnap] = await Promise.all([get(outletRef('categories')), get(outletRef('dishes'))]);
    M.categories = Object.entries(catSnap.val() || {}).map(([id, c]) => ({ id, ...c }));
    M.dishes = Object.entries(dishSnap.val() || {}).filter(([, d]) => d.available !== false).map(([id, d]) => ({ id, ...d }));
    renderMenuScreen();
}

function renderMenuScreen(searchTerm) {
    UI.renderCategoryPills(M.categories, M.activeCategory, (catId) => { M.activeCategory = catId; renderMenuScreen(); });

    let dishes = M.dishes;
    if (M.activeCategory !== 'all') {
        const activeCat = M.categories.find(c => c.id === M.activeCategory);
        if (activeCat) dishes = dishes.filter(d => d.category === activeCat.name);
    }
    if (searchTerm) dishes = dishes.filter(d => (d.name || '').toLowerCase().includes(searchTerm.toLowerCase()));

    const activeCategoryName = M.activeCategory === 'all' ? 'Popular Items' : (M.categories.find(c => c.id === M.activeCategory)?.name || 'Items');
    UI.renderDishList(dishes, { searchTerm, activeCategoryName }, openCustomize);
}

document.getElementById('dishSearchInput')?.addEventListener('input', (e) => renderMenuScreen(e.target.value.trim()));

// ---------------------------------------------------------------
// CUSTOMIZATION
// ---------------------------------------------------------------
function _normalizeSizes(sizes, defaultPrice) {
    if (!sizes) return [{ label: 'Regular', price: defaultPrice }];
    if (Array.isArray(sizes)) return sizes;
    return Object.entries(sizes).map(([label, price]) => ({ label, price: typeof price === 'number' ? price : (price.price || defaultPrice) }));
}

function openCustomize(dishId) {
    const dish = M.dishes.find(d => d.id === dishId);
    if (!dish) return;
    M.draftDish = dish;
    const sizes = _normalizeSizes(dish.sizes, dish.price);
    M.draftSize = sizes[0];
    M.draftAddons = [];
    M.draftQty = 1;

    const heroImg = document.getElementById('customHeroImg');
    heroImg.src = dish.image || '';
    heroImg.onerror = () => { heroImg.style.display = 'none'; };
    heroImg.alt = dish.name || 'Dish image';
    document.getElementById('customDishName').textContent = dish.name;
    document.getElementById('draftQtyVal').textContent = '1';
    renderCustomizeSections();
    document.getElementById('specialInstructions').value = '';
    UI.showScreen('screenCustomize');
}

function renderCustomizeSections() {
    const dish = M.draftDish;
    const sizes = _normalizeSizes(dish.sizes, dish.price);
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

function draftUnitPrice() {
    const addonsTotal = M.draftAddons.reduce((sum, idx) => sum + (M.draftDish.addons[idx]?.price || 0), 0);
    return M.draftSize.price + addonsTotal;
}
function updateCustomizePrice() {
    const unit = draftUnitPrice();
    document.getElementById('customBasePrice').textContent = UI.fmtMoney(unit);
    document.getElementById('addToOrderLabel').textContent = `ADD TO ORDER ${UI.fmtMoney(unit * M.draftQty)}`;
}

document.getElementById('btnDraftQtyMinus')?.addEventListener('click', () => { haptic(10); M.draftQty = Math.max(1, M.draftQty - 1); document.getElementById('draftQtyVal').textContent = String(M.draftQty); updateCustomizePrice(); });
document.getElementById('btnDraftQtyPlus')?.addEventListener('click', () => { haptic(10); M.draftQty += 1; document.getElementById('draftQtyVal').textContent = String(M.draftQty); updateCustomizePrice(); });

document.getElementById('btnAddToOrder')?.addEventListener('click', () => {
    haptic([15, 40, 15]);
    const addonNames = M.draftAddons.map(i => M.draftDish.addons[i]?.name).filter(Boolean);
    addLine({
        dishId: M.draftDish.id, name: M.draftDish.name, img: M.draftDish.image,
        size: M.draftSize.label, addons: addonNames,
        instructions: document.getElementById('specialInstructions').value.trim(),
        qty: M.draftQty, unitPrice: draftUnitPrice()
    });
    UI.showToast(`${M.draftDish.name} added to cart`);
    UI.showScreen('screenMenu');
});

// ---------------------------------------------------------------
// DISCOUNT CODE
// ---------------------------------------------------------------
function _refreshDiscountInput() {
    if (M.appliedDiscount) {
        UI.showAppliedDiscount(M.appliedDiscount.name || M.appliedDiscount.couponCode, M.appliedDiscount.amount);
    } else {
        UI.resetDiscountInput();
    }
}

function _clearDiscount() {
    M.appliedDiscount = null;
    UI.resetDiscountInput();
    UI.updateCartTotals(cartSubtotal(), M.taxPercent, M.taxName, M.taxEnabled, M.serviceChargeEnabled, M.serviceChargeName, M.serviceChargeRate, null);
}

function clearDiscountIfCartChanged() {
    if (M.appliedDiscount) _clearDiscount();
}

document.getElementById('btnApplyDiscount')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnApplyDiscount');
    const input = document.getElementById('discountCodeInput');
    if (!input) return;
    haptic(10);

    // If already applied, remove
    if (M.appliedDiscount) {
        _clearDiscount();
        return;
    }

    const code = input.value.trim();
    if (!code) { UI.showDiscountMsg('Please enter a code', 'error'); return; }

    UI.setDiscountInputLoading(true);
    try {
        const result = await validateCoupon(code, cartSubtotal());
        if (!result) {
            UI.showDiscountMsg('Invalid or expired discount code', 'error');
            UI.setDiscountInputLoading(false);
            return;
        }
        M.appliedDiscount = result;
        UI.updateCartTotals(cartSubtotal(), M.taxPercent, M.taxName, M.taxEnabled, M.serviceChargeEnabled, M.serviceChargeName, M.serviceChargeRate, M.appliedDiscount);
        UI.showAppliedDiscount(result.name || result.couponCode, result.amount);
        haptic([10, 30, 10]);
    } catch (e) {
        console.error('[Discount]', e);
        UI.showDiscountMsg('Could not verify code. Try again.', 'error');
        UI.setDiscountInputLoading(false);
    }
});

// ---------------------------------------------------------------
// CART / CHECKOUT
// ---------------------------------------------------------------
function renderCartScreen() {
    UI.renderCartList(Cart.lines, { onStep: (id, delta) => { haptic(10); setQty(id, (Cart.lines[id]?.qty || 0) + delta); clearDiscountIfCartChanged(); } });
    UI.updateCartTotals(cartSubtotal(), M.taxPercent, M.taxName, M.taxEnabled, M.serviceChargeEnabled, M.serviceChargeName, M.serviceChargeRate, M.appliedDiscount);
    UI.updateSessionNoteInCart(Session.session);
    _refreshDiscountInput();
}

['btnOpenCartFromMenu', 'btnOpenCartFromCustomize', 'btnViewCartBar'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => { renderCartScreen(); UI.showScreen('screenCart'); });
});
document.getElementById('btnBackFromCart')?.addEventListener('click', () => UI.showScreen('screenMenu'));
document.getElementById('btnBackFromCustomize')?.addEventListener('click', () => UI.showScreen('screenMenu'));

// Guest count stepper
document.getElementById('btnGuestMinus')?.addEventListener('click', () => { haptic(10); M.guestCount = Math.max(1, M.guestCount - 1); M._guestCountDirty = true; document.getElementById('guestCountVal').textContent = String(M.guestCount); });
document.getElementById('btnGuestPlus')?.addEventListener('click', () => { haptic(10); M.guestCount = Math.min(20, M.guestCount + 1); M._guestCountDirty = true; document.getElementById('guestCountVal').textContent = String(M.guestCount); });

document.getElementById('btnPlaceOrder')?.addEventListener('click', async () => {
    if (M._placing) return;
    if (cartIsEmpty()) { UI.showToast('Your cart is empty'); return; }
    haptic([20, 50, 20]);
    const name = document.getElementById('checkoutName')?.value.trim();
    const phone = document.getElementById('checkoutPhone')?.value.trim();
    if (!name) { UI.showToast('Please enter your name'); document.getElementById('checkoutName')?.focus(); return; }
    if (!phone || phone.length < 10) { UI.showToast('Please enter a valid 10-digit mobile number'); document.getElementById('checkoutPhone')?.focus(); return; }
    M._placing = true;
    const btn = document.getElementById('btnPlaceOrder');
    btn.disabled = true;
    btn.textContent = 'Placing order…';

    try {
        const note = document.getElementById('checkoutNote')?.value.trim() || '';
        await saveCheckoutContact(name, phone, M.guestCount, note);

        const { orderId } = await placeOrder({ taxPercent: M.taxPercent, taxEnabled: M.taxEnabled, serviceChargeEnabled: M.serviceChargeEnabled, serviceChargeRate: M.serviceChargeRate, customerName: name, customerPhone: phone, discount: M.appliedDiscount });
        M.appliedDiscount = null;
        watchOrder(orderId);
        UI.showScreen('screenTracking');
    } catch (e) {
        console.error('[PlaceOrder]', e);
        UI.showToast('Could not place order. Please try again.');
    } finally {
        M._placing = false;
        btn.disabled = false;
        btn.textContent = 'PLACE ORDER';
    }
});

// ---------------------------------------------------------------
// ORDER TRACKING
// ---------------------------------------------------------------
function watchOrder(orderId) {
    if (M._orderUnsub) M._orderUnsub();
    M.currentOrderId = orderId;
    M._orderUnsub = onValue(outletRef(`orders/${orderId}`), (snap) => {
        const order = snap.val();
        if (!order) return;
        UI.renderTracking(orderId, order, Session.table.number);
    });
}

document.getElementById('btnMenuFromTracking')?.addEventListener('click', () => UI.showScreen('screenMenu'));
document.getElementById('btnOrderMore')?.addEventListener('click', () => UI.showScreen('screenMenu'));
document.getElementById('btnGotoCallWaiter')?.addEventListener('click', () => UI.showScreen('screenWaiter'));
document.getElementById('btnStartOrdering')?.addEventListener('click', () => UI.showScreen('screenMenu'));
document.getElementById('btnRequestBillFromTracking')?.addEventListener('click', async () => {
    haptic(20);
    try {
        await requestBill();
        // Show bill generated confirmation screen
        document.getElementById('billGenTable').textContent = `Table ${String(Session.table.number).padStart(2, '0')}`;
        document.getElementById('billGenAmount').textContent = UI.fmtMoney(Session.session?.grandTotal || Session.session?.runningTotal || 0);
        UI.showScreen('screenBillGenerated');
    } catch (e) {
        UI.showToast('Could not request bill. Please try again.');
    }
});

document.getElementById('btnBackToMenuFromBill')?.addEventListener('click', () => UI.showScreen('screenMenu'));

// ---------------------------------------------------------------
// CALL WAITER
// ---------------------------------------------------------------
document.getElementById('btnBackFromWaiter')?.addEventListener('click', () => UI.showScreen('screenTracking'));
document.querySelectorAll('[data-request]').forEach(btn => {
    btn.addEventListener('click', async () => {
        haptic(15);
        const type = btn.dataset.request;
        const labels = { waiter: 'Waiter called', water: 'Water requested', bill: 'Bill requested', clean: 'Table cleaning requested' };
        try {
            if (type === 'bill') {
                await requestBill();
                document.getElementById('billGenTable').textContent = `Table ${String(Session.table.number).padStart(2, '0')}`;
                document.getElementById('billGenAmount').textContent = UI.fmtMoney(Session.session?.grandTotal || Session.session?.runningTotal || 0);
                UI.showScreen('screenBillGenerated');
            } else {
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
    UI.renderHistoryList(orderIds, M.ordersCache);
    Promise.all(orderIds.map(oid => M.ordersCache[oid]
        ? Promise.resolve()
        : new Promise(resolve => onValue(outletRef(`orders/${oid}`), (snap) => { M.ordersCache[oid] = snap.val(); resolve(); }, { onlyOnce: true }))
    )).then(() => UI.renderHistoryList(orderIds, M.ordersCache))
      .catch(() => UI.renderHistoryList(orderIds, M.ordersCache));
}

let _storeSettingsCache = null;
async function renderPromotionsScreen() {
    if (!_storeSettingsCache) {
        const snap = await get(outletRef('settings/Store'));
        _storeSettingsCache = snap.val() || {};
    }
    UI.renderPromotionsLinks(_storeSettingsCache);
}

// Cleanup Firebase listeners on page unload
// Enter key on discount code input triggers Apply
document.getElementById('discountCodeInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btnApplyDiscount')?.click(); }
});

window.addEventListener('beforeunload', cleanupSession);
window.addEventListener('pagehide', cleanupSession);

// Boot
boot().catch(err => {
    console.error('[Boot]', err);
    document.getElementById('loadingOverlay').style.display = 'none';
    UI.showScreen('screenInvalid');
});

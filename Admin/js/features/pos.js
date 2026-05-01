/**
 * ROSHANI ERP | POS (WALK-IN) MODULE
 * Handles walk-in sales, menu selection, cart management, and receipt generation.
 */

import { state } from '../state.js';
import { db, auth, Outlet, ServerValue } from '../firebase.js';
import { standardizeOrderData, haptic, escapeHtml, playSuccessSound, logAudit } from '../utils.js';
import { ui } from '../ui.js';
import { printOrderReceipt } from './printing.js';

/**
 * Loads the menu for the Walk-in POS view
 */
export async function loadWalkinMenu() {
    const grid = document.getElementById("walkinDishGrid");
    if (!grid) return;

    try {
        grid.innerHTML = '<div class="pos-loader">Loading Menu...</div>';
        const snap = await Outlet.ref("dishes").once("value");
        console.log(`[POS] Fetched ${snap.numChildren()} dishes from ${snap.ref.toString()}`);
        state.allWalkinDishes = [];

        snap.forEach(child => {
            const dish = child.val();
            if (dish.available !== false) {
                state.allWalkinDishes.push({ id: child.key, ...dish });
            }
        });

        // Load categories if not already loaded to render tabs
        if (state.categories.length === 0) {
            const catSnap = await Outlet.ref("categories").once("value");
            state.categories = [];
            catSnap.forEach(c => {
                state.categories.push({ id: c.key, ...c.val() });
            });
        }

        renderWalkinCategoryTabs();
        applyWalkinFilters();

    } catch (e) {
        console.error("POS Load Error:", e);
        ui.showToast("Failed to load POS menu.", "error");
    }
}

/**
 * Renders category tabs for the POS view
 */
export function renderWalkinCategoryTabs() {
    const container = document.getElementById('walkinCategoryTabs');
    if (!container) return;

    container.innerHTML = `
        <div class="category-tab ${state.activeWalkinCategory === 'All' ? 'active' : ''}" data-action="filterWalkinByCategory" data-val="All">All</div>
    `;

    state.categories.forEach(cat => {
        const tab = document.createElement('div');
        tab.className = `category-tab ${state.activeWalkinCategory === cat.name ? 'active' : ''}`;
        tab.innerText = escapeHtml(cat.name);
        tab.dataset.action = "filterWalkinByCategory";
        tab.dataset.val = cat.name;
        container.appendChild(tab);
    });
}

/**
 * Filters the walk-in menu by category
 * @param {String} category - The category to filter by
 * @param {HTMLElement} el - The clicked tab element
 */
export function filterWalkinByCategory(category, el) {
    state.activeWalkinCategory = category;
    if (el) {
        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        el.classList.add('active');
    }
    applyWalkinFilters();
}

/**
 * Applies search and category filters to the menu
 */
export function applyWalkinFilters() {
    const search = document.getElementById("walkinDishSearch")?.value.toLowerCase() || "";
    const filtered = state.allWalkinDishes.filter(d => {
        const matchesSearch = d.name.toLowerCase().includes(search);
        const matchesCat = state.activeWalkinCategory === "All" || d.category === state.activeWalkinCategory;
        return matchesSearch && matchesCat;
    });

    renderWalkinDishGrid(filtered);
}

/**
 * Renders the dish grid in POS
 * @param {Array} dishes - The filtered dishes to display
 */
export function renderWalkinDishGrid(dishes) {
    const grid = document.getElementById("walkinDishGrid");
    if (!grid) return;

    if (dishes.length === 0) {
        grid.innerHTML = '<div class="empty-state">No items found matching filters.</div>';
        return;
    }

    grid.innerHTML = dishes.map(d => {
        const price = d.price || (d.sizes ? Object.values(d.sizes)[0] : 0);
        return `
            <div class="pos-dish-btn" data-action="openPOSSelectionModal" data-id="${d.id}">
                <div class="pos-dish-icon">
                    <img src="${d.image || 'assets/img/placeholder-dish.png'}" alt="${escapeHtml(d.name)}">
                </div>
                <div class="pos-dish-name">${escapeHtml(d.name)}</div>
                <div class="pos-dish-price">₹${price}</div>
            </div>
        `;
    }).join('');
}

/**
 * Selection Modal Logic
 */

export async function openPOSSelectionModal(dishId) {
    haptic(10);
    const dish = state.allWalkinDishes.find(d => d.id === dishId);
    if (!dish) return;

    state.currentPOSModalDish = dish;
    state.currentPOSModalQty = 1;
    state.currentPOSModalAddons = {};
    state.currentPOSModalSize = null;
    state.editingCartKey = null;

    const submitBtn = document.getElementById('posAddBtn');
    if (submitBtn) submitBtn.innerHTML = '&#128722; Add to Cart';

    document.getElementById('posModalDishName').innerText = dish.name;
    document.getElementById('posModalDishCategory').innerText = dish.category;
    document.getElementById('posModalQty').innerText = "1";
    document.getElementById('posSizeSection').classList.remove('hidden');

    // Render Sizes
    const sizeGrid = document.getElementById('posSizeGrid');
    sizeGrid.innerHTML = "";

    let sizes = dish.sizes || {};
    if (Object.keys(sizes).length === 0) {
        sizes = { "- Default -": dish.price || 0 };
    }

    Object.entries(sizes).forEach(([name, price], idx) => {
        const card = document.createElement('div');
        card.className = `size-card ${idx === 0 ? 'active' : ''}`;
        card.innerHTML = `
            <div class="size-chip-box">
                <span class="size-name">${escapeHtml(name)}</span>
                <span class="size-price">\u20B9${escapeHtml(price)}</span>
            </div>
        `;
        card.setAttribute('data-action', 'selectPOSSize');
        card.setAttribute('data-name', name);
        card.setAttribute('data-price', price);
        sizeGrid.appendChild(card);
        if (idx === 0) state.currentPOSModalSize = { name, price };
    });

    // Render Addons
    const addonsList = document.getElementById('posAddonsList');
    addonsList.innerHTML = "";

    const cat = state.categories.find(c => c.name === dish.category);
    if (cat && cat.addons) {
        document.getElementById('posAddonsSection').classList.remove('hidden');
        Object.entries(cat.addons).forEach(([name, price]) => {
            const item = document.createElement('div');
            item.className = "addon-check-item";
            item.innerHTML = `
                <div class="flex-row flex-center">
                    <input type="checkbox" data-action="togglePOSAddon" data-name="${escapeHtml(name)}" data-price="${escapeHtml(price)}">
                    <span class="fs-13 font-weight-600">${escapeHtml(name)}</span>
                </div>
                <span class="text-muted-small font-weight-700">+\u20B9${escapeHtml(price)}</span>
            `;
            addonsList.appendChild(item);
        });
    } else {
        document.getElementById('posAddonsSection').classList.add('hidden');
    }

    updatePOSModalTotal();
    const modal = document.getElementById('posSelectionModal');
    modal.classList.remove('hidden');
    modal.classList.add('active', 'flex');
}

export function hidePOSSelectionModal() {
    const modal = document.getElementById('posSelectionModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('active', 'flex');
    }
}

export function selectPOSSize(name, price, el) {
    document.querySelectorAll('.size-card').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    state.currentPOSModalSize = { name, price };
    updatePOSModalTotal();
}

export function togglePOSAddon(name, price, checkbox) {
    if (checkbox.checked) {
        state.currentPOSModalAddons[name] = price;
    } else {
        delete state.currentPOSModalAddons[name];
    }
    updatePOSModalTotal();
}

export function adjustPOSModalQty(delta) {
    state.currentPOSModalQty = Math.max(1, state.currentPOSModalQty + delta);
    document.getElementById('posModalQty').innerText = state.currentPOSModalQty;
    updatePOSModalTotal();
}

function updatePOSModalTotal() {
    let base = state.currentPOSModalSize ? state.currentPOSModalSize.price : 0;
    let addonsTotal = Object.values(state.currentPOSModalAddons).reduce((a, b) => a + b, 0);
    let total = (Number(base) + addonsTotal) * state.currentPOSModalQty;
    document.getElementById('posModalTotal').innerText = `\u20B9${total}`;
}

/**
 * Cart Management
 */

export function addToWalkinCartFromModal() {
    if (!state.currentPOSModalDish || !state.currentPOSModalSize) return;

    const dish = state.currentPOSModalDish;
    const sizeName = state.currentPOSModalSize.name;
    const addonNames = Object.keys(state.currentPOSModalAddons);

    // Create unique key for cart item
    const cartKey = `${dish.id}::${sizeName}::${addonNames.sort().join('|')}`;
    const pricePerItem = Number(state.currentPOSModalSize.price) + Object.values(state.currentPOSModalAddons).reduce((a, b) => a + b, 0);

    // If editing and key changed, remove old one
    if (state.editingCartKey && state.editingCartKey !== cartKey) {
        delete state.walkinCart[state.editingCartKey];
    }

    if (state.walkinCart[cartKey]) {
        // If editing the SAME key, replace qty. If adding new, increment.
        if (state.editingCartKey === cartKey) {
            state.walkinCart[cartKey].qty = state.currentPOSModalQty;
        } else {
            state.walkinCart[cartKey].qty += state.currentPOSModalQty;
        }
    } else {
        state.walkinCart[cartKey] = {
            id: dish.id,
            name: dish.name,
            category: dish.category,
            size: sizeName,
            price: pricePerItem,
            qty: state.currentPOSModalQty,
            addons: addonNames.map(name => ({ name, price: state.currentPOSModalAddons[name] }))
        };
    }

    state.editingCartKey = null;
    hidePOSSelectionModal();
    renderWalkinCart();
    haptic(20);
}

export function removeFromWalkinCart(cartKey) {
    delete state.walkinCart[cartKey];
    renderWalkinCart();
}

export function walkinQtyChange(cartKey, delta) {
    if (state.walkinCart[cartKey]) {
        state.walkinCart[cartKey].qty = Math.max(1, state.walkinCart[cartKey].qty + delta);
        renderWalkinCart();
    }
}

export function clearWalkinCart() {
    state.walkinCart = {};
    state.walkinDiscount = 0;
    state.walkinDiscountPct = 0;
    if (document.getElementById('walkinCustPhone')) document.getElementById('walkinCustPhone').value = "";
    if (document.getElementById('walkinCustName')) document.getElementById('walkinCustName').value = "";
    if (document.getElementById('walkinCustNote')) document.getElementById('walkinCustNote').value = "";
    renderWalkinCart();
}

export function renderWalkinCart() {
    const list = document.getElementById("walkinCartItems");
    if (!list) return;

    const items = Object.entries(state.walkinCart);
    if (items.length === 0) {
        list.innerHTML = `
            <p id="walkinEmptyMsg" class="text-muted fs-13 center-text p-32">Tap dishes to add them here</p>
        `;
        document.getElementById("walkinSubtotal").innerText = "\u20B90";
        document.getElementById("walkinTotal").innerText = "\u20B90";
        updateMobileCartSummaryState(0, 0);
        return;
    }

    let subtotal = 0;
    list.innerHTML = items.map(([key, item]) => {
        const itemTotal = item.price * item.qty;
        subtotal += itemTotal;
        const addonText = item.addons && item.addons.length > 0 ? `<div class="cart-item-addons">+ ${item.addons.map(a => a.name).join(', ')}</div>` : '';
        
        return `
            <div class="cart-item">
                <div class="cart-item-main">
                    <div class="cart-item-details">
                        <div class="cart-item-name">${escapeHtml(item.name)} <span class="cart-item-size">(${escapeHtml(item.size)})</span></div>
                        ${addonText}
                        <div class="cart-item-price">\u20B9${item.price} x ${item.qty} = \u20B9${itemTotal}</div>
                    </div>
                    <div class="cart-item-actions">
                        <div class="qty-control">
                            <button data-action="walkinQtyChange" data-id="${key}" data-val="-1">-</button>
                            <span>${item.qty}</span>
                            <button data-action="walkinQtyChange" data-id="${key}" data-val="1">+</button>
                        </div>
                        <button class="btn-remove" data-action="walkinRemoveItem" data-id="${key}">\uD83D\uDDD1\uFE0F</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    let discountValue = state.walkinDiscount;
    if (state.walkinDiscountPct > 0) {
        discountValue = (subtotal * state.walkinDiscountPct) / 100;
    }

    const finalTotal = Math.max(0, subtotal - discountValue);

    document.getElementById("walkinSubtotal").innerText = `₹${subtotal.toLocaleString()}`;
    document.getElementById("walkinTotal").innerText = `₹${finalTotal.toLocaleString()}`;

    // Calculate total qty for mobile summary
    const totalQty = Object.values(state.walkinCart).reduce((sum, item) => sum + item.qty, 0);
    updateMobileCartSummaryState(totalQty, finalTotal);
}

/**
 * Syncs mobile cart summary visibility and values
 */
export function updateMobileCartSummaryState(count, total) {
    const summary = document.getElementById('mobileCartSummary');
    if (!summary) return;

    if (count > 0) {
        summary.classList.remove('hidden');
        const countElem = document.getElementById('mobileCartCount');
        const totalElem = document.getElementById('mobileCartTotal');
        if (countElem) countElem.innerText = `${count} Items`;
        if (totalElem) totalElem.innerText = `₹${total.toLocaleString()}`;
    } else {
        summary.classList.add('hidden');
    }
}


/**
 * Customer & Discount Logic
 */

export async function checkWalkinCustomer() {
    const phone = document.getElementById("walkinCustPhone").value.trim();
    if (phone.length < 10) return;

    try {
        const snap = await db.ref(`customers/${phone}`).once("value");
        const nameInput = document.getElementById("walkinCustName");
        
        if (snap.exists()) {
            const c = snap.val();
            nameInput.value = c.name || "";
            showToast(`Welcome back, ${c.name || 'Customer'}!`, "success");
        }
    } catch (e) { console.error(e); }
}

export function setDiscount(amt) {
    state.walkinDiscount = amt;
    state.walkinDiscountPct = 0;
    renderWalkinCart();
}

export function setDiscountPct(pct) {
    state.walkinDiscountPct = pct;
    state.walkinDiscount = 0;
    renderWalkinCart();
}

export function selectWalkinPayment(method, el) {
    state.walkinPayMethod = method;
    document.querySelectorAll('.walkin-pay-btn').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
}

/**
 * Sale Submission
 */

export async function submitWalkinSale() {
    const items = Object.values(state.walkinCart);
    if (items.length === 0) {
        ui.showToast("Cart is empty!", "error");
        return;
    }

    const phone = document.getElementById("walkinCustPhone").value.trim();
    const name = document.getElementById("walkinCustName").value.trim() || "Guest";
    const note = document.getElementById("walkinCustNote").value.trim() || "";
    const btn = document.getElementById('walkinSubmitBtn');
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Processing...';
    }

    try {
        // --- PHASE 3.22: PRICE VALIDATION ---
        const [dishesSnap, categoriesSnap] = await Promise.all([
            Outlet.ref("dishes").once("value"),
            Outlet.ref("categories").once("value")
        ]);
        
        const freshDishes = dishesSnap.val() || {};
        const freshCategories = categoriesSnap.val() || {};
        
        let validatedSubtotal = 0;
        for (const item of items) {
            const dish = freshDishes[item.id];
            if (!dish) throw new Error(`Item '${item.name}' is no longer available.`);

            // Validate Base Price
            let basePrice = 0;
            if (dish.sizes && dish.sizes[item.size]) {
                basePrice = Number(dish.sizes[item.size]);
            } else if (item.size === "- Default -" || !dish.sizes) {
                basePrice = Number(dish.price || 0);
            } else {
                throw new Error(`Size '${item.size}' for '${item.name}' not found.`);
            }

            // Validate Addons
            let addonsPrice = 0;
            if (item.addons && item.addons.length > 0) {
                const cat = Object.values(freshCategories).find(c => c.name === dish.category);
                if (cat && cat.addons) {
                    for (const addon of item.addons) {
                        if (cat.addons[addon.name] !== undefined) {
                            addonsPrice += Number(cat.addons[addon.name]);
                        } else {
                            throw new Error(`Addon '${addon.name}' is invalid for ${dish.category}.`);
                        }
                    }
                }
            }

            const expectedPrice = basePrice + addonsPrice;
            if (Math.abs(item.price - expectedPrice) > 0.01) {
                console.warn(`Price manipulation detected for ${item.name}. Correcting...`);
                item.price = expectedPrice;
            }
            validatedSubtotal += (item.price * item.qty);
        }

        const subtotal = validatedSubtotal;
        let discountValue = state.walkinDiscount;
        if (state.walkinDiscountPct > 0) {
            discountValue = (subtotal * state.walkinDiscountPct) / 100;
        }
        const total = Math.max(0, subtotal - discountValue);

        const orderId = "W" + Date.now().toString().slice(-6);
        const orderData = {
            orderId,
            items,
            subtotal,
            discount: discountValue,
            total,
            paymentMethod: state.walkinPayMethod || "Cash",
            customerName: name,
            phone: phone || "Walk-in",
            customerNote: note,
            status: "Confirmed",
            type: "Dine-in",
            timestamp: ServerValue.TIMESTAMP,
            createdAt: new Date().toISOString(),
            outlet: Outlet.current,
            createdBy: auth.currentUser ? auth.currentUser.email : 'admin'
        };

        // 1. Save Order
        await Outlet.ref(`orders/${orderId}`).set(orderData);

        // 2. Update Customer LTV if phone provided
        if (phone && phone.length >= 10) {
            const custRef = db.ref(`customers/${phone}`);
            await custRef.transaction(c => {
                if (!c) return { name, phone, orderCount: 1, totalSpent: total, lastSeen: Date.now(), lastAddress: 'Walk-in' };
                return {
                    ...c,
                    name: name || c.name,
                    orderCount: (c.orderCount || 0) + 1,
                    totalSpent: (c.totalSpent || 0) + total,
                    lastSeen: Date.now(),
                    lastAddress: 'Walk-in'
                };
            });
        }

        playSuccessSound();
        ui.showToast(`Sale #${orderId} completed!`, "success");
        logAudit("Sales", `POS Sale Recorded: #${orderId}`, `Total: ₹${total}`);

        // 3. Print Receipt
        printOrderReceipt(orderData);

        // 4. Reset
        clearWalkinCart();

    } catch (e) {
        console.error("Sale Error:", e);
        ui.showToast("Failed to process sale: " + e.message, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '\u2705 Record Sale';
        }
    }
}

/**
 * Mobile UI Helpers
 */


export async function openCartAddonPicker(cartKey) {
    const item = state.walkinCart[cartKey];
    if (!item) return;

    // Fetch full dish data for addons
    const snap = await Outlet.ref(`dishes/${item.id}`).once('value');
    const dish = snap.val();
    if (!dish) return;

    state.currentPOSModalDish = { id: item.id, ...dish };
    state.currentPOSModalQty = item.qty;
    state.currentPOSModalSize = { 
        name: item.size, 
        price: item.price - (item.addons ? item.addons.reduce((a, b) => a + b.price, 0) : 0) 
    };
    state.currentPOSModalAddons = {};
    if (item.addons) {
        item.addons.forEach(a => state.currentPOSModalAddons[a.name] = a.price);
    }

    // Refresh Modal UI
    document.getElementById('posModalDishName').innerText = dish.name + " (Addons)";
    document.getElementById('posModalDishCategory').innerText = dish.category;
    document.getElementById('posModalQty').innerText = state.currentPOSModalQty;

    document.getElementById('posSizeSection').classList.add('hidden');

    const addonsList = document.getElementById('posAddonsList');
    addonsList.innerHTML = "";
    const cat = state.categories.find(c => c.name === dish.category);
    if (cat && cat.addons) {
        document.getElementById('posAddonsSection').classList.remove('hidden');
        Object.entries(cat.addons).forEach(([name, price]) => {
            const isChecked = state.currentPOSModalAddons[name] !== undefined;
            const itemDiv = document.createElement('div');
            itemDiv.className = "addon-check-item";
            itemDiv.innerHTML = `
                <div class="flex-row flex-center">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} data-action="togglePOSAddon" data-name="${escapeHtml(name)}" data-price="${escapeHtml(price)}">
                    <span class="fs-13 font-weight-600">${escapeHtml(name)}</span>
                </div>
                <span class="text-muted-small font-weight-700">+\u20B9${escapeHtml(price)}</span>
            `;
            addonsList.appendChild(itemDiv);
        });
    }

    state.editingCartKey = cartKey;

    const submitBtn = document.getElementById('posAddBtn');
    if (submitBtn) submitBtn.innerText = "\uD83D\uDCBE Update Item";

    updatePOSModalTotal();
    const modal = document.getElementById('posSelectionModal');
    modal.classList.remove('hidden');
    modal.classList.add('active', 'flex');
}

// No window re-exposures here. All functions are exported or available via standard module imports.

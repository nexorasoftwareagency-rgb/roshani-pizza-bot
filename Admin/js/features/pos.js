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
        const price = d.price ?? (d.sizes ? Object.values(d.sizes)[0] : 0);
        return `
            <div class="pos-dish-btn-v4" data-action="openPOSSelectionModal" data-id="${d.id}">
                <div class="dish-visual">
                    <img src="${escapeHtml(d.image || 'assets/img/placeholder-dish.png')}" alt="${escapeHtml(d.name)}" loading="lazy">
                    <div class="dish-overlay">
                        <span class="price-chip">₹${price}</span>
                    </div>
                </div>
                <div class="dish-content">
                    <div class="dish-name">${escapeHtml(d.name)}</div>
                    <div class="dish-category">${escapeHtml(d.category || '')}</div>
                </div>
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
    if (submitBtn) {
        submitBtn.innerHTML = '<i data-lucide="shopping-cart" class="icon-18"></i> <span>Add to Cart</span>';
    }

    document.getElementById('posModalDishName').innerText = dish.name;
    document.getElementById('posModalDishCategory').innerText = dish.category;
    document.getElementById('posModalQty').innerText = "1";
    document.getElementById('posSizeSection').classList.remove('hidden');

    // 2. Populate Sizes
    const sizeGrid = document.getElementById('posSizeGrid');
    sizeGrid.innerHTML = '';
    
    let sizes = dish.sizes || {};
    if (Object.keys(sizes).length === 0) {
        sizes = { "- Default -": dish.price || 0 };
    }

    Object.entries(sizes).forEach(([name, price], idx) => {
        const isDefault = idx === 0;
        if (isDefault) {
            state.currentPOSModalSize = { name, price: Number(price) };
        }

        const card = document.createElement('div');
        card.className = `size-card ${isDefault ? 'active' : ''}`;
        card.setAttribute('data-action', 'selectPOSSize');
        card.setAttribute('data-name', name);
        card.setAttribute('data-price', price);
        card.innerHTML = `
            <span class="size-name">${name}</span>
            <span class="size-price">₹${Number(price).toLocaleString()}</span>
        `;
        sizeGrid.appendChild(card);
    });

    // 3. Populate Addons
    const addonsList = document.getElementById('posAddonsList');
    addonsList.innerHTML = '';
    
    const cat = state.categories.find(c => c.name === dish.category);
    if (cat && cat.addons) {
        document.getElementById('posAddonsSection').classList.remove('hidden');
        Object.entries(cat.addons).forEach(([name, price]) => {
            const item = document.createElement('div');
            item.className = 'addon-check-item';
            item.setAttribute('data-action', 'togglePOSAddon');
            item.setAttribute('data-name', name);
            item.setAttribute('data-price', price);
            item.innerHTML = `
                <div class="flex-row flex-center flex-gap-10">
                    <div class="custom-checkbox"></div>
                    <span class="addon-name">${name}</span>
                </div>
                <span class="addon-price">+₹${Number(price).toLocaleString()}</span>
            `;
            addonsList.appendChild(item);
        });
    } else {
        document.getElementById('posAddonsSection').classList.add('hidden');
    }

    console.log(`[POS] Opening selection modal for: ${dish.name}`);
    updatePOSModalTotal();
    const modal = document.getElementById('posSelectionModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('active', 'side-panel-active');
        document.body.classList.add('pos-selection-mode');
        
        // Ensure all icons (including ones in headers and the button) are rendered
        if (window.lucide) window.lucide.createIcons({ root: modal });
    } else {
        console.error("[POS] Modal element #posSelectionModal not found!");
    }
}

export function hidePOSSelectionModal() {
    const modal = document.getElementById('posSelectionModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('active', 'side-panel-active');
        document.body.classList.remove('pos-selection-mode');
    }
}

export function selectPOSSize(name, price, el) {
    console.log(`[POS] Selecting Size: ${name} (Price: ${price})`);
    document.querySelectorAll('.size-card').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    state.currentPOSModalSize = { name, price };
    updatePOSModalTotal();
}

export function togglePOSAddon(name, price, el) {
    const isSelected = el.classList.contains('active');
    if (!isSelected) {
        state.currentPOSModalAddons[name] = Number(price);
        el.classList.add('active');
        el.querySelector('.custom-checkbox').classList.add('checked');
    } else {
        delete state.currentPOSModalAddons[name];
        el.classList.remove('active');
        el.querySelector('.custom-checkbox').classList.remove('checked');
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
    try {
        haptic(5);
        const dish = state.currentPOSModalDish;
        console.log("[POS] addToWalkinCartFromModal triggered for:", dish ? dish.name : "NULL");
        if (!dish) {
            console.error("[POS] No dish selected in modal context.");
            ui.showToast("No item selected", "error");
            return;
        }
        if (!state.currentPOSModalSize) {
            ui.showToast("Please select a size", "warning");
            return;
        }

        const size = state.currentPOSModalSize;
        const qty = state.currentPOSModalQty;
        const addonNames = Object.keys(state.currentPOSModalAddons);

        // Create unique key for cart item
        const cartKey = `${dish.id}::${size.name}::${addonNames.sort().join('|')}`;
        const pricePerItem = Number(size.price) + Object.values(state.currentPOSModalAddons).reduce((a, b) => a + b, 0);

        // If editing and key changed, remove old one
        if (state.editingCartKey && state.editingCartKey !== cartKey) {
            delete state.walkinCart[state.editingCartKey];
        }

        if (state.walkinCart[cartKey]) {
            if (state.editingCartKey === cartKey) {
                state.walkinCart[cartKey].qty = qty;
            } else {
                state.walkinCart[cartKey].qty += qty;
            }
        } else {
            state.walkinCart[cartKey] = {
                id: dish.id,
                name: dish.name,
                category: dish.category,
                size: size.name,
                price: pricePerItem,
                qty: qty,
                addons: addonNames.map(name => ({ name, price: state.currentPOSModalAddons[name] }))
            };
        }

        state.editingCartKey = null;
        hidePOSSelectionModal();
        renderWalkinCart();
        haptic(20);
        playSuccessSound();
        console.log(`[POS] Cart updated. ${qty}x ${dish.name} added/updated.`);
        ui.showToast(`Added ${qty}x ${dish.name} (${size.name})`, "success");
        console.log("[POS] Cart updated successfully.");
    } catch (error) {
        console.error("[POS] Add to Cart Error:", error);
        ui.showToast("Failed to add to cart", "error");
    }
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
    if (document.getElementById('walkinTableNo')) document.getElementById('walkinTableNo').value = "";
    if (document.getElementById('walkinCustNote')) document.getElementById('walkinCustNote').value = "";
    if (document.getElementById('walkinDiscountRow')) document.getElementById('walkinDiscountRow').classList.add('hidden');
    if (document.getElementById('walkinDiscountVal')) document.getElementById('walkinDiscountVal').innerText = "-₹0";
    if (document.getElementById('walkinDiscount')) document.getElementById('walkinDiscount').value = "0";
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
        const addonText = item.addons && item.addons.length > 0 ? `<div class="cart-item-addons-v4 mt-4">${item.addons.map(a => `<span class="addon-tag">+ ${a.name}</span>`).join('')}</div>` : '';
        
        return `
            <div class="premium-row-v4 p-12 mb-8 br-16 bg-white shadow-sm border-ghost">
                <div class="flex-between flex-center">
                    <div class="identity-info-v4 flex-1">
                        <span class="name font-700 fs-14">${escapeHtml(item.name)} <span class="text-muted font-normal fs-11">(${escapeHtml(item.size)})</span></span>
                        ${addonText}
                        <div class="fs-12 color-primary font-700 mt-4">₹${item.price.toLocaleString()} <span class="text-muted font-normal">per item</span></div>
                    </div>
                    <div class="identity-info-v4 text-right ml-10">
                        <div class="qty-control-v4 mb-4">
                            <button class="qty-btn" data-action="walkinQtyChange" data-id="${key}" data-val="-1">
                                <i data-lucide="minus"></i>
                            </button>
                            <span class="qty-val">${item.qty}</span>
                            <button class="qty-btn" data-action="walkinQtyChange" data-id="${key}" data-val="1">
                                <i data-lucide="plus"></i>
                            </button>
                        </div>
                        <div class="font-800 fs-15 color-dark">₹${itemTotal.toLocaleString()}</div>
                    </div>
                </div>
                <div class="flex-row mt-8 border-t-ghost pt-8">
                   <button class="btn-remove-v4 flex-center flex-gap-6 fs-11" data-action="walkinRemoveItem" data-id="${key}">
                       <i data-lucide="trash-2" style="width:12px;"></i> Remove
                   </button>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons({ root: list });

    let discountValue = state.walkinDiscount;
    if (state.walkinDiscountPct > 0) {
        discountValue = (subtotal * state.walkinDiscountPct) / 100;
    }

    const finalTotal = Math.max(0, subtotal - discountValue);

    document.getElementById("walkinSubtotal").innerText = `₹${subtotal.toLocaleString()}`;
    
    const discRow = document.getElementById("walkinDiscountRow");
    const discVal = document.getElementById("walkinDiscountVal");
    if (discountValue > 0) {
        if (discRow) discRow.classList.remove('hidden');
        if (discVal) discVal.innerText = `-₹${discountValue.toLocaleString()}`;
    } else {
        if (discRow) discRow.classList.add('hidden');
    }

    document.getElementById("walkinTotal").innerText = `₹${finalTotal.toLocaleString()}`;

    // Ensure manual discount input updates correctly
    const discountInput = document.getElementById('walkinDiscount');
    if (discountInput) {
        if (!discountInput.dataset.listener) {
            discountInput.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value) || 0;
                state.walkinDiscount = val;
                state.walkinDiscountPct = 0;
                // Re-calculate totals
                renderWalkinCart();
            });
            discountInput.dataset.listener = "true";
        }
        // Update input value to reflect state (e.g. if preset was used)
        if (state.walkinDiscountPct === 0) {
            discountInput.value = state.walkinDiscount;
        } else {
            discountInput.value = 0; // Clear manual if percentage is active
        }
    }

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
        summary.setAttribute('data-action', 'toggleMobileCart');
        summary.removeAttribute('data-tab'); // Use action instead of tab switch if items present

        const countElem = document.getElementById('mobileCartCount');
        const totalElem = document.getElementById('mobileCartTotal');
        if (countElem) countElem.innerText = `${count} Items`;
        if (totalElem) totalElem.innerText = `₹${total.toLocaleString()}`;
    } else {
        summary.classList.add('hidden');
        summary.setAttribute('data-tab', 'walkin');
        summary.removeAttribute('data-action');
    }
}

/**
 * Toggles the full-screen cart sheet on mobile
 */
export function toggleMobileCart() {
    const cart = document.querySelector('.walkin-cart');
    if (!cart) return;
    
    haptic(10);
    cart.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/**
 * Customer & Discount Logic
 */

export async function checkWalkinCustomer() {
    const phone = document.getElementById("walkinCustPhone").value.trim();
    if (phone.length < 10) return;

    try {
        const snap = await Outlet.ref(`customers/${phone}`).once("value");
        const nameInput = document.getElementById("walkinCustName");
        
        if (snap.exists()) {
            const c = snap.val();
            nameInput.value = c.name || "";
            ui.showToast(`Welcome back, ${c.name || 'Customer'}!`, "success");
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
    const tableNo = document.getElementById("walkinTableNo")?.value.trim() || "";
    const note = document.getElementById("walkinCustNote").value.trim() || "";
    const combinedNote = tableNo ? `[Table: ${tableNo}] ${note}` : note;
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

        const today = new Date();
        const dateStr = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
        
        // Get sequence from database
        const seqSnap = await db.ref(`pizza/metadata/orderSequence/${dateStr}`).transaction((current) => (current || 0) + 1);
        const seqNum = seqSnap.snapshot.val() || 1;
        const orderId = `${dateStr}-${seqNum.toString().padStart(4, '0')}`;

        const orderData = {
            orderId,
            items,
            subtotal,
            discount: discountValue,
            total,
            paymentMethod: state.walkinPayMethod || "Cash",
            customerName: name,
            phone: phone || "Walk-in",
            customerNote: combinedNote,
            tableNo: tableNo,
            status: "Confirmed",
            type: "Dine-in",
            timestamp: ServerValue.TIMESTAMP,
            createdAt: new Date().toISOString(),
            outlet: Outlet.current,
            assignedRider: "", 
            createdBy: auth.currentUser ? auth.currentUser.email : 'admin'
        };

        // 1. Save Order
        await Outlet.ref(`orders/${orderId}`).set(orderData);

        // 2. Update Customer LTV if phone provided
        if (phone && phone.length >= 10) {
            const custRef = Outlet.ref(`customers/${phone}`);
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
            const item = document.createElement('div');
            item.className = `addon-check-item ${isChecked ? 'active' : ''}`;
            item.setAttribute('data-action', 'togglePOSAddon');
            item.setAttribute('data-name', name);
            item.setAttribute('data-price', price);
            item.innerHTML = `
                <div class="flex-row flex-center flex-gap-10">
                    <div class="custom-checkbox ${isChecked ? 'checked' : ''}"></div>
                    <span class="addon-name">${name}</span>
                </div>
                <span class="addon-price">+₹${Number(price).toLocaleString()}</span>
            `;
            addonsList.appendChild(item);
        });
    } else {
        document.getElementById('posAddonsSection').classList.add('hidden');
    }

    state.editingCartKey = cartKey;

    const submitBtn = document.getElementById('posAddBtn');
    if (submitBtn) {
        submitBtn.innerHTML = '<i data-lucide="save" class="icon-18"></i> <span>Update Item</span>';
    }

    updatePOSModalTotal();
    const modal = document.getElementById('posSelectionModal');
    modal.classList.remove('hidden');
    modal.classList.add('active', 'side-panel-active');
}

// No window re-exposures here. All functions are exported or available via standard module imports.

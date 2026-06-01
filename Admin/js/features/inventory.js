import { db, auth, Outlet, serverTimestamp, get, set, update, remove, push, onValue, runTransaction } from '../firebase.js';
import { state } from '../state.js';
import { showDeleteConfirm, showConfirm } from '../ui-utils.js';
import { logAudit, showToast, initPagination, escapeHtml, getSkeletonRows } from '../utils.js';
import { pushLog, maybeNotifyLowStock, clearLowStockNotify } from './inventory-extras.js';
import { t, localize } from '../l10n.js';

let inventoryListener = null;
const INV_PAGE_SIZE = 30;
const MENU_PAGE_SIZE = 20;
let _invPage = 1;
let _invSearch = '';
let _invAllRows = [];
let _menuPage = 1;
let _menuAllRows = [];

export function initInventory() {
    console.log("[Inventory] Initializing Simplified Module...");
    
    // UI Event Listeners
    const btnShowAdd = document.getElementById('btnShowAddInventory');
    const btnSave = document.getElementById('btnSaveInventory');
    const modal = document.getElementById('inventoryModal');
    const closeBtn = modal?.querySelector('.close-btn');

    if (btnShowAdd) {
        btnShowAdd.onclick = () => {
            resetInvModal();
            modal.classList.add('active');
        };
    }

    if (closeBtn) {
        closeBtn.onclick = () => modal.classList.remove('active');
    }

    if (btnSave) {
        btnSave.onclick = saveInventoryItem;
    }

    // Localize [data-i18n] elements in the inventory tab
    localize(document.getElementById('tab-inventory'));

    // Initialize inventory feature toggles
    initInventoryToggles();
    attachInventoryShortcuts();
}

export function loadInventory() {
    if (!state.currentOutlet) return;
    cleanupInventory();

    // Show skeleton while data loads
    const tbody = document.getElementById('inventoryTableBody');
    if (tbody) tbody.innerHTML = getSkeletonRows(5, 4);
    
    const invRef = Outlet.ref('inventory');
    inventoryListener = onValue(invRef, (snapshot) => {
        const data = snapshot.val();
        renderInventoryTable(data);
        updateInventoryKPIs(data);
    }, (error) => {
        console.error("[Inventory] Load Error:", error);
        showToast("Failed to load inventory", "error");
    });
}

export function cleanupInventory() {
    if (inventoryListener) {
        inventoryListener();
        inventoryListener = null;
    }
    document.removeEventListener('keydown', _invKeyHandler);
    _shortcutsAttached = false;
    cleanupInventoryToggles();
}

function cleanupInventoryToggles() {
    _togglesBound = false;
    if (_toggleWriteTimer) {
        clearTimeout(_toggleWriteTimer);
        _toggleWriteTimer = null;
    }
}

let _shortcutsAttached = false;
function attachInventoryShortcuts() {
    if (_shortcutsAttached) return;
    _shortcutsAttached = true;
    document.addEventListener('keydown', _invKeyHandler);
}

function _invKeyHandler(e) {
    const tab = document.getElementById('tab-inventory');
    if (!tab || tab.classList.contains('hidden')) return;
    const tag = (e.target?.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    if (e.key === 'n' || e.key === 'N') {
        const modal = document.getElementById('inventoryModal');
        if (modal && !modal.classList.contains('active')) {
            e.preventDefault();
            resetInvModal();
            modal.classList.add('active');
            setTimeout(() => document.getElementById('invItemName')?.focus(), 50);
        }
    } else if (e.key === '?') {
        e.preventDefault();
        showToast(t('inv.shortcutsHelp', '📦 Shortcuts: n = Add Item, ? = Help'), 'info');
    }
}

function renderInventoryTable(data) {
    const tableBody = document.getElementById('inventoryTableBody');
    if (!tableBody) return;

    if (!data) {
        _invAllRows = [];
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-40 text-muted">No items found. Click 'Add Item' to start tracking.</td></tr>`;
        initPagination('inventoryPagination', 0, INV_PAGE_SIZE, (p) => { _invPage = p; renderInventoryTable(); });
        return;
    }

    const sorted = Object.entries(data).sort((a, b) => a[1].name.localeCompare(b[1].name));
    _invAllRows = sorted.map(([id, item]) => ({ id, item }));

    paintTable();
}

function paintTable() {
    const tableBody = document.getElementById('inventoryTableBody');
    if (!tableBody) return;

    const term = _invSearch.trim().toLowerCase();
    const filtered = term
        ? _invAllRows.filter(({ item }) => (item.name || '').toLowerCase().includes(term))
        : _invAllRows;

    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-40 text-muted">${term ? t('inv.noMatch', 'No items match "{term}"', { term: escapeHtml(_invSearch) }) : t('inv.empty', 'No items found. Click \'Add Item\' to start tracking.')}</td></tr>`;
    } else {
        const html = filtered.map(({ id, item }) => {
            const t = item.threshold || 0;
            const isLow = item.stock <= t;
            const isReorder = !isLow && item.stock > t && item.stock <= t * 1.5;
            const detailParts = [];
            if (item.sku) detailParts.push(`SKU: ${item.sku}`);
            if (item.unit) detailParts.push(`Unit: ${item.unit}`);
            if (item.supplier) detailParts.push(`Supplier: ${item.supplier}`);
            if (item.cost) detailParts.push(`Cost: ₹${item.cost}`);
            const titleAttr = detailParts.length ? ` title="${escapeHtml(detailParts.join(' · '))}"` : '';
            return `
            <tr class="${isLow ? 'row-alert' : ''}">
                <td class="p-l-25">
                    <div class="flex-column">
                        <span class="font-800 fs-15"${titleAttr}>${escapeHtml(item.name)}</span>
                        ${isLow ? `<span class="stock-status-badge low">${t('inv.lowStockBadge', 'Low Stock')}</span>` : ''}
                        ${isReorder ? `<span class="reorder-badge">${t('inv.reorderSoon', 'Reorder Soon')}</span>` : ''}
                    </div>
                </td>
                <td class="text-center">
                    <div class="stock-control-group">
                        <button class="stock-adjust-btn minus" data-action="adjustStock" data-id="${escapeHtml(id)}" data-delta="-1" aria-label="Decrease stock for ${escapeHtml(item.name)}">-</button>
                        <div class="stock-val-display" aria-live="polite">${item.stock}</div>
                        <button class="stock-adjust-btn plus" data-action="adjustStock" data-id="${escapeHtml(id)}" data-delta="1" aria-label="Increase stock for ${escapeHtml(item.name)}">+</button>
                    </div>
                </td>
                <td>
                    <span class="badge-outline">Min: ${item.threshold || 0}</span>
                </td>
                <td class="p-r-25 text-right">
                    <div class="flex-row flex-end flex-gap-8">
                        <button class="btn-icon-v4" data-action="viewStockHistory" data-id="${escapeHtml(id)}" data-name="${escapeHtml(item.name)}" title="View history" aria-label="View stock history for ${escapeHtml(item.name)}">
                            <i data-lucide="history"></i>
                        </button>
                        <button class="btn-icon-v4" data-action="editInventoryItem" data-id="${escapeHtml(id)}" title="Edit Item" aria-label="Edit ${escapeHtml(item.name)}">
                            <i data-lucide="edit-2"></i>
                        </button>
                        <button class="btn-icon-v4 danger" data-action="deleteInventoryItem" data-id="${escapeHtml(id)}" title="Delete" aria-label="Delete ${escapeHtml(item.name)}">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        }).join('');

        const start = (_invPage - 1) * INV_PAGE_SIZE;
        tableBody.innerHTML = html.slice(0, INV_PAGE_SIZE);
        if (window.lucide) window.lucide.createIcons();
    }

    initPagination('inventoryPagination', filtered.length, INV_PAGE_SIZE, (p) => { _invPage = p; paintTable(); });
}

export function setInventorySearch(term) {
    _invSearch = term || '';
    _invPage = 1;
    paintTable();
}

/**
 * HIGH-SPEED STOCK ADJUSTMENT
 * Uses transactions to ensure atomic updates across multiple admins.
 * Big deltas (|delta| >= 10) require user confirmation.
 * Every change is recorded to inventory-log for audit.
 */
export async function adjustStock(id, delta) {
    if (!state.currentOutlet || !id) return;

    if (Math.abs(delta) >= 10) {
        const itemSnap = await get(Outlet.ref(`inventory/${id}`));
        const item = itemSnap.val();
        if (!item) return;
        const direction = delta > 0 ? 'increase' : 'decrease';
        const ok = await showConfirm(
            t('inv.confirmLargeMsg', `Apply {direction} of {n} to {name}? Current: {current}`, {
                direction,
                n: Math.abs(delta),
                name: item.name,
                current: item.stock || 0
            }),
            t('inv.confirmLarge', 'Confirm Large Adjustment')
        );
        if (!ok) return;
    }

    const itemRef = Outlet.ref(`inventory/${id}/stock`);
    let prevStock = 0;
    let nextStock = 0;

    try {
        const result = await runTransaction(itemRef, (currentStock) => {
            prevStock = currentStock || 0;
            nextStock = Math.max(0, prevStock + delta);
            return nextStock;
        });

        if (result.committed) {
            pushLog({
                itemId: id,
                delta,
                prevStock,
                newStock: nextStock,
                user: auth.currentUser?.email || 'unknown'
            });
            try {
                const itemSnap = await get(Outlet.ref(`inventory/${id}`));
                const item = itemSnap.val();
                if (item) {
                    maybeNotifyLowStock({
                        itemId: id,
                        itemName: item.name,
                        prevStock,
                        newStock: nextStock,
                        threshold: item.threshold || 0
                    });
                }
            } catch (_) { /* notification is best-effort */ }
        }
    } catch (error) {
        console.error("[Inventory] Adjustment Error:", error);
        showToast(t('inv.syncError', '📦 Sync Error'), "error");
    }
}

/**
 * AUTO-DEDUCT STOCK ON SALE
 * Prefers dishId match (stable across renames) with name match as fallback.
 * Backfills missing dishId on legacy items so future deductions use the fast path.
 */
export async function autoDeductStock(items) {
    if (!state.currentOutlet || !items || items.length === 0) return;

    try {
        const snapshot = await get(Outlet.ref("inventory"));
        const inventory = snapshot.val() || {};

        for (const item of items) {
            const itemName = (item.name || "").toLowerCase();
            let invEntry = null;

            if (item.id) {
                invEntry = Object.entries(inventory).find(([, data]) => data.dishId === item.id) || null;
            }

            if (!invEntry) {
                invEntry = Object.entries(inventory).find(([, data]) => (data.name || "").toLowerCase() === itemName) || null;

                if (invEntry && item.id) {
                    const [matchId, matchData] = invEntry;
                    if (!matchData.dishId) {
                        update(Outlet.ref(`inventory/${matchId}`), { dishId: item.id }).catch(() => {});
                    }
                }
            }

            if (invEntry) {
                const [id, data] = invEntry;
                const qty = item.qty || 1;
                const prevStock = data.stock || 0;
                const newStock = prevStock - qty;

                await adjustStock(id, -qty);

                maybeNotifyLowStock({
                    itemId: id,
                    itemName: data.name,
                    prevStock,
                    newStock,
                    threshold: data.threshold || 0
                });
            }
        }
    } catch (e) {
        console.error("[Inventory] Auto-Deduct Error:", e);
    }
}

async function saveInventoryItem() {
    const name = document.getElementById('invItemName').value.trim();
    const stock = parseFloat(document.getElementById('invItemStock').value) || 0;
    const threshold = parseFloat(document.getElementById('invItemThreshold').value) || 0;
    const sku = document.getElementById('invItemSku').value.trim();
    const unit = document.getElementById('invItemUnit').value || 'each';
    const supplier = document.getElementById('invItemSupplier').value.trim();
    const cost = parseFloat(document.getElementById('invItemCost').value) || 0;
    const id = document.getElementById('inventoryModal').dataset.editId;

    if (!name) {
        showToast(t('inv.nameRequired', 'Item name is required'), "warning");
        return;
    }

    try {
        const existingSnap = await get(Outlet.ref('inventory'));
        const existing = existingSnap.val() || {};
        const nameLower = name.toLowerCase();
        const skuLower = sku.toLowerCase();

        const dupName = Object.entries(existing).find(([k, v]) =>
            k !== id && (v.name || '').toLowerCase() === nameLower
        );
        if (dupName) {
            showToast(t('inv.dupName', '📦 Item name already tracked'), "warning");
            return;
        }
        if (skuLower) {
            const dupSku = Object.entries(existing).find(([k, v]) =>
                k !== id && (v.sku || '').toLowerCase() === skuLower
            );
            if (dupSku) {
                showToast(t('inv.dupSku', '📦 SKU already in use'), "warning");
                return;
            }
        }

        const itemData = {
            name,
            stock,
            threshold,
            sku,
            unit,
            supplier,
            cost,
            updatedAt: serverTimestamp()
        };

        if (id) {
            const existingItem = existing[id];
            if (existingItem && !existingItem.dishId) {
                const matchingDish = await findDishByName(existingItem.name);
                if (matchingDish) {
                    itemData.dishId = matchingDish;
                }
            }
            await update(Outlet.ref(`inventory/${id}`), itemData);
            showToast(t('inv.updated', '📦 Item Updated'));
        } else {
            const newRef = push(Outlet.ref('inventory'));
            await set(newRef, itemData);
            showToast(t('inv.saved', '📦 Item Added'));
        }

        document.getElementById('inventoryModal').classList.remove('active');
        resetInvModal();
    } catch (error) {
        showToast(t('inv.saveFailed', '📦 Save Failed'), "error");
    }
}

async function findDishByName(dishName) {
    try {
        const snap = await get(Outlet.ref('dishes'));
        const dishes = snap.val() || {};
        const target = (dishName || '').toLowerCase();
        const match = Object.entries(dishes).find(([, d]) => (d.name || '').toLowerCase() === target);
        return match ? match[0] : null;
    } catch (e) {
        return null;
    }
}

function resetInvModal() {
    document.getElementById('invModalTitle').innerText = t('inv.modal.newTitle', 'Track New Product');
    document.getElementById('invItemName').value = '';
    document.getElementById('invItemStock').value = '0';
    document.getElementById('invItemThreshold').value = '5';
    document.getElementById('invItemSku').value = '';
    document.getElementById('invItemUnit').value = 'each';
    document.getElementById('invItemSupplier').value = '';
    document.getElementById('invItemCost').value = '';
    delete document.getElementById('inventoryModal').dataset.editId;
}

export async function editInventoryItem(id) {
    const invRef = Outlet.ref(`inventory/${id}`);
    const snapshot = await get(invRef);
    const item = snapshot.val();
    if (!item) return;

    document.getElementById('invModalTitle').innerText = t('inv.modal.editTitle', 'Edit Product Tracking');
    document.getElementById('invItemName').value = item.name;
    document.getElementById('invItemStock').value = item.stock;
    document.getElementById('invItemThreshold').value = item.threshold;
    document.getElementById('invItemSku').value = item.sku || '';
    document.getElementById('invItemUnit').value = item.unit || 'each';
    document.getElementById('invItemSupplier').value = item.supplier || '';
    document.getElementById('invItemCost').value = item.cost || '';
    document.getElementById('inventoryModal').dataset.editId = id;
    document.getElementById('inventoryModal').classList.add('active');
};

export async function deleteInventoryItem(id) {
    if (!(await showDeleteConfirm("this inventory item", "This item will be removed from the inventory list."))) return;

    try {
        await remove(Outlet.ref(`inventory/${id}`));
        showToast(t('inv.removed', '📦 Tracking stopped'));
    } catch (error) {
        showToast(t('inv.removeFailed', '📦 Failed to remove'), "error");
    }
};

function updateInventoryKPIs(data) {
    const totalEl = document.getElementById('invTotalItems');
    const lowEl = document.getElementById('invLowStock');
    
    if (!data) {
        if (totalEl) totalEl.innerText = '0';
        if (lowEl) lowEl.innerText = '0';
        return;
    }

    const items = Object.values(data);
    const lowCount = items.filter(item => item.stock <= (item.threshold || 0)).length;

    if (totalEl) totalEl.innerText = items.length;
    if (lowEl) lowEl.innerText = lowCount;
}

// ============================================================
// INVENTORY FEATURE TOGGLES & DISH CARD CONTROLS
// ============================================================

let _togglesBound = false;
let _toggleWriteTimer = null;

export function initInventoryToggles() {
    const toggleAvail = document.getElementById('toggleAvailability');
    const toggleStock = document.getElementById('toggleStockTracking');
    const availInfo = document.getElementById('availabilityInfo');
    const stockInfo = document.getElementById('stockTrackingInfo');

    if (!toggleAvail || !toggleStock) return;
    if (_togglesBound) return;
    _togglesBound = true;

    hydrateToggles(toggleAvail, toggleStock).then(() => {
        updateInfoPanel(toggleAvail, availInfo);
        updateInfoPanel(toggleStock, stockInfo);
        updateMenuVisibility();

        toggleAvail.addEventListener('change', () => {
            localStorage.setItem('inv_availability', toggleAvail.checked);
            updateInfoPanel(toggleAvail, availInfo);
            updateMenuVisibility();
            scheduleTogglePersist(toggleAvail, toggleStock);
        });

        toggleStock.addEventListener('change', () => {
            localStorage.setItem('inv_stockTracking', toggleStock.checked);
            updateInfoPanel(toggleStock, stockInfo);
            updateMenuVisibility();
            scheduleTogglePersist(toggleAvail, toggleStock);
        });
    });
}

async function hydrateToggles(toggleAvail, toggleStock) {
    if (!state.currentOutlet) {
        toggleAvail.checked = localStorage.getItem('inv_availability') === 'true';
        toggleStock.checked = localStorage.getItem('inv_stockTracking') === 'true';
        return;
    }
    try {
        const snap = await get(Outlet.ref('settings/inventory'));
        const remote = snap.val();
        if (remote && (typeof remote.availability === 'boolean' || typeof remote.stockTracking === 'boolean')) {
            toggleAvail.checked = !!remote.availability;
            toggleStock.checked = !!remote.stockTracking;
            localStorage.setItem('inv_availability', toggleAvail.checked);
            localStorage.setItem('inv_stockTracking', toggleStock.checked);
        } else {
            toggleAvail.checked = localStorage.getItem('inv_availability') === 'true';
            toggleStock.checked = localStorage.getItem('inv_stockTracking') === 'true';
            await set(Outlet.ref('settings/inventory'), {
                availability: toggleAvail.checked,
                stockTracking: toggleStock.checked
            });
        }
    } catch (e) {
        console.warn('[Inventory] Toggle hydrate failed, using localStorage', e);
        toggleAvail.checked = localStorage.getItem('inv_availability') === 'true';
        toggleStock.checked = localStorage.getItem('inv_stockTracking') === 'true';
    }
}

function scheduleTogglePersist(toggleAvail, toggleStock) {
    clearTimeout(_toggleWriteTimer);
    _toggleWriteTimer = setTimeout(() => {
        if (!state.currentOutlet) return;
        set(Outlet.ref('settings/inventory'), {
            availability: toggleAvail.checked,
            stockTracking: toggleStock.checked
        }).catch(err => console.warn('[Inventory] Toggle persist failed', err));
    }, 500);
}

function updateInfoPanel(toggle, infoPanel) {
    if (!infoPanel) return;
    infoPanel.style.display = toggle.checked ? 'none' : 'block';
}

function updateMenuVisibility() {
    const menuSection = document.getElementById('inventoryMenuSection');
    if (!menuSection) return;
    const anyEnabled = document.getElementById('toggleAvailability')?.checked ||
                       document.getElementById('toggleStockTracking')?.checked;
    menuSection.style.display = anyEnabled ? 'block' : 'none';
    if (anyEnabled) loadInventoryMenu();
}

export async function loadInventoryMenu() {
    const container = document.getElementById('inventoryMenuGrid');
    if (!container) return;

    const showAvailability = document.getElementById('toggleAvailability')?.checked;
    const showStock = document.getElementById('toggleStockTracking')?.checked;

    container.innerHTML = '<div class="text-center p-20 text-muted">Loading menu...</div>';

    try {
        const [dishesSnap, inventorySnap] = await Promise.all([
            get(Outlet.ref('dishes')),
            get(Outlet.ref('inventory'))
        ]);

        const inventoryMap = {};
        inventorySnap.forEach(child => {
            const inv = child.val();
            inventoryMap[(inv.name || '').toLowerCase()] = {
                id: child.key,
                stock: inv.stock || 0,
                threshold: inv.threshold || 5
            };
        });

        if (dishesSnap.numChildren() === 0) {
            _menuAllRows = [];
            container.innerHTML = '<div class="text-center p-40 text-muted">No dishes found. Add dishes in the Menu tab first.</div>';
            initPagination('inventoryMenuPagination', 0, MENU_PAGE_SIZE, () => {});
            return;
        }

        const rows = [];
        dishesSnap.forEach(child => {
            const dish = child.val();
            const dishId = child.key;
            const inv = inventoryMap[(dish.name || '').toLowerCase()];

            let controlsHtml = '';
            let reorderBadge = '';

            if (showAvailability) {
                controlsHtml += `
                    <div class="inventory-avail-row">
                        <span class="avail-label">Available</span>
                        <label class="toggle-switch-sm">
                            <input type="checkbox" ${dish.stock !== false ? 'checked' : ''}
                                data-action="toggleDish" data-id="${dishId}">
                            <span class="toggle-slider-sm"></span>
                        </label>
                    </div>`;
            }

            if (showStock) {
                if (inv) {
                    const t = inv.threshold || 0;
                    const isLow = inv.stock <= t;
                    const isReorder = !isLow && inv.stock > t && inv.stock <= t * 1.5;
                    if (isReorder) reorderBadge = '<span class="reorder-badge">Reorder Soon</span>';
                    controlsHtml += `
                        <div class="inventory-stock-row">
                            <span class="stock-label ${isLow ? 'text-danger' : ''}">Stock: ${inv.stock}${reorderBadge}</span>
                            <div class="stock-control-group">
                                <button class="stock-adjust-btn minus" data-inventory-id="${inv.id}" data-delta="-1" aria-label="Decrease stock for ${escapeHtml(dish.name)}">−</button>
                                <span class="stock-val-display" aria-live="polite">${inv.stock}</span>
                                <button class="stock-adjust-btn plus" data-inventory-id="${inv.id}" data-delta="1" aria-label="Increase stock for ${escapeHtml(dish.name)}">+</button>
                            </div>
                        </div>`;
                } else {
                    controlsHtml += `
                        <div class="inventory-stock-row">
                            <span class="stock-label text-muted">Not tracked</span>
                            <button class="btn-secondary btn-small track-dish-btn" data-dish-id="${dishId}" data-dish-name="${escapeHtml(dish.name)}" aria-label="Start tracking stock for ${escapeHtml(dish.name)}">
                                + Track Stock
                            </button>
                        </div>`;
                }
            }

            rows.push(`
                <div class="dish-card inventory-dish-card">
                    <div class="dish-img-container">
                        <img src="${dish.image || 'https://placehold.co/150'}" alt="${escapeHtml(dish.name)}" loading="lazy">
                    </div>
                    <div class="dish-info">
                        <h4>${escapeHtml(dish.name)}</h4>
                        <span class="dish-price-val">₹${dish.price || 0}</span>
                        ${controlsHtml}
                    </div>
                </div>`);
        });

        _menuAllRows = rows;
        _menuPage = 1;
        paintMenuPage();
    } catch (e) {
        console.error("[Inventory] Menu load error:", e);
        container.innerHTML = '<div class="text-center p-40 text-danger">Failed to load menu.</div>';
    }
}

function paintMenuPage() {
    const container = document.getElementById('inventoryMenuGrid');
    if (!container) return;
    const start = (_menuPage - 1) * MENU_PAGE_SIZE;
    const slice = _menuAllRows.slice(start, start + MENU_PAGE_SIZE);
    container.innerHTML = slice.join('');
    initPagination('inventoryMenuPagination', _menuAllRows.length, MENU_PAGE_SIZE, (p) => { _menuPage = p; paintMenuPage(); });
    if (window.lucide) window.lucide.createIcons({ root: container });
    attachInventoryMenuListeners(container);
}

function attachInventoryMenuListeners(container) {
    container.querySelectorAll('.stock-adjust-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const invId = btn.dataset.inventoryId;
            const delta = parseInt(btn.dataset.delta, 10);
            if (invId && delta) {
                await adjustStock(invId, delta);
                loadInventoryMenu();
            }
        });
    });

    container.querySelectorAll('.track-dish-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const dishName = btn.dataset.dishName;
            const dishId = btn.dataset.dishId;
            if (!dishName) return;
            await push(Outlet.ref('inventory'), {
                name: dishName,
                dishId: dishId,
                stock: 0,
                threshold: 5,
                updatedAt: serverTimestamp()
            });
            showToast(`Now tracking stock for ${dishName}`, "success");
            loadInventoryMenu();
        });
    });
}

import { db, Outlet, serverTimestamp, get, set, update, remove, push, onValue, runTransaction } from '../firebase.js';
import { state } from '../state.js';
import { showDeleteConfirm } from '../ui-utils.js';
import { logAudit, showToast, initPagination, escapeHtml, getSkeletonRows } from '../utils.js';

let inventoryListener = null;
const INV_PAGE_SIZE = 30;
let _invPage = 1;

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

    // Exposure for global click handlers on buttons
    window.adjustStock = adjustStock;

    // Initialize inventory feature toggles
    initInventoryToggles();
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
}

function renderInventoryTable(data) {
    const tableBody = document.getElementById('inventoryTableBody');
    if (!tableBody) return;

    if (!data) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-40 text-muted">No items found. Click 'Add Item' to start tracking.</td></tr>`;
        return;
    }

    const sorted = Object.entries(data).sort((a, b) => a[1].name.localeCompare(b[1].name));
    const allItems = [];

    sorted.forEach(([id, item]) => {
        const isLow = item.stock <= (item.threshold || 0);
        allItems.push(`
            <tr class="${isLow ? 'row-alert' : ''}">
                <td class="p-l-25">
                    <div class="flex-column">
                        <span class="font-800 fs-15">${escapeHtml(item.name)}</span>
                        ${isLow ? '<span class="stock-status-badge low">Low Stock</span>' : ''}
                    </div>
                </td>
                <td class="text-center">
                    <div class="stock-control-group">
                        <button class="stock-adjust-btn minus" onclick="adjustStock('${escapeHtml(id)}', -1)">-</button>
                        <div class="stock-val-display">${item.stock}</div>
                        <button class="stock-adjust-btn plus" onclick="adjustStock('${escapeHtml(id)}', 1)">+</button>
                    </div>
                </td>
                <td>
                    <span class="badge-outline">Min: ${item.threshold || 0}</span>
                </td>
                <td class="p-r-25 text-right">
                    <div class="flex-row flex-end flex-gap-8">
                        <button class="btn-icon-v4" onclick="window.editInventoryItem('${escapeHtml(id)}')" title="Edit Item">
                            <i data-lucide="edit-2"></i>
                        </button>
                        <button class="btn-icon-v4 danger" onclick="window.deleteInventoryItem('${escapeHtml(id)}')" title="Delete">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `);
    });

    const start = (_invPage - 1) * INV_PAGE_SIZE;
    tableBody.innerHTML = allItems.slice(start, start + INV_PAGE_SIZE).join('');
    initPagination('inventoryPagination', allItems.length, INV_PAGE_SIZE, (p) => { _invPage = p; renderInventoryTable(); });
    if (window.lucide) window.lucide.createIcons();
}

/**
 * HIGH-SPEED STOCK ADJUSTMENT
 * Uses transactions to ensure atomic updates across multiple admins.
 */
export async function adjustStock(id, delta) {
    if (!state.currentOutlet || !id) return;

    const itemRef = Outlet.ref(`inventory/${id}/stock`);
    
    try {
        await runTransaction(itemRef, (currentStock) => {
            const newStock = (currentStock || 0) + delta;
            return newStock < 0 ? 0 : newStock;
        });
        
        // Minor visual feedback could be added here if needed
    } catch (error) {
        console.error("[Inventory] Adjustment Error:", error);
        showToast("Sync Error", "error");
    }
}

/**
 * AUTO-DEDUCT STOCK ON SALE
 * Finds matching inventory items by name and subtracts quantity.
 */
export async function autoDeductStock(items) {
    if (!state.currentOutlet || !items || items.length === 0) return;

    try {
        const snapshot = await get(Outlet.ref("inventory"));
        const inventory = snapshot.val() || {};

        for (const item of items) {
            const itemName = (item.name || "").toLowerCase();
            const invEntry = Object.entries(inventory).find(([id, data]) => data.name.toLowerCase() === itemName);

            if (invEntry) {
                const [id, data] = invEntry;
                const qty = item.qty || 1;
                const newStock = (data.stock || 0) - qty;
                
                await adjustStock(id, -qty);

                // UI Alert if threshold reached
                if (newStock <= (data.threshold || 0)) {
                    showToast(`⚠️ Low Stock: ${data.name} (${newStock})`, "warning");
                }
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
    const id = document.getElementById('inventoryModal').dataset.editId;

    if (!name) {
        showToast("Item name is required", "warning");
        return;
    }

    try {
        const itemData = {
            name,
            stock,
            threshold,
            updatedAt: serverTimestamp()
        };

        if (id) {
            await update(Outlet.ref(`inventory/${id}`), itemData);
            showToast("Item Updated");
        } else {
            const newRef = push(Outlet.ref('inventory'));
            await set(newRef, itemData);
            showToast("Item Added");
        }

        document.getElementById('inventoryModal').classList.remove('active');
        resetInvModal();
    } catch (error) {
        showToast("Save Failed", "error");
    }
}

function resetInvModal() {
    document.getElementById('invModalTitle').innerText = "Track New Product";
    document.getElementById('invItemName').value = '';
    document.getElementById('invItemStock').value = '0';
    document.getElementById('invItemThreshold').value = '5';
    delete document.getElementById('inventoryModal').dataset.editId;
}

window.editInventoryItem = async (id) => {
    const invRef = Outlet.ref(`inventory/${id}`);
    const snapshot = await get(invRef);
    const item = snapshot.val();
    if (!item) return;

    document.getElementById('invModalTitle').innerText = "Edit Product Tracking";
    document.getElementById('invItemName').value = item.name;
    document.getElementById('invItemStock').value = item.stock;
    document.getElementById('invItemThreshold').value = item.threshold;
    document.getElementById('inventoryModal').dataset.editId = id;
    document.getElementById('inventoryModal').classList.add('active');
};

window.deleteInventoryItem = async (id) => {
    if (!(await showDeleteConfirm("this inventory item", "This item will be removed from the inventory list."))) return;

    try {
        await remove(Outlet.ref(`inventory/${id}`));
        showToast("Tracking stopped");
    } catch (error) {
        showToast("Failed to remove", "error");
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

export function initInventoryToggles() {
    const toggleAvail = document.getElementById('toggleAvailability');
    const toggleStock = document.getElementById('toggleStockTracking');
    const availInfo = document.getElementById('availabilityInfo');
    const stockInfo = document.getElementById('stockTrackingInfo');

    if (!toggleAvail || !toggleStock) return;

    toggleAvail.checked = localStorage.getItem('inv_availability') === 'true';
    toggleStock.checked = localStorage.getItem('inv_stockTracking') === 'true';

    updateInfoPanel(toggleAvail, availInfo);
    updateInfoPanel(toggleStock, stockInfo);
    updateMenuVisibility();

    toggleAvail.addEventListener('change', () => {
        localStorage.setItem('inv_availability', toggleAvail.checked);
        updateInfoPanel(toggleAvail, availInfo);
        updateMenuVisibility();
    });

    toggleStock.addEventListener('change', () => {
        localStorage.setItem('inv_stockTracking', toggleStock.checked);
        updateInfoPanel(toggleStock, stockInfo);
        updateMenuVisibility();
    });
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

        container.innerHTML = '';
        let hasDishes = false;

        dishesSnap.forEach(child => {
            hasDishes = true;
            const dish = child.val();
            const dishId = child.key;
            const inv = inventoryMap[(dish.name || '').toLowerCase()];

            let controlsHtml = '';

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
                    const isLow = inv.stock <= inv.threshold;
                    controlsHtml += `
                        <div class="inventory-stock-row">
                            <span class="stock-label ${isLow ? 'text-danger' : ''}">Stock: ${inv.stock}</span>
                            <div class="stock-control-group">
                                <button class="stock-adjust-btn minus" data-inventory-id="${inv.id}" data-delta="-1">−</button>
                                <span class="stock-val-display">${inv.stock}</span>
                                <button class="stock-adjust-btn plus" data-inventory-id="${inv.id}" data-delta="1">+</button>
                            </div>
                        </div>`;
                } else {
                    controlsHtml += `
                        <div class="inventory-stock-row">
                            <span class="stock-label text-muted">Not tracked</span>
                            <button class="btn-secondary btn-small track-dish-btn" data-dish-id="${dishId}" data-dish-name="${escapeHtml(dish.name)}">
                                + Track Stock
                            </button>
                        </div>`;
                }
            }

            const card = document.createElement('div');
            card.className = 'dish-card inventory-dish-card';
            card.innerHTML = `
                <div class="dish-img-container">
                    <img src="${dish.image || 'https://placehold.co/150'}" alt="${escapeHtml(dish.name)}" loading="lazy">
                </div>
                <div class="dish-info">
                    <h4>${escapeHtml(dish.name)}</h4>
                    <span class="dish-price-val">₹${dish.price || 0}</span>
                    ${controlsHtml}
                </div>`;

            container.appendChild(card);
        });

        if (!hasDishes) {
            container.innerHTML = '<div class="text-center p-40 text-muted">No dishes found. Add dishes in the Menu tab first.</div>';
        }

        if (window.lucide) window.lucide.createIcons({ root: container });
        attachInventoryMenuListeners(container);
    } catch (e) {
        console.error("[Inventory] Menu load error:", e);
        container.innerHTML = '<div class="text-center p-40 text-danger">Failed to load menu.</div>';
    }
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

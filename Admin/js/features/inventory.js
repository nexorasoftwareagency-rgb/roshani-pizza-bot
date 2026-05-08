import { db, Outlet, ServerValue } from '../firebase.js';
import { state } from '../state.js';
import { logAudit, showToast, confirmAction } from '../utils.js';

let inventoryListener = null;

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
}

export function loadInventory() {
    if (!state.currentOutlet) return;
    cleanupInventory();
    
    const invRef = Outlet.ref('inventory');
    inventoryListener = invRef.on('value', (snapshot) => {
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
        const invRef = Outlet.ref('inventory');
        invRef.off('value', inventoryListener);
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

    let html = '';
    // Sort items by name
    const sorted = Object.entries(data).sort((a, b) => a[1].name.localeCompare(b[1].name));

    sorted.forEach(([id, item]) => {
        const isLow = item.stock <= (item.threshold || 0);
        
        html += `
            <tr class="${isLow ? 'row-alert' : ''}">
                <td class="p-l-25">
                    <div class="flex-column">
                        <span class="font-800 fs-15">${item.name}</span>
                        ${isLow ? '<span class="stock-status-badge low">Low Stock</span>' : ''}
                    </div>
                </td>
                <td class="text-center">
                    <div class="stock-control-group">
                        <button class="stock-adjust-btn minus" onclick="adjustStock('${id}', -1)">-</button>
                        <div class="stock-val-display">${item.stock}</div>
                        <button class="stock-adjust-btn plus" onclick="adjustStock('${id}', 1)">+</button>
                    </div>
                </td>
                <td>
                    <span class="badge-outline">Min: ${item.threshold || 0}</span>
                </td>
                <td class="p-r-25 text-right">
                    <div class="flex-row flex-end flex-gap-8">
                        <button class="btn-icon-v4" onclick="window.editInventoryItem('${id}')" title="Edit Item">
                            <i data-lucide="edit-2"></i>
                        </button>
                        <button class="btn-icon-v4 danger" onclick="window.deleteInventoryItem('${id}')" title="Delete">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;
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
        await itemRef.transaction((currentStock) => {
            const newStock = (currentStock || 0) + delta;
            return newStock < 0 ? 0 : newStock; // Prevent negative stock
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
        const snapshot = await Outlet.ref("inventory").once("value");
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
            updatedAt: ServerValue.TIMESTAMP
        };

        if (id) {
            await Outlet.ref(`inventory/${id}`).update(itemData);
            showToast("Item Updated");
        } else {
            const newRef = Outlet.ref('inventory').push();
            await newRef.set(itemData);
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

window.editInventoryItem = (id) => {
    const invRef = Outlet.ref(`inventory/${id}`);
    invRef.once('value').then((snapshot) => {
        const item = snapshot.val();
        if (!item) return;

        document.getElementById('invModalTitle').innerText = "Edit Product Tracking";
        document.getElementById('invItemName').value = item.name;
        document.getElementById('invItemStock').value = item.stock;
        document.getElementById('invItemThreshold').value = item.threshold;
        document.getElementById('inventoryModal').dataset.editId = id;
        document.getElementById('inventoryModal').classList.add('active');
    });
};

window.deleteInventoryItem = async (id) => {
    const confirmed = await confirmAction("Stop Tracking?", "This item will be removed from the inventory list.");
    if (!confirmed) return;

    try {
        await Outlet.ref(`inventory/${id}`).remove();
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

/**
 * ROSHANI ERP | INVENTORY MANAGEMENT MODULE
 * Handles stock tracking, restock alerts, and supply management.
 */

import { Outlet } from '../firebase.js';
import { escapeHtml } from '../utils.js';
import { addNotification } from './notifications.js';

let inventoryListener = null;

/**
 * INITIALIZE INVENTORY MODULE
 */
export function loadInventory() {
    const tableBody = document.getElementById("inventoryTableBody");
    if (!tableBody) return;

    cleanupInventory();

    // Stats Elements
    const totalItemsEl = document.getElementById("inv-total-items");
    const lowStockEl = document.getElementById("inv-low-stock");

    inventoryListener = Outlet.ref("inventory").on("value", snap => {
        tableBody.innerHTML = "";
        const items = [];
        let lowStockCount = 0;

        snap.forEach(child => {
            const val = child.val();
            const item = { id: child.key, ...val };
            items.push(item);
            if (val.stock <= (val.minStock || 0)) {
                lowStockCount++;
                // Trigger a notification if stock is critically low
                if (val.stock < (val.minStock || 0)) {
                    addNotification("Low Stock Alert", `${val.name} is critically low (${val.stock} ${val.unit} remaining)`, "warning");
                }
            }
        });

        // Update Stats
        if (totalItemsEl) totalItemsEl.innerText = items.length;
        if (lowStockEl) lowStockEl.innerText = lowStockCount;

        if (items.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center p-40 text-muted">No inventory items found. Add your first item!</td></tr>`;
            return;
        }

        const html = items.map(item => {
            const isLow = item.stock <= (item.minStock || 0);
            const statusClass = isLow ? 'danger' : 'success';
            const progressPct = Math.min(100, (item.stock / ((item.minStock || 1) * 3)) * 100);

            return `
                <tr class="premium-row-v4 ${isLow ? 'row-alert-v4' : ''}">
                    <td>
                        <div class="identity-info-v4">
                            <span class="name">${escapeHtml(item.name)}</span>
                            <span class="sub">${escapeHtml(item.category || 'General')}</span>
                        </div>
                    </td>
                    <td>
                        <div class="flex-col w-120">
                            <div class="flex-between mb-4">
                                <span class="font-800 fs-13 ${isLow ? 'text-danger' : ''}">${item.stock} ${item.unit}</span>
                                <span class="text-muted-small">${Math.round(progressPct)}%</span>
                            </div>
                            <div class="progress-bar-v4">
                                <div class="progress-fill-v4 ${statusClass}" style="width: ${progressPct}%"></div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="identity-chip-v4 glass">
                            <span class="name">${item.minStock || 0} ${item.unit}</span>
                        </div>
                    </td>
                    <td>
                        <span class="text-muted-small font-700">${escapeHtml(item.unit)}</span>
                    </td>
                    <td>
                        <div class="identity-info-v4">
                            <span class="name fs-12">${item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString() : 'Never'}</span>
                            <span class="sub">By Admin</span>
                        </div>
                    </td>
                    <td>
                        <div class="flex-row flex-gap-8">
                            <button class="btn-icon-v4 success" onclick="window.inventoryModule.quickRestock('${item.id}', 10)" title="Quick +10">
                                <i data-lucide="plus"></i>
                            </button>
                            <button class="btn-icon-v4 warning" onclick="window.inventoryModule.editItem('${item.id}')" title="Edit Item">
                                <i data-lucide="edit-3"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        tableBody.innerHTML = html;
        if (window.lucide) window.lucide.createIcons(tableBody);
    });
}

/**
 * QUICK RESTOCK LOGIC
 */
export async function quickRestock(itemId, amount) {
    try {
        const ref = Outlet.ref(`inventory/${itemId}/stock`);
        const snap = await ref.once('value');
        const current = snap.val() || 0;
        await ref.set(current + amount);
        await Outlet.ref(`inventory/${itemId}/lastUpdated`).set(Date.now());
    } catch (err) {
        console.error("Restock failed:", err);
    }
}

/**
 * CLEANUP
 */
export function cleanupInventory() {
    if (inventoryListener) {
        Outlet.ref("inventory").off("value", inventoryListener);
        inventoryListener = null;
    }
}

/**
 * EDIT ITEM LOGIC
 */
export async function editItem(itemId) {
    try {
        const snap = await Outlet.ref(`inventory/${itemId}`).once('value');
        const data = snap.val();
        if (!data) return;

        const modal = document.getElementById('inventoryModal');
        if (modal) {
            document.getElementById('inventoryModalTitle').innerText = "Edit Item";
            document.getElementById('inventoryId').value = itemId;
            document.getElementById('invItemName').value = data.name || "";
            document.getElementById('invItemCategory').value = data.category || "Dairy";
            document.getElementById('invItemStock').value = data.stock || 0;
            document.getElementById('invItemMinStock').value = data.minStock || 0;
            document.getElementById('invItemUnit').value = data.unit || "kg";

            modal.classList.add('active', 'flex');
            modal.classList.remove('hidden');
        }
    } catch (err) {
        console.error("Failed to load item:", err);
    }
}

// Export to window for inline onclicks
window.inventoryModule = {
    quickRestock,
    editItem
};


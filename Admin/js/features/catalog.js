import { Outlet, uploadImage, deleteImage } from '../firebase.js';
import { showToast, escapeHtml, logAudit } from '../utils.js';
import { state } from '../state.js';
import { requireAdminReauth } from '../auth.js';
import { showConfirm } from '../ui.js';

/**
 * CATEGORIES
 */

export function loadCategories() {
    cleanupCatalog();
    console.log("[Catalog] Loading categories...");
    Outlet.ref('categories').on('value', snap => {
        state.categories = [];
        const container = document.getElementById('categoryList');
        if (!container) return;
        container.innerHTML = "";

        snap.forEach(child => {
            const cat = { id: child.key, ...child.val() };
            state.categories.push(cat);

            const div = document.createElement('div');
            div.className = "glass-card";
            div.style.padding = "15px";
            div.classList.add('flex-row', 'flex-center');
            div.style.alignItems = "center";
            div.style.gap = "15px";
            div.style.borderRadius = "12px";
            div.style.border = "1px solid rgba(0,0,0,0.05)";

            div.innerHTML = `
                <img src="${cat.image || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\' viewBox=\'0 0 60 60\'%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'%23eee\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-family=\'sans-serif\' font-size=\'8\' fill=\'%23999\'%3ENo Image%3C/text%3E%3C/svg%3E'}" style="width:60px; height:60px; border-radius:10px; object-fit:cover; border:1px solid rgba(0,0,0,0.05)">
                <div style="flex:1">
                    <h4 style="margin:0; color:var(--text-main); font-weight:700;">${escapeHtml(cat.name)}</h4>
                    <small style="color:var(--text-muted)">ID: ${child.key.slice(-4)}</small>
                </div>
                <button data-action="deleteCategory" data-id="${cat.id}" style="background:none; border:none; color:#ef4444; font-size:20px; cursor:pointer; opacity:0.6;">&times;</button>
            `;
            container.appendChild(div);
        });
        updateActiveDishModalCategories();
    });
}

export async function addCategory() {
    const nameInput = document.getElementById('newCatName');
    const name = nameInput.value.trim();
    if (!name) return showToast('Enter category name', 'warning');

    const fileInput = document.getElementById('catFile');
    const previewImg = document.getElementById('catPreview');
    let imageUrl = "";

    try {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            imageUrl = await uploadImage(file, `categories/${Date.now()}_${file.name}`);
        }

        const addons = {};
        document.querySelectorAll('#categoryAddonsList .addon-row-small').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs[0].value && inputs[1].value) {
                addons[inputs[0].value] = Number(inputs[1].value);
            }
        });

        await Outlet.ref('categories').push({
            name: name,
            image: imageUrl,
            outlet: (window.currentOutlet || 'pizza').toLowerCase(),
            addons: Object.keys(addons).length > 0 ? addons : null
        });

        const addonsList = document.getElementById('categoryAddonsList');
        if (addonsList) addonsList.innerHTML = "";

        nameInput.value = "";
        fileInput.value = "";
        if (previewImg) previewImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3C/svg%3E";
        showToast('Category added successfully!', 'success');
        logAudit("Catalog", `Added Category: ${name}`, "Global");
    } catch (err) {
        console.error(err);
        showToast('Operation failed: ' + err.message, 'error');
    }
}

export async function deleteCategory(id) {
    requireAdminReauth(async () => {
        if (await showConfirm("Delete this category?")) {
            const snap = await Outlet.ref('categories/' + id).once('value');
            const catName = snap.val()?.name || "Unknown";
            await Outlet.ref('categories/' + id).remove();
            logAudit("Catalog", `Deleted Category: ${catName}`, id);
        }
    });
}


/**
 * DISHES (MENU)
 */

export function loadMenu() {
    const grid = document.getElementById("menuGrid");
    if (!grid) return;

    console.log("[Catalog] Loading menu...");
    Outlet.ref(`dishes`).on("value", snap => {
        grid.innerHTML = "";
        snap.forEach(child => {
            const d = child.val();
            const dishId = child.key;

            let sizesHtml = "";
            if (d.sizes) {
                sizesHtml = `
                <div class="dish-pricing-box">
                    <div style="font-size:9px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:5px; letter-spacing:0.5px;">Sizes & Pricing</div>
                    ${Object.entries(d.sizes).map(([size, price]) => `
                        <div class="dish-price-row">
                            <span style="color:var(--text-main)">${size}</span>
                            <span class="dish-price-val">₹${price}</span>
                        </div>
                    `).join("")}
                </div>`;
            } else {
                sizesHtml = `
                <div class="dish-pricing-box flex-between">
                    <span style="font-size:12px; color:var(--text-muted)">Standard</span>
                    <span class="dish-price-val" style="font-size:15px;">₹${d.price || 0}</span>
                </div>`;
            }

            const card = document.createElement('div');
            card.className = 'dish-card';
            card.innerHTML = `
                <div class="dish-img-container">
                    <img src="${d.image || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'150\' height=\'150\' viewBox=\'0 0 150 150\'%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'%23eee\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-family=\'sans-serif\' font-size=\'12\' fill=\'%23999\'%3ENo Image%3C/text%3E%3C/svg%3E'}" alt="${escapeHtml(d.name)}">
                    <div class="stock-badge ${d.stock ? 'available' : 'out'}">
                        ${d.stock ? 'AVAILABLE' : 'OUT OF STOCK'}
                    </div>
                </div>
                <div class="dish-info">
                     <h4>${escapeHtml(d.name)}</h4>
                    <div class="dish-category">${escapeHtml(d.category || '')}</div>
                    ${sizesHtml}
                    <div class="dish-actions">
                        <button class="edit-btn btn-secondary flex-center gap-5" data-action="editDish" data-id="${dishId}"><i data-lucide="edit-3" style="width:12px;"></i> Edit</button>
                        <button class="delete-btn btn-secondary flex-center" data-action="deleteDish" data-id="${dishId}"><i data-lucide="trash-2" style="width:12px;"></i></button>
                    </div>
                </div>`;

            if (window.lucide) window.lucide.createIcons(card);
            grid.appendChild(card);
        });

        if (snap.numChildren() === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">No dishes yet. Click + Add Dish to get started.</div>';
        }
    });
}

export async function saveDish() {
    if (!window.currentOutlet || window.currentOutlet === 'null' || window.currentOutlet === 'undefined') {
        return showToast("Error: Current outlet context is missing. Please refresh or select an outlet first.", "error");
    }

    const name = document.getElementById('dishName').value;
    const cat = document.getElementById('dishCategory').value;
    const basePrice = document.getElementById('dishPriceBase').value;
    let image = document.getElementById('dishImage').value;

    if (!name || !cat) return showToast("Please fill Name and Category", "warning");

    const file = document.getElementById('dishFile').files[0];
    const statusLabel = document.getElementById('uploadStatus');

    try {
        if (file) {
            if (statusLabel) statusLabel.classList.remove('hidden');
            let oldImageUrl = null;
            if (state.editingDishId) {
                const snap = await Outlet.ref(`dishes/${state.editingDishId}`).once('value');
                oldImageUrl = snap.val()?.image;
            }
            image = await uploadImage(file, `dishes/${Date.now()}_${file.name}`);
            if (oldImageUrl && image !== oldImageUrl) {
                await deleteImage(oldImageUrl);
            }
            if (statusLabel) statusLabel.classList.add('hidden');
        }

        const sizes = {};
        document.querySelectorAll('.size-row').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs[0].value && inputs[1].value) {
                sizes[inputs[0].value] = Number(inputs[1].value);
            }
        });

        const addons = {};
        document.querySelectorAll('.addon-row').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs[0].value && inputs[1].value) {
                addons[inputs[0].value] = Number(inputs[1].value);
            }
        });

        const data = {
            name,
            category: cat,
            price: Number(basePrice) || 0,
            image,
            stock: true,
            sizes: Object.keys(sizes).length > 0 ? sizes : null,
            addons: Object.keys(addons).length > 0 ? addons : null
        };

        const ref = Outlet.ref('dishes');
        if (state.editingDishId) {
            await ref.child(state.editingDishId).update(data);
            logAudit("Catalog", `Updated Dish: ${name}`, state.editingDishId);
        } else {
            const newRef = await ref.push(data);
            logAudit("Catalog", `Added New Dish: ${name}`, newRef.key);
        }

        hideDishModal();
        loadMenu();
    } catch (e) {
        showToast("Error: " + e.message, "error");
        if (statusLabel) statusLabel.classList.add('hidden');
    }
}

export function deleteDish(dishId) {
    requireAdminReauth(() => {
        const existing = document.getElementById('deleteConfirmOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'deleteConfirmOverlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
        `;

        overlay.innerHTML = `
        <div style="background:#1c1c1c; border:1px solid #ef4444; border-radius:20px;
                    padding:32px 36px; max-width:360px; width:90%; text-align:center;
                    box-shadow:0 20px 60px rgba(239,68,68,0.25);">
        <div style="font-size:40px; margin-bottom:12px;">🗑️</div>
            <h3 style="color:#fff; margin:0 0 8px; font-size:18px; font-weight:700;">Delete Dish?</h3>
            <p style="color:#aaa; font-size:14px; margin:0 0 24px;">This action cannot be undone.</p>
            <div style="display:flex; gap:12px; justify-content:center;">
                <button id="confirmDeleteNo" style="flex:1; padding:12px; border-radius:12px; border:1px solid #333; background:transparent; color:#aaa; cursor:pointer; font-size:14px; font-weight:600;">Cancel</button>
                <button id="confirmDeleteYes" style="flex:1; padding:12px; border-radius:12px; border:none; background:#ef4444; color:#fff; cursor:pointer; font-size:14px; font-weight:700;">Delete</button>
            </div>
        </div>`;

        document.body.appendChild(overlay);

        const cleanup = () => overlay.remove();
        overlay.querySelector('#confirmDeleteNo').onclick = cleanup;
        overlay.onclick = (e) => { if (e.target === overlay) cleanup(); };

        overlay.querySelector('#confirmDeleteYes').onclick = async () => {
            cleanup();
            try {
                const snap = await Outlet.ref(`dishes/${dishId}`).once('value');
                const d = snap.val();
                const dishName = d?.name || "Unknown";
                const img = d?.image;
                if (img) await deleteImage(img);
                await Outlet.ref(`dishes/${dishId}`).remove();
                logAudit("Catalog", `Deleted Dish: ${dishName}`, dishId);
                showToast('Dish deleted', 'success');
            } catch (e) {
                showToast('Delete failed: ' + e.message, 'error');
            }
        };
    });
}


/**
 * MODALS & UI
 */

export async function showDishModal(dishId = null) {
    state.editingDishId = dishId;
    const modal = document.getElementById('dishModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    if (state.categories.length === 0) loadCategories();
    else updateActiveDishModalCategories();

    const titleEl = document.getElementById('modalTitle');
    if (titleEl) titleEl.innerText = dishId ? 'Edit Dish' : 'Add New Dish';

    const statusLabel = document.getElementById('uploadStatus');
    if (statusLabel) statusLabel.classList.add('hidden');

    if (!dishId) {
        document.getElementById('dishName').value = '';
        document.getElementById('dishCategory').value = '';
        document.getElementById('dishPriceBase').value = '';
        document.getElementById('dishImage').value = '';
        document.getElementById('dishPreview').src = "https://placehold.co/100";
        document.getElementById('sizesContainer').innerHTML = '';
        document.getElementById('addonsContainer').innerHTML = '';
    } else {
        const snap = await Outlet.ref(`dishes/${dishId}`).once('value');
        const d = snap.val();
        if (d) {
            document.getElementById('dishName').value = d.name || '';
            const select = document.getElementById('dishCategory');
            const catValue = d.category || '';
            
            if (catValue && !Array.from(select.options).some(opt => opt.value === catValue)) {
                const opt = document.createElement('option');
                opt.value = catValue;
                opt.innerText = catValue;
                select.appendChild(opt);
            }
            select.value = catValue;
            document.getElementById('dishPriceBase').value = d.price || '';
            document.getElementById('dishImage').value = d.image || '';
            document.getElementById('dishPreview').src = d.image || "https://placehold.co/100";

            const sizesContainer = document.getElementById('sizesContainer');
            sizesContainer.innerHTML = '';
            if (d.sizes) {
                Object.entries(d.sizes).forEach(([name, price]) => {
                    addSizeField(name, price);
                });
            }

            const addonsContainer = document.getElementById('addonsContainer');
            addonsContainer.innerHTML = '';
            if (d.addons) {
                Object.entries(d.addons).forEach(([name, price]) => {
                    addNewAddonField(name, price);
                });
            }
        }
    }
}

export function hideDishModal() {
    const modal = document.getElementById('dishModal');
    if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }
}

export function updateActiveDishModalCategories() {
    const select = document.getElementById('dishCategory');
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="">Choose Category...</option>';
    
    state.categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.name;
        option.innerText = cat.name;
        if (cat.name === currentVal) option.selected = true;
        select.appendChild(option);
    });
}

export function addSizeField(name = "", price = "") {
    const container = document.getElementById('sizesContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.style = "display:flex; gap:5px; margin-bottom:5px;";
    div.className = "size-row";
    div.innerHTML = `
        <input placeholder="Size (e.g. Small)" value="${name}" class="form-input" style="flex:2; margin-bottom:0">
        <input type="number" placeholder="Price" value="${price}" class="form-input" style="flex:1; margin-bottom:0">
        <button data-action="removeParent" style="background:none; border:none; color:red; cursor:pointer;">×</button>
    `;
    container.appendChild(div);
}

export function addNewAddonField(name = "", price = "") {
    const container = document.getElementById('addonsContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.style = "display:flex; gap:5px; margin-bottom:5px;";
    div.className = "addon-row";
    div.innerHTML = `
        <input placeholder="Addon (e.g. Extra Cheese)" value="${name}" class="form-input" style="flex:2; margin-bottom:0">
        <input type="number" placeholder="Price" value="${price}" class="form-input" style="flex:1; margin-bottom:0">
        <button data-action="removeParent" style="background:none; border:none; color:red; cursor:pointer;">×</button>
    `;
    container.appendChild(div);
}

/**
 * CLEANUP CATALOG LISTENERS
 */
export function cleanupCatalog() {
    console.log("[Catalog] Detaching listeners...");
    Outlet.ref('categories').off();
    Outlet.ref('dishes').off();
}

export const toggleStock = (id, current) => Outlet.ref(`dishes/${id}`).update({ stock: !current });
export const toggleDishAvailable = (id, available) => Outlet.ref(`dishes/${id}`).update({ stock: available });
export const editDish = (id) => showDishModal(id);
export const editCategory = (id) => showToast("Category editing coming soon!", "info");

export function filterMenu(searchTerm) {
    const term = (searchTerm || '').toLowerCase().trim();
    const rows = document.querySelectorAll('#dishesList tr');
    
    rows.forEach(row => {
        if (!term) {
            row.style.display = '';
            return;
        }
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

export function filterCategories(searchTerm) {
    const term = (searchTerm || '').toLowerCase().trim();
    const rows = document.querySelectorAll('#categoryList tr');
    
    rows.forEach(row => {
        if (!term) {
            row.style.display = '';
            return;
        }
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

/**
 * MIGRATION TOOLS
 */
export async function migrateAddonsToCategories() {
    requireAdminReauth(async () => {
        if (!(await showConfirm("CRITICAL: This will move all dish-level addons to their parent categories. Proceed?", "Migration Confirmation"))) return;
        try {
            console.log("Starting add-on migration...");
            const dishesSnap = await Outlet.ref(`dishes`).once('value');
            const categoriesSnap = await Outlet.ref('categories').once('value');

            const dishes = dishesSnap.val() || {};
            const categoriesData = categoriesSnap.val() || {};

            const categoryAddons = {};

            // Note: If dishes structure is scoped by outlet, this loop works. 
            // If it's already scoped by Outlet.ref, dishes is a record of dishes.
            Object.keys(dishes).forEach(key => {
                const dish = dishes[key];
                if (dish && typeof dish === 'object' && dish.category && dish.addons) {
                    if (!categoryAddons[dish.category]) categoryAddons[dish.category] = {};
                    Object.entries(dish.addons).forEach(([name, price]) => {
                        categoryAddons[dish.category][name] = price;
                    });
                }
            });

            const updates = {};
            Object.entries(categoriesData).forEach(([catId, cat]) => {
                if (categoryAddons[cat.name]) {
                    updates[`categories/${catId}/addons`] = categoryAddons[cat.name];
                }
            });

            if (Object.keys(updates).length > 0) {
                await Outlet.ref('').update(updates);
                logAudit("Maintenance", "Migrated Dish Add-ons to Categories", "Global");
                showToast("Success: Add-ons migrated to categories!", "success");
            } else {
                showToast("No add-ons found to migrate.", "info");
            }
        } catch (e) {
            showToast("Migration failed: " + e.message, "error");
        }
    });
}

export async function runImageMigration() {
    requireAdminReauth(async () => {
        if (!(await showConfirm("This will convert images to Base64 text. This process might take a minute. Proceed?", "Image Migration"))) return;

        try {
            console.log("🚀 Starting Image Migration...");
            const updates = {};

            async function convertUrlToDataUri(url) {
                if (!url || !url.includes("firebasestorage.googleapis.com")) return url;
                try {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    return await uploadImage(blob, "temp");
                } catch (err) {
                    console.error("Failed to convert image:", url, err);
                    return url;
                }
            }

            const dishesSnap = await Outlet.ref('dishes').once('value');
            const dishesData = dishesSnap.val();
            if (dishesData) {
                for (const id in dishesData) {
                    if (dishesData[id].image && dishesData[id].image.includes("firebasestorage")) {
                        console.log("Migrating Dish:", dishesData[id].name);
                        const b64 = await convertUrlToDataUri(dishesData[id].image);
                        updates[`dishes/${id}/image`] = b64;
                    }
                }
            }

            const catsSnap = await Outlet.ref('categories').once('value');
            const catsData = catsSnap.val();
            if (catsData) {
                for (const id in catsData) {
                    if (catsData[id].imageUrl && catsData[id].imageUrl.includes("firebasestorage")) {
                        console.log("Migrating Category:", catsData[id].name);
                        const b64 = await convertUrlToDataUri(catsData[id].imageUrl);
                        updates[`categories/${id}/imageUrl`] = b64;
                    }
                }
            }

            if (Object.keys(updates).length > 0) {
                await Outlet.ref('').update(updates);
                logAudit("Maintenance", "Converted legacy images to DataURIs", "Global");
                showToast("Success: All images migrated!", "success");
                location.reload();
            } else {
                showToast("No legacy images found.", "info");
            }
        } catch (err) {
            console.error("Migration Failed:", err);
            showToast("Critical Error: Migration failed.", "error");
        }
    });
}

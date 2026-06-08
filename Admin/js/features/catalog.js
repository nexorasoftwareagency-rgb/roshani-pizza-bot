import { Outlet, uploadImage, deleteImage, ref, get, set, update, remove, push, onValue, child } from '../firebase.js';
import { showToast, escapeHtml, logAudit, getSkeletonRows } from '../utils.js';
import { state } from '../state.js';
import { requireAdminReauth } from '../auth.js';
import { showConfirm, showDeleteConfirm } from '../ui-utils.js';

let _categoriesUnsub = null;
let _dishesUnsub = null;

export function loadCategories() {
    cleanupCatalog();
    // Show skeleton while data loads
    const catContainer = document.getElementById('categoryList');
    if (catContainer) catContainer.innerHTML = getSkeletonRows(5, 1);
    console.log("[Catalog] Loading categories...");
    _categoriesUnsub = onValue(Outlet.ref('categories'), snap => {
        console.log(`[Catalog] Received ${Object.keys(snap.val() || {}).length} categories`);
        state.categories = [];
        const container = document.getElementById('categoryList');
        if (!container) return;
        container.innerHTML = "";

        const cats = [];
        snap.forEach(child => {
            cats.push({ id: child.key, ...child.val() });
        });

        cats.sort((a, b) => (a.order || 0) - (b.order || 0));
        state.categories = cats;

        // Count dishes per category
        const dishCounts = {};
        if (state.dishes) {
            state.dishes.forEach(d => {
                const cat = d.category || 'Uncategorized';
                dishCounts[cat] = (dishCounts[cat] || 0) + 1;
            });
        }

        cats.forEach(cat => {
            const div = document.createElement('div');
            div.className = "premium-row-v4 p-10 flex-row flex-center flex-gap-10 br-12";
            div.style.border = "1px solid rgba(0,0,0,0.02)";

            const addonCount = cat.addons ? Object.keys(cat.addons).length : 0;
            const dishCount = dishCounts[cat.name] || 0;
            const subParts = [`Serial: ${cat.order || 0}`];
            if (dishCount > 0) subParts.push(`${dishCount} dish${dishCount !== 1 ? 'es' : ''}`);
            if (addonCount > 0) subParts.push(`${addonCount} addon${addonCount !== 1 ? 's' : ''}`);

            div.innerHTML = `
                <div class="identity-chip-v4" style="flex: 1;">
                    <img src="${cat.image || 'https://placehold.co/100/orange/white?text=Category'}" class="identity-avatar-v4" style="width:40px; height:40px;">
                    <div class="identity-info-v4">
                        <span class="name" style="font-size:13px;">${escapeHtml(cat.name)}</span>
                        <span class="sub" style="font-size:10px;">${subParts.join(' · ')}</span>
                    </div>
                </div>
                <div class="action-group-v4">
                    <button data-action="editCategory" data-id="${cat.id}" class="btn-action-v4" title="Edit Category">
                         <i data-lucide="pencil" style="width:12px;"></i>
                    </button>
                    <button data-action="deleteCategory" data-id="${cat.id}" class="btn-action-v4 danger" title="Delete Category">
                         <i data-lucide="trash-2" style="width:12px;"></i>
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
        updateActiveDishModalCategories();
    });
}

let isProcessingCategory = false;
export async function addCategory() {
    if (isProcessingCategory) return;
    const nameInput = document.getElementById('newCatName');
    const name = nameInput.value.trim();
    if (!name) return showToast('Enter category name', 'warning');

    // Check for duplicate name
    const existingCats = state.categories || [];
    if (existingCats.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        return showToast('A category with this name already exists', 'warning');
    }

    const fileInput = document.getElementById('catFile');
    const previewImg = document.getElementById('catPreview');
    let imageUrl = "";

    try {
        isProcessingCategory = true;
        const btn = document.getElementById('btnAddCategory');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-sm"></span> Processing...';
        }

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

        const orderInput = document.getElementById('newCatOrder');
        const order = parseInt(orderInput?.value) || 0;

        await push(Outlet.ref('categories'), {
            name: name,
            image: imageUrl,
            order: order,
            outlet: (window.currentOutlet || 'pizza').toLowerCase(),
            addons: Object.keys(addons).length > 0 ? addons : null
        });

        const addonsList = document.getElementById('categoryAddonsList');
        if (addonsList) addonsList.innerHTML = "";

        nameInput.value = "";
        if (orderInput) orderInput.value = "";
        fileInput.value = "";
        if (previewImg) previewImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3C/svg%3E";
        showToast('Category added successfully!', 'success');
        logAudit("Catalog", `Added Category: ${name}`, "Global");
    } catch (err) {
        console.error(err);
        showToast('Operation failed: ' + err.message, 'error');
    } finally {
        isProcessingCategory = false;
        const btn = document.getElementById('btnAddCategory');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '🚀 Add Category';
        }
    }
}

export async function deleteCategory(id) {
    requireAdminReauth(async () => {
        const catSnap = await get(Outlet.ref('categories/' + id));
        const category = catSnap.val();
        if (!category) return showToast("Category not found", "error");

        const catName = category.name;
        if (!(await showDeleteConfirm(`${catName} and ALL associated dishes`, "Delete this category and ALL associated dishes? This cannot be undone."))) return;

        try {
            const catImage = category.image;

            const dishesSnap = await get(Outlet.ref('dishes'));
            const dishes = dishesSnap.val() || {};

            const updates = {};
            updates[`categories/${id}`] = null;

            const imagesToDelete = [];
            if (catImage) imagesToDelete.push(catImage);

            Object.keys(dishes).forEach(dishId => {
                if (dishes[dishId].category === catName) {
                    updates[`dishes/${dishId}`] = null;
                    if (dishes[dishId].image) {
                        imagesToDelete.push(dishes[dishId].image);
                    }
                }
            });

            await update(Outlet.ref(''), updates);

            imagesToDelete.forEach(img => {
                deleteImage(img).catch(err => console.warn("[Catalog] Image deletion failed:", img, err));
            });

            logAudit("Catalog", `Deleted Category and associated dishes: ${catName}`, id);
            showToast(`Category "${catName}" and all its items deleted.`, 'success');
        } catch (err) {
            console.error("[Catalog] Delete failed:", err);
            showToast("Operation failed: " + err.message, "error");
        }
    });
}


/**
 * DISHES (MENU)
 */

export function loadMenu() {
    const grid = document.getElementById("menuGrid");
    if (!grid) return;

    // Only clean up the dishes listener, NOT categories
    if (_dishesUnsub) { _dishesUnsub(); _dishesUnsub = null; }
    // Show skeleton while data loads
    grid.innerHTML = Array.from({ length: 6 }, () =>
        '<div class="skeleton-dish-card" style="animation: skeleton-pulse 1.2s ease-in-out infinite alternate;"></div>'
    ).join('');
    console.log("[Catalog] Loading menu...");
    _dishesUnsub = onValue(Outlet.ref(`dishes`), snap => {
        grid.innerHTML = "";
        const dishes = [];
        snap.forEach(child => {
            dishes.push({ id: child.key, ...child.val() });
        });

        // Sort by order field
        dishes.sort((a, b) => (a.order || 0) - (b.order || 0));
        state.dishes = dishes;

        dishes.forEach(d => {
            const dishId = d.id;
            let sizesHtml = "";
            if (d.sizes) {
                sizesHtml = `
                <div class="dish-pricing-box">
                    <div style="font-size:9px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:5px; letter-spacing:0.5px;">Sizes & Pricing</div>
                    ${Object.entries(d.sizes).map(([size, price]) => `
                        <div class="dish-price-row">
                            <span style="color:var(--text-main)">${escapeHtml(size)}</span>
                            <span class="dish-price-val">₹${escapeHtml(String(price))}</span>
                        </div>
                    `).join("")}
                </div>`;
            } else {
                sizesHtml = `
                <div class="dish-pricing-box flex-between">
                    <span style="font-size:12px; color:var(--text-muted)">Standard</span>
                    <span class="dish-price-val" style="font-size:15px;">₹${escapeHtml(String(d.price || 0))}</span>
                </div>`;
            }

            const card = document.createElement('div');
            card.className = 'dish-card premium-shadow-v4';
            card.innerHTML = `
                <div class="dish-img-container">
                    <img src="${d.image || 'https://placehold.co/150/orange/white?text=Dish'}" alt="${escapeHtml(d.name)}">
                    <div class="stock-badge ${d.stock ? 'available' : 'out'}">
                        ${d.stock ? '✅ Available' : '❌ Out of Stock'}
                    </div>
                    <div class="dish-category-badge">${escapeHtml(d.category || 'General')}</div>
                </div>
                <div class="dish-info">
                    <h4 class="mb-8">${escapeHtml(d.name)}</h4>
                    
                    <div class="dish-pricing-v4 mb-15">
                        ${d.sizes ? Object.entries(d.sizes).map(([size, price]) => `
                            <div class="price-chip-v4">
                                <span class="size">${escapeHtml(size)}</span>
                                <span class="price">₹${escapeHtml(String(price))}</span>
                            </div>
                        `).join("") : `
                            <div class="price-chip-v4 main">
                                <span class="size">Price</span>
                                <span class="price">₹${escapeHtml(String(d.price || 0))}</span>
                            </div>
                        `}
                    </div>

                    <div class="flex-row justify-between flex-center pt-12 border-t-ghost">
                        <div class="action-group-v4">
                            <button class="btn-action-v4" data-action="editDish" data-id="${dishId}" title="Edit Dish">
                                <i data-lucide="edit-3" style="width:14px;"></i>
                            </button>
                            <button class="btn-action-v4 danger" data-action="deleteDish" data-id="${dishId}" title="Delete Dish">
                                <i data-lucide="trash-2" style="width:14px;"></i>
                            </button>
                        </div>
                        <div class="notif-time-badge-premium fs-10" style="padding:4px 8px;">
                            ID: ${dishId.slice(-4).toUpperCase()}
                        </div>
                    </div>
                </div>`;

            if (window.lucide) window.lucide.createIcons({ root: card });
            grid.appendChild(card);
        });

        if (Object.keys(snap.val() || {}).length === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">No dishes yet. Click + Add Dish to get started.</div>';
        }
    });
}

let isProcessingDish = false;
export async function saveDish() {
    if (isProcessingDish) return;
    if (!window.currentOutlet || window.currentOutlet === 'null' || window.currentOutlet === 'undefined') {
        return showToast("Error: Current outlet context is missing. Please refresh or select an outlet first.", "error");
    }

    const name = document.getElementById('dishName').value;
    const cat = document.getElementById('dishCategory').value;
    const basePrice = document.getElementById('dishPriceBase').value;
    let image = document.getElementById('dishImage').value;

    document.querySelectorAll('#dishModal .form-input').forEach(el => el.classList.remove('error', 'valid'));
    if (!name) document.getElementById('dishName').classList.add('error');
    else document.getElementById('dishName').classList.add('valid');
    if (!cat) document.getElementById('dishCategory').classList.add('error');
    else document.getElementById('dishCategory').classList.add('valid');
    if (!name || !cat) return showToast("Please fill Name and Category", "warning");

    const file = document.getElementById('dishFile').files[0];
    const statusLabel = document.getElementById('uploadStatus');
    const saveBtn = document.querySelector('#dishModal .btn-primary');

    try {
        isProcessingDish = true;
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.dataset.originalText = saveBtn.innerText;
            saveBtn.innerHTML = '<span class="spinner-sm"></span> Saving...';
        }
        if (file) {
            if (statusLabel) statusLabel.classList.remove('hidden');
            let oldImageUrl = null;
            if (state.editingDishId) {
                const snap = await get(Outlet.ref(`dishes/${state.editingDishId}`));
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

        const order = parseInt(document.getElementById('dishOrder')?.value) || 0;

        const data = {
            name,
            category: cat,
            price: Number(basePrice) || 0,
            image,
            stock: true,
            order: order,
            sizes: Object.keys(sizes).length > 0 ? sizes : null,
            addons: Object.keys(addons).length > 0 ? addons : null
        };

        const dishesRef = Outlet.ref('dishes');
        if (state.editingDishId) {
            await update(child(dishesRef, state.editingDishId), data);
            logAudit("Catalog", `Updated Dish: ${name}`, state.editingDishId);
        } else {
            const newRef = await push(dishesRef, data);
            logAudit("Catalog", `Added New Dish: ${name}`, newRef.key);
        }

        hideDishModal();
        loadMenu();
    } catch (e) {
        showToast("Error: " + e.message, "error");
        if (statusLabel) statusLabel.classList.add('hidden');
    } finally {
        isProcessingDish = false;
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = saveBtn.dataset.originalText || "Save Dish";
        }
    }
}

export async function deleteDish(dishId) {
    requireAdminReauth(async () => {
        const snap = await get(Outlet.ref(`dishes/${dishId}`));
        const d = snap.val();
        const dishName = d?.name || "Unknown";

        if (!(await showDeleteConfirm(dishName))) return;

        try {
            const img = d?.image;
            if (img) await deleteImage(img);
            await remove(Outlet.ref(`dishes/${dishId}`));
            logAudit("Catalog", `Deleted Dish: ${dishName}`, dishId);
            showToast('Dish deleted', 'success');
        } catch (e) {
            showToast('Delete failed: ' + e.message, 'error');
        }
    });
}


/**
 * MODALS & UI
 */

export async function showDishModal(dishId = null) {
    resetDishValidation();
    state.editingDishId = dishId;
    const modal = document.getElementById('dishModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('active', 'flex');
    }

    if (state.categories.length === 0) loadCategories();
    else updateActiveDishModalCategories();

    const titleEl = document.getElementById('dishModalTitle');
    if (titleEl) titleEl.innerText = dishId ? 'Edit Dish' : 'Add New Dish';

    const statusLabel = document.getElementById('uploadStatus');
    if (statusLabel) statusLabel.classList.add('hidden');

    if (!dishId) {
        document.getElementById('dishName').value = '';
        document.getElementById('dishCategory').value = '';
        document.getElementById('dishPriceBase').value = '';
        document.getElementById('dishImage').value = '';
        document.getElementById('dishPreview').src = "https://placehold.co/100";
        document.getElementById('dishOrder').value = '';
        document.getElementById('sizesContainer').innerHTML = '';
        document.getElementById('addonsContainer').innerHTML = '';
    } else {
        const snap = await get(Outlet.ref(`dishes/${dishId}`));
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
            document.getElementById('dishOrder').value = d.order || '';
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
                    addDishAddonField(name, price);
                });
            }
        }
    }
}

export function hideDishModal() {
    const modal = document.getElementById('dishModal');
    if (modal) {
        modal.classList.remove('active', 'flex');
        modal.classList.add('hidden');
    }
    document.querySelectorAll('#dishModal .form-input').forEach(el => el.classList.remove('error', 'valid'));
}

export function resetDishValidation() {
    document.querySelectorAll('#dishModal .form-input').forEach(el => el.classList.remove('error', 'valid'));
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
    div.className = "size-row flex-row flex-gap-10 mb-8";
    div.innerHTML = `
        <input placeholder="Size (e.g. Small)" value="${escapeHtml(name)}" class="form-input mb-0" style="flex:2">
        <input type="number" placeholder="Price" value="${escapeHtml(String(price))}" class="form-input mb-0" style="flex:1">
        <button data-action="removeParent" class="btn-text-danger" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:18px;">&times;</button>
    `;
    container.appendChild(div);
}

export function addDishAddonField(name = "", price = "") {
    const container = document.getElementById('addonsContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = "addon-row flex-row flex-gap-10 mb-8";
    div.innerHTML = `
        <input placeholder="Addon (e.g. Extra Cheese)" value="${escapeHtml(name)}" class="form-input mb-0" style="flex:2">
        <input type="number" placeholder="Price" value="${escapeHtml(String(price))}" class="form-input mb-0" style="flex:1">
        <button data-action="removeParent" class="btn-text-danger" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:18px;">&times;</button>
    `;
    container.appendChild(div);
}

export function addCategoryAddonField(name = "", price = "") {
    const container = document.getElementById('categoryAddonsList');
    if (!container) return;
    const div = document.createElement('div');
    div.className = "addon-row-small flex-row flex-gap-10 mb-8";
    div.innerHTML = `
        <input placeholder="Addon Name" value="${escapeHtml(name)}" class="form-input mb-0" style="flex:2">
        <input type="number" placeholder="Price" value="${escapeHtml(String(price))}" class="form-input mb-0" style="flex:1">
        <button data-action="removeParent" class="btn-text-danger">&times;</button>
    `;
    container.appendChild(div);
}

/**
 * CLEANUP CATALOG LISTENERS
 */
export function cleanupCatalog() {
    console.log("[Catalog] Detaching listeners...");
    if (_categoriesUnsub) { _categoriesUnsub(); _categoriesUnsub = null; }
    if (_dishesUnsub) { _dishesUnsub(); _dishesUnsub = null; }
}

export const toggleStock = (id, current) => update(Outlet.ref(`dishes/${id}`), { stock: !current });
export const toggleDishAvailable = (id, available) => update(Outlet.ref(`dishes/${id}`), { stock: available });
export const editDish = (id) => showDishModal(id);
export const editCategory = async (id) => {
    const cat = state.categories?.find(c => c.id === id);
    if (!cat) return showToast("Category not found", "error");
    const newName = prompt("Edit category name:", cat.name);
    if (newName === null || newName.trim() === '') return;
    if (newName.trim() === cat.name) return;
    // Check for duplicate name
    const existingCats = state.categories || [];
    if (existingCats.some(c => c.id !== id && c.name.toLowerCase() === newName.trim().toLowerCase())) {
        return showToast('A category with this name already exists', 'warning');
    }
    try {
        await update(Outlet.ref(`categories/${id}`), { name: newName.trim() });
        logAudit("Category Edit", `Renamed "${cat.name}" → "${newName.trim()}"`, "Catalog");
        showToast("Category updated!", "success");
    } catch (e) {
        console.error("[Catalog] Category edit failed:", e);
        showToast("Failed to update category", "error");
    }
};

export function filterMenu(searchTerm) {
    const term = (searchTerm || '').toLowerCase().trim();
    const cards = document.querySelectorAll('#menuGrid .dish-card');
    
    cards.forEach(card => {
        if (!term) {
            card.style.display = '';
            return;
        }
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(term) ? '' : 'none';
    });
}

export function filterCategories(searchTerm) {
    const term = (searchTerm || '').toLowerCase().trim();
    const items = document.querySelectorAll('#categoryList > div');
    
    items.forEach(item => {
        if (!term) {
            item.style.display = '';
            return;
        }
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(term) ? '' : 'none';
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
            const dishesSnap = await get(Outlet.ref(`dishes`));
            const categoriesSnap = await get(Outlet.ref('categories'));

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
                await update(Outlet.ref(''), updates);
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

            const dishesSnap = await get(Outlet.ref('dishes'));
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

            const catsSnap = await get(Outlet.ref('categories'));
            const catsData = catsSnap.val();
            if (catsData) {
                for (const id in catsData) {
                    if (catsData[id].image && catsData[id].image.includes("firebasestorage")) {
                        console.log("Migrating Category:", catsData[id].name);
                        const b64 = await convertUrlToDataUri(catsData[id].image);
                        updates[`categories/${id}/image`] = b64;
                    }
                }
            }

            if (Object.keys(updates).length > 0) {
                await update(Outlet.ref(''), updates);
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

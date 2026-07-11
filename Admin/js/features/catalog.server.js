import { Outlet, uploadImage, deleteImage, ref, get, set, update, remove, push, onValue, child } from '../firebase.js';
import { showToast, escapeHtml, logAudit, getSkeletonRows } from '../utils.js';
import { state } from '../state.js';
import { requireAdminReauth } from '../auth.js';
import { showConfirm, showDeleteConfirm } from '../ui-utils.js';
import { loadLucide } from '../ui.js';

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
                    <button data-action="editCategory" data-id="${cat.id}" class="btn-action-v4" title="Edit Category" aria-label="Edit Category">
                         <i data-lucide="pencil" style="width:12px;"></i>
                    </button>
                    <button data-action="deleteCategory" data-id="${cat.id}" class="btn-action-v4 danger" title="Delete Category" aria-label="Delete Category">
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

            await Outlet.multiUpdate(updates);

            imagesToDelete.forEach(img => {
                deleteImage(img).catch(err => console.warn("[Catalog] Image deletion failed:", img, err));
            });

            logAudit("Catalog", `Deleted Category and associated dishes: ${catName}`, id);
            showToast(`Category "${catName}" and all its items deleted.`, 'success');
        } catch (err) {
            console.error("[Catalog] Delete failed:", err);
            showToast("Operation failed: " + err.message, "error");
        }
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
    _dishesUnsub = onValue(Outlet.ref(`dishes`), async snap => {
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
                            <button class="btn-action-v4" data-action="editDish" data-id="${dishId}" title="Edit Dish" aria-label="Edit Dish">
                                <i data-lucide="edit-3" style="width:14px;"></i>
                            </button>
                            <button class="btn-action-v4 danger" data-action="deleteDish" data-id="${dishId}" title="Delete Dish" aria-label="Delete Dish">
                                <i data-lucide="trash-2" style="width:14px;"></i>
                            </button>
                        </div>
                        <div class="notif-time-badge-premium fs-10" style="padding:4px 8px;">
                            ID: ${dishId.slice(-4).toUpperCase()}
                        </div>
                    </div>
                </div>`;

            await loadLucide();
            window.lucide.createIcons({ root: card });
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
     
/**

 * PIZZA ERP | ADMIN CORE APPLICATION

 * Strict CSP & Secure DOM Implementation

 */



window.haptic = (val) => {
    if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(val);
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;



document.addEventListener('DOMContentLoaded', () => {



    // 1. Static Event Binding

    const setupStaticListeners = () => {

        // Global Image Error Handler (CSP Compliant)

        document.addEventListener('error', (e) => {

            if (e.target.tagName === 'IMG') {

                e.target.src = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'150\' height=\'150\' viewBox=\'0 0 150 150\'%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'%23eee\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-family=\'sans-serif\' font-size=\'12\' fill=\'%23999\'%3ENo Image%3C/text%3E%3C/svg%3E';

            }

        }, true);



        // Login Form

        // Login Form handling is now centralized in doLogin and form submit



        // Helper: Bind click to other element

        const bindClickTo = (btnId, targetId) => {

            const btn = document.getElementById(btnId);

            if (btn) btn.addEventListener('click', () => {

                const target = document.getElementById(targetId);

                if (target) target.click();

            });

        };

        // Helper: Bind function to click

        const bindFn = (id, fnName) => {

            const el = document.getElementById(id);

            if (el) el.addEventListener('click', () => {

                if (typeof window[fnName] === 'function') window[fnName]();

            });

        };


        // Helper: Bind function to click with parameter
        const bindFnWithParam = (id, fnName, param) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', () => {
                if (typeof window[fnName] === 'function') window[fnName](param);
            });
        };
        // Modal Controls

        document.querySelectorAll('.close-btn, .cancel-dish-btn, .cancel-cat-btn').forEach(btn => {

            btn.addEventListener('click', (e) => {

                const modal = e.target.closest('.modal');

                if (modal) {

                    modal.classList.add('hidden');

                    modal.classList.remove('active');

                    modal.classList.remove('flex');

                }

            });

        });



        // Menu & Categories

        bindFn('btnShowDishModal', 'showDishModal');

        bindFn('btnMigrateDishAddons', 'migrateAddonsToCategories');

        bindFn('btnAddCatAddonField', 'addNewCategoryAddonField');

        bindFn('btnAddCategory', 'addCategory');

        bindClickTo('btnChangeCatPhoto', 'catFile');

        const catFile = document.getElementById('catFile');

        if (catFile) catFile.addEventListener('change', (e) => {

            if (window.previewImage) window.previewImage(e.target, 'catPreview');

        });



        // Riders

        bindFn('btnShowRiderModal', 'showRiderModal');

        bindClickTo('btnUploadRiderPhoto', 'riderPhotoInput');

        const riderPhotoInput = document.getElementById('riderPhotoInput');

        if (riderPhotoInput) riderPhotoInput.addEventListener('change', (e) => {

            if (window.previewImage) window.previewImage(e.target, 'riderProfilePreview');

        });



        // Rider Search

        const riderSearchInput = document.getElementById('riderSearchInput');

        if (riderSearchInput) {

            riderSearchInput.addEventListener('input', (e) => {

                if (window.renderRiders) window.renderRiders(e.target.value);

            });

        }



        bindClickTo('btnUploadAadhar', 'aadharPhotoInput');

        const aadharPhotoInput = document.getElementById('aadharPhotoInput');

        if (aadharPhotoInput) aadharPhotoInput.addEventListener('change', (e) => {

            if (window.previewImage) window.previewImage(e.target, 'aadharPreview');

        });



        // Notifications & Logs

        bindFn('btnClearAllNotif', 'clearAllNotifications');

        bindFn('btnClearNotificationsBottom', 'clearNotifications');

        bindFn('btnClearLostSales', 'clearLostSales');

        bindFn('btnEnableNotif', 'requestNotificationPermission');



        // Settings

        bindFn('btnSaveSettings', 'saveStoreSettings');

        bindFn('btnQuickToggleOutlet', 'quickUpdateOutletStatus');



        // POS (Walk-in)

        bindFn('btnShowPOSSelection', 'showPOSSelectionModal');

        bindFn('btnPosClear', 'clearPos');

        bindFn('btnPosCheckout', 'posCheckout');

        bindFn('btnPosPrintLast', 'reprintLastPosReceipt');

        const btnPosQtyDec = document.getElementById('btnPosQtyDec');

        if (btnPosQtyDec) btnPosQtyDec.addEventListener('click', () => {

            if (window.adjustPosQty) window.adjustPosQty(-1);

        });

        const btnPosQtyInc = document.getElementById('btnPosQtyInc');

        if (btnPosQtyInc) btnPosQtyInc.addEventListener('click', () => {

            if (window.adjustPosQty) window.adjustPosQty(1);

        });



        // Dish Modal

        bindClickTo('btnUpdateDishPhoto', 'dishFile');

        const dishFile = document.getElementById('dishFile');

        if (dishFile) dishFile.addEventListener('change', (e) => {

            if (window.previewImage) window.previewImage(e.target, 'dishPreview');

        });



        const saveDishBtn = document.getElementById('saveDishBtn');

        if (saveDishBtn) saveDishBtn.addEventListener('click', () => {

            if (window.saveDish) window.saveDish();

        });



        // Toggle Password Visibility

        const setupPassToggle = (btnId, inputId) => {

            const btn = document.getElementById(btnId);

            const input = document.getElementById(inputId);

            if (btn && input) {

                btn.addEventListener('click', () => {

                    const isPass = input.type === 'password';

                    input.type = isPass ? 'text' : 'password';

                    btn.textContent = isPass ? '\uD83D\uDD12' : '\uD83D\uDC41\uFE0F';

                });

            }

        };

        setupPassToggle('btnToggleWifiPass', 'settingWifiPass');

        setupPassToggle('btnToggleRiderPass', 'riderPass');



        // Reports

        const btnGenerateReport = document.getElementById('btnGenerateReport');

        if (btnGenerateReport) btnGenerateReport.addEventListener('click', () => {

            if (window.generateReport) window.generateReport();

        });



        bindFn('btnDownloadExcel', 'downloadExcel');

        bindFn('btnDownloadPDF', 'downloadPDF');



        // --- 2. Dynamic Event Delegation (CSP Compliant) ---

        // Using a single listener for all dynamically rendered elements

        document.addEventListener('click', (e) => {

            const el = e.target.closest('[data-action], [data-tab]');

            if (!el) return;



            const action = el.getAttribute('data-action');

            const tab = el.getAttribute('data-tab');



            // Handle Tab Switching

            if (tab) {

                if (window.switchTab) window.switchTab(tab);

                return;

            }



            if (!action) return;

            const id = el.getAttribute('data-id');

            const val = el.getAttribute('data-val');

            const name = el.getAttribute('data-name');

            const price = el.getAttribute('data-price');



            // Handle actions

            switch (action) {

                case 'updateStatusFromDrawer': if (window.updateStatusFromDrawer) window.updateStatusFromDrawer(id, val); break;

                case 'closeOrderDrawer': if (window.closeOrderDrawer) window.closeOrderDrawer(); break;

                case 'chatOnWhatsapp': if (window.chatOnWhatsapp) window.chatOnWhatsapp(id); break;

                case 'printReceiptById': if (window.printReceiptById) window.printReceiptById(id); break;

                case 'updateStatus': if (window.updateStatus) window.updateStatus(id, val); break;

                case 'assignRider': if (window.assignRider) window.assignRider(id, val); break;

                case 'openOrderDrawer': if (window.openOrderDrawer) window.openOrderDrawer(id); break;

                case 'markAsPaid': if (window.markAsPaid) window.markAsPaid(id); break;

                case 'deleteCategory': if (window.deleteCategory) window.deleteCategory(id); break;

                case 'removeParent': el.parentElement.remove(); break;

                case 'removeGrandparent': el.parentElement.parentElement.remove(); break;

                case 'editRider': if (window.editRider) window.editRider(id); break;

                case 'resetRiderPassword': if (window.resetRiderPassword) window.resetRiderPassword(el.getAttribute('data-email')); break;

                case 'deleteRider': if (window.deleteRider) window.deleteRider(id); break;

                case 'saveSettings': if (window.saveSettings) window.saveSettings(); break;

                case 'saveDeliveredOrder': if (window.saveDeliveredOrder) window.saveDeliveredOrder(id, val); break;

                case 'adjustCardQty': if (window.adjustCardQty) window.adjustCardQty(id, parseInt(val)); break;

                case 'addToWalkinCartFromCard': if (window.addToWalkinCartFromCard) window.addToWalkinCartFromCard(id); break;

                case 'showAddonView': if (window.showAddonView) window.showAddonView(id); break;

                case 'hideAddonView': if (window.hideAddonView) window.hideAddonView(); break;

                case 'openCartAddonPicker': if (window.openCartAddonPicker) window.openCartAddonPicker(id); break;

                case 'walkinQtyChange': if (window.walkinQtyChange) window.walkinQtyChange(id, parseInt(val)); break;

                case 'walkinRemoveItem': if (window.walkinRemoveItem) window.walkinRemoveItem(id); break;

                case 'filterWalkinByCategory': if (window.filterWalkinByCategory) window.filterWalkinByCategory(val, el); break;

                case 'removeElement': {

                    const targetId = el.getAttribute('data-target-id');

                    const targetEl = document.getElementById(targetId);

                    if (targetEl) targetEl.remove();

                    break;

                }

                case 'selectPOSSize': if (window.selectPOSSize) window.selectPOSSize(name, parseFloat(price), el); break;

                case 'triggerClick': const target = document.getElementById(val); if (target) target.click(); break;

                case 'markDelivered': if (window.markDelivered) window.markDelivered(id); break;

                case 'editDish': if (window.editDish) window.editDish(id); break;

                case 'deleteDish': if (window.deleteDish) window.deleteDish(id); break;

                case 'editCategory': if (window.editCategory) window.editCategory(id); break;

                case 'showRiderModal':

                case 'showAddRiderModal': if (window.showRiderModal) window.showRiderModal(); break;

                case 'closeModal': {

                    const modal = el.closest('.modal');

                    if (modal) {

                        modal.classList.add('hidden');

                        modal.classList.remove('active');

                        modal.classList.remove('flex');

                    }

                    break;

                }

                case 'toggleNotificationSheet': if (window.toggleNotificationSheet) window.toggleNotificationSheet(); break;

                case 'toggleSidebar': if (window.toggleSidebar) window.toggleSidebar(); break;

                case 'openOutletInNewTab': if (window.openOutletInNewTab) window.openOutletInNewTab(); break;

                case 'userLogout': if (window.userLogout) window.userLogout(); break;

                case 'installPWA': if (window.installPWA) window.installPWA(); break;

                case 'removeRow': el.closest('tr').remove(); break;

                case 'addFeeSlab': if (window.addFeeSlab) window.addFeeSlab(); break;

                case 'migrateAddons': if (window.migrateAddonsToCategories) window.migrateAddonsToCategories(); break;

                case 'runImageMigration': if (window.runImageMigration) window.runImageMigration(); break;

                case 'clearWalkinCart': if (window.clearWalkinCart) window.clearWalkinCart(); break;

                case 'submitWalkinSale': if (window.submitWalkinSale) window.submitWalkinSale(); break;

                case 'applyWalkinDiscount': {

                    const amt = el.getAttribute('data-amount');

                    const pct = el.getAttribute('data-pct');

                    if (amt && window.setDiscount) window.setDiscount(parseFloat(amt));

                    else if (pct && window.setDiscountPct) window.setDiscountPct(parseFloat(pct));

                    break;

                }

                case 'selectWalkinPayment': {

                    const method = el.getAttribute('data-method');

                    if (window.selectWalkinPayment) window.selectWalkinPayment(method, el);

                    break;

                }

                case 'addCategory': if (window.addCategory) window.addCategory(); break;

                case 'saveRiderAccount': if (window.saveRiderAccount) window.saveRiderAccount(); break;

            }

        });



        document.addEventListener('change', (e) => {

            const el = e.target;

            const action = el.getAttribute('data-action');

            if (!action) return;



            const id = el.getAttribute('data-id');

            const val = el.value;



            switch (action) {

                case 'updateStatus': if (window.updateStatus) window.updateStatus(id, val); break;

                case 'assignRider': if (window.assignRider) window.assignRider(id, val); break;

                case 'toggleDish': if (window.toggleDishAvailable) window.toggleDishAvailable(id, el.checked); break;

                case 'togglePOSAddon':

                    if (window.togglePOSAddon) window.togglePOSAddon(el.getAttribute('data-name'), parseFloat(el.getAttribute('data-price')), el);

                    break;

                case 'previewImage':

                    if (window.previewImage) window.previewImage(el, el.getAttribute('data-preview-id'));

                    break;

                case 'switchOutlet': if (window.switchOutlet) window.switchOutlet(val); break;

            }

        });

    };



    setupStaticListeners();



    // Initial Icons

    if (typeof lucide !== 'undefined') lucide.createIcons();

});

let deferredPrompt;



// --- GLOBAL TOAST SYSTEM ---

window.showToast = (message, type = 'success') => {

    const container = document.getElementById('alertContainer');

    if (!container) return;

    const toast = document.createElement('div');

    toast.className = `toast toast-${type}`;

    toast.innerText = message;

    container.appendChild(toast);

    setTimeout(() => {

        toast.style.opacity = '0';

        toast.style.transform = 'translateX(100%)';

        toast.style.transition = 'all 0.3s ease';

        setTimeout(() => toast.remove(), 300);

    }, 4000);

};





// --- CUSTOM CONFIRMATION MODAL ---

window.showConfirm = (message, title = "Confirm Action") => {

    return new Promise((resolve) => {

        const overlay = document.createElement('div');

        overlay.id = 'confirmOverlay';

        overlay.style.cssText = `

            position: fixed; inset: 0; z-index: 99999;

            background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);

            display: flex; align-items: center; justify-content: center;

        `;



        overlay.innerHTML = `
            <div style="background: #1c1c1c; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px;
                        padding: 32px; max-width: 360px; width: 90%; text-align: center;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
                <h3 id="confirmTitle" style="color: #fff; margin: 0 0 12px; font-size: 18px; font-weight: 700;"></h3>
                <p id="confirmMessage" style="color: #aaa; font-size: 14px; margin: 0 0 24px;"></p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="confirmNo" style="flex: 1; padding: 12px; border-radius: 12px; border: 1px solid #333; background: transparent; color: #aaa; cursor: pointer; font-size: 14px; font-weight: 600;">Cancel</button>
                    <button id="confirmYes" style="flex: 1; padding: 12px; border-radius: 12px; border: none; background: var(--action-green); color: #fff; cursor: pointer; font-size: 14px; font-weight: 700;">Confirm</button>
                </div>
            </div>`;

        overlay.querySelector('#confirmTitle').textContent = title;
        overlay.querySelector('#confirmMessage').textContent = message;



        document.body.appendChild(overlay);



        const cleanup = (val) => {

            overlay.remove();

            resolve(val);

        };



        overlay.querySelector('#confirmNo').onclick = () => cleanup(false);

        overlay.querySelector('#confirmYes').onclick = () => cleanup(true);

        overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };

    });

};





// --- REFRESH CIRCUIT BREAKER ---

(function () {

    const REFRESH_LIMIT = 5;

    const TIME_WINDOW = 10000; // 10 seconds

    const now = Date.now();

    let refreshData = JSON.parse(sessionStorage.getItem('erp_refresh_log') || '{"count": 0, "first": 0}');



    if (now - refreshData.first > TIME_WINDOW) {

        refreshData = { count: 1, first: now };

    } else {

        refreshData.count++;

    }



    sessionStorage.setItem('erp_refresh_log', JSON.stringify(refreshData));



    if (refreshData.count > REFRESH_LIMIT) {

        console.error("CRITICAL: Infinite redirect loop detected. Stopping and purging cache.");

        sessionStorage.setItem('erp_refresh_log', '{"count": 0, "first": 0}');

        window.showToast("System detected a refresh loop. Please try clearing your browser cache or contact support if the issue persists.", "error");

        throw new Error("Refresh Loop Halted");

    }

})();



// PWA Install Logic

window.addEventListener('beforeinstallprompt', (e) => {

    e.preventDefault();

    deferredPrompt = e;

    const downloadBtn = document.getElementById('menu-download');

    if (downloadBtn) downloadBtn.classList.remove('hidden');

});



window.installPWA = async () => {

    // Check if searching for a prompt or if already in standalone mode

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;



    if (isStandalone) {

        console.log("[PWA] Already running in standalone mode.");

        return;

    }



    if (!deferredPrompt) {

        console.log("[PWA] deferredPrompt is null. Installation may not be supported or was recently accepted.");

        // Only alert if we're on mobile/desktop and installation is actually missing

        if (!isStandalone) {

            window.showToast("To install this app, look for 'Add to Home Screen' in your browser menu.", "info");

        }

        return;

    }



    deferredPrompt.prompt();

    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {

        const downloadBtn = document.getElementById('menu-download');

        if (downloadBtn) downloadBtn.classList.add('hidden');

    }

    deferredPrompt = null;

};



window.addEventListener('appinstalled', () => {

    const downloadBtn = document.getElementById('menu-download');

    if (downloadBtn) downloadBtn.classList.add('hidden');

    deferredPrompt = null;

});



// Service Worker Registration

if ('serviceWorker' in navigator) {

    window.addEventListener('load', () => {

        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW failed', err));



        // Hide download button if already installed

        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

        if (isStandalone) {

            const downloadBtn = document.getElementById('menu-download');

            if (downloadBtn) downloadBtn.classList.add('hidden');

        }



        // Initialize Notification Permission UI

        if (typeof updateNotificationSettingsUI === 'function') {

            updateNotificationSettingsUI();

        }

    });

}



// =============================

// FIREBASE INITIALIZATION

// =============================

let db, auth;



if (!window.firebaseConfig) {

    console.error("[Firebase] window.firebaseConfig is not defined. Firebase services cannot be initialized. Check firebase-config.js.");

    throw new Error("Firebase configuration is missing. Cannot initialize app.");

}



if (!firebase.apps.length) {

    firebase.initializeApp(window.firebaseConfig);

}



db = firebase.database();

auth = firebase.auth();



/**

 * =============================================

 * OUTLET SEPARATION HELPER

 * =============================================

 * Handles path resolution for multi-outlet data isolation.

 * Automatically prefixes outlet-specific nodes (orders, riders, etc.)

 * but keeps global nodes (admins, settings) at the root.

 */

const Outlet = {

    get current() {

        return (window.currentOutlet || 'pizza').toLowerCase();

    },

    ref(path) {

        if (!path) return db.ref();



        // Shared paths that stay at root level (admins, shared riders)

        const shared = ['admins', 'riders', 'riderStats', 'botStatus', 'migrationStatus', 'bot', 'logs'];

        const rootPath = path.split('/')[0];



        if (shared.includes(rootPath)) return db.ref(path);



        // Outlet-specific paths (orders, categories, settings, etc.)

        return db.ref(`${this.current}/${path}`);

    }

};







// =============================

// FILE UPLOAD UTILITY (Base64)

// =============================

async function uploadImage(fileOrBlob, path) {

    if (!fileOrBlob) return null;

    console.log(`[Database Store] Converting ${path || 'image'} to text-based Base64...`);



    // Compression & Base64 Conversion

    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.readAsDataURL(fileOrBlob);

        reader.onload = (event) => {

            const img = new Image();

            img.src = event.target.result;

            img.onload = () => {

                const canvas = document.createElement('canvas');

                const MAX_WIDTH = 600; // Standardized width for quality/storage balance

                let width = img.width;

                let height = img.height;



                if (width > MAX_WIDTH) {

                    height = (MAX_WIDTH / width) * height;

                    width = MAX_WIDTH;

                }



                canvas.width = width;

                canvas.height = height;

                const ctx = canvas.getContext('2d');

                ctx.drawImage(img, 0, 0, width, height);



                // Return compressed DataURI (0.6 quality for optimal DB footprint)

                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);

                console.log(`[Database Store] Image converted. Size: ${(dataUrl.length / 1024).toFixed(1)} KB`);

                resolve(dataUrl);

            };

            img.onerror = (err) => reject(new Error("Image processing failed"));

        };

        reader.onerror = (err) => reject(new Error("File reading failed"));

    });

}



async function deleteImage(url) {

    // If it's a Base64 string, it's overwritten/deleted when the DB entry is changed.

    // If it's an old Firebase Storage URL, we log it but don't attempt delete (Storage is off).

    if (!url) return;

    if (url.includes("firebasestorage.googleapis.com")) {

        console.log("Old storage image skipped (Storage disabled):", url);

    }

}



window.AdminApp = window.AdminApp || {};



// =============================

// GLOBAL STATE & LOOKUPS

// =============================

let adminData = null;

const ordersMap = new Map(); // For XSS-safe access to order objects in UI

let lastOrdersSnap = null;   // Phase 3: Cache for background performance

let lastDishesSnap = null;   // Phase 3: Cache for menu performance



// SECONDARY AUTH FOR RIDER CREATION (Avoids logging out admin)

let secondaryAuth;

let secondaryAuthAvailable = false;

function initSecondaryAuth() {

    try {

        if (!window.firebaseConfig) {

            console.error("Firebase Config not found! Rider creation will be disabled.");

            secondaryAuthAvailable = false;

            return;

        }

        // Use a unique name for the secondary app to avoid collisions

        if (firebase.apps.some(app => app.name === "secondary_auth")) {

            secondaryAuth = firebase.app("secondary_auth").auth();

        } else {

            const secondaryApp = firebase.initializeApp(window.firebaseConfig, "secondary_auth");

            secondaryAuth = secondaryApp.auth();

        }



        // CRITICAL: Set persistence to NONE so it doesn't affect the Admin's login session

        if (typeof firebase !== 'undefined' && firebase.auth) {

            secondaryAuth.setPersistence(firebase.auth.Auth.Persistence.NONE);

        }

        secondaryAuthAvailable = true;

        console.log("Secondary Auth initialized successfully.");

    } catch (e) {

        console.error("Secondary Auth Init Error:", e);

        secondaryAuthAvailable = false;

    }

}

initSecondaryAuth();



let editingDishId = null;

let categories = [];

let allWalkinDishes = [];

let activeWalkinCategory = 'All';

let walkinCart = {};

let walkinPayMethod = 'Cash';

let isEditRiderMode = false;

let currentEditingRiderId = null;



window.showDishModal = async (dishId = null) => {

    editingDishId = dishId;

    const modal = document.getElementById('dishModal');

    if (modal) {

        modal.classList.remove('hidden');

        modal.classList.add('flex');

    }



    // Always refresh category dropdown when modal opens

    if (categories.length === 0) loadCategories();

    else updateActiveDishModalCategories();



    document.getElementById('modalTitle').innerText = dishId ? 'Edit Dish' : 'Add New Dish';

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

                    window.addSizeField(name, price);

                });

            }



            const addonsContainer = document.getElementById('addonsContainer');

            addonsContainer.innerHTML = '';

            if (d.addons) {

                Object.entries(d.addons).forEach(([name, price]) => {

                    window.addNewAddonField(name, price);

                });

            }

        }

    }

};



function updateActiveDishModalCategories() {

    const select = document.getElementById('dishCategory');

    if (!select) return;



    // Preserve currently selected value if any

    const currentVal = select.value;



    select.innerHTML = '<option value="">Choose Category...</option>';

    categories.forEach(cat => {

        const option = document.createElement('option');

        option.value = cat.name; // Store NAME so dishes display correctly

        option.innerText = cat.name;

        if (cat.name === currentVal) {

            option.selected = true;

        }

        select.appendChild(option);

    });

}



function previewImage(input, previewId) {

    if (input.files && input.files[0]) {

        var reader = new FileReader();

        reader.onload = function (e) {

            document.getElementById(previewId).src = e.target.result;

        }

        reader.readAsDataURL(input.files[0]);

    }

}

// Sidebar Helpers

window.toggleSidebar = () => {

    console.log("Toggle Sidebar Clicked");

    const sidebar = document.getElementById('sidebarNav');

    const overlay = document.getElementById('sidebarOverlay');

    if (!sidebar) {

        console.error("Sidebar Nav not found!");

        return;

    }



    window.haptic(15);



    if (window.innerWidth > 1024) {

        console.log("Desktop Toggle");

        document.body.classList.toggle('sidebar-collapsed');

    } else {

        const isActive = sidebar.classList.toggle('active');

        console.log("Mobile Toggle - Active:", isActive);

        if (overlay) overlay.classList.toggle('active', isActive);

    }

};



// Update switchTab to handle mobile sidebar auto-close

// Updated switchTab logic consolidated below at line 686





/**

 * =============================================

 * 1.5 PREMIUM MOBILE UX (Drawer & Haptics)

 * =============================================

 */

window.openOrderDrawer = (id) => {

    const o = ordersMap.get(id);

    if (!o) return;



    window.haptic(15); // Light tap



    const drawer = document.getElementById('orderDrawer');

    const overlay = document.getElementById('orderDrawerOverlay');

    const body = document.getElementById('orderDrawerBody');



    if (!drawer || !overlay || !body) return;



    const safeOrderId = escapeHtml(o.orderId || id.slice(-6));

    const safeTotal = escapeHtml(String(o.total || 0));

    const safeStatus = escapeHtml(o.status || 'Placed');



    const itemsHtml = (o.items || []).map(item => `

        <div class="flex-row flex-between mb-12 p-8-15 border-b-ghost">

            <div>

                <div class="font-bold text-main">${escapeHtml(item.name)}</div>

                <div class="text-muted-small">${escapeHtml(item.size)} x ${item.qty || 1}</div>

            </div>

            <div class="font-black text-primary">₹${item.price * (item.qty || 1)}</div>

        </div>

    `).join('');



    body.innerHTML = `

        <div style="text-align:center; margin-bottom:24px;">

            <div style="font-size:12px; font-weight:900; color:var(--primary); letter-spacing:1px; margin-bottom:4px;">ORDER DETAILS</div>

            <h2 style="font-size:24px; font-weight:900; color:var(--text-dark);">#${safeOrderId.toUpperCase()}</h2>

        </div>



        <div style="background:var(--bg-secondary); border-radius:20px; padding:20px; margin-bottom:24px;">

            ${itemsHtml}

            <div style="display:flex; justify-content:space-between; margin-top:10px; padding-top:12px; border-top:2px solid white;">

                <span style="font-weight:800; font-size:14px;">TOTAL AMOUNT</span>

                <span style="font-weight:900; font-size:20px; color:var(--primary);">₹${safeTotal}</span>

            </div>

        </div>



        ${o.customerNote ? `

            <div style="background:rgba(255,207,0,0.05); border:1px dashed var(--primary); border-radius:15px; padding:15px; margin-bottom:24px;">

            <div style="font-size:10px; font-weight:900; color:var(--primary); letter-spacing:1px; margin-bottom:6px; text-transform:uppercase;">Customer Note</div>

            <div style="font-size:14px; line-height:1.5; color:var(--text-dark); font-weight:500;">${escapeHtml(o.customerNote)}</div>

        </div>

        ` : ''}



        <div style="display:flex; flex-direction:column; gap:12px;">

            <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-align:center;">QUICK ACTIONS</div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">

                <button class="btn-primary" style="background:#10b981; border:none;" data-action="updateStatusFromDrawer" data-id="${id}" data-val="Confirmed">CONFIRM</button>

                <button class="btn-primary" style="background:#3b82f6; border:none;" data-action="updateStatusFromDrawer" data-id="${id}" data-val="Preparing">PREPARE</button>

                <button class="btn-primary" style="background:#f59e0b; border:none;" data-action="updateStatusFromDrawer" data-id="${id}" data-val="Cooked">READY</button>

                <button class="btn-primary" style="background:#ef4444; border:none;" data-action="updateStatusFromDrawer" data-id="${id}" data-val="Out for Delivery">DISPATCH</button>

            </div>

            <button class="btn-primary btn-full" style="margin-top:10px; background:#161616;" data-action="closeOrderDrawer">CLOSE DETAILS</button>

        </div>

    `;



    drawer.classList.add('active');

    overlay.classList.add('active');

};



window.closeOrderDrawer = () => {

    const drawer = document.getElementById('orderDrawer');

    const overlay = document.getElementById('orderDrawerOverlay');

    if (drawer) drawer.classList.remove('active');

    if (overlay) overlay.classList.remove('active');

};



window.updateStatusFromDrawer = async (id, status) => {

    window.haptic(30); // Confirmation buzz

    await updateStatus(id, status);

    window.closeOrderDrawer();

};



// Helpers

function formatDate(ts) {

    if (!ts) return "N/A";

    const d = new Date(ts);

    if (isNaN(d.getTime())) return ts; // Fallback for raw strings

    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ", " + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

}



/**

 * Generates a unique, daily sequenced Order ID (YYYYMMDD-####)

 * Shares the same sequence with the WhatsApp Bot via Firebase metadata.

 */

async function generateNextOrderId() {

    const today = new Date();

    const y = today.getFullYear();

    const m = (today.getMonth() + 1).toString().padStart(2, '0');

    const d = today.getDate().toString().padStart(2, '0');

    const dateStr = `${y}${m}${d}`;



    const seqRef = Outlet.ref(`metadata/orderSequence/${dateStr}`);

    const result = await seqRef.transaction((current) => (current || 0) + 1);



    const seqNum = result.snapshot.val() || 1;

    return `${dateStr}-${seqNum.toString().padStart(4, '0')}`;

}



const authOverlay = document.getElementById("authOverlay");

const adminEmail = document.getElementById("adminEmail");

const adminPassword = document.getElementById("adminPassword");

const userEmailDisplay = document.getElementById("userEmailDisplay");

const ordersTable = document.getElementById("ordersTable");

const liveOrdersTable = document.getElementById("liveOrdersTable");

const paymentsTable = document.getElementById("paymentsTable");

const authError = document.getElementById("authError");





let ridersList = [];

let firstLoad = true;



// Named callbacks stored for safe detachment (prevents memory leaks on logout/re-login)

let _ordersValueCb = null;

let _ordersChildCb = null;

let _ordersChangedCb = null;



/**

 * Standardizes Firebase Auth error messages.

 */

function standardizeAuthError(error) {

    if (!error || !error.code) return "An unexpected error occurred. Please try again.";



    switch (error.code) {

        case 'auth/invalid-email':

            return "The email address is not valid.";

        case 'auth/user-disabled':

            return "This account has been disabled.";

        case 'auth/user-not-found':

        case 'auth/wrong-password':

            return "Incorrect email or password.";

        case 'auth/too-many-requests':

            return "Too many failed attempts. Security lock active. Please wait 15-30 minutes.";

        case 'auth/quota-exceeded':

            return "Login Quota Exceeded (Spark Plan limit). Please wait 60 minutes or contact Firebase support.";

        case 'auth/email-already-in-use':

            return "This email address is already in use.";

        case 'auth/operation-not-allowed':

            return "Operation not allowed. Contact support.";

        case 'auth/weak-password':

            return "The password is too weak.";

        case 'auth/network-request-failed':

            return "Network error. Please check your internet connection or VPN settings.";

        default:

            return error.message || "Authentication failed.";

    }

}



// =============================

// AUTHENTICATION

// =============================

let loginInProgress = false;



function doLogin() {

    console.log("[Auth] Login attempt initiated for:", document.getElementById('adminEmail')?.value);
    if (loginInProgress) return;
    window.haptic(10);

    const emailEl = document.getElementById('adminEmail');
    const passEl = document.getElementById('adminPassword');
    const errorEl = document.getElementById('authError');
    const loginBtn = document.getElementById('loginBtn');



    if (!emailEl || !passEl) return;



    const email = emailEl.value.trim();

    const pass = passEl.value;



    if (!email || !pass) {

        if (errorEl) errorEl.innerText = "Please enter email and password.";

        return;

    }



    loginInProgress = true;

    if (loginBtn) {

        loginBtn.disabled = true;

        loginBtn.innerText = "Signing in...";

    }

    if (errorEl) errorEl.innerText = "Authenticating...";



    console.log("Attempting login for:", email);



    auth.signInWithEmailAndPassword(email, pass)

        .then(userCredential => {

            console.log("Login successful:", userCredential.user.email);

            // Form is hidden automatically by onAuthStateChanged

        })

        .catch(e => {

            console.error("Full Auth Error:", e);

            if (errorEl) errorEl.innerText = standardizeAuthError(e);

            loginInProgress = false;

            if (loginBtn) {

                loginBtn.disabled = false;

                loginBtn.innerText = "Sign In";

            }

        });

}



// Global hook

window.adminLogin = doLogin;



// One source of truth for login triggers

document.addEventListener('DOMContentLoaded', () => {

    const loginForm = document.getElementById('loginForm');

    if (loginForm) {

        loginForm.onsubmit = (e) => {

            e.preventDefault();

            doLogin();

        };

    }

});



window.userLogout = () => {

    // Force UI reset immediately using classes

    const overlay = document.getElementById("authOverlay");

    const layout = document.querySelector(".layout");



    if (overlay) {

        overlay.classList.remove('hidden');

    }

    if (layout) {

        layout.classList.add('hidden');

    }



    // Clear session-specific branding and outlet selections

    sessionStorage.removeItem('adminSelectedOutlet');

    sessionStorage.removeItem('admin_brand');



    auth.signOut().catch(err => console.error("Logout Error:", err));

};



auth.onAuthStateChanged(async user => {
    console.log("[Auth] Persistence State:", user ? `Authenticated as ${user.email}` : "Logged Out");

    if (!user) {
        // Detach persistent listeners
        if (_ordersChildCb) { Outlet.ref("orders").off("child_added", _ordersChildCb); _ordersChildCb = null; }
        if (_ordersValueCb) { Outlet.ref("orders").off("value", _ordersValueCb); _ordersValueCb = null; }
        if (_ordersChangedCb) { Outlet.ref("orders").off("child_changed", _ordersChangedCb); _ordersChangedCb = null; }
        if (window.currentOutlet) Outlet.ref("dishes").off();
        Outlet.ref("admins").off();

        if (authOverlay) {
            authOverlay.classList.remove('hidden');
            authOverlay.style.display = 'flex';
        }
        const layout = document.querySelector(".layout");
        if (layout) layout.classList.add('hidden');
        return;
    }

    try {
        // 1. Direct Lookup by UID (Preferred & Secure)
        console.log("[Auth] Checking permissions for UID:", user.uid);
        let adminSnap = await Outlet.ref(`admins/${user.uid}`).once("value");
        adminData = adminSnap.val();

        if (!adminData) {
            console.log("[Auth] No direct record found. Scanning all admins for legacy matching...");
            // 2. Fallback to scanning all admins (handles migration/legacy keys)
            const allSnap = await Outlet.ref("admins").once("value");
            const normalizedEmail = (user.email || "").toLowerCase();

            allSnap.forEach(snap => {
                const val = snap.val();
                if (val && val.email && val.email.toLowerCase() === normalizedEmail) {
                    adminData = val;
                    console.log("[Auth] Found admin via email match. Migrating to UID key...");
                    Outlet.ref(`admins/${user.uid}`).set({
                        ...val,
                        updatedAt: firebase.database.ServerValue.TIMESTAMP
                    });
                }
            });
        }

        // 3. Check for custom claims if still no data (Super Admin fallback)
        if (!adminData) {
            console.log("[Auth] Checking custom claims...");
            const token = await user.getIdTokenResult(true);
            if (token.claims.admin) {
                console.log("[Auth] Admin claim detected. Granting access.");
                adminData = { email: user.email, isSuper: true, name: "Super Admin", outlet: "pizza" };
            }
        }
    } catch (authErr) {
        console.error("[Auth] Permission Check Failed:", authErr);
        // If rules block reading /admins, try one more time after token refresh
        try {
            console.log("[Auth] Retrying after token refresh...");
            await user.getIdToken(true);
            const retrySnap = await Outlet.ref(`admins/${user.uid}`).once("value");
            adminData = retrySnap.val();
        } catch (e) {
            console.error("[Auth] Final permission check failed:", e);
        }
    }

    if (!adminData) {
        window.showToast("ACCESS DENIED: Unauthorized Account", "error");
        console.error("[Auth] Access Denied: User has no admin record and no custom claim.");
        setTimeout(() => auth.signOut(), 1500);
        return;
    }

    try {
        // Handle caching and switching for multi-outlet Support

        const switcher = document.getElementById('outletSwitcher');

        const switcherMobile = document.getElementById('outletSwitcherMobile');

        if (adminData.isSuper) {

            const outletOptionsHtml = `

            <option value="pizza">🍕 Pizza ERP</option>

                <option value="cake">🎂 Cakes ERP</option>

            `;

            const savedOutlet = sessionStorage.getItem('adminSelectedOutlet') || adminData.outlet;

            window.currentOutlet = (savedOutlet || 'pizza').toLowerCase();



            if (switcher) {

                switcher.classList.remove('hidden');

                switcher.innerHTML = outletOptionsHtml;

                switcher.value = window.currentOutlet;

                const btnNewTab = document.getElementById('btnNewTabOutlet');

                if (btnNewTab) btnNewTab.classList.remove('hidden');

            }

            if (switcherMobile) {

                switcherMobile.classList.remove('hidden');

                switcherMobile.innerHTML = outletOptionsHtml;

                switcherMobile.value = window.currentOutlet;

            }

        } else {
            window.currentOutlet = (adminData.outlet || 'pizza').toLowerCase();
            console.log("[Auth] Regular Admin Outlet:", window.currentOutlet);
            if (switcher) switcher.classList.add('hidden');
            if (switcherMobile) switcherMobile.classList.add('hidden');
        }

        console.log("[Auth] Final window.currentOutlet:", window.currentOutlet);



        // --- CONSOLIDATED BRANDING SYNC ---
        const brandType = window.currentOutlet === 'cake' ? 'cake' : 'pizza';

        // Only reload if the brand actually changed to ensure manifest and theme-colors refresh
        if (sessionStorage.getItem('admin_brand') !== brandType) {
            console.log(`[Branding Sync] Updating brand to: ${brandType}`);
            sessionStorage.setItem('admin_brand', brandType);

            // If we have a 'brand' URL parameter, strip it to prevent loops
            const url = new URL(window.location.href);
            if (url.searchParams.has('brand')) {
                url.searchParams.delete('brand');
                window.location.href = url.toString();
            } else {
                location.reload();
            }
            return;
        }



        // Sync Header Badges

        const outletDisplay = window.currentOutlet === 'cake' ? 'CAKE BOUTIQUE' : 'PIZZA ERP';

        const badges = [document.getElementById('outletBadge'), document.getElementById('mobileOutletBadge')];

        badges.forEach(b => { if (b) b.innerText = outletDisplay; });



        userEmailDisplay.innerText = user.email;

        if (authOverlay) {

            authOverlay.classList.add('hidden');

            authOverlay.style.display = ''; // Ensure no inline styles override classes

        }

        const layout = document.querySelector(".layout");

        if (layout) {

            layout.classList.remove('hidden');

            layout.classList.add('flex');

            layout.style.display = ''; // Ensure no inline styles override classes

        }



        updateBranding();

        loadRiders();

        initRealtimeListeners();

        switchTab('dashboard');



    } catch (e) {

        console.error("Auth Exception:", e);

    }

});



function updateBranding() {

    const badge = document.getElementById('outletBadge');

    const mobBadge = document.getElementById('mobileOutletBadge');

    const sidebarBrand = document.getElementById('sidebarBrandText');

    const brand = window.currentOutlet === 'cake' ? 'cake' : 'pizza';

    const isPizza = brand === 'pizza';



    const label = isPizza ? 'PIZZA OUTLET' : 'CAKES OUTLET';

    const primary = isPizza ? 'var(--primary-pizza)' : 'var(--primary-cake)';
    const primaryDark = isPizza ? 'var(--primary-dark-pizza)' : 'var(--primary-dark-cake)';

    // Apply color variables immediately
    const root = document.documentElement;
    root.style.setProperty('--primary', primary);
    root.style.setProperty('--primary-orange', primary);
    root.style.setProperty('--primary-dark', primaryDark);



    if (badge) {

        badge.innerText = label;

        badge.classList.remove('brand-pizza-bg', 'brand-cake-bg');

        badge.classList.add(isPizza ? 'brand-pizza-bg' : 'brand-cake-bg');

    }

    if (mobBadge) {

        mobBadge.innerText = label;

        mobBadge.classList.remove('brand-pizza-bg', 'brand-cake-bg');

        mobBadge.classList.add(isPizza ? 'brand-pizza-bg' : 'brand-cake-bg');

    }

    if (sidebarBrand) {

        sidebarBrand.innerText = isPizza ? 'ROSHANI PIZZA' : 'ROSHANI CAKES';

    }

    document.title = (isPizza ? 'Roshani Pizza' : 'Roshani Cakes') + ' | Admin Dashboard';



    // Synchronize PWA Manifest & Icons (from branding.js)

    if (typeof window.switchBrand === 'function' && brand !== sessionStorage.getItem('admin_brand')) {

        sessionStorage.setItem('admin_brand', brand);

        console.log("[Branding] Outlet changed brand to:", brand);

        // Do not force reload here to avoid interrupting user; 

        // the consolidated sync in onAuthStateChanged or a manual reload handles it.

    }



    const ridersMenu = document.getElementById("menu-riders");

    if (ridersMenu) {

        ridersMenu.classList.toggle('hidden', !(isPizza || (adminData && adminData.isSuper)));

    }

}



window.switchOutlet = (val) => {

    sessionStorage.setItem('adminSelectedOutlet', val);

    window.currentOutlet = val;



    // Keep both desktop and mobile switchers in sync

    const desktopSwitcher = document.getElementById('outletSwitcher');

    const mobileSwitcher = document.getElementById('outletSwitcherMobile');

    if (desktopSwitcher && desktopSwitcher.value !== val) desktopSwitcher.value = val;

    if (mobileSwitcher && mobileSwitcher.value !== val) mobileSwitcher.value = val;



    updateBranding();

    initRealtimeListeners();



    // Refresh active tab

    const activeTabId = document.querySelector('.nav-links li.active')?.id.replace('menu-', '') || 'dashboard';

    switchTab(activeTabId);

    console.log("Admin switched outlet to:", val);
};

window.openOutletInNewTab = () => {
    const current = window.currentOutlet === 'cake' ? 'pizza' : 'cake';
    const url = new URL(window.location.href);
    url.searchParams.set('brand', current);
    window.open(url.toString(), '_blank');
};



// =============================

// OUTLET STATUS QUICK CONTROLS

// =============================

window.previewOutletStatus = (val) => {

    window.updateOutletStatusIndicator(val);

    const hint = document.getElementById('outletStatusHint');

    if (hint) {

        const hints = {

            'AUTO': 'Status will follow your opening/closing hours.',

            'FORCE_OPEN': '⚡ Shop will accept orders regardless of time.',

            'FORCE_CLOSED': '📢 Shop will reject all incoming orders.',

        };

        hint.innerText = hints[val] || '';

    }

};



window.updateOutletStatusIndicator = (status) => {

    const pill = document.getElementById('outletStatusPill');

    if (!pill) return;

    pill.classList.remove('status-auto', 'status-open', 'status-closed');

    switch (status) {

        case 'FORCE_OPEN':

            pill.classList.add('status-open');

            pill.innerText = '●  OPEN';

            break;

        case 'FORCE_CLOSED':

            pill.classList.add('status-closed');

            pill.innerText = '●  CLOSED';

            break;

        default:

            pill.classList.add('status-auto');

            pill.innerText = 'AUTO';

    }

    // Re-render Lucide icons in case new ones were injected

    if (typeof lucide !== 'undefined') lucide.createIcons();

};



window.quickToggleOutletStatus = async () => {

    const statusEl = document.getElementById('settingShopStatus');

    if (!statusEl) return;

    const newStatus = statusEl.value;



    try {

        await Outlet.ref("settings/Store").update({ shopStatus: newStatus });

        window.updateOutletStatusIndicator(newStatus);



        const alertContainer = document.getElementById('alertContainer');

        if (alertContainer) {

            const div = document.createElement('div');

            div.className = 'alert-box';

            const colorMap = { 'FORCE_OPEN': '#22c55e', 'FORCE_CLOSED': '#ef4444', 'AUTO': '#3b82f6' };

            div.style.borderLeftColor = colorMap[newStatus] || '#3b82f6';

            const labelMap = { 'FORCE_OPEN': '✅ Outlet is now FORCE OPEN', 'FORCE_CLOSED': '🌙 Outlet is now FORCE CLOSED', 'AUTO': '⏰ Outlet set to AUTO (time-based)' };

            div.innerHTML = `

                <div class="alert-title">${labelMap[newStatus] || 'Status Updated'}</div>

                <div class="alert-sub">WhatsApp bot will respect this status immediately.</div>

            `;

            alertContainer.appendChild(div);

            setTimeout(() => div.remove(), 4000);

        }



        console.log("[Outlet Status] Quick-toggled to:", newStatus);

    } catch (e) {

        console.error("Failed to toggle outlet status:", e);

        window.showToast("Failed to update outlet status: " + e.message, "error");

    }

};



window.openOutletInNewTab = () => {

    const switcher = document.getElementById('outletSwitcher');

    const targetOutlet = switcher ? switcher.value : window.currentOutlet;

    const brand = targetOutlet === 'cake' ? 'cake' : 'pizza';



    // Open the portal in a new tab with the brand parameter to bootstrap sessionStorage

    const url = new URL(window.location.origin + window.location.pathname);

    url.searchParams.set('brand', brand);



    window.open(url.toString(), '_blank');

};



function closeSidebar() {

    const sidebar = document.getElementById('sidebarNav');

    const overlay = document.getElementById('sidebarOverlay');

    if (sidebar) sidebar.classList.remove('active');

    if (overlay) overlay.classList.remove('active');

}

window.closeSidebar = closeSidebar;

window.closeMobileSidebar = closeSidebar; // Support for either call style



// =============================

// SIDEBAR & TAB MANAGEMENT

// =============================

window.toggleSubmenu = (parentId) => {

    const parent = document.getElementById(parentId);

    const submenu = parent.querySelector('.submenu');

    const isOpen = submenu.classList.contains('open');



    // Close others

    document.querySelectorAll('.has-submenu').forEach(el => {

        el.classList.remove('open');

        el.querySelector('.submenu').classList.remove('open');

    });



    if (!isOpen) {

        parent.classList.add('open');

        submenu.classList.add('open');

    }

};



// =============================

// ADAPTIVE UI & NOTIFICATIONS

// =============================

// Premium Notification Sound (Base64 Chime)

const NOTIFICATION_SOUND_BIP = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSxvT18AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

// Note: Using a slightly longer/better sound in implementation than the placeholder above.



function addNotification(title, sub, type = 'info', outlet = null) {

    const notif = {

        id: Date.now(),

        title,

        sub,

        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),

        type,

        outlet: outlet || window.currentOutlet

    };

    notifications.unshift(notif);

    if (notifications.length > 50) notifications.pop();



    // Set Pending State

    if (window.currentActiveTab !== 'notifications') {

        window.isNotificationPending = true;

    }



    updateNotificationUI();



    // Play sound & Show OS Notification

    if (type === 'new' || type === 'delivered') {

        playSound();

        showNativeNotification(title, sub);

    }

}



// ⚡ NATIVE NOTIFICATIONS ENGINE

window.requestNotificationPermission = async () => {

    if (!("Notification" in window)) {

        showAlert({ total: "N/A", items: "Browser doesn't support notifications." }, 'error');

        return;

    }



    const permission = await Notification.requestPermission();

    updateNotificationSettingsUI();



    if (permission === "granted") {

        new Notification("✔ Notifications Enabled", {

            body: "You will now receive instant alerts for new orders.",

            icon: window.currentOutlet === 'cake' ? 'icon-cake.png' : 'icon-pizza.png'

        });

        playSound();

    }

};



function updateNotificationSettingsUI() {

    const statusText = document.getElementById('notifPermissionText');

    const btn = document.getElementById('btnEnableNotif');

    if (!statusText || !btn) return;



    if (!("Notification" in window)) {

        statusText.innerText = "Unsupported Browser";

        btn.disabled = true;

        return;

    }



    if (Notification.permission === "granted") {

        statusText.innerText = "Permission: Active ✔️ ";

        btn.innerHTML = '<i data-lucide="check-circle"></i> <span>Enabled</span>';

        btn.classList.replace('btn-primary', 'btn-secondary');

        btn.disabled = true;

    } else if (Notification.permission === "denied") {

        statusText.innerText = "Permission: Blocked ❌";

        btn.innerText = "Blocked in Settings";

        btn.disabled = true;

    } else {

        statusText.innerText = "Permission: Required 🔔";

    }

    if (typeof lucide !== 'undefined') lucide.createIcons();

}



function showNativeNotification(title, body) {

    if (Notification.permission !== "granted") return;



    // Use current outlet branding

    const brandPrefix = window.currentOutlet === 'cake' ? '🎂 CAKE: ' : '🍕 PIZZA: ';

    const icon = window.currentOutlet === 'cake' ? 'icon-cake.png' : 'icon-pizza.png';



    const options = {

        body,

        icon,

        badge: icon,

        vibrate: [200, 100, 200],

        tag: `order-${Date.now()}`,

        requireInteraction: true // Keep it on screen until user clicks

    };



    // Try service worker notification first (better for PWA)

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {

        navigator.serviceWorker.ready.then(reg => {

            reg.showNotification(brandPrefix + title, options);

        });

    } else {

        new Notification(brandPrefix + title, options);

    }

}



window.testNotification = () => {

    playSound();

    if (Notification.permission !== "granted") {

        requestNotificationPermission();

    } else {

        showNativeNotification("Test Alert Successful", "New orders will appear exactly like this!");

    }

};



function updateNotificationUI() {

    const badge = document.getElementById('notifBadge');

    const sideBadge = document.getElementById('sidebar-notif-count');

    const list = document.getElementById('notificationList');

    const fullList = document.getElementById('fullNotificationList');



    // 1. Update Badge Colors & Counts

    if (notifications.length > 0) {

        if (badge) {

            badge.classList.remove('hidden');

            badge.innerText = `+${notifications.length > 9 ? '9' : notifications.length}`;

            if (window.isNotificationPending) {

                badge.classList.add('pending');

            } else {

                badge.classList.remove('pending');

            }

        }

        if (sideBadge) {

            sideBadge.classList.toggle('hidden', !window.isNotificationPending);

            sideBadge.classList.toggle('block', window.isNotificationPending);

            sideBadge.innerText = notifications.length;

        }

    } else {

        if (badge) badge.classList.add('hidden');

        if (sideBadge) sideBadge.classList.add('hidden');

    }



    const emptyHtml = '<div class="empty-notif" style="padding:40px; text-align:center; color:#94a3b8; font-size:14px; font-weight:500;">No new notifications</div>';



    // 2. Update Dropdown List (if exists)

    if (list) {

        if (notifications.length === 0) {

            list.innerHTML = emptyHtml;

        } else {

            list.innerHTML = notifications.slice(0, 10).map(n => renderNotifItem(n)).join('');

        }

    }



    // 3. Update Dashboard List

    if (fullList) {

        if (notifications.length === 0) {

            fullList.innerHTML = emptyHtml;

        } else {

            fullList.innerHTML = notifications.map(n => renderNotifItem(n, true)).join('');

        }

    }

}



function renderNotifItem(n, isFull = false) {

    const safeTitle = escapeHtml(n.title);

    const safeSub = escapeHtml(n.sub);

    const safeTime = escapeHtml(n.time);

    const safeType = escapeHtml(n.type);

    const safeOutlet = n.outlet ? (n.outlet === 'pizza' ? '🍕' : '🎂') : '';



    return `

        <div class="notification-item ${safeType} ${isFull ? 'notif-item-full' : ''}">

            <div class="flex-grow-1">

                <div class="notif-title notif-title-premium">${safeOutlet} ${safeTitle}</div>

                <div class="notif-sub notif-sub-premium">${safeSub}</div>

            </div>

            <div class="notif-time-badge notif-time-badge-premium">${safeTime}</div>

        </div>

    `;

}



window.clearAllNotifications = () => {

    notifications = [];

    window.isNotificationPending = false;

    updateNotificationUI();

};



window.toggleNotificationSheet = (show) => {

    const sheet = document.getElementById('notificationSheet');

    const overlay = document.getElementById('notificationOverlay');



    if (!sheet || !overlay) return;



    if (show === false || sheet.classList.contains('active')) {

        sheet.classList.remove('active');

        overlay.classList.remove('active');

    } else {

        sheet.classList.add('active');

        overlay.classList.add('active');

        // Clear pending mark when opened

        window.isNotificationPending = false;

        updateNotificationUI();

    }

};



window.clearNotifications = () => {

    notifications = [];

    updateNotificationUI();

};







window.switchTab = (tabId) => {

    window.currentActiveTab = tabId;

    console.log(`[Navigation] Switching to: ${tabId}`);



    // Unified Mobile Sidebar Close

    if (typeof closeSidebar === 'function') {

        closeSidebar();

    } else {

        const sidebar = document.getElementById('sidebarNav');

        const overlay = document.getElementById('sidebarOverlay');

        if (sidebar) sidebar.classList.remove('active');

        if (overlay) overlay.classList.remove('active');

    }



    if (typeof window.toggleNotificationSheet === 'function') {

        window.toggleNotificationSheet(false);

    }



    if (tabId === 'notifications') {

        window.isNotificationPending = false;

        if (typeof updateNotificationUI === 'function') updateNotificationUI();

    }



    if (tabId === 'settings') {

        if (typeof updateNotificationSettingsUI === 'function') updateNotificationSettingsUI();

    }



    const body = document.body;

    const posTab = document.getElementById('tab-walkin');



    // Handle POS (Walk-in) Fullscreen on Mobile

    if (tabId === 'walkin') {

        // Only trigger immersion on actual mobile screens (strict)

        if (window.innerWidth < 768) {

            body.classList.add('pos-immersion-active');

        }



        if (posTab) posTab.classList.add('pos-fullscreen');



        if (!document.getElementById('posExitBtn') && posTab) {

            const backBtn = document.createElement('button');

            backBtn.id = 'posExitBtn';

            backBtn.className = 'pos-back-btn mobile-only';

            backBtn.innerHTML = '<i data-lucide="chevron-left"></i> Back to Dashboard';

            backBtn.onclick = (e) => {

                e.stopPropagation();

                window.switchTab('dashboard');

            };

            posTab.prepend(backBtn);

            if (typeof lucide !== 'undefined') lucide.createIcons();

        }

    } else {

        const layout = document.querySelector('.layout');

        body.classList.remove('pos-immersion-active');

        if (layout) layout.classList.remove('pos-immersion');

        if (posTab) posTab.classList.remove('pos-fullscreen');

    }



    // Handle Reports Fullscreen/Immersive

    if (tabId === 'reports') {

        body.classList.add('reports-immersive');

    } else {

        body.classList.remove('reports-immersive');

    }



    // Update Sidebar Navigation Active State

    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));

    const mainItem = document.getElementById(`menu-${tabId}`);

    if (mainItem) mainItem.classList.add('active');



    // Update Mobile Bottom Nav

    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {

        item.classList.remove('active');

        if (item.getAttribute('data-tab') === tabId) {

            item.classList.add('active');

        }

    });



    // Switch Content Tabs

    document.querySelectorAll('.tab-content').forEach(div => {

        div.classList.add('hidden');

    });



    const target = document.getElementById(`tab-${tabId}`);

    if (target) {

        target.classList.remove('hidden');



        // Tab-specific View Initializations (Phase 3: Performance Scoping)

        if (tabId === 'liveTracker' && typeof window.initLiveRiderTracker === 'function') {

            setTimeout(() => window.initLiveRiderTracker(), 100);

        } else if (typeof window.cleanupLiveRiderTracker === 'function') {

            window.cleanupLiveRiderTracker();

        }



        // Refresh data from cache if available

        const orderTabs = ['dashboard', 'orders', 'live', 'payments'];
        if (orderTabs.includes(tabId) && lastOrdersSnap) {
            renderOrders(lastOrdersSnap);
        }

        const titles = {
            'dashboard': 'Dashboard Overview',
            'orders': 'Order Management',
            'live': 'Live Kitchen Operations',
            'walkin': 'POS / Walk-in Sales',
            'menu': 'Dish Management',
            'categories': 'Categories',
            'riders': 'Delivery Fleet',
            'customers': 'Customer Base',
            'inventory': 'Inventory Tracking',
            'payments': 'Finances',
            'reports': 'Performance Analytics',
            'liveTracker': 'Rider Tracker',
            'notifications': 'Alerts',
            'lostSales': 'Lost Sales (Abandoned)',
            'settings': 'System Settings'
        };



        const titleText = titles[tabId] || 'Admin Dashboard';

        const mainTitle = document.getElementById('currentTabTitle');

        const mobTitle = document.getElementById('mobileTabTitle');

        if (mainTitle) mainTitle.innerText = titleText;

        if (mobTitle) mobTitle.innerText = titleText;

        document.title = `${titleText} | Roshani ERP`;



        // Data Loaders

        const canRead = window.currentOutlet || (adminData && adminData.isSuper);

        if (!canRead) return;



        if (tabId === 'walkin' && typeof loadWalkinMenu === 'function') loadWalkinMenu();

        if (tabId === 'menu' && typeof loadMenu === 'function') loadMenu();

        if (tabId === 'categories' && typeof loadCategories === 'function') loadCategories();

        if (tabId === 'riders' && typeof loadRiders === 'function') loadRiders();

        if (tabId === 'customers' && typeof loadCustomers === 'function') loadCustomers();

        if (tabId === 'feedback' && typeof loadFeedbacks === 'function') loadFeedbacks();

        if (tabId === 'reports' && typeof loadReports === 'function') loadReports();

        if (tabId === 'lostSales' && typeof window.loadLostSales === 'function') window.loadLostSales();



        // Sync mobile cart summary visibility

        if (typeof updateMobileCartSummaryState === 'function') {

            updateMobileCartSummaryState();

        }

    };



    function updateMobileCartSummaryState() {

        const cartSummary = document.getElementById('mobileCartSummary');

        const walkinTab = document.getElementById('tab-walkin');

        const authOverlay = document.getElementById('authOverlay');



        // Hide if elements don't exist OR if user is on Login Screen

        if (!cartSummary || !walkinTab || (authOverlay && !authOverlay.classList.contains('hidden'))) {

            if (cartSummary) cartSummary.classList.add('hidden');

            return;

        }



        // Check both tab state and the data

        const cartItems = walkinCart ? Object.values(walkinCart) : [];

        const totalQty = cartItems.reduce((acc, item) => acc + item.qty, 0);

        const hasItems = totalQty > 0;

        const isWalkinTab = !walkinTab.classList.contains('hidden');



        // Show only on Walk-in tab with items on Mobile/Tablet (< 1025px)

        if (hasItems && isWalkinTab && window.innerWidth <= 1024) {

            cartSummary.classList.remove('hidden');



            const countEl = document.getElementById('mobileCartCount');

            const totalEl = document.getElementById('mobileCartTotal');



            if (countEl) countEl.innerText = `${totalQty} Items`;

            if (totalEl) {

                const total = cartItems.reduce((acc, item) => acc + (item.price * item.qty), 0);

                totalEl.innerText = `₹${total.toLocaleString()}`;

            }

        } else {

            cartSummary.classList.add('hidden');

        }

    }



    // =============================

    // REAL-TIME LISTENERS

    // =============================

    function initRealtimeListeners() {

        // Detach any previous listeners from all possible outlet paths

        ['pizza', 'cake'].forEach(o => {

            const r = db.ref(`${o}/orders`);

            if (_ordersChildCb) r.off("child_added", _ordersChildCb);

            if (_ordersChangedCb) r.off("child_changed", _ordersChangedCb);

        });



        if (_ordersValueCb) {

            db.ref("pizza/orders").off("value", _ordersValueCb);

            db.ref("cake/orders").off("value", _ordersValueCb);

        }



        let firstLoad = true;

        const loadTime = Date.now();



        // 1. New Orders Listener

        _ordersChildCb = snap => {

            if (!firstLoad) {

                const order = snap.val();

                const orderTime = typeof order.createdAt === 'number' ? order.createdAt : new Date(order.createdAt).getTime();

                const isRecent = orderTime && (Date.now() - orderTime) < 120000; // 2 min window

                const isPostLoad = orderTime && orderTime > loadTime - 5000;



                if (order && order.status === "Placed" && isRecent && isPostLoad) {

                    showAlert(order);

                    addNotification(`New Order #${snap.key.slice(-5)}`, `Order for ₹${order.total} is placed.`, 'new', order.outlet);

                    setTimeout(() => highlightOrder(snap.key), 1000);

                }

            }

        };

        db.ref("pizza/orders").on("child_added", _ordersChildCb);

        db.ref("cake/orders").on("child_added", _ordersChildCb);



        // 2. Status Transitions (e.g. Delivered)

        _ordersChangedCb = snap => {

            const order = snap.val();

            if (order) {

                if (order.status === "Delivered") {

                    addNotification(`Order Delivered (#${snap.key.slice(-5)})`, `Customer: ${order.customer?.name || 'Walk-in'} • ₹${order.total}`, 'delivered', order.outlet);

                }

            }

        };

        db.ref("pizza/orders").on("child_changed", _ordersChangedCb);

        db.ref("cake/orders").on("child_changed", _ordersChangedCb);



        setTimeout(() => { firstLoad = false; }, 3000);



        // 3. Full Data Sync

        _ordersValueCb = snap => {
            console.log(`[Firebase] Orders Value received. Children: ${snap.numChildren()}`);
            renderOrders(snap);
        };

        const ordersRef = Outlet.ref("orders");
        console.log("[Firebase] Attaching orders listener to path:", ordersRef.toString());
        ordersRef.on("value", _ordersValueCb, err => console.error("Firebase Read Error:", err));



        // Order Search Logic

        const searchInput = document.getElementById("orderSearch");

        if (searchInput) {

            searchInput.oninput = (e) => {

                const term = e.target.value.toLowerCase();

                const rows = document.querySelectorAll("#ordersTableFull tr");

                rows.forEach(row => {

                    row.classList.toggle('hidden', !row.innerText.toLowerCase().includes(term));

                });

            };

        }

    }



    let alertAudio;



    function playSound() {

        try {

            // High-frequency "Ping" chime (pleasant and loud)

            const chime = new Audio("assets/sounds/alert.mp3");

            chime.volume = 0.8;

            chime.play().catch(e => {

                console.warn("Audio Context Bloqued. User must interact first.");

                // Fallback to simpler method if blocked

                const osc = new (window.AudioContext || window.webkitAudioContext)();

                const g = osc.createGain();

                const o = osc.createOscillator();

                o.connect(g);

                g.connect(osc.destination);

                o.type = "sine";

                o.frequency.setValueAtTime(880, osc.currentTime);

                g.gain.setValueAtTime(0, osc.currentTime);

                g.gain.linearRampToValueAtTime(0.5, osc.currentTime + 0.1);

                g.gain.exponentialRampToValueAtTime(0.01, osc.currentTime + 1);

                o.start(osc.currentTime);

                o.stop(osc.currentTime + 1);

            });

        } catch (err) {

            console.error("Audio error:", err);

        }

    }



    function showAlert(data, type = 'info') {

        const container = document.getElementById('alertContainer');

        if (!container) return;

        const div = document.createElement('div');

        div.className = `alert-box ${type}`;



        if (typeof data === 'string') {

            div.innerHTML = `

            <div class="alert-content">

    <div class="alert-title">${type === "success" ? "✔️" : "ℹ️"} Message</div>

                <div class="alert-sub">${escapeHtml(data)}</div>

            </div>

        `;

        } else {

            const order = data;

            const orderKey = order.orderId || order.id;

            ordersMap.set(orderKey, order);



            const outletIcon = order.outlet === 'cake' ? '🎂' : '🍕';

            div.innerHTML = `

            <div class="alert-content">

                <div class="alert-title">${outletIcon} New Order #${escapeHtml((order.orderId || order.id).slice(-5))}</div>

                <div class="alert-sub">₹${escapeHtml(order.total)} • ${(order.items || []).length} item(s)</div>

            </div>

            <button class="alert-print-btn" data-order-id="${escapeHtml(orderKey)}">🖨️ Print</button>

        `;



            const printBtn = div.querySelector('.alert-print-btn');

            printBtn.addEventListener('click', (e) => {

                e.stopPropagation();

                const id = e.target.getAttribute('data-order-id');

                const foundOrder = ordersMap.get(id);

                if (foundOrder) printOrderReceipt(foundOrder);

            });

        }



        div.onclick = () => {

            if (typeof data !== 'string') switchTab('orders');

            div.remove();

        };



        container.appendChild(div);



        // 1. play sound slightly after render

        setTimeout(() => { playSound(); }, 80);



        // 2. trigger pulse animation

        setTimeout(() => { div.classList.add('pulse'); }, 300);



        // 3. remove after 5 sec

        setTimeout(() => { div.remove(); }, 5000);

    }



    function highlightOrder(orderId) {

        setTimeout(() => {

            // 1. Try Anchor Match (Fastest)

            let row = document.getElementById(`row-${orderId}`);



            // 2. Fallback to Display ID Scan

            if (!row) {

                const rows = document.querySelectorAll('tr');

                rows.forEach(r => {

                    if (r.innerText.includes(orderId.slice(-5))) row = r;

                });

            }



            if (row) {

                row.classList.add('highlight');

                row.scrollIntoView({ behavior: 'smooth', block: 'center' });

                setTimeout(() => row.classList.remove('highlight'), 5000);

            }

        }, 120);

    }



    // Moved escapeHtml to top level for global access


    function validateUrl(url) {

        if (!url) return false;

        const s = String(url);

        return s.startsWith('https://') || s.startsWith('http://');

    }



    // =============================

    // RENDER ORDERS

    // =============================

    // =============================

    // PRIVACY WRAPPERS (Global)

    // =============================

    window.chatOnWhatsapp = (orderId) => {

        const order = ordersMap.get(orderId);

        if (!order || !order.phone) return;



        // Only authorized users can see the full number or link

        if (!adminData) return;



        const cleanPhone = order.phone.replace(/\D/g, '').slice(-10);

        const msg = `Hi ${order.customerName || 'Customer'}, regarding your order #${order.orderId || orderId.slice(-5)}`;

        const url = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`;

        window.open(url, '_blank');

    };



    // =============================

    // RENDER ORDERS

    // =============================

    function renderOrders(snap) {
        if (!snap) {
            console.warn("[Render] No snap provided to renderOrders");
            return;
        }

        console.log(`[Render] Starting render for ${snap.numChildren()} items. Outlet: ${window.currentOutlet}, Tab: ${window.currentActiveTab || 'dashboard'}`);

        lastOrdersSnap = snap; // Cache for background performance
        let ordersCount = 0, revenue = 0, pending = 0, today = 0, liveCount = 0;
        const todayStr = new Date().toISOString().split('T')[0];
        const activeTab = window.currentActiveTab || 'dashboard';



        // Reset item stats to prevent cumulative data in real-time updates

        window.itemStats = {};



        // Selective DOM clearing (Only clear what is visible to improve performance)

        if (ordersTable && activeTab === 'dashboard') ordersTable.innerHTML = "";

        if (document.getElementById("ordersTableFull") && activeTab === 'orders') document.getElementById("ordersTableFull").innerHTML = "";

        if (liveOrdersTable && activeTab === 'live') liveOrdersTable.innerHTML = "";

        if (paymentsTable && activeTab === 'payments') paymentsTable.innerHTML = "";



        ordersMap.clear();

        snap.forEach(child => {

            const o = child.val();

            const id = child.key;

            ordersMap.set(id, o);

        });



        // Sort orders by createdAt descending (Latest on Top)

        const sortedOrders = Array.from(ordersMap.entries()).map(([id, o]) => ({ id, ...o }))

            .sort((a, b) => {

                const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;

                const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

                return timeB - timeA;

            });



        sortedOrders.forEach(o => {

            const id = o.id;

            if (o.outlet && window.currentOutlet && o.outlet.toLowerCase().trim() !== window.currentOutlet.toLowerCase().trim()) return;



            const isLive = ["Placed", "Confirmed", "Preparing", "Cooked", "Out for Delivery"].includes(o.status);

            if (isLive) liveCount++;



            if (o.status === "Delivered") {

                revenue += Number(o.total || 0);

            } else if (isLive || o.status === "Placed" || o.status === "Pending") {

                pending++;

            }



            const safeOrderId = escapeHtml(o.orderId || id.slice(-5));

            const safeCustomerName = escapeHtml(o.customerName);

            const safeStatus = escapeHtml(o.status);

            const safeStatusClass = escapeHtml(o.status?.replace(/ /g, ''));

            const safeTotal = escapeHtml(o.total);

            const safeAddress = escapeHtml(o.address);

            const safeLocationLink = validateUrl(o.locationLink) ? escapeHtml(o.locationLink) : '';

            const displayPhone = o.phone ? escapeHtml(o.phone) : "Guest";

            const truncatedAddress = o.address ? (o.address.length > 30 ? o.address.substring(0, 30) + "..." : o.address) : "Counter Sale";



            const trHTML = `

            <td data-label="Order ID" class="font-mono font-600">#${safeOrderId}</td>

            <td data-label="Customer">

                ${safeCustomerName}<br>

                <small class="text-muted">${displayPhone}</small>

                ${o.phone ? `<button data-action="chatOnWhatsapp" data-id="${id}" class="btn-chat" title="Message on WhatsApp">💬</button>` : ''}

            </td>

            <td data-label="Address">

                <span title="${safeAddress}">${escapeHtml(truncatedAddress)}</span>

    ${safeLocationLink ? `<br><a href="${safeLocationLink}" target="_blank" class="color-primary fs-11 no-decoration">📍 Map</a>` : ""}

            </td>

            <td data-label="Total" class="font-bold">₹${safeTotal}</td>

            <td data-label="Status"><span class="status ${safeStatusClass}">${safeStatus}</span></td>

            <td data-label="Actions">

                <div class="flex-row flex-gap-5">

                    <select data-action="updateStatus" data-id="${id}" class="status-select">

                        <option value="">Status</option>

                        <option value="Confirmed" ${safeStatus === "Confirmed" ? "selected" : ""}>Confirm</option>

                        <option value="Preparing" ${safeStatus === "Preparing" ? "selected" : ""}>Preparing</option>

                        <option value="Cooked" ${safeStatus === "Cooked" ? "selected" : ""}>Cooked</option>

                        <option value="Out for Delivery" ${safeStatus === "Out for Delivery" ? "selected" : ""}>Out for Delivery</option>

                        <option value="Delivered" ${safeStatus === "Delivered" ? "selected" : ""}>Delivered</option>

                        <option value="Cancelled" ${safeStatus === "Cancelled" ? "selected" : ""}>Cancelled X</option>

                    </select>

        <button data-action="printReceiptById" data-id="${o.orderId || id}" class="btn-table-icon" title="Print Receipt">🖨️</button>

                </div>

                <div class="mt-5">

                    <select data-action="assignRider" data-id="${id}" class="rider-select w-full">

                        <option value="">Assign Rider</option>

                        ${ridersList.map(r => `<option value="${escapeHtml(r.email)}" ${o.assignedRider === r.email ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}

                    </select>

                </div>

            </td>

        `;





            // Populate Dashboard Table (Limit to 10)

            if (ordersCount < 10 && ordersTable && activeTab === 'dashboard') {

                const row = document.createElement("tr");

                row.id = `row-${id}`;

                row.className = "clickable-row";

                row.setAttribute('data-action', 'openOrderDrawer');

                row.setAttribute('data-id', id);

                row.innerHTML = trHTML;

                ordersTable.appendChild(row);

                ordersCount++;

            }



            // Populate Order History

            if (activeTab === 'orders') {

                const rowFull = document.createElement("tr");

                rowFull.className = "clickable-row";

                rowFull.setAttribute('data-action', 'openOrderDrawer');

                rowFull.setAttribute('data-id', id);

                rowFull.innerHTML = trHTML;

                const fullTable = document.getElementById("ordersTableFull");

                if (fullTable) fullTable.appendChild(rowFull);

            }



            // Populate Live Table

            if (isLive && liveOrdersTable && activeTab === 'live') {

                const rowLive = document.createElement("tr");

                rowLive.className = "clickable-row";

                rowLive.setAttribute('data-action', 'openOrderDrawer');

                rowLive.setAttribute('data-id', id);

                const safeItemsHTML = o.items ? o.items.map(i => `<strong>${escapeHtml(i.name)}</strong> (${escapeHtml(i.size)})${i.addons?.length ? '<br>+ ' + i.addons.map(a => escapeHtml(a.name)).join(', ') : ''}`).join('<br>') : '1 item';

                rowLive.innerHTML = `

                <td data-label="Order ID" class="font-mono font-600">#${safeOrderId}</td>

                <td data-label="Customer">${safeCustomerName}</td>

                <td data-label="Items">

                    <small>

                        ${safeItemsHTML}

                    </small>

                </td>

                <td data-label="Total" class="font-bold">₹${safeTotal}</td>

                <td data-label="Status"><span class="status ${safeStatusClass}">${safeStatus}</span></td>

                <td data-label="Rider">

                    <select data-action="assignRider" data-id="${id}" class="rider-select">

                        <option value="">Select Rider</option>

                        ${ridersList.map(r => `<option value="${escapeHtml(r.email)}" ${o.assignedRider === r.email ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}

                    </select>

                </td>

                <td data-label="Action">

                    <button data-action="updateStatus" data-id="${id}" data-val="Delivered" class="btn-table-action">Deliver</button>

                </td>

            `;

                liveOrdersTable.appendChild(rowLive);

            }



            // Populate Payments Table

            if (paymentsTable && activeTab === 'payments') {

                const rowPay = document.createElement("tr");

                const safePStatus = escapeHtml(o.paymentStatus || "Pending");

                const safePStatusClass = safePStatus.toLowerCase();

                const safePMethod = escapeHtml(o.paymentMethod || 'COD');

                rowPay.innerHTML = `

                <td data-label="Order ID" style="font-family: monospace;">#${safeOrderId}</td>

                <td data-label="Customer">${safeCustomerName}</td>

                <td data-label="Method">${safePMethod}</td>

                <td data-label="Total" style="font-weight:700">₹${safeTotal}</td>

                <td data-label="Status"><span class="status-${safePStatusClass}">${safePStatus}</span></td>

                <td data-label="Action">

                    ${safePStatus === 'Pending' ? `<button data-action="markAsPaid" data-id="${id}" class="btn-secondary" style="padding:4px 8px; font-size:11px;">Mark Paid</button>` : '✔️'}

                </td>

            `;

                paymentsTable.appendChild(rowPay);

            }

        });



        // Update Counts

        const liveBadge = document.getElementById("badge-live");

        if (liveBadge) {

            liveBadge.innerText = liveCount;

            if (liveBadge) liveBadge.classList.toggle('hidden', liveCount <= 0);

        }



        if (document.getElementById("statOrders")) document.getElementById("statOrders").innerText = liveCount;

        if (document.getElementById("statRevenue")) document.getElementById("statRevenue").innerText = "₹" + revenue.toLocaleString();

        if (document.getElementById("statPending")) document.getElementById("statPending").innerText = pending;



        // RENDER PRIORITY TABLE

        renderPriorityTable(sortedOrders);



        // Populate Dashboard Sidebar Modules

        renderTopItems();

        calculateTopSpenders(snap);

    }



    function renderPriorityTable(sortedOrders) {

        const list = document.getElementById('priorityOrderList');

        if (!list) return;



        // Filter for Placed, Confirmed, Preparing, Cooked (Anything not yet out or delivered)

        const priority = sortedOrders.filter(o =>

            ["Placed", "Confirmed", "Preparing", "Cooked"].includes(o.status) &&

            (!window.currentOutlet || o.outlet === window.currentOutlet)

        );



        if (priority.length === 0) {

            list.innerHTML = `

            <div class="empty-priority">

                <p>No pending orders. Good job!</p>

            </div>`;

        } else {

            list.innerHTML = priority.map(o => `

            <div class="priority-card" data-action="openOrderDrawer" data-id="${o.id}">

                <div class="p-header">

                    <span class="p-id">#${escapeHtml(o.orderId || o.id.slice(-5))}</span>

                    <span class="status-badge ${(o.status || 'Pending').toLowerCase().replace(/ /g, '-')}">${o.status || 'Pending'}</span>

                </div>

                <div class="p-body">

                    <div class="p-cust">${escapeHtml(o.customerName)}</div>

                    <div class="p-meta">₹${escapeHtml(o.total)} • ${o.items?.length || 0} items</div>

                </div>

                <div class="p-footer">

                    <span class="p-time">${o.createdAt ? new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>

                    <button class="btn-priority-action" data-action="updateStatus" data-id="${o.id}" data-val="Confirmed">Confirm</button>

                </div>

            </div>

        `).join('');

        }

    }



    function calculateTopSpenders(snap) {

        const spencerStats = {};

        snap.forEach(child => {

            const o = child.val();

            if (o.outlet && window.currentOutlet && o.outlet.toLowerCase().trim() === window.currentOutlet.toLowerCase().trim() && o.status === "Delivered") {

                const key = o.phone || "Unknown";

                if (!spencerStats[key]) {

                    spencerStats[key] = { name: o.customerName || "Customer", total: 0, count: 0 };

                }

                spencerStats[key].total += Number(o.total || 0);

                spencerStats[key].count += 1;

            }

        });



        const list = document.getElementById('topCustomersList');

        if (!list) return;



        const sorted = Object.entries(spencerStats)

            .sort((a, b) => b[1].total - a[1].total)

            .slice(0, 5);



        list.innerHTML = sorted.map(([phone, data]) => `

        <div class="top-spender-card">

            <div class="flex-col">

                <div class="spender-name">${escapeHtml(data.name)}</div>

                 <div class="spender-phone">${escapeHtml(phone)}</div>

            </div>

            <div class="text-right">

                <div class="spender-total">₹${data.total.toLocaleString()}</div>

                <div class="spender-meta">${data.count} VISITS</div>

            </div>

        </div>

    `).join('') || '<p class="text-center py-20 text-muted fs-12">Waiting for first delivery...</p>';

    }



    function renderTopItems() {

        const list = document.getElementById('topItemsList');

        if (!list || !window.itemStats || Object.keys(window.itemStats).length === 0) {

            if (list) list.innerHTML = "<div style='color:var(--text-muted); font-size:12px; text-align:center; padding:20px;'>No sales data yet</div>";

            return;

        }



        const sorted = Object.entries(window.itemStats)

            .sort((a, b) => b[1] - a[1])

            .slice(0, 5);



        list.innerHTML = sorted.map(([name, count], index) => `

        <div class="top-item-card">

            <div class="top-item-rank">${index + 1}</div>

            <div class="flex-1">

                 <div class="top-item-name">${escapeHtml(name)}</div>

                <div class="top-item-count">${count} sold</div>

            </div>

            <div class="top-item-bar-bg">

                <div class="top-item-bar-fill" style="width:${Math.min(100, (count / sorted[0][1]) * 100)}%;"></div>

            </div>

        </div>

    `).join("") || '<p class="text-center py-10 text-muted fs-12">No sales data yet.</p>';

    }



    window.markAsPaid = (id) => {

        Outlet.ref("orders/" + id).update({ paymentStatus: "Paid" });

    };



    window.deleteOrder = (id) => {

        window.showToast("Sales records are permanent and cannot be deleted by anyone to maintain data integrity.", "info");

    };



    // =============================

    // CATEGORIES

    // =============================

    // CATEGORIES

    function loadCategories() {

        Outlet.ref('categories').off(); // Detach previous listener before re-attaching

        Outlet.ref('categories').on('value', snap => {

            categories = [];

            const container = document.getElementById('categoryList');

            if (!container) return;

            container.innerHTML = "";



            snap.forEach(child => {

                const cat = { id: child.key, ...child.val() };



                categories.push(cat);



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



    window.addCategory = async () => {

        const nameInput = document.getElementById('newCatName');

        const name = nameInput.value.trim();

        if (!name) return window.showToast('Enter category name', 'warning');



        const fileInput = document.getElementById('catFile');

        const previewImg = document.getElementById('catPreview');

        let imageUrl = "";



        try {

            if (fileInput.files.length > 0) {

                const file = fileInput.files[0];

                imageUrl = await uploadImage(file, `categories/${Date.now()}_${file.name}`);

            }



            // Collect Category Add-ons

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

            window.showToast('Category added successfully!', 'success');

        } catch (err) {

            console.error(err);

            window.showToast('Operation failed: ' + err.message, 'error');

        }

    }



    window.deleteCategory = async (id) => {

        if (await window.showConfirm("Delete this category?")) {

            Outlet.ref('categories/' + id).remove();

        }

    };



    window.addSizeField = (name = "", price = "") => {

        const container = document.getElementById('sizesContainer');

        const div = document.createElement('div');

        div.style = "display:flex; gap:5px; margin-bottom:5px;";

        div.className = "size-row";

        div.innerHTML = `

        <input placeholder="Size (e.g. Small)" value="${name}" class="form-input" style="flex:2; margin-bottom:0">

        <input type="number" placeholder="Price" value="${price}" class="form-input" style="flex:1; margin-bottom:0">

        <button data-action="removeParent" style="background:none; border:none; color:red; cursor:pointer;">×</button>

    `;

        container.appendChild(div);

    };



    window.addNewAddonField = (name = "", price = "") => {

        const container = document.getElementById('addonsContainer');

        const div = document.createElement('div');

        div.style = "display:flex; gap:5px; margin-bottom:5px;";

        div.className = "addon-row";

        div.innerHTML = `

        <input placeholder="Addon (e.g. Extra Cheese)" value="${name}" class="form-input" style="flex:2; margin-bottom:0">

        <input type="number" placeholder="Price" value="${price}" class="form-input" style="flex:1; margin-bottom:0">

        <button data-action="removeParent" style="background:none; border:none; color:red; cursor:pointer;">×</button>

    `;

        container.appendChild(div);

    };



    window.hideDishModal = () => {

        const modal = document.getElementById('dishModal');

        if (modal) {

            modal.classList.remove('flex');

            modal.classList.add('hidden');

        }

    };



    // Rename function to saveDish to avoid conflict with event listener name

    window.saveDish = async () => {

        if (!window.currentOutlet || window.currentOutlet === 'null' || window.currentOutlet === 'undefined') {

            return window.showToast("Error: Current outlet context is missing. Please refresh or select an outlet first.", "error");

        }

        const name = document.getElementById('dishName').value;

        const cat = document.getElementById('dishCategory').value;

        const basePrice = document.getElementById('dishPriceBase').value;

        let image = document.getElementById('dishImage').value; // Existing URL



        if (!name || !cat) return window.showToast("Please fill Name and Category", "warning");



        const file = document.getElementById('dishFile').files[0];

        const statusLabel = document.getElementById('uploadStatus');



        try {

            if (file) {

                statusLabel.classList.remove('hidden');



                // If editing, get old image to delete later

                let oldImageUrl = null;

                if (editingDishId) {

                    const snap = await Outlet.ref(`dishes/${editingDishId}`).once('value');

                    oldImageUrl = snap.val()?.image;

                }



                // Upload new

                image = await uploadImage(file, `dishes/${Date.now()}_${file.name}`);



                // Delete old if upload successful and old exists

                if (oldImageUrl && image !== oldImageUrl) {

                    await deleteImage(oldImageUrl);

                }



                statusLabel.classList.add('hidden');

            }



            // Collect Sizes

            const sizes = {};

            document.querySelectorAll('.size-row').forEach(row => {

                const inputs = row.querySelectorAll('input');

                if (inputs[0].value && inputs[1].value) {

                    sizes[inputs[0].value] = Number(inputs[1].value);

                }

            });



            // Collect Addons

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



            if (editingDishId) {

                await ref.child(editingDishId).update(data);

            } else {

                await ref.push(data);

            }



            hideDishModal();

            loadMenu();

        } catch (e) {

            window.showToast("Error: " + e.message, "error");

            if (statusLabel) statusLabel.classList.add('hidden');

        }

    };



    function loadMenu() {

        const grid = document.getElementById("menuGrid");

        Outlet.ref(`dishes`).off();

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



    window.toggleStock = (id, current) => Outlet.ref(`dishes/${id}`).update({ stock: !current });

    window.toggleDishAvailable = (id, available) => Outlet.ref(`dishes/${id}`).update({ stock: available });

    window.editDish = (id) => window.showDishModal(id);

    window.markDelivered = (id) => window.updateStatus(id, 'Delivered');

    window.editCategory = (id) => window.showToast("Category editing coming soon!", "info");

    window.deleteDish = (dishId) => {

        // Remove any existing confirm overlay

        const existing = document.getElementById('deleteConfirmOverlay');

        if (existing) existing.remove();



        // Build a centered overlay modal so it's always visible (no scroll/viewport issues)

        const overlay = document.createElement('div');

        overlay.id = 'deleteConfirmOverlay';

        overlay.style.cssText = [

            'position:fixed', 'inset:0', 'z-index:99999',

            'background:rgba(0,0,0,0.7)', '-webkit-backdrop-filter:blur(4px)', 'backdrop-filter:blur(4px)',

            'display:flex', 'align-items:center', 'justify-content:center'

        ].join(';');



        overlay.innerHTML = `

        <div style="background:#1c1c1c; border:1px solid #ef4444; border-radius:20px;

                    padding:32px 36px; max-width:360px; width:90%; text-align:center;

                    box-shadow:0 20px 60px rgba(239,68,68,0.25);">

        <div style="font-size:40px; margin-bottom:12px;">🗑️</div>

            <h3 style="color:#fff; margin:0 0 8px; font-size:18px; font-weight:700;">Delete Dish?</h3>

            <p style="color:#aaa; font-size:14px; margin:0 0 24px;">This action cannot be undone.</p>

            <div style="display:flex; gap:12px; justify-content:center;">

                <button id="confirmDeleteNo"

                    style="flex:1; padding:12px; border-radius:12px; border:1px solid #333;

                           background:transparent; color:#aaa; cursor:pointer; font-size:14px; font-weight:600;">

                    Cancel

                </button>

                <button id="confirmDeleteYes"

                    style="flex:1; padding:12px; border-radius:12px; border:none;

                           background:#ef4444; color:#fff; cursor:pointer; font-size:14px; font-weight:700;">

                    Delete

                </button>

            </div>

        </div>`;



        document.body.appendChild(overlay);



        const cleanup = () => overlay.remove();



        // Cancel button

        overlay.querySelector('#confirmDeleteNo').addEventListener('click', cleanup);



        // Click backdrop to cancel

        overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });



        // Confirm delete

        overlay.querySelector('#confirmDeleteYes').addEventListener('click', async () => {

            cleanup();

            try {

                const snap = await Outlet.ref(`dishes/${dishId}`).once('value');

                const img = snap.val()?.image;

                if (img) await deleteImage(img);

                await Outlet.ref(`dishes/${dishId}`).remove();

            } catch (e) {

                window.showToast('Delete failed: ' + e.message, 'error');

            }

        });

    };



    // (Duplicate loadCategories, addCategory, deleteCategory removed — canonical versions above at loadCategories/line ~600)



    // RIDERS

    let riderStatsData = {};



    function loadRiders() {

        Outlet.ref("riderStats").off(); // Detach previous listeners before re-attaching

        Outlet.ref("riders").off();



        // Listen for performance stats

        Outlet.ref("riderStats").on("value", s => {

            riderStatsData = s.val() || {};

            if (ridersList.length > 0) renderRiders();

        });



        Outlet.ref("riders").on("value", snap => {

            ridersList = [];

            snap.forEach(child => {

                const val = child.val();

                // Same Rider for Both Outlets: No filtering needed anymore

                ridersList.push({ id: child.key, ...val });

            });

            renderRiders();

        });

    }





    function renderRiders(searchTerm = "") {

        const table = document.getElementById("ridersTable");

        const activeDashboard = document.getElementById("riderStatusList");



        // Summary Elements

        const statOnline = document.getElementById("rider-stat-online");

        const statBusy = document.getElementById("rider-stat-busy");

        const statOffline = document.getElementById("rider-stat-offline");

        const statEarnings = document.getElementById("rider-stat-earnings");



        if (table) table.innerHTML = "";

        if (activeDashboard) activeDashboard.innerHTML = "";



        let onlineCount = 0;

        let busyCount = 0;

        let offlineCount = 0;

        let totalEarnings = 0;



        const query = (searchTerm || "").toLowerCase();



        ridersList.forEach(r => {

            const stats = riderStatsData[r.id] || { totalOrders: 0, avgDeliveryTime: 0, totalEarnings: 0 };

            totalEarnings += (stats.totalEarnings || 0);



            // Determine precise status

            let displayStatus = r.status || "Offline";

            if (displayStatus === "Online" && r.currentOrder) displayStatus = "On Delivery";



            if (displayStatus === "Online") onlineCount++;

            else if (displayStatus === "On Delivery") busyCount++;

            else offlineCount++;



            // Filter Logic

            if (query) {

                const matches = (r.name || "").toLowerCase().includes(query) ||

                    (r.email || "").toLowerCase().includes(query) ||

                    (r.phone || "").includes(query);

                if (!matches) return;

            }



            const statusClass = displayStatus.toLowerCase().replace(/\s+/g, '-');

            const profileImg = r.photoUrl || "https://ui-avatars.com/api/?name=" + encodeURIComponent(r.name) + "&background=random";



            // 1. Populate Management Table

            if (table) {

                const tr = document.createElement('tr');

                tr.className = "rider-row";

                tr.innerHTML = `

                <td>

                    <div class="rider-identity-cell">

                        <img src="${profileImg}" class="rider-avatar-large" alt="${escapeHtml(r.name)}">

                        <div class="rider-identity-text">

                            <span class="rider-name-bold">${escapeHtml(r.name)}</span>

                            <span class="rider-subtext"><i data-lucide="phone" style="width:10px;"></i> ${r.phone ? escapeHtml(r.phone) : 'N/A'}</span>

                        </div>

                    </div>

                </td>

                <td>

                    <div class="credential-tag">

                        <span class="tag-label">ID:</span>

                        <span class="tag-value">${escapeHtml(r.email)}</span>

                    </div>

                </td>

                <td>

                    <div class="status-indicator-wrapper">

                        <span class="status-dot dot-${statusClass}"></span>

                        <span class="status-text text-${statusClass}">${escapeHtml(displayStatus)}</span>

                    </div>

                </td>

                <td>

                    <div class="quick-stats-grid">

                        <div class="stat-mini">

                            <span class="mini-label">Orders</span>

                            <span class="mini-value">${stats.totalOrders}</span>

                        </div>

                        <div class="stat-mini">

                            <span class="mini-label">Wallet</span>

                            <span class="mini-value text-success">₹${(stats.totalEarnings || 0).toLocaleString()}</span>

                        </div>

                    </div>

                </td>

                <td>

                    <div class="performance-bar-wrapper">

                        <div class="flex-between mb-4">

                            <span class="text-xs">Success Rate</span>

                            <span class="text-xs font-bold">98%</span>

                        </div>

                        <div class="performance-track">

                            <div class="performance-fill" style="width: 98%"></div>

                        </div>

                    </div>

                </td>

                <td>

                    <div class="action-buttons-flex">

                        <button data-action="editRider" data-id="${r.id}" class="btn-icon-premium" title="Edit Rider">

                            <i data-lucide="edit-2"></i>

                        </button>

                        <button data-action="resetRiderPassword" data-email="${r.email}" class="btn-icon-premium text-warning" title="Reset Password">

                            <i data-lucide="key"></i>

                        </button>

                        <button data-action="deleteRider" data-id="${r.id}" class="btn-icon-premium text-danger" title="Delete Rider">

                            <i data-lucide="trash-2"></i>

                        </button>

                    </div>

                </td>

            `;

                table.appendChild(tr);

            }



            // 2. Populate Status List (if exists)

            if (activeDashboard) {

                const div = document.createElement('div');

                div.className = `rider-status-card ${statusClass}`;

                div.innerHTML = `

                <img src="${profileImg}" class="rider-avatar-sm">

                <div class="flex-1">

                    <div class="rider-name-sm">${escapeHtml(r.name)}</div>

                    <div class="rider-status-tag">${escapeHtml(displayStatus)}</div>

                </div>

            `;

                activeDashboard.appendChild(div);

            }

        });



        // Update Summary Stats

        if (statOnline) statOnline.textContent = onlineCount;

        if (statBusy) statBusy.textContent = busyCount;

        if (statOffline) statOffline.textContent = offlineCount;

        if (statEarnings) statEarnings.textContent = "₹" + totalEarnings.toLocaleString();



        if (typeof lucide !== 'undefined') lucide.createIcons();

    }





    window.deleteRider = async (id) => {

        if (await window.showConfirm("Remove this rider? This will NOT delete their login but will prevent them from accessing the shop.", "Remove Rider")) {

            await Outlet.ref(`riders/${id}`).remove();

            window.showToast("Rider removed successfully", "success");

        }

    };



    // UTILITY: Image Preview to Base64

    window.previewImage = (input, previewId) => {

        if (input.files && input.files[0]) {

            const reader = new FileReader();

            reader.onload = (e) => {

                const preview = document.getElementById(previewId);

                const hidden = document.getElementById(previewId.replace('Preview', 'Url'));

                if (preview) preview.src = e.target.result;

                if (hidden) hidden.value = e.target.result;

            };

            reader.readAsDataURL(input.files[0]);

        }

    };



    window.showRiderModal = () => {

        isEditRiderMode = false;

        currentEditingRiderId = null;

        document.getElementById('riderModalTitle').innerText = "Add New Rider";

        document.getElementById('saveRiderBtn').innerText = "Create Account";

        document.getElementById('riderEmail').disabled = false;

        document.getElementById('riderPassHint').classList.add('hidden');

        document.getElementById('riderPassLabel').innerText = "Secret Access Code (Password)";



        // Clear all 10 PII fields

        document.getElementById('riderName').value = "";

        document.getElementById('riderEmail').value = "";

        document.getElementById('riderPhone').value = "";

        document.getElementById('riderFatherName').value = "";

        document.getElementById('riderAge').value = "";

        document.getElementById('riderAadharNo').value = "";

        document.getElementById('riderQual').value = "";

        document.getElementById('riderAddress').value = "";

        document.getElementById('riderPass').value = "";



        // Reset Images

        document.getElementById('riderProfilePreview').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='12' fill='%23999\'%3ENo Photo%3C/text%3E%3C/svg%3E";

        document.getElementById('riderPhotoUrl').value = "";

        document.getElementById('aadharPreview').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='60' viewBox='0 0 100 60'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='8' fill='%23999\'%3EID Preview%3C/text%3E%3C/svg%3E";

        document.getElementById('aadharUrl').value = "";



        document.getElementById('riderModal').classList.add('active');

    };



    window.editRider = (id) => {

        const r = ridersList.find(x => x.id === id);

        if (!r) return;



        isEditRiderMode = true;

        currentEditingRiderId = id;



        document.getElementById('riderModalTitle').innerText = "Edit Rider Details";

        document.getElementById('saveRiderBtn').innerText = "Update Rider";

        document.getElementById('riderEmail').disabled = true;

        document.getElementById('riderPassHint').classList.remove('hidden');

        document.getElementById('riderPassLabel').innerText = "Update Password (Optional)";



        // Populate all 10 PII fields

        document.getElementById('riderName').value = r.name || "";

        document.getElementById('riderEmail').value = r.email || "";

        document.getElementById('riderPhone').value = r.phone || "";

        document.getElementById('riderFatherName').value = r.fatherName || "";

        document.getElementById('riderAge').value = r.age || "";

        document.getElementById('riderAadharNo').value = r.aadharNo || "";

        document.getElementById('riderQual').value = r.qualification || "";

        document.getElementById('riderAddress').value = r.address || "";

        document.getElementById('riderPass').value = "";



        // Populate Images

        const SVG_PLACEHOLDER = "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23ccc%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20x%3D%223%22%20y%3D%223%22%20width%3D%2218%22%20height%3D%2218%22%20rx%3D%222%22%20ry%3D%222%22%3E%3C%2Frect%3E%3Cline%20x1%3D%223%22%20y1%3D%2221%22%20x2%3D%2221%22%20y2%3D%223%22%3E%3C%2Fline%3E%3C%2Fsvg%3E";

        document.getElementById('riderProfilePreview').src = r.profilePhoto || SVG_PLACEHOLDER;

        document.getElementById('riderPhotoUrl').value = r.profilePhoto || "";

        document.getElementById('aadharPreview').src = r.aadharPhoto || SVG_PLACEHOLDER;

        document.getElementById('aadharUrl').value = r.aadharPhoto || "";



        document.getElementById('riderModal').classList.add('active');

    };



    window.hideRiderModal = () => document.getElementById('riderModal').classList.remove('active');



    window.saveRiderAccount = async () => {

        const name = document.getElementById('riderName').value.trim();

        let email = document.getElementById('riderEmail').value.trim();

        const phone = document.getElementById('riderPhone').value.trim();

        let pass = document.getElementById('riderPass').value;



        // Validate email

        if (!email) {

            window.showToast("Please provide a valid email address.", "error");

            return;

        }



        // Generate secure temporary password for new accounts if none provided

        if (!isEditRiderMode && !pass) {

            pass = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();

            navigator.clipboard.writeText(pass);

            window.showToast("Rider Password Generated & Copied to Clipboard!", "success");

        }



        const fatherName = document.getElementById('riderFatherName').value.trim();

        const age = document.getElementById('riderAge').value;

        const aadharNo = document.getElementById('riderAadharNo').value.trim();

        const qualification = document.getElementById('riderQual').value.trim();

        const address = document.getElementById('riderAddress').value.trim();

        let profilePhoto = document.getElementById('riderPhotoUrl').value;

        let aadharPhoto = document.getElementById('aadharUrl').value;



        if (!name || !email || !pass) {

            window.showToast("Name, Email, and Password are required.", "error");

            return;

        }



        // Strict 12-digit Aadhar Validation

        if (!/^\d{12}$/.test(aadharNo)) {

            window.showToast("Invalid Aadhar Number! It must be exactly 12 digits.", "error");

            return;

        }



        const profileFile = document.getElementById('riderPhotoInput').files[0];

        const aadharFile = document.getElementById('aadharPhotoInput').files[0];

        const statusLabel = document.getElementById('uploadStatusRider');



        try {

            if (profileFile || aadharFile) {

                statusLabel.classList.remove('hidden');

            }



            if (profileFile) {

                profilePhoto = await uploadImage(profileFile, `riders/profile_${Date.now()}`);

            }

            if (aadharFile) {

                aadharPhoto = await uploadImage(aadharFile, `riders/aadhar_${Date.now()}`);

            }



            statusLabel.classList.add('hidden');



            let uid = currentEditingRiderId;



            if (!isEditRiderMode) {

                console.log("[saveRiderAccount] Creating new rider account...");

                // 1. Create in secondary Auth

                if (!secondaryAuthAvailable) {

                    window.showToast("Rider creation is currently unavailable.", "error");

                    return;

                }

                if (!pass || pass.length < 6) {

                    window.showToast("Password must be at least 6 characters for new accounts.", "error");

                    return;

                }



                try {

                    console.log("[saveRiderAccount] Attempting secondary Auth creation for:", email);

                    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, pass);

                    uid = cred.user.uid;

                    console.log("[saveRiderAccount] User created with UID:", uid);



                    // CRITICAL: Immediately sign out the rider from the secondary instance

                    // to prevent any accidental session bleeding into the admin's database write.

                    console.log("[saveRiderAccount] Signing out of secondaryAuth...");

                    await secondaryAuth.signOut();

                } catch (authError) {

                    window.showToast(standardizeAuthError(authError), "error");

                    statusLabel.classList.add('hidden');

                    return;

                }

            } else if (pass && pass.length >= 6) {

                // Update password in edit mode if provided

                try {

                    // To update password, we'd need to sign in as the user. 

                    // Since this is restricted, we recommend using 'Forgot Password' or resetting via Firebase Console.

                    window.showToast("Password update: Use 'Forgot Password' or Admin Console.", "info");

                } catch (e) {

                    console.error("Password update error:", e);

                }

            }



            // 2. Save/Update rider details to DB

            const riderData = {

                name,

                email,

                phone,

                fatherName,

                age,

                aadharNo,

                qualification,

                address,

                profilePhoto,

                aadharPhoto,

                outlet: (window.currentOutlet || 'pizza').toLowerCase(),

                updatedAt: firebase.database.ServerValue.TIMESTAMP

            };



            if (!isEditRiderMode) {

                riderData.status = "Offline";

                riderData.createdAt = firebase.database.ServerValue.TIMESTAMP;

            }



            console.log("[saveRiderAccount] Writing rider data to DB path:", `riders/${uid}`);

            await Outlet.ref(`riders/${uid}`).update(riderData);



            // Verification Check

            const verifySnap = await Outlet.ref(`riders/${uid}`).once('value');

            if (verifySnap.exists()) {

                console.log("[saveRiderAccount] Database write verified successfully.");

                window.showToast(isEditRiderMode ? "Rider updated successfully!" : "Rider account created successfully!", "success");

            } else {

                console.error("[saveRiderAccount] Database write FAILED verification.");

                window.showToast("Warning: Database record failed to save.", "error");

            }

            hideRiderModal();

        } catch (e) {

            window.showToast("Operation failed: " + e.message, "error");

        }

    };



    window.resetRiderPassword = async (email) => {

        if (await window.showConfirm(`Send password reset link to ${email}?`, "Reset Password")) {

            firebase.auth().sendPasswordResetEmail(email)

                .then(() => window.showToast("Reset link sent to " + email, "success"))

                .catch(e => window.showToast("Error: " + e.message, "error"));

        }

    };



    // CUSTOMERS

    function loadCustomers() {

        const table = document.getElementById("customersTable");

        if (!table) return;



        // Fetch both to correlate

        Promise.all([

            Outlet.ref("customers").once("value"),

            Outlet.ref("orders").once("value")

        ]).then(([custSnap, orderSnap]) => {

            const orders = [];

            orderSnap.forEach(o => { orders.push(o.val()); });



            table.innerHTML = "";

            custSnap.forEach(child => {

                const c = child.val();

                const phone = child.key;



                // Calculate stats

                const myOrders = orders.filter(o => o.phone === phone);

                const orderCount = myOrders.length;

                const ltv = myOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);



                const displayPhone = phone.slice(0, 2) + "****" + phone.slice(-4);

                const truncatedAddress = c.address ? (c.address.length > 30 ? c.address.substring(0, 30) + "..." : c.address) : "No address saved";



                table.innerHTML += `

                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05)">

                    <td data-label="Name">

                        <div style="font-weight:600; color:var(--text-main)">${escapeHtml(c.name)}</div>

                        <small style="color:var(--text-muted); font-size:10px;">Joined: ${c.registeredAt ? new Date(c.registeredAt).toLocaleDateString() : 'N/A'}</small>

                    </td>

                    <td data-label="WhatsApp">

                        <a href="https://wa.me/91${phone.replace(/\D/g, "").slice(-10)}" target="_blank" style="color:var(--primary); text-decoration:none; display:flex; align-items:center; gap:5px;">

                             <i class="fab fa-whatsapp"></i> ${escapeHtml(displayPhone)}

                        </a>

                    </td>

                    <td data-label="Last Address">

                        <div style="font-size:12px; color:var(--text-main); max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(c.address || '')}">

                            ${escapeHtml(truncatedAddress)}

                        </div>

    ${c.locationLink ? `<a href="${escapeHtml(c.locationLink)}" target="_blank" style="color:var(--primary); font-size:10px; text-decoration:none;">📍 Map Link</a>` : ""}

                    </td>

                    <td data-label="Orders" style="font-weight:600; color:var(--vibrant-orange)">${orderCount}</td>

                    <td data-label="LTV" style="font-weight:700; color:var(--warm-yellow)">₹${ltv.toLocaleString()}</td>

                </tr>

            `;

            });

        });

    }



    // =============================

    // REPORTS & ANALYTICS

    // =============================

    function loadReports() {

        const now = new Date();

        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

        const lastDay = now.toISOString().split('T')[0];



        if (document.getElementById("reportFrom")) document.getElementById("reportFrom").value = firstDay;

        if (document.getElementById("reportTo")) document.getElementById("reportTo").value = lastDay;



        generateCustomReport();

    }



    let salesData = []; // Global for exports



    window.generateCustomReport = () => {

        const from = document.getElementById("reportFrom").value;

        const to = document.getElementById("reportTo").value;

        const tableBody = document.getElementById("reportTableBody");

        const container = document.getElementById("reportsContainer");



        if (!tableBody) return;



        tableBody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:30px;'>🔔 Collecting sales data...</td></tr>";



        Outlet.ref("orders").once("value", snap => {

            let totalRev = 0;

            let totalOrd = 0;

            salesData = [];



            snap.forEach(child => {

                const o = child.val();

                if (o.outlet && window.currentOutlet && o.outlet.toLowerCase().trim() !== window.currentOutlet.toLowerCase().trim()) return;

                if (o.status === "Cancelled") return;

                let itemDate;

                try {

                    itemDate = new Date(o.createdAt);

                } catch (e) { return; }



                if (isNaN(itemDate.getTime())) return;

                const dateStr = itemDate.toISOString().split('T')[0];



                if (dateStr >= from && dateStr <= to) {

                    totalRev += Number(o.total || 0);

                    totalOrd++;

                    salesData.push({ id: child.key, ...o, dateStr });

                }

            });



            // Update KPI Cards & Period

            const fromDate = from ? formatDate(new Date(from).getTime()) : "Start";

            const toDate = to ? formatDate(new Date(to).getTime()) : "Today";

            const periodEl = document.getElementById("reportPeriod");

            if (periodEl) periodEl.innerText = `${fromDate} to ${toDate}`;



            document.getElementById("reportRevenue").innerText = "₹" + totalRev.toLocaleString();

            document.getElementById("reportOrders").innerText = totalOrd;

            document.getElementById("reportAvg").innerText = "₹" + (totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0);



            // Sort by date descending

            salesData.sort((a, b) => b.createdAt - a.createdAt);



            // Render Table

            tableBody.innerHTML = salesData.map(o => `

            <tr class="report-row-bordered">

                <td data-label="Date" class="report-cell report-date-cell">${formatDate(o.createdAt)}</td>

                <td data-label="Customer" class="report-cell">

                     <div class="report-cust-name">${escapeHtml(o.customerName || 'Guest')}</div>

                    <div class="report-cust-phone">${escapeHtml(o.phone || '')}</div>

                </td>

                <td data-label="Total" class="report-cell report-total-cell">₹${o.total || 0}</td>

                <td data-label="Method" class="report-cell"><span class="badge badge-secondary">${escapeHtml(o.paymentMethod || 'COD')}</span></td>

                <td data-label="Items" class="report-cell">

                     <div class="text-muted-small text-truncate" style="max-width:250px;" title="${o.items ? o.items.map(i => `${escapeHtml(i.name)} x${i.quantity}`).join(', ') : ''}">

                        ${o.items ? o.items.map(i => `${escapeHtml(i.name)} x${i.quantity}`).join(', ') : 'Empty'}

                    </div>

                </td>

            </tr>

        `).join('') || "<tr><td colspan='5' class='report-cell text-center py-30 text-muted'>No orders found for this range</td></tr>";



            // Render visual chart

            renderRevenueChart(salesData);

        });

    };



    window.generateReport = window.generateCustomReport;



    let revenueChart; // Global chart instance

    function renderRevenueChart(data) {

        const ctx = document.getElementById('revenueChart');

        if (!ctx) return;



        // Aggregate by date

        const dailyData = {};

        data.forEach(o => {

            dailyData[o.dateStr] = (dailyData[o.dateStr] || 0) + Number(o.total || 0);

        });



        const labels = Object.keys(dailyData).sort();

        const values = labels.map(l => dailyData[l]);



        if (revenueChart) revenueChart.destroy();



        const isDarkMode = document.body.classList.contains('dark-mode');

        const tickColor = isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';

        const gridColor = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';



        revenueChart = new Chart(ctx, {

            type: 'line',

            data: {

                labels,

                datasets: [{

                    label: 'Daily Revenue',

                    data: values,

                    borderColor: '#FF6B00',

                    backgroundColor: 'rgba(255, 107, 0, 0.1)',

                    borderWidth: 3,

                    tension: 0.4,

                    fill: true,

                    pointBackgroundColor: '#FF6B00',

                    pointRadius: 4

                }]

            },

            options: {

                responsive: true,

                maintainAspectRatio: false,

                scales: {

                    y: {

                        beginAtZero: true,

                        grid: { color: gridColor },

                        ticks: { color: tickColor, font: { size: 10 } }

                    },

                    x: {

                        grid: { display: false },

                        ticks: { color: tickColor, font: { size: 10 } }

                    }

                },

                plugins: {

                    legend: { display: false }

                }

            }

        });





    }



    window.downloadExcel = () => {

        if (salesData.length === 0) {

            window.showToast("No data to export.", "info");

            return;

        }



        const data = salesData.map(o => ({

            Date: formatDate(o.createdAt),

            "Order ID": o.orderId || o.id,

            Customer: o.customerName || 'Guest',

            Phone: o.phone || '',

            Total: o.total || 0,

            Method: o.paymentMethod || 'COD',

            Status: o.status,

            Items: o.items ? o.items.map(i => `${i.name} x${i.quantity}`).join(', ') : ''

        }));



        const ws = XLSX.utils.json_to_sheet(data);

        const wb = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(wb, ws, "Sales Report");

        XLSX.writeFile(wb, `Sales_Report_${new Date().toISOString().split('T')[0]}.xlsx`);

    };



    window.downloadPDF = () => {
        if (salesData.length === 0) {
            alert("No data available to export. Generate a report first.");
            return;
        }

        if (!window.jspdf) {
            alert("PDF export library not ready. Please refresh and try again.");
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        if (typeof doc.autoTable !== 'function') {
            alert("PDF table plugin not ready. Please refresh and try again.");
            return;
        }

        doc.setFontSize(20);
        doc.text("Sales Report", 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);

        const from = document.getElementById("reportFrom").value;
        const to = document.getElementById("reportTo").value;
        doc.text(`Period: ${from} to ${to}`, 14, 30);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 36);

        const tableData = salesData.map(o => [
            formatDate(o.createdAt),
            o.customerName || 'Guest',
            `Rs. ${o.total}`,
            o.paymentMethod || 'COD',
            o.items ? o.items.map(i => `${i.name} x${i.quantity}`).join(', ') : ''
        ]);

        doc.autoTable({
            startY: 45,
            head: [['Date', 'Customer', 'Total', 'Method', 'Items']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [6, 95, 70] },
            columnStyles: {
                4: { cellWidth: 60 }
            }
        });
        doc.save(`Sales_Report_${from}_to_${to}.pdf`);
    };

    // SETTINGS

    window.loadSettings = async () => {

        const container = document.getElementById('settingsContainer');

        if (!container) return;



        try {

            container.innerHTML = `<div style="text-align:center; padding:100px; color:var(--text-muted);">🔔 Loading shop settings...</div>`;



            const [appSnap, uiSnap, botSnap] = await Promise.all([

                Outlet.ref("appConfig").once("value"),

                Outlet.ref("uiConfig").once("value"),

                Outlet.ref("settings/Bot").once("value")

            ]);



            const c = appSnap.val() || {};

            const u = uiSnap.val() || {};

            const b = botSnap.val() || {};



            container.innerHTML = `

            <div class="glass-card" style="padding: 3rem; max-width: 1000px; margin: 20px auto; border-radius: 30px; position:relative; overflow:hidden;">

                <!-- Decorative background elements -->

                <div style="position:absolute; top:-50px; right:-50px; width:200px; height:200px; background:var(--action-green); opacity:0.05; border-radius:50%; z-index:0;"></div>

                <div style="position:absolute; bottom:-50px; left:-50px; width:150px; height:150px; background:var(--alert-orange); opacity:0.05; border-radius:50%; z-index:0;"></div>



                <div style="position:relative; z-index:1;">

                    <div style="display:flex; align-items:center; gap:20px; margin-bottom:40px;">

                        <div style="background:var(--action-green); width:64px; height:64px; border-radius:18px; display:flex; align-items:center; justify-content:center; box-shadow:0 10px 20px rgba(6,95,70,0.2);">

            <span style="font-size:28px;">⚙️</span>

                        </div>

                        <div>

                            <h2 style="font-size:28px; font-weight:800; color:var(--text-main); margin:0; letter-spacing:-0.5px;">Shop Configuration</h2>

                            <p style="color:var(--text-muted); margin:4px 0 0; font-size:14px; font-weight:500;">Customize your store's identity and operational limits</p>

                        </div>

                    </div>



                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:30px;">

                        <!-- Left Column: Identity -->

                        <div style="display:flex; flex-direction:column; gap:25px;">

                            <div class="settings-group">

                                <label style="display:block; font-size:12px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">Shop Identity</label>

                                

                                <div style="margin-bottom:15px;">

                                    <label class="form-label" style="font-size:13px; font-weight:600;">Public Shop Name</label>

                                    <input type="text" id="setConfigName" value="${escapeHtml(c.shopName || '')}" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:600;">

                                </div>

                                

                                <div style="margin-bottom:15px;">

                                    <label class="form-label" style="font-size:13px; font-weight:600;">WhatsApp Support / Bot</label>

                                    <input type="text" id="setConfigPhone" value="${escapeHtml(c.whatsapp || '')}" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:600;">

                                </div>

                                

                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">

                                    <div>

                                        <label class="form-label" style="font-size:13px; font-weight:600;">Store Status</label>

                                        <select id="setConfigStatus" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:600;" title="Store Status">

                                            <option value="Open" ${c.status === 'Open' ? 'selected' : ''}>🟢 Open</option>

                                            <option value="Closed" ${c.status === 'Closed' ? 'selected' : ''}>🔴 Closed</option>

                                        </select>

                                    </div>

                                    <div>

                                        <label class="form-label" style="font-size:13px; font-weight:600;">Master OTP</label>

                                        <input type="text" id="setConfigMasterOTP" value="${escapeHtml(c.masterOTP || '0000')}" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:700; color:var(--action-green); text-align:center;">

                                    </div>

                                </div>



                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-top:15px;">

                                    <div>

                                        <label class="form-label" style="font-size:13px; font-weight:600;">Store Latitude</label>

                                        <input type="text" id="setConfigLat" value="${c.lat || ''}" class="form-input" placeholder="e.g. 25.8879" style="background:white; border:1.5px solid rgba(0,0,0,0.05);">

                                    </div>

                                    <div>

                                        <label class="form-label" style="font-size:13px; font-weight:600;">Store Longitude</label>

                                        <input type="text" id="setConfigLng" value="${c.lng || ''}" class="form-input" placeholder="e.g. 85.0261" style="background:white; border:1.5px solid rgba(0,0,0,0.05);">

                                    </div>

                                </div>

                            </div>

                        </div>



                        <!-- Right Column: Logistics -->

                        <div style="display:flex; flex-direction:column; gap:25px;">

                            <div class="settings-group">

                                <label style="display:block; font-size:12px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">Logistics & Branding</label>

                                

                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:15px;">

                                    <div>

                                        <label class="form-label" style="font-size:13px; font-weight:600;">Delivery Fee (₹)</label>

                                        <input type="number" id="setConfigFee" value="${c.deliveryFee || 0}" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:700;">

                                    </div>

                                    <div>

                                        <label class="form-label" style="font-size:13px; font-weight:600;">Min. Order (₹)</label>

                                        <input type="number" id="setConfigMinOrder" value="${c.minOrder || 0}" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:700;">

                                    </div>

                                </div>



                                <div style="margin-bottom:15px;">

                                    <label class="form-label" style="font-size:13px; font-weight:600;">Business Address</label>

                                    <textarea id="setConfigAddress" class="form-input" style="height: 64px; background:white; border:1.5px solid rgba(0,0,0,0.05); font-size:13px; font-weight:500;">${escapeHtml(c.address || '')}</textarea>

                                </div>



                                <div>

                                    <label class="form-label" style="font-size:13px; font-weight:600; margin-bottom:10px; display:block;">Store Banners (Click to Change)</label>

                                <div style="display:flex; gap:15px;">

                                    <div style="flex:1; cursor:pointer;" data-action="triggerClick" data-val="welcomeFile">

                                        <div style="position:relative; width:100%; height:80px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                            <img id="welcomePreview" src="${u.welcomeImage || 'https://via.placeholder.com/300x150'}" style="width:100%; height:100%; object-fit:cover;">

                                            <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.6); color:white; font-size:9px; text-align:center; padding:4px; font-weight:700;">WELCOME</div>

                                        </div>

                                        <input type="file" id="welcomeFile" style="display:none" data-action="previewImage" data-preview-id="welcomePreview">

                                        <input type="hidden" id="setUIWelcome" value="${u.welcomeImage || ''}">

                                    </div>

                                    <div style="flex:1; cursor:pointer;" data-action="triggerClick" data-val="menuFile">

                                        <div style="position:relative; width:100%; height:80px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                            <img id="menuBannerPreview" src="${u.menuImage || 'https://via.placeholder.com/300x150'}" style="width:100%; height:100%; object-fit:cover;">

                                            <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.6); color:white; font-size:9px; text-align:center; padding:4px; font-weight:700;">MENU BANNER</div>

                                        </div>

                                        <input type="file" id="menuFile" style="display:none" data-action="previewImage" data-preview-id="menuBannerPreview">

                                        <input type="hidden" id="setUIMenu" value="${u.menuImage || ''}">

                                    </div>

                                </div>

                            </div>

                        </div>

                    </div>



                    <!-- WhatsApp Bot Aesthetics Section -->

                    <div style="margin-top:40px; border-top:1px solid rgba(0,0,0,0.05); padding-top:30px;">

                        <label style="display:block; font-size:12px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:20px;">WhatsApp Bot Aesthetics (Per Outlet)</label>

                        

                        <div style="display:grid; grid-template-columns: 2fr 3fr; gap:30px;">

                            <!-- Welcome Image -->

                            <div class="settings-group">

                                <label class="form-label" style="font-size:13px; font-weight:600; margin-bottom:12px; display:block;">Bot Welcome / Intro Image</label>

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botWelcomeFile">

                                    <div style="position:relative; width:100%; height:180px; border-radius:18px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botWelcomePreview" src="${b.imgWelcome || 'https://via.placeholder.com/600x300?text=Welcome+Image'}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; inset:0; background:linear-gradient(to top, rgba(0,0,0,0.6), transparent); display:flex; align-items:flex-end; justify-content:center; padding-bottom:10px;">

                                            <span style="color:white; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Change Greeting Image</span>

                                        </div>

                                    </div>

                                    <input type="file" id="botWelcomeFile" style="display:none" data-action="previewImage" data-preview-id="botWelcomePreview">

                                    <input type="hidden" id="setBotWelcome" value="${b.imgWelcome || ''}">

                                </div>

                            </div>



                            <!-- Status Update Images -->

                            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:15px;">

                                <!-- Confirmed -->

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botConfirmedFile">

                                    <div style="position:relative; width:100%; height:85px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botConfirmedPreview" src="${b.imgConfirmed || 'https://via.placeholder.com/150?text=Confirmed'}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(6,95,70,0.8); color:white; font-size:8px; text-align:center; padding:3px; font-weight:700;">CONFIRMED</div>

                                    </div>

                                    <input type="file" id="botConfirmedFile" style="display:none" data-action="previewImage" data-preview-id="botConfirmedPreview">

                                    <input type="hidden" id="setBotConfirmed" value="${b.imgConfirmed || ''}">

                                </div>

                                <!-- Preparing -->

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botPreparingFile">

                                    <div style="position:relative; width:100%; height:85px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botPreparingPreview" src="${b.imgPreparing || 'https://via.placeholder.com/150?text=Preparing'}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(217&#8377;19,6,0.8); color:white; font-size:8px; text-align:center; padding:3px; font-weight:700;">PREPARING</div>

                                    </div>

                                    <input type="file" id="botPreparingFile" style="display:none" data-action="previewImage" data-preview-id="botPreparingPreview">

                                    <input type="hidden" id="setBotPreparing" value="${b.imgPreparing || ''}">

                                </div>

                                <!-- Cooked -->

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botCookedFile">

                                    <div style="position:relative; width:100%; height:85px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botCookedPreview" src="${b.imgCooked || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%23999'%3ECooked%3C/text%3E%3C/svg%3E"}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(31,41,55,0.8); color:white; font-size:8px; text-align:center; padding:3px; font-weight:700;">COOKED</div>

                                    </div>

                                    <input type="file" id="botCookedFile" style="display:none" data-action="previewImage" data-preview-id="botCookedPreview">

                                    <input type="hidden" id="setBotCooked" value="${b.imgCooked || ''}">

                                </div>

                                <!-- Out -->

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botOutFile">

                                    <div style="position:relative; width:100%; height:85px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botOutPreview" src="${b.imgOut || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%23999'%3EOut%3C/text%3E%3C/svg%3E"}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(37,99,235,0.8); color:white; font-size:8px; text-align:center; padding:3px; font-weight:700;">OUT FOR DEL.</div>

                                    </div>

                                    <input type="file" id="botOutFile" style="display:none" data-action="previewImage" data-preview-id="botOutPreview">

                                    <input type="hidden" id="setBotOut" value="${b.imgOut || ''}">

                                </div>

                                <!-- Delivered -->

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botDeliveredFile">

                                    <div style="position:relative; width:100%; height:85px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botDeliveredPreview" src="${b.imgDelivered || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%23999'%3EDelivered%3C/text%3E%3C/svg%3E"}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(5&#8377;50&#8377;05,0.8); color:white; font-size:8px; text-align:center; padding:3px; font-weight:700;">DELIVERED</div>

                                    </div>

                                    <input type="file" id="botDeliveredFile" style="display:none" data-action="previewImage" data-preview-id="botDeliveredPreview">

                                    <input type="hidden" id="setBotDelivered" value="${b.imgDelivered || ''}">

                                </div>

                                <!-- Feedback -->

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botFeedbackFile">

                                    <div style="position:relative; width:100%; height:85px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botFeedbackPreview" src="${b.imgFeedback || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%23999'%3EFeedback%3C/text%3E%3C/svg%3E"}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(124,58,237,0.8); color:white; font-size:8px; text-align:center; padding:3px; font-weight:700;">FEEDBACK</div>

                                    </div>

                                    <input type="file" id="botFeedbackFile" style="display:none" data-action="previewImage" data-preview-id="botFeedbackPreview">

                                    <input type="hidden" id="setBotFeedback" value="${b.imgFeedback || ''}">

                                </div>

                                <!-- Cancelled -->

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botCancelledFile">

                                    <div style="position:relative; width:100%; height:85px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botCancelledPreview" src="${b.imgCancelled || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%23999'%3ECancelled%3C/text%3E%3C/svg%3E"}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(153,27,27,0.8); color:white; font-size:8px; text-align:center; padding:3px; font-weight:700;">CANCELLED</div>

                                    </div>

                                    <input type="file" id="botCancelledFile" style="display:none" data-action="previewImage" data-preview-id="botCancelledPreview">

                                    <input type="hidden" id="setBotCancelled" value="${b.imgCancelled || ''}">

                                </div>

                            </div>

                        </div>

                    </div>



                    <div style="margin-top: 50px; text-align: center; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 35px;">

                        <button data-action="saveSettings" class="btn-primary" style="margin: 0 auto; width: 340px; justify-content: center; padding: 18px; border-radius: 18px; font-size: 16px; font-weight: 800; box-shadow: 0 15px 30px rgba(6,95,70,0.2); letter-spacing:0.5px;">

                            💾 SAVE SYSTEM CONFIGURATION

                        </button>

                    </div>

                </div>

            </div>

        `;

        } catch (err) {

            console.error("Load Settings Error:", err);

            container.innerHTML = `<div style="text-align:center; padding:100px; color:var(--text-muted);">❌ Failed to load settings. Check console.</div>`;

        }

    }



    window.saveSettings = async () => {

        const shopName = document.getElementById("setConfigName").value;

        const fee = document.getElementById("setConfigFee").value;

        const minOrder = document.getElementById("setConfigMinOrder").value;

        const addr = document.getElementById("setConfigAddress").value;

        const whatsapp = document.getElementById("setConfigPhone").value;

        const status = document.getElementById("setConfigStatus").value;

        const masterOTP = document.getElementById("setConfigMasterOTP").value;

        const lat = document.getElementById("setConfigLat").value;

        const lng = document.getElementById("setConfigLng").value;



        let welcome = document.getElementById("setUIWelcome").value;

        let menu = document.getElementById("setUIMenu").value;



        const welcomeFile = document.getElementById("welcomeFile").files[0];

        const menuFile = document.getElementById("menuFile").files[0];



        const btn = document.querySelector("#settingsContainer .btn-primary");

        const originalText = btn ? btn.innerText : "Save Settings";

        if (btn) {

            btn.disabled = true;

            btn.innerText = "Processing...";

        }



        try {

            if (welcomeFile) {

                const oldWelcome = welcome;

                welcome = await uploadImage(welcomeFile, `banners/welcome_${Date.now()}`);

                if (oldWelcome && welcome !== oldWelcome) {

                    await deleteImage(oldWelcome);

                }

            }

            if (menuFile) {

                const oldMenu = menu;

                menu = await uploadImage(menuFile, `banners/menu_${Date.now()}`);

                if (oldMenu && menu !== oldMenu) {

                    await deleteImage(oldMenu);

                }

            }



            const botImageKeys = [

                { key: 'imgWelcome', fileId: 'botWelcomeFile', hiddenId: 'setBotWelcome' },

                { key: 'imgConfirmed', fileId: 'botConfirmedFile', hiddenId: 'setBotConfirmed' },

                { key: 'imgPreparing', fileId: 'botPreparingFile', hiddenId: 'setBotPreparing' },

                { key: 'imgCooked', fileId: 'botCookedFile', hiddenId: 'setBotCooked' },

                { key: 'imgOut', fileId: 'botOutFile', hiddenId: 'setBotOut' },

                { key: 'imgDelivered', fileId: 'botDeliveredFile', hiddenId: 'setBotDelivered' },

                { key: 'imgFeedback', fileId: 'botFeedbackFile', hiddenId: 'setBotFeedback' },

                { key: 'imgCancelled', fileId: 'botCancelledFile', hiddenId: 'setBotCancelled' }

            ];



            const botSettings = {};

            for (const item of botImageKeys) {

                const hiddenInput = document.getElementById(item.hiddenId);

                const fileInput = document.getElementById(item.fileId);

                if (!hiddenInput || !fileInput) continue;



                let val = hiddenInput.value;

                const file = fileInput.files[0];

                if (file) {

                    val = await uploadImage(file, `bot/${item.key}_${Date.now()}`);

                }

                botSettings[item.key] = val;

            }

            await Outlet.ref("settings/Bot").update(botSettings);



            await Outlet.ref("appConfig").update({

                shopName,

                deliveryFee: Number(fee),

                minOrder: Number(minOrder),

                address: addr,

                whatsapp,

                status,

                masterOTP,

                lat: (lat !== undefined && lat !== null && lat !== "") ? Number(lat) : null,

                lng: (lng !== undefined && lng !== null && lng !== "") ? Number(lng) : null

            });

            await Outlet.ref("uiConfig").update({ welcomeImage: welcome, menuImage: menu });



            const sidebarHeader = document.querySelector(".sidebar-header");

            if (sidebarHeader) {

                sidebarHeader.innerText = shopName.split(" ")[0].toUpperCase() + " ERP";

            }



            window.showToast("Settings updated successfully!", "success");

            loadSettings();

        } catch (e) {

            window.showToast("Error saving settings: " + e.message, "error");

        } finally {

            if (btn) {

                btn.disabled = false;

                btn.innerText = originalText;

            }

        }

    };



    // DASHBOARD HELPERS



    // ACTIONS

    window.updateStatus = (id, status) => {

        if (!status) return;

        window.haptic(20);



        if (status === "Delivered") {

            return window.openPaymentModal(id);

        }



        const updates = {

            status: status,

            updatedAt: firebase.database.ServerValue.TIMESTAMP

        };



        if (status === "Ready" || status === "Cooked") {

            updates.readyAt = firebase.database.ServerValue.TIMESTAMP;

        } else if (status === "Out for Delivery") {

            updates.dispatchedAt = firebase.database.ServerValue.TIMESTAMP;

        }



        return Outlet.ref("orders/" + id).update(updates)

            .then(() => {

                window.showToast(`Order status updated to "${status}"`, 'success');

            })

            .catch(err => {

                console.error("[StatusUpdate Error]", err);

                window.showToast("Failed to update status: " + err.message, 'error');

            });

    };



    window.openPaymentModal = (id) => {

        const existing = document.getElementById('paymentModal');

        if (existing) existing.remove();



        const order = ordersMap.get(id);

        const total = order ? order.total : '...';



        const modal = document.createElement('div');

        modal.id = 'paymentModal';

        modal.style = `

        position: fixed; top: 0; left: 0; width: 100%; height: 100%;

        background: rgba(0,0,0,0.8); backdrop-filter: blur(8px);

        display: flex; align-items: center; justify-content: center; z-index: 10000;

        animation: fadeIn 0.3s ease;

    `;



        modal.innerHTML = `

        <div class="payment-modal-card">

            <div style="text-align: center; margin-bottom: 25px;">

                <div class="payment-modal-badge">Payment Settlement</div>

                <h2 class="payment-modal-total">₹${total}</h2>

                <p style="color: #666; font-size: 14px; margin-top: 5px;">Select payment method used for this delivery</p>

            </div>

            

            <div style="display: flex; flex-direction: column; gap: 12px;">

                <button data-action="saveDeliveredOrder" data-id="${id}" data-val="Cash" class="pay-option-btn cash">

                    <span style="font-size: 24px;">💵</span>

                    <div style="text-align: left;">

                        <div style="font-weight: 800; font-size: 16px;">Cash</div>

                        <div style="font-size: 11px; opacity: 0.7;">Received by Hand</div>

                    </div>

                </button>

                <button data-action="saveDeliveredOrder" data-id="${id}" data-val="UPI" class="pay-option-btn upi">

                    <span style="font-size: 24px;">📱</span>

                    <div style="text-align: left;">

                        <div style="font-weight: 800; font-size: 16px;">UPI / Online</div>

                        <div style="font-size: 11px; opacity: 0.7;">GPay, PhonePe, etc.</div>

                    </div>

                </button>

                <button data-action="saveDeliveredOrder" data-id="${id}" data-val="Card" class="pay-option-btn card">

                    <span style="font-size: 24px;">💳</span>

                    <div style="text-align: left;">

                        <div style="font-weight: 800; font-size: 16px;">Card</div>

                        <div style="font-size: 11px; opacity: 0.7;">Debit / Credit Card</div>

                    </div>

                </button>

            </div>



            <button data-action="removeElement" data-target-id="paymentModal" class="payment-modal-cancel">CANCEL</button>

        </div>

    `;



        document.body.appendChild(modal);

    };



    window.saveDeliveredOrder = async (id, method) => {

        window.haptic(30);

        const buttons = document.querySelectorAll(`.pay-option-btn`);

        buttons.forEach(btn => btn.disabled = true);



        try {

            await Outlet.ref("orders/" + id).update({

                status: "Delivered",

                paymentMethod: method,

                paymentStatus: "Paid",

                updatedAt: firebase.database.ServerValue.TIMESTAMP

            });



            window.showToast(`Order marked Delivered via ${method}`, 'success');

            const modal = document.getElementById('paymentModal');

            if (modal) modal.remove();

        } catch (err) {

            console.error("[DeliveredSave Error]", err);

            window.showToast("Failed to finalize order: " + err.message, 'error');

            buttons.forEach(btn => btn.disabled = false);

        }

    };





    window.assignRider = async (id, riderEmail) => {

        if (!id || !riderEmail) {

            window.showToast('Invalid order ID or rider selection.', 'error');

            return;

        }



        try {

            // Verify the order exists before attempting assignment

            const orderSnap = await Outlet.ref('orders/' + id).once('value');

            if (!orderSnap.exists()) {

                window.showToast('Order not found.', 'error');

                return;

            }



            await Outlet.ref('orders/' + id).update({

                assignedRider: riderEmail,

                status: 'Out for Delivery'

            });

            window.showToast('Rider assigned successfully.', 'success');

        } catch (err) {

            console.error('[assignRider] Error:', err);

            window.showToast('Failed to assign rider. Please try again.', 'error');

        }

    };

    window.toggleWifiPass = () => {

        const passInput = document.getElementById('settingWifiPass');

        if (passInput.type === 'password') {

            passInput.type = 'text';

        } else {

            passInput.type = 'password';

        }

    };



    window.toggleRiderPass = () => {

        const passInput = document.getElementById('riderPass');

        if (passInput.type === 'password') {

            passInput.type = 'text';

        } else {

            passInput.type = 'password';

        }

    };



    async function loadLostSales() {

        console.log("[Lost Sales] Loading records...");

        const tbody = document.getElementById('lostSalesTableBody');

        const revenueBadge = document.querySelector('#lostSalesTotalRevenue span');

        if (!tbody) return;



        try {

            const snap = await Outlet.ref('lostSales').once('value');

            const data = snap.val();



            tbody.innerHTML = '';

            let totalLost = 0;



            if (!data) {

                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:80px; color:var(--text-muted);">

                <div class="mb-14" style="font-size:32px;">🛍️ </div>

                <strong>No lost sales found!</strong><br>All your customers are reaching the finish line.

            </td></tr>`;

                if (revenueBadge) revenueBadge.innerText = `₹0`;

                return;

            }



            const sorted = Object.entries(data).sort((a, b) => (b[1].cancelledAt || 0) - (a[1].cancelledAt || 0));



            sorted.forEach(([id, record]) => {

                const val = record.total || 0;

                totalLost += val;



                const itemsStr = (record.items || []).map(i => `${i.name} (${i.size})`).join(', ');

                const ts = formatDate(record.cancelledAt);

                const source = record.sourceStep || 'Checkout';



                const phone = record.phone || 'N/A';

                const whatsappLink = `https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}`;



                const tr = document.createElement('tr');

                tr.innerHTML = `

                <td style="padding-left:25px;">

                    <div class="font-bold text-main">${ts}</div>

                    <div class="text-muted-small" style="font-size:10px;">ID: ...${id.slice(-6)}</div>

                </td>

                <td>

                    <div class="flex-column">

                        <span class="font-bold">${escapeHtml(record.customerName || 'Guest')}</span>

                        <a href="${whatsappLink}" target="_blank" class="text-primary font-bold" style="font-size:12px;">📱 ${escapeHtml(phone)}</a>

                    </div>

                </td>

                <td>

                    <span class="status-pill" style="background:rgba(0,0,0,0.05); color:var(--text-dark); border:1px solid rgba(0,0,0,0.1); font-size:10px;">

                        ${escapeHtml(source)}

                    </span>

                </td>

                <td style="max-width:250px;">

                    <div class="text-truncate-2" title="${escapeHtml(itemsStr)}">${escapeHtml(itemsStr)}</div>

                </td>

                <td style="padding-right:25px; text-align:right;">

                    <span class="font-black" style="font-size:16px; color:var(--text-dark);">₹${val}</span>

                </td>

            `;

                tbody.appendChild(tr);

            });



            if (revenueBadge) revenueBadge.innerText = `₹${totalLost.toLocaleString()}`;



        } catch (e) {

            console.error("Load Lost Sales Error:", e);

            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:red;">Error loading data. Check console.</td></tr>`;

        }

    }



    async function clearLostSales() {

        if (!(await window.showConfirm("Are you sure you want to permanently delete all Lost Sales logs? This cannot be undone.", "Clear Lost Sales"))) return;



        window.haptic(20);

        try {

            await Outlet.ref('lostSales').remove();

            window.showToast("Logs cleared successfully", "success");

            loadLostSales();

        } catch (e) {

            console.error("Clear Logs Error:", e);

            window.showToast("Failed to clear logs", "error");

        }

    }

    window.loadLostSales = loadLostSales;

    window.loadMenu = loadMenu;

    window.loadCategories = loadCategories;

    window.clearLostSales = clearLostSales;



    let cachedDishes = [];



    const catEmoji = {

        'pizza': '🍕', 'burger': '🍔', 'cake': '🎂', 'pastry': '🍰',

        'sandwich': '🥪', 'drink': '🥤', 'beverage': '🥤', 'juice': '🧃',

        'ice cream': '🍦', 'dessert': '🍰', 'pasta': '🍝', 'salad': '🥗',

        'fries': '🍟', 'chicken': '🍗', 'noodles': '🍜', 'biryani': '🥘',

        'thali': '🍕', 'combo': '🎁', 'wrap': '🌯', 'coffee': '☕',

        'shake': '🥤', 'mocktail': '🍹'

    };



    function getCatEmoji(category) {

        if (!category) return '🍕';

        const lower = category.toLowerCase();

        for (const [key, emoji] of Object.entries(catEmoji)) {

            if (lower.includes(key)) return emoji;

        }

        return '🍕';

    }



    function loadWalkinMenu() {

        const grid = document.getElementById('walkinDishGrid');

        if (!grid) return;



        renderWalkinCategoryTabs();



        Outlet.ref(`dishes`).once('value').then(snap => {

            allWalkinDishes = [];

            snap.forEach(child => {

                allWalkinDishes.push({ id: child.key, ...child.val() });

            });



            if (allWalkinDishes.length === 0) {

                grid.innerHTML = '<p class="menu-loading-placeholder">No dishes found. Add dishes in Menu → Dishes first.</p>';

                return;

            }



            applyWalkinFilters();



            const search = document.getElementById('walkinDishSearch');

            if (search) search.oninput = () => applyWalkinFilters();



            const phoneInput = document.getElementById('walkinCustPhone');

            if (phoneInput) {

                phoneInput.oninput = () => {

                    const phone = phoneInput.value.trim();

                    if (phone.length === 10) checkWalkinCustomer(phone);

                };

            }

        });

    }



    function filterWalkinByCategory(catName, el) {

        activeWalkinCategory = catName;

        // Update active tab styling

        document.querySelectorAll('.category-tab').forEach(tab => tab.classList.remove('active'));

        if (el) {

            el.classList.add('active');

        } else {

            // Fallback: match by text content if no element reference passed

            document.querySelectorAll('.category-tab').forEach(tab => {

                if (tab.textContent.trim() === catName) tab.classList.add('active');

            });

        }

        applyWalkinFilters();

    }



    function applyWalkinFilters() {

        const search = document.getElementById('walkinDishSearch');

        const term = search ? search.value.toLowerCase() : "";



        const filtered = allWalkinDishes.filter(d => {

            const matchesSearch = d.name.toLowerCase().includes(term);

            const matchesCat = activeWalkinCategory === 'All' || d.category === activeWalkinCategory;

            return matchesSearch && matchesCat;

        });



        renderWalkinDishGrid(filtered);

    }



    async function checkWalkinCustomer(phone) {

        try {

            const snap = await Outlet.ref(`customers/${phone}`).once('value');

            if (snap.exists()) {

                const data = snap.val();

                const nameInput = document.getElementById('walkinCustName');

                if (nameInput) {

                    nameInput.value = data.name || "";

                    window.showToast('✔️ Returning Customer: ' + data.name, 'success');

                }

            }

        } catch (e) { console.error(e); }

    }



    window.setDiscount = (val) => {

        const el = document.getElementById('walkinDiscount');

        if (el) {

            el.value = val;

            updateWalkinTotal();

        }

    };



    window.setDiscountPct = (pct) => {

        let subtotal = 0;

        Object.values(walkinCart).forEach(item => subtotal += item.price * item.qty);

        const val = Math.round(subtotal * (pct / 100));

        window.setDiscount(val);

    };



    window.clearWalkinCart = async () => {

        if (Object.keys(walkinCart).length === 0) return;

        if (await window.showConfirm('Clear entire order?', 'Clear Cart')) {

            walkinCart = {};

            document.getElementById('walkinDiscount').value = 0;

            document.getElementById('walkinCustName').value = '';

            document.getElementById('walkinCustPhone').value = '';

            const noteEl = document.getElementById('walkinCustNote');

            if (noteEl) noteEl.value = '';

            renderWalkinCart();

            window.showToast("Cart cleared", "info");

        }

    };



    let pendingAddonsByDish = {};



    function renderWalkinDishGrid(dishes) {

        const grid = document.getElementById('walkinDishGrid');

        if (!grid) return;

        grid.innerHTML = '';



        dishes.forEach(d => {

            const dishId = d.id;

            const card = document.createElement('div');

            card.className = 'walkin-dish-card' + (d.stock === false ? ' out-of-stock' : '');

            card.dataset.id = dishId;



            let sizes = d.sizes || {};

            if (Object.keys(sizes).length === 0) {

                sizes = { "Regular": d.price || 0 };

            }



            const sizeOptions = Object.entries(sizes).map(([name, price]) =>

                `<option value="${escapeHtml(name)}" data-price="${price}">${escapeHtml(name)} - ₹${price}</option>`

            ).join('');



            card.innerHTML = `

            <div class="dish-emoji">${getCatEmoji(d.category)}</div>

            <div class="dish-name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>

            

            <div class="dish-controls">

                <select class="dish-size-select" id="size_${dishId}">

                    ${sizeOptions}

                </select>

                

                <div class="dish-qty-row">

                    <button class="qty-btn-sm" data-action="adjustCardQty" data-id="${dishId}" data-delta="-1">-</button>

                    <span class="qty-val-sm" id="qty_${dishId}">1</span>

                    <button class="qty-btn-sm" data-action="adjustCardQty" data-id="${dishId}" data-delta="1">+</button>

                </div>

                

                <div class="dish-action-row">

                    <button class="btn-card-add" data-action="addToWalkinCartFromCard" data-id="${dishId}">ADD</button>

                    <button class="btn-card-addon" data-action="showAddonView" data-id="${dishId}" title="Configure Add-ons">⚙️</button>

                </div>

            </div>

        `;



            grid.appendChild(card);

        });

    }



    window.adjustCardQty = (dishId, delta) => {

        const el = document.getElementById(`qty_${dishId}`);

        if (!el) return;

        let val = parseInt(el.innerText);

        val = Math.max(1, val + delta);

        el.innerText = val;

    };



    window.showAddonView = (dishId) => {

        const dish = allWalkinDishes.find(d => d.id === dishId);

        if (!dish) return;



        const dishGrid = document.getElementById('walkinDishGrid');

        const addonGrid = document.getElementById('walkinAddonsGrid');

        const walkinTitle = document.querySelector('#tab-walkin .panel-title');

        const searchBox = document.getElementById('walkinDishSearch');



        if (!dishGrid || !addonGrid) return;



        dishGrid.classList.add('hidden');

        addonGrid.classList.remove('hidden');

        if (searchBox) searchBox.classList.add('hidden');



        walkinTitle.innerHTML = '';

        const backBtn = document.createElement('button');

        backBtn.dataset.action = "hideAddonView";

        backBtn.className = 'btn-text';

        backBtn.style.padding = '0';

        backBtn.style.marginRight = '10px';

        backBtn.innerHTML = '<i data-lucide="arrow-left"></i>';



        const titleSpan = document.createElement('span');

        titleSpan.className = 'title-text';

        titleSpan.textContent = `Add-ons: ${dish.name}`;



        walkinTitle.appendChild(backBtn);

        walkinTitle.appendChild(titleSpan);



        if (typeof lucide !== 'undefined') lucide.createIcons();



        addonGrid.innerHTML = "";

        const cat = categories.find(c => c.name === dish.category);

        if (!cat || !cat.addons) {

            addonGrid.innerHTML = `<p class='p-20 text-muted center-text'>No add-ons available for this category.</p>`;

        } else {

            Object.entries(cat.addons).forEach(([name, price]) => {

                const isSelected = (pendingAddonsByDish[dishId] || []).includes(name);

                const item = document.createElement('div');

                item.className = `addon-picker-item ${isSelected ? 'active' : ''}`;

                item.innerHTML = `

                <div class="flex-row flex-center flex-gap-8">

                    <input type="checkbox" ${isSelected ? 'checked' : ''} style="pointer-events:none;">

                    <span class="fs-12 font-weight-700">${escapeHtml(name)}</span>

                </div>

                <span class="fs-12 font-weight-800 color-green">₹${price}</span>

            `;

                item.onclick = (e) => {

                    if (!pendingAddonsByDish[dishId]) pendingAddonsByDish[dishId] = [];

                    const idx = pendingAddonsByDish[dishId].indexOf(name);

                    if (idx === -1) {

                        pendingAddonsByDish[dishId].push(name);

                        item.classList.add('active');

                        item.querySelector('input').checked = true;

                    } else {

                        pendingAddonsByDish[dishId].splice(idx, 1);

                        item.classList.remove('active');

                        item.querySelector('input').checked = false;

                    }

                };

                addonGrid.appendChild(item);

            });

        }



        const doneBtn = document.createElement('button');

        doneBtn.className = "btn-primary w-full mt-20";

        doneBtn.innerText = "Apply & Return";

        doneBtn.onclick = hideAddonView;

        addonGrid.appendChild(doneBtn);

    };



    window.hideAddonView = () => {

        const dishGrid = document.getElementById('walkinDishGrid');

        const addonGrid = document.getElementById('walkinAddonsGrid');

        const walkinTitle = document.querySelector('#tab-walkin .panel-title');

        const searchBox = document.getElementById('walkinDishSearch');



        if (dishGrid) dishGrid.classList.remove('hidden');

        if (addonGrid) addonGrid.classList.remove('hidden');

        if (searchBox) searchBox.classList.remove('hidden');

        if (walkinTitle) walkinTitle.innerHTML = `🍕 Select Items`;

    };



    window.addToWalkinCartFromCard = (dishId) => {

        const dish = allWalkinDishes.find(d => d.id === dishId);

        if (!dish) return;



        const sizeEl = document.getElementById(`size_${dishId}`);

        const qtyEl = document.getElementById(`qty_${dishId}`);

        if (!sizeEl || !qtyEl) return;



        const sizeName = sizeEl.value;

        const basePrice = Number(sizeEl.options[sizeEl.selectedIndex].dataset.price);

        const qty = parseInt(qtyEl.innerText);

        const addonNames = pendingAddonsByDish[dishId] || [];



        const cat = categories.find(c => c.name === dish.category);

        const addons = addonNames.map(name => ({

            name,

            price: (cat && cat.addons) ? (cat.addons[name] || 0) : 0

        }));



        const pricePerItem = basePrice + addons.reduce((sum, a) => sum + a.price, 0);

        const cartKey = `${dishId}::${sizeName}::${addonNames.sort().join('|')}`;



        if (walkinCart[cartKey]) {

            walkinCart[cartKey].qty += qty;

        } else {

            walkinCart[cartKey] = {

                id: dishId,

                name: dish.name,

                category: dish.category,

                size: sizeName,

                price: pricePerItem,

                qty: qty,

                addons: addons

            };

        }



        renderWalkinCart();

        haptic(20);

        window.showToast(`✔ Added ${qty}x ${dish.name}`, 'success');

    };



    function addToWalkinCart(id, name, price, size = "Regular") {

        const cartKey = id + "::" + size;

        if (walkinCart[cartKey]) {

            walkinCart[cartKey].qty++;

        } else {

            walkinCart[cartKey] = { id, name, price, qty: 1, size };

        }

        renderWalkinCart();

    }



    function removeFromWalkinCart(id) {

        delete walkinCart[id];

        renderWalkinCart();

    }



    window.walkinQtyChange = (id, delta) => {

        if (!walkinCart[id]) return;

        walkinCart[id].qty += delta;

        if (walkinCart[id].qty <= 0) {

            delete walkinCart[id];

        }

        renderWalkinCart();

    };



    window.walkinRemoveItem = (id) => removeFromWalkinCart(id);



    function renderWalkinCart() {

        const container = document.getElementById('walkinCartItems');

        if (!container) return;



        const keys = Object.keys(walkinCart);

        if (keys.length === 0) {

            container.innerHTML = '<p id="walkinEmptyMsg" style="color:var(--text-muted); font-size:13px; text-align:center; padding:30px 0;">Tap dishes to add them here</p>';

            updateWalkinTotal();

            updateMobileCartSummaryState();

            return;

        }



        container.innerHTML = '';

        Object.entries(walkinCart).forEach(([key, item]) => {

            const div = document.createElement('div');

            div.className = 'walkin-cart-item';



            const addonsText = item.addons && item.addons.length > 0

                ? `<div class="item-addons-list">+ ${item.addons.map(a => escapeHtml(a.name)).join(', ')}</div>`

                : '';



            div.innerHTML = `

            <div class="item-info">

                <div class="item-main">

                    <div class="item-name">${escapeHtml(item.name)}</div>

                    <div class="item-variant">${escapeHtml(item.size)} - ₹${escapeHtml(item.price)}</div>

                </div>

                ${addonsText}

                <button class="btn-text-primary small-btn mt-4" data-action="openCartAddonPicker" data-id="${escapeHtml(key)}">+ Addons</button>

            </div>

            <div class="item-controls">

                <div class="qty-btn" data-action="walkinQtyChange" data-id="${escapeHtml(key)}" data-delta="-1">-</div>

                <div class="qty-val">${item.qty}</div>

                <div class="qty-btn" data-action="walkinQtyChange" data-id="${escapeHtml(key)}" data-delta="1">+</div>

                <div class="remove-btn" data-action="walkinRemoveItem" data-id="${escapeHtml(key)}">&times;</div>

            </div>

        `;

            container.appendChild(div);

        });



        updateWalkinTotal();

        updateMobileCartSummaryState();

    }



    window.selectWalkinPayment = (method, el) => {

        walkinPayMethod = method;

        document.querySelectorAll('.walkin-pay-btn').forEach(btn => btn.classList.remove('active'));

        if (el) el.classList.add('active');

        else {

            const target = document.querySelector(`.walkin-pay-btn[data-method="${method}"]`);

            if (target) target.classList.add('active');

        }

    };





    window.updateWalkinTotal = () => {

        let subtotal = 0;

        let itemCount = 0;

        Object.values(walkinCart).forEach(item => {

            subtotal += item.price * item.qty;

            itemCount += item.qty;

        });



        const discount = Math.max(0, Number(document.getElementById('walkinDiscount')?.value) || 0);

        const total = Math.max(0, subtotal - discount);



        const subEl = document.getElementById('walkinSubtotal');

        const totalEl = document.getElementById('walkinTotal');

        if (subEl) subEl.textContent = '₹' + subtotal.toLocaleString();

        if (totalEl) totalEl.textContent = '₹' + total.toLocaleString();

    };



    window.toggleMobileCart = (show) => {

        const cartEl = document.querySelector('#tab-walkin .walkin-cart');

        if (!cartEl) return;

        if (show) {

            cartEl.classList.add('active');

            document.body.style.overflow = 'hidden';

        } else {

            cartEl.classList.remove('active');

            document.body.style.overflow = 'auto';

        }

    };



    window.selectPayMethod = (btn) => {

        document.querySelectorAll('.walkin-pay-btn').forEach(b => b.classList.remove('active'));

        btn.classList.add('active');

        walkinPayMethod = btn.dataset.method;

    };



    window.submitWalkinSale = async () => {

        if (Object.keys(walkinCart).length === 0) {

            window.showToast('Please add at least one item to the cart.', 'error');

            return;

        }



        const custNote = document.getElementById('walkinCustNote')?.value.trim() || '';

        const custName = document.getElementById('walkinCustName')?.value.trim() || 'Walk-in Customer';

        const custPhoneRaw = document.getElementById('walkinCustPhone')?.value.trim() || '';

        let custPhone = custPhoneRaw.replace(/\D/g, '');

        if (custPhone.length === 10) custPhone = '91' + custPhone;



        const discount = Math.max(0, Number(document.getElementById('walkinDiscount')?.value) || 0);



        let subtotal = 0;

        const items = Object.keys(walkinCart).map(key => {

            const item = walkinCart[key];

            subtotal += item.price * item.qty;

            return {

                dishId: item.id,

                name: item.name,

                price: item.price,

                quantity: item.qty,

                size: item.size,

                addons: item.addons || null

            };

        });



        const total = Math.max(0, subtotal - discount);



        const orderId = await generateNextOrderId();



        const orderData = {

            orderId,

            customerName: custName,

            phone: custPhone,

            whatsappNumber: custPhone,

            customerNote: custNote,



            items,

            subtotal,

            discount,

            total,

            paymentMethod: walkinPayMethod,

            paymentStatus: 'Paid',

            status: 'Delivered',

            type: 'Walk-in',

            outlet: window.currentOutlet,

            createdAt: new Date().toISOString()

        };



        // Generate and save receipt HTML for persistence

        try {

            let store = {

                entityName: "", storeName: window.currentOutlet === 'pizza' ? 'ROSHANI PIZZA' : 'ROSHANI CAKES',

                address: "", gstin: "", fssai: "", tagline: "THANK YOU", poweredBy: "Powered by Roshani ERP",

                config: { showAddress: true, showGSTIN: false, showFSSAI: false, showTagline: true, showPoweredBy: true, showQR: true, showFeedbackQR: true }

            };

            const storeSnap = await Outlet.ref("settings/Store").once("value");

            if (storeSnap.exists()) {

                store = { ...store, ...storeSnap.val() };

            }



            const stdData = standardizeOrderData(orderData);

            orderData.receiptHtml = window.ReceiptTemplates.generateThermalReceipt(stdData, store, false);

        } catch (e) {

            console.error("Error generating receipt HTML for storage:", e);

        }



        try {

            await Outlet.ref('orders/' + orderId).set(orderData);



            if (custPhone) {

                const custRef = Outlet.ref(`customers/${custPhone}`);

                await custRef.transaction((current) => {

                    if (current) {

                        current.orders = (current.orders || 0) + 1;

                        current.ltv = (current.ltv || 0) + total;

                        current.lastSeen = firebase.database.ServerValue.TIMESTAMP;

                        current.name = custName;

                        current.lastAddress = 'Walk-in';

                        return current;

                    } else {

                        return {

                            name: custName,

                            orders: 1,

                            ltv: total,

                            lastSeen: firebase.database.ServerValue.TIMESTAMP,

                            lastAddress: 'Walk-in'

                        };

                    }

                });

            }



            const confirmPrint = await window.showConfirm('Sale Recorded Successfully!\n\nID: ' + orderId + '\nTotal: ₹' + total + '\n\nWould you like to PRINT the receipt?', 'Sale Recorded');

            if (confirmPrint) {

                printOrderReceipt(orderData);

            }



            walkinCart = {};

            document.getElementById('walkinDiscount').value = 0;

            document.getElementById('walkinCustName').value = '';

            document.getElementById('walkinCustPhone').value = '';

            const noteEl = document.getElementById('walkinCustNote');

            if (noteEl) noteEl.value = '';

            renderWalkinCart();

            window.showToast('Sale Recorded successfully!', 'success');

        } catch (e) {

            window.showToast('Error recording sale: ' + e.message, 'error');

        }

    };



    function standardizeOrderData(o) {

        if (!o) return null;



        const orderId = o.orderId || o.id || (o.key ? o.key.slice(-8).toUpperCase() : "ORD-N/A");



        const items = (o.items || []).map(i => ({

            name: i.name || "Unknown Item",

            size: i.size || "",

            quantity: parseInt(i.quantity) || 1,

            price: parseFloat(i.price || i.unitPrice || 0)

        }));



        const orderDate = o.createdAt ? new Date(o.createdAt) : new Date();



        return {

            orderId: orderId,

            date: orderDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),

            time: orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),

            customerName: o.customerName || "Walk-in Customer",

            phone: o.phone || o.whatsappNumber || "",

            address: o.address || "",

            customerNote: o.customerNote || "",

            items: items,

            subtotal: parseFloat(o.subtotal || o.itemTotal || 0),

            discount: parseFloat(o.discount || 0),

            deliveryFee: parseFloat(o.deliveryFee || 0),

            total: parseFloat(o.total || 0),

            paymentMethod: o.paymentMethod || "Cash",

            type: o.type === "Walk-in" ? "Dine-in" : "Online Booked"

        };

    }



    window.printReceiptById = async (orderId) => {

        try {

            const snap = await Outlet.ref("orders").orderByChild("orderId").equalTo(orderId).once("value");

            let order;

            if (snap.exists()) {

                snap.forEach(s => order = s.val());

            } else {

                const snap2 = await Outlet.ref(`orders/${orderId}`).once("value");

                order = snap2.val();

            }



            if (!order) {

                window.showToast("Order not found!", "error");

                return;

            }



            if (order.type === 'Walk-in' && order.status !== 'Delivered') {

                window.updateStatus(orderId, 'Delivered');

            }



            printOrderReceipt(order, true);



        } catch (e) {

            console.error("Print Error:", e);

            window.showToast("Failed to fetch order for printing.", "error");

        }

    };



    async function printOrderReceipt(rawOrder, isReprint = false) {

        const o = standardizeOrderData(rawOrder);

        if (!o) return;



        // If it's the original print and we have saved HTML, use it

        if (!isReprint && rawOrder.receiptHtml) {

            const printWindow = window.open('', '_blank', 'width=450,height=800');

            if (printWindow) {

                printWindow.document.write(rawOrder.receiptHtml);

                printWindow.document.close();

                printWindow.focus();

                setTimeout(() => {

                    try {

                        printWindow.print();

                        printWindow.close();

                    } catch (e) { console.error("Print error:", e); }

                }, 800);

                return;

            }

        }



        let store = {

            entityName: "", storeName: window.currentOutlet === 'pizza' ? 'ROSHANI PIZZA' : 'ROSHANI CAKES',

            address: "", gstin: "", fssai: "", tagline: "THANK YOU", poweredBy: "Powered by Roshani ERP",

            config: { showAddress: true, showGSTIN: false, showFSSAI: false, showTagline: true, showPoweredBy: true, showQR: true, showFeedbackQR: true }

        };



        try {

            const storeSnap = await Outlet.ref("settings/Store").once("value");

            if (storeSnap.exists()) {

                store = { ...store, ...storeSnap.val() };

            }

        } catch (e) { }



        const printWindow = window.open('', '_blank', 'width=450,height=800');

        if (!printWindow) {

            window.showToast("Popup blocked! Please allow popups to print receipts.", "error");

            return;

        }



        const html = window.ReceiptTemplates.generateThermalReceipt(o, store, isReprint);

        printWindow.document.write(html);

        printWindow.document.close();

        printWindow.focus();

        setTimeout(() => {

            try {

                printWindow.print();

                printWindow.close();

            } catch (e) { console.error("Print error:", e); }

        }, 800);

    }











    window.addFeeSlab = (km = "", fee = "") => {

        const tbody = document.getElementById('feeSlabsTable');

        if (!tbody) return;

        const tr = document.createElement('tr');

        tr.innerHTML = `

        <td style="padding: 8px;"><input type="number" class="slab-km form-input" value="${escapeHtml(km)}" placeholder="KM" style="padding: 6px 10px;"></td>

        <td style="padding: 8px;"><input type="number" class="slab-fee form-input" value="${escapeHtml(fee)}" placeholder="₹" style="padding: 6px 10px;"></td>

        <td style="padding: 8px;"><button data-action="removeGrandparent" class="btn-secondary btn-small" style="padding: 5px 8px;">🗑️</button></td>

    `;

        tbody.appendChild(tr);

    };



    window.loadStoreSettings = async () => {

        try {

            const delSnap = await Outlet.ref("settings/Delivery").once("value");

            let delData = delSnap.val() || {

                coords: { lat: 25.887444, lng: 85.026889 },

                slabs: [{ km: 2, fee: 20 }, { km: 5, fee: 40 }, { km: 8, fee: 60 }]

            };



            const storeSnap = await Outlet.ref("settings/Store").once("value");

            let storeData = storeSnap.val() || {

                entityName: "", storeName: "", address: "", gstin: "", fssai: "", tagline: "", poweredBy: "Powered by Roshani ERP",

                developerPhone: "",

                reportPhone: "",

                shopOpenTime: "10:00",

                shopCloseTime: "23:00",

                wifiName: "", wifiPass: "", instagram: "", facebook: "", reviewUrl: "",

                feedbackReason1: "Taste & Quality", feedbackReason2: "Delivery Speed", feedbackReason3: "Value for Money",

                config: { showAddress: true, showGSTIN: false, showFSSAI: false, showTagline: true, showPoweredBy: true, showQR: false, showWifiInfo: false, showSocial: false }

            };



            document.getElementById('settingLat').value = delData.coords.lat;

            document.getElementById('settingLng').value = delData.coords.lng;

            document.getElementById('displayCoords').innerText = `${delData.coords.lat}, ${delData.coords.lng}`;

            if (delData.notifyPhone) document.getElementById('settingAdminPhone').value = delData.notifyPhone;



            const slabContainer = document.getElementById('feeSlabsTable');

            if (slabContainer) {

                slabContainer.innerHTML = '';

                if (delData.slabs) delData.slabs.forEach(slab => window.addFeeSlab(slab.km, slab.fee));

            }



            document.getElementById('settingEntityName').value = storeData.entityName || "";

            document.getElementById('settingStoreName').value = storeData.storeName || "";

            document.getElementById('settingStoreAddress').value = storeData.address || "";

            document.getElementById('settingGSTIN').value = storeData.gstin || "";

            document.getElementById('settingFSSAI').value = storeData.fssai || "";

            document.getElementById('settingTagline').value = storeData.tagline || "";

            document.getElementById('settingPoweredBy').value = storeData.poweredBy || "";

            document.getElementById('settingDevPhone').value = storeData.developerPhone || "";

            document.getElementById('settingReportPhone').value = storeData.reportPhone || "";

            document.getElementById('settingOpenTime').value = storeData.shopOpenTime || "10:00";

            document.getElementById('settingCloseTime').value = storeData.shopCloseTime || "23:00";



            // Load Shop Status override (FORCE_OPEN / FORCE_CLOSED / AUTO)

            const shopStatusEl = document.getElementById('settingShopStatus');

            if (shopStatusEl) shopStatusEl.value = storeData.shopStatus || 'AUTO';



            // Update the live outlet status indicator

            window.updateOutletStatusIndicator && window.updateOutletStatusIndicator(storeData.shopStatus || 'AUTO');

            document.getElementById('settingWifiName').value = storeData.wifiName || "";

            document.getElementById('settingWifiPass').value = storeData.wifiPass || "";

            document.getElementById('settingInstagram').value = storeData.instagram || "";

            document.getElementById('settingFacebook').value = storeData.facebook || "";

            document.getElementById('settingReviewUrl').value = storeData.reviewUrl || "";

            document.getElementById('settingFeedbackReason3').value = storeData.feedbackReason3 || "Value for Money";

            document.getElementById('settingDeliveryBackupCode').value = storeData.deliveryBackupCode || "";



            const config = storeData.config || {};

            document.getElementById('checkShowAddress').checked = config.showAddress !== false;

            document.getElementById('checkShowGSTIN').checked = !!config.showGSTIN;

            document.getElementById('checkShowFSSAI').checked = !!config.showFSSAI;

            document.getElementById('checkShowTagline').checked = config.showTagline !== false;

            document.getElementById('checkShowPoweredBy').checked = config.showPoweredBy !== false;

            document.getElementById('checkShowQR').checked = !!config.showQR;

            document.getElementById('checkShowWifiInfo').checked = !!config.showWifiInfo;

            document.getElementById('checkShowSocial').checked = !!config.showSocial;

            document.getElementById('checkShowFeedbackQR').checked = config.showFeedbackQR !== false;



            if (storeData.qrUrl) {

                document.getElementById('qrPreview').src = storeData.qrUrl;

                document.getElementById('settingQRUrl').value = storeData.qrUrl;

            }



            const botSnap = await Outlet.ref("settings/Bot").once("value");

            const botData = botSnap.val() || {};



            const botMaps = {

                'botImgConfirmed': botData.imgConfirmed,

                'botImgPreparing': botData.imgPreparing,

                'botImgCooked': botData.imgCooked,

                'botImgOut': botData.imgOut,

                'botImgDelivered': botData.imgDelivered,

                'botImgFeedback': botData.imgFeedback

            };



            for (const [id, url] of Object.entries(botMaps)) {

                if (url) {

                    const preview = document.getElementById(id + 'Preview');

                    if (preview) preview.src = url;

                }

            }



            document.getElementById('botSocialInsta').value = botData.socialInsta || "";

            document.getElementById('botSocialFb').value = botData.socialFb || "";

            document.getElementById('botSocialReview').value = botData.socialReview || "";

            document.getElementById('botSocialWebsite').value = botData.socialWebsite || "";



        } catch (e) {

            console.error("Load Store Settings Error:", e);

        }

    };



    window.saveStoreSettings = async () => {

        const btn = document.querySelector("#tab-settings .btn-primary");

        const originalText = btn.innerText;

        btn.disabled = true;

        btn.innerText = "Saving...";



        try {

            const qrFile = document.getElementById('settingQRFile').files[0];

            let qrUrl = document.getElementById('settingQRUrl').value;



            if (qrFile) {

                qrUrl = await uploadImage(qrFile, `settings/payment_qr_${Date.now()}`);

            }



            const latRaw = document.getElementById('settingLat').value.trim();

            const lngRaw = document.getElementById('settingLng').value.trim();

            const lat = (latRaw === "" || isNaN(parseFloat(latRaw))) ? null : parseFloat(latRaw);

            const lng = (lngRaw === "" || isNaN(parseFloat(lngRaw))) ? null : parseFloat(lngRaw);

            const notifyPhone = document.getElementById('settingAdminPhone').value.trim();



            const slabRows = document.querySelectorAll('#feeSlabsTable tr');

            const slabs = Array.from(slabRows).map(row => ({

                km: parseFloat(row.querySelector('.slab-km').value),

                fee: parseFloat(row.querySelector('.slab-fee').value)

            })).filter(s => !isNaN(s.km) && !isNaN(s.fee));

            slabs.sort((a, b) => a.km - b.km);



            const storeData = {

                entityName: document.getElementById('settingEntityName').value.trim(),

                storeName: document.getElementById('settingStoreName').value.trim(),

                address: document.getElementById('settingStoreAddress').value.trim(),

                gstin: document.getElementById('settingGSTIN').value.trim(),

                fssai: document.getElementById('settingFSSAI').value.trim(),

                tagline: document.getElementById('settingTagline').value.trim(),

                poweredBy: document.getElementById('settingPoweredBy').value.trim(),

                developerPhone: document.getElementById('settingDevPhone').value.trim(),

                reportPhone: document.getElementById('settingReportPhone').value.trim(),

                shopOpenTime: document.getElementById('settingOpenTime').value,

                shopCloseTime: document.getElementById('settingCloseTime').value,

                shopStatus: document.getElementById('settingShopStatus')?.value || 'AUTO',

                wifiName: document.getElementById('settingWifiName').value.trim(),

                wifiPass: document.getElementById('settingWifiPass').value.trim(),

                instagram: document.getElementById('settingInstagram').value.trim(),

                facebook: document.getElementById('settingFacebook').value.trim(),

                reviewUrl: document.getElementById('settingReviewUrl').value.trim(),

                feedbackReason1: document.getElementById('settingFeedbackReason1').value.trim(),

                feedbackReason2: document.getElementById('settingFeedbackReason2').value.trim(),

                feedbackReason3: document.getElementById('settingFeedbackReason3').value.trim(),

                deliveryBackupCode: document.getElementById('settingDeliveryBackupCode').value.trim(),

                qrUrl: qrUrl,

                config: {

                    showAddress: document.getElementById('checkShowAddress').checked,

                    showGSTIN: document.getElementById('checkShowGSTIN').checked,

                    showFSSAI: document.getElementById('checkShowFSSAI').checked,

                    showTagline: document.getElementById('checkShowTagline').checked,

                    showPoweredBy: document.getElementById('checkShowPoweredBy').checked,

                    showQR: document.getElementById('checkShowQR').checked,

                    showWifiInfo: document.getElementById('checkShowWifiInfo').checked,

                    showSocial: document.getElementById('checkShowSocial').checked,

                    showFeedbackQR: document.getElementById('checkShowFeedbackQR').checked

                }

            };



            // 4. Handle Bot Image Uploads

            const botFiles = [

                { id: 'botImgConfirmed', key: 'imgConfirmed' },

                { id: 'botImgPreparing', key: 'imgPreparing' },

                { id: 'botImgCooked', key: 'imgCooked' },

                { id: 'botImgOut', key: 'imgOut' },

                { id: 'botImgDelivered', key: 'imgDelivered' },

                { id: 'botImgFeedback', key: 'imgFeedback' }

            ];



            const botDataUpdates = {

                socialInsta: document.getElementById('botSocialInsta').value.trim(),

                socialFb: document.getElementById('botSocialFb').value.trim(),

                socialReview: document.getElementById('botSocialReview').value.trim(),

                socialWebsite: document.getElementById('botSocialWebsite').value.trim()

            };



            for (const item of botFiles) {

                const file = document.getElementById(item.id + 'File').files[0];

                if (file) {

                    const url = await uploadImage(file, `bot/status_${item.key}_${Date.now()}`);

                    botDataUpdates[item.key] = url;

                }

            }



            // 5. Update Firebase (outlet-specific paths)

            await Promise.all([

                Outlet.ref("settings/Delivery").update({ coords: { lat, lng }, notifyPhone, slabs }),

                Outlet.ref("settings/Store").update(storeData),

                Outlet.ref("settings/Bot").update(botDataUpdates)

            ]);



            document.getElementById('displayCoords').innerText = (lat !== null && lng !== null) ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : "Not Set";

            if (qrUrl) document.getElementById('settingQRUrl').value = qrUrl;



            // Success Alert

            window.showToast("Settings saved successfully!", "success");



        } catch (e) {

            window.showToast("Failed to save: " + e.message, "error");

        } finally {

            btn.disabled = false;

            btn.innerText = originalText;

        }

    };



    function loadFeedbacks() {

        const tableBody = document.getElementById("feedbackTableBody");

        if (!tableBody) return;



        Outlet.ref("feedbacks").off();

        Outlet.ref("feedbacks").on("value", snap => {

            tableBody.innerHTML = "";

            const feedbacks = [];

            snap.forEach(child => {

                feedbacks.push({ id: child.key, ...child.val() });

            });



            // Sort by date (desc)

            feedbacks.sort((a, b) => {

                const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;

                const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;

                return dateB - dateA;

            });



            if (feedbacks.length === 0) {

                tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-muted);">No feedback received yet.</td></tr>`;

                return;

            }



            const feedbackHTML = feedbacks.map(f => {

                const stars = "⭐".repeat(f.rating || 0);

                const dateStr = f.timestamp ? new Date(f.timestamp).toLocaleString() : "N/A";



                return `

                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03)">

                    <td data-label="Date" style="padding:15px; font-size:12px;">${escapeHtml(dateStr)}</td>

                    <td data-label="Order ID" style="padding:15px; font-family:monospace; font-weight:700;">#${escapeHtml(f.orderId || 'N/A')}</td>

                    <td data-label="Customer" style="padding:15px">

                        <div style="font-weight:700;">${escapeHtml(f.customerName || 'Guest')}</div>

                        <small style="color:var(--text-muted);">${escapeHtml(f.phone || '')}</small>

                    </td>

                    <td data-label="Rating" style="padding:15px; font-size:14px;">${stars}</td>

                    <td data-label="Feedback" style="padding:15px">

                        <div style="font-weight:600; color:var(--text-main);">${escapeHtml(f.reason || f.feedback || '')}</div>

                        ${f.comment ? `<div style="font-size:12px; color:var(--text-muted); margin-top:4px; font-style:italic;">"${escapeHtml(f.comment)}"</div>` : ''}

                    </td>

                </tr>

            `;

            }).join('');

            tableBody.innerHTML = feedbackHTML;

        });

    }



    /**
    
     * =============================================
    
     * 9. LIVE RIDER TRACKER (ADMIN)
    
     * =============================================
    
     */

    let adminTrackerMap = null;

    let riderMarkersMap = new Map(); // Store markers by rider ID

    let riderLocationCb = null; // Track callback for cleanup



    window.initLiveRiderTracker = () => {

        const mapDiv = document.getElementById('adminLiveMap');

        if (!mapDiv) return;



        // Clean up existing map if it exists to prevent memory leaks

        if (adminTrackerMap) {

            adminTrackerMap.remove();

            adminTrackerMap = null;

        }



        // Initialize Map at a default center (e.g. India)

        adminTrackerMap = L.map('adminLiveMap').setView([20.5937, 78.9629], 5);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {

            attribution: '&copy; OpenStreetMap'

        }).addTo(adminTrackerMap);



        startRiderLocationListener();

    };



    window.cleanupLiveRiderTracker = () => {

        console.log("[Performance] Cleaning up Live Rider Tracker...");

        if (riderLocationCb) {

            Outlet.ref('riders').off('value', riderLocationCb);

            riderLocationCb = null;

        }

        if (adminTrackerMap) {

            try {

                adminTrackerMap.remove();

            } catch (e) {

                console.warn("Map removal error:", e);

            }

            adminTrackerMap = null;

        }

        riderMarkersMap.clear();

    };



    function startRiderLocationListener() {

        if (riderLocationCb) {

            Outlet.ref('riders').off('value', riderLocationCb);

        }



        riderLocationCb = snap => {

            let onlineCount = 0;

            let bounds = [];



            snap.forEach(child => {

                const r = child.val();

                const id = child.key;



                if (r.status === "Online" && r.location) {

                    onlineCount++;

                    const pos = [r.location.lat, r.location.lng];

                    bounds.push(pos);



                    if (riderMarkersMap.has(id)) {

                        // Update existing marker

                        const marker = riderMarkersMap.get(id);

                        marker.setLatLng(pos);

                        marker.getPopup().setContent(`

                        <div style="font-family: 'Outfit', sans-serif;">

                            <strong style="color:var(--primary)">${escapeHtml(r.name)}</strong><br>

                            <small>${escapeHtml(r.phone)}</small><br>

                            <div style="margin-top:5px; font-size:10px; font-weight:800; color:var(--success)">MOVED: ${new Date(r.location.ts).toLocaleTimeString()}</div>

                        </div>

                    `);

                    } else {

                        // Create new marker

                        const marker = L.marker(pos, {

                            icon: L.icon({

                                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',

                                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',

                                iconSize: [25, 41],

                                iconAnchor: [12, 41],

                                popupAnchor: [1, -34],

                                shadowSize: [41, 41]

                            })

                        }).addTo(adminTrackerMap).bindPopup(`

                        <div style="font-family: 'Outfit', sans-serif;">

                            <strong style="color:var(--primary)">${escapeHtml(r.name)}</strong><br>

                            <small>${escapeHtml(r.phone)}</small>

                        </div>

                    `);

                        riderMarkersMap.set(id, marker);

                    }

                } else {

                    // Remove marker if rider goes offline

                    if (riderMarkersMap.has(id)) {

                        adminTrackerMap.removeLayer(riderMarkersMap.get(id));

                        riderMarkersMap.delete(id);

                    }

                }

            });



            // Update Stats UI

            const statsEl = document.getElementById('trackerStats');

            if (statsEl) statsEl.innerText = `${onlineCount} Riders Online`;



            // Fit map to show all riders if it's the first load or count changed

            if (bounds.length > 0 && adminTrackerMap) {

                const currentBounds = L.latLngBounds(bounds);

                adminTrackerMap.fitBounds(currentBounds, { padding: [50, 50], maxZoom: 15 });

            }

        };



        Outlet.ref('riders').on('value', riderLocationCb);

    }



    // =============================

    // POS SELECTION MODAL & LOGIC

    // =============================

    let currentPOSModalDish = null;

    let currentPOSModalSize = null;

    let currentPOSModalAddons = {}; // name -> price

    let currentPOSModalQty = 1;



    window.addNewCategoryAddonField = (name = "", price = "") => {

        const container = document.getElementById('categoryAddonsList');

        if (!container) return;

        const div = document.createElement('div');

        div.className = "addon-row-small";

        div.innerHTML = `

        <input placeholder="Addon" value="${escapeHtml(name)}" class="form-input flex-2">

        <input type="number" placeholder="\u20B9" value="${escapeHtml(price)}" class="form-input flex-1">

        <button data-action="removeParent" class="btn-text-danger" style="font-size:18px;">&times;</button>

    `;

        container.appendChild(div);

    };



    window.openPOSSelectionModal = async (dishId) => {

        haptic(10);

        const snap = await Outlet.ref(`dishes/${dishId}`).once('value');

        const dish = snap.val();

        if (!dish) return;



        currentPOSModalDish = { id: dishId, ...dish };

        currentPOSModalQty = 1;

        currentPOSModalAddons = {};



        document.getElementById('posModalDishName').innerText = dish.name;

        document.getElementById('posModalDishCategory').innerText = dish.category;

        document.getElementById('posModalQty').innerText = "1";



        // 1. Render Sizes as Chips/Grid for better clarity

        const sizeGrid = document.getElementById('posSizeGrid');

        sizeGrid.innerHTML = "";



        // Logic for Request 5: Simple dishes show - Default -

        let sizes = dish.sizes || {};

        if (Object.keys(sizes).length === 0 || (Object.keys(sizes).length === 1 && !dish.sizes)) {

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

            if (idx === 0) currentPOSModalSize = { name, price };

        });



        // 2. Render Category-Bound Add-ons

        const addonsList = document.getElementById('posAddonsList');

        addonsList.innerHTML = "";



        // Find category to get its addons

        const cat = categories.find(c => c.name === dish.category);

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

        document.getElementById('posSelectionModal').classList.add('active');

    };



    window.hidePOSSelectionModal = () => {

        document.getElementById('posSelectionModal').classList.remove('active');

    };



    window.selectPOSSize = function (name, price, el) {

        document.querySelectorAll('.size-card').forEach(c => c.classList.remove('active'));

        el.classList.add('active');

        currentPOSModalSize = { name, price };

        updatePOSModalTotal();

    };



    window.togglePOSAddon = (name, price, checkbox) => {

        if (checkbox.checked) {

            currentPOSModalAddons[name] = price;

        } else {

            delete currentPOSModalAddons[name];

        }

        updatePOSModalTotal();

    };



    window.adjustPOSModalQty = (delta) => {

        currentPOSModalQty = Math.max(1, currentPOSModalQty + delta);

        document.getElementById('posModalQty').innerText = currentPOSModalQty;

        updatePOSModalTotal();

    };



    function updatePOSModalTotal() {

        let base = currentPOSModalSize ? currentPOSModalSize.price : 0;

        let addonsTotal = Object.values(currentPOSModalAddons).reduce((a, b) => a + b, 0);

        let total = (Number(base) + addonsTotal) * currentPOSModalQty;

        document.getElementById('posModalTotal').innerText = `\u20B9${total}`;

    }



    window.addToWalkinCartFromModal = () => {

        if (!currentPOSModalDish || !currentPOSModalSize) return;



        const baseId = currentPOSModalDish.id;

        const sizeName = currentPOSModalSize.name;

        const addonNames = Object.keys(currentPOSModalAddons);



        // Create unique key for cart item (dish + size + addons)

        const cartKey = `${baseId}::${sizeName}::${addonNames.sort().join('|')}`;



        const pricePerItem = Number(currentPOSModalSize.price) + Object.values(currentPOSModalAddons).reduce((a, b) => a + b, 0);



        if (walkinCart[cartKey]) {

            walkinCart[cartKey].qty += currentPOSModalQty;

        } else {

            walkinCart[cartKey] = {

                id: baseId,

                name: currentPOSModalDish.name,

                category: currentPOSModalDish.category, // Needed for cart-side addons

                size: sizeName,

                price: pricePerItem,

                qty: currentPOSModalQty,

                addons: addonNames.map(name => ({ name, price: currentPOSModalAddons[name] }))

            };

        }



        hidePOSSelectionModal();

        renderWalkinCart();

        haptic(20);

    };



    window.openCartAddonPicker = async (cartKey) => {

        const item = walkinCart[cartKey];

        if (!item) return;



        // We reuse the POS selection modal but focus it on addons

        // To do this simply, we'll just set up the modal with the current item's data

        const dishSnap = await Outlet.ref(`dishes/${item.id}`).once('value');

        const dish = dishSnap.val();

        if (!dish) return;



        currentPOSModalDish = { id: item.id, ...dish };

        currentPOSModalQty = item.qty;

        currentPOSModalSize = { name: item.size, price: item.price - (item.addons ? item.addons.reduce((a, b) => a + b.price, 0) : 0) };

        currentPOSModalAddons = {};

        if (item.addons) {

            item.addons.forEach(a => currentPOSModalAddons[a.name] = a.price);

        }



        // Refresh UI

        document.getElementById('posModalDishName').innerText = dish.name + " (Update Addons)";

        document.getElementById('posModalDishCategory').innerText = dish.category;

        document.getElementById('posModalQty').innerText = currentPOSModalQty;



        // Hide sizes if we are just updating addons from cart (Keep UI simple)

        document.getElementById('posSizeSection').classList.add('hidden');



        // Render Category Addons

        const addonsList = document.getElementById('posAddonsList');

        addonsList.innerHTML = "";

        const cat = categories.find(c => c.name === dish.category);

        if (cat && cat.addons) {

            document.getElementById('posAddonsSection').classList.remove('hidden');

            Object.entries(cat.addons).forEach(([name, price]) => {

                const isChecked = currentPOSModalAddons[name] !== undefined;

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



        // Change the "Add to Cart" button to "Update Item"

        const submitBtn = document.getElementById('posModalSubmitBtn');

        const originalText = submitBtn.innerText;

        submitBtn.innerText = "\uD83D\uDCBE Update Selection";



        // Temporarily replace the click handler

        const originalHandler = window.addToWalkinCartFromModal;

        window.addToWalkinCartFromModal = () => {

            // Remove old item, add new updated one

            delete walkinCart[cartKey];



            // Use the standard logic to add back

            const newSizeName = currentPOSModalSize.name;

            const newAddonNames = Object.keys(currentPOSModalAddons);

            const newCartKey = `${item.id}::${newSizeName}::${newAddonNames.sort().join('|')}`;

            const pricePerItem = Number(currentPOSModalSize.price) + Object.values(currentPOSModalAddons).reduce((a, b) => a + b, 0);



            walkinCart[newCartKey] = {

                id: item.id,

                name: currentPOSModalDish.name,

                category: currentPOSModalDish.category,

                size: newSizeName,

                price: pricePerItem,

                qty: currentPOSModalQty,

                addons: newAddonNames.map(name => ({ name, price: currentPOSModalAddons[name] }))

            };



            hidePOSSelectionModal();

            renderWalkinCart();



            // Restore original things

            window.addToWalkinCartFromModal = originalHandler;

            submitBtn.innerText = originalText;

            document.getElementById('posSizeSection').classList.remove('hidden');

        };



        updatePOSModalTotal();

        document.getElementById('posSelectionModal').classList.add('active');

    };

    window.migrateAddonsToCategories = async () => {

        try {

            console.log("Starting add-on migration...");

            const dishesSnap = await Outlet.ref(`dishes`).once('value');

            const categoriesSnap = await Outlet.ref('categories').once('value');



            const dishes = dishesSnap.val() || {};

            const categoriesData = categoriesSnap.val() || {};



            const categoryAddons = {}; // categoryName -> { addonName: price }



            // 1. Collect from all dishes

            Object.keys(dishes).forEach(outletId => {

                const outletDishes = dishes[outletId];

                Object.values(outletDishes).forEach(dish => {

                    if (dish.category && dish.addons) {

                        if (!categoryAddons[dish.category]) categoryAddons[dish.category] = {};

                        Object.entries(dish.addons).forEach(([name, price]) => {

                            categoryAddons[dish.category][name] = price;

                        });

                    }

                });

            });



            // 2. Update Categories

            const updates = {};

            Object.entries(categoriesData).forEach(([catId, cat]) => {

                if (categoryAddons[cat.name]) {

                    updates[`categories/${catId}/addons`] = categoryAddons[cat.name];

                }

            });



            if (Object.keys(updates).length > 0) {

                await db.ref().update(updates);

                window.showToast("Success: Add-ons migrated to categories!", "success");

            } else {

                window.showToast("No add-ons found to migrate.", "info");

            }

        } catch (e) {

            window.showToast("Migration failed: " + e.message, "error");

        }

    };



    // =============================

    // CATEGORY RENDERING IN POS

    // =============================

    function renderWalkinCategoryTabs() {

        const container = document.getElementById('walkinCategoryTabs');

        if (!container) return;



        container.innerHTML = `

        <div class="category-tab active" data-action="filterWalkinByCategory" data-val="All">All</div>

    `;



        categories.forEach(cat => {

            const tab = document.createElement('div');

            tab.className = "category-tab";

            tab.innerText = escapeHtml(cat.name);

            tab.dataset.action = "filterWalkinByCategory";

            tab.dataset.val = cat.name;

            container.appendChild(tab);

        });

    }



    // =============================

    // IMAGE STORAGE MIGRATION

    // =============================

    window.runImageMigration = async function () {

        if (!(await window.showConfirm("This will convert images to Base64 text. This process might take a minute. Proceed?", "Image Migration"))) return;



        try {

            console.log("\uD83D\uDE80 Starting Image Migration...");

            const updates = {};



            // Helper to download image and convert to Base64

            async function convertUrlToDataUri(url) {

                if (!url || !url.includes("firebasestorage.googleapis.com")) return url;

                try {

                    const response = await fetch(url);

                    const blob = await response.blob();

                    return await uploadImage(blob, "temp");

                } catch (err) {

                    console.error("Failed to convert image:", url, err);

                    return url; // Keep original on failure

                }

            }



            // 1. Dishes

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



            // 2. Categories

            const catsSnap = await db.ref('categories').once('value');

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



            // 3. Riders

            const ridersSnap = await db.ref('riders').once('value');

            const ridersData = ridersSnap.val();

            if (ridersData) {

                for (const id in ridersData) {

                    if (ridersData[id].profilePhoto && ridersData[id].profilePhoto.includes("firebasestorage")) {

                        console.log("Migrating Rider Profile:", ridersData[id].name);

                        const b64 = await convertUrlToDataUri(ridersData[id].profilePhoto);

                        updates[`riders/${id}/profilePhoto`] = b64;

                    }

                    if (ridersData[id].aadharPhoto && ridersData[id].aadharPhoto.includes("firebasestorage")) {

                        console.log("Migrating Rider Aadhar:", ridersData[id].name);

                        const b64 = await convertUrlToDataUri(ridersData[id].aadharPhoto);

                        updates[`riders/${id}/aadharPhoto`] = b64;

                    }

                }

            }



            // 4. Bot Settings

            const botSnap = await db.ref('settings/Bot').once('value');

            const botData = botSnap.val();

            if (botData) {

                if (botData.imgDelivered && botData.imgDelivered.includes("firebasestorage")) {

                    updates['settings/Bot/imgDelivered'] = await convertUrlToDataUri(botData.imgDelivered);

                }

                if (botData.imgFeedback && botData.imgFeedback.includes("firebasestorage")) {

                    updates['settings/Bot/imgFeedback'] = await convertUrlToDataUri(botData.imgFeedback);

                }

            }



            if (Object.keys(updates).length > 0) {

                await db.ref().update(updates);

                window.showToast("Success: All images migrated!", "success");

                location.reload();

            } else {

                window.showToast("No legacy images found.", "info");

            }

        } catch (err) {

            console.error("Migration Failed:", err);

            window.showToast("Critical Error: Migration failed.", "error");

        }

    }





    window.exportStockList = () => {

        if (Object.keys(stockRegistry).length === 0) {

            window.showToast("No data to export.", "info");

            return;

        }

        // ... CSV Export logic ...

    };



    window.exportLostSalesData = async () => {

        const snap = await Outlet.ref("lostSales").once("value");

        if (!snap.exists()) {

            window.showToast("No data to export.", "warning");

            return;

        }



        let csv = "Time,Customer,Phone,Abandoned At,Items,Potential Revenue\n";

        snap.forEach(child => {

            const d = child.val();

            const items = d.items ? d.items.map(i => `${i.name} x${i.quantity}`).join(' | ') : '';

            const row = [

                `"${new Date(d.cancelledAt).toLocaleString()}"`,

                `"${d.customerName || 'Guest'}"`,

                `"${d.phone || ''}"`,

                `"${d.sourceStep || 'Unknown'}"`,

                `"${items}"`,

                `"${d.total || 0}"`

            ];

            csv += row.join(",") + "\n";

        });



        const blob = new Blob([csv], { type: 'text/csv' });

        const url = window.URL.createObjectURL(blob);

        const a = document.createElement('a');

        a.href = url;

        a.download = `Lost_Sales_${window.currentOutlet}_${new Date().toISOString().split('T')[0]}.csv`;

        document.body.appendChild(a);

        a.click();

        window.URL.revokeObjectURL(url);

        document.body.removeChild(a);



    };



    // --- MOBILE ACCESSIBILITY HELPER (Phase 2) ---

    function enhanceTablesForMobile(root = document) {

        if (window.innerWidth > 600) return;



        const tables = root.querySelectorAll('table');

        tables.forEach(table => {

            const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());

            if (headers.length === 0) return;



            const rows = table.querySelectorAll('tbody tr');

            rows.forEach(row => {

                const cells = row.querySelectorAll('td');

                cells.forEach((cell, index) => {

                    if (headers[index] && !cell.getAttribute('data-label')) {

                        cell.setAttribute('data-label', headers[index]);

                    }

                });

            });

        });

    }



    // Phase 3: Use MutationObserver instead of polling for performance

    if (typeof MutationObserver !== 'undefined') {

        const observer = new MutationObserver((mutations) => {

            if (window.innerWidth <= 600) {

                // Debounce or throttle could be added if needed, but this is usually fine

                enhanceTablesForMobile();

            }

        });



        observer.observe(document.body, {

            childList: true,

            subtree: true

        });

    } else {

        // Fallback for older browsers

        setInterval(enhanceTablesForMobile, 3000);

    }



    // Initial call

    enhanceTablesForMobile();


    // POS / Walk-in Functions Exposed Globally
    window.loadWalkinMenu = loadWalkinMenu;
    window.filterWalkinByCategory = filterWalkinByCategory;
    window.applyWalkinFilters = applyWalkinFilters;
    window.checkWalkinCustomer = checkWalkinCustomer;
    window.renderWalkinDishGrid = renderWalkinDishGrid;
    window.addToWalkinCart = addToWalkinCart;
    window.removeFromWalkinCart = removeFromWalkinCart;
    window.renderWalkinCart = renderWalkinCart;
    window.renderWalkinCategoryTabs = renderWalkinCategoryTabs;
    window.updateMobileCartSummaryState = updateMobileCartSummaryState;
    window.loadMenu = loadMenu;
    window.loadCategories = loadCategories;
    window.loadRiders = loadRiders;
    window.loadCustomers = loadCustomers;
    window.loadFeedbacks = loadFeedbacks;
    window.loadReports = loadReports;
    window.loadLostSales = loadLostSales;
    window.initRealtimeListeners = initRealtimeListeners;
}




// UTILITY: Image Preview to Base64

window.previewImage = (input, previewId) => {

    if (input.files && input.files[0]) {

        const reader = new FileReader();

        reader.onload = (e) => {

            const preview = document.getElementById(previewId);

            const hidden = document.getElementById(previewId.replace('Preview', 'Url'));

            if (preview) preview.src = e.target.result;

            if (hidden) hidden.value = e.target.result;

        };

        reader.readAsDataURL(input.files[0]);

    }

};



window.showRiderModal = () => {

    isEditRiderMode = false;

    currentEditingRiderId = null;

    document.getElementById('riderModalTitle').innerText = "Add New Rider";

    document.getElementById('saveRiderBtn').innerText = "Create Account";

    document.getElementById('riderEmail').disabled = false;

    document.getElementById('riderPassHint').classList.add('hidden');

    document.getElementById('riderPassLabel').innerText = "Secret Access Code (Password)";



    // Clear all 10 PII fields

    document.getElementById('riderName').value = "";

    document.getElementById('riderEmail').value = "";

    document.getElementById('riderPhone').value = "";

    document.getElementById('riderFatherName').value = "";

    document.getElementById('riderAge').value = "";

    document.getElementById('riderAadharNo').value = "";

    document.getElementById('riderQual').value = "";

    document.getElementById('riderAddress').value = "";

    document.getElementById('riderPass').value = "";



    // Reset Images

    document.getElementById('riderProfilePreview').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='12' fill='%23999\'%3ENo Photo%3C/text%3E%3C/svg%3E";

    document.getElementById('riderPhotoUrl').value = "";

    document.getElementById('aadharPreview').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='60' viewBox='0 0 100 60'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='8' fill='%23999\'%3EID Preview%3C/text%3E%3C/svg%3E";

    document.getElementById('aadharUrl').value = "";



    document.getElementById('riderModal').classList.add('active');

};



window.editRider = (id) => {

    const r = ridersList.find(x => x.id === id);

    if (!r) return;



    isEditRiderMode = true;

    currentEditingRiderId = id;



    document.getElementById('riderModalTitle').innerText = "Edit Rider Details";

    document.getElementById('saveRiderBtn').innerText = "Update Rider";

    document.getElementById('riderEmail').disabled = true;

    document.getElementById('riderPassHint').classList.remove('hidden');

    document.getElementById('riderPassLabel').innerText = "Update Password (Optional)";



    // Populate all 10 PII fields

    document.getElementById('riderName').value = r.name || "";

    document.getElementById('riderEmail').value = r.email || "";

    document.getElementById('riderPhone').value = r.phone || "";

    document.getElementById('riderFatherName').value = r.fatherName || "";

    document.getElementById('riderAge').value = r.age || "";

    document.getElementById('riderAadharNo').value = r.aadharNo || "";

    document.getElementById('riderQual').value = r.qualification || "";

    document.getElementById('riderAddress').value = r.address || "";

    document.getElementById('riderPass').value = "";



    // Populate Images

    const SVG_PLACEHOLDER = "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23ccc%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20x%3D%223%22%20y%3D%223%22%20width%3D%2218%22%20height%3D%2218%22%20rx%3D%222%22%20ry%3D%222%22%3E%3C%2Frect%3E%3Cline%20x1%3D%223%22%20y1%3D%2221%22%20x2%3D%2221%22%20y2%3D%223%22%3E%3C%2Fline%3E%3C%2Fsvg%3E";

    document.getElementById('riderProfilePreview').src = r.profilePhoto || SVG_PLACEHOLDER;

    document.getElementById('riderPhotoUrl').value = r.profilePhoto || "";

    document.getElementById('aadharPreview').src = r.aadharPhoto || SVG_PLACEHOLDER;

    document.getElementById('aadharUrl').value = r.aadharPhoto || "";



    document.getElementById('riderModal').classList.add('active');

};



window.hideRiderModal = () => document.getElementById('riderModal').classList.remove('active');



window.saveRiderAccount = async () => {

    const name = document.getElementById('riderName').value.trim();

    let email = document.getElementById('riderEmail').value.trim();

    const phone = document.getElementById('riderPhone').value.trim();

    let pass = document.getElementById('riderPass').value;



    // Validate email

    if (!email) {

        window.showToast("Please provide a valid email address.", "error");

        return;

    }



    // Generate secure temporary password for new accounts if none provided

    if (!isEditRiderMode && !pass) {

        pass = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();

        navigator.clipboard.writeText(pass);

        window.showToast("Rider Password Generated & Copied to Clipboard!", "success");

    }



    const fatherName = document.getElementById('riderFatherName').value.trim();

    const age = document.getElementById('riderAge').value;

    const aadharNo = document.getElementById('riderAadharNo').value.trim();

    const qualification = document.getElementById('riderQual').value.trim();

    const address = document.getElementById('riderAddress').value.trim();

    let profilePhoto = document.getElementById('riderPhotoUrl').value;

    let aadharPhoto = document.getElementById('aadharUrl').value;



    if (!name || !email || !pass) {

        window.showToast("Name, Email, and Password are required.", "error");

        return;

    }



    // Strict 12-digit Aadhar Validation

    if (!/^\d{12}$/.test(aadharNo)) {

        window.showToast("Invalid Aadhar Number! It must be exactly 12 digits.", "error");

        return;

    }



    const profileFile = document.getElementById('riderPhotoInput').files[0];

    const aadharFile = document.getElementById('aadharPhotoInput').files[0];

    const statusLabel = document.getElementById('uploadStatusRider');



    try {

        if (profileFile || aadharFile) {

            statusLabel.classList.remove('hidden');

        }



        if (profileFile) {

            profilePhoto = await uploadImage(profileFile, `riders/profile_${Date.now()}`);

        }

        if (aadharFile) {

            aadharPhoto = await uploadImage(aadharFile, `riders/aadhar_${Date.now()}`);

        }



        statusLabel.classList.add('hidden');



        let uid = currentEditingRiderId;



        if (!isEditRiderMode) {

            console.log("[saveRiderAccount] Creating new rider account...");

            // 1. Create in secondary Auth

            if (!secondaryAuthAvailable) {

                window.showToast("Rider creation is currently unavailable.", "error");

                return;

            }

            if (!pass || pass.length < 6) {

                window.showToast("Password must be at least 6 characters for new accounts.", "error");

                return;

            }



            try {

                console.log("[saveRiderAccount] Attempting secondary Auth creation for:", email);

                const cred = await secondaryAuth.createUserWithEmailAndPassword(email, pass);

                uid = cred.user.uid;

                console.log("[saveRiderAccount] User created with UID:", uid);



                // CRITICAL: Immediately sign out the rider from the secondary instance

                // to prevent any accidental session bleeding into the admin's database write.

                console.log("[saveRiderAccount] Signing out of secondaryAuth...");

                await secondaryAuth.signOut();

            } catch (authError) {

                window.showToast(standardizeAuthError(authError), "error");

                statusLabel.classList.add('hidden');

                return;

            }

        } else if (pass && pass.length >= 6) {

            // Update password in edit mode if provided

            try {

                // To update password, we'd need to sign in as the user. 

                // Since this is restricted, we recommend using 'Forgot Password' or resetting via Firebase Console.

                window.showToast("Password update: Use 'Forgot Password' or Admin Console.", "info");

            } catch (e) {

                console.error("Password update error:", e);

            }

        }



        // 2. Save/Update rider details to DB

        const riderData = {

            name,

            email,

            phone,

            fatherName,

            age,

            aadharNo,

            qualification,

            address,

            profilePhoto,

            aadharPhoto,

            outlet: (window.currentOutlet || 'pizza').toLowerCase(),

            updatedAt: firebase.database.ServerValue.TIMESTAMP

        };



        if (!isEditRiderMode) {

            riderData.status = "Offline";

            riderData.createdAt = firebase.database.ServerValue.TIMESTAMP;

        }



        console.log("[saveRiderAccount] Writing rider data to DB path:", `riders/${uid}`);

        await Outlet.ref(`riders/${uid}`).update(riderData);



        // Verification Check

        const verifySnap = await Outlet.ref(`riders/${uid}`).once('value');

        if (verifySnap.exists()) {

            console.log("[saveRiderAccount] Database write verified successfully.");

            window.showToast(isEditRiderMode ? "Rider updated successfully!" : "Rider account created successfully!", "success");

        } else {

            console.error("[saveRiderAccount] Database write FAILED verification.");

            window.showToast("Warning: Database record failed to save.", "error");

        }

        hideRiderModal();

    } catch (e) {

        window.showToast("Operation failed: " + e.message, "error");

    }

};



window.resetRiderPassword = async (email) => {

    if (await window.showConfirm(`Send password reset link to ${email}?`, "Reset Password")) {

        firebase.auth().sendPasswordResetEmail(email)

            .then(() => window.showToast("Reset link sent to " + email, "success"))

            .catch(e => window.showToast("Error: " + e.message, "error"));

    }

};



// CUSTOMERS

function loadCustomers() {

    const table = document.getElementById("customersTable");

    if (!table) return;



    // Fetch both to correlate

    Promise.all([

        Outlet.ref("customers").once("value"),

        Outlet.ref("orders").once("value")

    ]).then(([custSnap, orderSnap]) => {

        const orders = [];

        orderSnap.forEach(o => { orders.push(o.val()); });



        table.innerHTML = "";

        custSnap.forEach(child => {

            const c = child.val();

            const phone = child.key;



            // Calculate stats

            const myOrders = orders.filter(o => o.phone === phone);

            const orderCount = myOrders.length;

            const ltv = myOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);



            const displayPhone = phone.slice(0, 2) + "****" + phone.slice(-4);

            const truncatedAddress = c.address ? (c.address.length > 30 ? c.address.substring(0, 30) + "..." : c.address) : "No address saved";



            table.innerHTML += `

                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05)">

                    <td data-label="Name">

                        <div style="font-weight:600; color:var(--text-main)">${escapeHtml(c.name)}</div>

                        <small style="color:var(--text-muted); font-size:10px;">Joined: ${c.registeredAt ? new Date(c.registeredAt).toLocaleDateString() : 'N/A'}</small>

                    </td>

                    <td data-label="WhatsApp">

                        <a href="https://wa.me/91${phone.replace(/\D/g, "").slice(-10)}" target="_blank" style="color:var(--primary); text-decoration:none; display:flex; align-items:center; gap:5px;">

                             <i class="fab fa-whatsapp"></i> ${escapeHtml(displayPhone)}

                        </a>

                    </td>

                    <td data-label="Last Address">

                        <div style="font-size:12px; color:var(--text-main); max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(c.address || '')}">

                            ${escapeHtml(truncatedAddress)}

                        </div>

    ${c.locationLink ? `<a href="${escapeHtml(c.locationLink)}" target="_blank" style="color:var(--primary); font-size:10px; text-decoration:none;">📍 Map Link</a>` : ""}

                    </td>

                    <td data-label="Orders" style="font-weight:600; color:var(--vibrant-orange)">${orderCount}</td>

                    <td data-label="LTV" style="font-weight:700; color:var(--warm-yellow)">₹${ltv.toLocaleString()}</td>

                </tr>

            `;

        });

    });

}



// =============================

// REPORTS & ANALYTICS

// =============================

function loadReports() {

    const now = new Date();

    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    const lastDay = now.toISOString().split('T')[0];



    if (document.getElementById("reportFrom")) document.getElementById("reportFrom").value = firstDay;

    if (document.getElementById("reportTo")) document.getElementById("reportTo").value = lastDay;



    generateCustomReport();

}



let salesData = []; // Global for exports



window.generateCustomReport = () => {

    const from = document.getElementById("reportFrom").value;

    const to = document.getElementById("reportTo").value;

    const tableBody = document.getElementById("reportTableBody");

    const container = document.getElementById("reportsContainer");



    if (!tableBody) return;



    tableBody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:30px;'>🔔 Collecting sales data...</td></tr>";



    Outlet.ref("orders").once("value", snap => {

        let totalRev = 0;

        let totalOrd = 0;

        salesData = [];



        snap.forEach(child => {

            const o = child.val();

            if (o.outlet && window.currentOutlet && o.outlet.toLowerCase().trim() !== window.currentOutlet.toLowerCase().trim()) return;

            if (o.status === "Cancelled") return;

            let itemDate;

            try {

                itemDate = new Date(o.createdAt);

            } catch (e) { return; }



            if (isNaN(itemDate.getTime())) return;

            const dateStr = itemDate.toISOString().split('T')[0];



            if (dateStr >= from && dateStr <= to) {

                totalRev += Number(o.total || 0);

                totalOrd++;

                salesData.push({ id: child.key, ...o, dateStr });

            }

        });



        // Update KPI Cards & Period

        const fromDate = from ? formatDate(new Date(from).getTime()) : "Start";

        const toDate = to ? formatDate(new Date(to).getTime()) : "Today";

        const periodEl = document.getElementById("reportPeriod");

        if (periodEl) periodEl.innerText = `${fromDate} to ${toDate}`;



        document.getElementById("reportRevenue").innerText = "₹" + totalRev.toLocaleString();

        document.getElementById("reportOrders").innerText = totalOrd;

        document.getElementById("reportAvg").innerText = "₹" + (totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0);



        // Sort by date descending

        salesData.sort((a, b) => b.createdAt - a.createdAt);



        // Render Table

        tableBody.innerHTML = salesData.map(o => `

            <tr class="report-row-bordered">

                <td data-label="Date" class="report-cell report-date-cell">${formatDate(o.createdAt)}</td>

                <td data-label="Customer" class="report-cell">

                     <div class="report-cust-name">${escapeHtml(o.customerName || 'Guest')}</div>

                    <div class="report-cust-phone">${escapeHtml(o.phone || '')}</div>

                </td>

                <td data-label="Total" class="report-cell report-total-cell">₹${o.total || 0}</td>

                <td data-label="Method" class="report-cell"><span class="badge badge-secondary">${escapeHtml(o.paymentMethod || 'COD')}</span></td>

                <td data-label="Items" class="report-cell">

                     <div class="text-muted-small text-truncate" style="max-width:250px;" title="${o.items ? o.items.map(i => `${escapeHtml(i.name)} x${i.quantity}`).join(', ') : ''}">

                        ${o.items ? o.items.map(i => `${escapeHtml(i.name)} x${i.quantity}`).join(', ') : 'Empty'}

                    </div>

                </td>

            </tr>

        `).join('') || "<tr><td colspan='5' class='report-cell text-center py-30 text-muted'>No orders found for this range</td></tr>";



        // Render visual chart

        renderRevenueChart(salesData);

    });

};



window.generateReport = window.generateCustomReport;



let revenueChart; // Global chart instance

function renderRevenueChart(data) {

    const ctx = document.getElementById('revenueChart');

    if (!ctx) return;



    // Aggregate by date

    const dailyData = {};

    data.forEach(o => {

        dailyData[o.dateStr] = (dailyData[o.dateStr] || 0) + Number(o.total || 0);

    });



    const labels = Object.keys(dailyData).sort();

    const values = labels.map(l => dailyData[l]);



    if (revenueChart) revenueChart.destroy();



    const isDarkMode = document.body.classList.contains('dark-mode');

    const tickColor = isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';

    const gridColor = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';



    revenueChart = new Chart(ctx, {

        type: 'line',

        data: {

            labels,

            datasets: [{

                label: 'Daily Revenue',

                data: values,

                borderColor: '#FF6B00',

                backgroundColor: 'rgba(255, 107, 0, 0.1)',

                borderWidth: 3,

                tension: 0.4,

                fill: true,

                pointBackgroundColor: '#FF6B00',

                pointRadius: 4

            }]

        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            scales: {

                y: {

                    beginAtZero: true,

                    grid: { color: gridColor },

                    ticks: { color: tickColor, font: { size: 10 } }

                },

                x: {

                    grid: { display: false },

                    ticks: { color: tickColor, font: { size: 10 } }

                }

            },

            plugins: {

                legend: { display: false }

            }

        }

    });





}



window.downloadExcel = () => {

    if (salesData.length === 0) {

        window.showToast("No data to export.", "info");

        return;

    }



    const data = salesData.map(o => ({

        Date: formatDate(o.createdAt),

        "Order ID": o.orderId || o.id,

        Customer: o.customerName || 'Guest',

        Phone: o.phone || '',

        Total: o.total || 0,

        Method: o.paymentMethod || 'COD',

        Status: o.status,

        Items: o.items ? o.items.map(i => `${i.name} x${i.quantity}`).join(', ') : ''

    }));



    const ws = XLSX.utils.json_to_sheet(data);

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Sales Report");

    XLSX.writeFile(wb, `Sales_Report_${new Date().toISOString().split('T')[0]}.xlsx`);

};



window.downloadPDF = () => {

    if (salesData.length === 0) {

        window.showToast("No data to export.", "info");

        return;

    }



    if (!window.jspdf) {

        window.showToast("PDF library not ready.", "error");

        return;

    }

    const { jsPDF } = window.jspdf;

    const doc = new jsPDF();



    doc.setFontSize(20);

    doc.text("Sales Report", 14, 22);

    doc.setFontSize(11);

    doc.setTextColor(100);



    const from = document.getElementById("reportFrom").value;

    const to = document.getElementById("reportTo").value;

    doc.text(`Period: ${from} to ${to}`, 14, 30);

    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 36);



    const tableData = salesData.map(o => [

        formatDate(o.createdAt),

        o.customerName || 'Guest',

        `Rs. ${o.total}`,

        o.paymentMethod || 'COD',

        o.items ? o.items.map(i => `${i.name} x${i.quantity}`).join(', ') : ''

    ]);



    doc.autoTable({

        startY: 45,

        head: [['Date', 'Customer', 'Total', 'Method', 'Items']],

        body: tableData,

        theme: 'grid',

        headStyles: { fillColor: [6, 95, 70] },

        columnStyles: {

            4: { cellWidth: 60 }

        }

    });

    doc.save(`Sales_Report_${from}_to_${to}.pdf`);

};



// SETTINGS

window.loadSettings = async () => {

    const container = document.getElementById('settingsContainer');

    if (!container) return;



    try {

        container.innerHTML = `<div style="text-align:center; padding:100px; color:var(--text-muted);">🔔 Loading shop settings...</div>`;



        const [appSnap, uiSnap, botSnap] = await Promise.all([

            Outlet.ref("appConfig").once("value"),

            Outlet.ref("uiConfig").once("value"),

            Outlet.ref("settings/Bot").once("value")

        ]);



        const c = appSnap.val() || {};

        const u = uiSnap.val() || {};

        const b = botSnap.val() || {};



        container.innerHTML = `

            <div class="glass-card" style="padding: 3rem; max-width: 1000px; margin: 20px auto; border-radius: 30px; position:relative; overflow:hidden;">

                <!-- Decorative background elements -->

                <div style="position:absolute; top:-50px; right:-50px; width:200px; height:200px; background:var(--action-green); opacity:0.05; border-radius:50%; z-index:0;"></div>

                <div style="position:absolute; bottom:-50px; left:-50px; width:150px; height:150px; background:var(--alert-orange); opacity:0.05; border-radius:50%; z-index:0;"></div>



                <div style="position:relative; z-index:1;">

                    <div style="display:flex; align-items:center; gap:20px; margin-bottom:40px;">

                        <div style="background:var(--action-green); width:64px; height:64px; border-radius:18px; display:flex; align-items:center; justify-content:center; box-shadow:0 10px 20px rgba(6,95,70,0.2);">

            <span style="font-size:28px;">⚙️</span>

                        </div>

                        <div>

                            <h2 style="font-size:28px; font-weight:800; color:var(--text-main); margin:0; letter-spacing:-0.5px;">Shop Configuration</h2>

                            <p style="color:var(--text-muted); margin:4px 0 0; font-size:14px; font-weight:500;">Customize your store's identity and operational limits</p>

                        </div>

                    </div>



                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:30px;">

                        <!-- Left Column: Identity -->

                        <div style="display:flex; flex-direction:column; gap:25px;">

                            <div class="settings-group">

                                <label style="display:block; font-size:12px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">Shop Identity</label>

                                

                                <div style="margin-bottom:15px;">

                                    <label class="form-label" style="font-size:13px; font-weight:600;">Public Shop Name</label>

                                    <input type="text" id="setConfigName" value="${escapeHtml(c.shopName || '')}" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:600;">

                                </div>

                                

                                <div style="margin-bottom:15px;">

                                    <label class="form-label" style="font-size:13px; font-weight:600;">WhatsApp Support / Bot</label>

                                    <input type="text" id="setConfigPhone" value="${escapeHtml(c.whatsapp || '')}" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:600;">

                                </div>

                                

                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">

                                    <div>

                                        <label class="form-label" style="font-size:13px; font-weight:600;">Store Status</label>

                                        <select id="setConfigStatus" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:600;" title="Store Status">

                                            <option value="Open" ${c.status === 'Open' ? 'selected' : ''}>🟢 Open</option>

                                            <option value="Closed" ${c.status === 'Closed' ? 'selected' : ''}>🔴 Closed</option>

                                        </select>

                                    </div>

                                    <div>

                                        <label class="form-label" style="font-size:13px; font-weight:600;">Master OTP</label>

                                        <input type="text" id="setConfigMasterOTP" value="${escapeHtml(c.masterOTP || '0000')}" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:700; color:var(--action-green); text-align:center;">

                                    </div>

                                </div>



                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-top:15px;">

                                    <div>

                                        <label class="form-label" style="font-size:13px; font-weight:600;">Store Latitude</label>

                                        <input type="text" id="setConfigLat" value="${c.lat || ''}" class="form-input" placeholder="e.g. 25.8879" style="background:white; border:1.5px solid rgba(0,0,0,0.05);">

                                    </div>

                                    <div>

                                        <label class="form-label" style="font-size:13px; font-weight:600;">Store Longitude</label>

                                        <input type="text" id="setConfigLng" value="${c.lng || ''}" class="form-input" placeholder="e.g. 85.0261" style="background:white; border:1.5px solid rgba(0,0,0,0.05);">

                                    </div>

                                </div>

                            </div>

                        </div>



                        <!-- Right Column: Logistics -->

                        <div style="display:flex; flex-direction:column; gap:25px;">

                            <div class="settings-group">

                                <label style="display:block; font-size:12px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">Logistics & Branding</label>

                                

                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:15px;">

                                    <div>

                                        <label class="form-label" style="font-size:13px; font-weight:600;">Delivery Fee (₹)</label>

                                        <input type="number" id="setConfigFee" value="${c.deliveryFee || 0}" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:700;">

                                    </div>

                                    <div>

                                        <label class="form-label" style="font-size:13px; font-weight:600;">Min. Order (₹)</label>

                                        <input type="number" id="setConfigMinOrder" value="${c.minOrder || 0}" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:700;">

                                    </div>

                                </div>



                                <div style="margin-bottom:15px;">

                                    <label class="form-label" style="font-size:13px; font-weight:600;">Business Address</label>

                                    <textarea id="setConfigAddress" class="form-input" style="height: 64px; background:white; border:1.5px solid rgba(0,0,0,0.05); font-size:13px; font-weight:500;">${escapeHtml(c.address || '')}</textarea>

                                </div>



                                <div>

                                    <label class="form-label" style="font-size:13px; font-weight:600; margin-bottom:10px; display:block;">Store Banners (Click to Change)</label>

                                <div style="display:flex; gap:15px;">

                                    <div style="flex:1; cursor:pointer;" data-action="triggerClick" data-val="welcomeFile">

                                        <div style="position:relative; width:100%; height:80px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                            <img id="welcomePreview" src="${u.welcomeImage || 'https://via.placeholder.com/300x150'}" style="width:100%; height:100%; object-fit:cover;">

                                            <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.6); color:white; font-size:9px; text-align:center; padding:4px; font-weight:700;">WELCOME</div>

                                        </div>

                                        <input type="file" id="welcomeFile" style="display:none" data-action="previewImage" data-preview-id="welcomePreview">

                                        <input type="hidden" id="setUIWelcome" value="${u.welcomeImage || ''}">

                                    </div>

                                    <div style="flex:1; cursor:pointer;" data-action="triggerClick" data-val="menuFile">

                                        <div style="position:relative; width:100%; height:80px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                            <img id="menuBannerPreview" src="${u.menuImage || 'https://via.placeholder.com/300x150'}" style="width:100%; height:100%; object-fit:cover;">

                                            <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.6); color:white; font-size:9px; text-align:center; padding:4px; font-weight:700;">MENU BANNER</div>

                                        </div>

                                        <input type="file" id="menuFile" style="display:none" data-action="previewImage" data-preview-id="menuBannerPreview">

                                        <input type="hidden" id="setUIMenu" value="${u.menuImage || ''}">

                                    </div>

                                </div>

                            </div>

                        </div>

                    </div>



                    <!-- WhatsApp Bot Aesthetics Section -->

                    <div style="margin-top:40px; border-top:1px solid rgba(0,0,0,0.05); padding-top:30px;">

                        <label style="display:block; font-size:12px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:20px;">WhatsApp Bot Aesthetics (Per Outlet)</label>

                        

                        <div style="display:grid; grid-template-columns: 2fr 3fr; gap:30px;">

                            <!-- Welcome Image -->

                            <div class="settings-group">

                                <label class="form-label" style="font-size:13px; font-weight:600; margin-bottom:12px; display:block;">Bot Welcome / Intro Image</label>

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botWelcomeFile">

                                    <div style="position:relative; width:100%; height:180px; border-radius:18px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botWelcomePreview" src="${b.imgWelcome || 'https://via.placeholder.com/600x300?text=Welcome+Image'}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; inset:0; background:linear-gradient(to top, rgba(0,0,0,0.6), transparent); display:flex; align-items:flex-end; justify-content:center; padding-bottom:10px;">

                                            <span style="color:white; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Change Greeting Image</span>

                                        </div>

                                    </div>

                                    <input type="file" id="botWelcomeFile" style="display:none" data-action="previewImage" data-preview-id="botWelcomePreview">

                                    <input type="hidden" id="setBotWelcome" value="${b.imgWelcome || ''}">

                                </div>

                            </div>



                            <!-- Status Update Images -->

                            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:15px;">

                                <!-- Confirmed -->

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botConfirmedFile">

                                    <div style="position:relative; width:100%; height:85px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botConfirmedPreview" src="${b.imgConfirmed || 'https://via.placeholder.com/150?text=Confirmed'}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(6,95,70,0.8); color:white; font-size:8px; text-align:center; padding:3px; font-weight:700;">CONFIRMED</div>

                                    </div>

                                    <input type="file" id="botConfirmedFile" style="display:none" data-action="previewImage" data-preview-id="botConfirmedPreview">

                                    <input type="hidden" id="setBotConfirmed" value="${b.imgConfirmed || ''}">

                                </div>

                                <!-- Preparing -->

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botPreparingFile">

                                    <div style="position:relative; width:100%; height:85px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botPreparingPreview" src="${b.imgPreparing || 'https://via.placeholder.com/150?text=Preparing'}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(217&#8377;19,6,0.8); color:white; font-size:8px; text-align:center; padding:3px; font-weight:700;">PREPARING</div>

                                    </div>

                                    <input type="file" id="botPreparingFile" style="display:none" data-action="previewImage" data-preview-id="botPreparingPreview">

                                    <input type="hidden" id="setBotPreparing" value="${b.imgPreparing || ''}">

                                </div>

                                <!-- Cooked -->

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botCookedFile">

                                    <div style="position:relative; width:100%; height:85px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botCookedPreview" src="${b.imgCooked || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%23999'%3ECooked%3C/text%3E%3C/svg%3E"}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(31,41,55,0.8); color:white; font-size:8px; text-align:center; padding:3px; font-weight:700;">COOKED</div>

                                    </div>

                                    <input type="file" id="botCookedFile" style="display:none" data-action="previewImage" data-preview-id="botCookedPreview">

                                    <input type="hidden" id="setBotCooked" value="${b.imgCooked || ''}">

                                </div>

                                <!-- Out -->

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botOutFile">

                                    <div style="position:relative; width:100%; height:85px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botOutPreview" src="${b.imgOut || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%23999'%3EOut%3C/text%3E%3C/svg%3E"}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(37,99,235,0.8); color:white; font-size:8px; text-align:center; padding:3px; font-weight:700;">OUT FOR DEL.</div>

                                    </div>

                                    <input type="file" id="botOutFile" style="display:none" data-action="previewImage" data-preview-id="botOutPreview">

                                    <input type="hidden" id="setBotOut" value="${b.imgOut || ''}">

                                </div>

                                <!-- Delivered -->

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botDeliveredFile">

                                    <div style="position:relative; width:100%; height:85px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botDeliveredPreview" src="${b.imgDelivered || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%23999'%3EDelivered%3C/text%3E%3C/svg%3E"}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(5&#8377;50&#8377;05,0.8); color:white; font-size:8px; text-align:center; padding:3px; font-weight:700;">DELIVERED</div>

                                    </div>

                                    <input type="file" id="botDeliveredFile" style="display:none" data-action="previewImage" data-preview-id="botDeliveredPreview">

                                    <input type="hidden" id="setBotDelivered" value="${b.imgDelivered || ''}">

                                </div>

                                <!-- Feedback -->

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botFeedbackFile">

                                    <div style="position:relative; width:100%; height:85px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botFeedbackPreview" src="${b.imgFeedback || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%23999'%3EFeedback%3C/text%3E%3C/svg%3E"}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(124,58,237,0.8); color:white; font-size:8px; text-align:center; padding:3px; font-weight:700;">FEEDBACK</div>

                                    </div>

                                    <input type="file" id="botFeedbackFile" style="display:none" data-action="previewImage" data-preview-id="botFeedbackPreview">

                                    <input type="hidden" id="setBotFeedback" value="${b.imgFeedback || ''}">

                                </div>

                                <!-- Cancelled -->

                                <div style="cursor:pointer;" data-action="triggerClick" data-val="botCancelledFile">

                                    <div style="position:relative; width:100%; height:85px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">

                                        <img id="botCancelledPreview" src="${b.imgCancelled || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%23999'%3ECancelled%3C/text%3E%3C/svg%3E"}" style="width:100%; height:100%; object-fit:cover;">

                                        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(153,27,27,0.8); color:white; font-size:8px; text-align:center; padding:3px; font-weight:700;">CANCELLED</div>

                                    </div>

                                    <input type="file" id="botCancelledFile" style="display:none" data-action="previewImage" data-preview-id="botCancelledPreview">

                                    <input type="hidden" id="setBotCancelled" value="${b.imgCancelled || ''}">

                                </div>

                            </div>

                        </div>

                    </div>



                    <div style="margin-top: 50px; text-align: center; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 35px;">

                        <button data-action="saveSettings" class="btn-primary" style="margin: 0 auto; width: 340px; justify-content: center; padding: 18px; border-radius: 18px; font-size: 16px; font-weight: 800; box-shadow: 0 15px 30px rgba(6,95,70,0.2); letter-spacing:0.5px;">

                            💾 SAVE SYSTEM CONFIGURATION

                        </button>

                    </div>

                </div>

            </div>

        `;

    } catch (err) {

        console.error("Load Settings Error:", err);

        container.innerHTML = `<div style="text-align:center; padding:100px; color:var(--text-muted);">❌ Failed to load settings. Check console.</div>`;

    }

}



window.saveSettings = async () => {

    const shopName = document.getElementById("setConfigName").value;

    const fee = document.getElementById("setConfigFee").value;

    const minOrder = document.getElementById("setConfigMinOrder").value;

    const addr = document.getElementById("setConfigAddress").value;

    const whatsapp = document.getElementById("setConfigPhone").value;

    const status = document.getElementById("setConfigStatus").value;

    const masterOTP = document.getElementById("setConfigMasterOTP").value;

    const lat = document.getElementById("setConfigLat").value;

    const lng = document.getElementById("setConfigLng").value;



    let welcome = document.getElementById("setUIWelcome").value;

    let menu = document.getElementById("setUIMenu").value;



    const welcomeFile = document.getElementById("welcomeFile").files[0];

    const menuFile = document.getElementById("menuFile").files[0];



    const btn = document.querySelector("#settingsContainer .btn-primary");

    const originalText = btn ? btn.innerText : "Save Settings";

    if (btn) {

        btn.disabled = true;

        btn.innerText = "Processing...";

    }



    try {

        if (welcomeFile) {

            const oldWelcome = welcome;

            welcome = await uploadImage(welcomeFile, `banners/welcome_${Date.now()}`);

            if (oldWelcome && welcome !== oldWelcome) {

                await deleteImage(oldWelcome);

            }

        }

        if (menuFile) {

            const oldMenu = menu;

            menu = await uploadImage(menuFile, `banners/menu_${Date.now()}`);

            if (oldMenu && menu !== oldMenu) {

                await deleteImage(oldMenu);

            }

        }



        const botImageKeys = [

            { key: 'imgWelcome', fileId: 'botWelcomeFile', hiddenId: 'setBotWelcome' },

            { key: 'imgConfirmed', fileId: 'botConfirmedFile', hiddenId: 'setBotConfirmed' },

            { key: 'imgPreparing', fileId: 'botPreparingFile', hiddenId: 'setBotPreparing' },

            { key: 'imgCooked', fileId: 'botCookedFile', hiddenId: 'setBotCooked' },

            { key: 'imgOut', fileId: 'botOutFile', hiddenId: 'setBotOut' },

            { key: 'imgDelivered', fileId: 'botDeliveredFile', hiddenId: 'setBotDelivered' },

            { key: 'imgFeedback', fileId: 'botFeedbackFile', hiddenId: 'setBotFeedback' },

            { key: 'imgCancelled', fileId: 'botCancelledFile', hiddenId: 'setBotCancelled' }

        ];



        const botSettings = {};

        for (const item of botImageKeys) {

            const hiddenInput = document.getElementById(item.hiddenId);

            const fileInput = document.getElementById(item.fileId);

            if (!hiddenInput || !fileInput) continue;



            let val = hiddenInput.value;

            const file = fileInput.files[0];

            if (file) {

                val = await uploadImage(file, `bot/${item.key}_${Date.now()}`);

            }

            botSettings[item.key] = val;

        }

        await Outlet.ref("settings/Bot").update(botSettings);



        await Outlet.ref("appConfig").update({

            shopName,

            deliveryFee: Number(fee),

            minOrder: Number(minOrder),

            address: addr,

            whatsapp,

            status,

            masterOTP,

            lat: (lat !== undefined && lat !== null && lat !== "") ? Number(lat) : null,

            lng: (lng !== undefined && lng !== null && lng !== "") ? Number(lng) : null

        });

        await Outlet.ref("uiConfig").update({ welcomeImage: welcome, menuImage: menu });



        const sidebarHeader = document.querySelector(".sidebar-header");

        if (sidebarHeader) {

            sidebarHeader.innerText = shopName.split(" ")[0].toUpperCase() + " ERP";

        }



        window.showToast("Settings updated successfully!", "success");

        loadSettings();

    } catch (e) {

        window.showToast("Error saving settings: " + e.message, "error");

    } finally {

        if (btn) {

            btn.disabled = false;

            btn.innerText = originalText;

        }

    }

};



// DASHBOARD HELPERS



// ACTIONS

window.updateStatus = (id, status) => {

    if (!status) return;

    window.haptic(20);



    if (status === "Delivered") {

        return window.openPaymentModal(id);

    }



    const updates = {

        status: status,

        updatedAt: firebase.database.ServerValue.TIMESTAMP

    };



    if (status === "Ready" || status === "Cooked") {

        updates.readyAt = firebase.database.ServerValue.TIMESTAMP;

    } else if (status === "Out for Delivery") {

        updates.dispatchedAt = firebase.database.ServerValue.TIMESTAMP;

    }



    return Outlet.ref("orders/" + id).update(updates)

        .then(() => {

            window.showToast(`Order status updated to "${status}"`, 'success');

        })

        .catch(err => {

            console.error("[StatusUpdate Error]", err);

            window.showToast("Failed to update status: " + err.message, 'error');

        });

};



window.openPaymentModal = (id) => {

    const existing = document.getElementById('paymentModal');

    if (existing) existing.remove();



    const order = ordersMap.get(id);

    const total = order ? order.total : '...';



    const modal = document.createElement('div');

    modal.id = 'paymentModal';

    modal.style = `

        position: fixed; top: 0; left: 0; width: 100%; height: 100%;

        background: rgba(0,0,0,0.8); backdrop-filter: blur(8px);

        display: flex; align-items: center; justify-content: center; z-index: 10000;

        animation: fadeIn 0.3s ease;

    `;



    modal.innerHTML = `

        <div class="payment-modal-card">

            <div style="text-align: center; margin-bottom: 25px;">

                <div class="payment-modal-badge">Payment Settlement</div>

                <h2 class="payment-modal-total">₹${total}</h2>

                <p style="color: #666; font-size: 14px; margin-top: 5px;">Select payment method used for this delivery</p>

            </div>

            

            <div style="display: flex; flex-direction: column; gap: 12px;">

                <button data-action="saveDeliveredOrder" data-id="${id}" data-val="Cash" class="pay-option-btn cash">

                    <span style="font-size: 24px;">💵</span>

                    <div style="text-align: left;">

                        <div style="font-weight: 800; font-size: 16px;">Cash</div>

                        <div style="font-size: 11px; opacity: 0.7;">Received by Hand</div>

                    </div>

                </button>

                <button data-action="saveDeliveredOrder" data-id="${id}" data-val="UPI" class="pay-option-btn upi">

                    <span style="font-size: 24px;">📱</span>

                    <div style="text-align: left;">

                        <div style="font-weight: 800; font-size: 16px;">UPI / Online</div>

                        <div style="font-size: 11px; opacity: 0.7;">GPay, PhonePe, etc.</div>

                    </div>

                </button>

                <button data-action="saveDeliveredOrder" data-id="${id}" data-val="Card" class="pay-option-btn card">

                    <span style="font-size: 24px;">💳</span>

                    <div style="text-align: left;">

                        <div style="font-weight: 800; font-size: 16px;">Card</div>

                        <div style="font-size: 11px; opacity: 0.7;">Debit / Credit Card</div>

                    </div>

                </button>

            </div>



            <button data-action="removeElement" data-target-id="paymentModal" class="payment-modal-cancel">CANCEL</button>

        </div>

    `;



    document.body.appendChild(modal);

};



window.saveDeliveredOrder = async (id, method) => {

    window.haptic(30);

    const buttons = document.querySelectorAll(`.pay-option-btn`);

    buttons.forEach(btn => btn.disabled = true);



    try {

        await Outlet.ref("orders/" + id).update({

            status: "Delivered",

            paymentMethod: method,

            paymentStatus: "Paid",

            updatedAt: firebase.database.ServerValue.TIMESTAMP

        });



        window.showToast(`Order marked Delivered via ${method}`, 'success');

        const modal = document.getElementById('paymentModal');

        if (modal) modal.remove();

    } catch (err) {

        console.error("[DeliveredSave Error]", err);

        window.showToast("Failed to finalize order: " + err.message, 'error');

        buttons.forEach(btn => btn.disabled = false);

    }

};





window.assignRider = async (id, riderEmail) => {

    if (!id || !riderEmail) {

        window.showToast('Invalid order ID or rider selection.', 'error');

        return;

    }



    try {

        // Verify the order exists before attempting assignment

        const orderSnap = await Outlet.ref('orders/' + id).once('value');

        if (!orderSnap.exists()) {

            window.showToast('Order not found.', 'error');

            return;

        }



        await Outlet.ref('orders/' + id).update({

            assignedRider: riderEmail,

            status: 'Out for Delivery'

        });

        window.showToast('Rider assigned successfully.', 'success');

    } catch (err) {

        console.error('[assignRider] Error:', err);

        window.showToast('Failed to assign rider. Please try again.', 'error');

    }

};

window.toggleWifiPass = () => {

    const passInput = document.getElementById('settingWifiPass');

    if (passInput.type === 'password') {

        passInput.type = 'text';

    } else {

        passInput.type = 'password';

    }

};



window.toggleRiderPass = () => {

    const passInput = document.getElementById('riderPass');

    if (passInput.type === 'password') {

        passInput.type = 'text';

    } else {

        passInput.type = 'password';

    }

};



async function loadLostSales() {

    console.log("[Lost Sales] Loading records...");

    const tbody = document.getElementById('lostSalesTableBody');

    const revenueBadge = document.querySelector('#lostSalesTotalRevenue span');

    if (!tbody) return;



    try {

        const snap = await Outlet.ref('lostSales').once('value');

        const data = snap.val();



        tbody.innerHTML = '';

        let totalLost = 0;



        if (!data) {

            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:80px; color:var(--text-muted);">

                <div class="mb-14" style="font-size:32px;">🛍️ </div>

                <strong>No lost sales found!</strong><br>All your customers are reaching the finish line.

            </td></tr>`;

            if (revenueBadge) revenueBadge.innerText = `₹0`;

            return;

        }



        const sorted = Object.entries(data).sort((a, b) => (b[1].cancelledAt || 0) - (a[1].cancelledAt || 0));



        sorted.forEach(([id, record]) => {

            const val = record.total || 0;

            totalLost += val;



            const itemsStr = (record.items || []).map(i => `${i.name} (${i.size})`).join(', ');

            const ts = formatDate(record.cancelledAt);

            const source = record.sourceStep || 'Checkout';



            const phone = record.phone || 'N/A';

            const whatsappLink = `https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}`;



            const tr = document.createElement('tr');

            tr.innerHTML = `

                <td style="padding-left:25px;">

                    <div class="font-bold text-main">${ts}</div>

                    <div class="text-muted-small" style="font-size:10px;">ID: ...${id.slice(-6)}</div>

                </td>

                <td>

                    <div class="flex-column">

                        <span class="font-bold">${escapeHtml(record.customerName || 'Guest')}</span>

                        <a href="${whatsappLink}" target="_blank" class="text-primary font-bold" style="font-size:12px;">📱 ${escapeHtml(phone)}</a>

                    </div>

                </td>

                <td>

                    <span class="status-pill" style="background:rgba(0,0,0,0.05); color:var(--text-dark); border:1px solid rgba(0,0,0,0.1); font-size:10px;">

                        ${escapeHtml(source)}

                    </span>

                </td>

                <td style="max-width:250px;">

                    <div class="text-truncate-2" title="${escapeHtml(itemsStr)}">${escapeHtml(itemsStr)}</div>

                </td>

                <td style="padding-right:25px; text-align:right;">

                    <span class="font-black" style="font-size:16px; color:var(--text-dark);">₹${val}</span>

                </td>

            `;

            tbody.appendChild(tr);

        });



        if (revenueBadge) revenueBadge.innerText = `₹${totalLost.toLocaleString()}`;



    } catch (e) {

        console.error("Load Lost Sales Error:", e);

        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:red;">Error loading data. Check console.</td></tr>`;

    }

}



async function clearLostSales() {

    if (!(await window.showConfirm("Are you sure you want to permanently delete all Lost Sales logs? This cannot be undone.", "Clear Lost Sales"))) return;



    window.haptic(20);

    try {

        await Outlet.ref('lostSales').remove();

        window.showToast("Logs cleared successfully", "success");

        loadLostSales();

    } catch (e) {

        console.error("Clear Logs Error:", e);

        window.showToast("Failed to clear logs", "error");

    }

}

window.loadLostSales = loadLostSales;

window.loadMenu = loadMenu;

window.loadCategories = loadCategories;

window.clearLostSales = clearLostSales;



let cachedDishes = [];



const catEmoji = {

    'pizza': '🍕', 'burger': '🍔', 'cake': '🎂', 'pastry': '🍰',

    'sandwich': '🥪', 'drink': '🥤', 'beverage': '🥤', 'juice': '🧃',

    'ice cream': '🍦', 'dessert': '🍰', 'pasta': '🍝', 'salad': '🥗',

    'fries': '🍟', 'chicken': '🍗', 'noodles': '🍜', 'biryani': '🥘',

    'thali': '🍕', 'combo': '🎁', 'wrap': '🌯', 'coffee': '☕',

    'shake': '🥤', 'mocktail': '🍹'

};



function getCatEmoji(category) {

    if (!category) return '🍕';

    const lower = category.toLowerCase();

    for (const [key, emoji] of Object.entries(catEmoji)) {

        if (lower.includes(key)) return emoji;

    }

    return '🍕';

}



function loadWalkinMenu() {

    const grid = document.getElementById('walkinDishGrid');

    if (!grid) return;



    renderWalkinCategoryTabs();



    Outlet.ref(`dishes`).once('value').then(snap => {

        allWalkinDishes = [];

        snap.forEach(child => {

            allWalkinDishes.push({ id: child.key, ...child.val() });

        });



        if (allWalkinDishes.length === 0) {

            grid.innerHTML = '<p class="menu-loading-placeholder">No dishes found. Add dishes in Menu → Dishes first.</p>';

            return;

        }



        applyWalkinFilters();



        const search = document.getElementById('walkinDishSearch');

        if (search) search.oninput = () => applyWalkinFilters();



        const phoneInput = document.getElementById('walkinCustPhone');

        if (phoneInput) {

            phoneInput.oninput = () => {

                const phone = phoneInput.value.trim();

                if (phone.length === 10) checkWalkinCustomer(phone);

            };

        }

    });

}



function filterWalkinByCategory(catName, el) {

    activeWalkinCategory = catName;

    // Update active tab styling

    document.querySelectorAll('.category-tab').forEach(tab => tab.classList.remove('active'));

    if (el) {

        el.classList.add('active');

    } else {

        // Fallback: match by text content if no element reference passed

        document.querySelectorAll('.category-tab').forEach(tab => {

            if (tab.textContent.trim() === catName) tab.classList.add('active');

        });

    }

    applyWalkinFilters();

}



function applyWalkinFilters() {

    const search = document.getElementById('walkinDishSearch');

    const term = search ? search.value.toLowerCase() : "";



    const filtered = allWalkinDishes.filter(d => {

        const matchesSearch = d.name.toLowerCase().includes(term);

        const matchesCat = activeWalkinCategory === 'All' || d.category === activeWalkinCategory;

        return matchesSearch && matchesCat;

    });



    renderWalkinDishGrid(filtered);

}



async function checkWalkinCustomer(phone) {

    try {

        const snap = await Outlet.ref(`customers/${phone}`).once('value');

        if (snap.exists()) {

            const data = snap.val();

            const nameInput = document.getElementById('walkinCustName');

            if (nameInput) {

                nameInput.value = data.name || "";

                window.showToast('✔️ Returning Customer: ' + data.name, 'success');

            }

        }

    } catch (e) { console.error(e); }

}



window.setDiscount = (val) => {

    const el = document.getElementById('walkinDiscount');

    if (el) {

        el.value = val;

        updateWalkinTotal();

    }

};



window.setDiscountPct = (pct) => {

    let subtotal = 0;

    Object.values(walkinCart).forEach(item => subtotal += item.price * item.qty);

    const val = Math.round(subtotal * (pct / 100));

    window.setDiscount(val);

};



window.clearWalkinCart = async () => {

    if (Object.keys(walkinCart).length === 0) return;

    if (await window.showConfirm('Clear entire order?', 'Clear Cart')) {

        walkinCart = {};

        document.getElementById('walkinDiscount').value = 0;

        document.getElementById('walkinCustName').value = '';

        document.getElementById('walkinCustPhone').value = '';

        const noteEl = document.getElementById('walkinCustNote');

        if (noteEl) noteEl.value = '';

        renderWalkinCart();

        window.showToast("Cart cleared", "info");

    }

};



let pendingAddonsByDish = {};



function renderWalkinDishGrid(dishes) {

    const grid = document.getElementById('walkinDishGrid');

    if (!grid) return;

    grid.innerHTML = '';



    dishes.forEach(d => {

        const dishId = d.id;

        const card = document.createElement('div');

        card.className = 'walkin-dish-card' + (d.stock === false ? ' out-of-stock' : '');

        card.dataset.id = dishId;



        let sizes = d.sizes || {};

        if (Object.keys(sizes).length === 0) {

            sizes = { "Regular": d.price || 0 };

        }



        const sizeOptions = Object.entries(sizes).map(([name, price]) =>

            `<option value="${escapeHtml(name)}" data-price="${price}">${escapeHtml(name)} - ₹${price}</option>`

        ).join('');



        card.innerHTML = `

            <div class="dish-emoji">${getCatEmoji(d.category)}</div>

            <div class="dish-name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>

            

            <div class="dish-controls">

                <select class="dish-size-select" id="size_${dishId}">

                    ${sizeOptions}

                </select>

                

                <div class="dish-qty-row">

                    <button class="qty-btn-sm" data-action="adjustCardQty" data-id="${dishId}" data-delta="-1">-</button>

                    <span class="qty-val-sm" id="qty_${dishId}">1</span>

                    <button class="qty-btn-sm" data-action="adjustCardQty" data-id="${dishId}" data-delta="1">+</button>

                </div>

                

                <div class="dish-action-row">

                    <button class="btn-card-add" data-action="addToWalkinCartFromCard" data-id="${dishId}">ADD</button>

                    <button class="btn-card-addon" data-action="showAddonView" data-id="${dishId}" title="Configure Add-ons">⚙️</button>

                </div>

            </div>

        `;



        grid.appendChild(card);

    });

}



window.adjustCardQty = (dishId, delta) => {

    const el = document.getElementById(`qty_${dishId}`);

    if (!el) return;

    let val = parseInt(el.innerText);

    val = Math.max(1, val + delta);

    el.innerText = val;

};



window.showAddonView = (dishId) => {

    const dish = allWalkinDishes.find(d => d.id === dishId);

    if (!dish) return;



    const dishGrid = document.getElementById('walkinDishGrid');

    const addonGrid = document.getElementById('walkinAddonsGrid');

    const walkinTitle = document.querySelector('#tab-walkin .panel-title');

    const searchBox = document.getElementById('walkinDishSearch');



    if (!dishGrid || !addonGrid) return;



    dishGrid.classList.add('hidden');

    addonGrid.classList.remove('hidden');

    if (searchBox) searchBox.classList.add('hidden');



    walkinTitle.innerHTML = '';

    const backBtn = document.createElement('button');

    backBtn.dataset.action = "hideAddonView";

    backBtn.className = 'btn-text';

    backBtn.style.padding = '0';

    backBtn.style.marginRight = '10px';

    backBtn.innerHTML = '<i data-lucide="arrow-left"></i>';



    const titleSpan = document.createElement('span');

    titleSpan.className = 'title-text';

    titleSpan.textContent = `Add-ons: ${dish.name}`;



    walkinTitle.appendChild(backBtn);

    walkinTitle.appendChild(titleSpan);



    if (typeof lucide !== 'undefined') lucide.createIcons();



    addonGrid.innerHTML = "";

    const cat = categories.find(c => c.name === dish.category);

    if (!cat || !cat.addons) {

        addonGrid.innerHTML = `<p class='p-20 text-muted center-text'>No add-ons available for this category.</p>`;

    } else {

        Object.entries(cat.addons).forEach(([name, price]) => {

            const isSelected = (pendingAddonsByDish[dishId] || []).includes(name);

            const item = document.createElement('div');

            item.className = `addon-picker-item ${isSelected ? 'active' : ''}`;

            item.innerHTML = `

                <div class="flex-row flex-center flex-gap-8">

                    <input type="checkbox" ${isSelected ? 'checked' : ''} style="pointer-events:none;">

                    <span class="fs-12 font-weight-700">${escapeHtml(name)}</span>

                </div>

                <span class="fs-12 font-weight-800 color-green">₹${price}</span>

            `;

            item.onclick = (e) => {

                if (!pendingAddonsByDish[dishId]) pendingAddonsByDish[dishId] = [];

                const idx = pendingAddonsByDish[dishId].indexOf(name);

                if (idx === -1) {

                    pendingAddonsByDish[dishId].push(name);

                    item.classList.add('active');

                    item.querySelector('input').checked = true;

                } else {

                    pendingAddonsByDish[dishId].splice(idx, 1);

                    item.classList.remove('active');

                    item.querySelector('input').checked = false;

                }

            };

            addonGrid.appendChild(item);

        });

    }



    const doneBtn = document.createElement('button');

    doneBtn.className = "btn-primary w-full mt-20";

    doneBtn.innerText = "Apply & Return";

    doneBtn.onclick = hideAddonView;

    addonGrid.appendChild(doneBtn);

};



window.hideAddonView = () => {

    const dishGrid = document.getElementById('walkinDishGrid');

    const addonGrid = document.getElementById('walkinAddonsGrid');

    const walkinTitle = document.querySelector('#tab-walkin .panel-title');

    const searchBox = document.getElementById('walkinDishSearch');



    if (dishGrid) dishGrid.classList.remove('hidden');

    if (addonGrid) addonGrid.classList.remove('hidden');

    if (searchBox) searchBox.classList.remove('hidden');

    if (walkinTitle) walkinTitle.innerHTML = `🍕 Select Items`;

};



window.addToWalkinCartFromCard = (dishId) => {

    const dish = allWalkinDishes.find(d => d.id === dishId);

    if (!dish) return;



    const sizeEl = document.getElementById(`size_${dishId}`);

    const qtyEl = document.getElementById(`qty_${dishId}`);

    if (!sizeEl || !qtyEl) return;



    const sizeName = sizeEl.value;

    const basePrice = Number(sizeEl.options[sizeEl.selectedIndex].dataset.price);

    const qty = parseInt(qtyEl.innerText);

    const addonNames = pendingAddonsByDish[dishId] || [];



    const cat = categories.find(c => c.name === dish.category);

    const addons = addonNames.map(name => ({

        name,

        price: (cat && cat.addons) ? (cat.addons[name] || 0) : 0

    }));



    const pricePerItem = basePrice + addons.reduce((sum, a) => sum + a.price, 0);

    const cartKey = `${dishId}::${sizeName}::${addonNames.sort().join('|')}`;



    if (walkinCart[cartKey]) {

        walkinCart[cartKey].qty += qty;

    } else {

        walkinCart[cartKey] = {

            id: dishId,

            name: dish.name,

            category: dish.category,

            size: sizeName,

            price: pricePerItem,

            qty: qty,

            addons: addons

        };

    }



    renderWalkinCart();

    haptic(20);

    window.showToast(`✔ Added ${qty}x ${dish.name}`, 'success');

};



function addToWalkinCart(id, name, price, size = "Regular") {

    const cartKey = id + "::" + size;

    if (walkinCart[cartKey]) {

        walkinCart[cartKey].qty++;

    } else {

        walkinCart[cartKey] = { id, name, price, qty: 1, size };

    }

    renderWalkinCart();

}



function removeFromWalkinCart(id) {

    delete walkinCart[id];

    renderWalkinCart();

}



window.walkinQtyChange = (id, delta) => {

    if (!walkinCart[id]) return;

    walkinCart[id].qty += delta;

    if (walkinCart[id].qty <= 0) {

        delete walkinCart[id];

    }

    renderWalkinCart();

};



window.walkinRemoveItem = (id) => removeFromWalkinCart(id);



function renderWalkinCart() {

    const container = document.getElementById('walkinCartItems');

    if (!container) return;



    const keys = Object.keys(walkinCart);

    if (keys.length === 0) {

        container.innerHTML = '<p id="walkinEmptyMsg" style="color:var(--text-muted); font-size:13px; text-align:center; padding:30px 0;">Tap dishes to add them here</p>';

        updateWalkinTotal();

        updateMobileCartSummaryState();

        return;

    }



    container.innerHTML = '';

    Object.entries(walkinCart).forEach(([key, item]) => {

        const div = document.createElement('div');

        div.className = 'walkin-cart-item';



        const addonsText = item.addons && item.addons.length > 0

            ? `<div class="item-addons-list">+ ${item.addons.map(a => escapeHtml(a.name)).join(', ')}</div>`

            : '';



        div.innerHTML = `

            <div class="item-info">

                <div class="item-main">

                    <div class="item-name">${escapeHtml(item.name)}</div>

                    <div class="item-variant">${escapeHtml(item.size)} - ₹${escapeHtml(item.price)}</div>

                </div>

                ${addonsText}

                <button class="btn-text-primary small-btn mt-4" data-action="openCartAddonPicker" data-id="${escapeHtml(key)}">+ Addons</button>

            </div>

            <div class="item-controls">

                <div class="qty-btn" data-action="walkinQtyChange" data-id="${escapeHtml(key)}" data-delta="-1">-</div>

                <div class="qty-val">${item.qty}</div>

                <div class="qty-btn" data-action="walkinQtyChange" data-id="${escapeHtml(key)}" data-delta="1">+</div>

                <div class="remove-btn" data-action="walkinRemoveItem" data-id="${escapeHtml(key)}">&times;</div>

            </div>

        `;

        container.appendChild(div);

    });



    updateWalkinTotal();

    updateMobileCartSummaryState();

}



window.selectWalkinPayment = (method, el) => {

    walkinPayMethod = method;

    document.querySelectorAll('.walkin-pay-btn').forEach(btn => btn.classList.remove('active'));

    if (el) el.classList.add('active');

    else {

        const target = document.querySelector(`.walkin-pay-btn[data-method="${method}"]`);

        if (target) target.classList.add('active');

    }

};





window.updateWalkinTotal = () => {

    let subtotal = 0;

    let itemCount = 0;

    Object.values(walkinCart).forEach(item => {

        subtotal += item.price * item.qty;

        itemCount += item.qty;

    });



    const discount = Math.max(0, Number(document.getElementById('walkinDiscount')?.value) || 0);

    const total = Math.max(0, subtotal - discount);



    const subEl = document.getElementById('walkinSubtotal');

    const totalEl = document.getElementById('walkinTotal');

    if (subEl) subEl.textContent = '₹' + subtotal.toLocaleString();

    if (totalEl) totalEl.textContent = '₹' + total.toLocaleString();

};



window.toggleMobileCart = (show) => {

    const cartEl = document.querySelector('#tab-walkin .walkin-cart');

    if (!cartEl) return;

    if (show) {

        cartEl.classList.add('active');

        document.body.style.overflow = 'hidden';

    } else {

        cartEl.classList.remove('active');

        document.body.style.overflow = 'auto';

    }

};



window.selectPayMethod = (btn) => {

    document.querySelectorAll('.walkin-pay-btn').forEach(b => b.classList.remove('active'));

    btn.classList.add('active');

    walkinPayMethod = btn.dataset.method;

};



window.submitWalkinSale = async () => {

    if (Object.keys(walkinCart).length === 0) {

        window.showToast('Please add at least one item to the cart.', 'error');

        return;

    }



    const custNote = document.getElementById('walkinCustNote')?.value.trim() || '';

    const custName = document.getElementById('walkinCustName')?.value.trim() || 'Walk-in Customer';

    const custPhoneRaw = document.getElementById('walkinCustPhone')?.value.trim() || '';

    let custPhone = custPhoneRaw.replace(/\D/g, '');

    if (custPhone.length === 10) custPhone = '91' + custPhone;



    const discount = Math.max(0, Number(document.getElementById('walkinDiscount')?.value) || 0);



    let subtotal = 0;

    const items = Object.keys(walkinCart).map(key => {

        const item = walkinCart[key];

        subtotal += item.price * item.qty;

        return {

            dishId: item.id,

            name: item.name,

            price: item.price,

            quantity: item.qty,

            size: item.size,

            addons: item.addons || null

        };

    });



    const total = Math.max(0, subtotal - discount);



    const orderId = await generateNextOrderId();



    const orderData = {

        orderId,

        customerName: custName,

        phone: custPhone,

        whatsappNumber: custPhone,

        customerNote: custNote,



        items,

        subtotal,

        discount,

        total,

        paymentMethod: walkinPayMethod,

        paymentStatus: 'Paid',

        status: 'Delivered',

        type: 'Walk-in',

        outlet: window.currentOutlet,

        createdAt: new Date().toISOString()

    };



    // Generate and save receipt HTML for persistence

    try {

        let store = {

            entityName: "", storeName: window.currentOutlet === 'pizza' ? 'ROSHANI PIZZA' : 'ROSHANI CAKES',

            address: "", gstin: "", fssai: "", tagline: "THANK YOU", poweredBy: "Powered by Roshani ERP",

            config: { showAddress: true, showGSTIN: false, showFSSAI: false, showTagline: true, showPoweredBy: true, showQR: true, showFeedbackQR: true }

        };

        const storeSnap = await Outlet.ref("settings/Store").once("value");

        if (storeSnap.exists()) {

            store = { ...store, ...storeSnap.val() };

        }



        const stdData = standardizeOrderData(orderData);

        orderData.receiptHtml = window.ReceiptTemplates.generateThermalReceipt(stdData, store, false);

    } catch (e) {

        console.error("Error generating receipt HTML for storage:", e);

    }



    try {

        await Outlet.ref('orders/' + orderId).set(orderData);



        if (custPhone) {

            const custRef = Outlet.ref(`customers/${custPhone}`);

            await custRef.transaction((current) => {

                if (current) {

                    current.orders = (current.orders || 0) + 1;

                    current.ltv = (current.ltv || 0) + total;

                    current.lastSeen = firebase.database.ServerValue.TIMESTAMP;

                    current.name = custName;

                    current.lastAddress = 'Walk-in';

                    return current;

                } else {

                    return {

                        name: custName,

                        orders: 1,

                        ltv: total,

                        lastSeen: firebase.database.ServerValue.TIMESTAMP,

                        lastAddress: 'Walk-in'

                    };

                }

            });

        }



        const confirmPrint = await window.showConfirm('Sale Recorded Successfully!\n\nID: ' + orderId + '\nTotal: ₹' + total + '\n\nWould you like to PRINT the receipt?', 'Sale Recorded');

        if (confirmPrint) {

            printOrderReceipt(orderData);

        }



        walkinCart = {};

        document.getElementById('walkinDiscount').value = 0;

        document.getElementById('walkinCustName').value = '';

        document.getElementById('walkinCustPhone').value = '';

        const noteEl = document.getElementById('walkinCustNote');

        if (noteEl) noteEl.value = '';

        renderWalkinCart();

        window.showToast('Sale Recorded successfully!', 'success');

    } catch (e) {

        window.showToast('Error recording sale: ' + e.message, 'error');

    }

};



function standardizeOrderData(o) {

    if (!o) return null;



    const orderId = o.orderId || o.id || (o.key ? o.key.slice(-8).toUpperCase() : "ORD-N/A");



    const items = (o.items || []).map(i => ({

        name: i.name || "Unknown Item",

        size: i.size || "",

        quantity: parseInt(i.quantity) || 1,

        price: parseFloat(i.price || i.unitPrice || 0)

    }));



    const orderDate = o.createdAt ? new Date(o.createdAt) : new Date();



    return {

        orderId: orderId,

        date: orderDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),

        time: orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),

        customerName: o.customerName || "Walk-in Customer",

        phone: o.phone || o.whatsappNumber || "",

        address: o.address || "",

        customerNote: o.customerNote || "",

        items: items,

        subtotal: parseFloat(o.subtotal || o.itemTotal || 0),

        discount: parseFloat(o.discount || 0),

        deliveryFee: parseFloat(o.deliveryFee || 0),

        total: parseFloat(o.total || 0),

        paymentMethod: o.paymentMethod || "Cash",

        type: o.type === "Walk-in" ? "Dine-in" : "Online Booked"

    };

}



window.printReceiptById = async (orderId) => {

    try {

        const snap = await Outlet.ref("orders").orderByChild("orderId").equalTo(orderId).once("value");

        let order;

        if (snap.exists()) {

            snap.forEach(s => order = s.val());

        } else {

            const snap2 = await Outlet.ref(`orders/${orderId}`).once("value");

            order = snap2.val();

        }



        if (!order) {

            window.showToast("Order not found!", "error");

            return;

        }



        if (order.type === 'Walk-in' && order.status !== 'Delivered') {

            window.updateStatus(orderId, 'Delivered');

        }



        printOrderReceipt(order, true);



    } catch (e) {

        console.error("Print Error:", e);

        window.showToast("Failed to fetch order for printing.", "error");

    }

};



async function printOrderReceipt(rawOrder, isReprint = false) {

    const o = standardizeOrderData(rawOrder);

    if (!o) return;



    // If it's the original print and we have saved HTML, use it

    if (!isReprint && rawOrder.receiptHtml) {

        const printWindow = window.open('', '_blank', 'width=450,height=800');

        if (printWindow) {

            printWindow.document.write(rawOrder.receiptHtml);

            printWindow.document.close();

            printWindow.focus();

            setTimeout(() => {

                try {

                    printWindow.print();

                    printWindow.close();

                } catch (e) { console.error("Print error:", e); }

            }, 800);

            return;

        }

    }



    let store = {

        entityName: "", storeName: window.currentOutlet === 'pizza' ? 'ROSHANI PIZZA' : 'ROSHANI CAKES',

        address: "", gstin: "", fssai: "", tagline: "THANK YOU", poweredBy: "Powered by Roshani ERP",

        config: { showAddress: true, showGSTIN: false, showFSSAI: false, showTagline: true, showPoweredBy: true, showQR: true, showFeedbackQR: true }

    };



    try {

        const storeSnap = await Outlet.ref("settings/Store").once("value");

        if (storeSnap.exists()) {

            store = { ...store, ...storeSnap.val() };

        }

    } catch (e) { }



    const printWindow = window.open('', '_blank', 'width=450,height=800');

    if (!printWindow) {

        window.showToast("Popup blocked! Please allow popups to print receipts.", "error");

        return;

    }



    const html = window.ReceiptTemplates.generateThermalReceipt(o, store, isReprint);

    printWindow.document.write(html);

    printWindow.document.close();

    printWindow.focus();

    setTimeout(() => {

        try {

            printWindow.print();

            printWindow.close();

        } catch (e) { console.error("Print error:", e); }

    }, 800);

}











window.addFeeSlab = (km = "", fee = "") => {

    const tbody = document.getElementById('feeSlabsTable');

    if (!tbody) return;

    const tr = document.createElement('tr');

    tr.innerHTML = `

        <td style="padding: 8px;"><input type="number" class="slab-km form-input" value="${escapeHtml(km)}" placeholder="KM" style="padding: 6px 10px;"></td>

        <td style="padding: 8px;"><input type="number" class="slab-fee form-input" value="${escapeHtml(fee)}" placeholder="₹" style="padding: 6px 10px;"></td>

        <td style="padding: 8px;"><button data-action="removeGrandparent" class="btn-secondary btn-small" style="padding: 5px 8px;">🗑️</button></td>

    `;

    tbody.appendChild(tr);

};



window.loadStoreSettings = async () => {

    try {

        const delSnap = await Outlet.ref("settings/Delivery").once("value");

        let delData = delSnap.val() || {

            coords: { lat: 25.887444, lng: 85.026889 },

            slabs: [{ km: 2, fee: 20 }, { km: 5, fee: 40 }, { km: 8, fee: 60 }]

        };



        const storeSnap = await Outlet.ref("settings/Store").once("value");

        let storeData = storeSnap.val() || {

            entityName: "", storeName: "", address: "", gstin: "", fssai: "", tagline: "", poweredBy: "Powered by Roshani ERP",

            developerPhone: "",

            reportPhone: "",

            shopOpenTime: "10:00",

            shopCloseTime: "23:00",

            wifiName: "", wifiPass: "", instagram: "", facebook: "", reviewUrl: "",

            feedbackReason1: "Taste & Quality", feedbackReason2: "Delivery Speed", feedbackReason3: "Value for Money",

            config: { showAddress: true, showGSTIN: false, showFSSAI: false, showTagline: true, showPoweredBy: true, showQR: false, showWifiInfo: false, showSocial: false }

        };



        document.getElementById('settingLat').value = delData.coords.lat;

        document.getElementById('settingLng').value = delData.coords.lng;

        document.getElementById('displayCoords').innerText = `${delData.coords.lat}, ${delData.coords.lng}`;

        if (delData.notifyPhone) document.getElementById('settingAdminPhone').value = delData.notifyPhone;



        const slabContainer = document.getElementById('feeSlabsTable');

        if (slabContainer) {

            slabContainer.innerHTML = '';

            if (delData.slabs) delData.slabs.forEach(slab => window.addFeeSlab(slab.km, slab.fee));

        }



        document.getElementById('settingEntityName').value = storeData.entityName || "";

        document.getElementById('settingStoreName').value = storeData.storeName || "";

        document.getElementById('settingStoreAddress').value = storeData.address || "";

        document.getElementById('settingGSTIN').value = storeData.gstin || "";

        document.getElementById('settingFSSAI').value = storeData.fssai || "";

        document.getElementById('settingTagline').value = storeData.tagline || "";

        document.getElementById('settingPoweredBy').value = storeData.poweredBy || "";

        document.getElementById('settingDevPhone').value = storeData.developerPhone || "";

        document.getElementById('settingReportPhone').value = storeData.reportPhone || "";

        document.getElementById('settingOpenTime').value = storeData.shopOpenTime || "10:00";

        document.getElementById('settingCloseTime').value = storeData.shopCloseTime || "23:00";



        // Load Shop Status override (FORCE_OPEN / FORCE_CLOSED / AUTO)

        const shopStatusEl = document.getElementById('settingShopStatus');

        if (shopStatusEl) shopStatusEl.value = storeData.shopStatus || 'AUTO';



        // Update the live outlet status indicator

        window.updateOutletStatusIndicator && window.updateOutletStatusIndicator(storeData.shopStatus || 'AUTO');

        document.getElementById('settingWifiName').value = storeData.wifiName || "";

        document.getElementById('settingWifiPass').value = storeData.wifiPass || "";

        document.getElementById('settingInstagram').value = storeData.instagram || "";

        document.getElementById('settingFacebook').value = storeData.facebook || "";

        document.getElementById('settingReviewUrl').value = storeData.reviewUrl || "";

        document.getElementById('settingFeedbackReason3').value = storeData.feedbackReason3 || "Value for Money";

        document.getElementById('settingDeliveryBackupCode').value = storeData.deliveryBackupCode || "";



        const config = storeData.config || {};

        document.getElementById('checkShowAddress').checked = config.showAddress !== false;

        document.getElementById('checkShowGSTIN').checked = !!config.showGSTIN;

        document.getElementById('checkShowFSSAI').checked = !!config.showFSSAI;

        document.getElementById('checkShowTagline').checked = config.showTagline !== false;

        document.getElementById('checkShowPoweredBy').checked = config.showPoweredBy !== false;

        document.getElementById('checkShowQR').checked = !!config.showQR;

        document.getElementById('checkShowWifiInfo').checked = !!config.showWifiInfo;

        document.getElementById('checkShowSocial').checked = !!config.showSocial;

        document.getElementById('checkShowFeedbackQR').checked = config.showFeedbackQR !== false;



        if (storeData.qrUrl) {

            document.getElementById('qrPreview').src = storeData.qrUrl;

            document.getElementById('settingQRUrl').value = storeData.qrUrl;

        }



        const botSnap = await Outlet.ref("settings/Bot").once("value");

        const botData = botSnap.val() || {};



        const botMaps = {

            'botImgConfirmed': botData.imgConfirmed,

            'botImgPreparing': botData.imgPreparing,

            'botImgCooked': botData.imgCooked,

            'botImgOut': botData.imgOut,

            'botImgDelivered': botData.imgDelivered,

            'botImgFeedback': botData.imgFeedback

        };



        for (const [id, url] of Object.entries(botMaps)) {

            if (url) {

                const preview = document.getElementById(id + 'Preview');

                if (preview) preview.src = url;

            }

        }



        document.getElementById('botSocialInsta').value = botData.socialInsta || "";

        document.getElementById('botSocialFb').value = botData.socialFb || "";

        document.getElementById('botSocialReview').value = botData.socialReview || "";

        document.getElementById('botSocialWebsite').value = botData.socialWebsite || "";



    } catch (e) {

        console.error("Load Store Settings Error:", e);

    }

};



window.saveStoreSettings = async () => {

    const btn = document.querySelector("#tab-settings .btn-primary");

    const originalText = btn.innerText;

    btn.disabled = true;

    btn.innerText = "Saving...";



    try {

        const qrFile = document.getElementById('settingQRFile').files[0];

        let qrUrl = document.getElementById('settingQRUrl').value;



        if (qrFile) {

            qrUrl = await uploadImage(qrFile, `settings/payment_qr_${Date.now()}`);

        }



        const latRaw = document.getElementById('settingLat').value.trim();

        const lngRaw = document.getElementById('settingLng').value.trim();

        const lat = (latRaw === "" || isNaN(parseFloat(latRaw))) ? null : parseFloat(latRaw);

        const lng = (lngRaw === "" || isNaN(parseFloat(lngRaw))) ? null : parseFloat(lngRaw);

        const notifyPhone = document.getElementById('settingAdminPhone').value.trim();



        const slabRows = document.querySelectorAll('#feeSlabsTable tr');

        const slabs = Array.from(slabRows).map(row => ({

            km: parseFloat(row.querySelector('.slab-km').value),

            fee: parseFloat(row.querySelector('.slab-fee').value)

        })).filter(s => !isNaN(s.km) && !isNaN(s.fee));

        slabs.sort((a, b) => a.km - b.km);



        const storeData = {

            entityName: document.getElementById('settingEntityName').value.trim(),

            storeName: document.getElementById('settingStoreName').value.trim(),

            address: document.getElementById('settingStoreAddress').value.trim(),

            gstin: document.getElementById('settingGSTIN').value.trim(),

            fssai: document.getElementById('settingFSSAI').value.trim(),

            tagline: document.getElementById('settingTagline').value.trim(),

            poweredBy: document.getElementById('settingPoweredBy').value.trim(),

            developerPhone: document.getElementById('settingDevPhone').value.trim(),

            reportPhone: document.getElementById('settingReportPhone').value.trim(),

            shopOpenTime: document.getElementById('settingOpenTime').value,

            shopCloseTime: document.getElementById('settingCloseTime').value,

            shopStatus: document.getElementById('settingShopStatus')?.value || 'AUTO',

            wifiName: document.getElementById('settingWifiName').value.trim(),

            wifiPass: document.getElementById('settingWifiPass').value.trim(),

            instagram: document.getElementById('settingInstagram').value.trim(),

            facebook: document.getElementById('settingFacebook').value.trim(),

            reviewUrl: document.getElementById('settingReviewUrl').value.trim(),

            feedbackReason1: document.getElementById('settingFeedbackReason1').value.trim(),

            feedbackReason2: document.getElementById('settingFeedbackReason2').value.trim(),

            feedbackReason3: document.getElementById('settingFeedbackReason3').value.trim(),

            deliveryBackupCode: document.getElementById('settingDeliveryBackupCode').value.trim(),

            qrUrl: qrUrl,

            config: {

                showAddress: document.getElementById('checkShowAddress').checked,

                showGSTIN: document.getElementById('checkShowGSTIN').checked,

                showFSSAI: document.getElementById('checkShowFSSAI').checked,

                showTagline: document.getElementById('checkShowTagline').checked,

                showPoweredBy: document.getElementById('checkShowPoweredBy').checked,

                showQR: document.getElementById('checkShowQR').checked,

                showWifiInfo: document.getElementById('checkShowWifiInfo').checked,

                showSocial: document.getElementById('checkShowSocial').checked,

                showFeedbackQR: document.getElementById('checkShowFeedbackQR').checked

            }

        };



        // 4. Handle Bot Image Uploads

        const botFiles = [

            { id: 'botImgConfirmed', key: 'imgConfirmed' },

            { id: 'botImgPreparing', key: 'imgPreparing' },

            { id: 'botImgCooked', key: 'imgCooked' },

            { id: 'botImgOut', key: 'imgOut' },

            { id: 'botImgDelivered', key: 'imgDelivered' },

            { id: 'botImgFeedback', key: 'imgFeedback' }

        ];



        const botDataUpdates = {

            socialInsta: document.getElementById('botSocialInsta').value.trim(),

            socialFb: document.getElementById('botSocialFb').value.trim(),

            socialReview: document.getElementById('botSocialReview').value.trim(),

            socialWebsite: document.getElementById('botSocialWebsite').value.trim()

        };



        for (const item of botFiles) {

            const file = document.getElementById(item.id + 'File').files[0];

            if (file) {

                const url = await uploadImage(file, `bot/status_${item.key}_${Date.now()}`);

                botDataUpdates[item.key] = url;

            }

        }



        // 5. Update Firebase (outlet-specific paths)

        await Promise.all([

            Outlet.ref("settings/Delivery").update({ coords: { lat, lng }, notifyPhone, slabs }),

            Outlet.ref("settings/Store").update(storeData),

            Outlet.ref("settings/Bot").update(botDataUpdates)

        ]);



        document.getElementById('displayCoords').innerText = (lat !== null && lng !== null) ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : "Not Set";

        if (qrUrl) document.getElementById('settingQRUrl').value = qrUrl;



        // Success Alert

        window.showToast("Settings saved successfully!", "success");



    } catch (e) {

        window.showToast("Failed to save: " + e.message, "error");

    } finally {

        btn.disabled = false;

        btn.innerText = originalText;

    }

};



function loadFeedbacks() {

    const tableBody = document.getElementById("feedbackTableBody");

    if (!tableBody) return;



    Outlet.ref("feedbacks").off();

    Outlet.ref("feedbacks").on("value", snap => {

        tableBody.innerHTML = "";

        const feedbacks = [];

        snap.forEach(child => {

            feedbacks.push({ id: child.key, ...child.val() });

        });



        // Sort by date (desc)

        feedbacks.sort((a, b) => {

            const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;

            const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;

            return dateB - dateA;

        });



        if (feedbacks.length === 0) {

            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-muted);">No feedback received yet.</td></tr>`;

            return;

        }



        const feedbackHTML = feedbacks.map(f => {

            const stars = "⭐".repeat(f.rating || 0);

            const dateStr = f.timestamp ? new Date(f.timestamp).toLocaleString() : "N/A";



            return `

                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03)">

                    <td data-label="Date" style="padding:15px; font-size:12px;">${escapeHtml(dateStr)}</td>

                    <td data-label="Order ID" style="padding:15px; font-family:monospace; font-weight:700;">#${escapeHtml(f.orderId || 'N/A')}</td>

                    <td data-label="Customer" style="padding:15px">

                        <div style="font-weight:700;">${escapeHtml(f.customerName || 'Guest')}</div>

                        <small style="color:var(--text-muted);">${escapeHtml(f.phone || '')}</small>

                    </td>

                    <td data-label="Rating" style="padding:15px; font-size:14px;">${stars}</td>

                    <td data-label="Feedback" style="padding:15px">

                        <div style="font-weight:600; color:var(--text-main);">${escapeHtml(f.reason || f.feedback || '')}</div>

                        ${f.comment ? `<div style="font-size:12px; color:var(--text-muted); margin-top:4px; font-style:italic;">"${escapeHtml(f.comment)}"</div>` : ''}

                    </td>

                </tr>

            `;

        }).join('');

        tableBody.innerHTML = feedbackHTML;

    });

}



/**

 * =============================================

 * 9. LIVE RIDER TRACKER (ADMIN)

 * =============================================

 */

let adminTrackerMap = null;

let riderMarkersMap = new Map(); // Store markers by rider ID

let riderLocationCb = null; // Track callback for cleanup



window.initLiveRiderTracker = () => {

    const mapDiv = document.getElementById('adminLiveMap');

    if (!mapDiv) return;



    // Clean up existing map if it exists to prevent memory leaks

    if (adminTrackerMap) {

        adminTrackerMap.remove();

        adminTrackerMap = null;

    }



    // Initialize Map at a default center (e.g. India)

    adminTrackerMap = L.map('adminLiveMap').setView([20.5937, 78.9629], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {

        attribution: '&copy; OpenStreetMap'

    }).addTo(adminTrackerMap);



    startRiderLocationListener();

};



window.cleanupLiveRiderTracker = () => {

    console.log("[Performance] Cleaning up Live Rider Tracker...");

    if (riderLocationCb) {

        Outlet.ref('riders').off('value', riderLocationCb);

        riderLocationCb = null;

    }

    if (adminTrackerMap) {

        try {

            adminTrackerMap.remove();

        } catch (e) {

            console.warn("Map removal error:", e);

        }

        adminTrackerMap = null;

    }

    riderMarkersMap.clear();

};



function startRiderLocationListener() {

    if (riderLocationCb) {

        Outlet.ref('riders').off('value', riderLocationCb);

    }



    riderLocationCb = snap => {

        let onlineCount = 0;

        let bounds = [];



        snap.forEach(child => {

            const r = child.val();

            const id = child.key;



            if (r.status === "Online" && r.location) {

                onlineCount++;

                const pos = [r.location.lat, r.location.lng];

                bounds.push(pos);



                if (riderMarkersMap.has(id)) {

                    // Update existing marker

                    const marker = riderMarkersMap.get(id);

                    marker.setLatLng(pos);

                    marker.getPopup().setContent(`

                        <div style="font-family: 'Outfit', sans-serif;">

                            <strong style="color:var(--primary)">${escapeHtml(r.name)}</strong><br>

                            <small>${escapeHtml(r.phone)}</small><br>

                            <div style="margin-top:5px; font-size:10px; font-weight:800; color:var(--success)">MOVED: ${new Date(r.location.ts).toLocaleTimeString()}</div>

                        </div>

                    `);

                } else {

                    // Create new marker

                    const marker = L.marker(pos, {

                        icon: L.icon({

                            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',

                            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',

                            iconSize: [25, 41],

                            iconAnchor: [12, 41],

                            popupAnchor: [1, -34],

                            shadowSize: [41, 41]

                        })

                    }).addTo(adminTrackerMap).bindPopup(`

                        <div style="font-family: 'Outfit', sans-serif;">

                            <strong style="color:var(--primary)">${escapeHtml(r.name)}</strong><br>

                            <small>${escapeHtml(r.phone)}</small>

                        </div>

                    `);

                    riderMarkersMap.set(id, marker);

                }

            } else {

                // Remove marker if rider goes offline

                if (riderMarkersMap.has(id)) {

                    adminTrackerMap.removeLayer(riderMarkersMap.get(id));

                    riderMarkersMap.delete(id);

                }

            }

        });



        // Update Stats UI

        const statsEl = document.getElementById('trackerStats');

        if (statsEl) statsEl.innerText = `${onlineCount} Riders Online`;



        // Fit map to show all riders if it's the first load or count changed

        if (bounds.length > 0 && adminTrackerMap) {

            const currentBounds = L.latLngBounds(bounds);

            adminTrackerMap.fitBounds(currentBounds, { padding: [50, 50], maxZoom: 15 });

        }

    };



    Outlet.ref('riders').on('value', riderLocationCb);

}



// =============================

// POS SELECTION MODAL & LOGIC

// =============================

let currentPOSModalDish = null;

let currentPOSModalSize = null;

let currentPOSModalAddons = {}; // name -> price

let currentPOSModalQty = 1;



window.addNewCategoryAddonField = (name = "", price = "") => {

    const container = document.getElementById('categoryAddonsList');

    if (!container) return;

    const div = document.createElement('div');

    div.className = "addon-row-small";

    div.innerHTML = `

        <input placeholder="Addon" value="${escapeHtml(name)}" class="form-input flex-2">

        <input type="number" placeholder="\u20B9" value="${escapeHtml(price)}" class="form-input flex-1">

        <button data-action="removeParent" class="btn-text-danger" style="font-size:18px;">&times;</button>

    `;

    container.appendChild(div);

};



window.openPOSSelectionModal = async (dishId) => {

    haptic(10);

    const snap = await Outlet.ref(`dishes/${dishId}`).once('value');

    const dish = snap.val();

    if (!dish) return;



    currentPOSModalDish = { id: dishId, ...dish };

    currentPOSModalQty = 1;

    currentPOSModalAddons = {};



    document.getElementById('posModalDishName').innerText = dish.name;

    document.getElementById('posModalDishCategory').innerText = dish.category;

    document.getElementById('posModalQty').innerText = "1";



    // 1. Render Sizes as Chips/Grid for better clarity

    const sizeGrid = document.getElementById('posSizeGrid');

    sizeGrid.innerHTML = "";



    // Logic for Request 5: Simple dishes show - Default -

    let sizes = dish.sizes || {};

    if (Object.keys(sizes).length === 0 || (Object.keys(sizes).length === 1 && !dish.sizes)) {

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

        if (idx === 0) currentPOSModalSize = { name, price };

    });



    // 2. Render Category-Bound Add-ons

    const addonsList = document.getElementById('posAddonsList');

    addonsList.innerHTML = "";



    // Find category to get its addons

    const cat = categories.find(c => c.name === dish.category);

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

    document.getElementById('posSelectionModal').classList.add('active');

};



window.hidePOSSelectionModal = () => {

    document.getElementById('posSelectionModal').classList.remove('active');

};



window.selectPOSSize = function (name, price, el) {

    document.querySelectorAll('.size-card').forEach(c => c.classList.remove('active'));

    el.classList.add('active');

    currentPOSModalSize = { name, price };

    updatePOSModalTotal();

};



window.togglePOSAddon = (name, price, checkbox) => {

    if (checkbox.checked) {

        currentPOSModalAddons[name] = price;

    } else {

        delete currentPOSModalAddons[name];

    }

    updatePOSModalTotal();

};



window.adjustPOSModalQty = (delta) => {

    currentPOSModalQty = Math.max(1, currentPOSModalQty + delta);

    document.getElementById('posModalQty').innerText = currentPOSModalQty;

    updatePOSModalTotal();

};



function updatePOSModalTotal() {

    let base = currentPOSModalSize ? currentPOSModalSize.price : 0;

    let addonsTotal = Object.values(currentPOSModalAddons).reduce((a, b) => a + b, 0);

    let total = (Number(base) + addonsTotal) * currentPOSModalQty;

    document.getElementById('posModalTotal').innerText = `\u20B9${total}`;

}



window.addToWalkinCartFromModal = () => {

    if (!currentPOSModalDish || !currentPOSModalSize) return;



    const baseId = currentPOSModalDish.id;

    const sizeName = currentPOSModalSize.name;

    const addonNames = Object.keys(currentPOSModalAddons);



    // Create unique key for cart item (dish + size + addons)

    const cartKey = `${baseId}::${sizeName}::${addonNames.sort().join('|')}`;



    const pricePerItem = Number(currentPOSModalSize.price) + Object.values(currentPOSModalAddons).reduce((a, b) => a + b, 0);



    if (walkinCart[cartKey]) {

        walkinCart[cartKey].qty += currentPOSModalQty;

    } else {

        walkinCart[cartKey] = {

            id: baseId,

            name: currentPOSModalDish.name,

            category: currentPOSModalDish.category, // Needed for cart-side addons

            size: sizeName,

            price: pricePerItem,

            qty: currentPOSModalQty,

            addons: addonNames.map(name => ({ name, price: currentPOSModalAddons[name] }))

        };

    }



    hidePOSSelectionModal();

    renderWalkinCart();

    haptic(20);

};



window.openCartAddonPicker = async (cartKey) => {

    const item = walkinCart[cartKey];

    if (!item) return;



    // We reuse the POS selection modal but focus it on addons

    // To do this simply, we'll just set up the modal with the current item's data

    const dishSnap = await Outlet.ref(`dishes/${item.id}`).once('value');

    const dish = dishSnap.val();

    if (!dish) return;



    currentPOSModalDish = { id: item.id, ...dish };

    currentPOSModalQty = item.qty;

    currentPOSModalSize = { name: item.size, price: item.price - (item.addons ? item.addons.reduce((a, b) => a + b.price, 0) : 0) };

    currentPOSModalAddons = {};

    if (item.addons) {

        item.addons.forEach(a => currentPOSModalAddons[a.name] = a.price);

    }



    // Refresh UI

    document.getElementById('posModalDishName').innerText = dish.name + " (Update Addons)";

    document.getElementById('posModalDishCategory').innerText = dish.category;

    document.getElementById('posModalQty').innerText = currentPOSModalQty;



    // Hide sizes if we are just updating addons from cart (Keep UI simple)

    document.getElementById('posSizeSection').classList.add('hidden');



    // Render Category Addons

    const addonsList = document.getElementById('posAddonsList');

    addonsList.innerHTML = "";

    const cat = categories.find(c => c.name === dish.category);

    if (cat && cat.addons) {

        document.getElementById('posAddonsSection').classList.remove('hidden');

        Object.entries(cat.addons).forEach(([name, price]) => {

            const isChecked = currentPOSModalAddons[name] !== undefined;

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



    // Change the "Add to Cart" button to "Update Item"

    const submitBtn = document.getElementById('posModalSubmitBtn');

    const originalText = submitBtn.innerText;

    submitBtn.innerText = "\uD83D\uDCBE Update Selection";



    // Temporarily replace the click handler

    const originalHandler = window.addToWalkinCartFromModal;

    window.addToWalkinCartFromModal = () => {

        // Remove old item, add new updated one

        delete walkinCart[cartKey];



        // Use the standard logic to add back

        const newSizeName = currentPOSModalSize.name;

        const newAddonNames = Object.keys(currentPOSModalAddons);

        const newCartKey = `${item.id}::${newSizeName}::${newAddonNames.sort().join('|')}`;

        const pricePerItem = Number(currentPOSModalSize.price) + Object.values(currentPOSModalAddons).reduce((a, b) => a + b, 0);



        walkinCart[newCartKey] = {

            id: item.id,

            name: currentPOSModalDish.name,

            category: currentPOSModalDish.category,

            size: newSizeName,

            price: pricePerItem,

            qty: currentPOSModalQty,

            addons: newAddonNames.map(name => ({ name, price: currentPOSModalAddons[name] }))

        };



        hidePOSSelectionModal();

        renderWalkinCart();



        // Restore original things

        window.addToWalkinCartFromModal = originalHandler;

        submitBtn.innerText = originalText;

        document.getElementById('posSizeSection').classList.remove('hidden');

    };



    updatePOSModalTotal();

    document.getElementById('posSelectionModal').classList.add('active');

};

window.migrateAddonsToCategories = async () => {

    try {

        console.log("Starting add-on migration...");

        const dishesSnap = await Outlet.ref(`dishes`).once('value');

        const categoriesSnap = await Outlet.ref('categories').once('value');



        const dishes = dishesSnap.val() || {};

        const categoriesData = categoriesSnap.val() || {};



        const categoryAddons = {}; // categoryName -> { addonName: price }



        // 1. Collect from all dishes

        Object.keys(dishes).forEach(outletId => {

            const outletDishes = dishes[outletId];

            Object.values(outletDishes).forEach(dish => {

                if (dish.category && dish.addons) {

                    if (!categoryAddons[dish.category]) categoryAddons[dish.category] = {};

                    Object.entries(dish.addons).forEach(([name, price]) => {

                        categoryAddons[dish.category][name] = price;

                    });

                }

            });

        });



        // 2. Update Categories

        const updates = {};

        Object.entries(categoriesData).forEach(([catId, cat]) => {

            if (categoryAddons[cat.name]) {

                updates[`categories/${catId}/addons`] = categoryAddons[cat.name];

            }

        });



        if (Object.keys(updates).length > 0) {

            await db.ref().update(updates);

            window.showToast("Success: Add-ons migrated to categories!", "success");

        } else {

            window.showToast("No add-ons found to migrate.", "info");

        }

    } catch (e) {

        window.showToast("Migration failed: " + e.message, "error");

    }

};



// =============================

// CATEGORY RENDERING IN POS

// =============================

function renderWalkinCategoryTabs() {

    const container = document.getElementById('walkinCategoryTabs');

    if (!container) return;



    container.innerHTML = `

        <div class="category-tab active" data-action="filterWalkinByCategory" data-val="All">All</div>

    `;



    categories.forEach(cat => {

        const tab = document.createElement('div');

        tab.className = "category-tab";

        tab.innerText = escapeHtml(cat.name);

        tab.dataset.action = "filterWalkinByCategory";

        tab.dataset.val = cat.name;

        container.appendChild(tab);

    });

}



// =============================

// IMAGE STORAGE MIGRATION

// =============================

window.runImageMigration = async function () {

    if (!(await window.showConfirm("This will convert images to Base64 text. This process might take a minute. Proceed?", "Image Migration"))) return;



    try {

        console.log("\uD83D\uDE80 Starting Image Migration...");

        const updates = {};



        // Helper to download image and convert to Base64

        async function convertUrlToDataUri(url) {

            if (!url || !url.includes("firebasestorage.googleapis.com")) return url;

            try {

                const response = await fetch(url);

                const blob = await response.blob();

                return await uploadImage(blob, "temp");

            } catch (err) {

                console.error("Failed to convert image:", url, err);

                return url; // Keep original on failure

            }

        }



        // 1. Dishes

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



        // 2. Categories

        const catsSnap = await db.ref('categories').once('value');

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



        // 3. Riders

        const ridersSnap = await db.ref('riders').once('value');

        const ridersData = ridersSnap.val();

        if (ridersData) {

            for (const id in ridersData) {

                if (ridersData[id].profilePhoto && ridersData[id].profilePhoto.includes("firebasestorage")) {

                    console.log("Migrating Rider Profile:", ridersData[id].name);

                    const b64 = await convertUrlToDataUri(ridersData[id].profilePhoto);

                    updates[`riders/${id}/profilePhoto`] = b64;

                }

                if (ridersData[id].aadharPhoto && ridersData[id].aadharPhoto.includes("firebasestorage")) {

                    console.log("Migrating Rider Aadhar:", ridersData[id].name);

                    const b64 = await convertUrlToDataUri(ridersData[id].aadharPhoto);

                    updates[`riders/${id}/aadharPhoto`] = b64;

                }

            }

        }



        // 4. Bot Settings

        const botSnap = await db.ref('settings/Bot').once('value');

        const botData = botSnap.val();

        if (botData) {

            if (botData.imgDelivered && botData.imgDelivered.includes("firebasestorage")) {

                updates['settings/Bot/imgDelivered'] = await convertUrlToDataUri(botData.imgDelivered);

            }

            if (botData.imgFeedback && botData.imgFeedback.includes("firebasestorage")) {

                updates['settings/Bot/imgFeedback'] = await convertUrlToDataUri(botData.imgFeedback);

            }

        }



        if (Object.keys(updates).length > 0) {

            await db.ref().update(updates);

            window.showToast("Success: All images migrated!", "success");

            location.reload();

        } else {

            window.showToast("No legacy images found.", "info");

        }

    } catch (err) {

        console.error("Migration Failed:", err);

        window.showToast("Critical Error: Migration failed.", "error");

    }

}









window.exportLostSalesData = async () => {

    const snap = await Outlet.ref("lostSales").once("value");

    if (!snap.exists()) {

        window.showToast("No data to export.", "warning");

        return;

    }



    let csv = "Time,Customer,Phone,Abandoned At,Items,Potential Revenue\n";

    snap.forEach(child => {

        const d = child.val();

        const items = d.items ? d.items.map(i => `${i.name} x${i.quantity}`).join(' | ') : '';

        const row = [

            `"${new Date(d.cancelledAt).toLocaleString()}"`,

            `"${d.customerName || 'Guest'}"`,

            `"${d.phone || ''}"`,

            `"${d.sourceStep || 'Unknown'}"`,

            `"${items}"`,

            `"${d.total || 0}"`

        ];

        csv += row.join(",") + "\n";

    });



    const blob = new Blob([csv], { type: 'text/csv' });

    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = `Lost_Sales_${window.currentOutlet}_${new Date().toISOString().split('T')[0]}.csv`;

    document.body.appendChild(a);

    a.click();

    window.URL.revokeObjectURL(url);

    document.body.removeChild(a);



};



// --- MOBILE ACCESSIBILITY HELPER (Phase 2) ---

function enhanceTablesForMobile(root = document) {

    if (window.innerWidth > 600) return;



    const tables = root.querySelectorAll('table');

    tables.forEach(table => {

        const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
        if (headers.length === 0) return;
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            cells.forEach((cell, index) => {
                if (headers[index] && !cell.getAttribute('data-label')) {
                    cell.setAttribute('data-label', headers[index]);
                }
            });
        });
    });
}
// Phase 3: Use MutationObserver instead of polling for performance
if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
        if (window.innerWidth <= 600) {
            // Debounce or throttle could be added if needed, but this is usually fine
            enhanceTablesForMobile();
        }
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
} else {
    // Fallback for older browsers
    setInterval(enhanceTablesForMobile, 3000);
}
// Initial call

enhanceTablesForMobile();


// POS / Walk-in Functions Exposed Globally
window.loadWalkinMenu = loadWalkinMenu;
window.filterWalkinByCategory = filterWalkinByCategory;
window.applyWalkinFilters = applyWalkinFilters;
window.checkWalkinCustomer = checkWalkinCustomer;
window.renderWalkinDishGrid = renderWalkinDishGrid;
window.addToWalkinCart = addToWalkinCart;
window.removeFromWalkinCart = removeFromWalkinCart;
window.renderWalkinCart = renderWalkinCart;
window.renderWalkinCategoryTabs = renderWalkinCategoryTabs;
window.updateMobileCartSummaryState = updateMobileCartSummaryState;
window.loadMenu = loadMenu;
window.loadCategories = loadCategories;
window.loadRiders = loadRiders;
window.loadCustomers = loadCustomers;
window.loadFeedbacks = loadFeedbacks;
window.loadReports = loadReports;
window.loadLostSales = loadLostSales;
window.initRealtimeListeners = initRealtimeListeners;


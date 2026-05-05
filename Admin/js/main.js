import { previewImage, showToast, logAudit } from './utils.js';
import { state } from './state.js';
import { auth, db, ServerValue } from './firebase.js';
import { switchOutlet, openOutletInNewTab } from './branding.js';
import { switchTab, toggleSidebar, themeManager, toggleMobileCart } from './ui.js';
import { initGestures } from './gestures.js';
import { initAuth, doLogin as adminLogin, userLogout } from './auth.js';
import { installPWA, completeSiteRefresh } from './pwa.js';
import { 
    updateStatus, assignRider, openOrderDrawer, markAsPaid, 
    saveDeliveredOrder, closeOrderDrawer, filterOrders, loadMoreOrders 
} from './features/orders.js';
import { 
    toggleNotificationSheet, clearAllNotifications, 
    requestNotificationPermission 
} from './features/notifications.js';
import { 
    openCartAddonPicker, walkinQtyChange, removeFromWalkinCart, filterWalkinByCategory, 
    selectPOSSize, clearWalkinCart, submitWalkinSale, setDiscount, setDiscountPct, 
    selectWalkinPayment, togglePOSAddon, openPOSSelectionModal, addToWalkinCartFromModal,
    adjustPOSModalQty, hidePOSSelectionModal, applyWalkinFilters
} from './features/pos.js';
import { printReceiptById, reprintLastPosReceipt } from './features/printing.js';
import { 
    editRider, resetRiderPassword, deleteRider, 
    showRiderModal, saveRiderAccount, renderRiders 
} from './features/riders.js';
import { 
    editDish, deleteDish, editCategory, deleteCategory, 
    showDishModal, saveDish, addCategory, addDishAddonField, addSizeField, addCategoryAddonField,
    migrateAddonsToCategories, toggleDishAvailable, runImageMigration, filterMenu, filterCategories
} from './features/catalog.js';
import { 
    clearLostSales, generateCustomReport as generateReport, 
    downloadExcel, downloadPDF, filterCustomers 
} from './features/customers.js';
import { saveStoreSettings, quickUpdateOutletStatus, addFeeSlab } from './features/settings.js';
import { initRiderAnalytics } from './features/rider-analytics.js';

// Side-effect imports
import './firebase.js';
import './branding.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("[Main] DOM Content Loaded. Initializing...");
    initGestures();

    // Set default date range: Yesterday and Today for Orders History
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    
    const formatDate = (d) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };
    
    const fromInput = document.getElementById('orderFrom');
    const toInput = document.getElementById('orderTo');
    if (fromInput && toInput && !fromInput.value && !toInput.value) {
        fromInput.value = formatDate(yesterday);
        toInput.value = formatDate(today);
    }

    initAuth();
    initRiderAnalytics();

    // Final check for icons on static content
    // Scoped initialization for performance across both states
    if (window.lucide) {
        const overlay = document.getElementById('authOverlay');
        const layout = document.querySelector('.layout');
        
        if (overlay) window.lucide.createIcons({ root: overlay });
        if (layout) window.lucide.createIcons({ root: layout });
    }

    // 1. Static Event Binding
    const setupStaticListeners = () => {
        // Global Image Error Handler (CSP Compliant)
        document.addEventListener('error', (e) => {
            if (e.target.tagName === 'IMG') {
                e.target.src = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'150\' height=\'150\' viewBox=\'0 0 150 150\'%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'%23eee\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-family=\'sans-serif\' font-size=\'12\' fill=\'%23999\'%3ENo Image%3C/text%3E%3C/svg%3E';
            }
        }, true);

        const bindClickTo = (btnId, targetId) => {
            const btn = document.getElementById(btnId);
            if (btn) btn.addEventListener('click', () => {
                const target = document.getElementById(targetId);
                if (target) target.click();
            });
        };

        // Modal Controls
        document.querySelectorAll('.close-btn, .cancel-dish-btn, .cancel-cat-btn, .btn-hide-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) {
                    modal.classList.remove('active', 'flex');
                    modal.classList.add('hidden');
                }
            });
        });

        // Drawer Overlays
        const orderOverlay = document.getElementById('orderDrawerOverlay');
        if (orderOverlay) {
            orderOverlay.addEventListener('click', () => {
                import('./features/orders.js').then(o => o.closeOrderDrawer());
            });
        }

        // Menu & Categories
        document.querySelectorAll('.btn-show-dish-modal').forEach(btn => {
            btn.addEventListener('click', () => showDishModal());
        });
        document.getElementById('btnMigrateDishAddons')?.addEventListener('click', migrateAddonsToCategories);
        document.getElementById('btnAddCategory')?.addEventListener('click', addCategory);
        bindClickTo('btnChangeCatPhoto', 'catFile');

        document.getElementById('catFile')?.addEventListener('change', (e) => {
            previewImage(e.target, 'catPreview');
        });

        // Riders
        document.getElementById('btnShowRiderModal')?.addEventListener('click', showRiderModal);
        bindClickTo('btnUploadRiderPhoto', 'riderPhotoInput');
        document.getElementById('riderPhotoInput')?.addEventListener('change', (e) => {
            previewImage(e.target, 'riderProfilePreview');
        });

        document.getElementById('riderSearchInput')?.addEventListener('input', (e) => {
            renderRiders(e.target.value);
        });

        bindClickTo('btnUploadAadhar', 'aadharPhotoInput');
        document.getElementById('aadharPhotoInput')?.addEventListener('change', (e) => {
            previewImage(e.target, 'aadharPreview');
        });

        // Notifications & Logs
        document.getElementById('btnClearAllNotif')?.addEventListener('click', clearAllNotifications);
        document.getElementById('btnClearLostSales')?.addEventListener('click', clearLostSales);
        document.getElementById('btnEnableNotif')?.addEventListener('click', requestNotificationPermission);

        // Auth
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                console.log("[Auth] Login form submitted");
                const email = document.getElementById("adminEmail")?.value.trim();
                const pass = document.getElementById("adminPassword")?.value;
                if (email && pass) {
                    adminLogin(email, pass);
                } else {
                    showToast("Please enter email and password", "warning");
                }
            });
        }

        // Settings
        document.getElementById('btnSaveSettings')?.addEventListener('click', saveStoreSettings);
        document.getElementById('btnQuickToggleOutlet')?.addEventListener('click', quickUpdateOutletStatus);
        document.getElementById('btnAddFeeSlab')?.addEventListener('click', addFeeSlab);
        document.getElementById('btnMigrateAddons')?.addEventListener('click', migrateAddonsToCategories);
        document.getElementById('btnRunImageMigration')?.addEventListener('click', runImageMigration);

        // POS (Walk-in)
        document.getElementById('btnShowPOSSelection')?.addEventListener('click', () => openPOSSelectionModal());
        document.getElementById('btnPosPrintLast')?.addEventListener('click', reprintLastPosReceipt);

        document.getElementById('btnPosQtyDec')?.addEventListener('click', () => adjustPOSModalQty(-1));
        document.getElementById('btnPosQtyInc')?.addEventListener('click', () => adjustPOSModalQty(1));

        // Dish Modal
        bindClickTo('btnUpdateDishPhoto', 'dishFile');
        document.getElementById('dishFile')?.addEventListener('change', (e) => {
            previewImage(e.target, 'dishPreview');
        });
        document.getElementById('saveDishBtn')?.addEventListener('click', saveDish);



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

        // Helper: Bind button to window function
        const bindFn = (id, fn) => {
            const el = document.getElementById(id);
            if (el && window[fn]) el.addEventListener('click', window[fn]);
        };

        // Reports
        const btnGenerateReport = document.getElementById('btnGenerateReport');
        if (btnGenerateReport) btnGenerateReport.addEventListener('click', () => {
            if (window.generateReport) window.generateReport();
        });

        const btnWhatsappReport = document.getElementById('btnWhatsappReport');
        if (btnWhatsappReport) btnWhatsappReport.addEventListener('click', async () => {
            const confirmed = confirm("Send Daily Sales Report to WhatsApp now?");
            if (!confirmed) return;
            
            try {
                btnWhatsappReport.disabled = true;
                btnWhatsappReport.style.opacity = '0.7';
                
                showToast("Requesting WhatsApp Report...", "info");
                const cmdRef = db.ref("bot/commands").push();
                await cmdRef.set({
                    action: "SEND_DAILY_REPORT",
                    targetDate: new Date().toISOString().split('T')[0],
                    requestedBy: auth.currentUser?.email || 'admin',
                    timestamp: ServerValue.TIMESTAMP
                });
                showToast("Report request sent to Bot!", "success");
            } catch (err) {
                console.error("Bot trigger error:", err);
                showToast("Failed to trigger Bot: " + err.message, "error");
            } finally {
                btnWhatsappReport.disabled = false;
                btnWhatsappReport.style.opacity = '1';
            }
        });

        bindFn('btnDownloadExcel', 'downloadExcel');
        bindFn('btnDownloadPDF', 'downloadPDF');
    };

    // --- 2. Dynamic Event Delegation ---
    document.addEventListener('click', async (e) => {
        try {
            const el = e.target.closest('[data-action], [data-tab]');
            if (!el) return;

            const action = el.getAttribute('data-action');
            const tab = el.getAttribute('data-tab');
            
            console.log(`[Interaction] Click detected: Action=${action}, Tab=${tab}`, el);

            if (tab) {
                switchTab(tab);
                return;
            }

            if (!action) return;
            const id = el.getAttribute('data-id');
            const val = el.getAttribute('data-val');
            const tag = el.getAttribute('data-tag');
            const name = el.getAttribute('data-name');
            const price = el.getAttribute('data-price');

            switch (action) {
                case 'updateStatusFromDrawer': updateStatus(id, val); break;
                case 'closeOrderDrawer': closeOrderDrawer(); break;
                case 'chatOnWhatsapp': /* window.chatOnWhatsapp(id); */ break; 
                case 'printReceiptById': printReceiptById(id); break;
                case 'updateStatus': updateStatus(id, val); break;
                case 'assignRider': assignRider(id, val); break;
                case 'openOrderDrawer': openOrderDrawer(id); break;
                case 'markAsPaid': markAsPaid(id); break;
                case 'deleteCategory': deleteCategory(id); break;
                case 'removeParent': el.parentElement.remove(); break;
                case 'removeGrandparent': el.parentElement.parentElement.remove(); break;
                case 'editRider': editRider(id); break;
                case 'resetRiderPassword': resetRiderPassword(el.getAttribute('data-email')); break;
                case 'deleteRider': deleteRider(id); break;
                case 'saveSettings': saveStoreSettings(); break;
                case 'saveDeliveredOrder': saveDeliveredOrder(id, val); break;
                case 'openPOSSelectionModal': openPOSSelectionModal(id); break;
                case 'hidePOSSelectionModal': hidePOSSelectionModal(); break;
                case 'addToWalkinCartFromModal': addToWalkinCartFromModal(); break;
                case 'adjustPOSModalQty': adjustPOSModalQty(parseInt(val, 10)); break;
                case 'openCartAddonPicker': openCartAddonPicker(id); break;
                case 'walkinQtyChange': walkinQtyChange(id, parseInt(val, 10)); break;
                case 'walkinRemoveItem': removeFromWalkinCart(id); break;
                case 'filterWalkinByCategory': filterWalkinByCategory(val, el); break;
                case 'selectPOSSize': selectPOSSize(name, parseFloat(price), el); break;
                case 'togglePOSAddon': togglePOSAddon(name, parseFloat(price), el); break;
                case 'triggerClick': {
                    const target = document.getElementById(val);
                    if (target) target.click();
                    break;
                }
                case 'markDelivered': updateStatus(id, 'Delivered'); break;
                case 'editDish': editDish(id); break;
                case 'deleteDish': deleteDish(id); break;
                case 'editCategory': editCategory(id); break;
                case 'showRiderModal':
                case 'showAddRiderModal': showRiderModal(); break;
                case 'closeModal': {
                    const modal = el.closest('.modal');
                    if (modal) {
                        modal.classList.add('hidden');
                        modal.classList.remove('active', 'flex');
                    }
                    break;
                }
                case 'completeSiteRefresh': completeSiteRefresh(); break;
                case 'toggleNotificationSheet': toggleNotificationSheet(); break;
                case 'toggleSidebar': toggleSidebar(); break;
                case 'toggleMobileCart': {
                    toggleMobileCart(true);
                    break;
                }
                case 'openOutletInNewTab': openOutletInNewTab(); break;
                case 'toggleTheme': themeManager.toggleTheme(); break;
                case 'userLogout': userLogout(); break;
                case 'installPWA': installPWA(); break;
                case 'removeRow': el.closest('tr').remove(); break;
                case 'addFeeSlab': addFeeSlab(); break;
                case 'migrateAddons': migrateAddonsToCategories(); break;
                case 'runImageMigration': runImageMigration(); break;
                case 'clearWalkinCart': clearWalkinCart(); break;
                case 'submitWalkinSale': submitWalkinSale(); break;
                case 'addCategory': addCategory(); break;
                case 'addSizeField': addSizeField(); break;
                case 'addDishAddonField': addDishAddonField(); break;
                case 'addCategoryAddonField': addCategoryAddonField(); break;
                case 'saveRiderAccount': saveRiderAccount(); break;
                case 'applyWalkinDiscount': {
                    const amt = el.getAttribute('data-amount');
                    const pct = el.getAttribute('data-pct');
                    if (amt) setDiscount(parseFloat(amt));
                    else if (pct) setDiscountPct(parseFloat(pct));
                    break;
                }
                case 'loadMoreOrders': loadMoreOrders(); break;
                case 'selectWalkinPayment': {
                    const method = el.getAttribute('data-method');
                    selectWalkinPayment(method, el);
                    break;
                }
            }
        } catch (err) {
            console.error("[Main] Click Event Error:", err);
            showToast("An error occurred: " + err.message, "error");
        }
    });

    document.addEventListener('change', (e) => {
        try {
            const el = e.target;
            const action = el.getAttribute('data-action');
            if (!action) return;
            const id = el.getAttribute('data-id');
            const val = el.value;

            switch (action) {
                case 'updateStatus': updateStatus(id, val); break;
                case 'assignRider': assignRider(id, val); break;
                case 'toggleDish': toggleDishAvailable(id, el.checked); break;
                case 'togglePOSAddon':
                    togglePOSAddon(el.getAttribute('data-name'), parseFloat(el.getAttribute('data-price')), el);
                    break;
                case 'previewImage':
                    previewImage(el, el.getAttribute('data-preview-id'));
                    break;
                case 'switchOutlet': switchOutlet(val); break;
            }
        } catch (err) {
            console.error("[Main] Change Event Error:", err);
        }
    });

    // Search inputs - simplified with static imports
    document.getElementById('walkinDishSearch')?.addEventListener('input', applyWalkinFilters);
    document.getElementById('orderSearch')?.addEventListener('input', (e) => filterOrders(e.target.value));
    document.getElementById('customerSearch')?.addEventListener('input', (e) => filterCustomers(e.target.value));
    document.getElementById('menuSearch')?.addEventListener('input', (e) => filterMenu(e.target.value));
    document.getElementById('menuSearchMobile')?.addEventListener('input', (e) => filterMenu(e.target.value));
    document.getElementById('categorySearch')?.addEventListener('input', (e) => filterCategories(e.target.value));
    
    // Order Filters
    const triggerOrderRender = () => {
        import('./features/orders.js').then(o => o.initRealtimeListeners());
    };
    document.getElementById('orderFrom')?.addEventListener('change', triggerOrderRender);
    document.getElementById('orderTo')?.addEventListener('change', triggerOrderRender);

    setupStaticListeners();

    if (window.lucide) {
        const layout = document.querySelector('.layout');
        window.lucide.createIcons({ root: layout || document.body });
    }

    // --- 3. REFRESH & SESSION SAFETY ---
    window.addEventListener('beforeunload', (e) => {
        // Only trigger if we are logged in and not in the middle of a nuclear refresh
        if (state.adminData && !window.location.search.includes('nuclear')) {
            e.preventDefault();
            e.returnValue = ''; // Standard way to show confirmation
        }
    });

    logAudit('SYSTEM_INIT', { 
        agent: 'Antigravity',
        version: '4.4.12',
        timestamp: new Date().toISOString()
    });
});

console.log("\uD83D\uDE80 Roshani Pizza ERP Modules Loaded");


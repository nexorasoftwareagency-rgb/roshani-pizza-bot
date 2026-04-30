import { previewImage, showToast } from './utils.js';
import { switchOutlet, openOutletInNewTab } from './branding.js';
import { switchTab, toggleSidebar } from './ui.js';
import { initAuth, doLogin as adminLogin, userLogout } from './auth.js';
import { installPWA } from './pwa.js';
import { 
    updateStatus, assignRider, openOrderDrawer, markAsPaid, 
    markDelivered, saveDeliveredOrder, updateStatusFromDrawer, closeOrderDrawer 
} from './features/orders.js';
import { 
    toggleNotificationSheet, clearAllNotifications, 
    clearNotifications, requestNotificationPermission 
} from './features/notifications.js';
import { 
    adjustCardQty, addToWalkinCartFromCard, showAddonView, hideAddonView, 
    openCartAddonPicker, walkinQtyChange, walkinRemoveItem, filterWalkinByCategory, 
    selectPOSSize, clearWalkinCart, submitWalkinSale, setDiscount, setDiscountPct, 
    selectWalkinPayment, togglePOSAddon, showPOSSelectionModal, addToWalkinCartFromModal, clearPos, 
    posCheckout, adjustPosQty 
} from './features/pos.js';
import { printReceiptById, reprintLastPosReceipt } from './features/printing.js';
import { 
    editRider, resetRiderPassword, deleteRider, 
    showRiderModal, saveRiderAccount, renderRiders 
} from './features/riders.js';
import { 
    editDish, deleteDish, editCategory, deleteCategory, 
    showDishModal, saveDish, addCategory, addNewCategoryAddonField, 
    migrateAddonsToCategories, toggleDishAvailable, runImageMigration 
} from './features/catalog.js';
import { 
    clearLostSales, generateCustomReport as generateReport, 
    downloadExcel, downloadPDF 
} from './features/customers.js';
import { saveStoreSettings, quickUpdateOutletStatus, addFeeSlab } from './features/settings.js';

// Side-effect imports
import './firebase.js';
import './state.js';
import './branding.js';
import './features/feedback.js';
import './features/tracker.js';

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
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
        document.querySelectorAll('.close-btn, .cancel-dish-btn, .cancel-cat-btn, .btn-secondary').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) {
                    modal.classList.remove('active', 'flex');
                    modal.classList.add('hidden');
                }
            });
        });

        // Menu & Categories
        document.querySelectorAll('.btn-show-dish-modal').forEach(btn => {
            btn.addEventListener('click', showDishModal);
        });
        document.getElementById('btnMigrateDishAddons')?.addEventListener('click', migrateAddonsToCategories);
        document.getElementById('btnAddCatAddonField')?.addEventListener('click', addNewCategoryAddonField);
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
        document.getElementById('btnClearNotificationsBottom')?.addEventListener('click', clearNotifications);
        document.getElementById('btnClearLostSales')?.addEventListener('click', clearLostSales);
        document.getElementById('btnEnableNotif')?.addEventListener('click', requestNotificationPermission);

        // Auth
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                adminLogin();
            });
        }

        // Settings
        document.getElementById('btnSaveSettings')?.addEventListener('click', saveStoreSettings);
        document.getElementById('btnQuickToggleOutlet')?.addEventListener('click', quickUpdateOutletStatus);
        document.getElementById('btnAddFeeSlab')?.addEventListener('click', addFeeSlab);
        document.getElementById('btnMigrateAddons')?.addEventListener('click', migrateAddonsToCategories);
        document.getElementById('btnRunImageMigration')?.addEventListener('click', runImageMigration);

        // POS (Walk-in)
        document.getElementById('btnShowPOSSelection')?.addEventListener('click', showPOSSelectionModal);
        document.getElementById('btnPosClear')?.addEventListener('click', clearPos);
        document.getElementById('btnPosCheckout')?.addEventListener('click', posCheckout);
        document.getElementById('btnPosPrintLast')?.addEventListener('click', reprintLastPosReceipt);

        document.getElementById('btnPosQtyDec')?.addEventListener('click', () => adjustPosQty(-1));
        document.getElementById('btnPosQtyInc')?.addEventListener('click', () => adjustPosQty(1));
        document.getElementById('posAddBtn')?.addEventListener('click', addToWalkinCartFromModal);

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

        bindFn('btnDownloadExcel', 'downloadExcel');
        bindFn('btnDownloadPDF', 'downloadPDF');
    };

    // --- 2. Dynamic Event Delegation ---
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action], [data-tab]');
        if (!el) return;

        const action = el.getAttribute('data-action');
        const tab = el.getAttribute('data-tab');

        if (tab) {
            switchTab(tab);
            return;
        }

        if (!action) return;
        const id = el.getAttribute('data-id');
        const val = el.getAttribute('data-val');
        const name = el.getAttribute('data-name');
        const price = el.getAttribute('data-price');

        switch (action) {
            case 'updateStatusFromDrawer': updateStatusFromDrawer(id, val); break;
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
            case 'adjustCardQty': adjustCardQty(id, parseInt(val)); break;
            case 'addToWalkinCartFromModal': addToWalkinCartFromModal(); break;
            case 'addToWalkinCartFromCard': addToWalkinCartFromCard(id); break;
            case 'showAddonView': showAddonView(id); break;
            case 'hideAddonView': hideAddonView(); break;
            case 'openCartAddonPicker': openCartAddonPicker(id); break;
            case 'walkinQtyChange': walkinQtyChange(id, parseInt(val)); break;
            case 'walkinRemoveItem': walkinRemoveItem(id); break;
            case 'filterWalkinByCategory': filterWalkinByCategory(val, el); break;
            case 'selectPOSSize': selectPOSSize(name, parseFloat(price), el); break;
            case 'triggerClick': {
                const target = document.getElementById(val);
                if (target) target.click();
                break;
            }
            case 'markDelivered': markDelivered(id); break;
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
            case 'toggleNotificationSheet': toggleNotificationSheet(); break;
            case 'toggleSidebar': toggleSidebar(); break;
            case 'openOutletInNewTab': openOutletInNewTab(); break;
            case 'userLogout': userLogout(); break;
            case 'installPWA': installPWA(); break;
            case 'removeRow': el.closest('tr').remove(); break;
            case 'addFeeSlab': addFeeSlab(); break;
            case 'migrateAddons': migrateAddonsToCategories(); break;
            case 'runImageMigration': runImageMigration(); break;
            case 'clearWalkinCart': clearWalkinCart(); break;
            case 'submitWalkinSale': submitWalkinSale(); break;
            case 'addCategory': addCategory(); break;
            case 'saveRiderAccount': saveRiderAccount(); break;
            case 'applyWalkinDiscount': {
                const amt = el.getAttribute('data-amount');
                const pct = el.getAttribute('data-pct');
                if (amt) setDiscount(parseFloat(amt));
                else if (pct) setDiscountPct(parseFloat(pct));
                break;
            }
            case 'selectWalkinPayment': {
                const method = el.getAttribute('data-method');
                selectWalkinPayment(method, el);
                break;
            }
        }
    });

    document.addEventListener('change', (e) => {
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
    });

    // Search input for POS - real-time filter
    const walkinSearch = document.getElementById('walkinDishSearch');
    if (walkinSearch) {
        walkinSearch.addEventListener('input', async () => {
            const { applyWalkinFilters } = await import('./features/pos.js');
            applyWalkinFilters();
        });
    }

    // Orders filter
    const orderSearch = document.getElementById('orderSearch');
    if (orderSearch) {
        orderSearch.addEventListener('input', async () => {
            const { filterOrders } = await import('./features/orders.js');
            filterOrders(orderSearch.value);
        });
    }

    // Customers filter
    const customerSearch = document.getElementById('customerSearch');
    if (customerSearch) {
        customerSearch.addEventListener('input', async () => {
            const { filterCustomers } = await import('./features/customers.js');
            filterCustomers(customerSearch.value);
        });
    }

    // Menu filter (desktop)
    const menuSearch = document.getElementById('menuSearch');
    if (menuSearch) {
        menuSearch.addEventListener('input', async () => {
            const { filterMenu } = await import('./features/catalog.js');
            filterMenu(menuSearch.value);
        });
    }

    // Menu filter (mobile)
    const menuSearchMobile = document.getElementById('menuSearchMobile');
    if (menuSearchMobile) {
        menuSearchMobile.addEventListener('input', async () => {
            const { filterMenu } = await import('./features/catalog.js');
            filterMenu(menuSearchMobile.value);
        });
    }

    // Category filter
    const categorySearch = document.getElementById('categorySearch');
    if (categorySearch) {
        categorySearch.addEventListener('input', async () => {
            const { filterCategories } = await import('./features/catalog.js');
            filterCategories(categorySearch.value);
        });
    }

    setupStaticListeners();

    if (typeof lucide !== 'undefined') lucide.createIcons();
});

console.log("\uD83D\uDE80 Roshani Pizza ERP Modules Loaded");

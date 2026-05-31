import { previewImage, showToast, showConfirm, logAudit, getISTDateString } from './utils.js';
import { state } from './state.js';
import { auth, db, serverTimestamp, ref, push, set } from './firebase.js';
import { switchOutlet, openOutletInNewTab } from './branding.js';
import { switchTab, toggleSidebar, toggleMobileCart } from './ui.js';
import { initGestures } from './gestures.js';
import { initAuth, userLogout } from './auth.js';
import { installPWA, completeSiteRefresh } from './pwa.js';

// Side-effect imports
import './firebase.js';
import './branding.js';

const _modCache = {};
function useMod(name) {
    if (!_modCache[name]) _modCache[name] = import(`./features/${name}.js`);
    return _modCache[name];
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log("[Main] DOM Content Loaded. Initializing...");
    initGestures();

    window.hideLoader = () => {
        const loader = document.getElementById('initial-loader');
        if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => {
                loader.style.display = 'none';
            }, 600);
        }
    };

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    
    const fromVal = getISTDateString(yesterday);
    const toVal = getISTDateString(today);
    
    const fromInput = document.getElementById('orderFrom');
    const toInput = document.getElementById('orderTo');
    const rFrom = document.getElementById('reportFrom');
    const rTo = document.getElementById('reportTo');

    if (fromInput && toInput && !fromInput.value && !toInput.value) {
        fromInput.value = fromVal;
        toInput.value = toVal;
    }
    if (rFrom && rTo && !rFrom.value && !rTo.value) {
        rFrom.value = fromVal;
        rTo.value = toVal;
    }

    initAuth();
    (await useMod('rider-analytics')).initRiderAnalytics();
    (await useMod('inventory')).initInventory();

    if (window.lucide) {
        const overlay = document.getElementById('authOverlay');
        const layout = document.querySelector('.layout');
        
        if (overlay) window.lucide.createIcons({ root: overlay });
        if (layout) window.lucide.createIcons({ root: layout });
    }

    const setupStaticListeners = () => {
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

        document.addEventListener('click', (e) => {
            if (e.target.closest('.close-btn, .cancel-dish-btn, .cancel-cat-btn, .btn-hide-modal')) {
                const modal = e.target.closest('.modal');
                if (modal) {
                    modal.classList.remove('active', 'flex');
                    modal.classList.add('hidden');
                }
            }
        });

        const orderOverlay = document.getElementById('orderDrawerOverlay');
        if (orderOverlay) {
            orderOverlay.addEventListener('click', () => {
                useMod('orders').then(o => o.closeOrderDrawer());
            });
        }

        document.querySelectorAll('.btn-show-dish-modal').forEach(btn => {
            btn.addEventListener('click', async () => {
                (await useMod('catalog')).showDishModal();
            });
        });
        document.getElementById('btnMigrateDishAddons')?.addEventListener('click', async () => {
            (await useMod('catalog')).migrateAddonsToCategories();
        });
        bindClickTo('btnChangeCatPhoto', 'catFile');

        document.getElementById('catFile')?.addEventListener('change', (e) => {
            previewImage(e.target, 'catPreview');
        });

        document.getElementById('btnShowRiderModal')?.addEventListener('click', async () => {
            (await useMod('riders')).showRiderModal();
        });
        bindClickTo('btnUploadRiderPhoto', 'riderPhotoInput');
        document.getElementById('riderPhotoInput')?.addEventListener('change', (e) => {
            previewImage(e.target, 'riderProfilePreview');
        });

        document.getElementById('riderSearchInput')?.addEventListener('input', async (e) => {
            (await useMod('riders')).renderRiders(e.target.value);
        });

        bindClickTo('btnUploadAadhar', 'aadharPhotoInput');
        document.getElementById('aadharPhotoInput')?.addEventListener('change', (e) => {
            previewImage(e.target, 'aadharPreview');
        });

        document.getElementById('btnClearAllNotif')?.addEventListener('click', async () => {
            (await useMod('notifications')).clearAllNotifications();
        });
        document.getElementById('btnClearNotificationsBottom')?.addEventListener('click', async () => {
            (await useMod('notifications')).clearAllNotifications();
        });
        document.getElementById('btnClearLostSales')?.addEventListener('click', async () => {
            (await useMod('customers')).clearLostSales();
        });
        document.getElementById('btnEnableNotif')?.addEventListener('click', async () => {
            (await useMod('notifications')).requestNotificationPermission();
        });
        document.getElementById('btnTestNotif')?.addEventListener('click', async () => {
            (await useMod('notifications')).testNotification();
        });

        // Login is handled by auth.js initAuth()

        document.getElementById('btnSaveSettings')?.addEventListener('click', async () => {
            (await useMod('settings')).saveStoreSettings();
        });
        document.getElementById('btnQuickToggleOutlet')?.addEventListener('click', async () => {
            (await useMod('settings')).quickUpdateOutletStatus();
        });
        document.getElementById('btnAddFeeSlab')?.addEventListener('click', async () => {
            (await useMod('settings')).addFeeSlab();
        });
        document.getElementById('btnMigrateAddons')?.addEventListener('click', async () => {
            (await useMod('catalog')).migrateAddonsToCategories();
        });
        document.getElementById('btnRunImageMigration')?.addEventListener('click', async () => {
            (await useMod('catalog')).runImageMigration();
        });

        document.getElementById('btnShowPOSSelection')?.addEventListener('click', async () => {
            (await useMod('pos')).openPOSSelectionModal();
        });
        document.getElementById('btnPosPrintLast')?.addEventListener('click', async () => {
            (await useMod('printing')).reprintLastPosReceipt();
        });

        document.getElementById('btnPosQtyDec')?.addEventListener('click', async () => {
            (await useMod('pos')).adjustPOSModalQty(-1);
        });
        document.getElementById('btnPosQtyInc')?.addEventListener('click', async () => {
            (await useMod('pos')).adjustPOSModalQty(1);
        });

        bindClickTo('btnUpdateDishPhoto', 'dishFile');
        document.getElementById('dishFile')?.addEventListener('change', (e) => {
            previewImage(e.target, 'dishPreview');
        });
        document.getElementById('saveDishBtn')?.addEventListener('click', async () => {
            (await useMod('catalog')).saveDish();
        });

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

        const bindFn = (id, fn) => {
            const el = document.getElementById(id);
            if (el && window[fn]) el.addEventListener('click', window[fn]);
        };

        const btnGenerateReport = document.getElementById('btnGenerateReport');
        if (btnGenerateReport) btnGenerateReport.addEventListener('click', async () => {
            const r = await useMod('customers');
            if (r.generateCustomReport) r.generateCustomReport();
        });

        const btnWhatsappReport = document.getElementById('btnWhatsappReport');
        if (btnWhatsappReport) btnWhatsappReport.addEventListener('click', async () => {
            if (!(await showConfirm("Send Daily Sales Report to WhatsApp now?", "Confirm Report"))) return;
            
            try {
                btnWhatsappReport.disabled = true;
                btnWhatsappReport.style.opacity = '0.7';
                
                const reportDate = document.getElementById('reportFrom')?.value;
                const dateLabel = reportDate ? reportDate : "Today";
                
                showToast(`Requesting WhatsApp Report for ${dateLabel}...`, "info");
                const cmdRef = push(ref(db, `bot/${state.currentOutlet}/commands`));
                await set(cmdRef, {
                    action: "SEND_DAILY_REPORT",
                    targetDate: reportDate || null,
                    requestedBy: auth.currentUser?.email || 'admin',
                    timestamp: serverTimestamp()
                });
                showToast(`Report request for ${dateLabel} sent to Bot!`, "success");
            } catch (err) {
                console.error("Bot trigger error:", err);
                showToast("Failed to trigger Bot: " + err.message, "error");
            } finally {
                btnWhatsappReport.disabled = false;
                btnWhatsappReport.style.opacity = '1';
            }
        });

        document.getElementById('btnDownloadExcel')?.addEventListener('click', async () => {
            const r = await useMod('customers');
            r.downloadExcel?.();
        });
        document.getElementById('btnDownloadPDF')?.addEventListener('click', async () => {
            const r = await useMod('customers');
            r.downloadPDF?.();
        });
    };
    setupStaticListeners();

    document.addEventListener('click', async (e) => {
        try {
            const el = e.target.closest('[data-action], [data-tab]');
            if (!el) return;

            if (window.innerWidth <= 1024) {
                const sidebar = document.getElementById('sidebarNav');
                if (sidebar && sidebar.classList.contains('active')) {
                    const isToggleBtn = el.getAttribute('data-action') === 'toggleSidebar' || el.closest('#mobileHamburger');
                    if (!isToggleBtn) {
                        import('./ui.js').then(u => u.closeSidebar());
                    }
                }
            }

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

                case 'updateStatusFromDrawer': (await useMod('orders')).updateStatus(id, val); break;
                case 'closeOrderDrawer': (await useMod('orders')).closeOrderDrawer(); break;
                case 'chatOnWhatsapp': {
                    const phone = el.getAttribute('data-phone');
                    if (phone) window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}`, '_blank');
                    break;
                }
                case 'printReceiptById': (await useMod('orders')).closeOrderDrawer(); (await useMod('printing')).printReceiptById(id); break;
                case 'closeReceiptPreview': (await useMod('printing')).closeReceiptPreview(); break;
                case 'printReceiptFromPreview': (await useMod('printing')).printReceiptFromPreview(); break;
                case 'updateStatus': (await useMod('orders')).updateStatus(id, val); break;
                case 'assignRider': (await useMod('orders')).assignRider(id, val); break;
                case 'openOrderDrawer': (await useMod('orders')).openOrderDrawer(id); break;
                case 'markAsPaid': (await useMod('orders')).markAsPaid(id); break;
                case 'deleteCategory': (await useMod('catalog')).deleteCategory(id); break;
                case 'removeParent': el.parentElement.remove(); break;
                case 'removeGrandparent': el.parentElement.parentElement.remove(); break;
                case 'editRider': (await useMod('riders')).editRider(id); break;
                case 'resetRiderPassword': (await useMod('riders')).resetRiderPassword(el.getAttribute('data-email')); break;
                case 'deleteRider': (await useMod('riders')).deleteRider(id); break;
                case 'settleRider': (await useMod('riders')).settleRiderWallet(id, name); break;
                case 'saveSettings': (await useMod('settings')).saveStoreSettings(); break;
                case 'saveDeliveredOrder': (await useMod('orders')).saveDeliveredOrder(id, val); break;
                case 'openPOSSelectionModal': (await useMod('pos')).openPOSSelectionModal(id); break;
                case 'hidePOSSelectionModal': (await useMod('pos')).hidePOSSelectionModal(); break;
                case 'addToWalkinCartFromModal': (await useMod('pos')).addToWalkinCartFromModal(); break;
                case 'adjustPOSModalQty': (await useMod('pos')).adjustPOSModalQty(parseInt(val, 10)); break;
                case 'openCartAddonPicker': (await useMod('pos')).openCartAddonPicker(id); break;
                case 'walkinQtyChange': (await useMod('pos')).walkinQtyChange(id, parseInt(val, 10)); break;
                case 'walkinRemoveItem': (await useMod('pos')).removeFromWalkinCart(id); break;
                case 'filterWalkinByCategory': (await useMod('pos')).filterWalkinByCategory(val, el); break;
                case 'selectPOSSize': (await useMod('pos')).selectPOSSize(name, parseFloat(price), el); break;
                case 'togglePOSAddon': (await useMod('pos')).togglePOSAddon(name, parseFloat(price), el); break;
                case 'triggerClick': {
                    const target = document.getElementById(val);
                    if (target) target.click();
                    break;
                }
                case 'markDelivered': (await useMod('orders')).updateStatus(id, 'Delivered'); break;
                case 'editDish': (await useMod('catalog')).editDish(id); break;
                case 'deleteDish': (await useMod('catalog')).deleteDish(id); break;
                case 'editCategory': (await useMod('catalog')).editCategory(id); break;
                case 'showRiderModal':
                case 'showAddRiderModal': (await useMod('riders')).showRiderModal(); break;
                case 'closeModal':
                case 'hideReauthModal':
                case 'hideInventoryModal': {
                    const modal = el.closest('.modal');
                    if (modal) {
                        modal.classList.add('hidden');
                        modal.classList.remove('active', 'flex');
                    }
                    break;
                }
                case 'completeSiteRefresh': completeSiteRefresh(); break;
                case 'toggleNotificationSheet': (await useMod('notifications')).toggleNotificationSheet(); break;
                case 'toggleSidebar': toggleSidebar(); break;
                case 'toggleMobileCart': {
                    toggleMobileCart(true);
                    break;
                }
                case 'openOutletInNewTab': openOutletInNewTab(); break;

                case 'userLogout': userLogout(); break;
                case 'installPWA': installPWA(); break;
                case 'removeRow': el.closest('tr').remove(); break;
                case 'addFeeSlab': (await useMod('settings')).addFeeSlab(); break;
                case 'migrateAddons': (await useMod('catalog')).migrateAddonsToCategories(); break;
                case 'runImageMigration': (await useMod('catalog')).runImageMigration(); break;
                case 'clearWalkinCart': (await useMod('pos')).clearWalkinCart(); break;
                case 'submitWalkinSale': (await useMod('pos')).submitWalkinSale(); break;
                case 'addCategory': (await useMod('catalog')).addCategory(); break;
                case 'addSizeField': (await useMod('catalog')).addSizeField(); break;
                case 'addDishAddonField': (await useMod('catalog')).addDishAddonField(); break;
                case 'addCategoryAddonField': (await useMod('catalog')).addCategoryAddonField(); break;
                case 'saveRiderAccount': (await useMod('riders')).saveRiderAccount(); break;
                case 'applyWalkinDiscount': {
                    const amt = el.getAttribute('data-amount');
                    const pct = el.getAttribute('data-pct');
                    const p = await useMod('pos');
                    if (amt) p.setDiscount(parseFloat(amt));
                    else if (pct) p.setDiscountPct(parseFloat(pct));
                    break;
                }
                case 'loadMoreOrders': (await useMod('orders')).loadMoreOrders(); break;
                case 'selectWalkinPayment': {
                    const method = el.getAttribute('data-method');
                    (await useMod('pos')).selectWalkinPayment(method, el);
                    break;
                }
            }
        } catch (err) {
            console.error("[Main] Click Event Error:", err);
            showToast("An error occurred: " + err.message, "error");
        }
    });

    document.addEventListener('change', async (e) => {
        try {
            const el = e.target;
            const action = el.getAttribute('data-action');
            if (!action) return;
            const id = el.getAttribute('data-id');
            const val = el.value;

            switch (action) {
                case 'updateStatus': (await useMod('orders')).updateStatus(id, val); break;
                case 'assignRider': (await useMod('orders')).assignRider(id, val); break;
                case 'toggleDish': (await useMod('catalog')).toggleDishAvailable(id, el.checked); break;
                case 'togglePOSAddon':
                    (await useMod('pos')).togglePOSAddon(el.getAttribute('data-name'), parseFloat(el.getAttribute('data-price')), el);
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

    document.getElementById('walkinDishSearch')?.addEventListener('input', async () => {
        (await useMod('pos')).applyWalkinFilters();
    });
    document.getElementById('orderSearch')?.addEventListener('input', async (e) => {
        (await useMod('orders')).filterOrders(e.target.value);
    });
    document.getElementById('customerSearch')?.addEventListener('input', async (e) => {
        (await useMod('customers')).filterCustomers(e.target.value);
    });
    document.getElementById('menuSearch')?.addEventListener('input', async (e) => {
        (await useMod('catalog')).filterMenu(e.target.value);
    });
    document.getElementById('categorySearch')?.addEventListener('input', async (e) => {
        (await useMod('catalog')).filterCategories(e.target.value);
    });
    
    const triggerOrderRender = () => {
        useMod('orders').then(o => {
            o.initRealtimeListeners();
            if (state.currentActiveTab === 'orders') o.loadOrdersPage(true);
        });
    };
    document.getElementById('orderFrom')?.addEventListener('change', triggerOrderRender);
    document.getElementById('orderTo')?.addEventListener('change', triggerOrderRender);

    document.addEventListener('keydown', async (e) => {
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal.active:not(.hidden)');
            if (activeModal) {
                activeModal.classList.add('hidden');
                activeModal.classList.remove('active', 'flex');
                return;
            }

            if (window.innerWidth <= 1024) {
                import('./ui.js').then(u => u.closeSidebar());
            }

            await Promise.all([
                useMod('orders').then(o => o.closeOrderDrawer()),
                useMod('notifications').then(n => n.toggleNotificationSheet(false)),
                useMod('pos').then(p => p.hidePOSSelectionModal())
            ]);
        }
    });

    setupStaticListeners();

    if (window.lucide) {
        const layout = document.querySelector('.layout');
        window.lucide.createIcons({ root: layout || document.body });
    }

    window.addEventListener('beforeunload', (e) => {
        if (state.adminData && !window.location.search.includes('nuclear')) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    logAudit('SYSTEM_INIT', { 
        agent: 'Antigravity',
        version: '4.4.12',
        timestamp: new Date().toISOString()
    });
});

console.log("\uD83D\uDE80 Roshani Pizza ERP Modules Loaded");

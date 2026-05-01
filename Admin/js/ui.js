import { haptic } from './utils.js';
import { showToast, showConfirm } from './ui-utils.js';
import { state } from './state.js';
import { loadCategories, loadMenu, cleanupCatalog } from './features/catalog.js';
import { loadRiders, cleanupRiders } from './features/riders.js';
import { loadFeedbacks, cleanupFeedbacks } from './features/feedback.js';
import { initLiveRiderTracker, cleanupLiveRiderTracker } from './features/tracker.js';
import { loadWalkinMenu } from './features/pos.js';
import { loadStoreSettings } from './features/settings.js';
import { loadCustomers, loadReports, loadLostSales } from './features/customers.js';
import { toggleNotificationSheet, updateNotificationUI, updateNotificationSettingsUI } from './features/notifications.js';
import { renderOrders } from './features/orders.js';



export const toggleSidebar = () => {
    const sidebar = document.getElementById('sidebarNav');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar) return;

    haptic(15);

    if (window.innerWidth > 1024) {
        document.body.classList.toggle('sidebar-collapsed');
    } else {
        const isActive = sidebar.classList.toggle('active');
        if (overlay) overlay.classList.toggle('active', isActive);
    }
};

export const closeSidebar = () => {
    const sidebar = document.getElementById('sidebarNav');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
};

export const switchTab = (tabId) => {
    state.currentActiveTab = tabId;
    console.log(`[Navigation] Switching to: ${tabId}`);

    closeSidebar();
    toggleNotificationSheet(false);

    if (tabId === 'notifications') {
        state.isNotificationPending = false;
        updateNotificationUI();
    }

    if (tabId === 'settings') {
        updateNotificationSettingsUI();
    }

    const body = document.body;
    const posTab = document.getElementById('tab-walkin');

    // Handle POS (Walk-in) Fullscreen on Mobile
    if (tabId === 'walkin') {
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
                switchTab('dashboard');
            };
            posTab.prepend(backBtn);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    } else {
        body.classList.remove('pos-immersion-active');
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

        // --- PHASE 3.25: PERFORMANCE ORCHESTRATION ---
        // 1. Cleanup all persistent background listeners (except Orders which stays active for alerts)
        if (tabId !== 'catalog' && tabId !== 'categories') cleanupCatalog();
        if (tabId !== 'riders' && tabId !== 'dashboard') cleanupRiders();
        if (tabId !== 'feedback') cleanupFeedbacks();
        if (tabId !== 'liveTracker') cleanupLiveRiderTracker();

        // 2. Initialize/Load listeners ONLY for the active tab
        switch (tabId) {
            case 'liveTracker':
                setTimeout(() => initLiveRiderTracker(), 100);
                break;
            case 'catalog':
            case 'categories':
            case 'menu':
                loadCategories();
                loadMenu();
                break;
            case 'riders':
                loadRiders();
                break;
            case 'feedback':
                loadFeedbacks();
                break;
            case 'walkin':
                loadWalkinMenu();
                break;
            case 'settings':
                loadStoreSettings();
                break;
            case 'customers':
                loadCustomers();
                break;
            case 'reports':
                loadReports();
                break;
            case 'lostSales':
                loadLostSales();
                break;
            case 'live':
                loadRiders();
                if (state.lastOrdersSnap) renderOrders(state.lastOrdersSnap);
                break;
            case 'orders':
            case 'dashboard':
                if (state.lastOrdersSnap) renderOrders(state.lastOrdersSnap);
                break;
        }
    }
};

export const ui = {
    showConfirm,
    showToast,
    toggleSidebar,
    closeSidebar,
    switchTab
};

/**
 * THEME MANAGEMENT
 */
export class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('erp-theme') || 'light';
        this.init();
    }

    init() {
        this.applyTheme(this.currentTheme);
        
        // Listen for system changes if set to auto (future)
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (this.currentTheme === 'auto') {
                this.applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('erp-theme', theme);
        this.currentTheme = theme;
        
        // Update Icons
        const themeBtn = document.querySelector('[data-action="toggleTheme"] i');
        if (themeBtn) {
            themeBtn.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    toggleTheme() {
        haptic(10);
        const next = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(next);
        showToast(`Switched to ${next} mode`, 'info');
    }
}

export const themeManager = new ThemeManager();

import { state } from './state.js';
import { initRealtimeListeners, cleanupOrders } from './features/orders.js';
import { cleanupCatalog } from './features/catalog.js';
import { cleanupRiders } from './features/riders.js';
import { cleanupInventory } from './features/inventory.js';
import { cleanupFeedbacks } from './features/feedback.js';
import { cleanupLiveRiderTracker } from './features/tracker.js';
import { cleanupRiderAnalytics } from './features/rider-analytics.js';
import * as ui from './ui.js';


export function clearStateForOutletSwitch() {
    console.log("[State] Clearing state for outlet isolation...");
    
    // 1. Detach all listeners first
    cleanupCatalog();
    cleanupRiders();
    cleanupInventory();
    cleanupOrders();
    cleanupFeedbacks();
    cleanupLiveRiderTracker();
    cleanupRiderAnalytics();
    
    // 2. Clear relevant state arrays/objects
    state.categories = [];
    state.allWalkinDishes = [];
    state.ordersMap.clear();
    state.liveOrdersMap.clear();
    state.lastOrdersSnap = null;
    state.lastDishesSnap = null;
    state.ridersList = [];
    state.riderStatsData = {};
    
    // 3. Clear UI containers (optional but recommended to prevent flash of old data)
    const containers = [
        'categoryList', 'menuGrid', 'walkinDishGrid', 'walkinCategoryTabs',
        'ordersTable', 'ordersTableFull', 'liveOrdersTable', 'ridersTable'
    ];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = "";
    });
}


export function updateBranding() {
    const badge = document.getElementById('outletBadge');
    const mobBadge = document.getElementById('mobileOutletBadge');
    const sidebarBrand = document.getElementById('sidebarBrandText');
    const brand = state.currentOutlet === 'cake' ? 'cake' : 'pizza';
    const isPizza = brand === 'pizza';

    const label = isPizza ? 'PIZZA OUTLET' : 'CAKES OUTLET';
    const primary = isPizza ? 'var(--primary-pizza)' : 'var(--primary-cake)';
    const primaryDark = isPizza ? 'var(--primary-dark-pizza)' : 'var(--primary-dark-cake)';

    // Apply color variables via data-outlet
    document.documentElement.setAttribute('data-outlet', brand);
    
    // Compatibility for any remaining hardcoded var usage
    const root = document.documentElement;
    root.style.setProperty('--primary-orange', primary);


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

    const ridersMenu = document.getElementById("menu-riders");
    if (ridersMenu) {
        // Only show riders for Pizza or Super Admins
        const isSuper = state.adminData && state.adminData.isSuper;
        ridersMenu.classList.toggle('hidden', !(isPizza || isSuper));
    }
}

export function switchOutlet(val) {
    // 100% Compatibility & Security Check
    const isAdmin = state.adminData;
    const canSwitch = isAdmin && (isAdmin.isSuper || isAdmin.isSupreme);

    if (!canSwitch && isAdmin && isAdmin.outlet !== val) {
        console.error("[Security] Unauthorized switch attempt blocked:", val);
        import('./utils.js').then(u => u.showToast("Unauthorized: Access restricted to your assigned outlet", "error"));
        
        // Revert UI if needed
        const desktopSwitcher = document.getElementById('outletSwitcher');
        const mobileSwitcher = document.getElementById('outletSwitcherMobile');
        if (desktopSwitcher) desktopSwitcher.value = state.currentOutlet;
        if (mobileSwitcher) mobileSwitcher.value = state.currentOutlet;
        return;
    }

    clearStateForOutletSwitch();
    sessionStorage.setItem('adminSelectedOutlet', val);
    state.currentOutlet = val;
    window.currentOutlet = val;

    // Sync switchers
    const desktopSwitcher = document.getElementById('outletSwitcher');
    const mobileSwitcher = document.getElementById('outletSwitcherMobile');
    if (desktopSwitcher && desktopSwitcher.value !== val) desktopSwitcher.value = val;
    if (mobileSwitcher && mobileSwitcher.value !== val) mobileSwitcher.value = val;


    updateBranding();
    initRealtimeListeners();

    // Refresh active tab
    const activeTabId = document.querySelector('.nav-links li.active')?.id.replace('menu-', '') || 'dashboard';
    ui.switchTab(activeTabId);
    
    console.log("[Branding] Admin switched outlet to:", val);
}

export function openOutletInNewTab() {
    const brand = state.currentOutlet === 'cake' ? 'pizza' : 'cake';
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('brand', brand);
    window.open(url.toString(), '_blank');
}

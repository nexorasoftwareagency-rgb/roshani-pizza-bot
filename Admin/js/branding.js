import { state } from './state.js';
import { initRealtimeListeners } from './features/orders.js';
import { ui } from './ui.js';


export function updateBranding() {
    const badge = document.getElementById('outletBadge');
    const mobBadge = document.getElementById('mobileOutletBadge');
    const sidebarBrand = document.getElementById('sidebarBrandText');
    const brand = state.currentOutlet === 'cake' ? 'cake' : 'pizza';
    const isPizza = brand === 'pizza';

    const label = isPizza ? 'PIZZA OUTLET' : 'CAKES OUTLET';
    const primary = isPizza ? 'var(--primary-pizza)' : 'var(--primary-cake)';
    const primaryDark = isPizza ? 'var(--primary-dark-pizza)' : 'var(--primary-dark-cake)';

    // Apply color variables
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

    const ridersMenu = document.getElementById("menu-riders");
    if (ridersMenu) {
        // Only show riders for Pizza or Super Admins
        const isSuper = state.adminData && state.adminData.isSuper;
        ridersMenu.classList.toggle('hidden', !(isPizza || isSuper));
    }
}

export function switchOutlet(val) {
    sessionStorage.setItem('adminSelectedOutlet', val);
    state.currentOutlet = val;

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

import { haptic, showToast } from './utils.js';
import { state } from './state.js';
import { loadCategories, loadMenu, cleanupCatalog } from './features/catalog.js';
import { loadRiders, cleanupRiders } from './features/riders.js';
import { loadFeedbacks, cleanupFeedbacks } from './features/feedback.js';
import { initLiveRiderTracker, cleanupLiveRiderTracker } from './features/tracker.js';
import { loadWalkinMenu } from './features/pos.js';
import { toggleNotificationSheet, updateNotificationUI } from './features/notifications.js';
import { updateNotificationSettingsUI } from './features/settings.js';

export const showConfirm = (message, title = "Confirm Action") => {
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
        if (tabId !== 'riders') cleanupRiders();
        if (tabId !== 'feedback') cleanupFeedbacks();
        if (tabId !== 'liveTracker') cleanupLiveRiderTracker();

        // 2. Initialize/Load listeners ONLY for the active tab
        switch (tabId) {
            case 'liveTracker':
                setTimeout(() => initLiveRiderTracker(), 100);
                break;
            case 'catalog':
            case 'categories':
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

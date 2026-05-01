/**
 * ROSHANI ERP | PWA & SYSTEM
 * Handles service worker, installation prompt, and refresh circuit breaker.
 */

import { showConfirm } from './ui-utils.js';

// 1. REFRESH CIRCUIT BREAKER & COMPLETE REFRESH
export const completeSiteRefresh = async () => {
    const ok = await showConfirm(
        "This will purge all local caches, unregister the app, and reset UI states. You will NOT be logged out. Are you sure?",
        "⚠️ Nuclear Refresh"
    );
    
    if (!ok) return;

    showToast("Initializing Nuclear Refresh...", "warning");
    
    try {
        // 1. Unregister all service workers
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
                console.log("[PWA] Service Worker Unregistered");
            }
        }

        // 2. Clear all caches
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            for (let name of cacheNames) {
                await caches.delete(name);
                console.log(`[PWA] Cache Cleared: ${name}`);
            }
        }

        // 3. Selective Storage Wipe (Preserve Auth)
        sessionStorage.clear();
        
        // Identify and remove all keys EXCEPT Firebase Auth tokens
        Object.keys(localStorage).forEach(key => {
            // Firebase Auth usually uses keys starting with 'firebase:authUser'
            if (!key.startsWith('firebase:')) {
                localStorage.removeItem(key);
            }
        });
        
        console.log("[PWA] Local storage cleared (Preserving Auth).");
        showToast("Caches Purged. Site Updated. Reloading...", "success");

        // Delay for visual feedback and ensure storage operations finish
        setTimeout(() => {
            // Force a reload with a unique timestamp to bypass any ISP/Browser proxies
            window.location.href = window.location.origin + window.location.pathname + '?nuclear=' + Date.now();
        }, 1200);

    } catch (err) {
        console.error("Refresh failed:", err);
        window.location.reload();
    }
};

(function () {
    const REFRESH_LIMIT = 5;
    const TIME_WINDOW = 10000;
    const now = Date.now();
    let refreshData = JSON.parse(sessionStorage.getItem('erp_refresh_log') || '{"count": 0, "first": 0}');

    if (now - refreshData.first > TIME_WINDOW) {
        refreshData = { count: 1, first: now };
    } else {
        refreshData.count++;
    }

    sessionStorage.setItem('erp_refresh_log', JSON.stringify(refreshData));

    if (refreshData.count > REFRESH_LIMIT) {
        console.error("CRITICAL: Infinite redirect loop detected. Stopping.");
        sessionStorage.setItem('erp_refresh_log', '{"count": 0, "first": 0}');
        return;
    }
})();

// Note: Manual pull-to-refresh for Nuclear Refresh has been REMOVED to prevent accidental triggers.
// It can only be triggered via the menu.

// 2. PWA INSTALL LOGIC
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    const downloadBtn = document.getElementById('menu-download');
    if (downloadBtn) downloadBtn.classList.remove('hidden');
});

export const installPWA = async () => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) return;

    if (!state.deferredPrompt) {
        if (!isStandalone) {
            showToast("Look for 'Add to Home Screen' in your browser menu.", "info");
        }
        return;
    }

    state.deferredPrompt.prompt();
    const { outcome } = await state.deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        const downloadBtn = document.getElementById('menu-download');
        if (downloadBtn) downloadBtn.classList.add('hidden');
    }
    state.deferredPrompt = null;
};

window.addEventListener('appinstalled', () => {
    const downloadBtn = document.getElementById('menu-download');
    if (downloadBtn) downloadBtn.classList.add('hidden');
    state.deferredPrompt = null;
});

// 3. SERVICE WORKER REGISTRATION
const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

if ('serviceWorker' in navigator && isSecure) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW failed', err));

        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        if (isStandalone) {
            const downloadBtn = document.getElementById('menu-download');
            if (downloadBtn) downloadBtn.classList.add('hidden');
        }
    });
}


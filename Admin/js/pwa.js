/**
 * ROSHANI ERP | PWA & SYSTEM
 * Handles service worker, installation prompt, and refresh circuit breaker.
 */

import { showToast } from './utils.js';
import { state } from './state.js';

// 1. REFRESH CIRCUIT BREAKER
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
        showToast("System detected a refresh loop. Please clear cache.", "error");
        throw new Error("Refresh Loop Halted");
    }
})();

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


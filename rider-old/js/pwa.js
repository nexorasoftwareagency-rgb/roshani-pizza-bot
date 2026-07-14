/**
 * RIDER PWA — install prompt + nuclear cache refresh.
 */
let _deferredPrompt = null;

export function initPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        if (typeof Capacitor !== 'undefined') return;
        _deferredPrompt = e;
        const btn = document.getElementById('menu-downloadapp');
        if (btn) btn.classList.remove('hidden');
    });

    window.installPWA = async () => {
        if (!_deferredPrompt) return;
        _deferredPrompt.prompt();
        const { outcome } = await _deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            const btn = document.getElementById('menu-downloadapp');
            if (btn) btn.classList.add('hidden');
        }
        _deferredPrompt = null;
    };

    window.addEventListener('appinstalled', () => {
        const btn = document.getElementById('menu-downloadapp');
        if (btn) btn.classList.add('hidden');
        _deferredPrompt = null;
    });

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('menu-downloadapp')?.addEventListener('click', window.installPWA);
    });

    window.completeSiteRefresh = async () => {
        window.haptic(50);
        console.log("[Refresh] Initializing Deep Sync & Cache Purge...");
        window.showToast("Purging Caches & Syncing...", "info");
        try {
            if ('serviceWorker' in navigator) {
                const swPromise = navigator.serviceWorker.getRegistrations().then(async regs => {
                    for (let r of regs) await r.unregister();
                });
                await Promise.race([swPromise, new Promise(res => setTimeout(res, 2000))]);
            }
            if ('caches' in window) {
                const cachePromise = caches.keys().then(async keys => {
                    for (let k of keys) await caches.delete(k);
                });
                await Promise.race([cachePromise, new Promise(res => setTimeout(res, 2000))]);
            }
            localStorage.removeItem('activeOrderId');
            localStorage.removeItem('activeOrderData');
            sessionStorage.clear();
            console.log("[Refresh] Purge Complete. Triggering Reload.");
            window.showToast("System Purged. Reloading...", "success");
            setTimeout(() => {
                const cleanUrl = window.location.origin + window.location.pathname;
                window.location.href = `${cleanUrl}?v=${Date.now()}&sync=${Math.random().toString(36).substring(7)}`;
            }, 800);
        } catch (err) {
            console.error("Critical Refresh Error:", err);
            window.location.reload();
        }
    };
}

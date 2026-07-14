/**
 * RIDER UI primitives — sidebar, section navigation, toast, confirm.
 * These are assigned to window.* for backwards compatibility with HTML onclick handlers.
 */

export function initUI() {
    // Haptic feedback (vibration API) with fallback
    window.haptic = (pattern) => {
        try {
            if (navigator.vibrate) navigator.vibrate(pattern);
        } catch (_) { /* no-op on unsupported browsers */ }
    };

    // Sidebar toggle
    window.toggleRiderSidebar = () => {
        console.log("[Navigation] Toggling Sidebar. Width:", window.innerWidth);
        window.haptic(10);
        const nav = document.getElementById('sidebarNav');
        const overlay = document.getElementById('sidebarOverlay');
        if (!nav) { console.error("[Navigation] sidebarNav element not found!"); return; }

        if (window.innerWidth > 1024) {
            document.body.classList.toggle('sidebar-collapsed');
        } else {
            const isActive = nav.classList.toggle('active');
            if (overlay) overlay.classList.toggle('active', isActive);
        }
    };

    // Section navigation
    window.showSection = (sectionId) => {
        if (window.haptic) window.haptic(10);
        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(`sec-${sectionId}`);
        if (target) {
            target.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        document.querySelectorAll('.bottom-nav .nav-item').forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-section') === sectionId);
        });
        document.querySelectorAll('.nav-links .nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-section') === sectionId);
        });
        const nav = document.getElementById('sidebarNav');
        if (nav && nav.classList.contains('active')) window.toggleRiderSidebar();
        if (window.lucide) window.lucide.createIcons({ root: target || document.body });
        if (sectionId === 'active' && window.activeOrderData) {
            setTimeout(() => window.initActiveMap(window.activeOrderData), 200);
        } else if (sectionId === 'active') {
            setTimeout(() => window.initDefaultMap(), 200);
        }
    };

    // Toast notification
    window.showToast = (msg, type = "info") => {
        const toast = document.createElement('div');
        const bgColor = type === 'error' ? '#EF4444' : (type === 'success' ? '#10B981' : '#1E293B');
        toast.style.cssText = `position:fixed; bottom:100px; left:50%; transform:translateX(-50%); background:${bgColor}; color:white; padding:12px 24px; border-radius:30px; font-weight:700; z-index:9999; text-transform:uppercase; text-align:center; white-space:nowrap; box-shadow:0 4px 15px rgba(0,0,0,0.2);`;
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    // Confirm dialog
    window.showConfirm = (msg, title = "Confirm") => {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center;';
            overlay.innerHTML = `
                <div style="background:#1c1c1c; border:1px solid rgba(255,255,255,0.1); border-radius:20px; padding:32px; max-width:360px; width:90%; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,0.5);">
                    <h3 style="color:#fff; margin:0 0 12px; font-size:18px; font-weight:700;">${title}</h3>
                    <p style="color:#aaa; font-size:14px; margin:0 0 24px;">${msg}</p>
                    <div style="display:flex; gap:12px; justify-content:center;">
                        <button class="confirm-no" style="flex:1; padding:12px; border-radius:12px; border:1px solid #333; background:transparent; color:#aaa; cursor:pointer; font-size:14px; font-weight:600;">Cancel</button>
                        <button class="confirm-yes" style="flex:1; padding:12px; border-radius:12px; border:none; background:#10B981; color:#fff; cursor:pointer; font-size:14px; font-weight:700;">Confirm</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            const cleanup = (val) => {
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity 0.2s';
                setTimeout(() => { overlay.remove(); resolve(val); }, 200);
            };
            overlay.querySelector('.confirm-yes').onclick = () => cleanup(true);
            overlay.querySelector('.confirm-no').onclick = () => cleanup(false);
            overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
        });
    };
}

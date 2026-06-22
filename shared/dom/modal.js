import { escapeHtml } from './escape.js';

/**
 * SHARED TOAST + CONFIRM — reusable UI primitives.
 *
 * Usage:
 *   import { showToast, showConfirm } from '../shared/dom/modal.js';
 *   showToast('Saved!', 'success');
 *   const ok = await showConfirm('Delete this order?');
 */

/**
 * Show a bottom-center toast notification.
 * @param {string} msg - Message text
 * @param {'info'|'success'|'error'|'warning'} type
 * @param {number} durationMs - Auto-dismiss delay (default 3000)
 */
export function showToast(msg, type = 'info', durationMs = 3000) {
    const toast = document.createElement('div');
    const colors = {
        error: '#EF4444',
        success: '#10B981',
        warning: '#F59E0B',
        info: '#1E293B'
    };
    const bg = colors[type] || colors.info;
    toast.style.cssText = `position:fixed; bottom:100px; left:50%; transform:translateX(-50%); background:${bg}; color:#fff; padding:12px 24px; border-radius:30px; font-weight:700; z-index:9999; text-transform:uppercase; text-align:center; white-space:nowrap; box-shadow:0 4px 15px rgba(0,0,0,0.2);`;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), durationMs);
}

/**
 * Show a centered confirm dialog. Returns a Promise resolving to true/false.
 * @param {string} msg - Body message
 * @param {string} title - Dialog title
 */
export function showConfirm(msg, title = 'Confirm') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center;';
        overlay.innerHTML = `
            <div style="background:#1c1c1c; border:1px solid rgba(255,255,255,0.1); border-radius:20px; padding:32px; max-width:360px; width:90%; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,0.5);">
                <h3 style="color:#fff; margin:0 0 12px; font-size:18px; font-weight:700;">${escapeHtml(title)}</h3>
                <p style="color:#aaa; font-size:14px; margin:0 0 24px;">${escapeHtml(msg)}</p>
                <div style="display:flex; gap:12px; justify-content:center;">
                    <button class="confirm-no" tabindex="0" style="flex:1; padding:12px; border-radius:12px; border:1px solid #333; background:transparent; color:#aaa; cursor:pointer; font-size:14px; font-weight:600;">Cancel</button>
                    <button class="confirm-yes" tabindex="1" style="flex:1; padding:12px; border-radius:12px; border:none; background:#10B981; color:#fff; cursor:pointer; font-size:14px; font-weight:700;">Confirm</button>
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
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); cleanup(true); }
            if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
        });
        overlay.querySelector('.confirm-yes').focus();
    });
}

/**
 * Trap keyboard focus inside a container element.
 * @param {HTMLElement} container - The element to trap focus within
 * @returns {Function} Cleanup function to remove the trap
 */
export function trapFocus(container) {
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const handler = (e) => {
        if (e.key !== 'Tab') return;
        const focusable = [...container.querySelectorAll(FOCUSABLE)];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    };
    container.addEventListener('keydown', handler);
    const firstEl = container.querySelector(FOCUSABLE);
    if (firstEl) firstEl.focus();
    return () => container.removeEventListener('keydown', handler);
}

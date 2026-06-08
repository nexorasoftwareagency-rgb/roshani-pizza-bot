/**
 * RIDER Notifications — render, mark read, clear, toggle sheet.
 */
import { db, ref, update, remove } from './firebase.js';
import { escapeHtml } from '../shared/dom/escape.js';

export function initNotifications() {
    window.renderNotifications = () => {
        const list = document.getElementById('notifList');
        const badge = document.getElementById('notifBadge');
        if (!list) return;
        const notifs = Object.entries(window.riderNotifications || {})
            .sort((a, b) => b[1].timestamp - a[1].timestamp);
        const unreadCount = notifs.filter(([id, n]) => !n.read).length;
        if (badge) {
            badge.innerText = unreadCount;
            badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }
        if (notifs.length === 0) {
            list.innerHTML = `<div class="empty-notif"><i data-lucide="bell-off"></i><p>No new notifications</p></div>`;
            if (window.lucide) window.lucide.createIcons({ root: list });
            return;
        }
        list.innerHTML = notifs.map(([id, n]) => `
            <div class="notif-item ${n.read ? '' : 'unread'}" data-action="markNotifRead" data-id="${escapeHtml(id)}">
                <div class="notif-icon ${escapeHtml(n.type || 'info')}">
                    <i data-lucide="${escapeHtml(n.icon || 'bell')}"></i>
                </div>
                <div class="notif-body">
                    <h4>${escapeHtml(n.title)}</h4>
                    <p>${escapeHtml(n.body)}</p>
                    <span class="notif-time">${new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                ${!n.read ? '<div class="unread-dot"></div>' : ''}
            </div>
        `).join('');
        if (window.lucide) window.lucide.createIcons({ root: list });
    };

    window.markNotifRead = async (id) => {
        if (!id || !window.currentUser?.profile?.id) return;
        try {
            await update(ref(db, `riders/${window.currentUser.profile.id}/notifications/${id}`), { read: true });
        } catch (e) { console.warn("[Rider Notif] Mark Read Failed:", e); }
    };

    window.clearAllNotifications = async () => {
        if (!window.currentUser?.profile?.id) return;
        if (!(await window.showConfirm("Clear all notifications?", "Confirm Clear"))) return;
        try {
            await remove(ref(db, `riders/${window.currentUser.profile.id}/notifications`));
            window.showToast("Notifications cleared", "success");
        } catch (e) { window.showToast("Failed to clear notifications", "error"); }
    };

    window.toggleNotifSheet = () => {
        const sheet = document.getElementById('notificationSheet');
        const overlay = document.querySelector('.sidebar-overlay');
        if (!sheet) return;
        const isVisible = sheet.classList.contains('active');
        sheet.classList.toggle('active');
        if (overlay) overlay.classList.toggle('active', !isVisible);
        if (!isVisible && window.renderNotifications) window.renderNotifications();
    };
}

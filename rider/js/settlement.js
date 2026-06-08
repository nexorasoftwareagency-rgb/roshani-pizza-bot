/**
 * RIDER Settlement history — view past cash settlements.
 */
import { auth, db, ref, get } from './firebase.js';
import { escapeHtml } from '../shared/dom/escape.js';

export function initSettlement() {
    window.openSettlementHistory = async () => {
        const modal = document.getElementById('settlementModal');
        const list = document.getElementById('settlementList');
        if (!modal || !list) return;
        modal.classList.add('active');
        list.innerHTML = '<div class="loader-spinner-small m-auto mt-20"></div><p class="text-center text-muted-small mt-10">Fetching records...</p>';
        try {
            const sRef = ref(db, `settlements/${auth.currentUser.uid}`);
            const snap = await get(sRef);
            if (!snap.exists()) {
                list.innerHTML = '<div class="glass-panel text-center p-40 mt-20"><p class="text-muted">No settlement records found.</p></div>';
                return;
            }
            const data = snap.val();
            const settlements = Object.keys(data).map(key => ({ id: key, ...data[key] }));
            settlements.sort((a, b) => b.timestamp - a.timestamp);
            list.innerHTML = settlements.map(s => `
                <div class="order-card-compact mb-10">
                    <div class="card-header">
                        <div class="order-meta">
                            <span class="order-id-badge" style="background: var(--success-bg); color: var(--success);">SETTLED</span>
                            <span class="text-muted-small">${new Date(s.timestamp).toLocaleDateString()}</span>
                        </div>
                        <div class="earn-badge" style="color: var(--success);">₹${s.amountCollected.toLocaleString()}</div>
                    </div>
                    <div class="address-line">
                        <i data-lucide="user-check"></i>
                        <span class="text-muted-small">Admin: ${escapeHtml(s.settledByAdmin)}</span>
                    </div>
                    <div class="address-line">
                        <i data-lucide="package-check"></i>
                        <span class="text-muted-small">Cleared ${s.ordersClearedCount} orders</span>
                    </div>
                </div>
            `).join('');
            if (window.lucide) window.lucide.createIcons({ root: list });
        } catch (e) {
            console.error(e);
            list.innerHTML = '<div class="glass-panel text-center p-40 mt-20"><p class="text-danger">Failed to load settlements.</p></div>';
        }
    };

    window.closeSettlementHistory = () => {
        document.getElementById('settlementModal').classList.remove('active');
    };
}

import { Outlet, get, remove } from '../firebase.js';
import { ui } from '../ui.js';
import {
    showToast,
    logAudit,
    escapeHtml,
    formatDate,
    haptic,
    getSkeletonRows
} from '../utils.js';
import { showBulkDeleteConfirm } from '../ui-utils.js';

export async function loadLostSales() {
    console.log('[Lost Sales] Loading records...');
    const tbody = document.getElementById('lostSalesTableBody');
    const revenueBadge = document.querySelector('#lostSalesTotalRevenue span');
    if (!tbody) return;

    tbody.innerHTML = getSkeletonRows(5, 5);

    try {
        const lostRef = Outlet.ref('logs/lostSales');
        console.log(`[Lost Sales] Fetching from path: ${lostRef.toString()}`);
        const snap = await get(lostRef);
        const data = snap.val();

        tbody.innerHTML = '';
        let totalLost = 0;

        if (!data) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:80px; color:var(--text-muted);">
            <div class="mb-14" style="font-size:32px;">🛍️ </div>
            <strong>No lost sales found!</strong><br>All your customers are reaching the finish line.
        </td></tr>`;
            if (revenueBadge) revenueBadge.innerText = `₹0`;
            return;
        }

        const sorted = Object.entries(data).sort((a, b) => (b[1].cancelledAt || 0) - (a[1].cancelledAt || 0));

        sorted.forEach(([id, record]) => {
            const val = record.total || 0;
            totalLost += val;

            const rawItems = record.cart || (Array.isArray(record.items) ? record.items : Object.values(record.items || {}));
            const items = rawItems.length ? rawItems : (record.item ? [{ name: record.item, size: record.size }] : []);
            const itemsStr = items.map(i => `${i.name || i.item} (${i.size || 'N/A'})`).join(', ');
            const ts = formatDate(record.cancelledAt);
            const source = record.sourceStep || 'Checkout';

            const phone = record.phone || 'N/A';
            const whatsappLink = `https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}`;

            const tr = document.createElement('tr');
            tr.className = 'premium-row-v4';
            tr.innerHTML = `
            <td data-label="Date" class="p-l-25">
                <div class="identity-info-v4">
                    <span class="name">${escapeHtml(ts)}</span>
                    <span class="sub">ID: ...${escapeHtml(id.slice(-6))}</span>
                </div>
            </td>
            <td data-label="Customer">
                <div class="identity-info-v4">
                    <span class="name">${escapeHtml(record.customerName || 'Guest')}</span>
                    <a href="${escapeHtml(whatsappLink)}" target="_blank" rel="noopener noreferrer" class="text-primary font-bold" style="font-size:12px; text-decoration:none;">📱 ${escapeHtml(phone)}</a>
                </div>
            </td>
            <td data-label="Step">
                <span class="status-pill" style="background:rgba(0,0,0,0.05); color:var(--text-dark); border:1px solid rgba(0,0,0,0.1); font-size:10px;">
                    ${escapeHtml(source)}
                </span>
            </td>
            <td data-label="Items" style="max-width:250px;">
                <div class="identity-info-v4">
                    <span class="sub text-truncate-2" title="${escapeHtml(itemsStr)}">${escapeHtml(itemsStr)}</span>
                </div>
            </td>
            <td data-label="Value" class="p-r-25 text-right">
                <span class="font-bold text-orange" style="font-size:16px;">₹${val}</span>
            </td>
        `;
            tbody.appendChild(tr);
        });

        if (revenueBadge) revenueBadge.innerText = `₹${totalLost.toLocaleString()}`;
    } catch (e) {
        console.error('Load Lost Sales Error:', e);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:red;">Error loading data. Check console.</td></tr>`;
    }
}

export async function clearLostSales() {
    if (!(await showBulkDeleteConfirm('Lost Sales'))) return;

    haptic(20);
    try {
        await remove(Outlet.ref('logs/lostSales'));
        logAudit('Maintenance', 'Cleared All Lost Sales Logs', 'Global');
        showToast('Logs cleared successfully', 'success');
        loadLostSales();
    } catch (e) {
        console.error('Clear Logs Error:', e);
        showToast('Failed to clear logs', 'error');
    }
}

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

let _allLostSales = [];

export async function loadLostSales() {
    const tbody = document.getElementById('lostSalesTableBody');
    const revenueBadge = document.querySelector('#lostSalesTotalRevenue span');
    const countBadge = document.getElementById('lostSalesCount');
    if (!tbody) return;

    tbody.innerHTML = getSkeletonRows(5, 9);

    try {
        const lostRef = Outlet.ref('logs/lostSales');
        const snap = await get(lostRef);
        const data = snap.val();

        if (!data) {
            _allLostSales = [];
            _renderLostSales(tbody, revenueBadge, countBadge, 'all');
            return;
        }

        _allLostSales = Object.entries(data).map(([id, r]) => ({ id, ...r }));
        _allLostSales.sort((a, b) => {
            const tsA = a.cancelledAt ? new Date(a.cancelledAt).getTime() : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
            const tsB = b.cancelledAt ? new Date(b.cancelledAt).getTime() : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
            return tsB - tsA;
        });

        const filter = document.getElementById('lostSalesOutletFilter')?.value || 'all';
        _renderLostSales(tbody, revenueBadge, countBadge, filter);

        document.getElementById('lostSalesOutletFilter')?.addEventListener('change', (e) => {
            _renderLostSales(tbody, revenueBadge, countBadge, e.target.value);
        });
    } catch (e) {
        console.error('Load Lost Sales Error:', e);
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px; color:red;">Error loading data. Check console.</td></tr>`;
    }
}

function _renderLostSales(tbody, revenueBadge, countBadge, outletFilter) {
    tbody.innerHTML = '';
    let totalLost = 0;
    let count = 0;

    const filtered = outletFilter === 'all'
        ? _allLostSales
        : _allLostSales.filter(r => (r.outlet || 'pizza') === outletFilter);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:80px; color:var(--text-muted);">
            <div class="mb-14" style="font-size:32px;">🛍️</div>
            <strong>No lost sales found!</strong><br>All your customers are reaching the finish line.
        </td></tr>`;
        if (revenueBadge) revenueBadge.innerText = '₹0';
        if (countBadge) countBadge.innerText = '0';
        return;
    }

    filtered.forEach(record => {
        const id = record.id;
        const val = record.total || 0;
        totalLost += val;
        count++;

        const rawItems = record.cart || (Array.isArray(record.items) ? record.items : Object.values(record.items || {}));
        const items = rawItems.length ? rawItems : (record.item ? [{ name: record.item, size: record.size }] : []);
        const itemsStr = items.map(i => {
            const qty = i.quantity || 1;
            const price = i.total || (i.unitPrice || 0) * qty;
            return `${i.name || i.item}(${i.size || '-'}) x${qty} ₹${price}`;
        }).join(', ');

        const tsRaw = record.cancelledAt || record.timestamp || '';
        const ts = tsRaw ? formatDate(tsRaw) : '—';
        const phone = record.phone || 'N/A';
        const cleanPhone = phone.replace(/\D/g, '').slice(-10);
        const whatsappLink = `https://wa.me/91${cleanPhone}`;
        const outlet = (record.outlet || 'pizza').toUpperCase();
        const outletEmoji = record.outlet === 'cake' ? '🎂' : '🍕';
        const subtotal = record.subtotal || val;
        const deliveryFee = record.deliveryFee || 0;
        const discount = record.discount || 0;
        const discountLabel = record.discountLabel || '';
        const address = record.address || '—';

        const tr = document.createElement('tr');
        tr.className = 'premium-row-v4';
        tr.innerHTML = `
            <td data-label="Date" class="p-l-25">
                <div class="identity-info-v4">
                    <span class="name">${escapeHtml(ts)}</span>
                    <span class="sub">...${escapeHtml(id.slice(-6))}</span>
                </div>
            </td>
            <td data-label="Customer">
                <div class="identity-info-v4">
                    <span class="name">${escapeHtml(record.customerName || 'Guest')}</span>
                    <span class="sub text-truncate" title="${escapeHtml(address)}">📍 ${escapeHtml(address)}</span>
                </div>
            </td>
            <td data-label="Phone">
                <a href="${escapeHtml(whatsappLink)}" target="_blank" rel="noopener noreferrer" class="text-primary font-bold" style="font-size:12px; text-decoration:none;">📱 ${escapeHtml(phone)}</a>
            </td>
            <td data-label="Outlet">
                <span class="status-pill" style="background:rgba(0,0,0,0.04); color:var(--text-dark); border:1px solid rgba(0,0,0,0.08); font-size:10px;">
                    ${outletEmoji} ${outlet}
                </span>
            </td>
            <td data-label="Items" style="max-width:280px;">
                <div class="identity-info-v4">
                    <span class="sub text-truncate-2" title="${escapeHtml(itemsStr)}">${escapeHtml(itemsStr || '—')}</span>
                </div>
            </td>
            <td data-label="Subtotal" class="text-right">
                <span style="font-size:13px;">₹${subtotal}</span>
            </td>
            <td data-label="Delivery" class="text-right">
                <span style="font-size:13px;">${deliveryFee ? '₹' + deliveryFee : '—'}</span>
            </td>
            <td data-label="Discount" class="text-right">
                ${discount ? `<span style="font-size:12px; color:var(--primary);">-₹${discount}${discountLabel ? ' (' + escapeHtml(discountLabel) + ')' : ''}</span>` : '<span style="font-size:12px; color:var(--text-muted);">—</span>'}
            </td>
            <td data-label="Value" class="p-r-25 text-right">
                <span class="font-bold text-orange" style="font-size:16px;">₹${val}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (revenueBadge) revenueBadge.innerText = `₹${totalLost.toLocaleString()}`;
    if (countBadge) countBadge.innerText = String(count);
}

export async function clearLostSales() {
    if (!(await showBulkDeleteConfirm('Lost Sales'))) return;

    haptic(20);
    try {
        await remove(Outlet.ref('logs/lostSales'));
        _allLostSales = [];
        logAudit('Maintenance', 'Cleared All Lost Sales Logs', 'Global');
        showToast('Logs cleared successfully', 'success');
        loadLostSales();
    } catch (e) {
        console.error('Clear Logs Error:', e);
        showToast('Failed to clear logs', 'error');
    }
}

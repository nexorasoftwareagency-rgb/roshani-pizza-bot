import { Outlet, get, remove } from '../firebase.js';
import { ui } from '../ui.js';
import { showToast, logAudit, escapeHtml, formatDate, haptic, getSkeletonDivs } from '../utils.js';
import { showBulkDeleteConfirm } from '../ui-utils.js';
import { createGrid, updateGridData, GRID_DEFAULTS } from '../tabulator-setup.js';

let _allLostSales = [];
let _grid = null;
let _outletFilter = 'all';

function buildGrid() {
    const el = document.getElementById('lostSalesTableBody');
    if (!el) return;
    el.innerHTML = '';

    _grid = new Tabulator("#lostSalesTableBody", {
        ...GRID_DEFAULTS,
        pagination: false,
        placeholder: '<div style="padding:40px; color:#94a3b8;">🛍️ No lost sales found!</div>',
        columns: [
            { formatter: "rownum", hozAlign: "center", width: 45, headerSort: false },
            {
                title: "Date & Time",
                field: "cancelledAt",
                width: 160,
                formatter: function(cell) {
                    const d = cell.getRow().getData();
                    const ts = d.cancelledAt || d.timestamp || '';
                    const display = ts ? formatDate(ts) : '—';
                    const id = d._id || '';
                    return `<div><div style="font-weight:600;">${escapeHtml(display)}</div><div style="font-size:11px;color:#94a3b8;">...${escapeHtml(id.slice(-6))}</div></div>`;
                }
            },
            {
                title: "Customer",
                field: "customerName",
                width: 180,
                formatter: function(cell) {
                    const d = cell.getRow().getData();
                    const addr = d.address || '—';
                    const truncated = addr.length > 25 ? addr.substring(0, 25) + '…' : addr;
                    return `<div><div style="font-weight:600;">${escapeHtml(d.customerName || 'Guest')}</div><div style="font-size:11px;color:#94a3b8;" title="${escapeHtml(addr)}">📍 ${escapeHtml(truncated)}</div></div>`;
                }
            },
            {
                title: "Phone",
                field: "phone",
                width: 130,
                formatter: function(cell) {
                    const val = cell.getValue() || '';
                    const clean = val.replace(/\D/g, '').slice(-10);
                    if (!clean || clean.length < 10) return '—';
                    return `<a href="https://wa.me/91${clean}" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:none;font-weight:600;font-size:12px;">📱 ${escapeHtml(val)}</a>`;
                }
            },
            {
                title: "Outlet",
                field: "outlet",
                width: 90,
                hozAlign: "center",
                formatter: function(cell) {
                    const val = (cell.getValue() || 'pizza').toUpperCase();
                    const emoji = val === 'CAKE' ? '🎂' : '🍕';
                    return `<span style="font-size:12px;">${emoji} ${val}</span>`;
                }
            },
            {
                title: "Items",
                field: "itemsStr",
                width: 260,
                formatter: function(cell) {
                    const val = cell.getValue() || '—';
                    const truncated = val.length > 35 ? val.substring(0, 35) + '…' : val;
                    return `<span title="${escapeHtml(val)}" style="color:#475569;font-size:12px;">${escapeHtml(truncated)}</span>`;
                }
            },
            {
                title: "Subtotal",
                field: "subtotal",
                width: 100,
                hozAlign: "right",
                formatter: function(cell) { return `₹${cell.getValue() || 0}`; },
                sorter: "number"
            },
            {
                title: "Delivery",
                field: "deliveryFee",
                width: 90,
                hozAlign: "right",
                formatter: function(cell) {
                    const val = cell.getValue();
                    return val ? `₹${val}` : '<span style="color:#94a3b8;">—</span>';
                }
            },
            {
                title: "Discount",
                field: "discount",
                width: 110,
                hozAlign: "right",
                formatter: function(cell) {
                    const d = cell.getRow().getData();
                    const val = d.discount || 0;
                    if (!val) return '<span style="color:#94a3b8;">—</span>';
                    const label = d.discountLabel ? ` (${escapeHtml(d.discountLabel)})` : '';
                    return `<span style="color:#4472C4;font-size:12px;">-₹${val}${label}</span>`;
                }
            },
            {
                title: "Potential Value",
                field: "total",
                width: 130,
                hozAlign: "right",
                formatter: function(cell) {
                    const val = parseInt(cell.getValue()) || 0;
                    const el = cell.getElement();
                    if (val >= 500) el.classList.add('cell-value-high');
                    else if (val >= 200) el.classList.add('cell-value-mid');
                    else el.classList.add('cell-value-low');
                    return `₹${val.toLocaleString()}`;
                },
                sorter: "number"
            }
        ]
    });
    _grid._pendingData = null;
    _grid._ready = false;
    const self = _grid;
    _grid.on("tableBuilt", () => {
        requestAnimationFrame(() => {
            self._ready = true;
            if (self._pendingData) {
                self.replaceData(self._pendingData);
                self._pendingData = null;
            }
        });
    });
}

export async function loadLostSales() {
    const tbody = document.getElementById('lostSalesTableBody');
    const revenueBadge = document.querySelector('#lostSalesTotalRevenue span');
    const countBadge = document.getElementById('lostSalesCount');
    if (!tbody) return;

    if (_grid) { _grid.destroy(); _grid = null; }
    tbody.innerHTML = getSkeletonDivs(5);

    try {
        const lostRef = Outlet.ref('logs/lostSales');
        const snap = await get(lostRef);
        const data = snap.val();

        if (!data) {
            _allLostSales = [];
            _renderLostSales(tbody, revenueBadge, countBadge);
            return;
        }

        _allLostSales = Object.entries(data).map(([id, r]) => {
            const rawItems = r.cart || (Array.isArray(r.items) ? r.items : Object.values(r.items || {}));
            const items = rawItems.length ? rawItems : (r.item ? [{ name: r.item, size: r.size }] : []);
            const itemsStr = items.map(i => {
                const qty = i.quantity || 1;
                const price = i.total || (i.unitPrice || 0) * qty;
                return `${i.name || i.item}(${i.size || '-'}) x${qty} ₹${price}`;
            }).join(', ');
            return { _id: id, id, ...r, itemsStr };
        });
        _allLostSales.sort((a, b) => {
            const tsA = a.cancelledAt ? new Date(a.cancelledAt).getTime() : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
            const tsB = b.cancelledAt ? new Date(b.cancelledAt).getTime() : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
            return tsB - tsA;
        });

        _renderLostSales(tbody, revenueBadge, countBadge);

        document.getElementById('lostSalesOutletFilter')?.addEventListener('change', (e) => {
            _outletFilter = e.target.value;
            _renderLostSales(tbody, revenueBadge, countBadge);
        });
    } catch (e) {
        console.error('Load Lost Sales Error:', e);
        tbody.innerHTML = `<div style="text-align:center; padding:40px; color:#ef4444;">⚠️ Error loading data</div>`;
    }
}

function _renderLostSales(tbody, revenueBadge, countBadge) {
    const filtered = _outletFilter === 'all'
        ? _allLostSales
        : _allLostSales.filter(r => (r.outlet || 'pizza') === _outletFilter);

    let totalLost = 0;
    filtered.forEach(r => { totalLost += (r.total || 0); });

    if (revenueBadge) revenueBadge.innerText = `₹${totalLost.toLocaleString()}`;
    if (countBadge) countBadge.innerText = String(filtered.length);

    if (!_grid) buildGrid();
    if (_grid) updateGridData(_grid, filtered);
}

export async function clearLostSales() {
    if (!(await showBulkDeleteConfirm('Lost Sales'))) return;
    haptic(20);
    try {
        const outlet = (window.currentOutlet || 'pizza').toLowerCase();
        const lostSnap = await get(Outlet.ref('logs/lostSales'));
        const updates = {};
        lostSnap.forEach(child => {
            const record = child.val();
            if ((record.outlet || 'pizza') === outlet) {
                updates[child.key] = null;
            }
        });
        if (Object.keys(updates).length > 0) {
            await remove(Outlet.ref('logs/lostSales'));
        }
        _allLostSales = [];
        logAudit('Maintenance', `Cleared Lost Sales Logs for ${outlet}`, outlet);
        showToast('Logs cleared successfully', 'success');
        loadLostSales();
    } catch (e) {
        console.error('Clear Logs Error:', e);
        showToast('Failed to clear logs', 'error');
    }
}

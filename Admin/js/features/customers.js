import { Outlet, get } from '../firebase.js';
import { escapeHtml, getSkeletonDivs } from '../utils.js';
import { logger } from '../utils/logger.js';
import { createGrid, updateGridData, GRID_DEFAULTS, PAGINATION_DEFAULTS, loadTabulator } from '../tabulator-setup.js';

let _grid = null;

function buildGrid(data) {
    await loadTabulator();
    const el = document.getElementById("customersTableBody");
    if (!el) return;
    el.innerHTML = '';

    _grid = new Tabulator("#customersTableBody", {
        ...GRID_DEFAULTS,
        ...PAGINATION_DEFAULTS,
        paginationSize: 25,
        data: data || [],
        placeholder: '<div style="padding:40px; color:#94a3b8;">👥 No customers found</div>',
        columns: [
            { formatter: "rownum", hozAlign: "center", width: 45, headerSort: false },
            {
                title: "Customer",
                field: "name",
                width: 200,
                formatter: function(cell) {
                    const d = cell.getRow().getData();
                    return `<div style="display:flex;align-items:center;gap:8px;">
                        <div style="width:30px;height:30px;border-radius:50%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:13px;">👤</div>
                        <div><div style="font-weight:600;">${escapeHtml(d.name)}</div><div style="font-size:11px;color:#94a3b8;">Joined: ${escapeHtml(d.joined)}</div></div>
                    </div>`;
                }
            },
            {
                title: "WhatsApp",
                field: "displayPhone",
                width: 140,
                formatter: function(cell) {
                    const phone = cell.getRow().getData().phoneClean;
                    if (!phone || phone.length < 10) return '—';
                    return `<a href="https://wa.me/91${phone}" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:none;font-weight:600;font-size:12px;">📱 ${escapeHtml(cell.getValue())}</a>`;
                }
            },
            {
                title: "Address",
                field: "address",
                width: 220,
                formatter: function(cell) {
                    const d = cell.getRow().getData();
                    const full = d.addressFull || '';
                    const display = d.address || '—';
                    let html = `<span title="${escapeHtml(full)}" style="color:#475569;font-size:12px;">${escapeHtml(display)}</span>`;
                    if (d.locationLink) {
                        html += ` <a href="${escapeHtml(d.locationLink)}" target="_blank" rel="noopener" style="color:#2563eb;font-size:10px;font-weight:700;">VIEW MAP</a>`;
                    }
                    return html;
                }
            },
            {
                title: "Orders",
                field: "orderCount",
                width: 90,
                hozAlign: "center",
                formatter: function(cell) {
                    const val = cell.getValue();
                    return `<div style="text-align:center;"><div style="font-weight:700;color:#4472C4;">${val}</div><div style="font-size:10px;color:#94a3b8;">Purchases</div></div>`;
                },
                sorter: "number"
            },
            {
                title: "Value (₹)",
                field: "ltv",
                width: 120,
                hozAlign: "right",
                formatter: function(cell) {
                    return `<div style="text-align:right;"><div style="font-weight:700;font-size:14px;">₹${Number(cell.getValue()).toLocaleString()}</div><div style="font-size:10px;color:#94a3b8;">LTV</div></div>`;
                },
                sorter: "number"
            }
        ]
    });
}

export async function loadCustomers() {
    const el = document.getElementById("customersTableBody");
    if (!el) {
        logger.warn('CUSTOMERS', 'Customers table not found, skipping load');
        return;
    }

    if (_grid) { _grid.destroy(); _grid = null; }
    el.innerHTML = getSkeletonDivs(5);
    logger.info('CUSTOMERS', 'Loading customers from Firebase...');

    try {
        const [custSnap, orderSnap] = await Promise.all([
            get(Outlet.ref("customers")),
            get(Outlet.ref("orders"))
        ]);
        const orders = [];
        orderSnap.forEach(o => { orders.push(o.val()); });

        const customers = [];
        custSnap.forEach(child => {
            const c = child.val();
            const phone = child.key;
            const myOrders = orders.filter(o => o.phone === phone);
            const orderCount = myOrders.length;
            const ltv = myOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
            customers.push({
                name: c.name || 'Anonymous',
                joined: c.registeredAt ? new Date(c.registeredAt).toLocaleDateString() : 'N/A',
                displayPhone: phone,
                phoneClean: phone.replace(/\D/g, "").slice(-10),
                address: c.address ? (c.address.length > 30 ? c.address.substring(0, 30) + "..." : c.address) : "Counter Sale / Guest",
                addressFull: c.address || '',
                locationLink: c.locationLink || '',
                orderCount, ltv
            });
        });

        buildGrid(customers);

        logger.success('CUSTOMERS', `Loaded ${customers.length} customers`);
    } catch (e) {
        console.error('[Customers] Load error:', e);
        el.innerHTML = `<div style="padding:40px; text-align:center; color:#ef4444;">⚠️ Error loading customers</div>`;
    }
}

export function filterCustomers(searchTerm) {
    if (!_grid) return;
    const term = (searchTerm || '').trim();
    if (!term) {
        _grid.clearFilter();
    } else {
        _grid.setFilter([
            { field: "name", type: "like", value: term },
            { field: "displayPhone", type: "like", value: term },
            { field: "address", type: "like", value: term }
        ]);
    }
}

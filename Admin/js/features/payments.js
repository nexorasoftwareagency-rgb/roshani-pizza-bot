/**
 * PAYMENTS TAB — Excel-like Tabulator Grid
 * Separate module to keep orders.js clean.
 */

import { escapeHtml } from '../utils.js';
import { createGrid, updateGridData, GRID_DEFAULTS, PAGINATION_DEFAULTS } from '../tabulator-setup.js';

let _grid = null;

function buildGrid(data) {
    const el = document.getElementById('paymentsTable');
    if (!el) return;
    el.innerHTML = '';

    _grid = new Tabulator("#paymentsTable", {
        data: data || [],
        ...GRID_DEFAULTS,
        ...PAGINATION_DEFAULTS,
        paginationSize: 25,
        placeholder: '<div style="padding:40px; color:#94a3b8;">💳 No payments found</div>',
        columns: [
            { formatter: "rownum", hozAlign: "center", width: 45, headerSort: false },
            {
                title: "Order ID",
                field: "orderId",
                width: 140,
                formatter: function(cell) {
                    const d = cell.getRow().getData();
                    const id = d.orderId || (d.id ? d.id.slice(-5) : 'N/A');
                    const date = d.createdAt ? new Date(d.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—';
                    return `<div style="display:flex;align-items:center;gap:8px;">
                        <div style="width:30px;height:30px;border-radius:8px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:12px;">📅</div>
                        <div><div style="font-weight:700;">#${escapeHtml(id)}</div><div style="font-size:11px;color:#94a3b8;">${date}</div></div>
                    </div>`;
                }
            },
            {
                title: "Customer",
                field: "customerName",
                width: 170,
                formatter: function(cell) {
                    const d = cell.getRow().getData();
                    return `<div><div style="font-weight:600;">${escapeHtml(d.customerName || 'Guest')}</div><div style="font-size:11px;color:#94a3b8;">${escapeHtml(d.phone || '')}</div></div>`;
                }
            },
            {
                title: "Method",
                field: "paymentMethod",
                width: 110,
                hozAlign: "center",
                formatter: function(cell) {
                    const val = cell.getValue() || 'Cash';
                    return `<span class="badge-payment" data-method="${val.toLowerCase()}">${escapeHtml(val)}</span>`;
                }
            },
            {
                title: "Status",
                field: "status",
                width: 130,
                hozAlign: "center",
                formatter: function(cell) {
                    const val = cell.getValue() || 'Unknown';
                    const el = cell.getElement();
                    const cls = 'cell-status-' + val.toLowerCase().replace(/\s+/g, '-');
                    el.classList.add(cls);
                    return val;
                }
            },
            {
                title: "Amount (₹)",
                field: "total",
                width: 120,
                hozAlign: "right",
                formatter: function(cell) {
                    return `<span style="font-weight:700;font-size:15px;">₹${Number(cell.getValue() || 0).toLocaleString()}</span>`;
                },
                sorter: "number"
            }
        ]
    });
}

/**
 * Render payments grid from orders data.
 * Called from orders.js renderOrders() when activeTab === 'payments'.
 */
export function renderPayments(orders) {
    buildGrid(orders);
}

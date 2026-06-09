/**
 * ROSHANI ERP | FEEDBACK MANAGEMENT MODULE
 * Handles customer feedback retrieval and rendering.
 */

import { Outlet, onValue } from '../firebase.js';
import { escapeHtml, getSkeletonRows } from '../utils.js';
import { createGrid, updateGridData, GRID_DEFAULTS } from '../tabulator-setup.js';

let _feedbackUnsub = null;
let _grid = null;

function buildGrid() {
    const el = document.getElementById('feedbackTableBody');
    if (!el) return;
    el.innerHTML = '';

    _grid = new Tabulator("#feedbackTableBody", {
        ...GRID_DEFAULTS,
        pagination: false,
        placeholder: '<div style="padding:40px; color:#94a3b8;">💬 No feedback received yet.</div>',
        columns: [
            { formatter: "rownum", hozAlign: "center", width: 45, headerSort: false },
            {
                title: "Date",
                field: "timestamp",
                width: 160,
                formatter: function(cell) {
                    const val = cell.getValue();
                    if (!val) return 'N/A';
                    const d = new Date(val);
                    if (isNaN(d.getTime())) return 'N/A';
                    return `<div><div style="font-weight:600;">${d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</div><div style="font-size:11px;color:#94a3b8;">Log Time</div></div>`;
                }
            },
            {
                title: "Order ID",
                field: "orderId",
                width: 120,
                formatter: function(cell) {
                    const val = cell.getValue() || 'N/A';
                    return `<div style="display:flex;align-items:center;gap:6px;"><div style="width:28px;height:28px;border-radius:6px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">#</div><span style="font-weight:600;">${escapeHtml(val)}</span></div>`;
                }
            },
            {
                title: "Customer",
                field: "customerName",
                width: 170,
                formatter: function(cell) {
                    const d = cell.getRow().getData();
                    const name = d.customerName || 'Guest';
                    const phone = d.phone || 'Anonymous';
                    return `<div><div style="font-weight:600;">${escapeHtml(name)}</div><div style="font-size:11px;color:#94a3b8;">${escapeHtml(phone)}</div></div>`;
                }
            },
            {
                title: "Rating",
                field: "rating",
                width: 130,
                hozAlign: "center",
                formatter: function(cell) {
                    const val = parseInt(cell.getValue()) || 0;
                    const el = cell.getElement();
                    if (val <= 2) el.classList.add('cell-rating-low');
                    else if (val <= 3) el.classList.add('cell-rating-mid');
                    else el.classList.add('cell-rating-high');
                    return `<div style="text-align:center;"><div style="font-size:14px;">${'⭐'.repeat(val)}</div><div style="font-size:11px;color:#475569;">${val}/5 Score</div></div>`;
                },
                sorter: "number"
            },
            {
                title: "Feedback",
                field: "reason",
                width: 280,
                formatter: function(cell) {
                    const d = cell.getRow().getData();
                    const reason = d.reason || d.feedback || 'General Rating';
                    const comment = d.comment || '';
                    let html = `<div style="font-weight:600;color:#4472C4;font-size:13px;">${escapeHtml(reason)}</div>`;
                    if (comment) {
                        html += `<div style="font-size:12px;color:#64748b;font-style:italic;margin-top:2px;">"${escapeHtml(comment)}"</div>`;
                    }
                    return html;
                }
            }
        ]
    });
    _grid._pendingData = null;
    _grid._ready = false;
    _grid.on("tableBuilt", () => {
        requestAnimationFrame(() => {
            _grid._ready = true;
            if (_grid._pendingData) {
                _grid.replaceData(_grid._pendingData);
                _grid._pendingData = null;
            }
        });
    });
}

export function loadFeedbacks() {
    const tableBody = document.getElementById('feedbackTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = getSkeletonRows(5, 5);
    if (_grid) { _grid.destroy(); _grid = null; }
    cleanupFeedbacks();

    _feedbackUnsub = onValue(Outlet.ref("feedbacks"), snap => {
        const feedbacks = [];
        snap.forEach(child => {
            feedbacks.push({ id: child.key, ...child.val() });
        });

        feedbacks.sort((a, b) => {
            const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            return dateB - dateA;
        });

        if (!_grid) buildGrid();
        if (_grid) updateGridData(_grid, feedbacks);
    });
}

export function cleanupFeedbacks() {
    console.log("[Performance] Cleaning up Feedback listeners...");
    if (_feedbackUnsub) {
        _feedbackUnsub();
        _feedbackUnsub = null;
    }
}

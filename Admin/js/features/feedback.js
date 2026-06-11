/**
 * ROSHANI ERP | FEEDBACK MANAGEMENT MODULE
 * Handles customer feedback retrieval and rendering.
 */

import { Outlet, onValue, isConnected, onConnectionChange } from '../firebase.js';
import { escapeHtml, getSkeletonDivs } from '../utils.js';
import { createGrid, updateGridData, GRID_DEFAULTS } from '../tabulator-setup.js';

let _feedbackUnsub = null;
let _grid = null;
let _connUnsub = null;

function buildGrid(data) {
    const el = document.getElementById('feedbackTableBody');
    if (!el) return;
    el.innerHTML = '';

    _grid = new Tabulator("#feedbackTableBody", {
        data: data || [],
        ...GRID_DEFAULTS,
        pagination: false,
        placeholder: '<div style="padding:40px; color:#94a3b8;">ðŸ’¬ No feedback received yet.</div>',
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
                    return `<div style="text-align:center;"><div style="font-size:14px;">${'â­'.repeat(val)}</div><div style="font-size:11px;color:#475569;">${val}/5 Score</div></div>`;
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
}

export function loadFeedbacks() {
    const tableBody = document.getElementById('feedbackTableBody');
    if (!tableBody) return;

    if (_grid) { _grid.destroy(); _grid = null; }
    if (_connUnsub) { _connUnsub(); _connUnsub = null; }
    cleanupFeedbacks();

    if (!isConnected()) {
        tableBody.innerHTML = '<div class="offline-placeholder"><div class="offline-icon">📡</div><h4>Waiting for connection</h4><p>Feedback data will load automatically when the connection is restored.</p></div>';
        if (!_connUnsub) _connUnsub = onConnectionChange(function _retryFb(online) {
            if (!online) return;
            if (_connUnsub) { _connUnsub(); _connUnsub = null; }
            cleanupFeedbacks();
            loadFeedbacks();
        });
        return;
    }

    tableBody.innerHTML = getSkeletonDivs(5);

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

        try {
            if (!_grid) buildGrid(feedbacks);
            else _grid.replaceData(feedbacks);
        } catch (gridErr) {
            console.error('[Feedback] Grid error:', gridErr);
            const tb = document.getElementById('feedbackTableBody');
            if (tb) tb.innerHTML = '<div style=padding:40px;text-align:center;color:#ef4444;>Error loading feedback grid</div>';
        }
    }, (error) => {
        console.error('[Feedback] Firebase read error:', error);
        const tb = document.getElementById('feedbackTableBody');
        if (tb) tb.innerHTML = '<div style=padding:40px;text-align:center;color:#ef4444;>Failed to load feedback data</div>';
    });
}

export function cleanupFeedbacks() {
    console.log("[Performance] Cleaning up Feedback listeners...");
    if (_feedbackUnsub) {
        _feedbackUnsub();
        _feedbackUnsub = null;
    }
    if (_connUnsub) { _connUnsub(); _connUnsub = null; }
}

// =============================
// TABULATOR EXCEL-LIKE GRID SETUP
// Shared defaults, formatters, and color rules
// =============================

import { escapeHtml } from '../shared/dom/escape.js';

// --- EXCEL-LIKE DEFAULTS ---
export const GRID_DEFAULTS = {
    layout: "fitColumns",
    responsiveLayout: "hide",
    placeholder: '<div style="padding:40px; color:#94a3b8;">📊 No data available</div>',
    headerSortTristate: true,
    movableColumns: true,
    resizableColumns: true,
    selectable: true,
    rowHeight: 42,
    headerHeight: 40,
    placeholderHeader: false,
};

export const PAGINATION_DEFAULTS = {
    pagination: "local",
    paginationSize: 25,
    paginationSizeSelector: [10, 25, 50, 100],
    paginationCounter: "rows",
};

// --- EXCEL THEME OVERRIDES ---
export function applyExcelTheme(table) {
    // Nothing needed here — CSS handles all Excel styling via .tabulator overrides
}

// =============================
// STATUS FORMATTERS
// =============================

// Orders / Payments status (Pending, Confirmed, Preparing, Out for Delivery, Delivered, Cancelled)
export function orderStatusFormatter(cell) {
    const val = cell.getValue() || '';
    const el = cell.getElement();
    const cls = 'cell-status-' + val.toLowerCase().replace(/\s+/g, '-');
    el.classList.add(cls);
    return val;
}

// Rider status (Online, On Delivery, Offline)
export function riderStatusFormatter(cell) {
    const val = cell.getValue() || '';
    const el = cell.getElement();
    // Normalize stale "Online" to "Offline"
    let normalized = val;
    el.classList.add('cell-status-' + normalized.toLowerCase().replace(/\s+/g, '-'));
    return normalized;
}

// =============================
// VALUE-BASED FORMATTERS
// =============================

// Inventory stock coloring (red if 0, orange if <= threshold, green otherwise)
export function stockFormatter(cell) {
    const val = parseInt(cell.getValue()) || 0;
    const threshold = parseInt(cell.getRow().getData().threshold) || 0;
    const el = cell.getElement();
    if (val === 0) el.classList.add('cell-stock-out');
    else if (val <= threshold) el.classList.add('cell-stock-low');
    else el.classList.add('cell-stock-ok');
    return val;
}

// Rating coloring (1-2 red, 3 yellow, 4-5 green)
export function ratingFormatter(cell) {
    const val = parseInt(cell.getValue()) || 0;
    const el = cell.getElement();
    if (val <= 2) el.classList.add('cell-rating-low');
    else if (val <= 3) el.classList.add('cell-rating-mid');
    else el.classList.add('cell-rating-high');
    return '⭐'.repeat(val) + ' ' + val + '/5';
}

// Lost sale value coloring (>= 500 red, >= 200 orange, < 200 gray)
export function lostSaleValueFormatter(cell) {
    const val = parseInt(cell.getValue()) || 0;
    const el = cell.getElement();
    if (val >= 500) el.classList.add('cell-value-high');
    else if (val >= 200) el.classList.add('cell-value-mid');
    else el.classList.add('cell-value-low');
    return '₹' + val.toLocaleString();
}

// =============================
// COMMON COLUMN FORMATTERS
// =============================

// Row number column
export const ROWNUM_COL = { formatter: "rownum", hozAlign: "center", width: 45, headerSort: false };

// Money formatter
export function moneyFormatter(cell) {
    const val = parseFloat(cell.getValue()) || 0;
    return '₹' + val.toLocaleString('en-IN');
}

// Date formatter
export function dateFormatter(cell) {
    const val = cell.getValue();
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// DateTime formatter
export function dateTimeFormatter(cell) {
    const val = cell.getValue();
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
           d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// WhatsApp link formatter
export function whatsappFormatter(cell) {
    const phone = String(cell.getValue() || '').replace(/\D/g, '').slice(-10);
    if (!phone || phone.length < 10) return '—';
    return `<a href="https://wa.me/91${phone}" target="_blank" rel="noopener" class="grid-link">📱 ${phone}</a>`;
}

// Truncate text with tooltip
export function truncateFormatter(cell, maxLen = 30) {
    const val = cell.getValue() || '';
    if (val.length <= maxLen) return escapeHtml(val);
    return `<span title="${escapeHtml(val)}">${escapeHtml(val.substring(0, maxLen))}…</span>`;
}

// Star emoji display (without score text)
export function starEmojiFormatter(cell) {
    const val = parseInt(cell.getValue()) || 0;
    return '⭐'.repeat(val);
}

// =============================
// GRID CREATION HELPER
// =============================

/**
 * Create a Tabulator grid with Excel-like defaults.
 * @param {string} elementId - DOM element ID (without #)
 * @param {Array} columns - Column definitions
 * @param {Object} extraOptions - Additional Tabulator options (merged with defaults)
 * @returns {Tabulator} table instance
 */
export function createGrid(elementId, columns, extraOptions = {}) {
    const el = document.getElementById(elementId);
    if (!el) {
        console.warn(`[Tabulator] Element #${elementId} not found`);
        return null;
    }

    // Clear existing content (manual tbody rows from old rendering)
    el.innerHTML = '';

    const options = {
        ...GRID_DEFAULTS,
        ...PAGINATION_DEFAULTS,
        columns: [ROWNUM_COL, ...columns],
        ...extraOptions,
    };

    const table = new Tabulator(`#${elementId}`, options);
    table._pendingData = null;
    table._ready = false;
    const self = table;
    table.on("tableBuilt", () => {
        requestAnimationFrame(() => {
            self._ready = true;
            if (self._pendingData) {
                self.replaceData(self._pendingData);
                self._pendingData = null;
            }
        });
    });
    return table;
}

// =============================
// REAL-TIME UPDATE HELPER
// =============================

/**
 * Silently update grid data without resetting sort/filter/scroll.
 * If the table isn't built yet, queues the data for when it is.
 * @param {Tabulator} table - Tabulator instance
 * @param {Array} data - New data array
 */
export function updateGridData(table, data) {
    if (!table || !data) return;
    if (!table._ready) {
        table._pendingData = data;
        return;
    }
    table.replaceData(data);
}

// =============================
// UTILITY
// =============================
// escapeHtml imported from shared/dom/escape.js at top of file

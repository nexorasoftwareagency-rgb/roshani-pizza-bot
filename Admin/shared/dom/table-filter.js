/**
 * SHARED TABLE FILTER — kills the 4 identical filterX functions.
 *
 * Usage:
 *   import { filterTableRows } from '../shared/dom/table-filter.js';
 *   filterTableRows('#ordersTableFull tr', searchTerm);
 *   filterTableRows('#menuGrid .dish-card', searchTerm);
 */

/**
 * Filter DOM rows/cards by a search term (case-insensitive substring match).
 * @param {string} selector - CSS selector for the rows/cards to filter
 * @param {string} searchTerm - The filter text
 */
export function filterTableRows(selector, searchTerm) {
    const term = (searchTerm || '').toLowerCase().trim();
    const rows = document.querySelectorAll(selector);
    rows.forEach(row => {
        if (!term) { row.style.display = ''; return; }
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

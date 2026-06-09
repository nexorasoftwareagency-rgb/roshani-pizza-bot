import { Outlet, get, query, orderByChild, startAt, endAt } from '../firebase.js';
import { ui } from '../ui.js';
import { showToast, escapeHtml, formatDate, getISTDateString, getSkeletonRows } from '../utils.js';
import { createGrid, updateGridData, GRID_DEFAULTS, PAGINATION_DEFAULTS } from '../tabulator-setup.js';

let salesData = [];
let revenueChart = null;
let _isLoading = false;
let _currentStatusFilter = 'delivered';
let _grid = null;

const STATUS_OPTIONS = {
    delivered: { label: 'Delivered Only', match: (o) => o.status === 'Delivered' },
    all: { label: 'All Orders', match: () => true },
    cancelled: { label: 'Cancelled Only', match: (o) => (o.status || '').toLowerCase() === 'cancelled' }
};

export function setStatusFilter(value) {
    if (!STATUS_OPTIONS[value]) value = 'delivered';
    if (_currentStatusFilter === value) return;
    _currentStatusFilter = value;
    if (salesData.length > 0) renderFromCache();
}

export function getStatusFilter() { return _currentStatusFilter; }

export function loadReports() {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const fromVal = getISTDateString(yesterday);
    const toVal = getISTDateString(today);

    if (document.getElementById('reportFrom')) document.getElementById('reportFrom').value = fromVal;
    if (document.getElementById('reportTo')) document.getElementById('reportTo').value = toVal;

    const filterEl = document.getElementById('reportStatusFilter');
    if (filterEl) filterEl.value = _currentStatusFilter;

    console.log(`[Reports] Initializing with default range: ${fromVal} to ${toVal}`);
    generateCustomReport();
}

function buildGrid() {
    const el = document.getElementById('reportTableBody');
    if (!el) return;
    el.innerHTML = '';

    _grid = new Tabulator("#reportTableBody", {
        ...GRID_DEFAULTS,
        pagination: false,
        placeholder: '<div style="padding:40px; color:#94a3b8;">📊 No orders found for this range</div>',
        columns: [
            { formatter: "rownum", hozAlign: "center", width: 45, headerSort: false },
            {
                title: "Date & Time",
                field: "createdAt",
                width: 160,
                formatter: function(cell) {
                    const d = cell.getRow().getData();
                    return `<div><div style="font-weight:600;">${formatDate(d.createdAt)}</div><div style="font-size:11px;color:#94a3b8;">#${escapeHtml(d.orderId || (d.id ? d.id.slice(-5) : 'N/A'))}</div></div>`;
                }
            },
            {
                title: "Customer",
                field: "customerName",
                width: 160,
                formatter: function(cell) {
                    const d = cell.getRow().getData();
                    return `<div><div style="font-weight:600;">${escapeHtml(d.customerName || 'Guest')}</div><div style="font-size:11px;color:#94a3b8;">${escapeHtml(d.phone || '')}</div></div>`;
                }
            },
            {
                title: "Order Type",
                field: "type",
                width: 110,
                formatter: function(cell) {
                    const val = cell.getValue() || 'Online';
                    const cls = val.toLowerCase().replace(/[- ]/g, '');
                    return `<span class="badge-type badge-${cls}">${escapeHtml(val)}</span>`;
                }
            },
            {
                title: "Payment",
                field: "paymentMethod",
                width: 100,
                formatter: function(cell) {
                    const val = cell.getValue() || 'COD';
                    return `<span class="badge-payment" data-method="${val.toLowerCase()}">${escapeHtml(val)}</span>`;
                }
            },
            {
                title: "Items",
                field: "itemsStr",
                width: 250,
                formatter: function(cell) {
                    const val = cell.getValue() || 'No items';
                    const truncated = val.length > 40 ? val.substring(0, 40) + '…' : val;
                    return `<span title="${escapeHtml(val)}" style="color:#475569;font-size:12px;">${escapeHtml(truncated)}</span>`;
                }
            },
            {
                title: "Total (₹)",
                field: "total",
                width: 120,
                hozAlign: "right",
                formatter: function(cell) {
                    const val = Number(cell.getValue() || 0);
                    return `<span style="font-weight:700;font-size:14px;">₹${val.toLocaleString()}</span>`;
                },
                sorter: "number"
            }
        ]
    });
}

export async function generateCustomReport() {
    if (_isLoading) return;

    const fromInput = document.getElementById('reportFrom');
    const toInput = document.getElementById('reportTo');
    const from = fromInput?.value?.trim() || '';
    const to = toInput?.value?.trim() || '';
    const tableBody = document.getElementById('reportTableBody');
    if (!tableBody) return;

    if (!from || !to) {
        ui.showToast('Please select both start and end dates for filtering', 'warning');
        tableBody.innerHTML = "<div style='text-align:center; padding:30px; color:#94a3b8;'>Please select a date range to view reports.</div>";
        return;
    }

    const fromDateObj = new Date(from);
    const toDateObj = new Date(to);
    if (isNaN(fromDateObj.getTime()) || isNaN(toDateObj.getTime())) {
        ui.showToast('Invalid date format selected', 'error');
        return;
    }
    if (fromDateObj > toDateObj) {
        ui.showToast('Start date must be before end date', 'warning');
        return;
    }

    _isLoading = true;
    tableBody.innerHTML = getSkeletonRows(5, 6);

    try {
        const dFrom = new Date(from); dFrom.setDate(dFrom.getDate() - 1);
        const dTo = new Date(to); dTo.setDate(dTo.getDate() + 1);

        const qStart = `${dFrom.toISOString().split('T')[0]}T00:00:00.000Z`;
        const qEnd = `${dTo.toISOString().split('T')[0]}T23:59:59.999Z`;

        const ordersSnap = await get(
            query(Outlet.ref('orders'), orderByChild('createdAt'), startAt(qStart), endAt(qEnd))
        );

        salesData = [];
        ordersSnap.forEach(child => {
            const o = child.val();
            if (!o) return;
            const dateStr = getISTDateString(o.createdAt);
            if (dateStr >= from && dateStr <= to) {
                const rawItems = o.cart || o.items || {};
                const itemsList = Array.isArray(rawItems) ? rawItems : Object.values(rawItems);
                const finalItems = itemsList.length ? itemsList : (o.item ? [{ name: o.item, qty: 1 }] : []);
                const itemsStr = finalItems.length
                    ? finalItems.map(i => `${i.name || i.item || 'Item'} x${i.qty || i.quantity || 1}`).join(', ')
                    : 'No items';
                salesData.push({ id: child.key, ...o, dateStr, itemsStr });
            }
        });

        salesData.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

        const fromDate = from ? formatDate(new Date(from + 'T00:00:00')) : 'Start';
        const toDate = to ? formatDate(new Date(to + 'T23:59:59')) : 'Today';
        const periodEl = document.getElementById('reportPeriod');
        if (periodEl) periodEl.innerText = `${fromDate} to ${toDate}`;

        renderFromCache();
    } catch (e) {
        console.error('[Reports] Generation Error:', e);
        showToast('Error generating report', 'error');
        tableBody.innerHTML = "<div style='text-align:center; padding:30px; color:#ef4444;'>⚠️ Failed to load report data.</div>";
    } finally {
        _isLoading = false;
    }
}

function renderFromCache() {
    const tableBody = document.getElementById('reportTableBody');
    if (!tableBody) return;

    const filter = STATUS_OPTIONS[_currentStatusFilter] || STATUS_OPTIONS.delivered;
    const filtered = salesData.filter(filter.match);

    let totalRev = 0;
    filtered.forEach(o => { totalRev += parseFloat(o.total || 0); });
    const totalOrd = filtered.length;

    const revEl = document.getElementById('reportRevenue');
    const ordEl = document.getElementById('reportOrders');
    const avgEl = document.getElementById('reportAvg');

    if (revEl) revEl.innerText = '₹' + totalRev.toLocaleString();
    if (ordEl) ordEl.innerText = totalOrd;
    if (avgEl) avgEl.innerText = '₹' + (totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0);

    if (!_grid) buildGrid();
    if (_grid) updateGridData(_grid, filtered);

    renderRevenueChart(filtered);
}

export function renderRevenueChart(data) {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    const dailyData = {};
    data.forEach(o => {
        dailyData[o.dateStr] = (dailyData[o.dateStr] || 0) + Number(o.total || 0);
    });

    const labels = Object.keys(dailyData).sort();
    const values = labels.map(l => dailyData[l]);

    if (revenueChart) { revenueChart.destroy(); revenueChart = null; }

    if (labels.length === 0) {
        ctx.style.display = 'none';
        const placeholder = ctx.parentElement.querySelector('.chart-empty-msg');
        if (!placeholder) {
            const msg = document.createElement('div');
            msg.className = 'chart-empty-msg';
            msg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:14px;font-weight:600;';
            msg.textContent = 'No data to chart';
            ctx.parentElement.appendChild(msg);
        }
        return;
    }
    ctx.style.display = '';
    const existingMsg = ctx.parentElement.querySelector('.chart-empty-msg');
    if (existingMsg) existingMsg.remove();

    const tickColor = 'rgba(0,0,0,0.5)';
    const gridColor = 'rgba(0,0,0,0.05)';

    if (typeof Chart !== 'undefined') {
        revenueChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Daily Revenue',
                    data: values,
                    borderColor: '#f36b21',
                    backgroundColor: 'rgba(243, 107, 33, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#f36b21',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } },
                    x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 10 } } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }
}

export function cleanupReports() {
    if (revenueChart) { revenueChart.destroy(); revenueChart = null; }
}

export function downloadExcel() {
    const filtered = _filteredForExport();
    if (filtered.length === 0) { ui.showToast('No data to export.', 'info'); return; }

    showToast('Generating Excel...', 'info');

    const data = filtered.map(o => ({
        Date: formatDate(o.createdAt),
        'Order ID': o.orderId || o.id,
        Customer: o.customerName || 'Guest',
        Phone: o.phone || '',
        'Order Type': o.type || o.orderType || 'Online',
        Payment: o.paymentMethod || 'COD',
        Total: o.total || 0,
        Status: o.status,
        Items: o.itemsStr || ''
    }));

    if (typeof XLSX !== 'undefined') {
        setTimeout(() => {
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
            XLSX.writeFile(wb, `Sales_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
        }, 50);
    } else {
        ui.showToast('Excel library not loaded.', 'error');
    }
}

export function downloadPDF() {
    const filtered = _filteredForExport();
    if (filtered.length === 0) { ui.showToast('No data available to export. Generate a report first.', 'warning'); return; }
    if (!window.jspdf) { ui.showToast('PDF export library not ready. Please refresh and try again.', 'error'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    if (typeof doc.autoTable !== 'function') { ui.showToast('PDF table plugin not ready.', 'error'); return; }

    showToast('Generating PDF...', 'info');

    doc.setFontSize(20);
    doc.text('Sales Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);

    const from = document.getElementById('reportFrom')?.value || '';
    const to = document.getElementById('reportTo')?.value || '';
    doc.text(`Period: ${from} to ${to}`, 14, 30);
    doc.text(`Filter: ${STATUS_OPTIONS[_currentStatusFilter].label}`, 14, 36);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 42);

    const tableData = filtered.map(o => [
        formatDate(o.createdAt),
        o.customerName || 'Guest',
        o.type || o.orderType || 'Online',
        o.paymentMethod || 'COD',
        `Rs.${o.total}`,
        o.itemsStr || ''
    ]);

    doc.autoTable({
        startY: 48,
        head: [['Date', 'Customer', 'Order Type', 'Payment', 'Total', 'Items']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [6, 95, 70] },
        columnStyles: { 5: { cellWidth: 50 } }
    });
    doc.save(`Sales_Report_${from}_to_${to}.pdf`);
}

function _filteredForExport() {
    const filter = STATUS_OPTIONS[_currentStatusFilter] || STATUS_OPTIONS.delivered;
    return salesData.filter(filter.match);
}

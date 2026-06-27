import { Outlet, db, ref, get, query, orderByChild, startAt, endAt } from '../firebase.js';
import { ui } from '../ui.js';
import { showToast, escapeHtml, formatDate, getISTDateString, getSkeletonDivs } from '../utils.js';
import { createGrid, updateGridData, GRID_DEFAULTS, PAGINATION_DEFAULTS } from '../tabulator-setup.js';

let salesData = [];
let prevPeriodData = [];
let revenueChart = null;
let orderTypeChart = null;
let _isLoading = false;
let _currentStatusFilter = 'delivered';
let _currentOutletFilter = 'current';
let _compareMode = false;
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

export function setOutletFilter(value) {
    if (!value) value = 'current';
    if (_currentOutletFilter === value) return;
    _currentOutletFilter = value;
    if (salesData.length > 0) renderFromCache();
}

export function getOutletFilter() { return _currentOutletFilter; }

export function toggleCompare(enabled) {
    _compareMode = enabled;
    const bar = document.getElementById('reportComparisonBar');
    if (!bar) return;
    if (enabled && salesData.length > 0 && prevPeriodData.length > 0) {
        bar.classList.remove('hidden');
        _renderComparison();
        renderRevenueChart(_filteredCurrent());
    } else if (enabled && salesData.length > 0) {
        generateCustomReport();
    } else {
        bar.classList.add('hidden');
        renderRevenueChart(_filteredCurrent());
    }
}

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

    const outletEl = document.getElementById('reportOutletFilter');
    if (outletEl) outletEl.value = _currentOutletFilter;

    console.log(`[Reports] Initializing with default range: ${fromVal} to ${toVal}`);
    generateCustomReport();
}

function buildGrid(data) {
    const el = document.getElementById('reportTableBody');
    if (!el) return;
    el.innerHTML = '';

    _grid = new Tabulator("#reportTableBody", {
        data: data || [],
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
                title: "Outlet",
                field: "outlet",
                width: 80,
                formatter: function(cell) {
                    const val = cell.getValue() || 'pizza';
                    return `<span class="outlet-badge" style="background:${val === 'cake' ? '#f59e0b' : '#10b981'}">${escapeHtml(val.toUpperCase())}</span>`;
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
    if (_grid) { _grid.destroy(); _grid = null; }
    prevPeriodData = [];
    const compBar = document.getElementById('reportComparisonBar');
    if (compBar) compBar.classList.add('hidden');
    tableBody.innerHTML = getSkeletonDivs(5);

    try {
        const dFrom = new Date(from); dFrom.setDate(dFrom.getDate() - 1);
        const dTo = new Date(to); dTo.setDate(dTo.getDate() + 1);

        const qStart = `${dFrom.toISOString().split('T')[0]}T00:00:00.000Z`;
        const qEnd = `${dTo.toISOString().split('T')[0]}T23:59:59.999Z`;

        const outletFilter = document.getElementById('reportOutletFilter')?.value || 'current';
        _currentOutletFilter = outletFilter;

        const outletsToFetch = outletFilter === 'current'
            ? [window.currentOutlet || 'pizza']
            : [outletFilter];

        salesData = [];
        for (const outlet of outletsToFetch) {
            const ordersRef = outletFilter === 'current' ? Outlet.ref('orders') : ref(db, `${outlet}/orders`);
            const ordersSnap = await get(
                query(ordersRef, orderByChild('createdAt'), startAt(qStart), endAt(qEnd))
            );
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
                    salesData.push({ id: child.key, outlet, ...o, dateStr, itemsStr });
                }
            });
        }

        salesData.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

        const fromDate = from ? formatDate(new Date(from + 'T00:00:00')) : 'Start';
        const toDate = to ? formatDate(new Date(to + 'T23:59:59')) : 'Today';
        const periodEl = document.getElementById('reportPeriod');
        if (periodEl) periodEl.innerText = `${fromDate} to ${toDate}`;

        if (_compareMode) {
            const rangeMs = new Date(to).getTime() - new Date(from).getTime();
            const prevFrom = new Date(new Date(from).getTime() - rangeMs - 86400000);
            const prevTo = new Date(new Date(from).getTime() - 86400000);
            const pFrom = prevFrom.toISOString().split('T')[0];
            const pTo = prevTo.toISOString().split('T')[0];
            const pdFrom = new Date(pFrom); pdFrom.setDate(pdFrom.getDate() - 1);
            const pdTo = new Date(pTo); pdTo.setDate(pdTo.getDate() + 1);
            const pqStart = `${pdFrom.toISOString().split('T')[0]}T00:00:00.000Z`;
            const pqEnd = `${pdTo.toISOString().split('T')[0]}T23:59:59.999Z`;

            prevPeriodData = [];
            for (const outlet of outletsToFetch) {
                const ordersRef = outletFilter === 'current' ? Outlet.ref('orders') : ref(db, `${outlet}/orders`);
                const snap = await get(query(ordersRef, orderByChild('createdAt'), startAt(pqStart), endAt(pqEnd)));
                snap.forEach(child => {
                    const o = child.val();
                    if (!o) return;
                    const dateStr = getISTDateString(o.createdAt);
                    if (dateStr >= pFrom && dateStr <= pTo) {
                        prevPeriodData.push({ id: child.key, outlet, ...o, dateStr });
                    }
                });
            }
        }

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

    const paymentTotals = { cash: 0, upi: 0, cod: 0 };
    const orderTypeCounts = {};
    filtered.forEach(o => {
        const pm = (o.paymentMethod || 'cod').toLowerCase();
        if (paymentTotals[pm] !== undefined) paymentTotals[pm] += parseFloat(o.total || 0);
        else paymentTotals[pm] = (paymentTotals[pm] || 0) + parseFloat(o.total || 0);
        const ot = o.type || o.orderType || 'Online';
        orderTypeCounts[ot] = (orderTypeCounts[ot] || 0) + 1;
    });

    const cashEl = document.getElementById('reportCashTotal');
    const upiEl = document.getElementById('reportUpiTotal');
    const codEl = document.getElementById('reportCodTotal');
    const topMethodEl = document.getElementById('reportTopMethod');

    if (cashEl) cashEl.innerText = '₹' + paymentTotals.cash.toLocaleString();
    if (upiEl) upiEl.innerText = '₹' + paymentTotals.upi.toLocaleString();
    if (codEl) codEl.innerText = '₹' + paymentTotals.cod.toLocaleString();
    if (topMethodEl) {
        const sorted = Object.entries(paymentTotals).sort((a, b) => b[1] - a[1]);
        const top = sorted[0];
        topMethodEl.innerText = top && top[1] > 0 ? top[0].toUpperCase() : '-';
    }

    buildGrid(filtered);

    if (_compareMode && prevPeriodData.length > 0) {
        const bar = document.getElementById('reportComparisonBar');
        if (bar) bar.classList.remove('hidden');
        _renderComparison();
    }

    renderRevenueChart(filtered);
    renderOrderTypeChart(orderTypeCounts);
}

function _filteredCurrent() {
    const filter = STATUS_OPTIONS[_currentStatusFilter] || STATUS_OPTIONS.delivered;
    return salesData.filter(filter.match);
}

function _renderComparison() {
    const filter = STATUS_OPTIONS[_currentStatusFilter] || STATUS_OPTIONS.delivered;
    const cur = _filteredCurrent();
    const prev = prevPeriodData.filter(filter.match);

    const curRev = cur.reduce((s, o) => s + parseFloat(o.total || 0), 0);
    const prevRev = prev.reduce((s, o) => s + parseFloat(o.total || 0), 0);
    const revChg = prevRev > 0 ? ((curRev - prevRev) / prevRev * 100).toFixed(1) : '--';

    const curOrd = cur.length;
    const prevOrd = prev.length;
    const ordChg = prevOrd > 0 ? ((curOrd - prevOrd) / prevOrd * 100).toFixed(1) : '--';

    const curAvg = curOrd > 0 ? curRev / curOrd : 0;
    const prevAvg = prevOrd > 0 ? prevRev / prevOrd : 0;
    const avgChg = prevAvg > 0 ? ((curAvg - prevAvg) / prevAvg * 100).toFixed(1) : '--';

    const fmtPct = (v, suffix) => {
        if (v === '--') return `<span style="color:#94a3b8;">--</span>`;
        const isUp = parseFloat(v) >= 0;
        const arrow = isUp ? '▲' : '▼';
        const color = isUp ? '#16a34a' : '#dc2626';
        return `<span style="color:${color};font-weight:800;">${arrow} ${Math.abs(parseFloat(v)).toFixed(1)}${suffix}</span>`;
    };

    const revEl = document.querySelector('#compRevenue span');
    const ordEl = document.querySelector('#compOrders span');
    const avgEl = document.querySelector('#compAvg span');
    if (revEl) revEl.innerHTML = fmtPct(revChg, '%');
    if (ordEl) ordEl.innerHTML = fmtPct(ordChg, '%');
    if (avgEl) avgEl.innerHTML = fmtPct(avgChg, '%');
}

export function renderRevenueChart(data) {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    const dailyData = {};
    data.forEach(o => {
        dailyData[o.dateStr] = (dailyData[o.dateStr] || 0) + Number(o.total || 0);
    });

    const prevDailyData = {};
    const filter = STATUS_OPTIONS[_currentStatusFilter] || STATUS_OPTIONS.delivered;
    const prevFiltered = prevPeriodData.filter(filter.match);
    prevFiltered.forEach(o => {
        const d = o.dateStr || getISTDateString(o.createdAt);
        if (d) prevDailyData[d] = (prevDailyData[d] || 0) + parseFloat(o.total || 0);
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

    const datasets = [{
        label: 'Current Period',
        data: values,
        borderColor: '#E84908',
        backgroundColor: 'rgba(232, 73, 8, 0.1)',
        borderWidth: 3,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#E84908',
        pointRadius: 4
    }];

    if (_compareMode && prevPeriodData.length > 0) {
        const prevValues = labels.map(l => prevDailyData[l] || 0);
        datasets.push({
            label: 'Previous Period',
            data: prevValues,
            borderColor: '#94a3b8',
            backgroundColor: 'rgba(148, 163, 184, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: false,
            borderDash: [6, 3],
            pointBackgroundColor: '#94a3b8',
            pointRadius: 3
        });
    }

    if (typeof Chart !== 'undefined') {
        revenueChart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } },
                    x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 10 } } }
                },
                plugins: { legend: { display: datasets.length > 1, position: 'top', labels: { font: { size: 11, weight: 'bold' }, usePointStyle: true } } }
            }
        });
    }
}

export function renderOrderTypeChart(orderTypeCounts) {
    const ctx = document.getElementById('orderTypeChart');
    if (!ctx) return;

    if (orderTypeChart) { orderTypeChart.destroy(); orderTypeChart = null; }

    const labels = Object.keys(orderTypeCounts);
    const values = Object.values(orderTypeCounts);

    if (labels.length === 0) {
        ctx.style.display = 'none';
        return;
    }
    ctx.style.display = '';

    const colorMap = {
        'Online': '#3b82f6', 'WhatsApp': '#10b981', 'POS': '#f59e0b',
        'Dine-in': '#a855f7', 'Dine In': '#a855f7', 'Dinein': '#a855f7',
        'Walk-in': '#f97316', 'Walkin': '#f97316'
    };
    const colors = labels.map(l => colorMap[l] || '#94a3b8');

    if (typeof Chart !== 'undefined') {
        orderTypeChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { font: { size: 11, weight: 'bold' }, padding: 12, usePointStyle: true }
                    }
                }
            }
        });
    }
}

export function cleanupReports() {
    if (revenueChart) { revenueChart.destroy(); revenueChart = null; }
    if (orderTypeChart) { orderTypeChart.destroy(); orderTypeChart = null; }
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
        Outlet: (o.outlet || 'pizza').toUpperCase(),
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
        (o.outlet || 'pizza').toUpperCase(),
        o.type || o.orderType || 'Online',
        o.paymentMethod || 'COD',
        `Rs.${o.total}`,
        o.itemsStr || ''
    ]);

    doc.autoTable({
        startY: 48,
        head: [['Date', 'Customer', 'Outlet', 'Order Type', 'Payment', 'Total', 'Items']],
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

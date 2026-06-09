/**
 * ROSHANI ERP | RIDER INTELLIGENCE
 * Analytics and performance monitoring for delivery personnel.
 */

import { Outlet, get, query, orderByChild, equalTo } from '../firebase.js';
import { state } from '../state.js';
import { escapeHtml, showToast, formatDate, getISTDateString, getSkeletonRows } from '../utils.js';
import { settleRiderWallet } from './riders.js';
import { createGrid, updateGridData, GRID_DEFAULTS } from '../tabulator-setup.js';

let riderEarningsChart = null;
let _grid = null;

export function initRiderAnalytics() {
    console.log("[RiderAnalytics] Initializing...");
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);

    const fromInput = document.getElementById('riderReportFrom');
    const toInput = document.getElementById('riderReportTo');
    if (fromInput && !fromInput.value) fromInput.value = getISTDateString(lastWeek);
    if (toInput && !toInput.value) toInput.value = getISTDateString(today);

    populateRiderSelect();

    document.getElementById('btnGenerateRiderReport')?.addEventListener('click', generateRiderPerformanceReport);
    document.getElementById('btnRiderExportExcel')?.addEventListener('click', () => exportRiderReport('excel'));
    document.getElementById('btnRiderExportPDF')?.addEventListener('click', () => exportRiderReport('pdf'));
    document.getElementById('btnSettleRiderAnalytics')?.addEventListener('click', settleRiderBalanceAnalytics);
}

export function cleanupRiderAnalytics() {
    console.log("[RiderAnalytics] Cleaning up...");
    const kpis = ['riderStatEarnings', 'riderStatDeliveries', 'riderStatAvgTime', 'riderStatRating', 'riderStatPendingCash'];
    kpis.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = id === 'riderStatEarnings' || id === 'riderStatPendingCash' ? "₹0" : "0";
    });

    const tbody = document.getElementById('riderAnalyticsTableBody');
    if (tbody) tbody.innerHTML = '<div style="text-align:center; padding:30px; color:#94a3b8;">Select a rider and dates to generate report.</div>';

    const summary = document.getElementById('riderStatusSummary');
    if (summary) summary.innerHTML = "";

    if (riderEarningsChart) { riderEarningsChart.destroy(); riderEarningsChart = null; }
}

export function populateRiderSelect() {
    const select = document.getElementById('riderSelectAnalytics');
    if (!select) return;
    const updateSelect = () => {
        const riders = state.ridersList || [];
        const currentVal = select.value;
        select.innerHTML = '<option value="">Select a Rider...</option>' +
            riders.map(r => `<option value="${r.id}" ${r.id === currentVal ? 'selected' : ''}>${escapeHtml(r.name)} (${r.status || 'Offline'})</option>`).join('');
    };
    updateSelect();
}

function buildGrid() {
    const el = document.getElementById('riderAnalyticsTableBody');
    if (!el) return;
    el.innerHTML = '';

    _grid = new Tabulator("#riderAnalyticsTableBody", {
        ...GRID_DEFAULTS,
        pagination: false,
        placeholder: '<div style="padding:40px; color:#94a3b8;">📊 No deliveries found</div>',
        columns: [
            { formatter: "rownum", hozAlign: "center", width: 45, headerSort: false },
            {
                title: "Date & Time",
                field: "createdAt",
                width: 160,
                formatter: function(cell) {
                    const d = cell.getRow().getData();
                    const time = new Date(d.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    return `<div><div style="font-weight:600;">${formatDate(d.createdAt)}</div><div style="font-size:11px;color:#94a3b8;">${time}</div></div>`;
                }
            },
            {
                title: "Order #",
                field: "orderId",
                width: 100,
                formatter: function(cell) {
                    const val = cell.getValue() || 'N/A';
                    return `<span class="badge-payment">#${escapeHtml(val)}</span>`;
                }
            },
            {
                title: "Customer",
                field: "customerName",
                width: 180,
                formatter: function(cell) {
                    const d = cell.getRow().getData();
                    return `<div><div style="font-weight:600;">${escapeHtml(d.customerName || 'Guest')}</div><div style="font-size:11px;color:#94a3b8;">${escapeHtml(d.outlet || '')}</div></div>`;
                }
            },
            {
                title: "Duration",
                field: "duration",
                width: 110,
                hozAlign: "center",
                formatter: function(cell) {
                    const val = cell.getValue();
                    return val ? `${val} mins` : '<span style="color:#94a3b8;">--</span>';
                }
            },
            {
                title: "Earnings (₹)",
                field: "deliveryFee",
                width: 120,
                hozAlign: "right",
                formatter: function(cell) {
                    return `<span style="font-weight:700;font-size:14px;">₹${Number(cell.getValue() || 0).toLocaleString()}</span>`;
                },
                sorter: "number"
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

export async function generateRiderPerformanceReport() {
    const riderId = document.getElementById('riderSelectAnalytics').value;
    const fromDateStr = document.getElementById('riderReportFrom').value;
    const toDateStr = document.getElementById('riderReportTo').value;

    if (!riderId) { showToast("Please select a rider first", "warning"); return; }
    if (!fromDateStr || !toDateStr) { showToast("Please select both start and end dates", "warning"); return; }
    if (new Date(fromDateStr) > new Date(toDateStr)) { showToast("Start date must be before end date", "warning"); return; }

    const btn = document.getElementById('btnGenerateRiderReport');
    btn.disabled = true;
    btn.innerHTML = 'Analyzing...';

    const raTbody = document.getElementById('riderAnalyticsTableBody');
    if (raTbody) raTbody.innerHTML = getSkeletonRows(5, 5);
    if (_grid) { _grid.destroy(); _grid = null; }

    try {
        const ordersSnap = await get(query(Outlet.ref("orders"), orderByChild("riderId"), equalTo(riderId)));

        const allOrders = [];
        ordersSnap.forEach(child => {
            const o = child.val();
            if (!o) return;
            const dateStr = getISTDateString(o.createdAt);
            if (dateStr >= fromDateStr && dateStr <= toDateStr) {
                const duration = (o.pickedUpAt && o.deliveredAt) ? Math.round((o.deliveredAt - o.pickedUpAt) / 60000) : null;
                allOrders.push({ id: child.key, outlet: state.currentOutlet, duration, orderId: child.key ? child.key.slice(-5) : 'N/A', ...o });
            }
        });

        allOrders.sort((a, b) => {
            const aTime = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime() || 0;
            const bTime = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime() || 0;
            return bTime - aTime;
        });

        const stats = calculateRiderStats(allOrders, riderId);
        updateRiderKPIs(stats);

        if (!_grid) buildGrid();
        if (_grid) updateGridData(_grid, allOrders.slice(0, 50));

        renderRiderEarningsChart(allOrders);
        renderRiderSummary(riderId, stats);

        showToast(`Analyzed ${allOrders.length} deliveries for this period`, "success");
    } catch (e) {
        console.error(e);
        showToast("Error generating report", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Analyze';
    }
}

function calculateRiderStats(orders, riderId) {
    let totalEarnings = 0, deliveredCount = 0, totalDeliveryTime = 0, deliveryTimeCount = 0, pendingCash = 0;
    orders.forEach(o => {
        if (o.status === "Delivered") {
            deliveredCount++;
            totalEarnings += (Number(o.deliveryFee) || 0);
            const isCash = (o.paymentMethod || "").toUpperCase() === "CASH";
            if (isCash && !o.settled) pendingCash += Number(o.total || 0);
            if (o.pickedUpAt && o.deliveredAt) {
                const duration = (o.deliveredAt - o.pickedUpAt) / 60000;
                if (duration > 0 && duration < 300) { totalDeliveryTime += duration; deliveryTimeCount++; }
            }
        }
    });
    const riderStats = riderId ? (state.riderStatsData?.[riderId] || {}) : {};
    return {
        totalEarnings, deliveredCount, pendingCash,
        avgTime: deliveryTimeCount > 0 ? Math.round(totalDeliveryTime / deliveryTimeCount) : 0,
        avgRating: riderStats.avgRating || null
    };
}

function updateRiderKPIs(stats) {
    document.getElementById('riderStatEarnings').innerText = `₹${stats.totalEarnings.toLocaleString()}`;
    document.getElementById('riderStatDeliveries').innerText = stats.deliveredCount;
    document.getElementById('riderStatAvgTime').innerText = `${stats.avgTime}m`;
    document.getElementById('riderStatRating').innerText = stats.avgRating || 'N/A';
    const pendingCashEl = document.getElementById('riderStatPendingCash');
    if (pendingCashEl) {
        pendingCashEl.innerText = `₹${stats.pendingCash.toLocaleString()}`;
        pendingCashEl.style.color = stats.pendingCash > 0 ? 'var(--orange)' : 'var(--success)';
    }
}

function renderRiderEarningsChart(orders) {
    const ctx = document.getElementById('riderEarningsChart');
    if (!ctx) return;

    const dailyEarnings = {};
    orders.forEach(o => {
        if (o.status === "Delivered") {
            const dateStr = getISTDateString(o.createdAt);
            dailyEarnings[dateStr] = (dailyEarnings[dateStr] || 0) + (Number(o.deliveryFee) || 0);
        }
    });

    const labels = Object.keys(dailyEarnings).sort();
    const values = labels.map(l => dailyEarnings[l]);

    if (riderEarningsChart) riderEarningsChart.destroy();

    if (labels.length === 0) {
        ctx.style.display = 'none';
        const placeholder = ctx.parentElement.querySelector('.chart-empty-msg');
        if (!placeholder) {
            const msg = document.createElement('div');
            msg.className = 'chart-empty-msg';
            msg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:14px;font-weight:600;';
            msg.textContent = 'No earnings data to chart';
            ctx.parentElement.appendChild(msg);
        }
        return;
    }
    ctx.style.display = '';
    const existingMsg = ctx.parentElement.querySelector('.chart-empty-msg');
    if (existingMsg) existingMsg.remove();

    if (typeof Chart !== 'undefined') {
        riderEarningsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Earnings (₹)',
                    data: values,
                    backgroundColor: 'rgba(243, 107, 33, 0.6)',
                    borderColor: '#f36b21',
                    borderWidth: 1,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } }
            }
        });
    }
}

function renderRiderSummary(riderId, stats) {
    const container = document.getElementById('riderStatusSummary');
    const rider = state.ridersList.find(r => r.id === riderId);
    if (!container || !rider) return;

    container.innerHTML = `
        <div class="rider-mini-profile flex-col flex-center text-center">
            <img src="${rider.photoUrl || 'https://placehold.co/100x100?text=Rider'}" class="rounded-full mb-10 border-2" style="width: 64px; height: 64px; border-color: var(--primary);">
            <h4 class="m-0">${escapeHtml(rider.name)}</h4>
            <p class="text-muted-small mb-15">${escapeHtml(rider.email || '')}</p>
            <div class="flex-row flex-between w-full p-10-0 border-top-dashed">
                <span class="text-muted-small">Delivered Orders</span>
                <span class="font-bold text-success">${stats.deliveredCount}</span>
            </div>
            <div class="flex-row flex-between w-full p-10-0 border-top-dashed">
                <span class="text-muted-small">Avg. Delivery Time</span>
                <span class="badge-payment">${stats.avgTime}m</span>
            </div>
        </div>
    `;
}

export async function exportRiderReport(type) {
    const riderSelect = document.getElementById('riderSelectAnalytics');
    const riderName = riderSelect.options[riderSelect.selectedIndex].text;
    const fromDate = document.getElementById('riderReportFrom').value;
    const toDate = document.getElementById('riderReportTo').value;

    if (!_grid) { showToast("No data to export", "warning"); return; }

    const rows = _grid.getData();
    if (!rows || rows.length === 0) { showToast("No data to export", "warning"); return; }

    const reportData = rows.map(d => ({
        Date: formatDate(d.createdAt),
        Time: new Date(d.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        Order: d.orderId || d.id,
        Customer: d.customerName || 'Guest',
        Outlet: d.outlet || '',
        Duration: d.duration ? `${d.duration} mins` : '--',
        Earnings: d.deliveryFee || 0
    }));

    if (type === 'excel') {
        if (typeof XLSX !== 'undefined') {
            const ws = XLSX.utils.json_to_sheet(reportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Rider Performance");
            XLSX.writeFile(wb, `Rider_Report_${riderName.replace(/\s+/g, '_')}_${fromDate}_to_${toDate}.xlsx`);
            showToast("Excel report downloaded", "success");
        } else {
            showToast("Excel library not loaded", "error");
        }
    } else if (type === 'pdf') {
        try {
            if (!window.jspdf) { showToast("PDF library not loaded", "error"); return; }
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            doc.setFontSize(20);
            doc.setTextColor(243, 107, 33);
            doc.text("Rider Performance Report", 14, 22);
            doc.setFontSize(11);
            doc.setTextColor(100);
            doc.text(`Rider: ${riderName}`, 14, 30);
            doc.text(`Period: ${fromDate} to ${toDate}`, 14, 35);

            const tableRows = reportData.map(d => [d.Date, d.Order, d.Customer, d.Duration, `₹${d.Earnings}`]);
            doc.autoTable({
                head: [['Date', 'Order #', 'Customer', 'Duration', 'Earnings']],
                body: tableRows,
                startY: 45,
                theme: 'grid',
                headStyles: { fillColor: [243, 107, 33] }
            });
            doc.save(`Rider_Report_${riderName.replace(/\s+/g, '_')}.pdf`);
            showToast("PDF report downloaded", "success");
        } catch (e) {
            console.error("[RiderAnalytics] PDF export error:", e);
            showToast("PDF export failed: " + e.message, "error");
        }
    }
}

export async function settleRiderBalanceAnalytics() {
    const riderId = document.getElementById('riderSelectAnalytics').value;
    if (!riderId) { showToast("Please select a rider first", "warning"); return; }
    const rider = state.ridersList.find(r => r.id === riderId);
    const riderName = rider ? rider.name : "Rider";
    const fromDateStr = document.getElementById('riderReportFrom').value;
    const customLimit = fromDateStr ? new Date(fromDateStr).getTime() : null;
    await settleRiderWallet(riderId, riderName, customLimit);
    generateRiderPerformanceReport();
}

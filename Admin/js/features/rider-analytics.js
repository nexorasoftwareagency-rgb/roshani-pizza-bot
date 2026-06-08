/**
 * ROSHANI ERP | RIDER INTELLIGENCE
 * Analytics and performance monitoring for delivery personnel.
 */

import { Outlet, get, query, orderByChild, equalTo } from '../firebase.js';
import { state } from '../state.js';
import { escapeHtml, showToast, formatDate, getISTDateString, getSkeletonRows } from '../utils.js';
import { settleRiderWallet } from './riders.js';

let riderEarningsChart = null;

/**
 * INITIALIZE RIDER ANALYTICS
 */
export function initRiderAnalytics() {
    console.log("[RiderAnalytics] Initializing...");
    
    // Set default dates
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    
    const fromInput = document.getElementById('riderReportFrom');
    const toInput = document.getElementById('riderReportTo');
    
    if (fromInput && !fromInput.value) fromInput.value = getISTDateString(lastWeek);
    if (toInput && !toInput.value) toInput.value = getISTDateString(today);

    // Populate rider select
    populateRiderSelect();

    // Event Listeners
    document.getElementById('btnGenerateRiderReport')?.addEventListener('click', generateRiderPerformanceReport);
    document.getElementById('btnRiderExportExcel')?.addEventListener('click', () => exportRiderReport('excel'));
    document.getElementById('btnRiderExportPDF')?.addEventListener('click', () => exportRiderReport('pdf'));
    document.getElementById('btnSettleRiderAnalytics')?.addEventListener('click', settleRiderBalanceAnalytics);
}

/**
 * CLEANUP RIDER ANALYTICS
 */
export function cleanupRiderAnalytics() {
    console.log("[RiderAnalytics] Cleaning up...");
    
    // Clear KPIs
    const kpis = ['riderStatEarnings', 'riderStatDeliveries', 'riderStatAvgTime', 'riderStatRating', 'riderStatPendingCash'];
    kpis.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = id === 'riderStatEarnings' || id === 'riderStatPendingCash' ? "₹0" : "0";
    });

    // Clear Table
    const tbody = document.getElementById('riderAnalyticsTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-20 text-muted">Select a rider and dates to generate report.</td></tr>';

    // Clear Summary
    const summary = document.getElementById('riderStatusSummary');
    if (summary) summary.innerHTML = "";

    // Destroy Chart
    if (riderEarningsChart) {
        riderEarningsChart.destroy();
        riderEarningsChart = null;
    }
}


/**
 * POPULATE RIDER SELECTION DROPDOWN
 */
export function populateRiderSelect() {
    const select = document.getElementById('riderSelectAnalytics');
    if (!select) return;

    // Listen for riders changes in state
    const updateSelect = () => {
        const riders = state.ridersList || [];
        const currentVal = select.value;
        
        select.innerHTML = '<option value="">Select a Rider...</option>' + 
            riders.map(r => `<option value="${r.id}" ${r.id === currentVal ? 'selected' : ''}>${escapeHtml(r.name)} (${r.status || 'Offline'})</option>`).join('');
    };

    // Initial populate
    updateSelect();

    // We can also poll or wait for state changes if needed, 
    // but usually riders are loaded on app start by riders.js
}

/**
 * GENERATE PERFORMANCE DATA
 */
export async function generateRiderPerformanceReport() {
    const riderId = document.getElementById('riderSelectAnalytics').value;
    const fromDateStr = document.getElementById('riderReportFrom').value;
    const toDateStr = document.getElementById('riderReportTo').value;

    if (!riderId) {
        showToast("Please select a rider first", "warning");
        return;
    }

    if (!fromDateStr || !toDateStr) {
        showToast("Please select both start and end dates", "warning");
        return;
    }

    if (new Date(fromDateStr) > new Date(toDateStr)) {
        showToast("Start date must be before end date", "warning");
        return;
    }

    const btn = document.getElementById('btnGenerateRiderReport');
    btn.disabled = true;
    btn.innerHTML = 'Analyzing...';

    // Show skeleton immediately
    const raTbody = document.getElementById('riderAnalyticsTableBody');
    if (raTbody) raTbody.innerHTML = getSkeletonRows(5, 5);

    try {
        // Broaden range by 1 day to catch IST/UTC drift, then filter client-side
        const dFrom = new Date(fromDateStr);
        dFrom.setDate(dFrom.getDate() - 1);
        const dTo = new Date(toDateStr);
        dTo.setDate(dTo.getDate() + 1);

        const fromStr = `${dFrom.toISOString().split('T')[0]}T00:00:00.000Z`;
        const toStr = `${dTo.toISOString().split('T')[0]}T23:59:59.999Z`;

        // Show skeleton while data loads
        const raTbody = document.getElementById('riderAnalyticsTableBody');

        const ordersSnap = await get(query(Outlet.ref("orders"), orderByChild("riderId"), equalTo(riderId)));
        
        const allOrders = [];
        ordersSnap.forEach(child => {
            const o = child.val();
            if (!o) return;

            const dateStr = getISTDateString(o.createdAt);
            if (dateStr >= fromDateStr && dateStr <= toDateStr) {
                allOrders.push({ id: child.key, outlet: state.currentOutlet, ...o });
            }
        });

        // Calculate Stats
        const stats = calculateRiderStats(allOrders, riderId);
        updateRiderKPIs(stats);
        renderRiderTable(allOrders);
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

/**
 * CALCULATE STATS FROM FILTERED ORDERS
 */
function calculateRiderStats(orders, riderId) {
    let totalEarnings = 0;
    let deliveredCount = 0;
    let totalDeliveryTime = 0; // in minutes
    let deliveryTimeCount = 0;
    let pendingCash = 0;

    orders.forEach(o => {
        if (o.status === "Delivered") {
            deliveredCount++;
            
            // Assuming delivery fee is what rider earns
            totalEarnings += (Number(o.deliveryFee) || 0);

            // Calculate Pending Cash
            const isCash = (o.paymentMethod || "").toUpperCase() === "CASH";
            if (isCash && !o.settled) {
                pendingCash += Number(o.total || 0);
            }

            // Calculate delivery duration
            if (o.pickedUpAt && o.deliveredAt) {
                const duration = (o.deliveredAt - o.pickedUpAt) / 60000; // minutes
                if (duration > 0 && duration < 300) { // filter outliers
                    totalDeliveryTime += duration;
                    deliveryTimeCount++;
                }
            }
        }
    });

    // Look up rider rating from stats data
    const riderStats = riderId ? (state.riderStatsData?.[riderId] || {}) : {};

    return {
        totalEarnings,
        deliveredCount,
        pendingCash,
        avgTime: deliveryTimeCount > 0 ? Math.round(totalDeliveryTime / deliveryTimeCount) : 0,
        avgRating: riderStats.avgRating || null
    };
}

/**
 * UPDATE KPI ELEMENTS
 */
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

/**
 * RENDER DETAILED TABLE
 */
function renderRiderTable(orders) {
    const tbody = document.getElementById('riderAnalyticsTableBody');
    if (!tbody) return;

    // Sort by date desc
    orders.sort((a, b) => {
        const aTime = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime() || 0;
        const bTime = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime() || 0;
        return bTime - aTime;
    });

    const displayOrders = orders.slice(0, 50);
    const totalCount = orders.length;

    tbody.innerHTML = displayOrders.map(o => {
        const timeTaken = (o.pickedUpAt && o.deliveredAt) ? Math.round((o.deliveredAt - o.pickedUpAt) / 60000) : '--';
        return `
            <tr class="premium-row-v4">
                <td>
                    <div class="identity-info-v4">
                        <span class="name">${formatDate(o.createdAt)}</span>
                        <span class="sub">${new Date(o.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                </td>
                <td><span class="badge-payment">#${escapeHtml(o.id ? o.id.slice(-5) : 'N/A')}</span></td>
                <td>
                    <div class="identity-info-v4">
                        <span class="name">${escapeHtml(o.customerName || 'Guest')}</span>
                        <span class="sub">${escapeHtml(o.outlet || '')}</span>
                    </div>
                </td>
                <td><span class="text-muted-small">${timeTaken} mins</span></td>
                <td class="text-right font-bold text-orange">₹${Number(o.deliveryFee || 0).toLocaleString()}</td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="5" class="text-center py-20 text-muted">No deliveries found for this period.</td></tr>';

    if (totalCount > 50) {
        tbody.innerHTML += `<tr><td colspan="5" class="text-center py-10 text-muted-small">Showing 50 of ${totalCount} deliveries</td></tr>`;
    }
}

/**
 * RENDER EARNINGS TREND CHART
 */
function renderRiderEarningsChart(orders) {
    const ctx = document.getElementById('riderEarningsChart');
    if (!ctx) return;

    // Aggregate by date
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
                scales: {
                    y: { beginAtZero: true, grid: { display: false } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

/**
 * RENDER STATUS SUMMARY CARD
 */
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

/**
 * EXPORT OPTIONS
 */
export async function exportRiderReport(type) {
    const riderSelect = document.getElementById('riderSelectAnalytics');
    const riderName = riderSelect.options[riderSelect.selectedIndex].text;
    const fromDate = document.getElementById('riderReportFrom').value;
    const toDate = document.getElementById('riderReportTo').value;

    const tbody = document.getElementById('riderAnalyticsTableBody');
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(row => row.querySelectorAll('td').length >= 5);

    if (rows.length === 0 || rows[0].innerText.includes('No deliveries')) {
        showToast("No data to export", "warning");
        return;
    }

    const reportData = rows.map(row => {
        const cells = row.querySelectorAll('td');
        return {
            Date: cells[0].querySelector('.name').innerText,
            Time: cells[0].querySelector('.sub').innerText,
            Order: cells[1].innerText,
            Customer: cells[2].querySelector('.name').innerText,
            Outlet: cells[2].querySelector('.sub').innerText,
            Duration: cells[3].innerText,
            Earnings: cells[4].innerText.replace('₹', '')
        };
    });

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
            if (!window.jspdf) {
                showToast("PDF library not loaded", "error");
                return;
            }
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

/**
 * TRIGGER SETTLEMENT FROM ANALYTICS
 */
export async function settleRiderBalanceAnalytics() {
    const riderId = document.getElementById('riderSelectAnalytics').value;
    if (!riderId) {
        showToast("Please select a rider first", "warning");
        return;
    }

    const rider = state.ridersList.find(r => r.id === riderId);
    const riderName = rider ? rider.name : "Rider";

    // Respect the selected date range for settlement
    const fromDateStr = document.getElementById('riderReportFrom').value;
    const customLimit = fromDateStr ? new Date(fromDateStr).getTime() : null;

    // Call the shared settlement logic from riders.js
    await settleRiderWallet(riderId, riderName, customLimit);

    // Refresh report to reflect changes
    generateRiderPerformanceReport();
}

/**
 * ROSHANI ERP | RIDER INTELLIGENCE
 * Analytics and performance monitoring for delivery personnel.
 */

import { db, Outlet } from '../firebase.js';
import { state } from '../state.js';
import { escapeHtml, showToast, formatDate } from '../utils.js';

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
    
    const formatDateInput = (d) => d.toISOString().split('T')[0];
    
    const fromInput = document.getElementById('riderReportFrom');
    const toInput = document.getElementById('riderReportTo');
    
    if (fromInput && !fromInput.value) fromInput.value = formatDateInput(lastWeek);
    if (toInput && !toInput.value) toInput.value = formatDateInput(today);

    // Populate rider select
    populateRiderSelect();

    // Event Listeners
    document.getElementById('btnGenerateRiderReport')?.addEventListener('click', generateRiderPerformanceReport);
    document.getElementById('btnRiderExportExcel')?.addEventListener('click', () => exportRiderReport('excel'));
    document.getElementById('btnRiderExportPDF')?.addEventListener('click', () => exportRiderReport('pdf'));
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

    const fromStr = `${fromDateStr}T00:00:00.000Z`;
    const toStr = `${toDateStr}T23:59:59.999Z`;

    const btn = document.getElementById('btnGenerateRiderReport');
    btn.disabled = true;
    btn.innerHTML = 'Analyzing...';

    try {
        // Fetch all orders for both outlets to filter
        // Note: In a large system, we'd use Firebase queries, 
        // but here we already have some data in state or can fetch the range.
        
        const pizzaOrdersSnap = await db.ref("pizza/orders").orderByChild("createdAt").startAt(fromStr).endAt(toStr).once('value');
        const cakeOrdersSnap = await db.ref("cake/orders").orderByChild("createdAt").startAt(fromStr).endAt(toStr).once('value');
        
        const allOrders = [];
        const processSnap = (snap, outlet) => {
            snap.forEach(child => {
                const o = child.val();
                if (o.riderId === riderId) {
                    allOrders.push({ id: child.key, outlet, ...o });
                }
            });
        };

        processSnap(pizzaOrdersSnap, 'Pizza');
        processSnap(cakeOrdersSnap, 'Cake');

        // Calculate Stats
        const stats = calculateRiderStats(allOrders);
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
function calculateRiderStats(orders) {
    let totalEarnings = 0;
    let deliveredCount = 0;
    let totalDeliveryTime = 0; // in minutes
    let deliveryTimeCount = 0;

    orders.forEach(o => {
        if (o.status === "Delivered") {
            deliveredCount++;
            
            // Assuming delivery fee is what rider earns
            // Or use a fixed payout if defined in settings
            totalEarnings += (Number(o.deliveryFee) || 0);

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

    return {
        totalEarnings,
        deliveredCount,
        avgTime: deliveryTimeCount > 0 ? Math.round(totalDeliveryTime / deliveryTimeCount) : 0,
        rating: 4.8 // Mock rating for now or fetch from feedback
    };
}

/**
 * UPDATE KPI ELEMENTS
 */
function updateRiderKPIs(stats) {
    document.getElementById('riderStatEarnings').innerText = `₹${stats.totalEarnings.toLocaleString()}`;
    document.getElementById('riderStatDeliveries').innerText = stats.deliveredCount;
    document.getElementById('riderStatAvgTime').innerText = `${stats.avgTime}m`;
    document.getElementById('riderStatRating').innerText = stats.rating.toFixed(1);
}

/**
 * RENDER DETAILED TABLE
 */
function renderRiderTable(orders) {
    const tbody = document.getElementById('riderAnalyticsTableBody');
    if (!tbody) return;

    // Sort by date desc
    orders.sort((a, b) => b.createdAt - a.createdAt);

    tbody.innerHTML = orders.map(o => {
        const timeTaken = (o.pickedUpAt && o.deliveredAt) ? Math.round((o.deliveredAt - o.pickedUpAt) / 60000) : '--';
        return `
            <tr class="premium-row-v4">
                <td>
                    <div class="identity-info-v4">
                        <span class="name">${formatDate(o.createdAt)}</span>
                        <span class="sub">${new Date(o.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                </td>
                <td><span class="badge-payment">#${o.id.slice(-5)}</span></td>
                <td>
                    <div class="identity-info-v4">
                        <span class="name">${escapeHtml(o.customerName || 'Guest')}</span>
                        <span class="sub">${o.outlet}</span>
                    </div>
                </td>
                <td><span class="text-muted-small">${timeTaken} mins</span></td>
                <td class="text-right font-bold text-orange">₹${o.deliveryFee || 0}</td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="5" class="text-center py-20 text-muted">No deliveries found for this period.</td></tr>';
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
            const dateStr = new Date(o.createdAt).toISOString().split('T')[0];
            dailyEarnings[dateStr] = (dailyEarnings[dateStr] || 0) + (Number(o.deliveryFee) || 0);
        }
    });

    const labels = Object.keys(dailyEarnings).sort();
    const values = labels.map(l => dailyEarnings[l]);

    if (riderEarningsChart) riderEarningsChart.destroy();

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
            <p class="text-muted-small mb-15">${rider.email}</p>
            
            <div class="flex-row flex-between w-full p-10-0 border-top-dashed">
                <span class="text-muted-small">Completion Rate</span>
                <span class="font-bold text-success">98%</span>
            </div>
            <div class="flex-row flex-between w-full p-10-0 border-top-dashed">
                <span class="text-muted-small">Level</span>
                <span class="badge-payment">Gold Pro</span>
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
    const rows = Array.from(tbody.querySelectorAll('tr'));

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
        const { jsPDF } = window.jspdf;
        if (jsPDF) {
            const doc = new jsPDF();
            doc.setFontSize(20);
            doc.setTextColor(243, 107, 33);
            doc.text("Rider Performance Report", 14, 22);
            
            doc.setFontSize(11);
            doc.setTextColor(100);
            doc.text(`Rider: ${riderName}`, 14, 30);
            doc.text(`Period: ${fromDate} to ${toDate}`, 14, 35);

            const tableRows = reportData.map(d => [d.Date, d.Order, d.Customer, d.Duration, `INR ${d.Earnings}`]);
            
            doc.autoTable({
                head: [['Date', 'Order #', 'Customer', 'Duration', 'Earnings']],
                body: tableRows,
                startY: 45,
                theme: 'grid',
                headStyles: { fillColor: [243, 107, 33] }
            });

            doc.save(`Rider_Report_${riderName.replace(/\s+/g, '_')}.pdf`);
            showToast("PDF report downloaded", "success");
        } else {
            showToast("PDF library not loaded", "error");
        }
    }
}

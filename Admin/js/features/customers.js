import { state } from '../state.js';
import { Outlet } from '../firebase.js';
import { ui } from '../ui.js';
import { logAudit, escapeHtml, formatDate, haptic } from '../utils.js';

// --- CUSTOMERS ---

/**
 * Loads and renders the customer table with LTV and order count.
 */
export function loadCustomers() {
    const table = document.getElementById("customersTableBody") || document.getElementById("customersTable");
    if (!table) return;

    Promise.all([
        Outlet.ref("customers").once("value"),
        Outlet.ref("orders").once("value")
    ]).then(([custSnap, orderSnap]) => {
        const orders = [];
        orderSnap.forEach(o => { orders.push(o.val()); });

        table.innerHTML = "";
        custSnap.forEach(child => {
            const c = child.val();
            const phone = child.key;

            const myOrders = orders.filter(o => o.phone === phone);
            const orderCount = myOrders.length;
            const ltv = myOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

            const displayPhone = phone; 
            const truncatedAddress = c.address ? (c.address.length > 30 ? c.address.substring(0, 30) + "..." : c.address) : "Counter Sale / Guest";

            table.innerHTML += `
                <tr class="premium-row-v4">
                    <td data-label="Customer">
                        <div class="identity-chip-v4">
                            <div class="kpi-icon-box glass" style="width:32px; height:32px; font-size:14px;">
                                <i data-lucide="user"></i>
                            </div>
                            <div class="identity-info-v4">
                                <span class="name">${escapeHtml(c.name || 'Anonymous')}</span>
                                <span class="sub">Joined: ${c.registeredAt ? new Date(c.registeredAt).toLocaleDateString() : 'N/A'}</span>
                            </div>
                        </div>
                    </td>
                    <td data-label="WhatsApp">
                        <div class="identity-info-v4">
                            <a href="https://wa.me/91${phone.replace(/\D/g, "").slice(-10)}" target="_blank" rel="noopener noreferrer" class="link-premium font-bold" style="display:flex; align-items:center; gap:5px;">
                                 <i data-lucide="message-square" style="width:12px;"></i> ${escapeHtml(displayPhone)}
                            </a>
                        </div>
                    </td>
                    <td data-label="Address">
                        <div class="identity-info-v4">
                            <span class="sub" title="${escapeHtml(c.address || '')}">${escapeHtml(truncatedAddress)}</span>
                            ${c.locationLink ? `<a href="${escapeHtml(c.locationLink)}" target="_blank" rel="noopener noreferrer" class="link-premium fs-10 font-bold">📍 VIEW MAP</a>` : ""}
                        </div>
                    </td>
                    <td data-label="Orders">
                        <div class="flex-col">
                            <span class="font-bold color-primary">${orderCount}</span>
                            <span class="text-muted-small">Purchases</span>
                        </div>
                    </td>
                    <td data-label="Value" class="text-right">
                        <div class="flex-col pr-15">
                            <span class="font-bold fs-15">₹${ltv.toLocaleString()}</span>
                            <span class="text-muted-small">LTV</span>
                        </div>
                    </td>
                </tr>
            `;
        });
        if (window.lucide) window.lucide.createIcons(table);
    });
}

// --- REPORTS & ANALYTICS ---

let salesData = []; // Module scoped for exports

/**
 * Initializes the reports view with default date range.
 */
export function loadReports() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = now.toISOString().split('T')[0];

    if (document.getElementById("reportFrom")) document.getElementById("reportFrom").value = firstDay;
    if (document.getElementById("reportTo")) document.getElementById("reportTo").value = lastDay;

    generateCustomReport();
}

/**
 * Generates a sales report based on the selected date range.
 */
export function generateCustomReport() {
    const fromInput = document.getElementById("reportFrom");
    const toInput = document.getElementById("reportTo");
    const from = fromInput?.value?.trim() || '';
    const to = toInput?.value?.trim() || '';
    const tableBody = document.getElementById("reportTableBody");
    if (!tableBody) return;

    // Validate date inputs
    if (!from || !to) {
        showToast("Please select both start and end dates for filtering", "warning");
        tableBody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:30px; color:var(--text-muted);'>Please select a date range to view reports.</td></tr>";
        return;
    }

    const fromDateObj = new Date(from);
    const toDateObj = new Date(to);
    if (isNaN(fromDateObj.getTime()) || isNaN(toDateObj.getTime())) {
        showToast("Invalid date format selected", "error");
        return;
    }

    tableBody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:30px;'>🔔 Collecting sales data...</td></tr>";

    const ordersRef = Outlet.ref("orders");
    console.log(`[Reports] Generating report from path: ${ordersRef.toString()}`);
    
    ordersRef.once("value", snap => {
        let totalRev = 0;
        let totalOrd = 0;
        salesData = [];

        snap.forEach(child => {
            const o = child.val();
            // Standardize outlet comparison
            if (o.outlet && state.currentOutlet && o.outlet.toLowerCase().trim() !== state.currentOutlet.toLowerCase().trim()) return;
            if (o.status === "Cancelled") return;
            
            let itemDate;
            try {
                itemDate = new Date(o.createdAt);
            } catch (e) { return; }

            if (isNaN(itemDate.getTime())) return;
            const dateStr = itemDate.toISOString().split('T')[0];

            // Apply date filter only if both dates are provided
            const shouldInclude = (!from || !to) || (dateStr >= from && dateStr <= to);
            if (shouldInclude) {
                totalRev += Number(o.total || 0);
                totalOrd++;
                salesData.push({ id: child.key, ...o, dateStr });
            }
        });

        // Update KPI Cards & Period
        const fromDate = from ? formatDate(new Date(from).getTime()) : "Start";
        const toDate = to ? formatDate(new Date(to).getTime()) : "Today";
        const periodEl = document.getElementById("reportPeriod");
        if (periodEl) periodEl.innerText = `${fromDate} to ${toDate}`;

        const revEl = document.getElementById("reportRevenue");
        const ordEl = document.getElementById("reportOrders");
        const avgEl = document.getElementById("reportAvg");

        if (revEl) revEl.innerText = "₹" + totalRev.toLocaleString();
        if (ordEl) ordEl.innerText = totalOrd;
        if (avgEl) avgEl.innerText = "₹" + (totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0);

        // Sort by date descending
        salesData.sort((a, b) => b.createdAt - a.createdAt);

        // Render Table
        tableBody.innerHTML = salesData.map(o => `
            <tr class="premium-row-v4">
                <td data-label="Date">
                    <div class="identity-info-v4">
                        <span class="name">${formatDate(o.createdAt)}</span>
                        <span class="sub">#${escapeHtml(o.orderId || o.id.slice(-5))}</span>
                    </div>
                </td>
                <td data-label="Customer">
                    <div class="identity-info-v4">
                        <span class="name">${escapeHtml(o.customerName || 'Guest')}</span>
                        <span class="sub">${escapeHtml(o.phone || '')}</span>
                    </div>
                </td>
                <td data-label="Total">
                    <span class="font-bold text-orange">₹${o.total || 0}</span>
                </td>
                <td data-label="Method">
                    <span class="badge-payment">${escapeHtml(o.paymentMethod || 'COD')}</span>
                </td>
                 <td data-label="Items">
                      ${(() => {
                          const rawItems = o.cart || o.items || [];
                          const itemsList = Array.isArray(rawItems) ? rawItems : Object.values(rawItems);
                          const finalItems = itemsList.length ? itemsList : (o.item ? [{name: o.item, qty: 1}] : []);
                          const displayStr = finalItems.length ? finalItems.map(i => `${escapeHtml(i.name || i.item || 'Item')} x${i.qty || i.quantity || 1}`).join(', ') : 'No items';
                          return `<div class="text-muted-small text-truncate" style="max-width:250px;" title="${displayStr}">${displayStr}</div>`;
                      })()}
                 </td>
            </tr>
        `).join('') || "<tr><td colspan='5' class='report-cell text-center py-30 text-muted'>No orders found for this range</td></tr>";

        // Render visual chart
        renderRevenueChart(salesData);
    });
}

let revenueChart; // Chart instance
export function renderRevenueChart(data) {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    // Aggregate by date
    const dailyData = {};
    data.forEach(o => {
        dailyData[o.dateStr] = (dailyData[o.dateStr] || 0) + Number(o.total || 0);
    });

    const labels = Object.keys(dailyData).sort();
    const values = labels.map(l => dailyData[l]);

    if (revenueChart) revenueChart.destroy();

    const isDarkMode = document.body.classList.contains('dark-mode');
    const tickColor = isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
    const gridColor = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    // Chart.js is assumed to be globally available via script tag
    if (typeof Chart !== 'undefined') {
        revenueChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Daily Revenue',
                    data: values,
                    borderColor: '#FF6B00',
                    backgroundColor: 'rgba(255, 107, 0, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#FF6B00',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: { color: tickColor, font: { size: 10 } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: tickColor, font: { size: 10 } }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }
}

/**
 * Exports sales data to Excel format.
 */
export function downloadExcel() {
    if (salesData.length === 0) {
        ui.showToast("No data to export.", "info");
        return;
    }

    const data = salesData.map(o => ({
        Date: formatDate(o.createdAt),
        "Order ID": o.orderId || o.id,
        Customer: o.customerName || 'Guest',
        Phone: o.phone || '',
        Total: o.total || 0,
        Method: o.paymentMethod || 'COD',
        Status: o.status,
        Items: (() => {
            const rawItems = o.cart || (Array.isArray(o.items) ? o.items : Object.values(o.items || {}));
            const items = rawItems.length ? rawItems : (o.item ? [{name: o.item, qty: 1}] : []);
            return items.map(i => `${i.name || i.item} x${i.qty || i.quantity || 1}`).join(', ');
        })()
    }));

    // XLSX is assumed to be globally available via script tag
    if (typeof XLSX !== 'undefined') {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sales Report");
        XLSX.writeFile(wb, `Sales_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
        ui.showToast("Excel library not loaded.", "error");
    }
}

/**
 * Exports sales data to PDF format.
 */
export function downloadPDF() {
    if (salesData.length === 0) {
        ui.showToast("No data available to export. Generate a report first.", "warning");
        return;
    }

    if (!window.jspdf) {
        ui.showToast("PDF export library not ready. Please refresh and try again.", "error");
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    if (typeof doc.autoTable !== 'function') {
        ui.showToast("PDF table plugin not ready. Please refresh and try again.", "error");
        return;
    }

    doc.setFontSize(20);
    doc.text("Sales Report", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);

    const from = document.getElementById("reportFrom")?.value || "";
    const to = document.getElementById("reportTo")?.value || "";
    doc.text(`Period: ${from} to ${to}`, 14, 30);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 36);

    const tableData = salesData.map(o => [
        formatDate(o.createdAt),
        o.customerName || 'Guest',
        `Rs. ${o.total}`,
        o.paymentMethod || 'COD',
        (() => {
            const rawItems = o.cart || (Array.isArray(o.items) ? o.items : Object.values(o.items || {}));
            const items = rawItems.length ? rawItems : (o.item ? [{name: o.item, qty: 1}] : []);
            return items.map(i => `${i.name || i.item} x${i.qty || i.quantity || 1}`).join(', ');
        })()
    ]);

    doc.autoTable({
        startY: 45,
        head: [['Date', 'Customer', 'Total', 'Method', 'Items']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [6, 95, 70] },
        columnStyles: {
            4: { cellWidth: 60 }
        }
    });
    doc.save(`Sales_Report_${from}_to_${to}.pdf`);
}

// --- LOST SALES ---

/**
 * Loads abandoned cart / lost sales records.
 */
export async function loadLostSales() {
    console.log("[Lost Sales] Loading records...");
    const tbody = document.getElementById('lostSalesTableBody');
    const revenueBadge = document.querySelector('#lostSalesTotalRevenue span');
    if (!tbody) return;

    try {
        const lostRef = Outlet.ref('logs/lostSales');
        console.log(`[Lost Sales] Fetching from path: ${lostRef.toString()}`);
        const snap = await lostRef.once('value');
        const data = snap.val();

        tbody.innerHTML = '';
        let totalLost = 0;

        if (!data) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:80px; color:var(--text-muted);">
            <div class="mb-14" style="font-size:32px;">🛍️ </div>
            <strong>No lost sales found!</strong><br>All your customers are reaching the finish line.
        </td></tr>`;
            if (revenueBadge) revenueBadge.innerText = `₹0`;
            return;
        }

        const sorted = Object.entries(data).sort((a, b) => (b[1].cancelledAt || 0) - (a[1].cancelledAt || 0));

        sorted.forEach(([id, record]) => {
            const val = record.total || 0;
            totalLost += val;

            const rawItems = record.cart || (Array.isArray(record.items) ? record.items : Object.values(record.items || {}));
            const items = rawItems.length ? rawItems : (record.item ? [{name: record.item, size: record.size}] : []);
            const itemsStr = items.map(i => `${i.name || i.item} (${i.size || 'N/A'})`).join(', ');
            const ts = formatDate(record.cancelledAt);
            const source = record.sourceStep || 'Checkout';

            const phone = record.phone || 'N/A';
            const whatsappLink = `https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}`;

            const tr = document.createElement('tr');
            tr.className = "premium-row-v4";
            tr.innerHTML = `
            <td data-label="Date" class="p-l-25">
                <div class="identity-info-v4">
                    <span class="name">${ts}</span>
                    <span class="sub">ID: ...${id.slice(-6)}</span>
                </div>
            </td>
            <td data-label="Customer">
                <div class="identity-info-v4">
                    <span class="name">${escapeHtml(record.customerName || 'Guest')}</span>
                    <a href="${whatsappLink}" target="_blank" rel="noopener noreferrer" class="text-primary font-bold" style="font-size:12px; text-decoration:none;">📱 ${escapeHtml(phone)}</a>
                </div>
            </td>
            <td data-label="Step">
                <span class="status-pill" style="background:rgba(0,0,0,0.05); color:var(--text-dark); border:1px solid rgba(0,0,0,0.1); font-size:10px;">
                    ${escapeHtml(source)}
                </span>
            </td>
            <td data-label="Items" style="max-width:250px;">
                <div class="identity-info-v4">
                    <span class="sub text-truncate-2" title="${escapeHtml(itemsStr)}">${escapeHtml(itemsStr)}</span>
                </div>
            </td>
            <td data-label="Value" class="p-r-25 text-right">
                <span class="font-bold text-orange" style="font-size:16px;">₹${val}</span>
            </td>
        `;
            tbody.appendChild(tr);
        });

        if (revenueBadge) revenueBadge.innerText = `₹${totalLost.toLocaleString()}`;

    } catch (e) {
        console.error("Load Lost Sales Error:", e);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:red;">Error loading data. Check console.</td></tr>`;
    }
}

/**
 * Clears all lost sales logs.
 */
export async function clearLostSales() {
    if (!(await ui.showConfirm("Are you sure you want to permanently delete all Lost Sales logs? This cannot be undone.", "Clear Lost Sales"))) return;

    haptic(20);
    try {
        await Outlet.ref('logs/lostSales').remove();
        logAudit("Maintenance", "Cleared All Lost Sales Logs", "Global");
        ui.showToast("Logs cleared successfully", "success");
        loadLostSales();
    } catch (e) {
        console.error("Clear Logs Error:", e);
        ui.showToast("Failed to clear logs", "error");
    }
}

export function filterCustomers(searchTerm) {
    const term = (searchTerm || '').toLowerCase().trim();
    const rows = document.querySelectorAll('#customersTableBody tr');
    
    rows.forEach(row => {
        if (!term) {
            row.style.display = '';
            return;
        }
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

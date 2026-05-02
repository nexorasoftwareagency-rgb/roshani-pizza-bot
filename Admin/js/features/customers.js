import { state } from '../state.js';
import { Outlet } from '../firebase.js';
import { ui } from '../ui.js';
import { logAudit, escapeHtml, formatDate, haptic } from '../utils.js';

// --- CUSTOMERS ---

/**
 * Loads and renders the customer table with LTV and order count.
 */
export function loadCustomers() {
    const table = document.getElementById("customersTable");
    if (!table) return;

    // Fetch both to correlate
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

            // Calculate stats
            const myOrders = orders.filter(o => o.phone === phone);
            const orderCount = myOrders.length;
            const ltv = myOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

            // PII Policy: Do not mask phone numbers (requested by user)
            // But we keep the displayPhone variable for consistent UI if needed.
            // USER explicitly said "do not mask phone numbers" in phase 2.
            const displayPhone = phone; 
            const truncatedAddress = c.address ? (c.address.length > 30 ? c.address.substring(0, 30) + "..." : c.address) : "No address saved";

            table.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05)">
                    <td data-label="Name">
                        <div style="font-weight:600; color:var(--text-main)">${escapeHtml(c.name)}</div>
                        <small style="color:var(--text-muted); font-size:10px;">Joined: ${c.registeredAt ? new Date(c.registeredAt).toLocaleDateString() : 'N/A'}</small>
                    </td>
                    <td data-label="WhatsApp">
                        <a href="https://wa.me/91${phone.replace(/\D/g, "").slice(-10)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary); text-decoration:none; display:flex; align-items:center; gap:5px;">
                             <i class="fab fa-whatsapp"></i> ${escapeHtml(displayPhone)}
                        </a>
                    </td>
                    <td data-label="Last Address">
                        <div style="font-size:12px; color:var(--text-main); max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(c.address || '')}">
                            ${escapeHtml(truncatedAddress)}
                        </div>
                        ${c.locationLink ? `<a href="${escapeHtml(c.locationLink)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary); font-size:10px; text-decoration:none;">📍 Map Link</a>` : ""}
                    </td>
                    <td data-label="Orders" style="font-weight:600; color:var(--vibrant-orange)">${orderCount}</td>
                    <td data-label="LTV" style="font-weight:700; color:var(--warm-yellow)">₹${ltv.toLocaleString()}</td>
                </tr>
            `;
        });
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

    // Validate date inputs - if missing/empty, show feedback and skip filtering
    if ((fromInput && !from) || (toInput && !to)) {
        showToast("Please select both start and end dates for filtering", "warning");
        // Proceed with no filtering (show all data) rather than showing nothing
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
            <tr class="report-row-bordered">
                <td data-label="Date" class="report-cell report-date-cell">${formatDate(o.createdAt)}</td>
                <td data-label="Customer" class="report-cell">
                     <div class="report-cust-name">${escapeHtml(o.customerName || 'Guest')}</div>
                    <div class="report-cust-phone">${escapeHtml(o.phone || '')}</div>
                </td>
                <td data-label="Total" class="report-cell report-total-cell">₹${o.total || 0}</td>
                <td data-label="Method" class="report-cell"><span class="badge badge-secondary">${escapeHtml(o.paymentMethod || 'COD')}</span></td>
                <td data-label="Items" class="report-cell">
                     ${(() => {
                         const rawList = o.cart || (Array.isArray(o.items) ? o.items : Object.values(o.items || {}));
                         const itemsList = rawList.length ? rawList : (o.item ? [{name: o.item, qty: 1}] : []);
                         const displayStr = itemsList.length ? itemsList.map(i => `${escapeHtml(i.name || i.item)} x${i.qty || i.quantity || 1}`).join(', ') : 'Empty';
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
            tr.innerHTML = `
            <td style="padding-left:25px;">
                <div class="font-bold text-main">${ts}</div>
                <div class="text-muted-small" style="font-size:10px;">ID: ...${id.slice(-6)}</div>
            </td>
            <td>
                <div class="flex-column">
                    <span class="font-bold">${escapeHtml(record.customerName || 'Guest')}</span>
                    <a href="${whatsappLink}" target="_blank" rel="noopener noreferrer" class="text-primary font-bold" style="font-size:12px;">📱 ${escapeHtml(phone)}</a>
                </div>
            </td>
            <td>
                <span class="status-pill" style="background:rgba(0,0,0,0.05); color:var(--text-dark); border:1px solid rgba(0,0,0,0.1); font-size:10px;">
                    ${escapeHtml(source)}
                </span>
            </td>
            <td style="max-width:250px;">
                <div class="text-truncate-2" title="${escapeHtml(itemsStr)}">${escapeHtml(itemsStr)}</div>
            </td>
            <td style="padding-right:25px; text-align:right;">
                <span class="font-black" style="font-size:16px; color:var(--text-dark);">₹${val}</span>
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
    const rows = document.querySelectorAll('#customersTable tr');
    
    rows.forEach(row => {
        if (!term) {
            row.style.display = '';
            return;
        }
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

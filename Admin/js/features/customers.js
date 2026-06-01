import { state } from '../state.js';
import { Outlet, get, query, orderByChild, startAt, endAt, remove } from '../firebase.js';
import { showBulkDeleteConfirm } from '../ui-utils.js';
import { ui } from '../ui.js';
import { showToast, logAudit, escapeHtml, formatDate, haptic, getISTDateString, initPagination, getSkeletonRows } from '../utils.js';
const CUSTOMERS_PAGE_SIZE = 25;
let _customersData = [];
function renderCustomersPage(page) {
    const table = document.getElementById("customersTableBody") || document.getElementById("customersTable");
    if (!table) return;
    const start = (page - 1) * CUSTOMERS_PAGE_SIZE;
    const pageItems = _customersData.slice(start, start + CUSTOMERS_PAGE_SIZE);
    table.innerHTML = pageItems.map(item => `
        <tr class="premium-row-v4">
            <td data-label="Customer">
                <div class="identity-chip-v4">
                    <div class="kpi-icon-box glass" style="width:32px; height:32px; font-size:14px;">
                        <i data-lucide="user"></i>
                    </div>
                    <div class="identity-info-v4">
                        <span class="name">${escapeHtml(item.name)}</span>
                        <span class="sub">Joined: ${item.joined}</span>
                    </div>
                </div>
            </td>
            <td data-label="WhatsApp">
                <div class="identity-info-v4">
                    <a href="https://wa.me/91${item.phoneClean}" target="_blank" rel="noopener noreferrer" class="link-premium font-bold" style="display:flex; align-items:center; gap:5px;">
                         <i data-lucide="message-square" style="width:12px;"></i> ${escapeHtml(item.displayPhone)}
                    </a>
                </div>
            </td>
            <td data-label="Address">
                <div class="identity-info-v4">
                    <span class="sub" title="${escapeHtml(item.addressFull)}">${escapeHtml(item.address)}</span>
                    ${item.locationLink ? `<a href="${escapeHtml(item.locationLink)}" target="_blank" rel="noopener noreferrer" class="link-premium fs-10 font-bold"> VIEW MAP</a>` : ""}
                </div>
            </td>
            <td data-label="Orders">
                <div class="flex-col">
                    <span class="font-bold color-primary">${item.orderCount}</span>
                    <span class="text-muted-small">Purchases</span>
                </div>
            </td>
            <td data-label="Value" class="text-right">
                <div class="flex-col pr-15">
                    <span class="font-bold fs-15">₹${item.ltv.toLocaleString()}</span>
                    <span class="text-muted-small">LTV</span>
                </div>
            </td>
        </tr>
    `).join('');
    if (window.lucide) window.lucide.createIcons({ root: table });
}

// --- CUSTOMERS ---

/**
 * Loads and renders the customer table with LTV and order count.
 */
export async function loadCustomers() {
    const table = document.getElementById("customersTableBody") || document.getElementById("customersTable");
    if (!table) return;

    // Show skeleton while data loads
    table.innerHTML = getSkeletonRows(5, 5);

    const [custSnap, orderSnap] = await Promise.all([
        get(Outlet.ref("customers")),
        get(Outlet.ref("orders"))
    ]);
    const orders = [];
    orderSnap.forEach(o => { orders.push(o.val()); });

    _customersData = [];
    custSnap.forEach(child => {
        const c = child.val();
        const phone = child.key;
        const myOrders = orders.filter(o => o.phone === phone);
        const orderCount = myOrders.length;
        const ltv = myOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
        _customersData.push({
            name: c.name || 'Anonymous',
            joined: c.registeredAt ? new Date(c.registeredAt).toLocaleDateString() : 'N/A',
            displayPhone: phone,
            phoneClean: phone.replace(/\D/g, "").slice(-10),
            address: c.address ? (c.address.length > 30 ? c.address.substring(0, 30) + "..." : c.address) : "Counter Sale / Guest",
            addressFull: c.address || '',
            locationLink: c.locationLink || '',
            orderCount, ltv
        });
    });
    renderCustomersPage(1);
    initPagination('customersPagination', _customersData.length, CUSTOMERS_PAGE_SIZE, renderCustomersPage);
}

// --- REPORTS & ANALYTICS ---

let salesData = []; // Module scoped for exports

/**
 * Initializes the reports view with default date range.
 */
export function loadReports() {
    const now = Date.now();
    if (state._lastReportFetch && (now - state._lastReportFetch) < 60000) return;
    state._lastReportFetch = now;

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const fromVal = getISTDateString(yesterday);
    const toVal = getISTDateString(today);

    if (document.getElementById("reportFrom")) document.getElementById("reportFrom").value = fromVal;
    if (document.getElementById("reportTo")) document.getElementById("reportTo").value = toVal;

    console.log(`[Reports] Initializing with default range: ${fromVal} to ${toVal}`);
    generateCustomReport();
}

/**
 * Generates a sales report based on the selected date range.
 */
export async function generateCustomReport() {
    const fromInput = document.getElementById("reportFrom");
    const toInput = document.getElementById("reportTo");
    const from = fromInput?.value?.trim() || '';
    const to = toInput?.value?.trim() || '';
    const tableBody = document.getElementById("reportTableBody");
    if (!tableBody) return;

    // Validate date inputs
    if (!from || !to) {
        ui.showToast("Please select both start and end dates for filtering", "warning");
        tableBody.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:30px; color:var(--text-muted);'>Please select a date range to view reports.</td></tr>";
        return;
    }

    const fromDateObj = new Date(from);
    const toDateObj = new Date(to);
    if (isNaN(fromDateObj.getTime()) || isNaN(toDateObj.getTime())) {
        ui.showToast("Invalid date format selected", "error");
        return;
    }

    if (fromDateObj > toDateObj) {
        ui.showToast("Start date must be before end date", "warning");
        return;
    }

    tableBody.innerHTML = getSkeletonRows(5, 6);

    const ordersRef = Outlet.ref("orders");
    console.log(`[Reports] Generating report from path: ${ordersRef.toString()}`);
    
    try {
        console.log(`[Report] Starting generation for ${from} to ${to}...`);
        
        // Broaden range by 1 day to catch IST/UTC drift, then filter strictly client-side
        const dFrom = new Date(from); dFrom.setDate(dFrom.getDate() - 1);
        const dTo = new Date(to); dTo.setDate(dTo.getDate() + 1);
        
        const qStart = `${dFrom.toISOString().split('T')[0]}T00:00:00.000Z`;
        const qEnd = `${dTo.toISOString().split('T')[0]}T23:59:59.999Z`;

        const [customersSnap, ordersSnap] = await Promise.all([
            get(Outlet.ref("customers")),
            get(query(Outlet.ref("orders"), orderByChild("createdAt"), startAt(qStart), endAt(qEnd)))
        ]);

        const customers = customersSnap.val() || {};
        let totalRev = 0;
        let totalOrd = 0;
        salesData = [];

        ordersSnap.forEach(child => {
            const o = child.val();
            if (!o) return;

            // IST Date Normalization
            const dateStr = getISTDateString(o.createdAt);
            
            if (dateStr >= from && dateStr <= to) {
                totalRev += parseFloat(o.total || 0);
                totalOrd++;
                salesData.push({ id: child.key, ...o, dateStr });
            }
        });

        console.log(`[Report] Processed ${salesData.length} orders matching range.`);

        // Update KPI Cards & Period
        const fromDate = from ? formatDate(new Date(from + 'T00:00:00')) : "Start";
        const toDate = to ? formatDate(new Date(to + 'T23:59:59')) : "Today";
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
        tableBody.innerHTML = salesData.map(o => {
            const orderType = escapeHtml(o.type || o.orderType || 'Online');
            const paymentMethod = escapeHtml(o.paymentMethod || 'COD');
            const rawItems = o.cart || o.items || [];
            const itemsList = Array.isArray(rawItems) ? rawItems : Object.values(rawItems);
            const finalItems = itemsList.length ? itemsList : (o.item ? [{name: o.item, qty: 1}] : []);
            const displayStr = finalItems.length ? finalItems.map(i => `${escapeHtml(i.name || i.item || 'Item')} x${i.qty || i.quantity || 1}`).join(', ') : 'No items';

            return `
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
                <td data-label="Order Type">
                    <span class="badge-type badge-${orderType.toLowerCase().replace(/[- ]/g, '')}">${orderType}</span>
                </td>
                <td data-label="Payment">
                    <span class="badge-payment" data-method="${paymentMethod.toLowerCase()}">${paymentMethod}</span>
                </td>
                <td data-label="Items">
                    <div class="text-muted-small text-truncate" style="max-width:200px;" title="${displayStr}">${displayStr}</div>
                </td>
                <td data-label="Total">
                    <span class="font-bold text-orange">₹${o.total || 0}</span>
                </td>
            </tr>`;
        }).join('') || "<tr><td colspan='6' class='report-cell text-center py-30 text-muted'>No orders found for this range</td></tr>";

        // Render visual chart
        renderRevenueChart(salesData);
    } catch (e) {
        console.error("[Reports] Generation Error:", e);
        showToast("Error generating report", "error");
        tableBody.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:30px; color:var(--danger);'>⚠️ Failed to load report data.</td></tr>";
    }
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

    // Chart.js is assumed to be globally available via script tag
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
        "Order Type": o.type || o.orderType || 'Online',
        Payment: o.paymentMethod || 'COD',
        Total: o.total || 0,
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
        o.type || o.orderType || 'Online',
        o.paymentMethod || 'COD',
        `₹${o.total}`,
        (() => {
            const rawItems = o.cart || (Array.isArray(o.items) ? o.items : Object.values(o.items || {}));
            const items = rawItems.length ? rawItems : (o.item ? [{name: o.item, qty: 1}] : []);
            return items.map(i => `${i.name || i.item} x${i.qty || i.quantity || 1}`).join(', ');
        })()
    ]);

    doc.autoTable({
        startY: 45,
        head: [['Date', 'Customer', 'Order Type', 'Payment', 'Total', 'Items']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [6, 95, 70] },
        columnStyles: {
            5: { cellWidth: 50 }
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

    // Show skeleton while data loads
    tbody.innerHTML = getSkeletonRows(5, 5);

    try {
        const lostRef = Outlet.ref('logs/lostSales');
        console.log(`[Lost Sales] Fetching from path: ${lostRef.toString()}`);
        const snap = await get(lostRef);
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
    if (!(await showBulkDeleteConfirm("Lost Sales"))) return;

    haptic(20);
    try {
        await remove(Outlet.ref('logs/lostSales'));
        logAudit("Maintenance", "Cleared All Lost Sales Logs", "Global");
        showToast("Logs cleared successfully", "success");
        loadLostSales();
    } catch (e) {
        console.error("Clear Logs Error:", e);
        showToast("Failed to clear logs", "error");
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

import { Outlet, get } from '../firebase.js';
import {
    escapeHtml,
    initPagination,
    getSkeletonRows
} from '../utils.js';

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

export async function loadCustomers() {
    const table = document.getElementById("customersTableBody") || document.getElementById("customersTable");
    if (!table) return;

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

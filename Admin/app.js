const FIREBASE_URL = "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com";

let lastOrderCount = 0;
let currentReportData = [];

// ---------- FETCH ----------
async function getOrders() {
    const res = await fetch(`${FIREBASE_URL}/orders.json`);
    const data = await res.json();
    if (!data) return [];
    return Object.values(data);
}

// ---------- DASHBOARD ----------
async function loadDashboard() {
    const orders = await getOrders();

    // 🔊 SOUND
    if (orders.length > lastOrderCount) {
        document.getElementById("alertSound").play();
    }
    lastOrderCount = orders.length;

    // COUNTS
    document.getElementById("ordersCount").innerText = orders.length;

    const pendingOrders = orders.filter(o => o.status === "Pending");
    document.getElementById("pending").innerText = pendingOrders.length;

    const deliveryOrders = orders.filter(o => o.status === "Out for delivery");
    document.getElementById("delivery").innerText = deliveryOrders.length;

    const revenue = orders
        .filter(o => o.status === "Delivered")
        .reduce((sum, o) => sum + (o.total || 0), 0);

    document.getElementById("revenue").innerText = revenue;

    // LIVE PENDING
    const container = document.getElementById("liveOrders");
    container.innerHTML = "";

    pendingOrders.forEach(o => {
        container.innerHTML += `
      <div class="order-card new-order">
        <b>🧾 ${o.orderId}</b><br>
        👤 ${o.name}<br>
        💰 ₹${o.total}<br>

        <button onclick="updateStatus('${o.orderId}','Preparing')">
          Start Preparing
        </button>
      </div>
    `;
    });
}

// AUTO REFRESH
setInterval(loadDashboard, 3000);

// ---------- STATUS UPDATE ----------
async function updateStatus(id, status) {
    await fetch(`${FIREBASE_URL}/orders/${id}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
    });

    loadDashboard();
}

// ---------- NAVIGATION ----------
function loadPage(page) {
    const content = document.getElementById("content");
    content.innerHTML = `<h2><span id="loading">⌛ Loading ${page}...</span></h2>`;

    if (page === "dashboard") {
        location.reload();
        return;
    }

    if (page === "reports") {
        showReportPage();
        return;
    }

    if (page === "menu") {
        showMenuPage();
        return;
    }

    if (page === "add") {
        showAddPage();
        return;
    }

    if (page === "stock") {
        showStockPage();
        return;
    }

    if (page === "settings") {
        showSettingsPage();
        return;
    }

    content.innerHTML = `<h2>${page}</h2><p>Module coming soon...</p>`;
}

// ---------- MENU PAGE ----------
async function showMenuPage() {
    const dishes = await fetch(`${FIREBASE_URL}/dishes.json`).then(res => res.json());
    const content = document.getElementById("content");
    
    let html = `<h2>🍕 Menu Management</h2>
    <table border="1" width="100%">
        <thead>
            <tr>
                <th>Image</th>
                <th>Name</th>
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>`;

    for (let id in dishes) {
        const d = dishes[id];
        html += `
            <tr>
                <td><img src="${d.imageUrl}" width="50"></td>
                <td>${d.name}</td>
                <td>₹${d.price}</td>
                <td>${d.isAvailable ? '🟢 Active' : '🔴 Hidden'}</td>
                <td>
                    <button onclick="editItem('${id}')">Edit</button>
                    <button onclick="toggleItem('${id}', ${!d.isAvailable})" style="background:${d.isAvailable ? '#ff4444' : '#44bb44'}">
                        ${d.isAvailable ? 'Disable' : 'Enable'}
                    </button>
                </td>
            </tr>
        `;
    }
    html += `</tbody></table>`;
    content.innerHTML = html;
}

// ---------- ADD ITEM PAGE ----------
async function showAddPage() {
    const cats = await fetch(`${FIREBASE_URL}/categories.json`).then(res => res.json());
    
    let catOptions = "";
    for (let id in cats) {
        catOptions += `<option value="${id}">${cats[id].name}</option>`;
    }

    document.getElementById("content").innerHTML = `
        <h2>➕ Add New Dish</h2>
        <div style="background:white; padding:20px; border-radius:10px; max-width:500px">
            <label>Name:</label><br><input type="text" id="newName" style="width:100%"><br><br>
            <label>Category:</label><br><select id="newCat" style="width:100%">${catOptions}</select><br><br>
            <label>Price:</label><br><input type="number" id="newPrice" style="width:100%"><br><br>
            <label>Image URL:</label><br><input type="text" id="newImg" style="width:100%"><br><br>
            <label>Description:</label><br><textarea id="newDesc" style="width:100%"></textarea><br><br>
            <button onclick="saveNewItem()" style="width:100%">Add to Menu</button>
        </div>
    `;
}

async function saveNewItem() {
    const id = "dish_" + Date.now();
    const item = {
        id,
        name: document.getElementById("newName").value,
        categoryId: document.getElementById("newCat").value,
        price: parseInt(document.getElementById("newPrice").value),
        imageUrl: document.getElementById("newImg").value,
        description: document.getElementById("newDesc").value,
        isAvailable: true,
        priority: 10
    };

    await fetch(`${FIREBASE_URL}/dishes/${id}.json`, {
        method: "PUT",
        body: JSON.stringify(item)
    });

    alert("Item Added!");
    loadPage('menu');
}

// ---------- STOCK PAGE ----------
async function showStockPage() {
    const dishes = await fetch(`${FIREBASE_URL}/dishes.json`).then(res => res.json());
    const content = document.getElementById("content");

    let html = `<h2>📦 Stock Management</h2>
    <table border="1" width="100%">
        <thead>
            <tr>
                <th>Item</th>
                <th>Current Stock</th>
                <th>New Stock</th>
                <th>Action</th>
            </tr>
        </thead>
        <tbody>`;

    for (let id in dishes) {
        const d = dishes[id];
        html += `
            <tr>
                <td>${d.name}</td>
                <td><b>${d.stock || 0}</b></td>
                <td><input type="number" id="stock_${id}" value="${d.stock || 0}" style="width:60px"></td>
                <td><button onclick="updateStock('${id}')">Update</button></td>
            </tr>
        `;
    }
    html += `</tbody></table>`;
    content.innerHTML = html;
}

async function updateStock(id) {
    const stock = parseInt(document.getElementById(`stock_${id}`).value);
    await fetch(`${FIREBASE_URL}/dishes/${id}.json`, {
        method: "PATCH",
        body: JSON.stringify({ stock })
    });
    alert("Stock Updated!");
    showStockPage();
}

// ---------- SETTINGS PAGE ----------
async function showSettingsPage() {
    const config = await fetch(`${FIREBASE_URL}/appConfig.json`).then(res => res.json());

    document.getElementById("content").innerHTML = `
        <h2>⚙️ Shop Settings</h2>
        <div style="background:white; padding:20px; border-radius:10px; max-width:500px">
            <label>Shop Name:</label><br><input type="text" id="setName" value="${config.shopName}" style="width:100%"><br><br>
            <label>Shop Address:</label><br><input type="text" id="setAddr" value="${config.address}" style="width:100%"><br><br>
            <label>Shop Mobile:</label><br><input type="text" id="setPh" value="${config.phone}" style="width:100%"><br><br>
            <label>Delivery Fee (₹):</label><br><input type="number" id="setFee" value="${config.deliveryFee}" style="width:100%"><br><br>
            <button onclick="saveSettings()" style="width:100%">Save Settings</button>
        </div>
    `;
}

async function saveSettings() {
    const config = {
        shopName: document.getElementById("setName").value,
        address: document.getElementById("setAddr").value,
        phone: document.getElementById("setPh").value,
        deliveryFee: parseInt(document.getElementById("setFee").value)
    };

    await fetch(`${FIREBASE_URL}/appConfig.json`, {
        method: "PATCH",
        body: JSON.stringify(config)
    });

    alert("Settings Saved!");
}

async function toggleItem(id, isAvailable) {
    await fetch(`${FIREBASE_URL}/dishes/${id}.json`, {
        method: "PATCH",
        body: JSON.stringify({ isAvailable })
    });
    showMenuPage();
}

// ---------- SHOP TOGGLE ----------
async function toggleShop() {
    const btn = document.getElementById("shopBtn");
    const isOpen = btn.innerText.includes("Open");
    const newStatus = !isOpen;

    await fetch(`${FIREBASE_URL}/appConfig.json`, {
        method: "PATCH",
        body: JSON.stringify({ shopOpen: newStatus })
    });

    btn.innerText = newStatus ? "🟢 Open" : "🔴 Closed";
    btn.style.background = newStatus ? "#44bb44" : "#ff4444";
}

// Update toggleShop on init
async function initShopStatus() {
    const config = await fetch(`${FIREBASE_URL}/appConfig.json`).then(res => res.json());
    const btn = document.getElementById("shopBtn");
    btn.innerText = config.shopOpen ? "🟢 Open" : "🔴 Closed";
    btn.style.background = config.shopOpen ? "#44bb44" : "#ff4444";
}

// ---------- OPEN REPORT ----------
function openReport(type) {
    showReportPage();

    setTimeout(() => {
        loadReportData(type);
    }, 200);
}

// ---------- REPORT UI ----------
function showReportPage() {
    document.getElementById("content").innerHTML = `
    <h2>📊 Reports</h2>

    <input type="date" id="fromDate">
    <input type="date" id="toDate">
    <button onclick="applyFilter()">Filter</button>
    <button onclick="downloadPDF()">Download PDF</button>

    <canvas id="revenueChart" height="100"></canvas>

    <h3>🍕 Top Selling Items</h3>
    <div id="topItems"></div>

    <h3>⏰ Peak Hours</h3>
    <div id="peakHours"></div>

    <table border="1" width="100%" style="margin-top:20px">
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Total</th>
          <th>Status</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody id="reportTable"></tbody>
    </table>
  `;
}

// ---------- LOAD REPORT ----------
async function loadReportData(type) {
    const orders = await getOrders();

    let filtered = [];

    if (type === "all") filtered = orders;

    if (type === "pending")
        filtered = orders.filter(o => o.status === "Pending");

    if (type === "delivery")
        filtered = orders.filter(o => o.status === "Out for delivery");

    if (type === "revenue")
        filtered = orders.filter(o => o.status === "Delivered");

    renderTable(filtered);
}

// ---------- RENDER TABLE ----------
function renderTable(data) {
    currentReportData = data;

    const table = document.getElementById("reportTable");
    table.innerHTML = "";

    data.forEach(o => {
        table.innerHTML += `
      <tr>
        <td>${o.orderId}</td>
        <td>${o.name}</td>
        <td>₹${o.total}</td>
        <td>${o.status}</td>
        <td>${new Date(o.createdAt).toLocaleString()}</td>
      </tr>
    `;
    });

    // ANALYTICS
    const analytics = analyzeData(data);
    renderChart(analytics.revenueByDay);
    renderTopItems(analytics.itemCount);
    renderPeak(analytics.hourCount);
}

// ---------- FILTER ----------
async function applyFilter() {
    const from = new Date(document.getElementById("fromDate").value);
    const to = new Date(document.getElementById("toDate").value);

    const orders = await getOrders();

    const filtered = orders.filter(o => {
        const d = new Date(o.createdAt);
        return d >= from && d <= to;
    });

    renderTable(filtered);
}

// ---------- ANALYTICS ----------
function analyzeData(data) {
    const revenueByDay = {};
    const itemCount = {};
    const hourCount = {};

    data.forEach(o => {
        const date = new Date(o.createdAt);

        const day = date.toISOString().split("T")[0];
        revenueByDay[day] = (revenueByDay[day] || 0) + (o.total || 0);

        o.items?.forEach(i => {
            const name = i.item.name;
            itemCount[name] = (itemCount[name] || 0) + 1;
        });

        const hour = date.getHours();
        hourCount[hour] = (hourCount[hour] || 0) + 1;
    });

    return { revenueByDay, itemCount, hourCount };
}

// ---------- CHART ----------
let chartInstance;

function renderChart(data) {
    const ctx = document.getElementById("revenueChart");

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Object.keys(data),
            datasets: [{
                label: 'Revenue',
                data: Object.values(data)
            }]
        }
    });
}

// ---------- TOP ITEMS ----------
function renderTopItems(itemCount) {
    const sorted = Object.entries(itemCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    let html = "";

    sorted.forEach(i => {
        html += `🍕 ${i[0]} - ${i[1]} orders<br>`;
    });

    document.getElementById("topItems").innerHTML = html;
}

// ---------- PEAK HOURS ----------
function renderPeak(hourCount) {
    let html = "";

    Object.entries(hourCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(h => {
            html += `⏰ ${h[0]}:00 - ${h[1]} orders<br>`;
        });

    document.getElementById("peakHours").innerHTML = html;
}

// ---------- PDF ----------
async function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("Prasant Pizza Report", 20, 20);

    let y = 40;

    currentReportData.forEach((o, i) => {
        doc.text(`${i + 1}. ${o.orderId}`, 10, y); y += 6;
        doc.text(`Name: ${o.name}`, 10, y); y += 6;
        doc.text(`Total: ₹${o.total}`, 10, y); y += 6;
        doc.text(`Status: ${o.status}`, 10, y); y += 10;

        if (y > 280) {
            doc.addPage();
            y = 20;
        }
    });

    doc.save("report.pdf");
}

// ---------- INIT ----------
loadDashboard();
initShopStatus();
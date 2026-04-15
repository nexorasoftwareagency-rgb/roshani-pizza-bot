const db = firebase.database();
const auth = firebase.auth();
const storage = firebase.storage();

// =============================
// FILE UPLOAD UTILITY
// =============================
async function uploadImage(file, path) {
    if (!file) return null;
    const ref = storage.ref(path);
    await ref.put(file);
    return await ref.getDownloadURL();
}

async function deleteImage(url) {
    if (!url || !url.includes("firebasestorage.googleapis.com")) return;
    try {
        const ref = storage.refFromURL(url);
        await ref.delete();
        console.log("Deleted old image:", url);
    } catch (e) {
        console.warn("Failed to delete old image or it doesn't exist:", e.message);
    }
}

// SECONDARY AUTH FOR RIDER CREATION (Avoids logging out admin)
let secondaryAuth;
function initSecondaryAuth() {
    try {
        if (firebase.apps.length > 1) {
            secondaryAuth = firebase.app("secondary").auth();
        } else {
            const secondaryApp = firebase.initializeApp(firebaseConfig, "secondary");
            secondaryAuth = secondaryApp.auth();
        }
    } catch (e) {
        console.error("Secondary Auth Init Error:", e);
        secondaryAuth = firebase.auth(); // Fallback
    }
}
initSecondaryAuth();

let editingDishId = null;

window.showDishModal = async (dishId = null) => {
    editingDishId = dishId;
    const modal = document.getElementById('dishModal');
    if(modal) modal.style.display = 'flex';
    
    const statusLabel = document.getElementById('uploadStatus');
    if(statusLabel) statusLabel.style.display = 'none';

    if (!dishId) {
        document.getElementById('dishName').value = '';
        document.getElementById('dishCategory').value = '';
        document.getElementById('dishPriceBase').value = '';
        document.getElementById('dishImage').value = '';
        document.getElementById('dishPreview').src = "https://via.placeholder.com/100";
        document.getElementById('sizesContainer').innerHTML = '';
        document.getElementById('addonsContainer').innerHTML = '';
    } else {
        const snap = await db.ref(`dishes/${currentOutlet}/${dishId}`).once('value');
        const d = snap.val();
        if(d) {
            document.getElementById('dishName').value = d.name || '';
            document.getElementById('dishCategory').value = d.category || '';
            document.getElementById('dishPriceBase').value = d.price || '';
            document.getElementById('dishImage').value = d.image || '';
            document.getElementById('dishPreview').src = d.image || "https://via.placeholder.com/100";
            
            const sizesContainer = document.getElementById('sizesContainer');
            sizesContainer.innerHTML = '';
            if(d.sizes) {
                Object.entries(d.sizes).forEach(([name, price]) => {
                    window.addSizeField(name, price);
                });
            }

            const addonsContainer = document.getElementById('addonsContainer');
            addonsContainer.innerHTML = '';
            if(d.addons) {
                Object.entries(d.addons).forEach(([name, price]) => {
                    window.addNewAddonField(name, price);
                });
            }
        }
    }
};

function updateActiveDishModalCategories() {
    const select = document.getElementById('dishCategory');
    if (!select) return;
    select.innerHTML = '<option value="">Select Category</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id; // Store ID
        option.innerText = cat.name;
        select.appendChild(option);
    });
}

function previewImage(input, previewId) {
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById(previewId).src = e.target.result;
        }
        reader.readAsDataURL(input.files[0]);
    }
}

// Helpers
function formatDate(ts) {
    if (!ts) return "N/A";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts; // Fallback for raw strings
    return d.toLocaleDateString('en-IN', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
}
const authOverlay = document.getElementById("authOverlay");
const adminEmail = document.getElementById("adminEmail");
const adminPassword = document.getElementById("adminPassword");
const userEmailDisplay = document.getElementById("userEmailDisplay");
const ordersTable = document.getElementById("ordersTable");
const liveOrdersTable = document.getElementById("liveOrdersTable");
const paymentsTable = document.getElementById("paymentsTable");
const authError = document.getElementById("authError");

let currentOutlet = null;
let ridersList = [];
let firstLoad = true;

// Named callbacks stored for safe detachment (prevents memory leaks on logout/re-login)
let _ordersChildCb = null;
let _ordersValueCb = null;

// =============================
// AUTHENTICATION
// =============================
document.getElementById("loginBtn").onclick = () => {
    const email = adminEmail.value;
    const pass = adminPassword.value;

    auth.signInWithEmailAndPassword(email, pass)
        .catch(e => {
            authError.innerText = e.message;
        });
};

window.userLogout = () => auth.signOut();

auth.onAuthStateChanged(async user => {
    if (!user) {
        // Detach persistent listeners to prevent memory leaks on logout
        if (_ordersChildCb) { db.ref("orders").off("child_added", _ordersChildCb); _ordersChildCb = null; }
        if (_ordersValueCb) { db.ref("orders").off("value", _ordersValueCb); _ordersValueCb = null; }
        db.ref("riderStats").off();
        db.ref("riders").off();
        db.ref("Menu/Categories").off();
        if (currentOutlet) db.ref(`dishes/${currentOutlet}`).off();
        authOverlay.style.display = "flex";
        document.querySelector(".layout").style.display = "none";
        return;
    }

    // Verify Admin Role Efficiently
    db.ref("admins").once("value", snap => {
        let isAdmin = false;
        snap.forEach(a => {
            if (a.val().email === user.email) {
                currentOutlet = a.val().outlet;
                document.getElementById("outletBadge").innerText = currentOutlet + " Store";
                isAdmin = true;
            }
        });
        
        // If still not found, check specific keys if they exist
        if(!isAdmin) {
             const pizzaEmail = "roshanipizza@gmail.com";
             currentOutlet = user.email === pizzaEmail ? "pizza" : "cake";
             document.getElementById("outletBadge").innerText = currentOutlet + " Store";
             isAdmin = true;
        }

        if (!isAdmin) {
            alert("SECURITY ALERT: Access Denied.");
            auth.signOut();
            return;
        }

        // If Admin, proceed
        userEmailDisplay.innerText = user.email;
        authOverlay.style.display = "none";
        document.querySelector(".layout").style.display = "flex";
        
        loadRiders(); // Pre-load riders for dropdowns
        initRealtimeListeners();
        switchTab('dashboard');
    });
});

// =============================
// SIDEBAR & TAB MANAGEMENT
// =============================
window.toggleSubmenu = (parentId) => {
    const parent = document.getElementById(parentId);
    const submenu = parent.querySelector('.submenu');
    const isOpen = submenu.classList.contains('open');
    
    // Close others
    document.querySelectorAll('.has-submenu').forEach(el => {
        el.classList.remove('open');
        el.querySelector('.submenu').classList.remove('open');
    });

    if (!isOpen) {
        parent.classList.add('open');
        submenu.classList.add('open');
    }
};

window.switchTab = (tabId) => {
    // Update Sidebar Active States
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
    
    // Check if it's a main item or submenu item
    const mainItem = document.getElementById(`menu-${tabId}`);
    if (mainItem) mainItem.classList.add('active');
    
    // Update Content
    document.querySelectorAll('.tab-content').forEach(div => {
        div.style.display = 'none';
        div.classList.add('hidden');
    });
    const target = document.getElementById(`tab-${tabId}`);
    if (target) {
        target.style.display = 'block';
        target.classList.remove('hidden');
    }

    const titles = {
        'dashboard': 'Dashboard Overview',
        'orders': 'Order History',
        'live': '🔥 Live Operations',
        'menu': 'Dish Management',
        'categories': 'Category Management',
        'riders': 'Rider Management',
        'customers': 'Customer Database',
        'payments': 'Payment Tracking',
        'reports': 'Sales Reports',
        'settings': 'Shop Settings'
    };
    
    document.getElementById('currentTabTitle').innerText = titles[tabId] || 'Management';

    // Section Specific Loaders
    if (tabId === 'menu') loadMenu();
    if (tabId === 'categories') loadCategories();
    if (tabId === 'riders') loadRiders();
    if (tabId === 'customers') loadCustomers();
    if (tabId === 'reports') loadReports();
    if (tabId === 'settings') loadSettings();
};

// =============================
// REAL-TIME LISTENERS
// =============================
function initRealtimeListeners() {
    // Detach any previous listeners first
    if (_ordersChildCb) { db.ref("orders").off("child_added", _ordersChildCb); _ordersChildCb = null; }
    if (_ordersValueCb) { db.ref("orders").off("value", _ordersValueCb); _ordersValueCb = null; }

    let firstLoad = true;

    _ordersChildCb = snap => {
        if (!firstLoad) {
            const order = snap.val();
            order.id = snap.key;
            if (order && (order.outlet === currentOutlet || !currentOutlet)) {
                showAlert(order);
                playSound();
                // Delay highlight slightly to ensure row is rendered by the "value" listener
                setTimeout(() => highlightOrder(order.id), 1000);
            }
        }
    };
    db.ref("orders").on("child_added", _ordersChildCb);

    setTimeout(() => { firstLoad = false; }, 3000);

    _ordersValueCb = snap => { renderOrders(snap); };
    db.ref("orders").on("value", _ordersValueCb, err => console.error("Firebase Read Error:", err));

    // Order Search Logic
    const searchInput = document.getElementById("orderSearch");
    if(searchInput) {
        searchInput.oninput = (e) => {
            const term = e.target.value.toLowerCase();
            const rows = document.querySelectorAll("#ordersTableFull tr");
            rows.forEach(row => {
                row.style.display = row.innerText.toLowerCase().includes(term) ? "" : "none";
            });
        };
    }
}

let alertAudio;

function playSound() {
    if (!alertAudio) {
        alertAudio = new Audio('mixkit-bell-of-promise-930.wav');
        alertAudio.volume = 0.5;
    }
    alertAudio.currentTime = 0;
    alertAudio.play().catch(e => {
        // Fallback to alert.mp3 if premium file missing
        new Audio("alert.mp3").play().catch(() => {});
    });
}

function showAlert(order) {
    const container = document.getElementById('alertContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'alert-box';
    div.innerHTML = `
        <div class="alert-title">🔔 New Order #${order.orderId || order.id.slice(-5)}</div>
        <div class="alert-sub">₹${order.total} • ${order.items?.length || 1} item(s)</div>
    `;

    div.onclick = () => {
        switchTab('orders');
        div.remove();
    };

    container.appendChild(div);

    // 1. play sound slightly after render
    setTimeout(() => { playSound(); }, 80);

    // 2. trigger pulse animation
    setTimeout(() => { div.classList.add('pulse'); }, 300);

    // 3. remove after 5 sec
    setTimeout(() => { div.remove(); }, 5000);
}

function highlightOrder(orderId) {
    setTimeout(() => {
        // 1. Try Anchor Match (Fastest)
        let row = document.getElementById(`row-${orderId}`);
        
        // 2. Fallback to Display ID Scan
        if (!row) {
            const rows = document.querySelectorAll('tr');
            rows.forEach(r => {
                if (r.innerText.includes(orderId.slice(-5))) row = r;
            });
        }

        if (row) {
            row.classList.add('highlight');
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => row.classList.remove('highlight'), 5000);
        }
    }, 120);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function validateUrl(url) {
    if (!url) return false;
    const s = String(url);
    return s.startsWith('https://') || s.startsWith('http://');
}

// =============================
// RENDER ORDERS
// =============================
function renderOrders(snap) {
    let ordersCount = 0, revenue = 0, pending = 0, today = 0, liveCount = 0;
    const todayStr = new Date().toISOString().split('T')[0];

    if (ordersTable) ordersTable.innerHTML = "";
    if (document.getElementById("ordersTableFull")) document.getElementById("ordersTableFull").innerHTML = "";
    if (liveOrdersTable) liveOrdersTable.innerHTML = "";
    if (paymentsTable) paymentsTable.innerHTML = "";

    snap.forEach(child => {
        const id = child.key;
        const o = child.val();

        if (o.outlet !== currentOutlet) return;

        revenue += Number(o.total || 0);
        if (o.createdAt && o.createdAt.startsWith(todayStr)) today++;

        if (o.status === "Delivered") {
            // Collect Item Stats for Dashboard
            if (o.items) {
                o.items.forEach(item => {
                    window.itemStats = window.itemStats || {};
                    window.itemStats[item.name] = (window.itemStats[item.name] || 0) + 1;
                });
            }
        }

        const isLive = ["Placed", "Confirmed", "Preparing", "Cooked", "Out for Delivery"].includes(o.status);
        if (isLive) {
            liveCount++;
            pending++;
        }

        const safeOrderId = escapeHtml(o.orderId || id.slice(-5));
        const safeCustomerName = escapeHtml(o.customerName);
        const safePhone = escapeHtml(o.phone);
        const safeAddress = escapeHtml(o.address);
        const safeLocationLink = validateUrl(o.locationLink) ? escapeHtml(o.locationLink) : '';
        const safeTotal = escapeHtml(o.total);
        const safeStatus = escapeHtml(o.status);
        const safeStatusClass = escapeHtml(o.status?.replace(/ /g, ''));
        const safeAssignedRider = escapeHtml(o.assignedRider);

        const trHTML = `
            <td style="font-family: monospace; font-weight: 600;">#${safeOrderId}</td>
            <td>
                ${safeCustomerName}<br>
                <small style="color:var(--text-muted)">${safePhone}</small>
            </td>
            <td>
                ${safeAddress}
                ${safeLocationLink ? `<br><a href="${safeLocationLink}" target="_blank" style="color:var(--primary); font-size:11px; text-decoration:none;">📍 Map</a>` : ""}
            </td>
            <td style="font-weight:700">₹${safeTotal}</td>
            <td><span class="status ${safeStatusClass}">${safeStatus}</span></td>
            <td>
                <select onchange="updateStatus('${id}', this.value)" style="width:100px">
                    <option value="">Status</option>
                    <option value="Confirmed" ${safeStatus === "Confirmed" ? "selected" : ""}>Confirm</option>
                    <option value="Preparing" ${safeStatus === "Preparing" ? "selected" : ""}>Preparing</option>
                    <option value="Cooked" ${safeStatus === "Cooked" ? "selected" : ""}>Cooked</option>
                    <option value="Out for Delivery" ${safeStatus === "Out for Delivery" ? "selected" : ""}>Out for Delivery</option>
                    <option value="Delivered" ${safeStatus === "Delivered" ? "selected" : ""}>Delivered</option>
                    ${["Placed", "Pending"].includes(safeStatus) ? `<option value="Cancelled" ${safeStatus === "Cancelled" ? "selected" : ""}>Cancel</option>` : ""}
                </select>
                <select onchange="assignRider('${id}', this.value)" style="width:100px; margin-left:5px">
                    <option value="">Rider</option>
                    ${ridersList.map(r => `<option value="${escapeHtml(r.email)}" ${o.assignedRider === r.email ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}
                </select>
            </td>
        `;
        
        // Populate Dashboard Table (Limit to 10)
        if (ordersCount < 10 && ordersTable) {
            const row = document.createElement("tr");
            row.id = `row-${id}`;
            row.innerHTML = trHTML;
            ordersTable.appendChild(row);
            ordersCount++;
        }

        // Populate Order History
        const rowFull = document.createElement("tr");
        rowFull.innerHTML = trHTML;
        if (document.getElementById("ordersTableFull")) document.getElementById("ordersTableFull").appendChild(rowFull);

        // Populate Live Table
        if (isLive && liveOrdersTable) {
            const rowLive = document.createElement("tr");
            const safeItemsHTML = o.items ? o.items.map(i => `<strong>${escapeHtml(i.name)}</strong> (${escapeHtml(i.size)})${i.addons?.length ? '<br>+ ' + i.addons.map(a => escapeHtml(a.name)).join(', ') : ''}`).join('<br>') : '1 item';
            rowLive.innerHTML = `
                <td style="font-family: monospace; font-weight: 600;">#${safeOrderId}</td>
                <td>${safeCustomerName}</td>
                <td>
                    <small>
                        ${safeItemsHTML}
                    </small>
                </td>
                <td style="font-weight:700">₹${safeTotal}</td>
                <td><span class="status ${safeStatusClass}">${safeStatus}</span></td>
                <td>
                    <select onchange="assignRider('${id}', this.value)" style="width:120px">
                        <option value="">Select Rider</option>
                        ${ridersList.map(r => `<option value="${escapeHtml(r.email)}" ${o.assignedRider === r.email ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}
                    </select>
                </td>
                <td>
                    <button onclick="updateStatus('${id}', 'Delivered')" class="btn-primary" style="padding:4px 8px; font-size:11px;">Deliver</button>
                    ${!["Confirmed", "Preparing", "Cooked", "Out for Delivery", "Delivered"].includes(safeStatus) ? `<button onclick="deleteOrder('${id}')" title="Delete" style="background:none; border:none; color:rgba(239,68,68,0.5); font-size:16px; cursor:pointer;">🗑️</button>` : ""}
                </td>
            `;
            liveOrdersTable.appendChild(rowLive);
        }

        // Populate Payments Table
        if (paymentsTable) {
            const rowPay = document.createElement("tr");
            const safePStatus = escapeHtml(o.paymentStatus || "Pending");
            const safePStatusClass = safePStatus.toLowerCase();
            const safePMethod = escapeHtml(o.paymentMethod || 'COD');
            rowPay.innerHTML = `
                <td style="font-family: monospace;">#${safeOrderId}</td>
                <td>${safeCustomerName}</td>
                <td>${safePMethod}</td>
                <td style="font-weight:700">₹${safeTotal}</td>
                <td><span class="status-${safePStatusClass}">${safePStatus}</span></td>
                <td>
                    ${safePStatus === 'Pending' ? `<button onclick="markAsPaid('${id}')" class="btn-secondary" style="padding:4px 8px; font-size:11px;">Mark Paid</button>` : '✅'}
                </td>
            `;
            paymentsTable.appendChild(rowPay);
        }
    });

    // Update Counts
    const liveBadge = document.getElementById("badge-live");
    if (liveBadge) {
        liveBadge.innerText = liveCount;
        liveBadge.style.display = liveCount > 0 ? "inline-block" : "none";
    }

    if (document.getElementById("statOrders")) document.getElementById("statOrders").innerText = liveCount;
    if (document.getElementById("statRevenue")) document.getElementById("statRevenue").innerText = "₹" + revenue.toLocaleString();
    if (document.getElementById("statPending")) document.getElementById("statPending").innerText = pending;
    
    // Populate Dashboard Sidebar Modules
    renderTopItems();
    calculateTopSpenders(snap);
}

function calculateTopSpenders(snap) {
    const spencerStats = {};
    snap.forEach(child => {
        const o = child.val();
        if (o.outlet === currentOutlet && o.status === "Delivered") {
            const key = o.phone || "Unknown";
            if (!spencerStats[key]) {
                spencerStats[key] = { name: o.customerName || "Customer", total: 0, count: 0 };
            }
            spencerStats[key].total += Number(o.total || 0);
            spencerStats[key].count += 1;
        }
    });

    const list = document.getElementById('topCustomersList');
    if (!list) return;

    const sorted = Object.entries(spencerStats)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5);

    list.innerHTML = sorted.map(([phone, data]) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:rgba(255,255,255,0.02); border-radius:12px; border:1px solid rgba(255,255,255,0.05); margin-bottom:10px;">
            <div>
                <div style="font-size:14px; font-weight:700; color:var(--text-main);">${data.name}</div>
                <div style="font-size:11px; color:var(--text-muted)">${phone}</div>
            </div>
            <div style="text-align:right">
                <div style="font-size:14px; font-weight:800; color:var(--action-green)">₹${data.total.toLocaleString()}</div>
                <div style="font-size:10px; color:var(--text-muted); font-weight:600;">${data.count} VISITS</div>
            </div>
        </div>
    `).join('') || '<p style="font-size:12px; color:var(--text-muted); text-align:center; padding:20px;">Waiting for first delivery...</p>';
}

function renderTopItems() {
    const list = document.getElementById('topItemsList');
    if (!list || !window.itemStats) return;

    const sorted = Object.entries(window.itemStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    list.innerHTML = sorted.map(([name, count]) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span style="font-size:14px; font-weight:500; color:white;">${name}</span>
            <span style="font-size:12px; font-weight:700; background:rgba(34,197,94,0.2); color:#22c55e; padding:2px 8px; border-radius:10px;">${count} sold</span>
        </div>
    `).join('') || '<p style="font-size:12px; color:var(--text-muted);">No sales data yet.</p>';
}

window.markAsPaid = (id) => {
    db.ref("orders/" + id).update({ paymentStatus: "Paid" });
};

window.deleteOrder = (id) => {
    // Check status before allowing delete
    db.ref("orders/" + id).once("value", snap => {
        const o = snap.val();
        if (["Confirmed", "Preparing", "Cooked", "Out for Delivery", "Delivered"].includes(o.status)) {
            return alert("Confirmed/Active orders cannot be deleted!");
        }
        if (confirm("Delete this order?")) {
            db.ref("orders/" + id).remove();
        }
    });
};

// =============================
// CATEGORIES
// =============================
// CATEGORIES
function loadCategories() {
    db.ref('Menu/Categories').off(); // Detach previous listener before re-attaching
    db.ref('Menu/Categories').on('value', snap => {
        categories = [];
        const container = document.getElementById('categoryList');
        if (!container) return;
        container.innerHTML = "";
        
        snap.forEach(child => {
            const cat = { id: child.key, ...child.val() };
            if (cat.outlet && cat.outlet !== currentOutlet) return;
            
            categories.push(cat);
            
            const div = document.createElement('div');
            div.className = "glass-card";
            div.style.padding = "15px";
            div.style.display = "flex";
            div.style.alignItems = "center";
            div.style.gap = "15px";
            div.style.borderRadius = "12px";
            div.style.border = "1px solid rgba(0,0,0,0.05)";
            
            div.innerHTML = `
                <img src="${cat.image || 'https://via.placeholder.com/60'}" style="width:60px; height:60px; border-radius:10px; object-fit:cover; border:1px solid rgba(0,0,0,0.05)">
                <div style="flex:1">
                    <h4 style="margin:0; color:var(--text-main); font-weight:700;">${cat.name}</h4>
                    <small style="color:var(--text-muted)">ID: ${child.key.slice(-4)}</small>
                </div>
                <button onclick="deleteCategory('${cat.id}')" style="background:none; border:none; color:#ef4444; font-size:20px; cursor:pointer; opacity:0.6 hover:opacity:1;">&times;</button>
            `;
            container.appendChild(div);
        });
        updateActiveDishModalCategories();
    });
}

async function addCategory() {
    const nameInput = document.getElementById('newCatName');
    const name = nameInput.value.trim();
    if (!name) return alert('Enter category name');

    const fileInput = document.getElementById('catFile');
    const previewImg = document.getElementById('catPreview');
    let imageUrl = "";

    try {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            imageUrl = await uploadImage(file, `categories/${Date.now()}_${file.name}`);
        }

        await db.ref('Menu/Categories').push({
            name: name,
            image: imageUrl,
            outlet: currentOutlet
        });

        nameInput.value = "";
        fileInput.value = "";
        if(previewImg) previewImg.src = "https://via.placeholder.com/40";
        alert('Category added successfully!');
    } catch (err) {
        console.error(err);
        alert('Operation failed: ' + err.message);
    }
}

window.deleteCategory = (id) => {
    if (confirm("Delete this category?")) {
        db.ref('Menu/Categories/' + id).remove();
    }
};

window.addSizeField = (name = "", price = "") => {
    const container = document.getElementById('sizesContainer');
    const div = document.createElement('div');
    div.style = "display:flex; gap:5px; margin-bottom:5px;";
    div.className = "size-row";
    div.innerHTML = `
        <input placeholder="Size (e.g. Small)" value="${name}" class="form-input" style="flex:2; margin-bottom:0">
        <input type="number" placeholder="Price" value="${price}" class="form-input" style="flex:1; margin-bottom:0">
        <button onclick="this.parentElement.remove()" style="background:none; border:none; color:red; cursor:pointer;">×</button>
    `;
    container.appendChild(div);
};

window.addNewAddonField = (name = "", price = "") => {
    const container = document.getElementById('addonsContainer');
    const div = document.createElement('div');
    div.style = "display:flex; gap:5px; margin-bottom:5px;";
    div.className = "addon-row";
    div.innerHTML = `
        <input placeholder="Addon (e.g. Extra Cheese)" value="${name}" class="form-input" style="flex:2; margin-bottom:0">
        <input type="number" placeholder="Price" value="${price}" class="form-input" style="flex:1; margin-bottom:0">
        <button onclick="this.parentElement.remove()" style="background:none; border:none; color:red; cursor:pointer;">×</button>
    `;
    container.appendChild(div);
};

window.hideDishModal = () => document.getElementById('dishModal').style.display = 'none';

document.getElementById('saveDishBtn').onclick = async () => {
    const name = document.getElementById('dishName').value;
    const cat = document.getElementById('dishCategory').value;
    const basePrice = document.getElementById('dishPriceBase').value;
    let image = document.getElementById('dishImage').value; // Existing URL

    if (!name || !cat) return alert("Please fill Name and Category");

    const file = document.getElementById('dishFile').files[0];
    const statusLabel = document.getElementById('uploadStatus');

    try {
        if (file) {
            statusLabel.style.display = "block";
            
            // If editing, get old image to delete later
            let oldImageUrl = null;
            if (editingDishId) {
                const snap = await db.ref(`dishes/${currentOutlet}/${editingDishId}`).once('value');
                oldImageUrl = snap.val()?.image;
            }

            // Upload new
            image = await uploadImage(file, `dishes/${Date.now()}_${file.name}`);
            
            // Delete old if upload successful and old exists
            if (oldImageUrl && image !== oldImageUrl) {
                await deleteImage(oldImageUrl);
            }
            
            statusLabel.style.display = "none";
        }

        // Collect Sizes
        const sizes = {};
        document.querySelectorAll('.size-row').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs[0].value && inputs[1].value) {
                sizes[inputs[0].value] = Number(inputs[1].value);
            }
        });

        // Collect Addons
        const addons = {};
        document.querySelectorAll('.addon-row').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs[0].value && inputs[1].value) {
                addons[inputs[0].value] = Number(inputs[1].value);
            }
        });

        const data = { 
            name, 
            category: cat, 
            price: Number(basePrice) || 0, 
            image, 
            stock: true,
            sizes: Object.keys(sizes).length > 0 ? sizes : null,
            addons: Object.keys(addons).length > 0 ? addons : null
        };
        
        const ref = db.ref(`dishes/${currentOutlet}`);
        
        if (editingDishId) {
            await ref.child(editingDishId).update(data);
        } else {
            await ref.push(data);
        }
        
        hideDishModal();
        loadMenu();
    } catch (e) {
        alert("Error: " + e.message);
        statusLabel.style.display = "none";
    }
};

function loadMenu() {
    const grid = document.getElementById("menuGrid");
    db.ref(`dishes/${currentOutlet}`).off(); // Detach previous listener before re-attaching
    db.ref(`dishes/${currentOutlet}`).on("value", snap => {
        grid.innerHTML = "";
        snap.forEach(child => {
            const d = child.val();
            const id = child.key;
            
            let priceDisplay = `₹${d.price}`;
            if (d.sizes) {
                const prices = Object.values(d.sizes);
                priceDisplay = `₹${Math.min(...prices)}+`;
            }

            let sizesHtml = "";
            if (d.sizes) {
                sizesHtml = `
                    <div style="margin:12px 0; padding:12px; background:rgba(0,0,0,0.02); border-radius:10px; border:1px solid rgba(0,0,0,0.03);">
                        <div style="font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; letter-spacing:0.5px;">Sizes & Pricing</div>
                        ${Object.entries(d.sizes).map(([size, price]) => `
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; font-size:13px;">
                                <span style="color:var(--text-main)">${size}</span>
                                <span style="font-weight:800; color:var(--action-green)">₹${price}</span>
                            </div>
                        `).join("")}
                    </div>
                `;
            } else {
                sizesHtml = `
                    <div style="margin:12px 0; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:13px; color:var(--text-muted)">Standard Price</span>
                        <span style="font-size:18px; font-weight:800; color:var(--action-green)">₹${d.price || 0}</span>
                    </div>
                `;
            }

            grid.innerHTML += `
                <div class="glass-card" style="padding:15px; transition: transform 0.2s; cursor:default;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                    <div style="position:relative; width:100%; height:160px; border-radius:12px; overflow:hidden; margin-bottom:15px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <img src="${d.image || 'https://via.placeholder.com/150'}" style="width:100%; height:100%; object-fit:cover;">
                        <div style="position:absolute; top:10px; right:10px; background:${d.stock ? 'rgba(6,95,70,0.9)' : 'rgba(220,38,38,0.9)'}; color:white; padding:4px 10px; border-radius:20px; font-size:10px; font-weight:700; backdrop-filter:blur(4px);">
                            ${d.stock ? 'AVAILABLE' : 'OUT OF STOCK'}
                        </div>
                    </div>
                    <div style="padding:0 5px;">
                        <h4 style="margin:0; font-size:16px; color:var(--text-main); font-weight:700;">${d.name}</h4>
                        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">${d.category}</div>
                        
                        ${sizesHtml}
                        
                        <div style="display:flex; gap:8px; margin-top:5px; pt-10">
                            <button onclick="showDishModal('${id}')" class="btn-secondary" style="flex:1; font-size:12px; padding:8px 0; display:flex; align-items:center; justify-content:center; gap:5px;">
                                ✏️ Edit
                            </button>
                            <button onclick="deleteDish('${id}')" class="btn-secondary" style="color:#ef4444; width:40px; padding:8px 0; display:flex; align-items:center; justify-content:center;">
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    });
}

window.toggleStock = (id, current) => db.ref(`dishes/${currentOutlet}/${id}`).update({ stock: !current });
window.deleteDish = async (id) => {
    if (confirm("Delete this dish?")) {
        const snap = await db.ref(`dishes/${currentOutlet}/${id}`).once('value');
        const img = snap.val()?.image;
        if (img) await deleteImage(img);
        db.ref(`dishes/${currentOutlet}/${id}`).remove();
    }
};

// (Duplicate loadCategories, addCategory, deleteCategory removed — canonical versions above at loadCategories/line ~600)

// RIDERS
let riderStatsData = {};

function loadRiders() {
    db.ref("riderStats").off(); // Detach previous listeners before re-attaching
    db.ref("riders").off();

    // Listen for performance stats
    db.ref("riderStats").on("value", s => {
        riderStatsData = s.val() || {};
        if (ridersList.length > 0) renderRiders();
    });

    db.ref("riders").on("value", snap => {
        ridersList = [];
        snap.forEach(child => {
            const val = child.val();
            if(!val.outlet || val.outlet === currentOutlet) {
                ridersList.push({ id: child.key, ...val });
            }
        });
        renderRiders();
    });
}

function renderRiders() {
    const table = document.getElementById("ridersTable");
    const activeDashboard = document.getElementById("activeRidersDashboard");
    
    if (table) table.innerHTML = "";
    if (activeDashboard) activeDashboard.innerHTML = "";

    ridersList.forEach(r => {
        const stats = riderStatsData[r.id] || { totalOrders: 0, avgDeliveryTime: 0, totalEarnings: 0 };
        const statusClass = r.status === "Online" ? "Confirmed" : "Delivered"; 
        
        // 1. Populate Management Table
        if (table) {
            const portalUrl = window.location.origin + "/Rider/index.html";
            table.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(0,0,0,0.03)">
                    <td style="padding:15px">
                        <div style="font-weight:700; color:var(--text-main)">${r.name}</div>
                        <small style="color:var(--action-green); font-weight:600;">${r.phone || 'No Phone'}</small>
                    </td>
                    <td style="padding:15px">
                         <div style="font-size:11px; margin-bottom:4px;"><span style="color:var(--text-muted)">User:</span> <strong>${r.email}</strong></div>
                         <div style="font-size:11px;"><span style="color:var(--text-muted)">Password:</span> <span style="font-family:monospace; background:rgba(0,0,0,0.05); padding:2px 5px; border-radius:4px; font-weight:700; color:var(--action-green)">••••••••</span></div>
                    </td>
                    <td style="padding:15px"><span class="status ${statusClass}" style="${r.status === 'Offline' ? 'background:rgba(0,0,0,0.1); color:gray' : ''}">${r.status || 'Active'}</span></td>
                    <td style="padding:15px">
                        <a href="${portalUrl}" target="_blank" style="font-size:10px; font-weight:800; color:var(--action-green); text-decoration:none; border:2px solid var(--action-green); padding:5px 10px; border-radius:8px; display:inline-block; transition:all 0.2s;" onmouseover="this.style.background='var(--action-green)'; this.style.color='white';" onmouseout="this.style.background='transparent'; this.style.color='var(--action-green)';">
                            🚀 DASHBOARD
                        </a>
                    </td>
                    <td style="padding:15px">
                        <div style="font-size:11px;"><strong>${stats.totalOrders}</strong> Orders</div>
                        <div style="font-size:11px; color:var(--action-green); font-weight:700;">₹${stats.totalEarnings.toLocaleString()}</div>
                    </td>
                    <td style="padding:15px; display:flex; gap:10px; align-items:center;">
                        <button onclick="editRider('${r.id}')" title="Edit Rider" style="background:var(--action-green); color:white; border:none; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:600;">Edit</button>
                        <button onclick="resetRiderPassword('${r.email}')" title="Reset Password" style="background:none; border:none; color:var(--action-green); cursor:pointer; font-size:18px;">🔑</button>
                        <button onclick="deleteRider('${r.id}')" style="background:none; border:none; color:#ef4444; font-size:11px; cursor:pointer; text-decoration:underline; font-weight:600;">Remove</button>
                    </td>
                </tr>
            `;
        }

        // 2. Populate Dashboard Sidebar (Compact)
        if (activeDashboard && r.status === "Online") {
            activeDashboard.innerHTML += `
                <div style="display:flex; align-items:center; gap:12px; padding:10px; background:rgba(255,255,255,0.03); border-radius:10px; margin-bottom:8px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="width:10px; height:10px; border-radius:50%; background:#22c55e; box-shadow: 0 0 10px #22c55e;"></div>
                    <div style="flex:1">
                        <div style="font-size:13px; font-weight:600; color:var(--text-main)">${r.name}</div>
                        <div style="font-size:11px; color:var(--text-muted)">${stats.totalOrders} delivered today</div>
                    </div>
                </div>
            `;
        }
    });

    if (activeDashboard && activeDashboard.innerHTML === "") {
        activeDashboard.innerHTML = "<div style='color:var(--text-muted); font-size:12px; text-align:center; padding:20px;'>No riders online</div>";
    }
}

window.deleteRider = (id) => confirm("Remove this rider? This will NOT delete their login but will prevent them from accessing the shop.") && db.ref(`riders/${id}`).remove();

// =============================
// REPORTS & ANALYTICS
// =============================
function loadReports() {
    // Default dates: Today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('reportFrom').value = today;
    document.getElementById('reportTo').value = today;
    generateCustomReport();
}

function generateCustomReport() {
    const fromDate = document.getElementById('reportFrom').value;
    const toDate = document.getElementById('reportTo').value;
    const tableBody = document.getElementById('reportTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = "<tr><td colspan='5' style='text-align:center'>Loading data...</td></tr>";

    db.ref("orders").once("value", snap => {
        salesData = [];
        let totalRev = 0, totalOrders = 0;

        snap.forEach(child => {
            const o = child.val();
            if (o.outlet !== currentOutlet) return;
            
            const orderDate = o.createdAt ? o.createdAt.split('T')[0] : "";
            if (orderDate >= fromDate && orderDate <= toDate) {
                salesData.push({ id: child.key, ...o });
                if (o.status !== "Cancelled") {
                    totalRev += Number(o.total || 0);
                    totalOrders++;
                }
            }
        });

        document.getElementById('reportRevenue').innerText = `₹${totalRev.toLocaleString()}`;
        document.getElementById('reportOrders').innerText = totalOrders;
        document.getElementById('reportAvg').innerText = totalOrders > 0 ? `₹${Math.round(totalRev/totalOrders)}` : "₹0";

        tableBody.innerHTML = salesData.map(o => `
            <tr>
                <td style="font-size:12px">${formatDate(o.createdAt)}</td>
                <td>
                    <div style="font-weight:600">${o.customerName}</div>
                    <div style="font-size:10px; color:var(--text-muted)">${o.phone}</div>
                </td>
                <td style="font-weight:700">₹${o.total}</td>
                <td><small>${o.paymentMethod || 'COD'}</small></td>
                <td><small style="font-size:10px; color:var(--text-muted)">${o.items ? o.items.map(i => i.name).join(', ') : 'Items'}</small></td>
            </tr>
        `).join('') || "<tr><td colspan='5' style='text-align:center'>No data for this range</td></tr>";
    });
}

window.downloadExcel = () => {
    if (salesData.length === 0) return alert("No data to export");
    
    const preparedData = salesData.map(o => ({
        "Order ID": o.orderId || o.id.slice(-5),
        "Date": o.createdAt,
        "Customer": o.customerName,
        "Phone": o.phone,
        "Address": o.address,
        "Total Amount": o.total,
        "Status": o.status,
        "Method": o.paymentMethod || "COD",
        "Items": o.items ? o.items.map(i => `${i.name} (${i.size})`).join('; ') : ""
    }));

    const ws = XLSX.utils.json_to_sheet(preparedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Report");
    XLSX.writeFile(wb, `Sales_Report_${new Date().toLocaleDateString()}.xlsx`);
};

window.downloadPDF = () => {
    if (salesData.length === 0) return alert("No data to export");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text(`Sales Report (${currentOutlet})`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Range: ${document.getElementById('reportFrom').value} to ${document.getElementById('reportTo').value}`, 14, 28);

    const rows = salesData.map(o => [
        formatDate(o.createdAt),
        o.customerName,
        o.phone,
        o.total,
        o.status,
        o.items ? o.items.map(i => i.name).join(', ') : ""
    ]);

    doc.autoTable({
        head: [['Date', 'Customer', 'Phone', 'Total', 'Status', 'Items']],
        body: rows,
        startY: 35,
        theme: 'grid',
        styles: { fontSize: 8 }
    });

    doc.save(`Sales_Report_${new Date().toLocaleDateString()}.pdf`);
};
window.showRiderModal = () => {
    isEditRiderMode = false;
    currentEditingRiderId = null;
    document.getElementById('riderModalTitle').innerText = "Add New Rider";
    document.getElementById('saveRiderBtn').innerText = "Create Account";
    document.getElementById('riderEmail').disabled = false;
    document.getElementById('riderPassHint').style.display = "none";
    
    // Clear fields
    document.getElementById('riderName').value = "";
    document.getElementById('riderEmail').value = "";
    document.getElementById('riderPass').value = "";
    document.getElementById('riderPhone').value = "";
    
    document.getElementById('riderModal').style.display = 'flex';
};

window.editRider = (id) => {
    const r = ridersList.find(x => x.id === id);
    if (!r) return;

    isEditRiderMode = true;
    currentEditingRiderId = id;
    
    document.getElementById('riderModalTitle').innerText = "Edit Rider Details";
    document.getElementById('saveRiderBtn').innerText = "Update Rider";
    document.getElementById('riderEmail').disabled = true; // Security: Email locked
    document.getElementById('riderPassHint').style.display = "block";

    document.getElementById('riderName').value = r.name || "";
    document.getElementById('riderEmail').value = r.email || "";
    document.getElementById('riderPass').value = ""; // Empty for security
    document.getElementById('riderPhone').value = r.phone || "";

    document.getElementById('riderModal').style.display = 'flex';
};

window.hideRiderModal = () => document.getElementById('riderModal').style.display = 'none';

window.saveRiderAccount = async () => {
    const name = document.getElementById('riderName').value;
    const email = document.getElementById('riderEmail').value;
    const pass = document.getElementById('riderPass').value;
    const phone = document.getElementById('riderPhone').value;

    if (!name || !email) {
        alert("Name and Email are required.");
        return;
    }

    try {
        let uid = currentEditingRiderId;

        if (!isEditRiderMode) {
            // 1. Create in secondary Auth
            if (!pass || pass.length < 6) {
                alert("Password must be at least 6 characters for new accounts.");
                return;
            }
            const cred = await secondaryAuth.createUserWithEmailAndPassword(email, pass);
            uid = cred.user.uid;
        } else if (pass && pass.length >= 6) {
            // Optional Password Update? 
            // Note: browser secondaryAuth can't update other people's passwords easily.
            // We use reset email for that. But we can update DB metadata.
            alert("Note: To change password, please use the 🔑 (Reset) button in the table.");
        }

        // 2. Save/Update rider details to DB
        const riderData = {
            name,
            email,
            phone,
            outlet: currentOutlet,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };

        if (!isEditRiderMode) {
            riderData.status = "Offline";
            riderData.createdAt = firebase.database.ServerValue.TIMESTAMP;
        }

        await db.ref(`riders/${uid}`).update(riderData);

        alert(isEditRiderMode ? "Rider updated successfully!" : "Rider account created successfully!");
        hideRiderModal();
    } catch (e) {
        alert("Operation failed: " + e.message);
    }
};

window.resetRiderPassword = (email) => {
    if (confirm(`Send password reset link to ${email}?`)) {
        firebase.auth().sendPasswordResetEmail(email)
            .then(() => alert("Reset link sent to " + email))
            .catch(e => alert("Error: " + e.message));
    }
};

// CUSTOMERS
function loadCustomers() {
    const table = document.getElementById("customersTable");
    if (!table) return;

    // Fetch both to correlate
    Promise.all([
        db.ref("customers").once("value"),
        db.ref("orders").once("value")
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

            table.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05)">
                    <td>
                        <div style="font-weight:600; color:var(--text-main)">${c.name}</div>
                        <small style="color:var(--text-muted); font-size:10px;">Joined: ${c.registeredAt ? new Date(c.registeredAt).toLocaleDateString() : 'N/A'}</small>
                    </td>
                    <td>
                        <a href="https://wa.me/${phone.replace(/\D/g, "")}" target="_blank" style="color:var(--primary); text-decoration:none; display:flex; align-items:center; gap:5px;">
                            <i class="fab fa-whatsapp"></i> ${phone}
                        </a>
                    </td>
                    <td>
                        <div style="font-size:12px; color:var(--text-main); max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${c.address || ''}">
                            ${c.address || 'No address saved'}
                        </div>
                        ${c.locationLink ? `<a href="${c.locationLink}" target="_blank" style="color:var(--primary); font-size:10px; text-decoration:none;">📍 Map Link</a>` : ""}
                    </td>
                    <td style="font-weight:600; color:var(--vibrant-orange)">${orderCount}</td>
                    <td style="font-weight:700; color:var(--warm-yellow)">₹${ltv.toLocaleString()}</td>
                </tr>
            `;
        });
    });
}

// =============================
// REPORTS & ANALYTICS
// =============================
function loadReports() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = now.toISOString().split('T')[0];
    
    if (document.getElementById("reportFrom")) document.getElementById("reportFrom").value = firstDay;
    if (document.getElementById("reportTo")) document.getElementById("reportTo").value = lastDay;

    generateCustomReport();
}

let salesData = []; // Global for exports

window.generateCustomReport = () => {
    const from = document.getElementById("reportFrom").value;
    const to = document.getElementById("reportTo").value;
    const tableBody = document.getElementById("reportTableBody");
    const container = document.getElementById("reportsContainer");
    
    if (!tableBody) return;

    tableBody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:30px;'>🔄 Collecting sales data...</td></tr>";

    db.ref("orders").once("value", snap => {
        let totalRev = 0;
        let totalOrd = 0;
        salesData = [];

        snap.forEach(child => {
            const o = child.val();
            if (o.outlet !== currentOutlet) return;
            if (o.status === "Cancelled") return;
            if (!o.createdAt) return;

            const dateStr = typeof o.createdAt === 'string' ? o.createdAt.split('T')[0] : new Date(o.createdAt).toISOString().split('T')[0];
            
            if (dateStr >= from && dateStr <= to) {
                totalRev += Number(o.total || 0);
                totalOrd++;
                salesData.push({ id: child.key, ...o, dateStr });
            }
        });

        // Update KPI Cards
        document.getElementById("reportRevenue").innerText = "₹" + totalRev.toLocaleString();
        document.getElementById("reportOrders").innerText = totalOrd;
        document.getElementById("reportAvg").innerText = "₹" + (totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0);

        // Sort by date descending
        salesData.sort((a,b) => b.createdAt - a.createdAt);

        // Render Table
        tableBody.innerHTML = salesData.map(o => `
            <tr style="border-bottom: 1px solid rgba(0,0,0,0.03)">
                <td style="padding:15px; font-family:monospace; font-size:12px;">${formatDate(o.createdAt)}</td>
                <td style="padding:15px;">
                    <div style="font-weight:700; color:var(--text-main)">${o.customerName || 'Guest'}</div>
                    <div style="font-size:11px; color:var(--text-muted)">${o.phone || ''}</div>
                </td>
                <td style="padding:15px; font-weight:800; color:var(--action-green)">₹${o.total || 0}</td>
                <td style="padding:15px;"><small>${o.paymentMethod || 'COD'}</small></td>
                <td style="padding:15px;">
                    <div style="max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; color:var(--text-muted)" title="${o.items ? o.items.map(i => `${i.name} x${i.quantity}`).join(', ') : ''}">
                        ${o.items ? o.items.map(i => `${i.name} x${i.quantity}`).join(', ') : 'Empty'}
                    </div>
                </td>
            </tr>
        `).join('') || "<tr><td colspan='5' style='text-align:center; padding:30px; color:var(--text-muted)'>No orders found for this range</td></tr>";
    });
};

// SETTINGS
function loadSettings() {
    const container = document.getElementById('settingsContainer');
    if (!container) return;

    db.ref("appConfig").once("value", async configSnap => {
        const c = configSnap.val() || {};
        const uiSnap = await db.ref("uiConfig").once("value");
        const u = uiSnap.val() || {};

        container.innerHTML = `
            <div class="glass-card" style="padding: 3rem; max-width: 1000px; margin: 20px auto; border-radius: 30px; position:relative; overflow:hidden;">
                <!-- Decorative background elements -->
                <div style="position:absolute; top:-50px; right:-50px; width:200px; height:200px; background:var(--action-green); opacity:0.05; border-radius:50%; z-index:0;"></div>
                <div style="position:absolute; bottom:-50px; left:-50px; width:150px; height:150px; background:var(--alert-orange); opacity:0.05; border-radius:50%; z-index:0;"></div>

                <div style="position:relative; z-index:1;">
                    <div style="display:flex; align-items:center; gap:20px; margin-bottom:40px;">
                        <div style="background:var(--action-green); width:64px; height:64px; border-radius:18px; display:flex; align-items:center; justify-content:center; box-shadow:0 10px 20px rgba(6,95,70,0.2);">
                            <span style="font-size:28px;">⚙️</span>
                        </div>
                        <div>
                            <h2 style="font-size:28px; font-weight:800; color:var(--text-main); margin:0; letter-spacing:-0.5px;">Shop Configuration</h2>
                            <p style="color:var(--text-muted); margin:4px 0 0; font-size:14px; font-weight:500;">Customize your store's identity and operational limits</p>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:30px;">
                        <!-- Left Column: Identity -->
                        <div style="display:flex; flex-direction:column; gap:25px;">
                            <div class="settings-group">
                                <label style="display:block; font-size:12px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">Shop Identity</label>
                                
                                <div style="margin-bottom:15px;">
                                    <label class="form-label" style="font-size:13px; font-weight:600;">Public Shop Name</label>
                                    <input type="text" id="setConfigName" value="${c.shopName || ''}" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:600;">
                                </div>
                                
                                <div style="margin-bottom:15px;">
                                    <label class="form-label" style="font-size:13px; font-weight:600;">WhatsApp Support / Bot</label>
                                    <input type="text" id="setConfigPhone" value="${c.whatsapp || ''}" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:600;">
                                </div>
                                
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                                    <div>
                                        <label class="form-label" style="font-size:13px; font-weight:600;">Store Status</label>
                                        <select id="setConfigStatus" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:600;">
                                            <option value="Open" ${c.status === 'Open' ? 'selected' : ''}>🟢 Open</option>
                                            <option value="Closed" ${c.status === 'Closed' ? 'selected' : ''}>🔴 Closed</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="form-label" style="font-size:13px; font-weight:600;">Master OTP</label>
                                        <input type="text" id="setConfigMasterOTP" value="${c.masterOTP || '0000'}" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:700; color:var(--action-green); text-align:center;">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Right Column: Logistics -->
                        <div style="display:flex; flex-direction:column; gap:25px;">
                            <div class="settings-group">
                                <label style="display:block; font-size:12px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">Logistics & Branding</label>
                                
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:15px;">
                                    <div>
                                        <label class="form-label" style="font-size:13px; font-weight:600;">Delivery Fee (₹)</label>
                                        <input type="number" id="setConfigFee" value="${c.deliveryFee || 0}" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:700;">
                                    </div>
                                    <div>
                                        <label class="form-label" style="font-size:13px; font-weight:600;">Min. Order (₹)</label>
                                        <input type="number" id="setConfigMinOrder" value="${c.minOrder || 0}" class="form-input" style="background:white; border:1.5px solid rgba(0,0,0,0.05); font-weight:700;">
                                    </div>
                                </div>

                                <div style="margin-bottom:15px;">
                                    <label class="form-label" style="font-size:13px; font-weight:600;">Business Address</label>
                                    <textarea id="setConfigAddress" class="form-input" style="height: 64px; background:white; border:1.5px solid rgba(0,0,0,0.05); font-size:13px; font-weight:500;">${c.address || ''}</textarea>
                                </div>

                                <div>
                                    <label class="form-label" style="font-size:13px; font-weight:600; margin-bottom:10px; display:block;">Store Banners (Click to Change)</label>
                                    <div style="display:flex; gap:15px;">
                                        <div style="flex:1; cursor:pointer;" onclick="document.getElementById('welcomeFile').click()">
                                            <div style="position:relative; width:100%; height:80px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">
                                                <img id="welcomePreview" src="${u.welcomeImage || 'https://via.placeholder.com/300x150'}" style="width:100%; height:100%; object-fit:cover;">
                                                <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.6); color:white; font-size:9px; text-align:center; padding:4px; font-weight:700;">WELCOME</div>
                                            </div>
                                            <input type="file" id="welcomeFile" style="display:none" onchange="previewImage(this, 'welcomePreview')">
                                            <input type="hidden" id="setUIWelcome" value="${u.welcomeImage || ''}">
                                        </div>
                                        <div style="flex:1; cursor:pointer;" onclick="document.getElementById('menuFile').click()">
                                            <div style="position:relative; width:100%; height:80px; border-radius:12px; overflow:hidden; border:2px solid rgba(0,0,0,0.05);">
                                                <img id="menuBannerPreview" src="${u.menuImage || 'https://via.placeholder.com/300x150'}" style="width:100%; height:100%; object-fit:cover;">
                                                <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.6); color:white; font-size:9px; text-align:center; padding:4px; font-weight:700;">MENU BANNER</div>
                                            </div>
                                            <input type="file" id="menuFile" style="display:none" onchange="previewImage(this, 'menuBannerPreview')">
                                            <input type="hidden" id="setUIMenu" value="${u.menuImage || ''}">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top: 50px; text-align: center; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 35px;">
                        <button onclick="saveSettings()" class="btn-primary" style="margin: 0 auto; width: 340px; justify-content: center; padding: 18px; border-radius: 18px; font-size: 16px; font-weight: 800; box-shadow: 0 15px 30px rgba(6,95,70,0.2); letter-spacing:0.5px;">
                            💾 SAVE SYSTEM CONFIGURATION
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
}

window.saveSettings = async () => {
    const shopName = document.getElementById("setConfigName").value;
    const fee = document.getElementById("setConfigFee").value;
    const minOrder = document.getElementById("setConfigMinOrder").value;
    const addr = document.getElementById("setConfigAddress").value;
    const whatsapp = document.getElementById("setConfigPhone").value;
    const status = document.getElementById("setConfigStatus").value;
    const masterOTP = document.getElementById("setConfigMasterOTP").value;
    
    let welcome = document.getElementById("setUIWelcome").value;
    let menu = document.getElementById("setUIMenu").value;

    const welcomeFile = document.getElementById("welcomeFile").files[0];
    const menuFile = document.getElementById("menuFile").files[0];

    try {
        if (welcomeFile) {
            const oldWelcome = welcome; // Snapshot before update
            welcome = await uploadImage(welcomeFile, `banners/welcome_${Date.now()}`);
            if (oldWelcome && welcome !== oldWelcome) {
                await deleteImage(oldWelcome);
            }
        }
        if (menuFile) {
            const oldMenu = menu; // Snapshot before update
            menu = await uploadImage(menuFile, `banners/menu_${Date.now()}`);
            if (oldMenu && menu !== oldMenu) {
                await deleteImage(oldMenu);
            }
        }

        db.ref("appConfig").update({ 
            shopName, 
            deliveryFee: Number(fee), 
            minOrder: Number(minOrder),
            address: addr, 
            whatsapp,
            status,
            masterOTP 
        });
        db.ref("uiConfig").update({ welcomeImage: welcome, menuImage: menu });
        
        // Update Header
        document.querySelector(".sidebar-header").innerText = shopName.split(" ")[0].toUpperCase() + " ERP";
        
        alert("Settings updated successfully!");
        loadSettings(); // Refresh previews and hidden values
    } catch (e) {
        alert("Error saving settings: " + e.message);
    }
};

// DASHBOARD HELPERS
function renderTopItems() {
    const container = document.getElementById("topItemsDashboard");
    if (!container) return;
    
    if (!window.itemStats || Object.keys(window.itemStats).length === 0) {
        container.innerHTML = "<div style='color:var(--text-muted); font-size:12px; text-align:center; padding:20px;'>No sales data yet</div>";
        return;
    }

    const sorted = Object.entries(window.itemStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    container.innerHTML = sorted.map(([name, count], index) => `
        <div style="display:flex; align-items:center; gap:12px; padding:10px; background:rgba(255,255,255,0.03); border-radius:10px; margin-bottom:8px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="font-size:16px; font-weight:800; color:var(--primary); width:20px;">${index + 1}</div>
            <div style="flex:1">
                <div style="font-size:13px; font-weight:600; color:var(--text-main)">${name}</div>
                <div style="font-size:11px; color:var(--text-muted)">${count} sold</div>
            </div>
            <div style="height:4px; width:40px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
                <div style="height:100%; width:${Math.min(100, (count / sorted[0][1]) * 100)}%; background:var(--primary);"></div>
            </div>
        </div>
    `).join("");
}

// ACTIONS
window.updateStatus = (id, status) => {
    if (!status) return;
    db.ref("orders/" + id).update({ status });
};

window.assignRider = async (id, riderEmail) => {
    if (!riderEmail) return;

    // Fetch master OTP for sync
    const configSnap = await db.ref("appConfig").once("value");
    const masterOTP = configSnap.val()?.masterOTP || "0000";

    db.ref("orders/" + id).update({ 
        assignedRider: riderEmail,
        status: "Out for Delivery",
        adminMasterOTP: masterOTP
    });
};
// EXPORTS
window.downloadExcel = () => {
    if (salesData.length === 0) {
        alert("No data available to export. Generate a report first.");
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
        Items: o.items ? o.items.map(i => `${i.name} x${i.quantity}`).join(', ') : ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Report");
    XLSX.writeFile(wb, `Sales_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
};

window.downloadPDF = () => {
    if (salesData.length === 0) {
        alert("No data available to export. Generate a report first.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text("Sales Report", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    
    const from = document.getElementById("reportFrom").value;
    const to = document.getElementById("reportTo").value;
    doc.text(`Period: ${from} to ${to}`, 14, 30);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 36);

    const tableData = salesData.map(o => [
        formatDate(o.createdAt),
        o.customerName || 'Guest',
        `Rs. ${o.total}`,
        o.paymentMethod || 'COD',
        o.items ? o.items.map(i => `${i.name} x${i.quantity}`).join(', ') : ''
    ]);

    doc.autoTable({
        startY: 45,
        head: [['Date', 'Customer', 'Total', 'Method', 'Items']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [6, 95, 70] }, // Forest Green matching UI
        columnStyles: {
            4: { cellWidth: 60 } // items column wider
        }
    });

    doc.save(`Sales_Report_${from}_to_${to}.pdf`);
};

// Utils
function formatDate(ts) {
    if (!ts) return "N/A";
    const d = new Date(ts);
    return d.toLocaleString('en-IN', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

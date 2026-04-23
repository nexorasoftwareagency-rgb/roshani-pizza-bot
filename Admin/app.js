const db = firebase.database();
const auth = firebase.auth();
const storage = firebase.storage();

// =============================
// FILE UPLOAD UTILITY
// =============================
async function uploadImage(file, path) {
    if (!file) return null;
    
    // Validation: Only allow JPEG, PNG, WebP and size < 5MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        alert("Invalid file type. Please upload JPEG, PNG, or WebP.");
        return null;
    }
    if (file.size > 5 * 1024 * 1024) {
        alert("File too large. Maximum size is 5MB.");
        return null;
    }

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
let categories = [];
let isEditRiderMode = false;
let currentEditingRiderId = null;

window.showDishModal = async (dishId = null) => {
    editingDishId = dishId;
    const modal = document.getElementById('dishModal');
    if(modal) modal.style.display = 'flex';

    // Always refresh category dropdown when modal opens
    if (categories.length === 0) loadCategories();
    else updateActiveDishModalCategories();

    document.getElementById('modalTitle').innerText = dishId ? 'Edit Dish' : 'Add New Dish';
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
            const select = document.getElementById('dishCategory');
            const catValue = d.category || '';
            if (catValue && !Array.from(select.options).some(opt => opt.value === catValue)) {
                const opt = document.createElement('option');
                opt.value = catValue;
                opt.innerText = catValue;
                select.appendChild(opt);
            }
            select.value = catValue;
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

    // Preserve currently selected value if any
    const currentVal = select.value;

    select.innerHTML = '<option value="">Choose Category...</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.name; // Store NAME so dishes display correctly
        option.innerText = cat.name;
        if (cat.name === currentVal) {
            option.selected = true;
        }
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
function doLogin() {
    const email = adminEmail.value.trim();
    const pass = adminPassword.value;
    if (!email || !pass) { authError.innerText = "Please enter email and password."; return; }
    authError.innerText = "";

    auth.signInWithEmailAndPassword(email, pass)
        .catch(e => {
            authError.innerText = e.message;
        });
}

document.getElementById("loginBtn").onclick = doLogin;

// Enter key triggers login from both email and password fields
adminEmail.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
adminPassword.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

window.userLogout = () => {
    // Force UI reset immediately (don't rely only on onAuthStateChanged)
    authOverlay.style.display = "flex";
    document.querySelector(".layout").style.display = "none";
    auth.signOut();
};

auth.onAuthStateChanged(async user => {
    if (!user) {
        // Detach persistent listeners
        if (_ordersChildCb) { db.ref("orders").off("child_added", _ordersChildCb); _ordersChildCb = null; }
        if (_ordersValueCb) { db.ref("orders").off("value", _ordersValueCb); _ordersValueCb = null; }
        db.ref("riderStats").off();
        db.ref("riders").off();
        if (window.currentOutlet) db.ref(`dishes/${window.currentOutlet}`).off();
        
        authOverlay.style.display = "flex";
        document.querySelector(".layout").style.display = "none";
        return;
    }

    try {
        const adminSnap = await db.ref("admins").once("value");
        let adminData = null;
        const normalizedEmail = user.email.toLowerCase();

        adminSnap.forEach(snap => {
            if (snap.val().email.toLowerCase() === normalizedEmail) {
                adminData = snap.val();
            }
        });

        if (!adminData) {
            alert("ACCESS DENIED: Not recognized as an Admin.");
            auth.signOut();
            return;
        }

        // Handle caching and switching for multi-outlet Support
        const switcher = document.getElementById('outletSwitcher');
        if (adminData.isSuper) {
            if (switcher) {
                switcher.classList.remove('hidden');
                switcher.innerHTML = `
                    <option value="pizza">🍕 Pizza ERP</option>
                    <option value="cake">🎂 Cakes ERP</option>
                `;
                const savedOutlet = localStorage.getItem('adminSelectedOutlet') || adminData.outlet;
                switcher.value = savedOutlet;
                window.currentOutlet = savedOutlet;
            }
        } else {
            window.currentOutlet = adminData.outlet;
            if (switcher) switcher.classList.add('hidden');
        }

        userEmailDisplay.innerText = user.email;
        authOverlay.style.display = "none";
        document.querySelector(".layout").style.display = "flex";

        updateBranding();
        loadRiders(); 
        initRealtimeListeners();
        switchTab('dashboard');
        
    } catch (e) {
        console.error("Auth Exception:", e);
    }
});

function updateBranding() {
    const badge = document.getElementById('outletBadge');
    const sidebarBrand = document.getElementById('sidebarBrandText');
    const isPizza = window.currentOutlet === 'pizza';

    if (badge) {
        badge.innerText = isPizza ? 'PIZZA OUTLET' : 'CAKES OUTLET';
        badge.style.background = isPizza ? 'var(--primary-orange)' : '#EC4899';
    }
    if (sidebarBrand) {
        sidebarBrand.innerText = isPizza ? 'ROSHANI PIZZA' : 'ROSHANI CAKES';
    }
    document.title = (isPizza ? 'Roshani Pizza' : 'Roshani Cakes') + ' | Admin Dashboard';

    // Riders tab: only Pizza outlet admin can manage riders (unless Super)
    const ridersMenu = document.getElementById("menu-riders");
    if (ridersMenu) {
        ridersMenu.style.display = (isPizza || (currentUser && currentUser.isSuper)) ? "" : "none";
    }
}

window.switchOutlet = (val) => {
    localStorage.setItem('adminSelectedOutlet', val);
    window.currentOutlet = val;
    
    updateBranding();
    initRealtimeListeners();
    
    // Refresh active tab
    const activeTabId = document.querySelector('.nav-links li.active')?.id.replace('menu-', '') || 'dashboard';
    switchTab(activeTabId);
    console.log("Admin switched outlet to:", val);
};

// =============================
// MOBILE SIDEBAR TOGGLE
// =============================
window.toggleMobileSidebar = () => {
    const sidebar = document.getElementById('sidebarNav');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('active');
};

function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebarNav');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
}

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
    closeMobileSidebar(); // Auto-close sidebar on mobile

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
        'walkin': '🛒 Record Walk-in Sale',
        'menu': 'Dish Management',
        'categories': 'Category Management',
        'riders': 'Rider Management',
        'customers': 'Customer Database',
        'inventory': 'Inventory Tracking (Coming Soon)',
        'payments': 'Payment Tracking',
        'reports': 'Performance Analytics',
        'feedback': '⭐ Customer Feedback & Ratings',
        'settings': 'Delivery & Store Settings'
    };
    
    document.getElementById('currentTabTitle').innerText = titles[tabId] || 'Admin Dashboard';

    if (tabId === 'settings') window.loadStoreSettings();
    if (tabId === 'dashboard') {}
    if (tabId === 'walkin') loadWalkinMenu();
    if (tabId === 'menu') loadMenu();
    if (tabId === 'categories') loadCategories();
    if (tabId === 'riders') loadRiders();
    if (tabId === 'customers') loadCustomers();
    if (tabId === 'feedback') loadFeedbacks();
    if (tabId === 'reports') loadReports();
};

// =============================
// REAL-TIME LISTENERS
// =============================
function initRealtimeListeners() {
    // Detach any previous listeners first
    if (_ordersChildCb) { db.ref("orders").off("child_added", _ordersChildCb); _ordersChildCb = null; }
    if (_ordersValueCb) { db.ref("orders").off("value", _ordersValueCb); _ordersValueCb = null; }

    let firstLoad = true;

    // Sound Notification logic (only for new orders after page load)
    const loadTime = Date.now();
    _ordersChildCb = snap => {
        if (!firstLoad) {
            const order = snap.val();
            // Check if order is new (within last 1 minute and after page load)
            const orderTime = typeof order.createdAt === 'number' ? order.createdAt : new Date(order.createdAt).getTime();
            const isRecent = orderTime && (Date.now() - orderTime) < 60000;
            const isPostLoad = orderTime && orderTime > loadTime - 5000;

            if (order && (order.outlet === currentOutlet || !currentOutlet) && order.status === "Placed" && isRecent && isPostLoad) {
                showAlert(order);
                playSound();
                setTimeout(() => highlightOrder(snap.key), 1000);
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
        alertAudio = new Audio('../assets/sounds/mixkit-bell-of-promise-930.wav');
        alertAudio.volume = 0.5;
    }
    alertAudio.currentTime = 0;
    alertAudio.play().catch(e => {
        // Fallback to alert.mp3 if premium file missing
        new Audio("../assets/sounds/alert.mp3").play().catch(() => {});
    });
}

function showAlert(order) {
    const container = document.getElementById('alertContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'alert-box';
    div.innerHTML = `
        <div class="alert-content">
            <div class="alert-title">🔔 New Order #${order.orderId || order.id.slice(-5)}</div>
            <div class="alert-sub">₹${order.total} • ${order.items?.length || 1} item(s)</div>
        </div>
        <button class="alert-print-btn" onclick="event.stopPropagation(); printOrderReceipt(JSON.parse('${JSON.stringify(order).replace(/'/g, "\\'")}'))">🖨️ Print</button>
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
    
    // Reset item stats to prevent cumulative data in real-time updates
    window.itemStats = {};

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

        const displayPhone = o.phone ? o.phone.slice(0, 2) + "****" + o.phone.slice(-4) : "Guest";
        const truncatedAddress = o.address ? (o.address.length > 30 ? o.address.substring(0, 30) + "..." : o.address) : "Counter Sale";

        const trHTML = `
            <td style="font-family: monospace; font-weight: 600;">#${safeOrderId}</td>
            <td>
                ${safeCustomerName}<br>
                <small style="color:var(--text-muted)">${displayPhone}</small>
                ${o.phone ? `<a href="https://wa.me/91${o.phone.replace(/\D/g,'')}?text=${encodeURIComponent('Hi ' + o.customerName + ', regarding your order #' + safeOrderId)}" target="_blank" style="margin-left:5px;text-decoration:none;font-size:14px;" title="Message on WhatsApp">💬</a>` : ''}
            </td>
            <td>
                <span title="${safeAddress}">${escapeHtml(truncatedAddress)}</span>
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
                <button onclick="window.printReceiptById('${o.orderId || id}')" class="btn-icon" style="margin-left: 5px; padding: 4px 8px; font-size: 16px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; cursor: pointer; border-radius: 4px;" title="Print Receipt">🖨️</button>
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
                <div style="font-size:14px; font-weight:700; color:var(--text-main);">${escapeHtml(data.name)}</div>
                <div style="font-size:11px; color:var(--text-muted)">${phone.slice(0, 2) + "****" + phone.slice(-4)}</div>
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
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(0,0,0,0.05);">
            <span style="font-size:14px; font-weight:600; color:var(--text-main);">${name}</span>
            <span style="font-size:12px; font-weight:700; background:rgba(34,197,94,0.1); color:#16a34a; padding:3px 10px; border-radius:12px;">${count} sold</span>
        </div>
    `).join('') || '<p style="font-size:12px; color:var(--text-muted); text-align:center; padding:10px;">No sales data yet.</p>';
}

window.markAsPaid = (id) => {
    db.ref("orders/" + id).update({ paymentStatus: "Paid" });
};

window.deleteOrder = (id) => {
    alert("Sales records are permanent and cannot be deleted by anyone to maintain data integrity.");
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
            const dishId = child.key; // capture in block scope — safe for closures

            let sizesHtml = "";
            if (d.sizes) {
                sizesHtml = `
                    <div style="margin:12px 0; padding:12px; background:rgba(0,0,0,0.02); border-radius:10px; border:1px solid rgba(0,0,0,0.03);">
                        <div style="font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; letter-spacing:0.5px;">Sizes &amp; Pricing</div>
                        ${Object.entries(d.sizes).map(([size, price]) => `
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; font-size:13px;">
                                <span style="color:var(--text-main)">${size}</span>
                                <span style="font-weight:800; color:var(--action-green)">₹${price}</span>
                            </div>
                        `).join("")}
                    </div>`;
            } else {
                sizesHtml = `
                    <div style="margin:12px 0; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:13px; color:var(--text-muted)">Standard Price</span>
                        <span style="font-size:18px; font-weight:800; color:var(--action-green)">₹${d.price || 0}</span>
                    </div>`;
            }

            // Build card via createElement to avoid innerHTML+= closure bug
            const card = document.createElement('div');
            card.className = 'glass-card';
            card.style.cssText = 'padding:15px; transition:transform 0.2s; cursor:default;';
            card.onmouseover = () => card.style.transform = 'translateY(-5px)';
            card.onmouseout = () => card.style.transform = 'translateY(0)';
            card.innerHTML = `
                <div style="position:relative; width:100%; height:160px; border-radius:12px; overflow:hidden; margin-bottom:15px; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
                    <img src="${d.image || 'https://via.placeholder.com/150'}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='https://via.placeholder.com/150'">
                    <div style="position:absolute; top:10px; right:10px; background:${d.stock ? 'rgba(6,95,70,0.9)' : 'rgba(220,38,38,0.9)'}; color:white; padding:4px 10px; border-radius:20px; font-size:10px; font-weight:700; backdrop-filter:blur(4px);">
                        ${d.stock ? 'AVAILABLE' : 'OUT OF STOCK'}
                    </div>
                </div>
                <div style="padding:0 5px;">
                    <h4 style="margin:0; font-size:16px; color:var(--text-main); font-weight:700;">${d.name}</h4>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">${d.category || ''}</div>
                    ${sizesHtml}
                    <div style="display:flex; gap:8px; margin-top:5px;">
                        <button class="edit-btn btn-secondary" style="flex:1; font-size:12px; padding:8px 0; display:flex; align-items:center; justify-content:center; gap:5px;">✏️ Edit</button>
                        <button class="delete-btn btn-secondary" style="color:#ef4444; width:40px; padding:8px 0; display:flex; align-items:center; justify-content:center;">🗑️</button>
                    </div>
                </div>`;

            // Wire buttons using addEventListener — closures correctly capture dishId
            card.querySelector('.edit-btn').addEventListener('click', () => window.showDishModal(dishId));
            card.querySelector('.delete-btn').addEventListener('click', () => window.deleteDish(dishId));

            grid.appendChild(card);
        });

        if (snap.numChildren() === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">No dishes yet. Click + Add Dish to get started.</div>';
        }
    });
}

window.toggleStock = (id, current) => db.ref(`dishes/${currentOutlet}/${id}`).update({ stock: !current });
window.deleteDish = (dishId) => {
    // Remove any existing confirm overlay
    const existing = document.getElementById('deleteConfirmOverlay');
    if (existing) existing.remove();

    // Build a centered overlay modal so it's always visible (no scroll/viewport issues)
    const overlay = document.createElement('div');
    overlay.id = 'deleteConfirmOverlay';
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99999',
        'background:rgba(0,0,0,0.7)', 'backdrop-filter:blur(4px)',
        'display:flex', 'align-items:center', 'justify-content:center'
    ].join(';');

    overlay.innerHTML = `
        <div style="background:#1c1c1c; border:1px solid #ef4444; border-radius:20px;
                    padding:32px 36px; max-width:360px; width:90%; text-align:center;
                    box-shadow:0 20px 60px rgba(239,68,68,0.25);">
            <div style="font-size:40px; margin-bottom:12px;">🗑️</div>
            <h3 style="color:#fff; margin:0 0 8px; font-size:18px; font-weight:700;">Delete Dish?</h3>
            <p style="color:#aaa; font-size:14px; margin:0 0 24px;">This action cannot be undone.</p>
            <div style="display:flex; gap:12px; justify-content:center;">
                <button id="confirmDeleteNo"
                    style="flex:1; padding:12px; border-radius:12px; border:1px solid #333;
                           background:transparent; color:#aaa; cursor:pointer; font-size:14px; font-weight:600;">
                    Cancel
                </button>
                <button id="confirmDeleteYes"
                    style="flex:1; padding:12px; border-radius:12px; border:none;
                           background:#ef4444; color:#fff; cursor:pointer; font-size:14px; font-weight:700;">
                    Delete
                </button>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    const cleanup = () => overlay.remove();

    // Cancel button
    overlay.querySelector('#confirmDeleteNo').onclick = cleanup;

    // Click backdrop to cancel
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(); };

    // Confirm delete
    overlay.querySelector('#confirmDeleteYes').onclick = async () => {
        cleanup();
        try {
            const snap = await db.ref(`dishes/${currentOutlet}/${dishId}`).once('value');
            const img = snap.val()?.image;
            if (img) await deleteImage(img);
            await db.ref(`dishes/${currentOutlet}/${dishId}`).remove();
        } catch(e) {
            alert('Delete failed: ' + e.message);
        }
    };
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
    const activeDashboard = document.getElementById("riderStatusList");
    
    if (table) table.innerHTML = "";
    if (activeDashboard) activeDashboard.innerHTML = "";

    ridersList.forEach(r => {
        const stats = riderStatsData[r.id] || { totalOrders: 0, avgDeliveryTime: 0, totalEarnings: 0 };
        const statusClass = r.status === "Online" ? "Confirmed" : "Delivered"; 
        
        // 1. Populate Management Table
        if (table) {
            const portalUrl = window.location.origin + "/rider/index.html";
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

    // Update Riders Online KPI on Dashboard
    const onlineCount = ridersList.filter(r => r.status === "Online").length;
    const ridersKPI = document.getElementById("statRidersActive");
    if (ridersKPI) ridersKPI.innerText = onlineCount;
    const onlineCountBadge = document.getElementById("onlineRiderCount");
    if (onlineCountBadge) onlineCountBadge.innerText = onlineCount + " ON";
}

window.deleteRider = (id) => confirm("Remove this rider? This will NOT delete their login but will prevent them from accessing the shop.") && db.ref(`riders/${id}`).remove();

// (Duplicate loadReports/generateCustomReport/download blocks removed — canonical versions below at ~L1207)
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

            const displayPhone = phone.slice(0, 2) + "****" + phone.slice(-4);
            const truncatedAddress = c.address ? (c.address.length > 30 ? c.address.substring(0, 30) + "..." : c.address) : "No address saved";

            table.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05)">
                    <td>
                        <div style="font-weight:600; color:var(--text-main)">${escapeHtml(c.name)}</div>
                        <small style="color:var(--text-muted); font-size:10px;">Joined: ${c.registeredAt ? new Date(c.registeredAt).toLocaleDateString() : 'N/A'}</small>
                    </td>
                    <td>
                        <a href="https://wa.me/${phone.replace(/\D/g, "")}" target="_blank" style="color:var(--primary); text-decoration:none; display:flex; align-items:center; gap:5px;">
                            <i class="fab fa-whatsapp"></i> ${displayPhone}
                        </a>
                    </td>
                    <td>
                        <div style="font-size:12px; color:var(--text-main); max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(c.address || '')}">
                            ${escapeHtml(truncatedAddress)}
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
        status: "Out for Delivery"
        // Security logic: adminMasterOTP removed as per "no master bypass" policy
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

// =============================
// WALK-IN / COUNTER SALE (POS)
// =============================

// Cart state: { dishId: { name, price, qty } }
let walkinCart = {};
let walkinPayMethod = 'Cash';
let activeWalkinCategory = 'All';
let cachedDishes = [];

// Category emoji map for dish cards
const catEmoji = {
    'pizza': '🍕', 'burger': '🍔', 'cake': '🎂', 'pastry': '🧁',
    'sandwich': '🥪', 'drink': '🥤', 'beverage': '🥤', 'juice': '🧃',
    'ice cream': '🍨', 'dessert': '🍰', 'pasta': '🍝', 'salad': '🥗',
    'fries': '🍟', 'chicken': '🍗', 'noodles': '🍜', 'biryani': '🍛',
    'thali': '🍽️', 'combo': '🎁', 'wrap': '🌯', 'coffee': '☕',
    'shake': '🥛', 'mocktail': '🍹'
};

function getCatEmoji(category) {
    if (!category) return '🍽️';
    const lower = category.toLowerCase();
    for (const [key, emoji] of Object.entries(catEmoji)) {
        if (lower.includes(key)) return emoji;
    }
    return '🍽️';
}

function loadWalkinMenu() {
    const grid = document.getElementById('walkinDishGrid');
    if (!grid) return;

    // Fetch Categories for Tabs
    db.ref('Menu/Categories').once('value').then(catSnap => {
        const catContainer = document.getElementById('walkinCategoryTabs');
        if (catContainer) {
            let catsHtml = `<div class="category-tab ${activeWalkinCategory === 'All' ? 'active' : ''}" onclick="filterWalkinByCategory('All')">All</div>`;
            catSnap.forEach(child => {
                const cat = child.val();
                if (!cat.outlet || cat.outlet === currentOutlet) {
                    catsHtml += `<div class="category-tab ${activeWalkinCategory === cat.name ? 'active' : ''}" onclick="filterWalkinByCategory('${escapeHtml(cat.name)}')">${escapeHtml(cat.name)}</div>`;
                }
            });
            catContainer.innerHTML = catsHtml;
        }
    });

    db.ref(`dishes/${currentOutlet}`).once('value').then(snap => {
        cachedDishes = [];
        snap.forEach(child => {
            cachedDishes.push({ id: child.key, ...child.val() });
        });

        if (cachedDishes.length === 0) {
            grid.innerHTML = '<p class="menu-loading-placeholder">No dishes found. Add dishes in Menu → Dishes first.</p>';
            return;
        }

        applyWalkinFilters();

        // Search filter
        const search = document.getElementById('walkinDishSearch');
        if (search) {
            search.oninput = () => applyWalkinFilters();
        }

        // Customer Phone Auto-fill
        const phoneInput = document.getElementById('walkinCustPhone');
        if (phoneInput) {
            phoneInput.oninput = () => {
                const phone = phoneInput.value.trim();
                if (phone.length === 10) checkWalkinCustomer(phone);
            };
        }
    });
}

function filterWalkinByCategory(catName) {
    activeWalkinCategory = catName;
    const tabs = document.querySelectorAll('.category-tab');
    tabs.forEach(tab => {
        if (tab.textContent === catName) tab.classList.add('active');
        else tab.classList.remove('active');
    });
    applyWalkinFilters();
}

function applyWalkinFilters() {
    const search = document.getElementById('walkinDishSearch');
    const term = search ? search.value.toLowerCase() : "";
    
    const filtered = cachedDishes.filter(d => {
        const matchesSearch = d.name.toLowerCase().includes(term);
        const matchesCat = activeWalkinCategory === 'All' || d.category === activeWalkinCategory;
        return matchesSearch && matchesCat;
    });

    renderWalkinDishGrid(filtered);
}

async function checkWalkinCustomer(phone) {
    try {
        const snap = await db.ref(`customers/${currentOutlet}/${phone}`).once('value');
        if (snap.exists()) {
            const data = snap.val();
            const nameInput = document.getElementById('walkinCustName');
            if (nameInput) {
                nameInput.value = data.name || "";
                showAlert('✨ Returning Customer: ' + data.name, 'success');
            }
        }
    } catch (e) { console.error(e); }
}

window.setDiscount = (val) => {
    const el = document.getElementById('walkinDiscount');
    if (el) {
        el.value = val;
        updateWalkinTotal();
    }
};

window.setDiscountPct = (pct) => {
    let subtotal = 0;
    Object.values(walkinCart).forEach(item => subtotal += item.price * item.qty);
    const val = Math.round(subtotal * (pct / 100));
    window.setDiscount(val);
};

window.clearWalkinCart = () => {
    if (Object.keys(walkinCart).length === 0) return;
    if (confirm('Clear entire order?')) {
        walkinCart = {};
        document.getElementById('walkinDiscount').value = 0;
        document.getElementById('walkinCustName').value = '';
        document.getElementById('walkinCustPhone').value = '';
        renderWalkinCart();
    }
};

function renderWalkinDishGrid(dishes) {
    const grid = document.getElementById('walkinDishGrid');
    grid.innerHTML = '';

    dishes.forEach(d => {
        const hasSizes = d.sizes && Object.keys(d.sizes).length > 0;
        const card = document.createElement('div');
        card.className = 'walkin-dish-card' + (d.stock === false ? ' out-of-stock' : '');
        
        let cardContent = `
            <div class="dish-emoji">${getCatEmoji(d.category)}</div>
            <div class="dish-name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>
        `;

        if (hasSizes) {
            cardContent += `<div class="size-chip-container">`;
            Object.entries(d.sizes).forEach(([size, price]) => {
                cardContent += `
                    <div class="size-chip" onclick="event.stopPropagation(); addToWalkinCart('${d.id}', '${escapeHtml(d.name)}', ${price}, '${escapeHtml(size)}')">
                        <span>${escapeHtml(size)}</span>
                        <span class="price">₹${price}</span>
                    </div>
                `;
            });
            cardContent += `</div>`;
        } else {
            cardContent += `<div class="dish-price">₹${d.price || 0}</div>`;
        }

        if (d.stock === false) {
            cardContent += `<div style="font-size:10px; color:#ef4444; margin-top:4px;">Out of Stock</div>`;
        }
        
        card.innerHTML = cardContent;

        if (!hasSizes) {
            card.addEventListener('click', () => {
                if (d.stock === false) return;
                addToWalkinCart(d.id, d.name, Number(d.price) || 0);
            });
        }
        
        grid.appendChild(card);
    });
}

function addToWalkinCart(id, name, price, size = "Regular") {
    const cartKey = id + "_" + size;
    if (walkinCart[cartKey]) {
        walkinCart[cartKey].qty++;
    } else {
        walkinCart[cartKey] = { id, name, price, qty: 1, size };
    }
    renderWalkinCart();
}

function removeFromWalkinCart(id) {
    delete walkinCart[id];
    renderWalkinCart();
}

window.walkinQtyChange = (id, delta) => {
    if (!walkinCart[id]) return;
    walkinCart[id].qty += delta;
    if (walkinCart[id].qty <= 0) {
        delete walkinCart[id];
    }
    renderWalkinCart();
};

window.walkinRemoveItem = (id) => removeFromWalkinCart(id);

function renderWalkinCart() {
    const container = document.getElementById('walkinCartItems');
    if (!container) return;

    const keys = Object.keys(walkinCart);
    if (keys.length === 0) {
        container.innerHTML = '<p id="walkinEmptyMsg" style="color:var(--text-muted); font-size:13px; text-align:center; padding:30px 0;">Tap dishes to add them here</p>';
        updateWalkinTotal();
        return;
    }

    container.innerHTML = keys.map(key => {
        const item = walkinCart[key];
        const displayName = item.size !== "Regular" ? `${item.name} (${item.size})` : item.name;
        return `
            <div class="walkin-cart-item">
                <span class="item-name">${escapeHtml(displayName)}</span>
                <div class="qty-controls">
                    <button class="qty-btn" onclick="walkinQtyChange('${key}', -1)">−</button>
                    <span class="qty-val">${item.qty}</span>
                    <button class="qty-btn" onclick="walkinQtyChange('${key}', 1)">+</button>
                </div>
                <span class="item-price">₹${(item.price * item.qty).toLocaleString()}</span>
                <button class="remove-btn" onclick="walkinRemoveItem('${key}')" title="Remove">✕</button>
            </div>
        `;
    }).join('');

    updateWalkinTotal();
}

window.updateWalkinTotal = () => {
    let subtotal = 0;
    Object.values(walkinCart).forEach(item => {
        subtotal += item.price * item.qty;
    });

    const discount = Math.max(0, Number(document.getElementById('walkinDiscount')?.value) || 0);
    const total = Math.max(0, subtotal - discount);

    const subEl = document.getElementById('walkinSubtotal');
    const totalEl = document.getElementById('walkinTotal');
    if (subEl) subEl.textContent = '₹' + subtotal.toLocaleString();
    if (totalEl) totalEl.textContent = '₹' + total.toLocaleString();
};

window.selectPayMethod = (btn) => {
    document.querySelectorAll('.walkin-pay-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    walkinPayMethod = btn.dataset.method;
};

window.submitWalkinSale = async () => {
    const keys = Object.keys(walkinCart);
    if (keys.length === 0) {
        return alert('Please add at least one item to the cart.');
    }

    const custName = document.getElementById('walkinCustName')?.value.trim() || 'Walk-in Customer';
    const custPhone = document.getElementById('walkinCustPhone')?.value.trim() || '';
    const discount = Math.max(0, Number(document.getElementById('walkinDiscount')?.value) || 0);

    let subtotal = 0;
    const items = keys.map(key => {
        const item = walkinCart[key];
        subtotal += item.price * item.qty;
        return { 
            dishId: item.id, 
            name: item.name, 
            price: item.price, 
            quantity: item.qty,
            size: item.size 
        };
    });

    const total = Math.max(0, subtotal - discount);
    const orderId = 'WALK-' + Date.now().toString().slice(-6);

    const orderData = {
        orderId,
        customerName: custName,
        phone: custPhone,
        items,
        subtotal,
        discount,
        total,
        paymentMethod: walkinPayMethod,
        paymentStatus: 'Paid',
        status: 'Delivered',
        type: 'Walk-in',
        outlet: currentOutlet,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    try {
        await db.ref('orders/' + orderId).set(orderData);
        
        // Update customer LTV if phone provided
        if (custPhone) {
            const custRef = db.ref(`customers/${currentOutlet}/${custPhone}`);
            const cSnap = await custRef.once('value');
            const cData = cSnap.val() || { name: custName, orders: 0, ltv: 0, lastAddress: 'Walk-in' };
            await custRef.update({
                name: custName,
                orders: (cData.orders || 0) + 1,
                ltv: (cData.ltv || 0) + total,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        }

        // --- NEW: Post-Sale Flux ---
        const confirmPrint = confirm('Sale Recorded Successfully!\n\nID: ' + orderId + '\nTotal: ₹' + total + '\n\nWould you like to PRINT the receipt?');
        if (confirmPrint) {
            printOrderReceipt(orderData);
        }

        // Reset
        walkinCart = {};
        document.getElementById('walkinDiscount').value = 0;
        document.getElementById('walkinCustName').value = '';
        document.getElementById('walkinCustPhone').value = '';
        renderWalkinCart();
        showAlert('Sale Recorded successfully!', 'success');
    } catch (e) {
        alert('Error recording sale: ' + e.message);
    }
};

function standardizeOrderData(o) {
    if (!o) return null;
    
    // Ensure ID consistent
    const orderId = o.orderId || o.id || (o.key ? o.key.slice(-8).toUpperCase() : "ORD-N/A");
    
    // Items mapping (standardize unit price and name)
    const items = (o.items || []).map(i => ({
        name: i.name || "Unknown Item",
        size: i.size || "",
        quantity: parseInt(i.quantity) || 1,
        price: parseFloat(i.price || i.unitPrice || 0)
    }));

    return {
        orderId: orderId,
        date: o.createdAt ? new Date(o.createdAt).toLocaleString() : new Date().toLocaleString(),
        customerName: o.customerName || "Walk-in Customer",
        phone: o.phone || o.whatsappNumber || "",
        address: o.address || "",
        items: items,
        subtotal: parseFloat(o.subtotal || o.itemTotal || 0),
        discount: parseFloat(o.discount || 0),
        deliveryFee: parseFloat(o.deliveryFee || 0),
        total: parseFloat(o.total || 0),
        paymentMethod: o.paymentMethod || "Cash",
        type: o.type === "Walk-in" ? "Dine-in" : "Online Booked"
    };
}

window.printReceiptById = async (orderId) => {
    try {
        const snap = await db.ref("orders").orderByChild("orderId").equalTo(orderId).once("value");
        let order;
        if (snap.exists()) {
            snap.forEach(s => order = s.val());
        } else {
            // Try by push key
            const snap2 = await db.ref(`orders/${orderId}`).once("value");
            order = snap2.val();
        }

        if (!order) {
            alert("Order not found!");
            return;
        }

        printOrderReceipt(order, true); // true for 'Reprint' label if needed
    } catch (e) {
        console.error("Print Error:", e);
        alert("Failed to fetch order for printing.");
    }
};

async function printOrderReceipt(rawOrder, isReprint = false) {
    const o = standardizeOrderData(rawOrder);
    if (!o) return;

    // Load Store Settings for branding
    let store = { 
        entityName: "", storeName: window.currentOutlet === 'pizza' ? 'ROSHANI PIZZA' : 'ROSHANI CAKES',
        address: "", gstin: "", fssai: "", tagline: "THANK YOU", poweredBy: "Powered by Roshani ERP", 
        config: { showAddress: true, showGSTIN: false, showFSSAI: false, showTagline: true, showPoweredBy: true, showQR: false }
    };

    try {
        const storeSnap = await db.ref("Settings/Store").once("value");
        if (storeSnap.exists()) store = storeSnap.val();
    } catch(e) {}

    const printWindow = window.open('', '_blank', 'width=450,height=800');
    
    const itemsHtml = o.items.map(i => `
        <tr>
            <td style="padding: 4px 0;">
                ${escapeHtml(i.name)} ${i.size && i.size !== "Regular" ? `<br><small>(${escapeHtml(i.size)})</small>` : ""}
            </td>
            <td style="text-align:center;">${i.quantity}</td>
            <td style="text-align:right;">${i.price.toFixed(2)}</td>
            <td style="text-align:right;">${(i.price * i.quantity).toFixed(2)}</td>
        </tr>
    `).join('');

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Bill - ${o.orderId}</title>
            <style>
                * { box-sizing: border-box; }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    width: 76mm; 
                    margin: 0; 
                    padding: 8mm 4mm;
                    color: #000;
                    line-height: 1.3;
                }
                .center { text-align: center; }
                .bold { font-weight: bold; }
                .mt-10 { margin-top: 10px; }
                .hr { border-top: 1px dashed #000; margin: 8px 0; }
                
                .header-title { font-size: 1.4rem; font-weight: 900; margin: 0; }
                .header-sub { font-size: 0.9rem; margin-bottom: 2px; }
                .meta-text { font-size: 0.8rem; }
                
                table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 5px; }
                th { border-bottom: 1px dashed #000; padding: 4px 0; border-top: 1px dashed #000; font-size: 0.75rem; }
                
                .summary { margin-top: 10px; font-size: 0.9rem; }
                .summary-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
                .grand-total { font-size: 1.1rem; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 0; margin-top: 5px; }
                
                .qr-container { margin-top: 15px; text-align: center; }
                .qr-img { width: 100px; height: 100px; border: 1px solid #eee; padding: 2px; }
                .footer { font-size: 0.75rem; color: #555; margin-top: 20px; text-align: center; font-style: italic; }
            </style>
        </head>
        <body onload="setTimeout(() => { window.print(); window.close(); }, 500);">
            <div class="center">
                ${store.entityName ? `<div class="header-sub bold">${store.entityName.toUpperCase()}</div>` : ''}
                <h1 class="header-title">${store.storeName.toUpperCase()}</h1>
                ${store.config.showAddress && store.address ? `<div class="meta-text mt-10">${store.address}</div>` : ''}
                ${store.config.showGSTIN && store.gstin ? `<div class="meta-text bold">GSTIN: ${store.gstin}</div>` : ''}
                ${store.config.showFSSAI && store.fssai ? `<div class="meta-text">FSSAI No: ${store.fssai}</div>` : ''}
                
                <div class="hr"></div>
                ${isReprint ? `<div class="bold" style="font-size:0.8rem;">*** REPRINTED BILL ***</div>` : ''}
                <div class="bold" style="font-size:1rem; margin: 4px 0;">${o.type.toUpperCase()}</div>
                <div class="hr"></div>
            </div>

            <div class="meta-text">
                <div class="summary-row"><span class="bold">Order ID:</span> <span>${o.orderId}</span></div>
                <div class="summary-row"><span class="bold">Date:</span> <span>${o.date}</span></div>
                <div class="summary-row"><span class="bold">Pay Mode:</span> <span>${o.paymentMethod}</span></div>
            </div>
            
            <div class="hr"></div>

            <table>
                <thead>
                    <tr>
                        <th style="text-align:left;">Item</th>
                        <th style="text-align:center; width: 12%;">Qty</th>
                        <th style="text-align:right; width: 22%;">Rate</th>
                        <th style="text-align:right; width: 22%;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div class="hr"></div>
            
            <div class="summary meta-text">
                <div class="summary-row">
                    <span>Total Items:</span>
                    <span>${o.items.reduce((sum, i) => sum + i.quantity, 0)}</span>
                </div>
                <div class="summary-row">
                    <span>Subtotal:</span>
                    <span>${o.subtotal.toFixed(2)}</span>
                </div>
                ${o.deliveryFee > 0 ? `<div class="summary-row"><span>Delivery Fee:</span> <span>${o.deliveryFee.toFixed(2)}</span></div>` : ''}
                ${o.discount > 0 ? `<div class="summary-row"><span>Discount:</span> <span>-${o.discount.toFixed(2)}</span></div>` : ''}
                
                <div class="summary-row grand-total bold">
                    <span>Grand Total:</span>
                    <span>Rs ${o.total.toFixed(2)}</span>
                </div>
            </div>

            <div class="mt-10 meta-text">
                <div class="bold">Customer:</div>
                <div>${o.customerName} ${o.phone ? `(${o.phone})` : ''}</div>
                ${o.address && o.type === 'Online Booked' ? `<div style="font-size:0.75rem;">Addr: ${o.address}</div>` : ''}
            </div>

            ${store.config.showWifiInfo && store.wifiName ? `
            <div class="hr"></div>
            <div class="center meta-text" style="font-size: 0.8rem; margin-top: 5px;">
                <span class="bold">📶 WiFi:</span> ${store.wifiName}
                ${store.wifiPass ? `<br><span class="bold">Pwd:</span> ${store.wifiPass}` : ''}
            </div>` : ''}

            ${store.config.showSocial && (store.instagram || store.reviewUrl) ? `
            <div class="hr"></div>
            <div class="center meta-text" style="font-size: 0.8rem;">
                ${store.instagram ? `<div>📸 Instagram: <span class="bold">${store.instagram}</span></div>` : ''}
                ${store.reviewUrl ? `<div class="mt-4">⭐ Rate us: <span style="font-size: 0.7rem;">${store.reviewUrl}</span></div>` : ''}
            </div>` : ''}

            ${store.config.showQR && store.qrUrl ? `
            <div class="qr-container">
                <div class="meta-text bold mb-4">Scan to Pay</div>
                <img src="${store.qrUrl}" class="qr-img">
            </div>` : ''}

            ${store.config.showTagline && store.tagline ? `
            <div class="center bold mt-10" style="font-size: 0.85rem;">
                ${store.tagline}
            </div>` : ''}

            ${store.config.showPoweredBy && store.poweredBy ? `
            <div class="footer">
                ${store.poweredBy}
            </div>` : ''}
            
            <div style="height: 10mm;"></div>
        </body>
        </html>`;
        
    printWindow.document.write(html);
    printWindow.document.close();
}

// =============================
// DELIVERY SETTINGS
// =============================
window.addFeeSlab = (km = "", fee = "") => {
    const tbody = document.getElementById('feeSlabsTable');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td style="padding: 8px;"><input type="number" class="slab-km form-input" value="${km}" placeholder="KM" style="padding: 6px 10px;"></td>
        <td style="padding: 8px;"><input type="number" class="slab-fee form-input" value="${fee}" placeholder="₹" style="padding: 6px 10px;"></td>
        <td style="padding: 8px;"><button onclick="this.parentElement.parentElement.remove()" class="btn-secondary btn-small" style="padding: 5px 8px;">🗑️</button></td>
    `;
    tbody.appendChild(tr);
};

window.loadStoreSettings = async () => {
    try {
        // Load Delivery Settings
        const delSnap = await db.ref("Settings/Delivery").once("value");
        let delData = delSnap.val() || {
            coords: { lat: 25.887444, lng: 85.026889 },
            slabs: [{ km: 2, fee: 20 }, { km: 5, fee: 40 }, { km: 8, fee: 60 }]
        };

        // Load Receipt / Store Info Settings
        const storeSnap = await db.ref("Settings/Store").once("value");
        let storeData = storeSnap.val() || {
            entityName: "", storeName: "", address: "", gstin: "", fssai: "", tagline: "", poweredBy: "Powered by Roshani ERP",
            developerPhone: "",
            reportPhone: "",
            shopOpenTime: "10:00",
            shopCloseTime: "23:00",
            wifiName: "", wifiPass: "", instagram: "", facebook: "", reviewUrl: "",
            feedbackReason1: "Taste & Quality", feedbackReason2: "Delivery Speed", feedbackReason3: "Value for Money",
            config: { showAddress: true, showGSTIN: false, showFSSAI: false, showTagline: true, showPoweredBy: true, showQR: false, showWifiInfo: false, showSocial: false }
        };

        // Populate Delivery UI
        document.getElementById('settingLat').value = delData.coords.lat;
        document.getElementById('settingLng').value = delData.coords.lng;
        document.getElementById('displayCoords').innerText = `${delData.coords.lat}, ${delData.coords.lng}`;
        if (delData.notifyPhone) document.getElementById('settingAdminPhone').value = delData.notifyPhone;

        const slabContainer = document.getElementById('feeSlabsTable');
        if (slabContainer) {
            slabContainer.innerHTML = '';
            if (delData.slabs) delData.slabs.forEach(slab => window.addFeeSlab(slab.km, slab.fee));
        }

        // Populate Store UI
        document.getElementById('settingEntityName').value = storeData.entityName || "";
        document.getElementById('settingStoreName').value = storeData.storeName || "";
        document.getElementById('settingStoreAddress').value = storeData.address || "";
        document.getElementById('settingGSTIN').value = storeData.gstin || "";
        document.getElementById('settingFSSAI').value = storeData.fssai || "";
        document.getElementById('settingTagline').value = storeData.tagline || "";
        document.getElementById('settingPoweredBy').value = storeData.poweredBy || "";
        document.getElementById('settingDevPhone').value = storeData.developerPhone || "";
        document.getElementById('settingReportPhone').value = storeData.reportPhone || "";
        document.getElementById('settingOpenTime').value = storeData.shopOpenTime || "10:00";
        document.getElementById('settingCloseTime').value = storeData.shopCloseTime || "23:00";
        document.getElementById('settingWifiName').value = storeData.wifiName || "";
        document.getElementById('settingWifiPass').value = storeData.wifiPass || "";
        document.getElementById('settingInstagram').value = storeData.instagram || "";
        document.getElementById('settingFacebook').value = storeData.facebook || "";
        document.getElementById('settingReviewUrl').value = storeData.reviewUrl || "";
        document.getElementById('settingFeedbackReason1').value = storeData.feedbackReason1 || "Taste & Quality";
        document.getElementById('settingFeedbackReason2').value = storeData.feedbackReason2 || "Delivery Speed";
        document.getElementById('settingFeedbackReason3').value = storeData.feedbackReason3 || "Value for Money";
        
        // Toggles
        const config = storeData.config || {};
        document.getElementById('checkShowAddress').checked = config.showAddress !== false;
        document.getElementById('checkShowGSTIN').checked = !!config.showGSTIN;
        document.getElementById('checkShowFSSAI').checked = !!config.showFSSAI;
        document.getElementById('checkShowTagline').checked = config.showTagline !== false;
        document.getElementById('checkShowPoweredBy').checked = config.showPoweredBy !== false;
        document.getElementById('checkShowQR').checked = !!config.showQR;
        document.getElementById('checkShowWifiInfo').checked = !!config.showWifiInfo;
        document.getElementById('checkShowSocial').checked = !!config.showSocial;

        // QR Preview
        if (storeData.qrUrl) {
            document.getElementById('qrPreview').src = storeData.qrUrl;
            document.getElementById('settingQRUrl').value = storeData.qrUrl;
        }

    } catch (e) {
        console.error("Load Store Settings Error:", e);
    }
};

window.saveStoreSettings = async () => {
    const btn = document.querySelector("#tab-settings .btn-primary");
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Saving...";

    try {
        // 1. Handle QR Upload if new file selected
        const qrFile = document.getElementById('settingQRFile').files[0];
        let qrUrl = document.getElementById('settingQRUrl').value;

        if (qrFile) {
            qrUrl = await uploadImage(qrFile, `settings/payment_qr_${Date.now()}`);
        }

        // 2. Collect Delivery Data
        const lat = parseFloat(document.getElementById('settingLat').value);
        const lng = parseFloat(document.getElementById('settingLng').value);
        const notifyPhone = document.getElementById('settingAdminPhone').value.trim();

        const slabRows = document.querySelectorAll('#feeSlabsTable tr');
        const slabs = Array.from(slabRows).map(row => ({
            km: parseFloat(row.querySelector('.slab-km').value),
            fee: parseFloat(row.querySelector('.slab-fee').value)
        })).filter(s => !isNaN(s.km) && !isNaN(s.fee));
        slabs.sort((a, b) => a.km - b.km);

        // 3. Collect Store Data
        const storeData = {
            entityName: document.getElementById('settingEntityName').value.trim(),
            storeName: document.getElementById('settingStoreName').value.trim(),
            address: document.getElementById('settingStoreAddress').value.trim(),
            gstin: document.getElementById('settingGSTIN').value.trim(),
            fssai: document.getElementById('settingFSSAI').value.trim(),
            tagline: document.getElementById('settingTagline').value.trim(),
            poweredBy: document.getElementById('settingPoweredBy').value.trim(),
            developerPhone: document.getElementById('settingDevPhone').value.trim(),
            reportPhone: document.getElementById('settingReportPhone').value.trim(),
            shopOpenTime: document.getElementById('settingOpenTime').value,
            shopCloseTime: document.getElementById('settingCloseTime').value,
            wifiName: document.getElementById('settingWifiName').value.trim(),
            wifiPass: document.getElementById('settingWifiPass').value.trim(),
            instagram: document.getElementById('settingInstagram').value.trim(),
            facebook: document.getElementById('settingFacebook').value.trim(),
            reviewUrl: document.getElementById('settingReviewUrl').value.trim(),
            feedbackReason1: document.getElementById('settingFeedbackReason1').value.trim(),
            feedbackReason2: document.getElementById('settingFeedbackReason2').value.trim(),
            feedbackReason3: document.getElementById('settingFeedbackReason3').value.trim(),
            qrUrl: qrUrl,
            config: {
                showAddress: document.getElementById('checkShowAddress').checked,
                showGSTIN: document.getElementById('checkShowGSTIN').checked,
                showFSSAI: document.getElementById('checkShowFSSAI').checked,
                showTagline: document.getElementById('checkShowTagline').checked,
                showPoweredBy: document.getElementById('checkShowPoweredBy').checked,
                showQR: document.getElementById('checkShowQR').checked,
                showWifiInfo: document.getElementById('checkShowWifiInfo').checked,
                showSocial: document.getElementById('checkShowSocial').checked
            }
        };

        // 4. Update Firebase
        await Promise.all([
            db.ref("Settings/Delivery").set({ coords: { lat, lng }, notifyPhone, slabs }),
            db.ref("Settings/Store").set(storeData)
        ]);

        document.getElementById('displayCoords').innerText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        if (qrUrl) document.getElementById('settingQRUrl').value = qrUrl;

        // Success Alert
        const alertContainer = document.getElementById('alertContainer');
        if (alertContainer) {
            const div = document.createElement('div');
            div.className = 'alert-box';
            div.style.borderLeftColor = '#22c55e';
            div.innerHTML = `
                <div class="alert-title">✅ Settings Saved</div>
                <div class="alert-sub">Store profile and delivery rules updated.</div>
            `;
            alertContainer.appendChild(div);
            setTimeout(() => div.remove(), 3000);
        }

    } catch (e) {
        alert("Failed to save: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
};

function loadFeedbacks() {
    const tableBody = document.getElementById("feedbackTableBody");
    if (!tableBody) return;

    db.ref("feedbacks").off();
    db.ref("feedbacks").on("value", snap => {
        tableBody.innerHTML = "";
        const feedbacks = [];
        snap.forEach(child => {
            feedbacks.push({ id: child.key, ...child.val() });
        });

        // Sort by date (desc)
        feedbacks.sort((a,b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

        if (feedbacks.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-muted);">No feedback received yet.</td></tr>`;
            return;
        }

        feedbacks.forEach(f => {
            const stars = "⭐".repeat(f.rating || 0);
            const dateStr = f.timestamp ? new Date(f.timestamp).toLocaleString() : "N/A";
            
            tableBody.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03)">
                    <td style="padding:15px; font-size:12px;">${dateStr}</td>
                    <td style="padding:15px; font-family:monospace; font-weight:700;">#${escapeHtml(f.orderId || 'N/A')}</td>
                    <td style="padding:15px">
                        <div style="font-weight:700;">${escapeHtml(f.customerName || 'Guest')}</div>
                        <small style="color:var(--text-muted);">${escapeHtml(f.phone || '')}</small>
                    </td>
                    <td style="padding:15px; font-size:14px;">${stars}</td>
                    <td style="padding:15px">
                        <div style="font-weight:600; color:var(--text-main);">${escapeHtml(f.reason || f.feedback || '')}</div>
                        ${f.comment ? `<div style="font-size:12px; color:var(--text-muted); margin-top:4px; font-style:italic;">"${escapeHtml(f.comment)}"</div>` : ''}
                    </td>
                </tr>
            `;
        });
    });
}

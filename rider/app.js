// ==========================================
// PIZZA ERP | RIDER PORTAL v3.0 (LIGHT)
// ==========================================

let currentUser = null;
let currentOrderId = null;
window.activeOrders = {};

// XSS prevention helper
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 1. NAVIGATION & UI HANDLING
 */
window.showSection = (sectionId) => {
    // Hide all sections
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    // Show target section
    const target = document.getElementById(`sec-${sectionId}`);
    if (target) target.classList.add('active');

    // Update Desktop Sidebar
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.classList.toggle('active', li.getAttribute('data-section') === sectionId);
    });

    // Update Mobile Bottom Nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-section') === sectionId);
    });

    // Update Header Title
    const titles = {
        'home': 'Dashboard',
        'available': 'Pickup Hub',
        'active': 'Active Trip',
        'completed': 'Trip History',
        'earnings': 'Wallet',
        'profile': 'My Account'
    };
    document.getElementById('sectionTitle').innerText = titles[sectionId] || 'Rider Portal';

    // Refresh icons
    if (window.lucide) lucide.createIcons();
};

/**
 * 2. AUTHENTICATION & SESSION
 */
window.login = async () => {
    const email = document.getElementById('email').value.trim().toLowerCase();
    const pass = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');

    if (!email || !pass) {
        showError("Please enter credentials");
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (e) {
        showError("Invalid email or secret code");
        console.error("Login failed:", e);
    }
};

function showError(msg) {
    const errorEl = document.getElementById('loginError');
    errorEl.innerText = msg;
    errorEl.style.display = 'block';
    setTimeout(() => errorEl.style.display = 'none', 3000);
}

window.logout = () => {
    if(confirm("End your shift and logout?")) {
        auth.signOut();
    }
};

auth.onAuthStateChanged(async user => {
    const loginBox = document.getElementById('loginBox');
    const dashboard = document.getElementById('dashboard');

    if (!user) {
        loginBox.style.display = 'flex';
        dashboard.style.display = 'none';
        return;
    }

    try {
        const ridersSnap = await db.ref("riders").once("value");
        let riderProfile = null;
        const normalizedEmail = user.email.toLowerCase();

        ridersSnap.forEach(child => {
            const r = child.val();
            if (r.email && r.email.toLowerCase() === normalizedEmail) {
                riderProfile = { id: child.key, ...r };
            }
        });

        if (!riderProfile) {
            alert("RIDER ERROR: Account not found in active database. Contact Admin.");
            auth.signOut();
            return;
        }

        currentUser = { ...user, profile: riderProfile };
        
        // Populate UI
        document.getElementById('profileName').innerText = riderProfile.name || "Rider";
        document.getElementById('profilePhone').innerText = riderProfile.phone || user.email;
        document.getElementById('r-name').innerText = (riderProfile.name || "Rider").split(' ')[0];
        
        updateStatusUI(riderProfile.status || "Online");

        loginBox.style.display = 'none';
        dashboard.style.display = 'block';
        
        initRealtimeListeners();
        showSection('home');
        
    } catch (err) {
        console.error("Session Error:", err);
    }
});

window.toggleRiderStatus = async () => {
    const newStatus = currentUser.profile.status === "Online" ? "Offline" : "Online";
    try {
        await db.ref(`riders/${currentUser.profile.id}`).update({ status: newStatus });
        currentUser.profile.status = newStatus;
        updateStatusUI(newStatus);
    } catch (e) {
        alert("Failed to sync status");
    }
};

function updateStatusUI(status) {
    const badge = document.getElementById('statusBadge');
    const btn = document.getElementById('statusToggleBtn');
    if (!badge || !btn) return;
    
    badge.innerText = status;
    badge.className = `status ${status}`;
    btn.innerText = `SET STATUS: ${status === "Online" ? 'OFFLINE' : 'ONLINE'}`;
    btn.style.background = status === "Online" ? "var(--danger-red)" : "var(--success-green)";
    btn.style.color = "white";
}

/**
 * 3. REALTIME DATA
 */
function initRealtimeListeners() {
    db.ref('orders').on('value', snap => {
        const unassignedList = document.getElementById('unassignedOrdersList');
        const activeView = document.getElementById('activeOrderView');
        const completedList = document.getElementById('completedOrdersList');
        
        unassignedList.innerHTML = '';
        completedList.innerHTML = '';
        activeView.innerHTML = '<div class="glass-panel" style="padding:40px; text-align:center;"><p style="color:var(--text-muted)">No active trip. Choose an order from Pickup Hub.</p></div>';
        
        let stats = {
            todayDelivered: 0,
            todayEarnings: 0,
            totalEarnings: 0,
            hasActive: false,
            availableCount: 0
        };

        const today = new Date().toDateString();
        const normalizedMyEmail = currentUser.email.toLowerCase();

        snap.forEach(child => {
            const o = child.val();
            const id = child.key;
            const orderDate = o.timestamp ? new Date(o.timestamp).toDateString() : '';
            const isToday = orderDate === today;

            // 1. COMPLETED
            if (o.status === "Delivered" && o.assignedRider && o.assignedRider.toLowerCase() === normalizedMyEmail) {
                const commission = o.riderCommission || 40; 
                stats.totalEarnings += commission;
                if (isToday) {
                    stats.todayDelivered++;
                    stats.todayEarnings += commission;
                }
                completedList.prepend(createOrderCard(id, o, "completed"));
            }

            // 2. AVAILABLE (Cooked/Ready & Unassigned)
            const isReady = o.status === "Cooked" || o.status === "Ready";
            if (isReady && !o.assignedRider) {
                stats.availableCount++;
                unassignedList.appendChild(createOrderCard(id, o, "available"));
            }

            // 3. ACTIVE
            if (o.status === "Out for Delivery" && o.assignedRider && o.assignedRider.toLowerCase() === normalizedMyEmail) {
                stats.hasActive = true;
                activeView.innerHTML = ''; 
                activeView.appendChild(createOrderCard(id, o, "active"));
            }
        });

        // Update UI
        document.getElementById('statsTodayDelivered').innerText = stats.todayDelivered;
        document.getElementById('statsTodayEarnings').innerText = `₹${stats.todayEarnings}`;
        document.getElementById('e-total').innerText = `₹${stats.totalEarnings}`;
        document.getElementById('pickupCount').innerText = `${stats.availableCount} Orders`;

        const banner = document.getElementById('activeStatusBanner');
        if (stats.hasActive) {
            banner.innerHTML = `
                <div style="background:var(--primary-glow); padding:15px; border-radius:15px; border:1px solid var(--primary);">
                    <p style="color:var(--primary); font-weight:900; margin-bottom:10px;">🚀 ONGOING TRIP</p>
                    <button class="btn-primary btn-full" onclick="showSection('active')">GOTO ACTIVE ORDER</button>
                </div>`;
        } else {
            banner.innerHTML = `
                <div style="padding:15px; text-align:center;">
                    <p style="color:var(--text-muted); font-size:14px; margin-bottom:10px;">You are currently free for pickups.</p>
                    <button class="btn-primary btn-full" onclick="showSection('available')">BROWSE ORDERS</button>
                </div>`;
        }

        if (unassignedList.children.length === 0) unassignedList.innerHTML = '<div class="glass-panel" style="padding:40px; text-align:center;"><p style="color:var(--text-muted)">All caught up! No orders for pickup.</p></div>';
        if (completedList.children.length === 0) completedList.innerHTML = '<div class="glass-panel" style="padding:40px; text-align:center;"><p style="color:var(--text-muted)">Start delivering to see history.</p></div>';

        if (window.lucide) lucide.createIcons();
    });
}

function createOrderCard(id, o, type) {
    const card = document.createElement('div');
    card.className = `order-card`;
    
    const isAvailable = type === "available";
    const isActive = type === "active";
    const statusText = isAvailable ? "READY" : (isActive ? "ON TRIP" : "DONE");
    const badgeClass = isAvailable ? "badge-ready" : "badge-delivery";

    // Sanitize all user-supplied fields before DOM insertion
    const safeOrderId = escapeHtml((o.orderId || id.slice(-6)).toUpperCase());
    const safeCustomerName = escapeHtml(o.customerName || 'Customer');
    const safeAddress = escapeHtml(o.address);
    const safeTotal = escapeHtml(String(o.total || 0));
    const safePhone = escapeHtml(o.customerPhone || o.phone || '');
    const safeItemsText = o.items
        ? o.items.map(i => `${escapeHtml(i.name)} (${escapeHtml(i.size)})`).join(', ')
        : 'Food Parcel';
    // JSON.stringify safely embeds address in onclick attribute (handles quotes/special chars)
    const addressJson = JSON.stringify(o.address || '');
    // Use JSON.stringify for phone in tel: to avoid breaking the JS string
    const phoneJson = JSON.stringify(o.customerPhone || o.phone || '');

    card.innerHTML = `
        <div class="order-head">
            <span class="order-id">#${safeOrderId}</span>
            <span class="badge ${badgeClass}">${statusText}</span>
        </div>
        <div class="order-details">
            <p><i data-lucide="user"></i> <span>${safeCustomerName}</span></p>
            <p><i data-lucide="map-pin"></i> <span>${safeAddress}</span></p>
            <p><i data-lucide="shopping-cart"></i> <span>${safeItemsText}</span></p>
            <div style="margin-top:15px; padding-top:15px; border-top:1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center;">
                <span style="color:var(--text-muted); font-size:11px;">TO COLLECT</span>
                <span style="color:var(--primary); font-size:18px; font-weight:900;">&#8377;${safeTotal}</span>
            </div>
        </div>
        <div class="card-actions">
            ${isAvailable ? `<button class="btn-primary btn-full" onclick="acceptOrder('${id}')">START PICKUP</button>` : ''}
            ${isActive ? `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom:10px;">
                    <button class="btn-primary" style="background:#161616; border:1px solid var(--primary); color:var(--primary);" onclick="navigateToCustomer('${id}', ${addressJson})">
                        <i data-lucide="navigation"></i> MAP
                    </button>
                    <button class="btn-primary" style="background:#161616; border:1px solid var(--secondary); color:var(--secondary);" onclick="window.location.href='tel:' + ${phoneJson}">
                        <i data-lucide="phone"></i> CALL
                    </button>
                </div>
                <button class="btn-primary btn-full" onclick="confirmDelivery('${id}')">
                    COMPLETE DELIVERY <i data-lucide="check-circle"></i>
                </button>
            ` : ''}
        </div>
    `;

    return card;
}

window.acceptOrder = async (id) => {
    try {
        const result = await db.ref(`orders/${id}`).transaction(current => {
            // Abort if order is already assigned — prevents race condition between riders
            if (!current || current.assignedRider) return;
            return {
                ...current,
                status: "Out for Delivery",
                assignedRider: currentUser.email.toLowerCase(),
                acceptedAt: Date.now()
            };
        });
        if (result.committed) {
            showSection('active');
        } else {
            alert("Sorry, this order was just accepted by another rider.");
        }
    } catch (e) {
        alert("Operation failed: " + e.message);
    }
};

window.navigateToCustomer = (id, address) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
};

window.confirmDelivery = (id) => {
    currentOrderId = id;
    document.getElementById('otpInput').value = '';
    document.getElementById('otpPanel').style.display = 'flex';
};

window.closeOTPPanel = () => {
    document.getElementById('otpPanel').style.display = 'none';
};

window.verifyOTP = async () => {
    const otp = document.getElementById('otpInput').value;
    if (!otp) return;
    
    try {
        const snap = await db.ref(`orders/${currentOrderId}`).once('value');
        const order = snap.val();
        
        // Only accept the OTP from the customer — no master bypass
        if (String(otp).trim() === String(order.otp).trim()) {
            await db.ref(`orders/${currentOrderId}`).update({
                status: "Delivered",
                deliveredAt: firebase.database.ServerValue.TIMESTAMP
            });
            closeOTPPanel();
            showSection('home');
        } else {
            alert("Security code mismatch!");
        }
    } catch (e) {
        alert("System error");
    }
};
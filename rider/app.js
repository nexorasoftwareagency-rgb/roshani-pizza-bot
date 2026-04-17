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
window.toggleRiderSidebar = () => {
    window.haptic(10);
    const nav = document.getElementById('sidebarNav');
    const overlay = document.getElementById('sidebarOverlay');
    if (nav) nav.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
};

window.toggleNotificationSheet = () => {
    alert("Notifications feature coming soon!");
};

window.showSection = (sectionId) => {
    window.haptic(15);
    const nav = document.getElementById('sidebarNav');
    const overlay = document.getElementById('sidebarOverlay');
    window.toggleRiderSidebar(); // Close sidebar on nav
    if (nav) nav.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    
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

// Enter key triggers login on both fields (Wrapped in DOMContentLoaded for safety)
document.addEventListener('DOMContentLoaded', () => {
    const emailField = document.getElementById('email');
    const passField = document.getElementById('password');
    if (emailField) emailField.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.login(); });
    if (passField) passField.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.login(); });
});

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
        // Caching: Check for cached profile
        const cachedOutlet = localStorage.getItem('selectedOutlet');
        
        const ridersSnap = await db.ref("riders").once("value");
        let riderProfile = null;
        const normalizedEmail = user.email.toLowerCase();

        ridersSnap.forEach(child => {
            const r = child.val();
            if (r.email && r.email.toLowerCase() === normalizedEmail) {
                riderProfile = { id: child.key, ...r };
            }
        });

        // Check for Super Admin privileges in 'admins' node too if not a rider
        let isSuper = false;
        if (!riderProfile) {
            const adminsSnap = await db.ref("admins").once("value");
            adminsSnap.forEach(snap => {
                const admin = snap.val();
                if (admin && admin.email && admin.email.toLowerCase() === normalizedEmail && admin.isSuper) {
                    riderProfile = { id: snap.key, name: "Super User", outlet: "all", status: "Online" };
                    isSuper = true;
                }
            });
        } else {
            isSuper = riderProfile.isSuper || false;
        }

        if (!riderProfile) {
            alert("ACCESS DENIED: Role not found.");
            auth.signOut();
            return;
        }

        currentUser = { ...user, profile: riderProfile, isSuper: isSuper };
        
        // Handle Outlet Switcher for Super Users
        const switcher = document.getElementById('outletSwitcher');
        if (isSuper && switcher) {
            switcher.classList.remove('hidden');
            switcher.innerHTML = `
                <option value="all">🌍 All Outlets</option>
                <option value="pizza">🍕 Pizza Only</option>
                <option value="cake">🎂 Cakes Only</option>
            `;
            const savedOutlet = localStorage.getItem('selectedOutlet') || 'all';
            switcher.value = savedOutlet;
            window.currentOutlet = savedOutlet;
        } else {
            window.currentOutlet = riderProfile.outlet || "pizza";
        }

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

/**
 * 2.5 OUTLET SWITCHING & CACHING
 */
window.switchOutlet = (val) => {
    localStorage.setItem('selectedOutlet', val);
    window.currentOutlet = val;
    initRealtimeListeners(); // Hot reload data
    // Show brief toast/feedback
    console.log("Switched to outlet:", val);
};

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

    // Trigger location tracking if online
    if (status === "Online") {
        initLocationTracking();
    } else {
        stopLocationTracking();
    }
}

/**
 * 2.7 LIVE LOCATION TRACKING (30s SYNC)
 */
let _locationWatchId = null;
let _locationInterval = null;
let _lastPos = null;

function initLocationTracking() {
    if (!navigator.geolocation) {
        console.error("Geolocation not supported");
        return;
    }

    if (_locationWatchId) return; // Already running

    // 1. Initial High Precision Watch
    _locationWatchId = navigator.geolocation.watchPosition(
        pos => {
            _lastPos = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                ts: Date.now()
            };
            console.log("GPS Lock:", _lastPos);
        },
        err => {
            console.error("GPS Error:", err);
            // If denied, we should probably force offline
            if (err.code === 1) { // PERMISSION_DENIED
                alert("GPS Permission Denied. Live tracking disabled.");
                db.ref(`riders/${currentUser.profile.id}`).update({ status: "Offline" });
            }
        },
        { enableHighAccuracy: true }
    );

    // 2. Periodic Firebase Sync (every 30s)
    _locationInterval = setInterval(() => {
        if (_lastPos && currentUser && currentUser.profile.status === "Online") {
            const uid = currentUser.profile.id;
            db.ref(`riders/${uid}/location`).set(_lastPos);
            console.log("Location Synced to Cloud (30s Interval)");
        }
    }, 30000);
}

function stopLocationTracking() {
    if (_locationWatchId) {
        navigator.geolocation.clearWatch(_locationWatchId);
        _locationWatchId = null;
    }
    if (_locationInterval) {
        clearInterval(_locationInterval);
        _locationInterval = null;
    }
}

/**
 * 2.8 MAP INTEGRATION (LEAFLET)
 */
let riderMap = null;
let riderMarker = null;
let distMarker = null;

function initRiderMap() {
    const mapDiv = document.getElementById('activeTripMap');
    if (!mapDiv || riderMap) return;

    // Default to a central location (e.g., India) if no GPS yet
    const startPos = _lastPos ? [_lastPos.lat, _lastPos.lng] : [20.5937, 78.9629];
    
    riderMap = L.map('activeTripMap').setView(startPos, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(riderMap);

    riderMarker = L.marker(startPos).addTo(riderMap).bindPopup('You are here');
}

window.updateRiderMap = (destLat, destLng) => {
    if (!riderMap) initRiderMap();
    
    if (_lastPos && riderMap) {
        const curPos = [_lastPos.lat, _lastPos.lng];
        riderMap.setView(curPos, 15);
        riderMarker.setLatLng(curPos);
    }

    if (destLat && destLng && riderMap) {
        if (distMarker) riderMap.removeLayer(distMarker);
        distMarker = L.marker([destLat, destLng], {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            })
        }).addTo(riderMap).bindPopup('Customer Location');
        
        // Fit bounds to show both
        if (_lastPos) {
            const bounds = L.latLngBounds([[_lastPos.lat, _lastPos.lng], [destLat, destLng]]);
            riderMap.fitBounds(bounds, { padding: [50, 50] });
        }
    }
}

/**
 * 3. REALTIME DATA
 */
function initRealtimeListeners() {
    // Detach old listeners if re-initializing
    db.ref('orders').off();

    db.ref('orders').on('value', snap => {
        const unassignedList = document.getElementById('unassignedOrdersList');
        const activeView = document.getElementById('activeOrderView');
        const completedList = document.getElementById('completedOrdersList');
        
        unassignedList.innerHTML = '';
        completedList.innerHTML = '';
        activeView.innerHTML = '<div class="empty-state-glass"><p>No active trip. Choose an order from Pickup Hub.</p></div>';
        
        let stats = {
            todayDelivered: 0,
            pizzaEarnings: 0,
            cakeEarnings: 0,
            todayPizza: 0,
            todayCake: 0,
            hasActive: false,
            availableCount: 0
        };

        const today = new Date().toDateString();
        const myEmail = currentUser.email.toLowerCase();

        let activeOrder = null;

        snap.forEach(child => {
            const o = child.val();
            const id = child.key;
            const outlet = (o.outlet || "pizza").toLowerCase();
            
            // Filter by outlet if not set to "all"
            if (window.currentOutlet !== "all" && outlet !== window.currentOutlet.toLowerCase()) return;

            const orderDate = o.timestamp ? new Date(o.timestamp).toDateString() : '';
            const isToday = orderDate === today;

            if (o.status === "Delivered" && o.assignedRider && o.assignedRider.toLowerCase() === myEmail) {
                const commission = o.riderCommission || 40; 
                
                if (outlet.includes("pizza")) {
                    stats.pizzaEarnings += commission;
                    if (isToday) stats.todayPizza += commission;
                } else if (outlet.includes("cake")) {
                    stats.cakeEarnings += commission;
                    if (isToday) stats.todayCake += commission;
                }

                if (isToday) stats.todayDelivered++;
                completedList.prepend(createOrderCard(id, o, "completed"));
            }

            // 2. AVAILABLE (Cooked/Ready & Unassigned)
            const isReady = o.status === "Cooked" || o.status === "Ready";
            if (isReady && !o.assignedRider) {
                stats.availableCount++;
                unassignedList.appendChild(createOrderCard(id, o, "available"));
            }

            // 3. ACTIVE
            if (o.status === "Out for Delivery" && o.assignedRider && o.assignedRider.toLowerCase() === myEmail) {
                stats.hasActive = true;
                activeView.innerHTML = ''; 
                activeView.appendChild(createOrderCard(id, o, "active"));
            }
        });

        // Update UI
        document.getElementById('statsTodayDelivered').innerText = stats.todayDelivered;
        document.getElementById('statsTodayEarnings').innerText = `₹${stats.todayPizza + stats.todayCake}`;
        
        // Split Wallet UI
        document.getElementById('e-total').innerText = `₹${stats.pizzaEarnings + stats.cakeEarnings}`;
        document.getElementById('e-pizza').innerText = `₹${stats.pizzaEarnings}`;
        document.getElementById('e-cake').innerText = `₹${stats.cakeEarnings}`;
        document.getElementById('e-pizza-today').innerText = `₹${stats.todayPizza}`;
        document.getElementById('e-cake-today').innerText = `₹${stats.todayCake}`;
        
        document.getElementById('pickupCount').innerText = `${stats.availableCount} Orders`;

        const banner = document.getElementById('activeStatusBanner');
        if (stats.hasActive) {
            banner.innerHTML = `
                <div class="banner-glass">
                    <p class="banner-title">🚀 ONGOING TRIP</p>
                    <button class="btn-primary" style="width:100%" onclick="showSection('active')">GOTO ACTIVE ORDER</button>
                </div>`;
        } else {
            banner.innerHTML = `
                <div style="padding:15px; text-align:center;">
                    <p style="color:var(--text-muted); font-size:14px; margin-bottom:12px;">You are currently free for pickups.</p>
                    <button class="btn-primary" style="width:100%" onclick="showSection('available')">BROWSE ORDERS</button>
                </div>`;
        }

        if (unassignedList.children.length === 0) unassignedList.innerHTML = '<div class="empty-state-glass"><p>All caught up! No orders for pickup.</p></div>';
        if (completedList.children.length === 0) completedList.innerHTML = '<div class="empty-state-glass"><p>Start delivering to see history.</p></div>';

        if (window.lucide) lucide.createIcons();
        // Update Stats UI... (lines exist below)
        
        // Toggle Map View
        const mapCont = document.getElementById('activeTripMap');
        if (activeOrder) {
            mapCont.style.display = 'block';
            // Extract coordinates if present in order
            if (activeOrder.lat && activeOrder.lng) {
                window.updateRiderMap(activeOrder.lat, activeOrder.lng);
            } else {
                window.updateRiderMap(); // Just show my location
            }
        } else {
            if (mapCont) mapCont.style.display = 'none';
        }

        // Initialize any sliders that were just rendered
        document.querySelectorAll('.slide-action-container:not(.initialized)').forEach(slider => {
            const orderId = slider.id.replace('slider-', '');
            window.initSliderAction(slider.id, () => window.confirmDelivery(orderId));
            slider.classList.add('initialized');
        });
    });
}

function createOrderCard(id, o, type) {
    const card = document.createElement('div');
    const outlet = (o.outlet || 'pizza').toLowerCase();
    card.className = `order-card order-${outlet}`;
    
    const isAvailable = type === "available";
    const isActive = type === "active";
    const statusText = isAvailable ? "READY" : (isActive ? "ON TRIP" : "DONE");
    const badgeClass = isAvailable ? "badge-ready" : "badge-delivery";

    // Sanitize all user-supplied fields before DOM insertion
    const safeOrderId = escapeHtml((o.orderId || id.slice(-6)).toUpperCase());
    const safeCustomerName = escapeHtml(o.customerName || 'Customer');
    const safeAddress = escapeHtml(o.address);
    const safeTotal = escapeHtml(String(o.total || 0));
    const phoneValue = o.customerPhone || o.phone || '';
    const safePhone = escapeHtml(phoneValue ? "****" + phoneValue.slice(-4) : '');
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
            <div style="display:flex; gap:6px; align-items:center;">
                ${o.outlet ? `<span style="
                    font-size:9px; font-weight:800; padding:2px 8px; border-radius:20px; text-transform:uppercase; letter-spacing:0.5px;
                    background:${o.outlet.toLowerCase().includes('pizza') ? 'rgba(249,115,22,0.15)' : o.outlet.toLowerCase().includes('cake') ? 'rgba(236,72,153,0.15)' : 'rgba(100,100,100,0.15)'};
                    color:${o.outlet.toLowerCase().includes('pizza') ? '#f97316' : o.outlet.toLowerCase().includes('cake') ? '#ec4899' : '#888'};
                    border:1px solid ${o.outlet.toLowerCase().includes('pizza') ? 'rgba(249,115,22,0.3)' : o.outlet.toLowerCase().includes('cake') ? 'rgba(236,72,153,0.3)' : 'rgba(100,100,100,0.2)'};
                ">${escapeHtml(o.outlet)}</span>` : ''}
                <span class="badge ${badgeClass}">${statusText}</span>
            </div>
        </div>
        <div class="order-details">
            <p><i data-lucide="user"></i> <span>${safeCustomerName}</span></p>
            <p><i data-lucide="map-pin"></i> <span>${safeAddress}</span></p>
            <p><i data-lucide="shopping-cart"></i> <span>${safeItemsText}</span></p>
            <div style="margin-top:20px; padding-top:15px; border-top:1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center;">
                <span style="color:var(--text-muted); font-size:11px; font-weight:700;">TO COLLECT</span>
                <span style="color:var(--primary-orange); font-size:22px; font-weight:900;">&#8377;${safeTotal}</span>
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
                <!-- PREMIUM SLIDER ACTION -->
                <div id="slider-${id}" class="slide-action-container">
                    <div class="slide-action-text">Slide to Complete</div>
                    <div class="slide-action-thumb"><i data-lucide="chevron-right"></i></div>
                    <div class="slide-action-progress"></div>
                </div>
            ` : ''}
        </div>
    `;

    return card;
}

window.acceptOrder = async (id) => {
    window.haptic(40);
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
    window.haptic(25);
    const otp = document.getElementById('otpInput').value;
    if (!otp) return;
    
    try {
        const snap = await db.ref(`orders/${currentOrderId}`).once('value');
        const order = snap.val();
        
        // Only accept the OTP from the customer — no master bypass
        // Bot writes deliveryOTP; fall back to otp for legacy orders
        const storedOTP = order.deliveryOTP || order.otp;
        if (String(otp).trim() === String(storedOTP).trim()) {
            await db.ref(`orders/${currentOrderId}`).update({
                status: "Delivered",
                deliveredAt: firebase.database.ServerValue.TIMESTAMP
            });

            // Update rider stats (totalOrders, totalEarnings)
            const riderId = currentUser.profile.id;
            const commission = order.riderCommission || 40;
            const statsRef = db.ref(`riderStats/${riderId}`);
            await statsRef.transaction(current => {
                if (!current) {
                    return { totalOrders: 1, totalEarnings: commission, avgDeliveryTime: 0 };
                }
                return {
                    ...current,
                    totalOrders: (current.totalOrders || 0) + 1,
                    totalEarnings: (current.totalEarnings || 0) + commission
                };
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
/**
 * =============================================
 */
window.initSliderAction = (containerId, onComplete) => {
    const container = document.getElementById(containerId);
    if (!container || container.classList.contains('initialized')) return;

    const thumb = container.querySelector('.slide-action-thumb');
    const text = container.querySelector('.slide-action-text');
    const progress = container.querySelector('.slide-action-progress');

    let isDragging = false;
    let startX = 0;
    let currentDelta = 0;

    const onStart = (e) => {
        isDragging = true;
        startX = (e.type === 'mousedown') ? e.pageX : e.touches[0].pageX;
        thumb.style.transition = 'none';
        progress.style.transition = 'none';
        window.haptic(5);

        // Attach window listeners only when dragging starts
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, {passive: false});
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchend', onEnd);
    };

    const onMove = (e) => {
        if (!isDragging) return;
        const x = (e.type === 'mousemove') ? e.pageX : e.touches[0].pageX;
        let delta = x - startX;
        
        const maxDrag = container.offsetWidth - thumb.offsetWidth - 8;
        if (delta < 0) delta = 0;
        if (delta > maxDrag) delta = maxDrag;

        currentDelta = delta;
        const opacity = 1 - (delta / maxDrag);
        
        text.style.opacity = opacity;
        thumb.style.transform = 'translateX(' + delta + 'px)';
        progress.style.width = (delta + 28) + 'px';

        if (delta > maxDrag * 0.8) window.haptic(2);
    };

    const onEnd = () => {
        if (!isDragging) return;
        isDragging = false;

        // Cleanup window listeners when dragging ends
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('touchend', onEnd);
        
        const maxDrag = container.offsetWidth - thumb.offsetWidth - 8;
        
        if (currentDelta >= maxDrag * 0.9) {
            thumb.style.transform = 'translateX(' + maxDrag + 'px)';
            progress.style.width = '100%';
            text.innerText = 'DONE';
            window.haptic([15, 30, 20]);
            setTimeout(onComplete, 300);
        } else {
            thumb.style.transition = 'all 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
            progress.style.transition = 'all 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
            thumb.style.transform = 'translateX(0px)';
            progress.style.width = '0%';
            text.style.opacity = 1;
        }
    };

    thumb.addEventListener('mousedown', onStart);
    thumb.addEventListener('touchstart', onStart, {passive: true});
};


// ==========================================
// PIZZA ERP | RIDER PORTAL v3.0 (LIGHT)
// ==========================================
window.haptic = window.haptic || ((val) => { 
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(val);
    }
});

// ==========================================
// PWA & CONFIGURATION
// ==========================================
let deferredPrompt;

// PWA Install Logic
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const downloadBtn = document.getElementById('menu-downloadapp');
    if (downloadBtn) downloadBtn.classList.remove('hidden');
});

window.installPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        const downloadBtn = document.getElementById('menu-downloadapp');
        if (downloadBtn) downloadBtn.classList.add('hidden');
    }
    deferredPrompt = null;
};

window.addEventListener('appinstalled', () => {
    const downloadBtn = document.getElementById('menu-downloadapp');
    if (downloadBtn) downloadBtn.classList.add('hidden');
    deferredPrompt = null;
});

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW failed', err));
    });
}

let currentUser = null;
let currentOrderId = null;
window.activeOrders = {};
window.riderLocation = null;

// Haversine Distance Helper
window.getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of earth in KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // KM
};

// Track current location
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(pos => {
        window.riderLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }, err => console.warn("GPS error:", err), { enableHighAccuracy: true });
}

// XSS prevention helper
}

/**
 * PATH RESOLUTION HELPER for Multi-Outlet
 * Ensures data is scoped to /{outlet}/{node} unless shared globally.
 */
function resolvePath(path, outlet = null) {
    if (!path) return "";
    
    // Nodes that remain at the root level for all outlets (admins, shared riders)
    const sharedNodes = ['admins', 'migrationStatus', 'riders', 'riderStats', 'logs', 'errorLogs'];
    const parts = path.split('/');
    const rootNode = parts[0];

    if (sharedNodes.includes(rootNode)) {
        return path;
    }

    // Determine target outlet
    const targetOutlet = outlet || window.currentOutlet || 'pizza';
    
    // If already prefixed with an outlet id, return as is
    // (Assuming outlets don't have slashes and match our known list)
    if (targetOutlet && path.startsWith(`${targetOutlet}/`)) {
        return path;
    }

    return `${targetOutlet}/${path}`;
}

/**
 * 1. NAVIGATION & UI HANDLING
 */
window.toggleRiderSidebar = () => {
    window.haptic(10);
    const nav = document.getElementById('sidebarNav');
    const overlay = document.getElementById('sidebarOverlay');
    if (!nav) return;

    if (window.innerWidth > 1024) {
        // Desktop: Toggle collapsed state
        document.body.classList.toggle('sidebar-collapsed');
    } else {
        // Mobile: Toggle active overlay state
        const isActive = nav.classList.toggle('active');
        if (overlay) overlay.classList.toggle('active', isActive);
    }
};

// Functions removed as they are defined again below with improvements

// Block consolidated in Section 3.5

/**
 * 3.5 NOTIFICATIONS
 */
function initNotificationListener() {
    if (!currentUser || !currentUser.profile.id) return;
    const uid = currentUser.profile.id;
    const path = resolvePath(`riders/${uid}/notifications`);
    
    db.ref(path).orderByChild('timestamp').limitToLast(20).on('value', snap => {
        const list = document.getElementById('notificationList');
        const badge = document.getElementById('notifBadge');
        if (!list) return;

        list.innerHTML = '';
        let unreadCount = 0;

        const notifications = [];
        snap.forEach(child => {
            notifications.push({ id: child.key, ...child.val() });
        });

        // Show newest first
        notifications.reverse().forEach(n => {
            if (!n.read) unreadCount++;
            
            const div = document.createElement('div');
            div.className = `notification-item ${n.read ? '' : 'unread'}`;
            div.innerHTML = `
                <div class="notif-icon ${n.type || 'info'}">
                    <i data-lucide="${n.icon || 'bell'}"></i>
                </div>
                <div class="notif-content">
                    <p class="notif-title">${n.title}</p>
                    <p class="notif-body">${n.body}</p>
                    <p class="notif-time">${new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                </div>
            `;
            
            // Mark as read on click
            div.onclick = () => {
                db.ref(`riders/${uid}/notifications/${n.id}`).update({ read: true });
            };
            
            list.appendChild(div);
        });

        if (badge) {
            badge.innerText = unreadCount;
            badge.classList.toggle('hidden', unreadCount === 0);
        }

        if (unreadCount > 0 && window.haptic) {
            window.haptic(30);
        }

        if (window.lucide) lucide.createIcons();
        if (notifications.length === 0) {
            list.innerHTML = `
                <div class="empty-notifications">
                    <i data-lucide="bell-off"></i>
                    <p>No new notifications</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    });
}

window.clearAllNotifications = () => {
    if (!currentUser || !currentUser.profile.id) return;
    if (confirm("Clear all notifications?")) {
        db.ref(`riders/${currentUser.profile.id}/notifications`).remove();
    }
};

window.toggleNotificationSheet = (show) => {
    const sheet = document.getElementById('notificationSheet');
    if (sheet) sheet.classList.toggle('active', show);
    if (show && window.haptic) window.haptic(15);
};

function handleStatusChange(title, body) {
    // Local UI notification if app is open
    if (window.haptic) window.haptic(30);
}

window.showSection = (sectionId) => {
    window.haptic(15);
    
    // Only toggle (close) sidebar on mobile when switching sections
    if (window.innerWidth <= 1024) {
        window.toggleRiderSidebar();
    }
    
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
    if (!errorEl) return;
    errorEl.innerText = msg;
    errorEl.classList.remove('hidden');
    setTimeout(() => errorEl.classList.add('hidden'), 3000);
}

window.logout = () => {
    if(confirm("End your shift and logout?")) {
        auth.signOut();
    }
};

auth.onAuthStateChanged(async user => {
    const isLoginPage = window.location.pathname.includes('login.html');

    if (!user) {
        if (!isLoginPage) {
            window.location.href = 'login.html';
        }
        return;
    }

    // If logged in and on login page, redirect to dashboard
    if (isLoginPage) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const normalizedEmail = user.email.toLowerCase();

        // 1. Check for Super Admin privileges in 'admins' node (root level)
        const adminsSnap = await db.ref("admins").once("value");
        let foundAdmin = null;
        adminsSnap.forEach(snap => {
            const admin = snap.val();
            if (admin && admin.email && admin.email.toLowerCase() === normalizedEmail && admin.isSuper) {
                foundAdmin = { 
                    id: `admin_${snap.key}`,
                    name: "Super User", 
                    outlet: "all", 
                    status: "Online",
                    isAdmin: true
                };
            }
        });

        let riderProfile = foundAdmin;
        let foundOutlet = "all";

        // 2. If not a super admin, search the global riders node
        if (!riderProfile) {
            const globalRidersSnap = await db.ref("riders").once("value");
            if (globalRidersSnap.exists()) {
                globalRidersSnap.forEach(child => {
                    const r = child.val();
                    if (r.email && r.email.toLowerCase() === normalizedEmail) {
                        riderProfile = { id: child.key, ...r, outlet: "all" }; // Riders are now global
                    }
                });
            }
        }

        if (!riderProfile) {
            alert("ACCESS DENIED: Role not found.");
            auth.signOut();
            return;
        }

        // Set global outlet context
        currentUser = { ...user, profile: riderProfile, isSuper: (riderProfile.outlet === 'all') };
        
        // Handle Outlet Switcher for Super Users
        const switcher = document.getElementById('outletSwitcher');
        if (currentUser.isSuper && switcher) {
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

        updateBranding();

        // Populate UI
        const pName = riderProfile.name || "Rider";
        const profileNameEl = document.getElementById('profileName');
        if (profileNameEl) profileNameEl.innerText = pName;
        
        const profilePhoneEl = document.getElementById('profilePhone');
        if (profilePhoneEl) profilePhoneEl.innerText = riderProfile.phone || user.email;
        
        const rNameEl = document.getElementById('r-name');
        if (rNameEl) rNameEl.innerText = pName;
        
        // PII Fields (Read-Only Display)
        document.getElementById('r-father-name').innerText = riderProfile.fatherName || '---';
        document.getElementById('r-age').innerText = riderProfile.age || '---';
        document.getElementById('r-aadhar-no').innerText = riderProfile.aadharNo ? 'XXXXXXXX' + riderProfile.aadharNo.slice(-4) : '---'; // Partially masked for safety
        document.getElementById('r-qualification').innerText = riderProfile.qualification || '---';
        document.getElementById('r-address').innerText = riderProfile.address || '---';
        document.getElementById('r-email').innerText = riderProfile.email || '---';
        
        // Photos
        if (riderProfile.profilePhoto) {
            document.getElementById('r-profile-img').src = riderProfile.profilePhoto;
        } else if (riderProfile.photo) {
            document.getElementById('r-profile-img').src = riderProfile.photo;
        }

        if (riderProfile.aadharPhoto && document.getElementById('r-aadhar-img')) {
            document.getElementById('r-aadhar-img').src = riderProfile.aadharPhoto;
        }

        updateStatusUI(riderProfile.status || "Online");

        // Data Protection Initialization
        // Code already exists inline below, keeping for consistency in structure
        
        // 4. Initialize Listeners
        initRealtimeListeners();
        initNotificationListener(); // Start tracking alerts
        
        // Final UI Unlock
        const dashboard = document.getElementById('dashboard');
        if (dashboard) {
            dashboard.classList.remove('hidden');
            showSection('home');
        }
        
        // DATA PROTECTION: Disable right-click and common download/copy shortcuts
        document.addEventListener('contextmenu', e => e.preventDefault());
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && (e.key === 'c' || e.key === 'u' || e.key === 's' || e.key === 'p')) {
                e.preventDefault();
                alert("Security policy: Data downloading is restricted on the Rider portal.");
            }
        });
        
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
    if (currentUser.profile.isAdmin) {
        alert("Status toggle is disabled for Admin users.");
        return;
    }
    const newStatus = currentUser.profile.status === "Online" ? "Offline" : "Online";
    try {
        await db.ref(resolvePath(`riders/${currentUser.profile.id}`)).update({ status: newStatus });
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
    btn.classList.toggle('btn-danger', status === "Online");
    btn.classList.toggle('btn-success', status === "Offline");
    btn.style.color = "white"; // Colors handled by classes now

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
                db.ref(resolvePath(`riders/${currentUser.profile.id}`)).update({ status: "Offline" });
            }
        },
        { enableHighAccuracy: true }
    );

    // 2. Periodic Firebase Sync (every 30s)
    _locationInterval = setInterval(() => {
        if (_lastPos && currentUser && currentUser.profile.status === "Online") {
            const uid = currentUser.profile.id;
            db.ref(resolvePath(`riders/${uid}/location`)).set(_lastPos);
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
    // Riders always listen to both outlets to receive any available order
    const outletsToListen = ['pizza', 'cake'];

    // Clear old listeners
    if (window._activeListeners) {
        window._activeListeners.forEach(path => db.ref(path).off());
    }
    window._activeListeners = [];

    const orderCache = {}; // Global cache across all outlets
    
    // 1. Listen to Global Stats for this rider only
    const riderId = currentUser.profile.id;
    const statsPath = resolvePath(`riderStats/${riderId}`);
    window._activeListeners.push(statsPath);
    
    db.ref(statsPath).on('value', snap => {
        const myStats = snap.val() || { totalOrders: 0, avgDeliveryTime: 0, totalEarnings: 0 };
        renderStats(myStats);
    });

    // 2. Listen to Orders from each outlet
    outletsToListen.forEach(outletId => {
        const orderPath = `${outletId}/orders`;
        window._activeListeners.push(orderPath);

        db.ref(orderPath).on('value', snap => {
            orderCache[outletId] = snap.val() || {};
            renderAllOrders(orderCache);
        });
    });

    // 3. Listen to Outlet Configs for dynamic geofencing
    window.outletConfigs = {};
    outletsToListen.forEach(outletId => {
        const configPath = `${outletId}/Config`;
        window._activeListeners.push(configPath);
        db.ref(configPath).on('value', snap => {
            window.outletConfigs[outletId] = snap.val() || {};
        });
    });
}

function renderStats(stats) {
    const eTotal = document.getElementById('e-total');
    if (eTotal) {
        eTotal.innerText = `₹${(stats.totalEarnings || 0).toLocaleString()}`;
    }
}

function renderAllOrders(orderCache) {
    const unassignedList = document.getElementById('unassignedOrdersList');
    const activeView = document.getElementById('activeOrderView');
    const completedList = document.getElementById('completedOrdersList');
    const banner = document.getElementById('activeStatusBanner');
    
    if (!unassignedList || !activeView || !completedList) return;

    unassignedList.innerHTML = '';
    completedList.innerHTML = '';
    
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
    let activeOrderData = null;
    let activeOrderId = null;

    Object.keys(orderCache).forEach(outletId => {
        // Filter: If we are in "Pizza Only" mode, don't render Cake orders
        if (window.currentOutlet !== 'all' && outletId !== window.currentOutlet) return;

        const orders = orderCache[outletId];
        Object.keys(orders).forEach(id => {
            const o = orders[id];
            const outlet = (o.outlet || outletId).toLowerCase();
            
            const rawDate = o.createdAt || o.timestamp;
            let orderDate = '';
            if (rawDate) {
                const d = new Date(rawDate);
                if (!isNaN(d.getTime())) orderDate = d.toDateString();
            }
            const isToday = orderDate === today;

            if (o.status === "Delivered" && o.assignedRider && o.assignedRider.toLowerCase() === myEmail) {
                const commission = Number(o.deliveryFee || 0); // User Request: Earnings = Delivery Fee
                
                if (outlet.includes("pizza")) {
                    stats.pizzaEarnings += commission;
                    if (isToday) stats.todayPizza += commission;
                } else if (outlet.includes("cake")) {
                    stats.cakeEarnings += commission;
                    if (isToday) stats.todayCake += commission;
                }

                if (isToday) stats.todayDelivered++;
                completedList.prepend(createOrderCard(id, o, "completed", outletId));
            }

            // 2. AVAILABLE (Cooked/Ready & Unassigned)
            const isReady = o.status === "Cooked" || o.status === "Ready";
            if (isReady && !o.assignedRider) {
                stats.availableCount++;
                unassignedList.appendChild(createOrderCard(id, o, "available", outletId));
            }

            // 3. ACTIVE
            if (o.status === "Out for Delivery" && o.assignedRider && o.assignedRider.toLowerCase() === myEmail) {
                stats.hasActive = true;
                activeOrderData = o;
                activeOrderId = id;
                activeOrderData.outletContext = outletId; // Store which outlet it belongs to
                activeView.innerHTML = ''; 
                activeView.appendChild(createOrderCard(id, o, "active", outletId));
                
                // Update map to customer location if available
                if (o.lat && o.lng) {
                    setTimeout(() => window.updateRiderMap(o.lat, o.lng), 500);
                }
            }
        });
    });

    // Update Dashboard Stats
    const sDelivered = document.getElementById('statsTodayDelivered');
    const sEarnings = document.getElementById('statsTodayEarnings');
    if (sDelivered) sDelivered.innerText = stats.todayDelivered;
    if (sEarnings) sEarnings.innerText = `₹${stats.todayPizza + stats.todayCake}`;
    
    // Split Wallet UI
    const eTotal = document.getElementById('e-total');
    if (eTotal) {
        eTotal.innerText = `₹${stats.pizzaEarnings + stats.cakeEarnings}`;
        if (document.getElementById('e-pizza')) document.getElementById('e-pizza').innerText = `₹${stats.pizzaEarnings}`;
        if (document.getElementById('e-cake')) document.getElementById('e-cake').innerText = `₹${stats.cakeEarnings}`;
        if (document.getElementById('e-pizza-today')) document.getElementById('e-pizza-today').innerText = `₹${stats.todayPizza}`;
        if (document.getElementById('e-cake-today')) document.getElementById('e-cake-today').innerText = `₹${stats.todayCake}`;
    }
    
    const pCount = document.getElementById('pickupCount');
    if (pCount) pCount.innerText = `${stats.availableCount} Orders`;

    // Active Trip Banner
    if (banner) {
        if (stats.hasActive) {
            banner.onclick = () => showSection('active');
            banner.innerHTML = `
                <div class="banner-glass">
                    <p class="banner-title"><span class="pulse-icon"></span> 🚀 ONGOING TRIP</p>
                    <p class="banner-subtitle">Customer is waiting! Open Trip for details.</p>
                </div>`;
            banner.classList.remove('hidden');
        } else {
            banner.onclick = null;
            banner.innerHTML = '';
            banner.classList.add('hidden');
            activeView.innerHTML = '<div class="empty-state-glass"><p>No active trip. Choose an order from Pickup Hub.</p></div>';
        }
    }

    if (unassignedList.children.length === 0) unassignedList.innerHTML = '<div class="empty-state-glass"><p>All caught up! No orders for pickup.</p></div>';
    if (completedList.children.length === 0) completedList.innerHTML = '<div class="empty-state-glass"><p>Start delivering to see history.</p></div>';

    if (window.lucide) lucide.createIcons();

    // Toggle Map View
    const mapCont = document.getElementById('activeTripMap');
    if (mapCont) {
        if (activeOrderData) {
            mapCont.classList.remove('hidden');
            if (activeOrderData.lat && activeOrderData.lng) {
                window.updateRiderMap(activeOrderData.lat, activeOrderData.lng);
            } else {
                window.updateRiderMap();
            }
        } else {
            mapCont.classList.add('hidden');
        }
    }

    // Initialize Sliders
    document.querySelectorAll('.slide-action-container:not(.initialized)').forEach(slider => {
        const orderId = slider.id.replace('slider-', '');
        let oContext = 'pizza';
        Object.keys(orderCache).forEach(oId => { if (orderCache[oId][orderId]) oContext = oId; });
        
        // SHOP GEOFENCING (400m)
        const order = orderCache[oContext][orderId];
        if (order.status === "Cooked" || order.status === "Ready") {
            const config = window.outletConfigs ? window.outletConfigs[oContext] : null;
            const shopCoords = (config && config.lat && config.lng) 
                ? { lat: config.lat, lng: config.lng } 
                : (oContext === 'pizza' ? { lat: 25.887944, lng: 85.026194 } : { lat: 25.887472, lng: 85.026861 });
            const riderLoc = window.riderLocation;
            const dist = riderLoc ? window.getDistance(riderLoc.lat, riderLoc.lng, shopCoords.lat, shopCoords.lng) : 999;
            const isNear = dist <= 0.4; // 400 meters

            if (!isNear && !order.manualBypass) {
                slider.classList.add('geofenced');
                const overlay = document.createElement('div');
                overlay.className = 'geofence-warning';
                overlay.innerHTML = `
                    <p>📍 Too far from shop (${(dist * 1000).toFixed(0)}m)</p>
                    <button class="btn-manual-bypass" onclick="window.manualBypass('${orderId}', '${oContext}')">I am at Shop</button>
                `;
                slider.appendChild(overlay);
            }
        }

        window.initSliderAction(slider.id, () => window.confirmDelivery(orderId, oContext));
        slider.classList.add('initialized');
    });
}

window.manualBypass = async (orderId, oContext) => {
    if (confirm("GPS accuracy might be low. Verify you are at the shop and continue?")) {
        await db.ref(resolvePath(`orders/${orderId}`, oContext)).update({ manualBypass: true });
        showToast("Bypass activated. You can now pick up.", "success");
    }
};

function createOrderCard(id, o, type, outletId) {
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
    const safePhone = escapeHtml(phoneValue || '');
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
            <p><i data-lucide="phone"></i> <span>${safePhone}</span></p>
            <div style="margin-top:20px; padding-top:15px; border-top:1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center;">
                <span style="color:var(--text-muted); font-size:11px; font-weight:700;">TO COLLECT</span>
                <span style="color:var(--primary-orange); font-size:22px; font-weight:900;">&#8377;${safeTotal}</span>
            </div>
        </div>
        <div class="card-actions">
            ${isAvailable ? `<button class="btn-primary btn-full" onclick="acceptOrder('${id}', '${outletId}')">START PICKUP</button>` : ''}
            ${isActive ? `
                <div class="active-actions">
                    <button class="btn-action btn-nav" onclick="navigateToCustomer('${id}', ${addressJson}, ${o.lat || 'null'}, ${o.lng || 'null'})">
                        <i data-lucide="navigation"></i> NAVIGATE
                    </button>
                    <button class="btn-action btn-wa" onclick="contactCustomer('${safePhone}')">
                        <i data-lucide="message-circle"></i> WHATSAPP
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

window.acceptOrder = async (id, outletId) => {
    window.haptic(40);
    try {
        const orderPath = `${outletId}/orders/${id}`;
        const result = await db.ref(orderPath).transaction(current => {
            // Abort if order is already assigned — prevents race condition between riders
            if (!current || current.assignedRider) return;
            return {
                ...current,
                status: "Out for Delivery",
                deliveryOTP: Math.floor(100000 + Math.random() * 900000).toString(),
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

window.navigateToCustomer = (id, address, lat, lng) => {
    window.haptic(20);
    // Use exact coordinates if available for pinpoint accuracy
    const destination = (lat && lng) ? `${lat},${lng}` : address;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    window.open(url, '_system');
};

window.contactCustomer = (phone) => {
    window.haptic(20);
    if (!phone) {
        alert("Customer phone number not available.");
        return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    const url = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent("Hello, I am your delivery partner from Roshani Pizza. I am on my way with your order! 🍕")}`;
    window.open(url, '_blank');
};

window.confirmDelivery = (id, outletId) => {
    currentOrderId = id;
    window._currentOrderOutlet = outletId;
    const otpInput = document.getElementById('otpInput');
    const otpPanel = document.getElementById('otpPanel');
    if (otpInput) otpInput.value = '';
    if (otpPanel) otpPanel.classList.remove('hidden');
    
    // Admin Override Logic
    const emergencyBtn = document.getElementById('emergencyBtn');
    if (emergencyBtn) {
        emergencyBtn.classList.toggle('hidden', !(currentUser && currentUser.profile && currentUser.profile.isAdmin));
    }
};

window.emergencyOverride = async () => {
    if (!currentUser || !currentUser.profile || !currentUser.profile.isAdmin) {
        alert("Unauthorized access attempt.");
        return;
    }
    
    if (confirm("FORCE COMPLETE: Bypass customer OTP?")) {
        window.haptic([50, 50, 50]);
        // Simulate OTP verification with actual logic but skip mismatch check
        try {
            const outletId = window._currentOrderOutlet || 'pizza';
            const orderPath = `${outletId}/orders/${currentOrderId}`;
            
            await db.ref(orderPath).update({
                status: "Delivered",
                deliveredAt: firebase.database.ServerValue.TIMESTAMP,
                overrideBy: currentUser.email
            });

            // Update rider stats
            const snap = await db.ref(orderPath).once('value');
            const order = snap.val();
            const riderId = currentUser.profile.id;
            const commission = Number(order.deliveryFee || 0); // User Request: Earnings = Delivery Fee
            const statsPath = resolvePath(`riderStats/${riderId}`);
            
            await db.ref(statsPath).transaction(current => {
                if (!current) return { totalOrders: 1, totalEarnings: commission };
                return {
                    ...current,
                    totalOrders: (current.totalOrders || 0) + 1,
                    totalEarnings: (current.totalEarnings || 0) + commission
                };
            });

            closeOTPPanel();
            showSection('home');
            alert("Order delivered via administrative override.");
        } catch (e) {
            alert("System error during override");
        }
    }
};

window.closeOTPPanel = () => {
    const otpPanel = document.getElementById('otpPanel');
    if (otpPanel) otpPanel.classList.add('hidden');
};

window.verifyOTP = async () => {
    window.haptic(25);
    const otp = document.getElementById('otpInput').value;
    if (!otp) return;
    
    try {
        const outletId = window._currentOrderOutlet || 'pizza';
        const orderPath = `${outletId}/orders/${currentOrderId}`;
        const snap = await db.ref(orderPath).once('value');
        const order = snap.val();
        
        // Fetch Master Fallback Code from Store Settings
        const settingsSnap = await db.ref(`${outletId}/settings/Store`).once('value');
        const storeSettings = settingsSnap.val() || {};
        const fallbackCode = storeSettings.deliveryBackupCode;

        // Verify against Customer OTP OR Admin Fallback Code
        const storedOTP = order.deliveryOTP || order.otp;
        const matchesCustomer = String(otp).trim() === String(storedOTP).trim();
        const matchesFallback = fallbackCode && String(otp).trim() === String(fallbackCode).trim();

        if (matchesCustomer || matchesFallback) {
            await db.ref(orderPath).update({
                status: "Delivered",
                deliveredAt: firebase.database.ServerValue.TIMESTAMP,
                verifiedBy: matchesFallback ? 'ADMIN_FALLBACK' : 'OTP'
            });

            // Update rider stats (totalOrders, totalEarnings)
            const riderId = currentUser.profile.id;
            const commission = Number(order.deliveryFee || 0); 
            const statsPath = resolvePath(`riderStats/${riderId}`);

            await db.ref(statsPath).transaction(current => {
                if (!current) return { totalOrders: 1, totalEarnings: commission };
                return {
                    ...current,
                    totalOrders: (current.totalOrders || 0) + 1,
                    totalEarnings: (current.totalEarnings || 0) + commission
                };
            });

            closeOTPPanel();
            showSection('home');
            showToast("Delivery successfully verified! ✅", "success");
        } else {
            alert("Security code mismatch! Please check again or contact Admin.");
        }
    } catch (e) {
        alert("System error during verification");
    }
};

window.regenerateOTP = async () => {
    if (!currentOrderId) return;
    window.haptic(40);
    const btn = document.getElementById('btnResendOTP');
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Resending...";
    }
    
    try {
        const outletId = window._currentOrderOutlet || 'pizza';
        const orderPath = `${outletId}/orders/${currentOrderId}`;
        const newOTP = Math.floor(100000 + Math.random() * 900000).toString();
        
        await db.ref(orderPath).update({ deliveryOTP: newOTP });
        showToast("New OTP generated and sent to customer!", "success");
    } catch (e) {
        alert("Failed to regenerate OTP. Please try again.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "📩 RESEND OTP TO CUSTOMER";
        }
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

window.updateBranding = () => {
    const outlet = window.currentOutlet || 'pizza';
    document.body.classList.remove('theme-pizza', 'theme-cake', 'theme-all');
    document.body.classList.add(`theme-${outlet}`);
    
    const brandTitle = document.querySelector('.sidebar-title');
    if (brandTitle) {
        if (outlet === 'pizza') brandTitle.innerText = "ROSHANI PIZZA";
        else if (outlet === 'cake') brandTitle.innerText = "ROSHANI CAKES";
        else brandTitle.innerText = "ERP RIDER";
    }
};

window.switchOutlet = (val) => {
    window.haptic(20);
    window.currentOutlet = val;
    localStorage.setItem('selectedOutlet', val);
    updateBranding();
    
    if (typeof initRealtimeListeners === 'function') {
        initRealtimeListeners();
    }
    
    showToast(`Switched to ${val.toUpperCase()} view`, "success");
};

function showToast(msg, type = "info") {
    const toast = document.createElement('div');
    toast.style = `
        position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
        background: ${type === 'success' ? '#10B981' : '#1e293b'};
        color: white; padding: 12px 24px; border-radius: 30px; font-weight: 700;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 9999;
    `;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}


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
window._activeListeners = []; // Track listeners for cleanup
window.activeOrderData = null; // Store active order data globally
window.activeOrderId = null;
window.activeOrderOutlet = null;


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

/**
 * XSS PREVENTION HELPER
 * Sanitizes strings for safe insertion into HTML
 */
function escapeHtml(str) {
    if (!str) return "";
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
        '/': '&#47;'
    };
    return String(str).replace(/[&<>"'/]/g, m => map[m]);
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
                const updatePath = resolvePath(`riders/${uid}/notifications/${n.id}`);
                db.ref(updatePath).update({ read: true });
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
    
    // If switching to active section, ensure map is initialized and refreshed
    if (sectionId === 'active') {
        setTimeout(() => {
            initRiderMap();
            // Trigger a re-render of orders to ensure active order data is fresh
            // (This will update the panel if order status changed)
            if (window._activeListeners) {
                // Force a refresh by re-reading order cache
                // The real-time listeners will auto-update, but we ensure map centers
                const activePanel = document.getElementById('activeDeliveryPanel');
                if (activePanel && !activePanel.classList.contains('hidden')) {
                    // Find current active order from cache and update map
                    const activeOrderData = window.activeOrderData; // We'll store globally
                    if (activeOrderData && activeOrderData.lat && activeOrderData.lng) {
                        window.updateRiderMap(activeOrderData.lat, activeOrderData.lng);
                    }
                }
            }
        }, 300); // Wait for section transition
    }

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
        // Detach listeners
        if (window._activeListeners) {
            window._activeListeners.forEach(path => db.ref(path).off());
            window._activeListeners = [];
        }
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

        // 2. If not a super admin, search the global riders node by UID first (optimized)
        if (!riderProfile) {
            const directRiderSnap = await db.ref("riders/" + user.uid).once("value");
            if (directRiderSnap.exists()) {
                riderProfile = { id: directRiderSnap.key, ...directRiderSnap.val(), outlet: "all" };
            } else {
                // Fallback: search by email (legacy or mismatched UID)
                const emailQuerySnap = await db.ref("riders").orderByChild("email").equalTo(normalizedEmail).once("value");
                if (emailQuerySnap.exists()) {
                    const firstMatch = Object.entries(emailQuerySnap.val())[0];
                    riderProfile = { id: firstMatch[0], ...firstMatch[1], outlet: "all" };
                }
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
        const fNameEl = document.getElementById('r-father-name');
        if (fNameEl) fNameEl.innerText = riderProfile.fatherName || '---';

        const ageEl = document.getElementById('r-age');
        if (ageEl) ageEl.innerText = riderProfile.age || '---';

        const aadharEl = document.getElementById('r-aadhar-no');
        if (aadharEl) {
            aadharEl.innerText = riderProfile.aadharNo ? 'XXXXXXXX' + riderProfile.aadharNo.slice(-4) : '---';
        }

        const qualEl = document.getElementById('r-qualification');
        if (qualEl) qualEl.innerText = riderProfile.qualification || '---';

        const addrEl = document.getElementById('r-address');
        if (addrEl) addrEl.innerText = riderProfile.address || '---';

        const emailEl = document.getElementById('r-email');
        if (emailEl) emailEl.innerText = riderProfile.email || '---';
        
        // Additional info: Outlet, Rider ID, Join Date
        const outletEl = document.getElementById('r-outlet');
        if (outletEl) {
            const outletVal = (riderProfile.outlet || 'pizza').toUpperCase();
            outletEl.innerText = outletVal;
        }
        
        const riderIdEl = document.getElementById('r-rider-id');
        if (riderIdEl) {
            riderIdEl.innerText = currentUser.profile.id ? 'RDR-' + currentUser.profile.id.slice(0, 8).toUpperCase() : '---';
        }
        
        const joinDateEl = document.getElementById('r-join-date');
        if (joinDateEl) {
            if (riderProfile.createdAt) {
                const joinDate = new Date(riderProfile.createdAt);
                joinDateEl.innerText = joinDate.toLocaleDateString('en-IN', { 
                    day: 'numeric', 
                    month: 'short', 
                    year: 'numeric' 
                });
            } else {
                joinDateEl.innerText = '---';
            }
        }
        
        // Load rider stats with real-time listener (totalOrders, totalEarnings, avgDeliveryTime)
        const riderId = currentUser.profile.id;
        const statsPath = resolvePath(`riderStats/${riderId}`);
        window._activeListeners.push(statsPath);
        
        db.ref(statsPath).on('value', snap => {
            const stats = snap.val() || { totalOrders: 0, totalEarnings: 0, avgDeliveryTime: 0 };
            
            // Populate profile stats cards
            const totalOrdersEl = document.getElementById('profile-total-orders');
            const totalEarningsEl = document.getElementById('profile-total-earnings');
            const avgTimeEl = document.getElementById('profile-avg-time');
            
            if (totalOrdersEl) totalOrdersEl.innerText = (stats.totalOrders || 0).toLocaleString();
            if (totalEarningsEl) totalEarningsEl.innerText = '₹' + (stats.totalEarnings || 0).toLocaleString();
            if (avgTimeEl) avgTimeEl.innerText = Math.round(stats.avgDeliveryTime || 0) + 'm';
        });
        
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
    updateBranding();
    initRealtimeListeners(); // Hot reload data
    showToast(`Switched to ${val.toUpperCase()} view`, "success");
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
        // Ensure map recalculates size after being shown
        riderMap.invalidateSize();
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
    if (!currentUser || !currentUser.email) return;
    const currentRiderEmail = currentUser.email.toLowerCase();
    const outletsToListen = ['pizza', 'cake'];

    // Clear old listeners
    if (window._activeListeners) {
        window._activeListeners.forEach(path => {
            try { db.ref(path).off(); } catch(e) {}
        });
    }
    window._activeListeners = [];

    const orderCache = {};

    outletsToListen.forEach(outletId => {
        const ordersPath = `${outletId}/orders`;
        orderCache[outletId] = {};

        const updateCacheAndRender = (data, filterType) => {
            // Remove items of this type from cache to avoid stale data
            Object.keys(orderCache[outletId]).forEach(id => {
                const order = orderCache[outletId][id];
                const isAssignedToMe = (order.assignedRider || "").toLowerCase() === currentRiderEmail;
                
                if (filterType === 'unassigned' && (!order.assignedRider)) {
                    delete orderCache[outletId][id];
                } else if (filterType === 'mine' && isAssignedToMe) {
                    delete orderCache[outletId][id];
                }
            });

            // Merge new data
            Object.assign(orderCache[outletId], data);
            renderAllOrders(orderCache);
            renderStats(orderCache);
        };

        // Listener 1: Unassigned Orders (Hub)
        const unassignedRef = db.ref(ordersPath).orderByChild('assignedRider').equalTo(null);
        unassignedRef.on('value', snap => {
            updateCacheAndRender(snap.val() || {}, 'unassigned');
        });

        // Listener 2: Orders assigned to this rider
        const myOrdersRef = db.ref(ordersPath).orderByChild('assignedRider').equalTo(currentRiderEmail);
        myOrdersRef.on('value', snap => {
            updateCacheAndRender(snap.val() || {}, 'mine');
        });

        window._activeListeners.push(ordersPath);
    });
}

function renderAllOrders(orderCache) {
    const unassignedList = document.getElementById('unassignedOrdersList');
    const completedList = document.getElementById('completedOrdersList');
    const activeView = document.getElementById('activeOrderView');
    const pickupCount = document.getElementById('pickupCount');
    const activeBanner = document.getElementById('activeStatusBanner');

    if (!unassignedList || !completedList || !activeView) return;

    unassignedList.innerHTML = '';
    completedList.innerHTML = '';
    activeView.innerHTML = `
        <div class="glass-panel empty-state-glass">
            <i data-lucide="package"></i>
            <p>No active trip currently.</p>
        </div>
    `;
    
    let unassignedCount = 0;
    let hasActive = false;
    window.activeOrderId = null;
    window.activeOrderOutlet = null;
    window.activeOrderData = null;

    Object.keys(orderCache).forEach(outletId => {
        const orders = orderCache[outletId];
        Object.keys(orders).forEach(id => {
            const o = { ...orders[id], outlet: outletId };
            const status = (o.status || "").toLowerCase();
            const riderEmail = (o.assignedRider || "").toLowerCase();
            const currentRiderEmail = (currentUser.email || "").toLowerCase();

            if ((status === "ready" || status === "cooked") && !o.assignedRider) {
                unassignedList.appendChild(createOrderCard(id, o, outletId));
                unassignedCount++;
            } else if (status === "out for delivery" && riderEmail === currentRiderEmail) {
                activeView.innerHTML = '';
                activeView.appendChild(createActiveDeliveryPanel(id, o, outletId));
                hasActive = true;
                window.activeOrderId = id;
                window.activeOrderOutlet = outletId;
                window.activeOrderData = o;
            } else if (status === "delivered" && riderEmail === currentRiderEmail) {
                completedList.appendChild(createOrderCard(id, o, outletId));
            }
        });
    });

    if (pickupCount) pickupCount.innerText = `${unassignedCount} Orders`;
    if (activeBanner) {
        if (hasActive) {
            activeBanner.innerHTML = `
                <div class="status-banner active" onclick="showSection('active')">
                    <div class="banner-info">
                        <span class="banner-title">Delivery in Progress</span>
                        <span class="banner-desc">You have an active delivery to complete.</span>
                    </div>
                    <i data-lucide="chevron-right"></i>
                </div>
            `;
        } else {
            activeBanner.innerHTML = `
                <div class="status-banner idle">
                    <div class="banner-info">
                        <span class="banner-title">No Active Delivery</span>
                        <span class="banner-desc">Go to 'Pickup Hub' to find new orders.</span>
                    </div>
                </div>
            `;
        }
    }

    if (window.lucide) lucide.createIcons();
}

function renderStats(orderCache) {
    let todayOrders = 0;
    let todayPay = 0;
    let totalCash = 0;
    let pizzaTotal = 0;
    let pizzaToday = 0;
    let cakeTotal = 0;
    let cakeToday = 0;

    const todayStr = new Date().toLocaleDateString();

    Object.keys(orderCache).forEach(outletId => {
        const orders = orderCache[outletId];
        Object.keys(orders).forEach(id => {
            const o = orders[id];
            const riderEmail = (o.assignedRider || "").toLowerCase();
            const currentRiderEmail = (currentUser.email || "").toLowerCase();

            const status = (o.status || "").toLowerCase();
            if (riderEmail === currentRiderEmail && status === "delivered") {
                const fee = Number(o.deliveryFee || 0);
                const total = Number(o.total || 0);
                const orderDate = o.deliveredAt ? new Date(o.deliveredAt).toLocaleDateString() : '';

                if (orderDate === todayStr) {
                    todayOrders++;
                    todayPay += fee;
                    if (outletId === 'pizza') pizzaToday += total;
                    if (outletId === 'cake') cakeToday += total;
                }

                totalCash += total;
                if (outletId === 'pizza') pizzaTotal += total;
                if (outletId === 'cake') cakeTotal += total;
            }
        });
    });

    const els = {
        'statsTodayDelivered': todayOrders,
        'statsTodayEarnings': '₹' + todayPay,
        'e-total': '₹' + totalCash,
        'e-pizza': '₹' + pizzaTotal,
        'e-pizza-today': '₹' + pizzaToday,
        'e-cake': '₹' + cakeTotal,
        'e-cake-today': '₹' + cakeToday
    };

    Object.keys(els).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = els[id];
    });
}

function createOrderCard(id, o, outletId) {
    const card = document.createElement('div');
    card.className = `order-card glass-panel ${o.status.replace(/\s+/g, '-').toLowerCase()}`;
    
    const safeOrderId = escapeHtml((o.orderId || id.slice(-6)).toUpperCase());
    const safeCustomerName = escapeHtml(o.customerName || 'Customer');
    const safeAddress = escapeHtml(o.address || 'Address not available');
    const safeItemsText = o.items ? o.items.map(i => `${i.quantity}x ${escapeHtml(i.name)}`).join(', ') : 'Order Details';
    const safePhone = escapeHtml(o.customerPhone || o.phone || '---');
    const safeTotal = Number(o.total || 0).toLocaleString();
    const statusText = o.status || "Ready";
    const badgeClass = statusText.toLowerCase().includes('delivery') ? 'status-delivering' : 'status-ready';
    const isAvailable = statusText.toLowerCase() === "ready";

    card.innerHTML = `
        <div class="order-header">
            <div class="order-id-chip">#${safeOrderId}</div>
            <div class="order-meta-badges">
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
        </div>
    `;

    return card;
}

/**
 * Creates the enhanced active delivery floating panel
 */
function createActiveDeliveryPanel(id, o, outletId) {
    const panel = document.createElement('div');
    panel.className = 'active-delivery-panel';
    panel.id = 'activeDeliveryPanel';
    
    const safeOrderId = escapeHtml((o.orderId || id.slice(-6)).toUpperCase());
    const safeCustomerName = escapeHtml(o.customerName || 'Customer');
    const safeAddress = escapeHtml(o.address || 'Address not available');
    const safeTotal = Number(o.total || 0).toLocaleString();
    const phoneValue = o.customerPhone || o.phone || '';
    const safePhone = phoneValue ? phoneValue.replace(/\D/g, '') : '';
    const outletUpper = (o.outlet || outletId || 'pizza').toUpperCase();
    
    // Build items list HTML
    const itemsHtml = o.items && o.items.length > 0
        ? o.items.map(i => `
            <div class="delivery-item-row">
                <div>
                    <span class="delivery-item-name">${escapeHtml(i.name)}</span>
                    <span class="delivery-item-meta">${escapeHtml(i.size || 'Regular')} · x${i.quantity}</span>
                </div>
                <span class="delivery-item-qty">x${i.quantity}</span>
            </div>
        `).join('')
        : '<div class="delivery-item-row"><span>Food Parcel</span></div>';

    panel.innerHTML = `
        <div class="delivery-header">
            <div class="delivery-badge">
                <span class="pulse-icon"></span> LIVE DELIVERY
            </div>
            <div class="delivery-order-id">#${safeOrderId}</div>
            <div class="delivery-outlet-badge">${outletUpper}</div>
        </div>
        
        <div class="delivery-customer">
            <h3 class="delivery-customer-name">${safeCustomerName}</h3>
            ${safePhone ? `<p class="delivery-customer-phone" onclick="contactCustomer('${safePhone}')">📞 ${safePhone}</p>` : ''}
            <p class="delivery-customer-address">📍 ${safeAddress}</p>
        </div>
        
        <div class="delivery-items-summary">
            <h4>Order Items</h4>
            <div class="delivery-items-list">
                ${itemsHtml}
            </div>
            <div class="delivery-total-row">
                <span>Total to Collect</span>
                <span class="delivery-total-value">₹${safeTotal}</span>
            </div>
        </div>
        
        <div class="delivery-actions-grid">
            <button id="btn-navigate" class="delivery-btn delivery-btn-nav" onclick="window.navigateToCustomer(${JSON.stringify(o.address)}, ${o.lat || 'null'}, ${o.lng || 'null'})">
                <i data-lucide="navigation-2"></i>
                <span>NAVIGATE</span>
            </button>
            <button id="btn-call" class="delivery-btn delivery-btn-call" onclick="window.open('tel:${safePhone}', '_self')">
                <i data-lucide="phone"></i>
                <span>CALL</span>
            </button>
            <button id="btn-wa" class="delivery-btn delivery-btn-wa" onclick="contactCustomer('${safePhone}')">
                <i data-lucide="message-circle"></i>
                <span>WHATSAPP</span>
            </button>
            <button id="btn-otp" class="delivery-btn delivery-btn-otp" onclick="openOTPPanel()">
                <i data-lucide="key"></i>
                <span>VERIFY OTP</span>
            </button>
        </div>
    `;

    // Reinitialize Lucide icons inside the new panel
    setTimeout(() => {
        if (window.lucide) window.lucide.createIcons();
    }, 50);

    return panel;
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

// Navigate to customer location (address or lat/lng)
window.navigateToCustomer = (address, lat, lng) => {
    window.haptic(20);
    let destination;
    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
        destination = `${lat},${lng}`;
    } else if (address) {
        destination = address;
    } else {
        alert("Navigation data not available.");
        return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    window.open(url, '_system');
};

// Called from old card-based active orders (backward compatible)
window.navigateToCustomerLegacy = (orderId, address, lat, lng) => {
    window.navigateToCustomer(address, lat, lng);
};

window.contactCustomer = (phone) => {
    window.haptic(20);
    if (!phone) {
        alert("Customer phone number not available.");
        return;
    }
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
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

window.openOTPPanel = () => {
    if (!window.activeOrderId || !window.activeOrderOutlet) {
        alert("No active order found.");
        return;
    }
    currentOrderId = window.activeOrderId;
    window._currentOrderOutlet = window.activeOrderOutlet;
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
            showToast("Order delivered via administrative override.", "success");
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
        thumb.style.transform = `translateX(${delta}px)`;
        progress.style.width = `${delta + 28}px`;

        if (delta > maxDrag * 0.8) window.haptic(2);
    };

    const onEnd = () => {
        if (!isDragging) return;
        isDragging = false;

        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('touchend', onEnd);
        
        const maxDrag = container.offsetWidth - thumb.offsetWidth - 8;
        
        if (currentDelta >= maxDrag * 0.9) {
            thumb.style.transform = `translateX(${maxDrag}px)`;
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
    container.classList.add('initialized');
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

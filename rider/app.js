import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, onValue, get, set, update, runTransaction, query, orderByChild, equalTo, off, serverTimestamp, remove, limitToLast, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";
// Utility for haptic feedback
window.haptic = (pattern) => {
    try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    } catch (e) {}
};

// Firebase Database modular SDK does not export enablePersistence for RTDB on Web

const firebaseConfig = {
    apiKey: "AIzaSyDcx-SN5eak8PAs-8NtTGelJ_sICr5yb7Y",
    authDomain: "prashant-pizza-e86e4.firebaseapp.com",
    databaseURL: "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com",
    projectId: "prashant-pizza-e86e4",
    storageBucket: "prashant-pizza-e86e4.firebasestorage.app",
    messagingSenderId: "857471482885",
    appId: "1:857471482885:web:9eb8bbb90c77c588fbb06c"
};

const reCaptchaSiteKey = "6LeAlcwsAAAAAH4F3p5aCNvyPlhC3BRHOXTdDEGK";

let app, auth, db, dbStorage, messaging;
try {
    app = initializeApp(firebaseConfig);
    
    // Initialize App Check (Phase 2.16)
    initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(reCaptchaSiteKey),
        isTokenAutoRefreshEnabled: true
    });
    console.log("[App Check] Activated for Rider Portal");

    auth = getAuth(app);
    db = getDatabase(app);
    
    // Offline persistence is handled automatically by the browser/SDK for RTDB metadata, 
    // but disk persistence is not available in the Web Modular SDK for RTDB.
    console.log("[Firebase] Modular SDK initialized");
    
    dbStorage = getStorage(app);
    try {
        messaging = getMessaging(app);
    } catch (e) {
        console.warn("FCM not supported in this browser:", e);
    }
} catch (e) {
    console.error("Firebase Init Error:", e);
}

// ==========================================
// PIZZA ERP | RIDER PORTAL v3.0 (MODULAR)
// ==========================================
window.haptic = window.haptic || ((val) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(val);
    }
});

let deferredPrompt;

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

// Attach click listener for PWA install button
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('menu-downloadapp')?.addEventListener('click', window.installPWA);
});

// NUCLEAR REFRESH CIRCUIT BREAKER
window.completeSiteRefresh = async () => {
    window.haptic(50);
    console.log("[Refresh] Initializing Deep Sync & Cache Purge...");
    window.showToast("Purging Caches & Syncing...", "info");
    
    try {
        // 1. Unregister all service workers with timeout
        if ('serviceWorker' in navigator) {
            const swPromise = navigator.serviceWorker.getRegistrations().then(async registrations => {
                for (let registration of registrations) {
                    await registration.unregister();
                }
            });
            // Don't wait forever for SW
            await Promise.race([swPromise, new Promise(res => setTimeout(res, 2000))]);
        }

        // 2. Clear all caches with timeout
        if ('caches' in window) {
            const cachePromise = caches.keys().then(async keys => {
                for (let key of keys) {
                    await caches.delete(key);
                }
            });
            await Promise.race([cachePromise, new Promise(res => setTimeout(res, 2000))]);
        }

        // 3. Clear local storage for active state
        localStorage.removeItem('activeOrderId');
        localStorage.removeItem('activeOrderData');
        sessionStorage.clear();
        
        console.log("[Refresh] Purge Complete. Triggering Reload.");
        window.showToast("System Purged. Reloading...", "success");

        // Force reload from server with double-cache-busting
        setTimeout(() => {
            const cleanUrl = window.location.origin + window.location.pathname;
            window.location.href = `${cleanUrl}?v=${Date.now()}&sync=${Math.random().toString(36).substring(7)}`;
        }, 800);

    } catch (err) {
        console.error("Critical Refresh Error:", err);
        window.location.reload();
    }
};

// Status Update Actions
window.reachedOutlet = async (id, outlet) => {
    if (!id || !outlet) return;
    window.haptic([50, 30, 50]);
    try {
        await update(ref(db, `${outlet}/orders/${id}`), {
            status: "Arrived at Restaurant",
            arrivedAtRestaurantAt: serverTimestamp()
        });
        window.showToast("Arrived at Restaurant! Check items.", "success");
    } catch (e) {
        logError("reachedOutlet", e);
        window.showToast("Failed to update status", "error");
    }
};

window.reachedDropLocation = async (id, outlet) => {
    if (!id || !outlet) return;
    window.haptic([50, 30, 50]);
    try {
        const orderPath = `${outlet}/orders/${id}`;
        const snap = await get(ref(db, orderPath));
        const o = snap.val();

        // Safety check: If already reached, just open OTP
        if (o && (o.status || "").toLowerCase() === "reached drop location") {
            window.activeOrderId = id;
            window.activeOrderOutlet = outlet;
            return window.openOTPPanel();
        }

        await update(ref(db, orderPath), {
            status: "Reached Drop Location",
            reachedDropAt: serverTimestamp()
        });
        window.showToast("Arrived at Customer Location!", "success");
        
        if (o && o.customerPhone) {
            // Send Arrival Alert (Safe - doesn't expose OTP)
            window.triggerWhatsAppAlert(o.customerPhone, o.orderId || id.slice(-6), 'ARRIVED');
        }
        
        window.activeOrderId = id;
        window.activeOrderOutlet = outlet;
        window.openOTPPanel();
    } catch (e) {
        console.error("reachedDropLocation", e);
        window.showToast("Failed to update status", "error");
    }
};

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Use cache-busting for SW registration itself
        navigator.serviceWorker.register('sw.js?v=4.5.5').catch(err => console.error('SW failed', err));
    });
}





const escapeHtml = (text) => {
    if (!text && text !== 0) return "";
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.toString().replace(/[&<>"']/g, function(m) { return map[m]; });
};

const logError = (context, error) => {
    console.error(`[${context}] Error:`, error);
    try {
        if (currentUser && currentUser.profile) {
            const errorRef = ref(db, `logs/riderErrors/${currentUser.profile.id}/${Date.now()}`);
            set(errorRef, {
                context,
                message: error.message,
                stack: error.stack || 'No stack available',
                timestamp: serverTimestamp(),
                url: window.location.href,
                riderName: currentUser.profile.name || 'Unknown'
            });
        }
    } catch (e) {
        console.error("Critical: Failed to log error to cloud.", e);
    }
};

window.onerror = function (msg, url, line, col, error) {
    const errObj = { msg, url, line, col, stack: error ? error.stack : '', userAgent: navigator.userAgent, timestamp: Date.now() };
    console.error("Global Error Monitoring:", errObj);
    return false;
};

let currentUser = null;
let currentOrderId = null;
window.activeOrders = {};
window.riderLocation = null;
window._activeListeners = [];
let lastNotifCount = -1;
window.activeOrderData = null;
window.activeOrderId = null;
window.activeOrderOutlet = null;
window.ignoredPings = new Set();
window.orderCache = { pizza: {}, cake: {} };
window.outletCoords = { pizza: { lat: 25.887944, lng: 85.026194 }, cake: { lat: 25.887472, lng: 85.026861 } };

// Load outlet coordinates from Firebase on init
async function loadOutletCoords() {
    try {
        const pizzaStore = await get(ref(db, 'pizza/settings/Store'));
        const cakeStore = await get(ref(db, 'cake/settings/Store'));
        if (pizzaStore.val()) {
            window.outletCoords.pizza.lat = parseFloat(pizzaStore.val().lat) || 25.887944;
            window.outletCoords.pizza.lng = parseFloat(pizzaStore.val().lng) || 85.026194;
        }
        if (cakeStore.val()) {
            window.outletCoords.cake.lat = parseFloat(cakeStore.val().lat) || 25.887472;
            window.outletCoords.cake.lng = parseFloat(cakeStore.val().lng) || 85.026861;
        }
        console.log("[Outlet] Coordinates loaded:", window.outletCoords);
    } catch (e) { console.warn("[Outlet] Using default coordinates"); }
}

window.getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

window.calculateDuration = (start, end) => {
    if (!start || !end) return "N/A";
    const diff = Math.floor((end - start) / 1000); // seconds
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    if (mins > 60) {
        const hrs = Math.floor(mins / 60);
        const rm = mins % 60;
        return `${hrs}h ${rm}m`;
    }
    return `${mins}m ${secs}s`;
};

window.triggerWhatsAppAlert = (phone, orderId, actionType, extraData = {}, isManual = false) => {
    if (!phone) return;
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    let message = "";

    const riderName = window.currentUser?.profile?.name || "Your Rider";
    const riderPhone = window.currentUser?.profile?.phone || "our support number";

    if (actionType === "ACCEPTED") {
        message = `Hello! I am ${riderName}, your delivery partner for Roshani Sudha order #${orderId}. I am on my way to pick up your order! 🛵`;
    }
    else if (actionType === "PICKED_UP") {
        message = `Great news! I have picked up your order #${orderId}. If you need anything, you can call me at ${riderPhone}. I am on my way! 🍕🎂`;
    }
    else if (actionType === "REACHED_DROP") {
        message = `I have arrived at your drop location with your order #${orderId}! Please have your 4-digit OTP ready. ✅`;
    }
    else if (actionType === "SEND_OTP") {
        message = `Your Roshani Sudha order #${orderId} has arrived! 📍 \n\nTo safely receive your order, please provide this 4-digit OTP to the rider: *${extraData.otp}* ✅`;
    }
    else if (actionType === "ARRIVED") {
        message = `I have arrived with your order #${orderId}! Please have your 4-digit OTP ready. ✅`;
    }

    if (isManual) {
        const url = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    } else {
        // Send via Bot command node
        const outlet = window.activeOrderOutlet || 'pizza';
        const cmdRef = ref(db, `bot/${outlet}/commands`);
        push(cmdRef, {
            action: "SEND_GENERIC_MESSAGE",
            phone: cleanPhone,
            message: message,
            timestamp: serverTimestamp()
        });
        console.log(`[Alert] Pushed automated message to bot for ${cleanPhone}`);
    }
};

function resolvePath(path, outlet = null) {
    if (!path) return "";
    const sharedNodes = ['admins', 'migrationStatus', 'riders', 'logs', 'errorLogs'];
    const parts = path.split('/');
    const rootNode = parts[0];

    if (sharedNodes.includes(rootNode)) return path;
    const targetOutlet = outlet || window.currentOutlet || 'pizza';
    if (targetOutlet && path.startsWith(`${targetOutlet}/`)) return path;

    return `${targetOutlet}/${path}`;
}

async function setupPushNotifications(userId) {
    if (!('Notification' in window)) return;
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const token = await getToken(messaging, { serviceWorkerRegistration: await navigator.serviceWorker.ready });
            if (token) await update(ref(db, `riders/${userId}`), { fcmToken: token });
        }
    } catch (error) { logError("setupPushNotifications", error); }
}

onMessage(messaging, (payload) => {
    if (payload.notification) {
        window.showToast(`${payload.notification.title}: ${payload.notification.body}`, "info");
        try { new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => { }); } catch (e) { }
    }
});



// NAVIGATION
window.toggleRiderSidebar = () => {
    console.log("[Navigation] Toggling Sidebar. Width:", window.innerWidth);
    window.haptic(10);
    const nav = document.getElementById('sidebarNav');
    const overlay = document.getElementById('sidebarOverlay');
    if (!nav) {
        console.error("[Navigation] sidebarNav element not found!");
        return;
    }

    if (window.innerWidth > 1024) {
        document.body.classList.toggle('sidebar-collapsed');
        console.log("[Navigation] Laptop mode: toggled .sidebar-collapsed on body");
    } else {
        const isActive = nav.classList.toggle('active');
        if (overlay) overlay.classList.toggle('active', isActive);
        console.log("[Navigation] Mobile mode: sidebar active =", isActive);
    }
};

window.showSection = (sectionId) => {
    if (window.haptic) window.haptic(10);

    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`sec-${sectionId}`);
    if (target) {
        target.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // UPDATE BOTTOM NAVIGATION UI
    document.querySelectorAll('.bottom-nav .nav-item').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-section') === sectionId);
    });

    document.querySelectorAll('.nav-links .nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-section') === sectionId);
    });

    const nav = document.getElementById('sidebarNav');
    if (nav && nav.classList.contains('active')) window.toggleRiderSidebar();
    if (window.lucide) window.lucide.createIcons({ root: target || document.body });

    // Re-init map if switching to active section
    if (sectionId === 'active' && window.activeOrderData) {
        setTimeout(() => window.initActiveMap(window.activeOrderData), 200);
    } else if (sectionId === 'active') {
        setTimeout(() => window.initDefaultMap(), 200);
    }
};

window.showToast = (msg, type = "info") => {
    const toast = document.createElement('div');
    let bgColor = type === 'error' ? '#EF4444' : (type === 'success' ? '#10B981' : '#1E293B');
    toast.style.cssText = `position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); background: ${bgColor}; color: white; padding: 12px 24px; border-radius: 30px; font-weight: 700; z-index: 9999; text-transform: uppercase; text-align: center; white-space: nowrap; box-shadow: 0 4px 15px rgba(0,0,0,0.2);`;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
};

// LOGIN & AUTH
window.login = async () => {
    const identifier = document.getElementById('email').value.trim();
    const pass = document.getElementById('password').value;
    const errEl = document.getElementById('loginError');
    if (errEl) errEl.classList.add('hidden');
    if (!identifier || !pass) return;

    let loginEmail = /^\d{10}$/.test(identifier) ? `${identifier}@rider.com` : identifier;

    try {
        await signInWithEmailAndPassword(auth, loginEmail, pass);
        localStorage.setItem('isLoggedIn', 'true');
    } catch (e) {
        console.error("Login Error:", e);
        let msg = "Authentication failed. Check credentials.";
        if (e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
            msg = "Incorrect mobile number or password.";
        } else if (e.code === 'auth/too-many-requests') {
            msg = "Too many failed attempts. Try again later.";
        } else if (e.code === 'auth/network-request-failed') {
            msg = "Network error. Check internet connection.";
        }
        window.showToast(msg, "error");
    }
};

// PULL TO REFRESH (MOBILE)
let touchStart = -1;
window.addEventListener('touchstart', (e) => {
    if ((window.scrollY || document.documentElement.scrollTop || 0) === 0) touchStart = e.touches[0].pageY;
    else touchStart = -1;
}, { passive: true });

window.addEventListener('touchend', (e) => {
    if (touchStart === -1) return;
    const touchEnd = e.changedTouches[0].pageY;
    if (window.scrollY === 0 && touchEnd - touchStart > 250) {
        window.completeSiteRefresh();
    }
    touchStart = -1;
}, { passive: true });

window.addEventListener('touchcancel', () => {
    touchStart = -1;
});


window.logout = async () => {
    if (confirm("End your shift and logout?")) {
        window.clearAllListeners();
        localStorage.removeItem('rider_authenticated');
        await signOut(auth);
    }
};

window.toggleRiderStatus = async () => {
    if (!window.currentUser || !window.currentUser.profile) return window.showToast("Authentication error.", "error");
    const currentStatus = window.currentUser.profile.status || "Offline";
    const newStatus = currentStatus === "Online" ? "Offline" : "Online";
    try {
        await update(ref(db, `riders/${window.currentUser.profile.id}`), { status: newStatus, lastSeen: serverTimestamp() });
        window.currentUser.profile.status = newStatus;
        
        const btn = document.getElementById('statusToggleBtn');
        if (btn) {
            btn.className = `status-pill ${newStatus.toLowerCase()}`;
            btn.querySelector('span').innerText = newStatus.toUpperCase();
        }
        window.showToast(`You are now ${newStatus}`, "info");

        if (newStatus === "Online") initLocationTracking();
        else stopLocationTracking();
    } catch (e) { window.showToast("Failed to sync status", "error"); }
};

window.toggleAadharView = () => {
    const container = document.getElementById('aadhar-container');
    const img = document.getElementById('r-aadhar-img');
    const btn = document.getElementById('btn-toggle-aadhar');
    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        img.src = window.currentUser.profile.aadharPhoto || '';
        btn.innerText = 'HIDE';
    } else {
        container.classList.add('hidden');
        btn.innerText = 'SHOW';
    }
};

window.confirmPickup = async () => {
    if (!window.activeOrderId) {
        console.warn("[Pickup] No activeOrderId set. Refreshing state...");
        // Attempt recovery from cache if possible
        if (window.activeOrderData?.id) window.activeOrderId = window.activeOrderData.id;
        else return window.showToast("No active order. Please refresh.", "error");
    }

    window.haptic(40);
    const id = window.activeOrderId;
    const outletId = window.activeOrderOutlet || 'pizza';
    const orderPath = `${outletId}/orders/${id}`;

    try {
        await update(ref(db, orderPath), { status: "Picked Up", pickedUpAt: serverTimestamp() });
        window.showToast("Order Picked Up! Drive safe. 🛵", "success");
        
        // Auto-switch to LIVE section & start navigation
        window.showSection('active');
        window.startNavigation(id, outletId);

        // WhatsApp Alert
        const snap = await get(ref(db, orderPath));
        const o = snap.val();
        if (o && window.triggerWhatsAppAlert) {
            window.triggerWhatsAppAlert(o.customerPhone || o.phone, o.orderId || id, "PICKED_UP");
        }
    } catch (e) {
        console.error("[Pickup] Error:", e);
        window.showToast("Failed to update status.", "error");
    }
};



let activeMap = null;
let customerMarker = null;
let riderMarker = null;

window.initActiveMap = (order) => {
    const mapContainer = document.getElementById('activeTripMap');
    if (!mapContainer || !order) return;

    const lat = order.lat || order.latitude;
    const lng = order.lng || order.longitude;
    if (!lat || !lng) return;

    // Fix Leaflet broken marker icons (Phase 3.1)
    if (typeof L !== 'undefined' && L.Icon && L.Icon.Default) {
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        });
    }

    if (!activeMap) {
        activeMap = L.map('activeTripMap', { zoomControl: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(activeMap);
    }

    if (customerMarker) activeMap.removeLayer(customerMarker);
    customerMarker = L.marker([lat, lng]).addTo(activeMap).bindPopup("Customer Location");

    const bounds = L.latLngBounds([lat, lng]);

    if (window.riderLocation) {
        if (riderMarker) activeMap.removeLayer(riderMarker);
        riderMarker = L.circleMarker([window.riderLocation.lat, window.riderLocation.lng], {
            color: '#FF5200',
            fillColor: '#FF5200',
            fillOpacity: 0.8,
            radius: 8
        }).addTo(activeMap).bindPopup("You are here");
        bounds.extend([window.riderLocation.lat, window.riderLocation.lng]);
    }

    activeMap.fitBounds(bounds, { padding: [50, 50] });
    activeMap.invalidateSize();
};

window.initDefaultMap = () => {
    const mapContainer = document.getElementById('activeTripMap');
    if (!mapContainer || activeMap) return;

    // Default center (can be overridden by user location)
    const center = window.riderLocation ? [window.riderLocation.lat, window.riderLocation.lng] : [25.887944, 85.026194];
    
    activeMap = L.map('activeTripMap', { zoomControl: false }).setView(center, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(activeMap);

    if (window.riderLocation) {
        riderMarker = L.circleMarker([window.riderLocation.lat, window.riderLocation.lng], {
            color: '#FF5200',
            fillColor: '#FF5200',
            fillOpacity: 0.8,
            radius: 8
        }).addTo(activeMap).bindPopup("You are here");
    }
};

window.renderNotifications = () => {
    const list = document.getElementById('notifList');
    const badge = document.getElementById('notifBadge');
    if (!list) return;

    const notifs = Object.entries(window.riderNotifications || {})
        .sort((a, b) => b[1].timestamp - a[1].timestamp);

    const unreadCount = notifs.filter(([id, n]) => !n.read).length;
    if (badge) {
        badge.innerText = unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    }

    if (notifs.length === 0) {
        list.innerHTML = `
            <div class="empty-notif">
                <i data-lucide="bell-off"></i>
                <p>No new notifications</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons({ root: list });
        return;
    }

    list.innerHTML = notifs.map(([id, n]) => `
        <div class="notif-item ${n.read ? '' : 'unread'}" data-action="markNotifRead" data-id="${escapeHtml(id)}">
            <div class="notif-icon ${escapeHtml(n.type || 'info')}">
                <i data-lucide="${escapeHtml(n.icon || 'bell')}"></i>
            </div>
            <div class="notif-body">
                <h4>${escapeHtml(n.title)}</h4>
                <p>${escapeHtml(n.body)}</p>
                <span class="notif-time">${new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            ${!n.read ? '<div class="unread-dot"></div>' : ''}
        </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons({ root: list });
};

window.markNotifRead = async (id) => {
    if (!id || !window.currentUser?.profile?.id) return;
    try {
        const riderId = window.currentUser.profile.id;
        await update(ref(db, `riders/${riderId}/notifications/${id}`), { read: true });
    } catch (e) {
        console.warn("[Rider Notif] Mark Read Failed:", e);
    }
};

window.clearAllNotifications = async () => {
    if (!window.currentUser?.profile?.id) return;
    if (!confirm("Clear all notifications?")) return;
    try {
        const riderId = window.currentUser.profile.id;
        await remove(ref(db, `riders/${riderId}/notifications`));
        window.showToast("Notifications cleared", "success");
    } catch (e) {
        window.showToast("Failed to clear notifications", "error");
    }
};

window.toggleNotifSheet = () => {
    const sheet = document.getElementById('notifSheet');
    const overlay = document.querySelector('.sidebar-overlay');
    if (!sheet) return;
    
    sheet.classList.toggle('active');
    if (overlay) {
        overlay.classList.toggle('active');
        if (sheet.classList.contains('active')) {
            overlay.onclick = window.toggleNotifSheet;
        }
    }
};

// GPS LOCATION ENGINE
let _locationWatchId = null;
let _locationInterval = null;

function initLocationTracking() {
    if (!navigator.geolocation) return;
    if (_locationWatchId) return;

    _locationWatchId = navigator.geolocation.watchPosition(
        pos => {
            window.riderLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
        }, err => { }, { enableHighAccuracy: true }
    );

    if (_locationInterval) clearInterval(_locationInterval);
    _locationInterval = setInterval(() => {
        if (window.riderLocation && currentUser && currentUser.profile.status === "Online") {
            set(ref(db, resolvePath(`riders/${currentUser.profile.id}/location`)), window.riderLocation).catch(() => { });
        }
    }, 30000);
}

function stopLocationTracking() {
    if (_locationWatchId) { navigator.geolocation.clearWatch(_locationWatchId); _locationWatchId = null; }
    if (_locationInterval) { clearInterval(_locationInterval); _locationInterval = null; }
}

// CORE DELIVERY LOGIC
window.acceptOrder = async (id, outletId) => {
    window.haptic(40);
    if (!window.currentUser) return window.showToast("Authentication error. Please login again.", "error");
    if (!window.riderLocation) return window.showToast("GPS Error. Ensure location is ON.", "error");

    // Proximity policy removed as per user request
    // const distFromRest = window.getDistance(window.riderLocation.lat, window.riderLocation.lng, outletCoords.lat, outletCoords.lng);
    // if (distFromRest > 0.5) return window.showToast(`Must be within 500m of outlet! (You are ${distFromRest.toFixed(1)}km away)`, "error");

    try {
        const orderPath = `${outletId}/orders/${id}`;
        const result = await runTransaction(ref(db, orderPath), current => {
            if (current && current.assignedRider) return;
            // Changed from 4-digit to 4-digit OTP for consistency across system
            const initialOTP = Math.floor(1000 + Math.random() * 9000).toString();
            return { 
                ...current, 
                status: "Arriving at Restaurant", 
                deliveryOTP: initialOTP, 
                otp: initialOTP, 
                assignedRider: window.currentUser.email.toLowerCase(), 
                riderId: window.currentUser.uid,
                riderPhone: window.currentUser.profile.phone || "",
                acceptedAt: Date.now() 
            };
        });
        if (result.committed) {
            window.showSection('home');
            window.showToast("Order Accepted!", "success");
            const o = result.snapshot.val();
            window.triggerWhatsAppAlert(o.customerPhone || o.phone, o.orderId || id, "ACCEPTED");
        } else window.showToast("Order taken by another rider.", "warning");
    } catch (e) { window.showToast("Failed to accept.", "error"); }
};

window.openOTPPanel = () => {
    if (!window.activeOrderId) return window.showToast("No active order found.", "info");
    currentOrderId = window.activeOrderId;
    window._currentOrderOutlet = window.activeOrderOutlet;
    document.getElementById('otpInput').value = '';
    document.getElementById('otpPanel').classList.add('active');

    const emergencyBtn = document.getElementById('emergencyBtn');
    if (emergencyBtn) emergencyBtn.classList.toggle('hidden', !(currentUser && currentUser.profile && currentUser.profile.isAdmin));
};

window.closeOTPPanel = () => { document.getElementById('otpPanel').classList.remove('active'); };

window.verifyOTP = async () => {
    window.haptic(25);
    const otp = document.getElementById('otpInput').value;
    if (!otp) return;

    const btn = document.getElementById('btnConfirmOTP');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> VERIFYING...';
    btn.disabled = true;

    const outletId = window._currentOrderOutlet || 'pizza';
    const otpAttemptsPath = `${outletId}/otpAttempts/${currentOrderId}`;
    const now = Date.now();

    try {
        const attemptsSnap = await get(ref(db, otpAttemptsPath));
        const userAttempts = attemptsSnap.val() || { count: 0, lastTry: 0, blockedUntil: 0 };

        if (userAttempts.blockedUntil > now) {
            const remaining = Math.ceil((userAttempts.blockedUntil - now) / 1000);
            window.showToast(`Verification blocked! Try again in ${remaining}s`, "error");
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        const orderPath = `${outletId}/orders/${currentOrderId}`;
        const snap = await get(ref(db, orderPath));
        const order = snap.val();

        if (!order) {
            window.showToast("Order not found.", "error");
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        const [storeSnap, deliverySnap] = await Promise.all([
            get(ref(db, `${outletId}/settings/Store`)),
            get(ref(db, `${outletId}/settings/Delivery`))
        ]);
        const fallbackCode = (deliverySnap.val() || {}).backupCode || (storeSnap.val() || {}).deliveryBackupCode;

        const storedOTP = order.deliveryOTP || order.otp || order.otpCode;
        const matchesCustomer = String(otp).trim() === String(storedOTP).trim();
        const matchesFallback = fallbackCode && String(otp).trim() === String(fallbackCode).trim();

        if (matchesCustomer || matchesFallback) {
            await remove(ref(db, otpAttemptsPath));
            window.closeOTPPanel();
            
            // Success! Now ask for payment mode
            window.activeOrderForPayment = { path: orderPath, data: order, matchesFallback };
            document.getElementById('paymentTotalTxt').innerText = `Total to collect: ₹${order.total || 0}`;
            document.getElementById('paymentPanel').classList.add('active');
            if (window.lucide) window.lucide.createIcons({ root: document.getElementById('paymentPanel') });
        } else {
            const result = await runTransaction(ref(db, otpAttemptsPath), (current) => {
                const data = current || { count: 0, lastTry: 0, blockedUntil: 0 };
                data.count++; data.lastTry = now;
                if (data.count >= 10) data.blockedUntil = now + (60 * 1000);
                return data;
            });
            const failData = result.snapshot.val();
            if (failData.blockedUntil > now) window.showToast("10 failed attempts! Blocked for 60s.", "error");
            else window.showToast(`Incorrect OTP! ${10 - failData.count} attempts left.`, "error");
            
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    } catch (e) { 
        console.error(e); 
        window.showToast("System error during verification.", "error"); 
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.recordPaymentAndComplete = async (method) => {
    if (!window.activeOrderForPayment) return;
    const { path, data, matchesFallback } = window.activeOrderForPayment;
    
    try {
        await window.finalizeDeliverySequence(path, matchesFallback, data, method);
        document.getElementById('paymentPanel').classList.remove('active');
        window.activeOrderForPayment = null;
    } catch (e) {
        window.showToast("Failed to complete delivery.", "error");
    }
};

window.finalizeDeliverySequence = async (orderPath, matchesFallback, order, paymentMethod = 'CASH') => {
    if (!window.currentUser || !window.currentUser.profile) return window.showToast("Authentication error. Please login again.", "error");

    const outletId = orderPath.split('/')[0] || 'pizza';
    const riderId = window.currentUser.profile.id;
    const commission = Number(order.deliveryFee || 0);

    // Calculate Metrics
    const nowTs = Date.now();
    const tripDuration = window.calculateDuration(order.pickedUpAt, nowTs);
    
    let tripDistance = "0.0 km";
    if (order.lat && order.lng && window.outletCoords[outletId]) {
        const d = window.getDistance(window.outletCoords[outletId].lat, window.outletCoords[outletId].lng, order.lat, order.lng);
        tripDistance = d.toFixed(1) + " km";
    }

    const updates = { 
        status: "Delivered", 
        deliveredAt: nowTs, 
        verifiedBy: matchesFallback ? 'ADMIN_FALLBACK' : 'OTP', 
        paymentCollected: true,
        paymentMethod: paymentMethod.toUpperCase(),
        tripDuration: tripDuration,
        tripDistance: tripDistance
    };

    await update(ref(db, orderPath), updates);
    
    const riderId = window.currentUser.profile.id;
    const commission = Number(order.deliveryFee || 0);
    const outletId = orderPath.split('/')[0] || 'pizza';
    
    await runTransaction(ref(db, resolvePath(`riderStats/${riderId}`, outletId)), (current) => {
        if (!current) return { totalOrders: 1, totalEarnings: commission };
        return { ...current, totalOrders: (current.totalOrders || 0) + 1, totalEarnings: (current.totalEarnings || 0) + commission };
    });
    
    // Populate Success UI
    document.getElementById('summaryPayment').innerText = paymentMethod;
    document.getElementById('summaryCommission').innerText = `₹${commission}`;
    document.getElementById('successOverlay').classList.add('active');
    if (window.lucide) window.lucide.createIcons({ root: document.getElementById('successOverlay') });

    // Confetti Celebration
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#FF5200', '#FF7A00', '#22C55E']
        });
    }

    window.haptic([100, 50, 100]);
    
    // Auto-close after 3 seconds if user doesn't click
    setTimeout(() => {
        window.closeSuccessOverlay();
    }, 4000);
};

window.closeSuccessOverlay = () => {
    document.getElementById('successOverlay').classList.remove('active');
    window.showSection('home');
};

window.emergencyOverride = async () => {
    if (!currentUser || !currentUser.profile || !currentUser.profile.isAdmin) return window.showToast("Unauthorized access.", "error");
    if (confirm("FORCE COMPLETE: Bypass customer OTP?")) {
        window.haptic([50, 50, 50]);
        const orderPath = `${window._currentOrderOutlet || 'pizza'}/orders/${currentOrderId}`;
        const snap = await get(ref(db, orderPath));
        const order = snap.val();
        
        window.closeOTPPanel();
        window.activeOrderForPayment = { path: orderPath, data: order, matchesFallback: true };
        document.getElementById('paymentTotalTxt').innerText = `Total to collect: ₹${order.total || 0}`;
        document.getElementById('paymentPanel').classList.remove('hidden');
    }
};

window.regenerateOTP = async () => {
    if (!currentOrderId) return;
    const now = Date.now();
    const outletId = window._currentOrderOutlet || 'pizza';
    const otpAttemptsPath = `${outletId}/otpAttempts/${currentOrderId}`;

    const attemptsSnap = await get(ref(db, otpAttemptsPath));
    const attemptData = attemptsSnap.val() || {};

    if (now - (attemptData.lastResend || 0) < 60000) {
        return window.showToast(`Wait ${Math.ceil((60000 - (now - attemptData.lastResend)) / 1000)}s before resending.`, "warning");
    }

    try {
        const orderPath = `${outletId}/orders/${currentOrderId}`;
        // Generate 4-digit OTP for consistency with bot
        const newOTP = Math.floor(1000 + Math.random() * 9000).toString();
        await update(ref(db, orderPath), { deliveryOTP: newOTP, otp: newOTP });
        await runTransaction(ref(db, otpAttemptsPath), (current) => {
            const data = current || { count: 0, lastTry: 0, blockedUntil: 0 };
            data.resendCount = (data.resendCount || 0) + 1; data.lastResend = now;
            return data;
        });
        window.showToast("New OTP generated and sent to customer!", "success");
        // Removed triggerWhatsAppAlert from here to hide OTP from Rider.
        // The WhatsApp Bot will detect the field change and send the alert instead.
    } catch (e) { window.showToast("Failed to regenerate OTP.", "error"); }
};

window.startNavigation = async (id, outletId) => {
    window.haptic(20);
    try {
        const orderPath = `${outletId}/orders/${id}`;
        
        // Update status to "Out for Delivery" if it's currently "Picked Up"
        const currentSnap = await get(ref(db, orderPath));
        const currentOrder = currentSnap.val();
        if (currentOrder && (currentOrder.status || "").toLowerCase() === "picked up") {
            await update(ref(db, orderPath), { status: "Out for Delivery" });
        }

        const snap = await get(ref(db, orderPath));
        const order = snap.val();
        
        if (!order) return window.showToast("Order not found.", "error");
        
        const lat = order.lat || order.latitude;
        const lng = order.lng || order.longitude;
        
        if (lat && lng) {
            const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
            window.open(url, '_blank');
        } else {
            const address = order.address || "";
            if (address) {
                const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
                window.open(url, '_blank');
            } else {
                window.showToast("No delivery location found.", "error");
            }
        }
    } catch (e) {
        logError("startNavigation", e);
        window.showToast("Navigation failed.", "error");
    }
};







window.pingTimerInterval = null;
window.showPingModal = (id, outletId, order) => {
    window.haptic([100, 50, 100, 50, 200]);
    try {
        const audio = document.getElementById('pingAudio');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.warn('Audio play blocked:', e));
        }
    } catch(e) {}
    
    const modal = document.getElementById('newOrderPingModal');
    if (!modal) return;
    
    document.getElementById('pingOutletName').innerText = (outletId === 'pizza' ? 'Pizza' : 'Cake') + ' Outlet';
    document.getElementById('pingCustomerAddress').innerText = order.address || 'Unknown';
    document.getElementById('pingOrderId').innerText = '#' + (order.orderId || id.slice(-6)).toUpperCase();
    document.getElementById('pingOrderTotal').innerText = '₹' + (order.deliveryFee || '0');
    
    const acceptBtn = document.getElementById('btnAcceptOrder');
    const ignoreBtn = document.getElementById('btnIgnoreOrder');
    const timerEl = document.getElementById('pingTimer');
    
    // Clear old listeners by cloning
    const newAcceptBtn = acceptBtn.cloneNode(true);
    acceptBtn.parentNode.replaceChild(newAcceptBtn, acceptBtn);
    const newIgnoreBtn = ignoreBtn.cloneNode(true);
    ignoreBtn.parentNode.replaceChild(newIgnoreBtn, ignoreBtn);
    
    newAcceptBtn.addEventListener('click', () => {
        window.hidePingModal();
        window.acceptOrder(id, outletId);
    });
    
    newIgnoreBtn.addEventListener('click', () => {
        window.ignoredPings.add(id);
        window.hidePingModal();
        window.renderAllOrders(); // re-render to pick next
    });
    
    modal.classList.remove('hidden');
    void modal.offsetWidth; // force reflow
    modal.classList.add('active');
    
    let timeLeft = 30;
    timerEl.innerText = timeLeft + 's';
    if (window.pingTimerInterval) clearInterval(window.pingTimerInterval);
    
    window.pingTimerInterval = setInterval(() => {
        timeLeft--;
        timerEl.innerText = timeLeft + 's';
        if (timeLeft <= 0) {
            window.ignoredPings.add(id);
            window.hidePingModal();
            window.renderAllOrders();
        }
    }, 1000);
};

window.hidePingModal = () => {
    const modal = document.getElementById('newOrderPingModal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
    try {
        const audio = document.getElementById('pingAudio');
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
    } catch(e) {}
    
    if (window.pingTimerInterval) {
        clearInterval(window.pingTimerInterval);
        window.pingTimerInterval = null;
    }
};

// REALTIME LISTENERS & PREMIUM UI RENDERER
window._activeListeners = window._activeListeners || [];
window.clearAllListeners = () => {
    console.log("[Sync] Clearing all listeners...");
    if (window._activeListeners) {
        window._activeListeners.forEach(unsub => { 
            try { 
                if (typeof unsub === 'function') unsub(); 
                else if (unsub && unsub.ref && typeof unsub.ref.off === 'function') unsub.ref.off();
            } catch (e) { console.warn("[Sync] Error clearing listener:", e); } 
        });
        window._activeListeners = [];
    }
    // WIPE CACHE to prevent stale ghost orders
    window.orderCache = { pizza: {}, cake: {} };
};

function initRealtimeListeners() {
    if (!currentUser || !currentUser.email) {
        console.warn("[Sync] Cannot init listeners: No user email available.");
        return;
    }
    const currentEmail = currentUser.email.toLowerCase();
    console.log(`[Sync] Initializing listeners for: ${currentEmail}`);

    ['pizza', 'cake'].forEach(outletId => {
        const ordersPath = `${outletId}/orders`;
        
        // Ensure cache entry exists
        if (!window.orderCache[outletId]) window.orderCache[outletId] = {};

        const updateCache = (data, type) => {
            if (!data) data = {};
            console.log(`[Sync] Received ${type} updates for ${outletId} (${Object.keys(data).length} items)`);
            
            // Show sync pulse
            const syncEl = document.getElementById('syncStatus');
            if (syncEl) {
                syncEl.classList.add('active');
                syncEl.innerHTML = `<span><i data-lucide="check-circle" class="icon-14"></i> Synced</span>`;
                if (window.lucide) window.lucide.createIcons({ root: syncEl });
                setTimeout(() => syncEl.classList.remove('active'), 2000);
            }

            const currentCache = window.orderCache[outletId];
            const currentEmail = (window.currentUser?.email || "").toLowerCase();

            // 1. Cleanup: Remove items of this 'type' that are no longer in the snapshot
            Object.keys(currentCache).forEach(id => {
                const item = currentCache[id];
                const isItemOfThisType = (type === 'unassigned') 
                    ? !item.assignedRider 
                    : (item.assignedRider && item.assignedRider.toLowerCase() === currentEmail);
                
                if (isItemOfThisType && !data[id]) {
                    delete currentCache[id];
                }
            });

            // 2. Merge: Update/Add new data
            Object.assign(currentCache, data);
            
            // 3. Render
            window.renderAllOrders();
        };

        // 1. Available for Pickup (Unassigned)
        const q1 = query(ref(db, ordersPath), orderByChild('assignedRider'), equalTo(""));
        const unsub1 = onValue(q1, snap => updateCache(snap.val() || {}, 'unassigned'), error => {
            console.error(`[Firebase] Pickup Sync Error (${outletId}):`, error);
            if (error.code === 'PERMISSION_DENIED') {
                window.showToast(`Access Denied to ${outletId} orders. Contact Admin.`, "error");
            }
        });
        window._activeListeners.push(unsub1);

        // 2. My Orders (Assigned to me)
        const q2 = query(ref(db, ordersPath), orderByChild('assignedRider'), equalTo(currentEmail));
        const unsub2 = onValue(q2, snap => updateCache(snap.val() || {}, 'mine'), error => {
            console.error(`[Firebase] My Orders Sync Error (${outletId}):`, error);
        });
        window._activeListeners.push(unsub2);
    });

    // Listen to Notifications
    const riderId = currentUser.profile.id;
    const notifPath = `riders/${riderId}/notifications`;
    const notifRef = ref(db, notifPath);
    
    const unsubNotif = onValue(notifRef, snap => {
        const data = snap.val() || {};
        const count = Object.keys(data).length;
        
        if (lastNotifCount !== -1 && count > lastNotifCount) {
            window.haptic([200, 100, 200]);
            window.showToast("New Notification Received! 🔔", "info");
            try { new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => {}); } catch(e){}
        }
        
        lastNotifCount = count;
        window.riderNotifications = data;
        window.renderNotifications();
    }, error => {
        console.error("[Firebase] Notification Read Error:", error);
        if (error.code === 'PERMISSION_DENIED') {
            window.showToast("Notification Access Denied", "error");
        }
    });
    window._activeListeners.push(unsubNotif);
}

// ZOMATO-STYLE GLOBAL SLIDER DELEGATION (Phase 5.0)
let sliderState = {
    isDragging: false,
    handle: null,
    container: null,
    bg: null,
    startX: 0,
    maxDrag: 0,
    action: null,
    id: null,
    outlet: null
};
window.sliderState = sliderState;

window.initGlobalSlider = () => {
    const onStart = (e) => {
        const handle = e.target.closest('.slide-handle');
        if (!handle) return;
        const container = handle.closest('.slide-action-container');
        if (!container) return;

        sliderState.isDragging = true;
        sliderState.handle = handle;
        sliderState.container = container;
        sliderState.bg = container.querySelector('.slide-bg-fill');
        sliderState.text = container.querySelector('.slide-text');
        sliderState.startX = (e.type === 'touchstart') ? e.touches[0].clientX : e.clientX;
        sliderState.maxDrag = container.clientWidth - handle.clientWidth - 10;
        sliderState.action = container.dataset.action;
        sliderState.id = container.dataset.id;
        sliderState.outlet = container.dataset.outlet;

        // Ensure global state is synced for actions that depend on it
        if (sliderState.id) {
            window.activeOrderId = sliderState.id;
            window.activeOrderOutlet = sliderState.outlet;
        }

        sliderState.handle.style.transition = 'none';
        sliderState.handle.classList.add('dragging');
        if (sliderState.bg) sliderState.bg.style.transition = 'none';
        
        window.haptic(15);
    };

    const onMove = (e) => {
        if (!sliderState.isDragging || !sliderState.id) return;
        
        // Prevent page scroll while sliding
        if (e.cancelable) e.preventDefault();
        
        const currentX = (e.type === 'touchmove') ? e.touches[0].clientX : e.clientX;
        let delta = currentX - sliderState.startX;
        
        if (delta < 0) delta = 0;
        if (delta > sliderState.maxDrag) delta = sliderState.maxDrag;
        
        const handle = sliderState.handle;
        const bg = sliderState.bg;
        const text = sliderState.text;
        
        if (handle) handle.style.transform = `translateX(${delta}px)`;
        if (bg) bg.style.width = `${delta + 30}px`;
        if (text) text.style.opacity = 1 - (delta / (sliderState.maxDrag * 0.8));

        if (Math.floor(delta) % 60 === 0) window.haptic(5);
    };
    const onEnd = () => {
        if (!sliderState.isDragging || !sliderState.handle) return;
        
        const handle = sliderState.handle;
        handle.classList.remove('dragging');
        const bg = sliderState.bg;
        const max = sliderState.maxDrag;
        const action = sliderState.action;
        const id = sliderState.id;
        const outlet = sliderState.outlet;

        const style = window.getComputedStyle(handle);
        const matrix = new WebKitCSSMatrix(style.transform);
        const currentX = matrix.m41;
        if (currentX >= max * 0.8) {
            // Success
            handle.style.transform = `translateX(${max}px)`;
            if (bg) bg.style.width = '100%';
            window.haptic([50, 30, 50]);
            
            // Execute action after short delay to show completion
            setTimeout(() => {
                if (action === 'reached-outlet') window.reachedOutlet(id, outlet);
                else if (action === 'pickup') window.confirmPickup();
                else if (action === 'drop') window.reachedDropLocation(id, outlet);
            }, 100);
        } else {
            // Reset
            handle.style.transition = 'transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
            handle.style.transform = 'translateX(0px)';
            if (bg) {
                bg.style.transition = 'width 0.3s ease';
                bg.style.width = '0px';
            }
            const liveContainer = document.getElementById(`slider-${id}`);
            const text = liveContainer?.querySelector('.slide-text');
            if (text) text.style.opacity = 1;
        }
        sliderState.isDragging = false;
        sliderState.id = null;
    };

    document.addEventListener('mousedown', onStart);
    document.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);
};

let _renderTimeout;
window.renderAllOrders = () => {
    if (_renderTimeout) clearTimeout(_renderTimeout);
    _renderTimeout = setTimeout(_doRenderAllOrders, 50);
};

window._doRenderAllOrders = () => {
    const unassignedList = document.getElementById('unassignedOrdersList');
    const dashboardActiveView = document.getElementById('dashboardActiveDeliveryView');
    const activeOrderView = document.getElementById('activeOrderView');
    const historyList = document.getElementById('completedOrdersList');
    const pickupBadge = document.getElementById('navPickupBadge');

    if (!unassignedList || !dashboardActiveView || !window.currentUser) return;
    if (window.sliderState && window.sliderState.isDragging) return;

    // SKELETON STATE: If no data yet, show placeholders
    const hasData = Object.values(window.orderCache).some(outlet => Object.keys(outlet).length > 0);
    if (!hasData) {
        dashboardActiveView.innerHTML = `
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
        `;
        if (activeOrderView) activeOrderView.innerHTML = `<div class="skeleton-card" style="height: 300px;"></div>`;
        return;
    }

    // Reset views
    unassignedList.innerHTML = '';
    dashboardActiveView.innerHTML = '';
    if (historyList) historyList.innerHTML = '';
    if (activeOrderView) {
        activeOrderView.innerHTML = `
            <div class="glass-panel empty-state-glass">
                <p>No active trip currently.</p>
            </div>
        `;
    }

    let unassignedRows = "";
    let unassignedCards = "";
    let historyRows = "";
    let historyCards = "";
    let unassignedCount = 0;
    let historyCount = 0;
    
    // Stats for Today
    let todayOrders = 0; 
    let todayPay = 0; 
    
    // Outlet Specific Stats (Lifetime)
    let pizzaEarnings = 0;
    let cakeEarnings = 0;
    
    // Outlet Specific Stats (Today)
    let pizzaToday = 0;
    let cakeToday = 0;
    
    // Cash to Settle
    let totalCashToSettle = 0;
    
    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    window._pingCandidate = null;
    
    // Smart reset: only clear activeOrderId if we are not currently in a transition
    if (!sliderState.isDragging) {
        window.activeOrderId = null;
        window.activeOrderOutlet = null;
        window.activeOrderData = null;
    }


    // 1. First Pass: Collect all relevant orders and find the BEST candidate for "Active Order"
    const allRelevantOrders = [];
    Object.keys(window.orderCache).forEach(outletId => {
        const orders = window.orderCache[outletId];
        Object.keys(orders).forEach(id => {
            const o = orders[id];
            const status = (o.status || "").toLowerCase();
            const currentEmail = (window.currentUser?.email || "").toLowerCase();
            const riderUid = window.currentUser?.uid || window.currentUser?.profile?.id;
            const isMine = (riderUid && o.riderId === riderUid) || (o.assignedRider && o.assignedRider.toLowerCase() === currentEmail);
            
            // Improved Timestamp Candidate Selection
            const rawTime = o.createdAt || o.timestamp || o.assignedAt || o.placedAt;
            let orderTime = 0;
            if (rawTime) {
                const parsed = new Date(rawTime).getTime();
                if (!isNaN(parsed)) orderTime = parsed;
            }

            const isFresh = orderTime > (Date.now() - (24 * 60 * 60 * 1000));
            const isActive = status !== "delivered" && status !== "cancelled";

            // HARD FILTER: Ignore orders older than 48 hours for the Active view, even if status is wrong
            // Also flag as ghost if no timestamp exists for a very long time (fallback check)
            const isGhost = (orderTime > 0 && orderTime < (Date.now() - (48 * 60 * 60 * 1000))) || (!orderTime && isActive);
            
            if (isGhost && isActive) {
                console.warn(`[Sync] Detected Ghost Order #${id} (${outletId}) - Stale for ${Math.round((Date.now() - orderTime) / 3600000)}h. Skipping.`);
            }

            allRelevantOrders.push({ id, outletId, order: o, isMine, isActive, isFresh, isGhost, orderTime, status });
        });
    });

    // Sort all by time descending
    allRelevantOrders.sort((a, b) => b.orderTime - a.orderTime);

    // Identify the TRUE active order (Weighted by progress status)
    if (!sliderState.isDragging) {
        // Calculate status weights for prioritization
        const getWeight = (status) => {
            const s = (status || "").toLowerCase();
            if (s === "reached drop location") return 4;
            if (s === "picked up" || s === "out for delivery") return 3;
            if (s === "arrived at restaurant" || s === "arrived at outlet") return 2;
            if (["ready", "cooked", "packed", "waiting for pickup", "accepted"].includes(s)) return 1;
            return 0;
        };

        const activeCandidate = allRelevantOrders
            .filter(item => item.isMine && item.isActive && !item.isGhost)
            .sort((a, b) => getWeight(b.status) - getWeight(a.status) || b.orderTime - a.orderTime)[0];

        if (activeCandidate) {
            window.activeOrderId = activeCandidate.id;
            window.activeOrderOutlet = activeCandidate.outletId;
            window.activeOrderData = activeCandidate.order;
        } else {
            window.activeOrderId = null;
            window.activeOrderOutlet = null;
            window.activeOrderData = null;
        }
    }

    // 2. Second Pass: Render the lists
    allRelevantOrders.forEach(item => {
        const { id, outletId, order: o, isMine, isActive, isFresh, isGhost, status } = item;
        
        // HARD SKIP for Ghost orders or stale non-active items
        if (isGhost || (!isActive && !isFresh)) return;

        // 1. UNASSIGNED - STRICT FILTERING
        const allowedUnassignedStatus = ["ready", "cooked", "packed"];
        if (!o.assignedRider && allowedUnassignedStatus.includes(status)) {
            console.log(`[RiderUI] Rendering Unassigned Order #${id} | Status: ${status}`);
            // Ping Modal logic for VERY fresh orders (2 hours)
            const isPingFresh = item.orderTime > (Date.now() - (2 * 60 * 60 * 1000));

            if (isPingFresh && !window.activeOrderId && !window.ignoredPings.has(id)) {
                if (!window._pingCandidate) {
                    window._pingCandidate = { id, outletId, order: o };
                }
            }
                const safeOrderId = escapeHtml((o.orderId || id.slice(-6)).toUpperCase());
                const safeAddress = escapeHtml(o.address || 'Unknown');
                const safeFee = escapeHtml(String(o.deliveryFee || 0));
                const safeTotal = escapeHtml(String(o.total || 0));
                const safeId = escapeHtml(id);
                const safeOutlet = escapeHtml(outletId);
                const statusLabel = (status === "ready" || status === "cooked" || status === "packed") ? "READY" : "PREPARING";
                
                const outletName = outletId === 'pizza' ? 'Pizza' : 'Cake';
                const outletIcon = outletId === 'pizza' ? '🍕' : '🎂';
                
                unassignedRows += `
                    <tr>
                        <td>
                            <div style="display:flex; flex-direction:column; gap:4px;">
                                <span class="order-id">#${safeOrderId}</span>
                                <span class="outlet-badge ${safeOutlet}">${outletIcon} ${outletName}</span>
                            </div>
                        </td>
                        <td><span class="rider-status-pill">${statusLabel}</span></td>
                        <td class="address-cell">${safeAddress}</td>
                        <td class="text-success font-bold">₹${safeFee}</td>
                        <td class="font-bold">₹${safeTotal}</td>
                        <td><button class="btn-primary" data-action="accept" data-id="${safeId}" data-outlet="${safeOutlet}">ACCEPT</button></td>
                    </tr>
                `;

                unassignedCards += `
                    <div class="order-card-compact animate-fade-in">
                        <div class="card-header">
                            <div class="order-meta">
                                <span class="order-id-badge">#${safeOrderId}</span>
                                <span class="outlet-badge ${safeOutlet}">${outletIcon} ${outletName}</span>
                            </div>
                            <span class="rider-status-pill">${statusLabel}</span>
                        </div>
                        <div class="address-line">
                            <i data-lucide="map-pin"></i>
                            <span>${safeAddress}</span>
                        </div>
                        <div class="card-footer">
                            <div class="price-info">
                                <div class="text-muted-small">Your Pay</div>
                                <div class="earn-badge">₹${safeFee}</div>
                            </div>
                            <button class="btn-primary" data-action="accept" data-id="${safeId}" data-outlet="${safeOutlet}" style="padding: 10px 20px;">ACCEPT</button>
                        </div>
                    </div>
                `;
                unassignedCount++;
            }
        else if (!o.assignedRider && (status === "preparing" || status === "confirmed" || status === "cooking")) {
            // Silently skip - order is not yet ready for pickup
        }
        // 2. ACTIVE (Assigned to me and not delivered)
        else if (isActive && isMine && !isGhost) {

                const cName = o.customerName || 'Customer';
                const cAdd = o.address || 'Location Details';
                const cPhone = (o.customerPhone || o.phone || '').replace(/\D/g, '').slice(-10);
                const oId = (o.orderId || id.slice(-6)).toUpperCase();

                const safeName = escapeHtml(cName);
                const safeAdd = escapeHtml(cAdd);
                const safeStatus = escapeHtml(o.status.toUpperCase());
                const safePhone = escapeHtml(cPhone);
                const safeOrderId = escapeHtml(oId);
                const initial = escapeHtml(cName.charAt(0).toUpperCase());
                const safeId = escapeHtml(id);
                const safeOutlet = escapeHtml(outletId);

                const itemsList = (o.normalizedItems || o.items || []).map(i => 
                    `<div class="pickup-item-row">• ${escapeHtml(i.name || i.item)} (${escapeHtml(i.size)}) x${i.qty || i.quantity}</div>`
                ).join('');

                // Step Progress Component (Phase 3.3)
                const steps = [
                    { label: 'ACCEPTED', icon: 'check-circle' },
                    { label: 'PICKUP', icon: 'package' },
                    { label: 'TRANSIT', icon: 'navigation' },
                    { label: 'DROP', icon: 'map-pin' }
                ];

                let currentStep = 0;
                const statusLower = (o.status || "").toLowerCase();
                
                if (statusLower === "reached drop location") currentStep = 3;
                else if (statusLower === "picked up" || statusLower === "out for delivery") currentStep = 2;
                else if (statusLower === "arrived at restaurant" || statusLower === "arrived at outlet") currentStep = 1;
                else if (["ready", "cooked", "packed", "waiting for pickup"].includes(statusLower)) currentStep = 0; 
                else currentStep = 0; 

                const outletCoords = window.outletCoords[outletId] || { lat: 0, lng: 0 };
                const restaurantCoords = `${outletCoords.lat},${outletCoords.lng}`;
                const customerCoords = o.lat && o.lng ? `${o.lat},${o.lng}` : encodeURIComponent(o.address || "");

                const stepsHtml = steps.map((s, idx) => {
                    let cls = "";
                    if (idx < currentStep) cls = "completed";
                    else if (idx === currentStep) cls = "active";
                    return `
                        <div class="step-item ${cls}">
                            <div class="step-circle">${idx < currentStep ? '<i data-lucide="check" style="width:16px;"></i>' : idx + 1}</div>
                            <div class="step-label">${s.label}</div>
                        </div>
                    `;
                }).join('');

                // ZOMATO STYLE TASK CARD (Phase 4.0)
                let taskIcon = "map-pin";
                let taskTitle = "";
                let taskSubtitle = "";
                let sliderText = "";
                let sliderAction = "";
                let mapUrl = "";
                if (currentStep === 0) {
                    taskTitle = `Heading to ${safeOutlet.toUpperCase()} OUTLET`;
                    taskSubtitle = "Navigate to restaurant to pick up order";
                    sliderText = "SLIDE TO REACH OUTLET";
                    sliderAction = "reached-outlet";
                    taskIcon = "building-2";
                    mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${restaurantCoords}`;
                } else if (currentStep === 1) {
                    taskTitle = "At Restaurant";
                    taskSubtitle = "Check items and pick up order";
                    sliderText = "SLIDE TO PICK UP";
                    sliderAction = "pickup";
                    taskIcon = "package";
                    mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${restaurantCoords}`;
                } else if (currentStep === 2) {
                    taskTitle = `Delivering to ${safeName}`;
                    taskSubtitle = safeAdd;
                    sliderText = "SLIDE TO REACH CUSTOMER";
                    sliderAction = "drop";
                    taskIcon = "navigation-2";
                    mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${customerCoords}`;
                } else if (currentStep === 3) {
                    taskTitle = "At Customer Location";
                    taskSubtitle = "Collect payment and verify OTP";
                    sliderText = "ENTER DELIVERY OTP";
                    sliderAction = "otp";
                    taskIcon = "shield-check";
                    mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${customerCoords}`;
                }

                const zomatoCard = `
                    <div class="zomato-task-card">
                        <div class="task-meta">
                            <span class="task-id">ORDER #${safeOrderId}</span>
                            <span class="task-type-badge">${safeOutlet}</span>
                        </div>
                        
                        <div class="task-location-box">
                            <div class="loc-icon-wrapper">
                                <i data-lucide="${taskIcon}"></i>
                            </div>
                            <div class="loc-details">
                                <h4>${taskTitle}</h4>
                                <p>${taskSubtitle}</p>
                            </div>
                        </div>

                        ${currentStep === 1 ? `
                        <div class="item-checklist">
                            <div class="checklist-title">Verify Items</div>
                            ${(o.normalizedItems || o.items || []).map(i => `
                                <div class="check-item">
                                    <input type="checkbox" id="check-${i.item || i.name}">
                                    <label for="check-${i.item || i.name}">${i.name || i.item} (${i.size}) x${i.qty || i.quantity}</label>
                                </div>
                            `).join('')}
                        </div>
                        ` : ''}

                        <div class="action-grid mb-15">
                            <button class="action-pill" data-action="call" data-phone="${safePhone}"><i data-lucide="phone"></i>CALL</button>
                            <button class="action-pill" data-action="msg" data-phone="${safePhone}" data-orderid="${safeOrderId}"><i data-lucide="message-circle"></i>CHAT</button>
                            <button class="action-pill premium" data-action="navigate" data-url="${mapUrl}">
                                <i data-lucide="map"></i>NAVIGATE
                            </button>
                        </div>

                        ${currentStep === 3 ? `
                            <button class="btn-primary full-width" data-action="otp" data-id="${safeId}" data-outlet="${safeOutlet}">
                                <i data-lucide="key-round"></i> ENTER OTP
                            </button>
                        ` : `
                            <div class="slide-action-container" id="slider-${safeId}" data-id="${safeId}" data-outlet="${safeOutlet}" data-action="${sliderAction}">
                                <div class="slide-bg-fill"></div>
                                <div class="slide-text">${sliderText}</div>
                                <div class="slide-handle">
                                    <i data-lucide="chevrons-right"></i>
                                </div>
                            </div>
                        `}
                    </div>
                `;

                const activeContent = `
                    <div class="active-delivery-card-premium">
                        <div class="step-progress-container" style="background:transparent;box-shadow:none;padding:0;margin-bottom:15px;">
                            ${stepsHtml}
                        </div>
                        ${zomatoCard}
                    </div>
                `;

                dashboardActiveView.innerHTML = activeContent;
                if (activeOrderView) {
                    activeOrderView.innerHTML = `
                        <div class="order-details-panel">
                            ${activeContent}
                        </div>
                    `;
                }

                // Initialize Active Map if viewing active section
                if (document.getElementById('sec-active').classList.contains('active')) {
                    setTimeout(() => window.initActiveMap(o), 200);
                }
            }
            // 3. HISTORY
            else if (status === "delivered" && isMine) {
                const fee = Number(o.deliveryFee || 0);
                const orderTotal = Number(o.total || 0);
                const isToday = (o.deliveredAt || 0) >= startOfToday;
                const isCash = (o.paymentMethod || "").toUpperCase() === "CASH";

                if (isToday) {
                    todayOrders++;
                    todayPay += fee;
                    if (outletId === 'pizza') pizzaToday += fee;
                    else if (outletId === 'cake') cakeToday += fee;
                }

                if (outletId === 'pizza') pizzaEarnings += fee;
                else if (outletId === 'cake') cakeEarnings += fee;

                if (isCash && !o.settled) totalCashToSettle += orderTotal;

                const oId = (o.orderId || id.slice(-6)).toUpperCase();
                const dTime = o.deliveredAt ? new Date(o.deliveredAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
                const safeAddress = escapeHtml(o.address || '---');
                
                const outletName = outletId === 'pizza' ? 'Pizza' : 'Cake';
                const outletIcon = outletId === 'pizza' ? '🍕' : '🎂';

                // Calculate metrics if not stored
                const tripDuration = o.tripDuration || window.calculateDuration(o.pickedUpAt, o.deliveredAt);
                let tripDistance = o.tripDistance;
                if (!tripDistance && o.lat && o.lng && window.outletCoords[outletId]) {
                    const d = window.getDistance(window.outletCoords[outletId].lat, window.outletCoords[outletId].lng, o.lat, o.lng);
                    tripDistance = d.toFixed(1) + " km";
                }
                tripDistance = tripDistance || "---";

                historyRows += `
                    <tr>
                        <td>
                            <div style="display:flex; flex-direction:column; gap:4px;">
                                <span class="order-id">#${oId}</span>
                                <span class="outlet-badge ${outletId}">${outletIcon} ${outletName}</span>
                            </div>
                        </td>
                        <td><span class="text-muted-small">${dTime}</span></td>
                        <td><span class="text-muted-small">${tripDistance}</span></td>
                        <td><span class="text-muted-small">${tripDuration}</span></td>
                        <td class="text-success font-bold">₹${fee}</td>
                        <td><span class="rider-status-pill">DONE</span></td>
                    </tr>
                `;

                historyCards += `
                    <div class="order-card-compact history-card-premium">
                        <div class="card-header">
                            <div class="order-meta">
                                <span class="order-id-badge">#${oId}</span>
                                <span class="outlet-badge ${outletId}">${outletIcon} ${outletName}</span>
                            </div>
                            <span class="rider-status-pill">DONE</span>
                        </div>
                        
                        <div class="card-body-metrics">
                            <div class="metric-item">
                                <i data-lucide="calendar"></i>
                                <span>${dTime}</span>
                            </div>
                            <div class="metric-item">
                                <i data-lucide="map-pin"></i>
                                <span class="truncate-address">${safeAddress}</span>
                            </div>
                            <div class="metrics-grid">
                                <div class="metric-sub">
                                    <i data-lucide="navigation"></i>
                                    <span>${tripDistance}</span>
                                </div>
                                <div class="metric-sub">
                                    <i data-lucide="clock"></i>
                                    <span>${tripDuration}</span>
                                </div>
                            </div>
                        </div>

                        <div class="card-footer">
                            <div class="price-info">
                                <span class="label">Total Earnings</span>
                                <span class="value">₹${fee}</span>
                            </div>
                        </div>
                    </div>
                `;
                historyCount++;
            }
        });


    // Final Render for Pickup Section
    if (unassignedCount > 0) {
        unassignedList.innerHTML = `
            <div class="premium-table-wrapper">
                <table class="premium-table">
                    <thead>
                        <tr>
                            <th>ORDER / OUTLET</th>
                            <th>STATUS</th>
                            <th>DESTINATION</th>
                            <th>EARN</th>
                            <th>TOTAL</th>
                            <th>ACTION</th>
                        </tr>
                    </thead>
                    <tbody>${unassignedRows}</tbody>
                </table>
            </div>
            <div class="order-card-grid">
                ${unassignedCards}
            </div>
        `;
    } else {
        unassignedList.innerHTML = `
            <div class="glass-panel empty-state-glass animate-fade-in">
                <i data-lucide="package-search" style="width:48px; height:48px; margin-bottom:15px; opacity:0.5;"></i>
                <p>No new orders available right now.</p>
                <span class="text-muted-small">Pull down to check for new tasks</span>
            </div>
        `;
    }

    // Trigger Ping Modal if not currently active
    const pingModal = document.getElementById('newOrderPingModal');
    if (!window.activeOrderId && window._pingCandidate && pingModal && pingModal.classList.contains('hidden')) {
        window.showPingModal(window._pingCandidate.id, window._pingCandidate.outletId, window._pingCandidate.order);
    } else if (window.activeOrderId && pingModal && !pingModal.classList.contains('hidden')) {
        window.hidePingModal();
    }

    // Final Render for History
    if (historyList) {
        if (historyCount > 0) {
            historyList.innerHTML = `
                <div class="premium-table-wrapper">
                    <table class="premium-table">
                        <thead>
                            <tr>
                                <th>ORDER</th>
                                <th>DATE</th>
                                <th>DIST</th>
                                <th>TIME</th>
                                <th>EARNED</th>
                                <th>STATUS</th>
                            </tr>
                        </thead>
                        <tbody>${historyRows}</tbody>
                    </table>
                </div>
                <div class="order-card-grid">
                    ${historyCards}
                </div>
            `;
        } else {
            historyList.innerHTML = `
                <div class="glass-panel empty-state-glass">
                    <p>No delivery history yet.</p>
                </div>
            `;
        }
    }

    // Update Badges & Stats
    if (pickupBadge) {
        pickupBadge.textContent = unassignedCount;
        pickupBadge.style.display = unassignedCount > 0 ? 'flex' : 'none';
    }
    const pCountEl = document.getElementById('pickupCount');
    if (pCountEl) pCountEl.innerText = `${unassignedCount} Orders`;

    document.getElementById('stats-delivered').innerText = todayOrders;
    document.getElementById('stats-earnings').innerText = `₹${todayPay.toLocaleString()}`;
    
    if (document.getElementById('e-total')) document.getElementById('e-total').innerText = `₹${totalCashToSettle.toLocaleString()}`;
    if (document.getElementById('e-pizza')) document.getElementById('e-pizza').innerText = `₹${pizzaEarnings.toLocaleString()}`;
    if (document.getElementById('e-cake')) document.getElementById('e-cake').innerText = `₹${cakeEarnings.toLocaleString()}`;
    if (document.getElementById('e-pizza-today')) document.getElementById('e-pizza-today').innerText = `₹${pizzaToday.toLocaleString()}`;
    if (document.getElementById('e-cake-today')) document.getElementById('e-cake-today').innerText = `₹${cakeToday.toLocaleString()}`;

    // Refresh Icons
    if (window.lucide) {
        window.lucide.createIcons({ root: unassignedList });
        if (historyList) window.lucide.createIcons({ root: historyList });
        if (dashboardActiveView) window.lucide.createIcons({ root: dashboardActiveView });
        if (activeOrderView) window.lucide.createIcons({ root: activeOrderView });
    }

    // Global slider is already initialized via event delegation

};

document.addEventListener('DOMContentLoaded', () => {
    // Nav Click Listeners
    document.querySelectorAll('[data-section]').forEach(el => el.addEventListener('click', e => {
        e.preventDefault(); window.showSection(el.getAttribute('data-section'));
    }));

    // Header & Sidebar
    document.getElementById('mobileMenuBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.toggleRiderSidebar();
    });
    document.getElementById('sidebarOverlay')?.addEventListener('click', window.toggleRiderSidebar);
    document.getElementById('statusToggleBtn')?.addEventListener('click', window.toggleRiderStatus);
    document.getElementById('logoutBtn')?.addEventListener('click', window.logout);

    // Profile Actions
    document.getElementById('btn-toggle-aadhar')?.addEventListener('click', window.toggleAadharView);

    // Order Actions (Event Delegation)
    document.getElementById('unassignedOrdersList')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="accept"]');
        if (btn) window.acceptOrder(btn.dataset.id, btn.dataset.outlet);
    });

    document.getElementById('notifList')?.addEventListener('click', (e) => {
        const item = e.target.closest('[data-action="markNotifRead"]');
        if (item) window.markNotifRead(item.dataset.id);
    });

    const handleActiveAction = (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'call') window.open(`tel:${btn.dataset.phone}`, '_blank', 'noopener,noreferrer');
        else if (action === 'msg') window.triggerWhatsAppAlert(btn.dataset.phone, btn.dataset.orderid, 'PICKED_UP', {}, true);
        else if (action === 'otp') window.openOTPPanel();
        else if (action === 'pickup') window.confirmPickup();
        else if (action === 'accept') window.acceptOrder(btn.dataset.id, btn.dataset.outlet);
        else if (action === 'navigate') window.open(btn.dataset.url, '_blank', 'noopener,noreferrer');
        else if (action === 'drop') window.reachedDropLocation(btn.dataset.id, btn.dataset.outlet);
        else if (action === 'reached-outlet') window.reachedOutlet(btn.dataset.id, btn.dataset.outlet);
    };

    document.getElementById('dashboardActiveDeliveryView')?.addEventListener('click', handleActiveAction);
    document.getElementById('activeOrderView')?.addEventListener('click', handleActiveAction);

    // Modals
    document.getElementById('btnConfirmPickup')?.addEventListener('click', window.confirmPickup);
    document.getElementById('btnConfirmOTP')?.addEventListener('click', window.verifyOTP);
    document.getElementById('btnCloseOTP')?.addEventListener('click', window.closeOTPPanel);
    document.getElementById('btnResendOTP')?.addEventListener('click', window.regenerateOTP);
    document.getElementById('emergencyBtn')?.addEventListener('click', window.emergencyOverride);
    document.getElementById('btnCancelPayment')?.addEventListener('click', () => {
        document.getElementById('paymentPanel').classList.remove('active');
        window.activeOrderForPayment = null;
    });

    document.querySelectorAll('.payment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const method = btn.dataset.method;
            window.recordPaymentAndComplete(method);
        });
    });

    // Login & Sync Actions
    document.getElementById('loginBtn')?.addEventListener('click', window.login);
    document.getElementById('btnRefreshApp')?.addEventListener('click', (e) => {
        console.log("[UI] Nuclear Refresh Triggered via Button");
        window.completeSiteRefresh();
    });
    
    // Auto-refresh listeners every 10 minutes to ensure no stale connections
    setInterval(() => {
        console.log("[Sync] Performing scheduled listener refresh...");
        window.clearAllListeners();
        window.initRealtimeListeners();
    }, 600000);

    const dateOpts = { month: 'long', day: 'numeric', year: 'numeric' };
    const dateEl = document.getElementById('currentDate');
    if (dateEl) dateEl.innerText = new Date().toLocaleDateString('en-US', dateOpts);
    
    if (window.lucide) window.lucide.createIcons();

    // Pull to Refresh Logic
    let touchStart = 0;
    const ptr = document.getElementById('ptrIndicator');
    const PTR_THRESHOLD = 150; // Increased threshold for lower sensitivity
    
    window.addEventListener('touchstart', e => {
        if (window.scrollY === 0) touchStart = e.touches[0].pageY;
    }, { passive: true });

    window.addEventListener('touchmove', e => {
        if (touchStart === 0) return;
        const touch = e.touches[0].pageY;
        const diff = touch - touchStart;
        
        // Only start showing indicator if pull is at least 30px
        if (diff > 30 && window.scrollY === 0) {
            ptr.classList.add('active');
            const rotation = Math.min(diff * 2, 360);
            ptr.style.transform = `translateX(-50%) translateY(${Math.min(diff/2, 60)}px) rotate(${rotation}deg)`;
            
            if (diff > PTR_THRESHOLD) {
                ptr.classList.add('refreshing');
                if (!ptr._haptic) { window.haptic(30); ptr._haptic = true; }
            } else {
                ptr.classList.remove('refreshing');
                ptr._haptic = false;
            }
        }
    }, { passive: true });

    window.addEventListener('touchend', e => {
        const touchEnd = e.changedTouches[0].pageY;
        if (touchEnd - touchStart > PTR_THRESHOLD && window.scrollY === 0) {
            console.log("[UI] Gesture Refresh Triggered");
            window.completeSiteRefresh();
        } else {
            ptr.classList.remove('active', 'refreshing');
            ptr.style.transform = '';
            ptr._haptic = false;
        }
        touchStart = 0;
    });

    // History Search
    document.getElementById('historySearch')?.addEventListener('input', (e) => {
        const term = (e.target.value || '').toLowerCase().trim();
        document.querySelectorAll('#completedOrdersList tbody tr').forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    });
});

window.hideLoader = () => {
    const loader = document.getElementById('initial-loader');
    if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => loader.classList.add('hidden'), 400);
    }
};

onAuthStateChanged(auth, async user => {
    const dashboard = document.getElementById('dashboard');
    const authSection = document.getElementById('auth-section');

    if (!user) {
        localStorage.removeItem('isLoggedIn');
        if (dashboard) dashboard.classList.add('hidden');
        if (authSection) authSection.classList.remove('hidden');
        window.hideLoader();
        return;
    }

    // Optimization: Skip re-init if user is same and already loaded
    if (window.currentUser && window.currentUser.uid === user.uid && !dashboard.classList.contains('hidden')) {
        console.log("[Auth] Session stable. Skipping redundant init.");
        window.hideLoader();
        return;
    }

    if (authSection) authSection.classList.add('hidden');

    try {
        const profileRef = ref(db, `riders/${user.uid}`);
        const snap = await get(profileRef);
        
        if (!snap.exists()) {
            console.error(`[Auth] No rider profile found for UID: ${user.uid} (${user.email})`);
            window.showToast("Your account is not registered as a Rider. Contact Admin.", "error");
            setTimeout(() => signOut(auth), 3000);
            window.hideLoader();
            return;
        }

        const profileData = snap.val();
        currentUser = { ...user, profile: { id: user.uid, ...profileData } };
        window.currentUser = currentUser;

        const pName = currentUser.profile.name || "Boss";
        document.getElementById('profileName').innerText = pName;
        document.getElementById('r-name').innerText = pName;
        document.getElementById('sidebar-name').innerText = pName;
        document.getElementById('sidebar-id').innerText = `RID-${user.uid.slice(0, 6).toUpperCase()}`;

        document.getElementById('r-father-name').innerText = window.currentUser.profile.fatherName || '---';
        document.getElementById('r-age').innerText = window.currentUser.profile.age || '---';
        document.getElementById('r-aadhar-no').innerText = window.currentUser.profile.aadharNo ? 'XXXXXXXX' + window.currentUser.profile.aadharNo.slice(-4) : '---';
        document.getElementById('r-qualification').innerText = window.currentUser.profile.qualification || '---';
        document.getElementById('r-address').innerText = window.currentUser.profile.address || '---';

        if (window.currentUser.profile.profilePhoto) document.getElementById('r-profile-img').src = window.currentUser.profile.profilePhoto;

        // Sync Status Button
        const status = profileData.status || "Offline";
        const btn = document.getElementById('statusToggleBtn');
        if (btn) {
            btn.className = `status-pill ${status.toLowerCase()}`;
            btn.querySelector('span').innerText = status.toUpperCase();
        }

        await loadOutletCoords();
        window.clearAllListeners();
        initLocationTracking();
        initRealtimeListeners();
        setupPushNotifications(user.uid);

        if (dashboard) dashboard.classList.remove('hidden');
        window.showSection('home');
        if (window.lucide) window.lucide.createIcons({ root: dashboard || document.body });
        
        // Hide loader after everything is ready
        setTimeout(window.hideLoader, 300);
    } catch (e) { 
        console.error(e);
        window.hideLoader();
    }
});

// Realtime Connection Monitoring
let isFirstConnect = true;
onValue(ref(db, '.info/connected'), (snap) => {
    if (snap.val() === true) {
        console.log("[Firebase] Database Connected");
        if (!isFirstConnect) window.showToast("Connection Restored", "success");
        isFirstConnect = false;
    } else {
        if (!isFirstConnect) {
            console.warn("[Firebase] Database Disconnected");
            window.showToast("Connection Lost. Reconnecting...", "warning");
        }
    }
});

window.initGlobalSlider();
window.updateRiderPerformanceUI = () => { }; 

// LEGACY COMPATIBILITY SHIMS (Prevents crashes in cached environments)
window.initPingCheck = window.initPingCheck || (() => console.log("[System] initPingCheck shim executed"));
window.initSlideToActions = window.initSlideToActions || (() => console.log("[System] initSlideToActions shim executed"));


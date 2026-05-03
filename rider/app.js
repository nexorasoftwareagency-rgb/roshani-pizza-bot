import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, onValue, get, set, update, runTransaction, query, orderByChild, equalTo, off, serverTimestamp, remove, limitToLast } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
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

// NUCLEAR REFRESH CIRCUIT BREAKER
window.completeSiteRefresh = async () => {
    window.haptic(20);
    window.showToast("Initializing Deep Refresh...", "info");
    
    try {
        // 1. Unregister all service workers
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
            }
        }

        // 2. Clear all caches
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            for (let name of cacheNames) {
                await caches.delete(name);
            }
        }

        // 3. Clear storage data that might be stuck
        sessionStorage.clear();
        localStorage.removeItem('activeOrderId');
        localStorage.removeItem('activeOrderData');
        
        window.showToast("Caches Purged. Reloading...", "success");

        // Force reload from server with cache-busting query
        setTimeout(() => {
            window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now();
        }, 1000);

    } catch (err) {
        console.error("Refresh failed:", err);
        window.location.reload();
    }
};

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Use cache-busting for SW registration itself
        navigator.serviceWorker.register('sw.js?v=4.4.3').catch(err => console.error('SW failed', err));
    });
}

// Bind Refresh Button
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('btnRefreshApp');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.completeSiteRefresh();
        });
    }
});

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
window.activeOrderData = null;
window.activeOrderId = null;
window.activeOrderOutlet = null;
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

window.triggerWhatsAppAlert = (phone, orderId, actionType, extraData = {}) => {
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
    else if (actionType === "SEND_OTP") {
        message = `Your Roshani Sudha order #${orderId} has arrived! 📍 \n\nTo safely receive your order, please provide this 4-digit OTP to the rider: *${extraData.otp}* ✅`;
    }
    else if (actionType === "ARRIVED") {
        message = `I have arrived with your order #${orderId}! Please have your 4-digit OTP ready. ✅`;
    }

    const url = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
};

function resolvePath(path, outlet = null) {
    if (!path) return "";
    const sharedNodes = ['admins', 'migrationStatus', 'riders', 'riderStats', 'logs', 'errorLogs'];
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
        showToast(`${payload.notification.title}: ${payload.notification.body}`, "info");
        try { new Audio('/notification.mp3').play().catch(() => { }); } catch (e) { }
    }
});

// NAVIGATION
window.toggleRiderSidebar = () => {
    window.haptic(10);
    const nav = document.getElementById('sidebarNav');
    const overlay = document.getElementById('sidebarOverlay');
    if (!nav) return;

    if (window.innerWidth > 1024) document.body.classList.toggle('sidebar-collapsed');
    else {
        const isActive = nav.classList.toggle('active');
        if (overlay) overlay.classList.toggle('active', isActive);
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
    if (window.lucide) lucide.createIcons();

    // Re-init map if switching to active section
    if (sectionId === 'active' && window.activeOrderData) {
        setTimeout(() => window.initActiveMap(window.activeOrderData), 200);
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
    } catch (e) {
        console.error("Login Error:", e);
        let msg = "Authentication failed. Check credentials.";
        if (e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
            msg = "Incorrect mobile number or password.";
        } else if (e.code === 'auth/too-many-requests') {
            msg = "Too many failed attempts. Try again later.";
        } else if (e.code === 'auth/network-request-failed') {
            msg = "Network error. Check internet connection.";
        } else if (e.code === 'auth/api-key-expired') {
            msg = "System Error: API Key Expired. Contact Admin.";
        }
        
        const errEl = document.getElementById('loginError');
        if (errEl) { 
            errEl.innerText = msg; 
            errEl.classList.remove('hidden'); 
        }
        window.showToast(msg, "error");
    }
};

window.completeSiteRefresh = async () => {
    window.showToast("Initializing Deep Refresh...", "info");
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20);
    
    try {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
            }
        }
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            for (let name of cacheNames) {
                await caches.delete(name);
            }
        }
        window.showToast("Caches Purged. Reloading...", "success");
        setTimeout(() => {
            window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now();
        }, 800);
    } catch (e) {
        window.location.reload();
    }
};

// PULL TO REFRESH (MOBILE)
let touchStart = -1;
window.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) touchStart = e.touches[0].pageY;
    else touchStart = -1;
}, { passive: true });

window.addEventListener('touchend', (e) => {
    if (touchStart === -1) return;
    const touchEnd = e.changedTouches[0].pageY;
    if (window.scrollY === 0 && touchEnd - touchStart > 180) {
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
        window.location.reload();
    }
};

window.toggleRiderStatus = async () => {
    if (!window.currentUser || !window.currentUser.profile) return window.showToast("Authentication error. Please login again.", "error");
    if (window.currentUser.profile.isAdmin) return window.showToast("Status toggle disabled for Admin.", "warning");
    const newStatus = window.currentUser.profile.status === "Online" ? "Offline" : "Online";
    try {
        await update(ref(db, resolvePath(`riders/${window.currentUser.profile.id}`)), { status: newStatus, lastSeen: serverTimestamp() });
        window.currentUser.profile.status = newStatus;

        const dot = document.querySelector('.pulse-dot');
        const txt = document.getElementById('statusBadge');
        if (dot) dot.className = `pulse-dot ${newStatus}`;
        if (txt) { txt.innerText = newStatus.toUpperCase(); txt.className = `status-text ${newStatus}`; }

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
    if (!window.activeOrderId) return;
    const orderPath = `${window.activeOrderOutlet || 'pizza'}/orders/${window.activeOrderId}`;
    try {
        await update(ref(db, orderPath), { status: "Picked Up", pickedUpAt: serverTimestamp() });
        window.showToast("Order Picked Up! Drive safe. 🛵", "success");
        
        // Auto-switch to LIVE section & start navigation
        window.showSection('active');
        window.startNavigation(window.activeOrderId, window.activeOrderOutlet);
    } catch (e) {
        logError("confirmPickup", e);
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
        if (window.lucide) lucide.createIcons();
        return;
    }

    list.innerHTML = notifs.map(([id, n]) => `
        <div class="notif-item ${n.read ? '' : 'unread'}" onclick="window.markNotifRead('${id}')">
            <div class="notif-icon ${n.type || 'info'}">
                <i data-lucide="${n.icon || 'bell'}"></i>
            </div>
            <div class="notif-body">
                <h4>${n.title}</h4>
                <p>${n.body}</p>
                <span class="notif-time">${new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            ${!n.read ? '<div class="unread-dot"></div>' : ''}
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
};

window.markNotifRead = async (id) => {
    const riderId = window.currentUser.profile.id;
    await update(ref(db, `riders/${riderId}/notifications/${id}`), { read: true });
};

window.clearAllNotifications = async () => {
    if (!confirm("Clear all notifications?")) return;
    const riderId = window.currentUser.profile.id;
    await remove(ref(db, `riders/${riderId}/notifications`));
    window.showToast("Notifications cleared", "success");
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
    document.getElementById('otpPanel').classList.remove('hidden');

    const emergencyBtn = document.getElementById('emergencyBtn');
    if (emergencyBtn) emergencyBtn.classList.toggle('hidden', !(currentUser && currentUser.profile && currentUser.profile.isAdmin));

    if (window.activeOrderData) {
        const phone = window.activeOrderData.customerPhone || window.activeOrderData.phone;
        window.triggerWhatsAppAlert(phone, currentOrderId, "ARRIVED");
    }
};

window.closeOTPPanel = () => { document.getElementById('otpPanel').classList.add('hidden'); };

window.verifyOTP = async () => {
    window.haptic(25);
    const otp = document.getElementById('otpInput').value;
    if (!otp) return;

    const outletId = window._currentOrderOutlet || 'pizza';
    const otpAttemptsPath = `${outletId}/otpAttempts/${currentOrderId}`;
    const now = Date.now();

    try {
        const attemptsSnap = await get(ref(db, otpAttemptsPath));
        const userAttempts = attemptsSnap.val() || { count: 0, lastTry: 0, blockedUntil: 0 };

        if (userAttempts.blockedUntil > now) {
            const remaining = Math.ceil((userAttempts.blockedUntil - now) / 1000);
            return window.showToast(`Verification blocked! Try again in ${remaining}s`, "error");
        }

        const orderPath = `${outletId}/orders/${currentOrderId}`;
        const snap = await get(ref(db, orderPath));
        const order = snap.val();

        if (!order) return window.showToast("Order not found.", "error");

        const settingsSnap = await get(ref(db, `${outletId}/settings/Store`));
        const fallbackCode = (settingsSnap.val() || {}).deliveryBackupCode;

        const storedOTP = order.deliveryOTP || order.otp || order.otpCode;
        const matchesCustomer = String(otp).trim() === String(storedOTP).trim();
        const matchesFallback = fallbackCode && String(otp).trim() === String(fallbackCode).trim();

        if (matchesCustomer || matchesFallback) {
            await remove(ref(db, otpAttemptsPath));
            window.closeOTPPanel();
            
            // Success! Now ask for payment mode
            window.activeOrderForPayment = { path: orderPath, data: order, matchesFallback };
            document.getElementById('paymentTotalTxt').innerText = `Total to collect: ₹${order.total || 0}`;
            document.getElementById('paymentPanel').classList.remove('hidden');
            if (window.lucide) lucide.createIcons();
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
        }
    } catch (e) { console.error(e); window.showToast("System error during verification.", "error"); }
};

window.recordPaymentAndComplete = async (method) => {
    if (!window.activeOrderForPayment) return;
    const { path, data, matchesFallback } = window.activeOrderForPayment;
    
    try {
        await window.finalizeDeliverySequence(path, matchesFallback, data, method);
        document.getElementById('paymentPanel').classList.add('hidden');
        window.activeOrderForPayment = null;
    } catch (e) {
        window.showToast("Failed to complete delivery.", "error");
    }
};

window.finalizeDeliverySequence = async (orderPath, matchesFallback, order, paymentMethod = 'CASH') => {
    if (!window.currentUser || !window.currentUser.profile) return window.showToast("Authentication error. Please login again.", "error");
    
    const updates = { 
        status: "Delivered", 
        deliveredAt: serverTimestamp(), 
        verifiedBy: matchesFallback ? 'ADMIN_FALLBACK' : 'OTP', 
        paymentCollected: true,
        paymentMethod: paymentMethod.toUpperCase()
    };

    await update(ref(db, orderPath), updates);
    
    const riderId = window.currentUser.profile.id;
    const commission = Number(order.deliveryFee || 0);
    
    await runTransaction(ref(db, resolvePath(`riderStats/${riderId}`)), (current) => {
        if (!current) return { totalOrders: 1, totalEarnings: commission };
        return { ...current, totalOrders: (current.totalOrders || 0) + 1, totalEarnings: (current.totalEarnings || 0) + commission };
    });
    
    window.showSection('home');
    window.showToast(`Order delivered! Payment: ${paymentMethod} ✅`, "success");
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

// REALTIME LISTENERS & PREMIUM UI RENDERER
window.clearAllListeners = () => {
    if (window._activeListeners) {
        window._activeListeners.forEach(item => { try { if (item.ref && typeof item.ref.off === 'function') item.ref.off(); else if (item.ref && item.type === 'value') off(item.ref); } catch (e) { } });
        window._activeListeners = [];
    }
};

function initRealtimeListeners() {
    if (!currentUser || !currentUser.email) return;
    const currentEmail = currentUser.email.toLowerCase();

    ['pizza', 'cake'].forEach(outletId => {
        const ordersPath = `${outletId}/orders`;
        window.orderCache[outletId] = {};

        const updateCache = (data, filterType) => {
            Object.keys(window.orderCache[outletId]).forEach(id => {
                const order = window.orderCache[outletId][id];
                const isMine = (order.assignedRider || "").toLowerCase() === currentEmail;
                if (filterType === 'unassigned' && (!order.assignedRider)) delete window.orderCache[outletId][id];
                else if (filterType === 'mine' && isMine) delete window.orderCache[outletId][id];
            });
            Object.assign(window.orderCache[outletId], data);
            window.renderAllOrders();
        };

        const q1 = query(ref(db, ordersPath), orderByChild('assignedRider'), equalTo(null));
        window._activeListeners.push({ ref: q1, type: 'value' });
        onValue(q1, snap => updateCache(snap.val() || {}, 'unassigned'), error => {
            console.error(`[Firebase] Unassigned Read Error (${outletId}):`, error);
            if (error.code === 'PERMISSION_DENIED') {
                console.warn("Security Rules are blocking this rider from reading orders.");
            }
        });

        const q2 = query(ref(db, ordersPath), orderByChild('assignedRider'), equalTo(currentEmail));
        window._activeListeners.push({ ref: q2, type: 'value' });
        onValue(q2, snap => { 
            window._lastOrderCache = window.orderCache; 
            updateCache(snap.val() || {}, 'mine'); 
        }, error => {
            console.error(`[Firebase] Assigned Read Error (${outletId}):`, error);
        });
    });

    // Listen to Notifications
    const riderId = currentUser.profile.id;
    const notifPath = `riders/${riderId}/notifications`;
    const notifRef = ref(db, notifPath);
    window._activeListeners.push({ ref: notifRef, type: 'value' });
    onValue(notifRef, snap => {
        window.riderNotifications = snap.val() || {};
        window.renderNotifications();
    }, error => {
        console.error("[Firebase] Notification Read Error:", error);
    });
}

window.renderAllOrders = () => {
    const unassignedList = document.getElementById('unassignedOrdersList');
    const dashboardActiveView = document.getElementById('dashboardActiveDeliveryView');
    const activeOrderView = document.getElementById('activeOrderView');
    const pickupBadge = document.getElementById('navPickupBadge');

    if (!unassignedList || !dashboardActiveView || !window.currentUser) return;

    unassignedList.innerHTML = '';
    dashboardActiveView.innerHTML = '';
    if (activeOrderView) {
        activeOrderView.innerHTML = `
            <div class="glass-panel empty-state-glass">
                <p>No active trip currently.</p>
            </div>
        `;
    }

    let unassignedCount = 0;
    let todayOrders = 0; let todayPay = 0; let totalCash = 0;
    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).getTime();

    Object.keys(window.orderCache).forEach(outletId => {
        const orders = window.orderCache[outletId];
        Object.keys(orders).forEach(id => {
            const o = orders[id];
            if (!o) return;
            const status = (o.status || "").toLowerCase();
            const isMine = (window.currentUser && o.assignedRider) ? (o.assignedRider.toLowerCase() === window.currentUser.email.toLowerCase()) : false;

            if ((status === "ready" || status === "cooked") && !o.assignedRider) {
                const safeOrderId = escapeHtml((o.orderId || id.slice(-6)).toUpperCase());
                const safeAddress = escapeHtml(o.address || 'Unknown');
                const safeName = escapeHtml(o.customerName || 'Guest');
                const safePhone = escapeHtml(o.phone || o.customerPhone || 'N/A');
                const safeFee = escapeHtml(String(o.deliveryFee || 0));
                const safeTotal = escapeHtml(String(o.total || 0));
                const safeId = escapeHtml(id);
                const safeOutlet = escapeHtml(outletId);
                
                const itemsList = (o.normalizedItems || o.items || []).map(i => 
                    `<div class="pickup-item-row">• ${escapeHtml(i.name || i.item)} (${escapeHtml(i.size)}) x${i.qty || i.quantity}</div>`
                ).join('');

                unassignedList.innerHTML += `
                    <div class="order-card-premium">
                        <div class="incoming-request-header">
                            <div class="new-order-badge">AVAILABLE</div>
                            <div class="order-id-chip">#${safeOrderId}</div>
                        </div>
                        <div class="incoming-request-body">
                            <h3 class="rest-name">Drop-off: ${safeAddress}</h3>
                            <div class="customer-info-mini mt-10">
                                <p><strong>Customer:</strong> ${safeName}</p>
                                <p><strong>Phone:</strong> ${safePhone}</p>
                            </div>
                            <div class="pickup-items-list mt-10">
                                <p class="text-small font-bold mb-5 uppercase text-muted">Invoice Details:</p>
                                ${itemsList}
                            </div>
                            <div class="trip-summary-stats mt-15" style="background:#f8fafc; padding:10px; border-radius:10px;">
                                <div class="trip-stat">
                                    <span class="text-muted text-small font-bold uppercase">Earning</span><br>
                                    <span class="text-orange font-bold" style="font-size:1.2rem;">₹${safeFee}</span>
                                </div>
                                <div class="trip-stat">
                                    <span class="text-muted text-small font-bold uppercase">Collect</span><br>
                                    <span class="text-pink font-bold" style="font-size:1.2rem;">₹${safeTotal}</span>
                                </div>
                            </div>
                        </div>
                        <button class="btn-primary full-width mt-15" data-action="accept" data-id="${safeId}" data-outlet="${safeOutlet}">PICK UP ORDER</button>
                    </div>`;
                unassignedCount++;
            }
            else if (status !== "delivered" && isMine) {
                window.activeOrderId = id;
                window.activeOrderOutlet = outletId;
                window.activeOrderData = o;

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

                let actionButtons = "";
                const currentStatus = (o.status || "").toLowerCase();

                if (currentStatus === "ready" || currentStatus === "cooked" || currentStatus === "arriving at restaurant" || currentStatus === "confirmed") {
                    actionButtons = `<button class="btn-primary full-width mt-10" data-action="pickup" data-id="${safeId}" data-outlet="${safeOutlet}"><i data-lucide="package-check"></i> CONFIRM PICKUP</button>`;
                } else if (currentStatus === "picked up" || currentStatus === "out for delivery") {
                    actionButtons = `<button class="btn-primary full-width mt-10" style="background:#10B981;" data-action="navigate" data-id="${safeId}" data-outlet="${safeOutlet}"><i data-lucide="navigation"></i> LET'S GO TO DELIVER</button>`;
                }

                const activeContent = `
                    <div class="active-delivery-mock-card">
                        <div class="active-del-header">
                            <div class="active-del-title">Active Delivery <span class="text-muted text-small">#${safeOrderId}</span></div>
                            <div class="active-badge">1 ACTIVE TRIP</div>
                        </div>
                        <div class="customer-info-row">
                            <div class="cust-avatar">${initial}</div>
                            <div class="cust-details">
                                <h3>${safeName}</h3>
                                <p><i data-lucide="map-pin"></i> ${safeAdd}</p>
                                <p class="text-orange text-small mt-10 font-bold">${safeStatus}</p>
                            </div>
                        </div>
                        <div class="pickup-items-list mt-10" style="background:#f1f5f9; border-radius:10px; padding:10px;">
                            <p class="text-small font-bold mb-5 uppercase text-muted">Invoice Details:</p>
                            ${itemsList}
                        </div>
                        <div class="action-pill-row mt-15">
                            <button class="action-pill" data-action="call" data-phone="${safePhone}"><i data-lucide="phone"></i>CALL</button>
                            <button class="action-pill" data-action="msg" data-phone="${safePhone}" data-orderid="${safeOrderId}"><i data-lucide="message-circle"></i>MSG</button>
                            <button class="action-pill" data-action="otp"><i data-lucide="key-round"></i>OTP</button>
                        </div>
                        ${actionButtons}
                    </div>
                `;

                dashboardActiveView.innerHTML = activeContent;
                if (activeOrderView) activeOrderView.innerHTML = activeContent;
                
                // Initialize/Update Map if in LIVE section
                if (document.getElementById('sec-active').classList.contains('active')) {
                    setTimeout(() => window.initActiveMap(o), 100);
                }
            }
            else if (status === "delivered" && isMine) {
                const fee = Number(o.deliveryFee || 0);
                if ((o.deliveredAt || 0) >= startOfToday) { todayOrders++; todayPay += fee; }
                totalCash += fee;
            }
        });
    });

    if (pickupBadge) { 
        pickupBadge.innerText = unassignedCount; 
        pickupBadge.classList.toggle('hidden', unassignedCount === 0); 
    }
    const pCountEl = document.getElementById('pickupCount');
    if (pCountEl) pCountEl.innerText = `${unassignedCount} Orders`;

    document.getElementById('stats-delivered').innerText = todayOrders;
    document.getElementById('stats-earnings').innerText = `₹${todayPay.toLocaleString()}`;
    document.getElementById('e-total').innerText = `₹${totalCash.toLocaleString()}`;

    if (window.lucide) lucide.createIcons();
};

document.addEventListener('DOMContentLoaded', () => {
    // Nav Click Listeners
    document.querySelectorAll('[data-section]').forEach(el => el.addEventListener('click', e => {
        e.preventDefault(); window.showSection(el.getAttribute('data-section'));
    }));

    // Header & Sidebar
    document.getElementById('mobileMenuBtn')?.addEventListener('click', window.toggleRiderSidebar);
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

    document.getElementById('dashboardActiveDeliveryView')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'call') window.open(`tel:${btn.dataset.phone}`, '_blank', 'noopener,noreferrer');
        else if (action === 'msg') window.triggerWhatsAppAlert(btn.dataset.phone, btn.dataset.orderid, 'PICKED_UP');
        else if (action === 'otp') window.openOTPPanel();
        else if (action === 'pickup') window.confirmPickup();
        else if (action === 'accept') window.acceptOrder(btn.dataset.id, btn.dataset.outlet);
        else if (action === 'navigate') window.startNavigation(btn.dataset.id, btn.dataset.outlet);
    });

    // Modals
    document.getElementById('btnConfirmPickup')?.addEventListener('click', window.confirmPickup);
    document.getElementById('btnConfirmOTP')?.addEventListener('click', window.verifyOTP);
    document.getElementById('btnCloseOTP')?.addEventListener('click', window.closeOTPPanel);
    document.getElementById('btnResendOTP')?.addEventListener('click', window.regenerateOTP);
    document.getElementById('emergencyBtn')?.addEventListener('click', window.emergencyOverride);
    document.getElementById('btnCancelPayment')?.addEventListener('click', () => {
        document.getElementById('paymentPanel').classList.add('hidden');
        window.activeOrderForPayment = null;
    });

    document.querySelectorAll('.payment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const method = btn.dataset.method;
            window.recordPaymentAndComplete(method);
        });
    });

    // Login (if present)
    document.getElementById('loginBtn')?.addEventListener('click', window.login);
    document.getElementById('btnRefreshApp')?.addEventListener('click', window.completeSiteRefresh);


    const dateOpts = { month: 'long', day: 'numeric', year: 'numeric' };
    const dateEl = document.getElementById('currentDate');
    if (dateEl) dateEl.innerText = new Date().toLocaleDateString('en-US', dateOpts);
    
    if (window.lucide) lucide.createIcons();
});

onAuthStateChanged(auth, async user => {
    const isLoginPage = window.location.pathname.includes('login.html');
    if (!user) { if (!isLoginPage) window.location.href = 'login.html'; return; }
    if (isLoginPage) { window.location.href = 'index.html'; return; }

    try {
        const snap = await get(query(ref(db, "riders"), orderByChild("email"), equalTo(user.email.toLowerCase())));
        if (!snap.exists()) return auth.signOut();

        const profile = Object.entries(snap.val())[0];
        window.currentUser = { ...user, profile: { id: profile[0], ...profile[1] } };

        const pName = window.currentUser.profile.name || "Boss";
        document.getElementById('profileName').innerText = pName;
        document.getElementById('r-name').innerText = pName;
        document.getElementById('sidebar-name').innerText = pName;
        document.getElementById('sidebar-id').innerText = `RID-${profile[0].slice(0, 6).toUpperCase()}`;

        document.getElementById('r-father-name').innerText = window.currentUser.profile.fatherName || '---';
        document.getElementById('r-age').innerText = window.currentUser.profile.age || '---';
        document.getElementById('r-aadhar-no').innerText = window.currentUser.profile.aadharNo ? 'XXXXXXXX' + window.currentUser.profile.aadharNo.slice(-4) : '---';
        document.getElementById('r-qualification').innerText = window.currentUser.profile.qualification || '---';
        document.getElementById('r-address').innerText = window.currentUser.profile.address || '---';

        if (window.currentUser.profile.profilePhoto) document.getElementById('r-profile-img').src = window.currentUser.profile.profilePhoto;

        await loadOutletCoords();
        initLocationTracking();
        initRealtimeListeners();

        document.getElementById('dashboard').classList.remove('hidden');
        window.showSection('home');
        if (window.lucide) lucide.createIcons();
    } catch (e) { console.error(e); }
});

window.updateRiderPerformanceUI = () => { }; // Replaced by renderAllOrders

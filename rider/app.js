import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, onValue, get, set, update, runTransaction, query, orderByChild, equalTo, off, serverTimestamp, remove, limitToLast } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyAAHuSGwulRO3QhrOD4zK3ZRISivBi7jOM",
  authDomain: "prashant-pizza-e86e4.firebaseapp.com",
  databaseURL: "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com",
  projectId: "prashant-pizza-e86e4",
  messagingSenderId: "857471482885",
  appId: "1:857471482885:web:9eb8bbb90c77c588fbb06c"
};

let app, auth, db, dbStorage, messaging;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
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
        navigator.serviceWorker.register('sw.js').catch(err => console.error('SW failed', err));
    });
}

/**
 * 1. UTILITIES & SECURITY
 */
const escapeHtml = (unsafe) => {
    if (!unsafe || typeof unsafe !== 'string') return unsafe;
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
};

/**
 * Standardized error logging to cloud and console
 */
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

// Global Error Handler for monitoring
window.onerror = function(msg, url, line, col, error) {
    const errObj = {
        msg, url, line, col,
        stack: error ? error.stack : '',
        userAgent: navigator.userAgent,
        timestamp: Date.now()
    };
    console.error("Global Error Monitoring:", errObj);
    // Optional: Log to Firebase
    return false;
};

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
 * PUSH NOTIFICATION (FCM) HANDLERS
 */
async function setupPushNotifications(userId) {
    if (!('Notification' in window)) {
        console.warn("This browser does not support notifications.");
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const token = await getToken(messaging, { 
                serviceWorkerRegistration: await navigator.serviceWorker.ready 
            });
            if (token) {
                // await update(ref(db, `riders/${userId}`), { fcmToken: token });
                const riderRef = ref(db, `riders/${userId}`);
                await update(riderRef, { fcmToken: token });
            }
        }
    } catch (error) {
        logError("setupPushNotifications", error);
    }
}

onMessage(messaging, (payload) => {
    if (payload.notification) {
        showToast(`${payload.notification.title}: ${payload.notification.body}`, "info");
        // Play notification sound if available
        try {
            const audio = new Audio('/notification.mp3');
            audio.play().catch(() => {});
        } catch (e) {}
    }
});

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
    
    const notifQuery = query(ref(db, path), orderByChild('timestamp'), limitToLast(20));
    window._activeListeners.push({ ref: notifQuery, type: 'value' });

    onValue(notifQuery, snap => {
        const list = document.getElementById('notifList'); // Corrected ID from index.html
        const badge = document.getElementById('notifBadge');
        if (!list) return;

        list.textContent = '';
        let unreadCount = 0;

        const notifications = [];
        snap.forEach(child => {
            notifications.push({ id: child.key, ...child.val() });
        });

        if (notifications.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-notif';
            const emptyIcon = document.createElement('i');
            emptyIcon.setAttribute('data-lucide', 'bell-off');
            const emptyP = document.createElement('p');
            emptyP.textContent = 'No new notifications';
            emptyDiv.appendChild(emptyIcon);
            emptyDiv.appendChild(emptyP);
            list.appendChild(emptyDiv);
            if (window.lucide) lucide.createIcons();
            if (badge) {
                badge.innerText = '0';
                badge.classList.add('hidden');
            }
            return;
        }

        // Show newest first
        notifications.reverse().forEach(n => {
            if (!n.read) unreadCount++;
            
            const div = document.createElement('div');
            div.className = `notification-item ${n.read ? '' : 'unread'}`;
            
            const iconDiv = document.createElement('div');
            iconDiv.className = `notif-icon ${n.type || 'info'}`;
            const iconI = document.createElement('i');
            iconI.setAttribute('data-lucide', n.icon || 'bell');
            iconDiv.appendChild(iconI);
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'notif-content';
            
            const titleP = document.createElement('p');
            titleP.className = 'notif-title';
            titleP.textContent = n.title;
            
            const bodyP = document.createElement('p');
            bodyP.className = 'notif-body';
            bodyP.textContent = n.body;
            
            const timeP = document.createElement('p');
            timeP.className = 'notif-time';
            timeP.textContent = new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            contentDiv.appendChild(titleP);
            contentDiv.appendChild(bodyP);
            contentDiv.appendChild(timeP);
            
            div.appendChild(iconDiv);
            div.appendChild(contentDiv);
            
            // Mark as read on click
            div.addEventListener('click', async () => {
                try {
                    const updatePath = resolvePath(`riders/${uid}/notifications/${n.id}`);
                    await update(ref(db, updatePath), { read: true });
                } catch (e) {
                    logError("markNotifRead", e);
                }
            });
            
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
    });
}

window.clearAllNotifications = async () => {
    if (!currentUser || !currentUser.profile.id) return;
    if (await showConfirmModal("CLEAR NOTIFICATIONS", "Clear all notifications?")) {
        try {
            await remove(ref(db, `riders/${currentUser.profile.id}/notifications`));
            showToast("Notifications cleared", "success");
        } catch (e) {
            logError("clearAllNotifications", e);
            showToast("Failed to clear notifications", "error");
        }
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
    if (window.haptic) window.haptic(10);
    
    // Memory Management: Cleanup resources when leaving a section
    const currentSection = document.querySelector('.view-section.active');
    if (currentSection && currentSection.id === 'sec-active' && sectionId !== 'active') {
        if (typeof riderMap !== 'undefined' && riderMap) {
            try {
                if (riderMarker) riderMarker.remove();
                if (distMarker) distMarker.remove();
                riderMap.remove();
                riderMap = null;
                riderMarker = null;
                distMarker = null;
            } catch(e) { console.warn("Map cleanup error:", e); }
        }
    }
    
    // Hide all sections
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    
    // Show target section
    const target = document.getElementById(`sec-${sectionId}`);
    if (target) {
        target.classList.add('active');
        // Scroll to top on section change
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Update Top Navigation Tabs
    document.querySelectorAll('.top-nav-tabs .tab-item').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-section') === sectionId);
    });

    // Update Sidebar Links
    document.querySelectorAll('.nav-links .nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-section') === sectionId);
    });

    // Update Header UI based on section
    if (sectionId === 'active') {
        setTimeout(() => {
            initRiderMap();
            const activePanel = document.getElementById('activeDeliveryPanel');
            if (activePanel && !activePanel.classList.contains('hidden')) {
                const activeOrderData = window.activeOrderData;
                if (activeOrderData && activeOrderData.lat && activeOrderData.lng) {
                    window.updateRiderMap(activeOrderData.lat, activeOrderData.lng);
                }
            }
        }, 300);
    }

    // Auto-close sidebar on mobile if it was open
    const nav = document.getElementById('sidebarNav');
    if (nav && nav.classList.contains('active')) {
        window.toggleRiderSidebar();
    }

    if (window.lucide) lucide.createIcons();
};

/**
 * 2. AUTHENTICATION & SESSION
 */
window.login = async () => {
    const loginBtn = document.getElementById('loginBtn');
    const identifier = document.getElementById('email').value.trim();
    const pass = document.getElementById('password').value;
    
    if (!identifier || !pass) {
        showError("Missing credentials");
        return;
    }

    // Smart Identifier: If it's a 10-digit number, assume phone and convert to rider email
    let loginEmail = identifier;
    if (/^\d{10}$/.test(identifier)) {
        loginEmail = `${identifier}@rider.com`;
    }

    try {
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.innerHTML = `AUTHENTICATING... <div class="spinner-small"></div>`;
        }
        
        await signInWithEmailAndPassword(auth, loginEmail, pass);
        // Page will naturally redirect or update via onAuthStateChanged
    } catch (e) {
        let errorMsg = "Invalid credentials or access code";
        if (e.code === 'auth/quota-exceeded') {
            errorMsg = "Login Quota Exceeded for this hour. Please contact Admin or wait 60 minutes.";
        } else if (e.code === 'auth/too-many-requests') {
            errorMsg = "Too many attempts. Account temporarily locked for security. Try in 15 mins.";
        } else if (e.code === 'auth/network-request-failed') {
            errorMsg = "Network error. Check your internet connection.";
        }
        
        showError(errorMsg);
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerHTML = `AUTHENTICATE & START <i data-lucide="chevron-right"></i>`;
            if (window.lucide) lucide.createIcons();
        }
    }
};

/**
 * DOM CONTENT LOADED - EVENT BINDING
 * Centralized listener attachment to allow strict CSP (no inline scripts/handlers)
 */
document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('meta[name="theme-color"]')) {
        const meta = document.createElement('meta');
        meta.name = 'theme-color';
        meta.content = '#FF5200';
        document.head.appendChild(meta);
    }

    if (window.lucide) lucide.createIcons();

    // 1. Header & Global Listeners
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', window.toggleRiderSidebar);

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', window.toggleRiderSidebar);

    const profileTrigger = document.querySelector('.profile-trigger');
    if (profileTrigger) profileTrigger.addEventListener('click', window.toggleRiderSidebar);

    const btnNotif = document.querySelector('.btn-notif');
    if (btnNotif) btnNotif.addEventListener('click', () => window.toggleNotificationSheet(true));

    const statusToggle = document.querySelector('.duty-status-toggle');
    if (statusToggle) statusToggle.addEventListener('click', window.toggleRiderStatus);

    // 2. Navigation Listeners (Tabs & Sidebar)
    document.querySelectorAll('[data-section]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            window.showSection(el.getAttribute('data-section'));
        });
    });

    // 3. Login Page
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.addEventListener('click', window.login);

    // 4. Notification Sheet
    const btnCloseNotifSheet = document.getElementById('btnCloseNotifSheet');
    if (btnCloseNotifSheet) btnCloseNotifSheet.addEventListener('click', () => window.toggleNotificationSheet(false));

    const btnClearAllNotifs = document.getElementById('btnClearAllNotifs');
    if (btnClearAllNotifs) btnClearAllNotifs.addEventListener('click', window.clearAllNotifications);

    // 5. Profile Editing
    const btnEditPhoto = document.getElementById('btn-edit-photo');
    const photoInput = document.getElementById('profile-photo-input');
    if (btnEditPhoto && photoInput) {
        btnEditPhoto.addEventListener('click', () => photoInput.click());
        photoInput.addEventListener('change', window.handleProfilePhotoChange);
    }

    const btnEditPhone = document.getElementById('btn-edit-phone');
    if (btnEditPhone) btnEditPhone.addEventListener('click', () => window.editProfileField('phone'));

    const btnEditAddress = document.getElementById('btn-edit-address');
    if (btnEditAddress) btnEditAddress.addEventListener('click', () => window.editProfileField('address'));

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', window.logout);

    const logoutBtnProfile = document.getElementById('logoutBtnProfile');
    if (logoutBtnProfile) logoutBtnProfile.addEventListener('click', window.logout);

    // 6. Map & Stability
    const handleResize = () => {
        if (typeof riderMap !== 'undefined' && riderMap) {
            riderMap.invalidateSize();
        }
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => setTimeout(handleResize, 300));
});

window.toggleAadharView = () => {
    const container = document.getElementById('aadhar-container');
    const img = document.getElementById('r-aadhar-img');
    const btn = document.getElementById('btn-toggle-aadhar');
    if (!container || !img || !btn) return;

    const isHidden = container.classList.contains('hidden');
    
    if (isHidden) {
        container.classList.remove('hidden');
        img.src = (currentUser && currentUser.profile && currentUser.profile.aadharPhoto) || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'180\' viewBox=\'0 0 300 180\'%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'%23eee\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-family=\'sans-serif\' font-size=\'14\' fill=\'%23999\'%3ENo Image%3C/text%3E%3C/svg%3E';
        btn.innerText = 'HIDE';
    } else {
        container.classList.add('hidden');
        img.src = '';
        btn.innerText = 'SHOW';
    }
};

function showError(msg) {
    const errorEl = document.getElementById('loginError');
    if (!errorEl) return;
    errorEl.innerText = msg;
    errorEl.classList.remove('hidden');
    setTimeout(() => errorEl.classList.add('hidden'), 3000);
}

window.logout = async () => {
    if (await showConfirmModal("END SHIFT", "End your shift and logout?")) {
        try {
            window.clearAllListeners();
            if (riderMap) {
                riderMap.remove();
                riderMap = null;
            }
            localStorage.removeItem('rider_authenticated');
            await auth.signOut();
        } catch (error) {
            console.error('Logout error:', error);
            // Still redirect even if signOut fails
        }
    }
};

onAuthStateChanged(auth, async user => {
    const isLoginPage = window.location.pathname.includes('login.html');

    if (!user) {
        if (!isLoginPage) {
            window.location.href = 'login.html';
        }
        return;
    }

    // If logged in and on login page, redirect to dashboard
    if (isLoginPage) {
        localStorage.setItem('rider_authenticated', 'true');
        window.location.href = 'index.html';
        return;
    }

    // Ensure flag is set if we are on the dashboard
    localStorage.setItem('rider_authenticated', 'true');

    try {
        const normalizedEmail = user.email.toLowerCase();

        // 1. Check for Super Admin privileges in 'admins' node (root level)
        const adminsSnap = await get(ref(db, "admins"));
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
            const directRiderSnap = await get(ref(db, "riders/" + user.uid));
            if (directRiderSnap.exists()) {
                riderProfile = { id: directRiderSnap.key, ...directRiderSnap.val(), outlet: "all" };
            } else {
                // Fallback: search by email (legacy or mismatched UID)
                const emailQuerySnap = await get(query(ref(db, "riders"), orderByChild("email"), equalTo(normalizedEmail)));
                if (emailQuerySnap.exists()) {
                    const firstMatch = Object.entries(emailQuerySnap.val())[0];
                    riderProfile = { id: firstMatch[0], ...firstMatch[1], outlet: "all" };
                }
            }
        }

        if (!riderProfile) {
            showToast("ACCESS DENIED: Role not found.", "error");
            auth.signOut();
            return;
        }

        // Set global outlet context
        currentUser = { ...user, profile: riderProfile, isSuper: (riderProfile.outlet === 'all') };
        setupPushNotifications(riderProfile.id);
        
        // Handle Outlet Switcher for Super Users
        const switcher = document.getElementById('outletSwitcher');
        if (currentUser.isSuper && switcher) {
            switcher.classList.remove('hidden');
            switcher.replaceChildren();
            const options = [
                { value: 'all', text: '🌍 All Outlets' },
                { value: 'pizza', text: '🍕 Pizza Only' },
                { value: 'cake', text: '🎂 Cakes Only' }
            ];
            options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.text;
                switcher.appendChild(o);
            });
            const savedOutlet = localStorage.getItem('selectedOutlet') || 'all';
            switcher.value = savedOutlet;
            window.currentOutlet = savedOutlet;
        } else {
            window.currentOutlet = riderProfile.outlet || "pizza";
        }

        updateBranding();

        // Populate UI
        const pName = riderProfile.name || "Rider";
        const riderIdStr = riderProfile.id ? 'RID-' + riderProfile.id.slice(0, 8).toUpperCase() : 'RID-0000';

        const profileNameEl = document.getElementById('profileName');
        if (profileNameEl) profileNameEl.innerText = pName;
        
        const sidebarNameEl = document.getElementById('sidebar-name');
        if (sidebarNameEl) sidebarNameEl.innerText = pName;

        const sidebarIdEl = document.getElementById('sidebar-id');
        if (sidebarIdEl) sidebarIdEl.innerText = riderIdStr;

        const profilePhoneEl = document.getElementById('profilePhone');
        if (profilePhoneEl) profilePhoneEl.innerText = riderProfile.phone || user.email;

        const profilePhoneValueEl = document.getElementById('profilePhoneValue');
        if (profilePhoneValueEl) profilePhoneValueEl.innerText = riderProfile.phone || '---';
        
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
        
        // Clear any leftover listeners from previous session
        window.clearAllListeners();
        
        // Load rider stats with real-time listener (totalOrders, totalEarnings, avgDeliveryTime)
        const riderId = currentUser.profile.id;
        const statsPath = resolvePath(`riderStats/${riderId}`);
        const statsRef = ref(db, statsPath);
        window._activeListeners.push({ ref: statsRef, type: 'value' });

        onValue(statsRef, snap => {
            const stats = snap.val() || { totalOrders: 0, totalEarnings: 0, avgDeliveryTime: 0 };
            
            // Populate profile stats cards
            const totalOrdersEl = document.getElementById('stats-delivered');
            const totalEarningsEl = document.getElementById('stats-earnings');
            const avgTimeEl = document.getElementById('stats-ontime');
            
            if (totalOrdersEl) totalOrdersEl.innerText = (stats.totalOrders || 0).toLocaleString();
            if (totalEarningsEl) {
                totalEarningsEl.replaceChildren();
                totalEarningsEl.textContent = '₹' + (stats.totalEarnings || 0).toLocaleString();
            }
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
                showToast("Security policy: Data downloading is restricted.", "error");
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
        showToast("Status toggle is disabled for Admin users.", "warning");
        return;
    }
    const newStatus = currentUser.profile.status === "Online" ? "Offline" : "Online";
    try {
        await update(ref(db, resolvePath(`riders/${currentUser.profile.id}`)), { 
            status: newStatus,
            lastSeen: serverTimestamp() 
        });
        currentUser.profile.status = newStatus;
        updateStatusUI(newStatus);
    } catch (e) {
        logError("toggleRiderStatus", e);
        showToast("Failed to sync status", "error");
    }
};

function updateStatusUI(status) {
    const pulseDot = document.querySelector('.pulse-dot');
    const statusText = document.querySelector('.status-text');
    
    if (pulseDot) {
        pulseDot.className = `pulse-dot ${status}`;
    }
    if (statusText) {
        statusText.textContent = status;
        statusText.className = `status-text ${status}`;
    }

    // Legacy support for old elements if they still exist in some views
    const badge = document.getElementById('statusBadge');
    const btn = document.getElementById('statusToggleBtn');
    if (badge) {
        badge.innerText = status;
        badge.className = `status ${status}`;
    }
    if (btn) {
        btn.innerText = `SET STATUS: ${status === "Online" ? 'OFFLINE' : 'ONLINE'}`;
        btn.classList.toggle('btn-danger', status === "Online");
        btn.classList.toggle('btn-success', status === "Offline");
    }

    // Trigger location tracking if online
    if (status === "Online") {
        initLocationTracking();
    } else {
        stopLocationTracking();
    }
}

/**
 * 2.6 PROFILE EDITING LOGIC
 */
window.handleProfilePhotoChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Check file type (must be an image)
    if (!file.type.startsWith('image/')) {
        showToast("Please select an image file", "error");
        return;
    }

    // Check file size (limit to 500KB for upload efficiency)
    if (file.size > 500 * 1024) {
        showToast("Image size must be less than 500KB", "error");
        return;
    }

    try {
        const uid = currentUser.profile.id;
        // Upload to Firebase Storage instead of embedding base64
        const storageRef = ref(dbStorage, `riders/${uid}/profile_photo`);
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);

        // Update database with the download URL
        await update(ref(db, `riders/${uid}`), { profilePhoto: downloadUrl });

        // Sync UI
        const profileImg = document.getElementById('r-profile-img');
        const navPhoto = document.getElementById('r-photo');
        if (profileImg) profileImg.src = downloadUrl;
        if (navPhoto) navPhoto.src = downloadUrl;

        currentUser.profile.profilePhoto = downloadUrl;
        showToast("Profile photo updated", "success");
    } catch (error) {
        logError("handleProfilePhotoChange", error);
        showToast("Failed to update photo. " + error.message, "error");
    }
};

/**
 * Unified profile update logic for field persistence
 */
window.saveProfileChanges = async (updates) => {
    if (!currentUser || !currentUser.profile) return false;
    try {
        const uid = currentUser.profile.id;
        await update(ref(db, `riders/${uid}`), updates);
        Object.assign(currentUser.profile, updates);
        showToast("Profile updated successfully", "success");
        return true;
    } catch (error) {
        logError("saveProfileChanges", error);
        showToast("Update failed. Sensitive fields may be locked by admin.", "error");
        return false;
    }
};

window.editProfileField = async (field) => {
    const fieldMap = {
        'phone': { label: 'Phone Number', key: 'phone', elId: 'profilePhoneValue' },
        'address': { label: 'Address', key: 'address', elId: 'r-address' },
        'vehicle': { label: 'Vehicle Info', key: 'vehicleInfo', elId: 'r-vehicle' }
    };
    const config = fieldMap[field];
    if (!config) return;

    const el = document.getElementById(config.elId);
    const currentVal = el ? el.innerText : '';
    const newVal = prompt(`Enter new ${config.label}:`, currentVal === '---' ? '' : currentVal);

    if (newVal === null || newVal.trim() === currentVal) return;

    const updates = {};
    updates[config.key] = newVal.trim();
    
    const success = await window.saveProfileChanges(updates);
    if (success) {
        if (el) el.innerText = updates[config.key];
        // Special case for top-nav phone display
        if (field === 'phone') {
            const pPhone = document.getElementById('profilePhone');
            if (pPhone) pPhone.innerText = updates.phone;
        }
    }
};

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
            // GPS Lock handled internally
        },
        err => {
            console.error("GPS Error:", err);
            // If denied, we should probably force offline
            if (err.code === 1) { // PERMISSION_DENIED
                showToast("GPS Permission Denied. Live tracking disabled.", "error");
                update(ref(db, resolvePath(`riders/${currentUser.profile.id}`)), { status: "Offline" });
            }
        },
        { enableHighAccuracy: true }
    );

    // 2. Periodic Firebase Sync (every 30s)
    _locationInterval = setInterval(() => {
        if (_lastPos && currentUser && currentUser.profile.status === "Online") {
            try {
                const uid = currentUser.profile.id;
                set(ref(db, resolvePath(`riders/${uid}/location`)), _lastPos);
            } catch (e) {
                console.warn("Location sync failed - background retry will occur.", e);
            }
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
window.clearAllListeners = () => {
    if (window._activeListeners) {
        window._activeListeners.forEach(item => {
            try {
                if (item.ref && typeof item.ref.off === 'function') {
                    item.ref.off();
                } else if (item.ref && item.type === 'value') {
                    off(item.ref);
                }
            } catch(e) { console.warn("Listener cleanup error:", e); }
        });
        window._activeListeners = [];
    }
    
    // Clean up map resources
    if (typeof riderMap !== 'undefined' && riderMap) {
        try {
            if (riderMarker) riderMarker.remove();
            if (distMarker) distMarker.remove();
            riderMap.remove();
            riderMap = null;
            riderMarker = null;
            distMarker = null;
        } catch(e) { console.warn("Map cleanup error:", e); }
    }
};

function initRealtimeListeners() {
    if (!currentUser || !currentUser.email) return;
    const currentRiderEmail = currentUser.email.toLowerCase();
    const outletsToListen = ['pizza', 'cake'];

    // Note: window.clearAllListeners() is called in higher level setup to avoid accidental wipes
    
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
        const unassignedQuery = query(ref(db, ordersPath), orderByChild('assignedRider'), equalTo(null));
        window._activeListeners.push({ ref: unassignedQuery, type: 'value' });

        onValue(unassignedQuery, snap => {
            updateCacheAndRender(snap.val() || {}, 'unassigned');
        });

        // Listener 2: Orders assigned to this rider
        const myOrdersQuery = query(ref(db, ordersPath), orderByChild('assignedRider'), equalTo(currentRiderEmail));
        window._activeListeners.push({ ref: myOrdersQuery, type: 'value' });

        onValue(myOrdersQuery, snap => {
            const data = snap.val() || {};
            window._lastOrderCache = orderCache; // Global cache for search re-renders
            updateCacheAndRender(data, 'mine');
        });
    });
}

function renderAllOrders(orderCache) {
    const unassignedList = document.getElementById('unassignedOrdersList');
    const completedList = document.getElementById('completedOrdersList');
    const activeView = document.getElementById('activeOrderView');
    const pickupCount = document.getElementById('pickupCount');
    const activeBanner = document.getElementById('activeStatusBanner');

    if (!unassignedList || !completedList || !activeView) return;

    unassignedList.textContent = '';
    completedList.textContent = '';
    
    // Clear and set empty state for activeView
    activeView.textContent = '';
    const emptyActive = document.createElement('div');
    emptyActive.className = 'glass-panel empty-state-glass';
    const emptyIcon = document.createElement('i');
    emptyIcon.setAttribute('data-lucide', 'package');
    const emptyP = document.createElement('p');
    emptyP.textContent = 'No active trip currently.';
    emptyActive.appendChild(emptyIcon);
    emptyActive.appendChild(emptyP);
    activeView.appendChild(emptyActive);
    
    let unassignedCount = 0;
    let hasActive = false;
    window.activeOrderId = null;
    window.activeOrderOutlet = null;
    window.activeOrderData = null;

    const historySearch = document.getElementById('historySearch')?.value.toLowerCase() || '';
    
    // Sort completed orders by deliveredAt descending
    const completedOrders = [];

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
                activeView.textContent = '';
                activeView.appendChild(createActiveDeliveryPanel(id, o, outletId));
                hasActive = true;
                window.activeOrderId = id;
                window.activeOrderOutlet = outletId;
                window.activeOrderData = o;
            } else if (status === "delivered" && riderEmail === currentRiderEmail) {
                // Apply search filter if any
                const matchesSearch = !historySearch || 
                                    id.toLowerCase().includes(historySearch) || 
                                    (o.orderId && o.orderId.toLowerCase().includes(historySearch)) ||
                                    (o.address && o.address.toLowerCase().includes(historySearch));
                
                if (matchesSearch) {
                    completedOrders.push({ id, ...o });
                }
            }
        });
    });

    // Sort history by time (newest first)
    completedOrders.sort((a, b) => (b.deliveredAt || 0) - (a.deliveredAt || 0));

    // Limit DOM entries for history to prevent crashes (Audit 1.34)
    const MAX_HISTORY_DISPLAY = 50;
    completedOrders.slice(0, MAX_HISTORY_DISPLAY).forEach(o => {
        completedList.appendChild(createOrderCard(o.id, o, o.outlet));
    });

    if (completedOrders.length > MAX_HISTORY_DISPLAY) {
        const moreDiv = document.createElement('div');
        moreDiv.className = 'text-center p-10 text-muted italic text-small';
        moreDiv.textContent = `Showing last ${MAX_HISTORY_DISPLAY} of ${completedOrders.length} trips. Use search to find older ones.`;
        completedList.appendChild(moreDiv);
    }

    if (pickupCount) pickupCount.innerText = `${unassignedCount} Orders`;
    if (activeBanner) {
        activeBanner.textContent = '';
        const bannerDiv = document.createElement('div');
        bannerDiv.className = hasActive ? 'status-banner active' : 'status-banner idle';
        if (hasActive) bannerDiv.addEventListener('click', () => showSection('active'));
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'banner-info';
        
        const titleSpan = document.createElement('span');
        titleSpan.className = 'banner-title';
        titleSpan.textContent = hasActive ? 'Delivery in Progress' : 'No Active Delivery';
        
        const descSpan = document.createElement('span');
        descSpan.className = 'banner-desc';
        descSpan.textContent = hasActive ? 'You have an active delivery to complete.' : "Go to 'Pickup Hub' to find new orders.";
        
        infoDiv.appendChild(titleSpan);
        infoDiv.appendChild(descSpan);
        bannerDiv.appendChild(infoDiv);
        
        if (hasActive) {
            const chevronI = document.createElement('i');
            chevronI.setAttribute('data-lucide', 'chevron-right');
            bannerDiv.appendChild(chevronI);
        }
        
        activeBanner.appendChild(bannerDiv);
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

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    Object.keys(orderCache).forEach(outletId => {
        const orders = orderCache[outletId];
        Object.keys(orders).forEach(id => {
            const o = orders[id];
            const riderEmail = (o.assignedRider || "").toLowerCase();
            const currentRiderEmail = (currentUser.email || "").toLowerCase();

            const status = (o.status || "").toLowerCase();
            if (riderEmail === currentRiderEmail && status === "delivered") {
                const fee = Number(o.deliveryFee || 0);
                const deliveredTs = o.deliveredAt || 0;

                if (deliveredTs >= startOfToday) {
                    todayOrders++;
                    todayPay += fee;
                    if (outletId === 'pizza') pizzaToday += fee;
                    if (outletId === 'cake') cakeToday += fee;
                }

                totalCash += fee;
                if (outletId === 'pizza') pizzaTotal += fee;
                if (outletId === 'cake') cakeTotal += fee;
            }
        });
    });

    const els = {
        'stats-delivered': todayOrders,
        'stats-earnings': '₹' + todayPay.toLocaleString(),
        'stats-rating': '5.0',
        'stats-ontime': '100%',
        'e-total': '₹' + totalCash.toLocaleString(),
        'e-pizza': '₹' + pizzaTotal.toLocaleString(),
        'e-pizza-today': '₹' + pizzaToday.toLocaleString(),
        'e-cake': '₹' + cakeTotal.toLocaleString(),
        'e-cake-today': '₹' + cakeToday.toLocaleString()
    };

    Object.keys(els).forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = '';
            el.textContent = els[id];
        }
    });
}

function createOrderCard(id, o, outletId) {
    const card = document.createElement('div');
    card.className = 'order-card-premium';
    
    const orderIdText = (o.orderId || id.slice(-6)).toUpperCase();
    const customerNameText = o.customerName || 'Customer';
    const addressText = o.address || 'Address not available';
    const totalText = '₹' + Number(o.total || 0).toLocaleString();
    const earningsText = '₹' + (o.deliveryFee || 0);
    const statusText = o.status || 'Ready';
    const itemsText = o.items ? o.items.map(i => `${i.quantity}x ${i.name}`).join(', ') : 'Details...';

    // Outlet Branding
    const restaurantName = outletId === 'pizza' ? 'Roshani Pizza' : 'Roshani Cake';
    
    // Distance tracking
    let distanceHtml = '';
    let distanceToRest = '1.2 km'; // Placeholder if no location
    if (window.riderLocation && o.lat && o.lng) {
        const dist = window.getDistance(window.riderLocation.lat, window.riderLocation.lng, o.lat, o.lng);
        distanceToRest = `${dist.toFixed(1)} km`;
        distanceHtml = `<span class="badge-dist"><i data-lucide="map-pin"></i> ${dist.toFixed(1)} km</span>`;
    }

    let timeHtml = '';
    if (o.readyAt || o.createdAt) {
        const startTime = o.readyAt || o.createdAt;
        const diff = Math.floor((Date.now() - startTime) / 60000);
        timeHtml = `<span class="card-time"><i data-lucide="clock"></i> ${diff}m ago</span>`;
    }

    card.innerHTML = `
        <div class="incoming-request-header">
            <div class="new-order-badge">NEW ORDER!</div>
            <div class="order-id-chip">#${orderIdText}</div>
        </div>
        
        <div class="incoming-request-body">
            <div class="restaurant-info-row">
                <div class="rest-icon"><i data-lucide="store"></i></div>
                <div class="rest-details">
                    <h4 class="rest-name">${restaurantName}</h4>
                    <p class="rest-meta">Restaurant • ${distanceToRest}</p>
                </div>
            </div>

            <div class="trip-locations-flow">
                <div class="flow-line">
                    <div class="dot start"></div>
                    <div class="line"></div>
                    <div class="dot end"></div>
                </div>
                <div class="flow-text">
                    <div class="loc-item">
                        <span class="loc-lbl">PICKUP AT</span>
                        <span class="loc-val">${restaurantName}</span>
                    </div>
                    <div class="loc-item">
                        <span class="loc-lbl">DROP-OFF AT</span>
                        <span class="loc-val">${addressText}</span>
                    </div>
                </div>
            </div>

            <div class="trip-summary-stats">
                <div class="trip-stat">
                    <span class="stat-lbl">TOTAL DISTANCE</span>
                    <span class="stat-val">5.8 km</span>
                </div>
                <div class="trip-stat text-right">
                    <span class="stat-lbl">YOUR EARNING</span>
                    <span class="stat-val highlight">${earningsText}</span>
                </div>
            </div>
        </div>

        <div class="incoming-request-actions">
            <button class="btn-decline" onclick="this.closest('.order-card-premium').remove()">DECLINE</button>
            <button class="btn-accept" onclick="window.acceptOrder('${id}', '${outletId}')">ACCEPT</button>
        </div>
    `;

    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 10);
    return card;
}

function createActiveDeliveryPanel(id, o, outletId) {
    const panel = document.createElement('div');
    panel.className = 'active-delivery-panel premium-active-panel';
    panel.id = 'activeDeliveryPanel';
    
    const orderIdText = (o.orderId || id.slice(-6)).toUpperCase();
    const customerNameText = o.customerName || 'Customer';
    const addressText = o.address || 'Address not available';
    const totalText = '₹' + Number(o.total || 0).toLocaleString();
    const phoneValue = o.customerPhone || o.phone || '';
    const cleanPhone = phoneValue ? phoneValue.replace(/\D/g, '').slice(-10) : '';
    const currentStatus = o.status || 'Out for Delivery';

    // Distance Calculation
    let distanceText = 'Estimating...';
    if (window.riderLocation && o.lat && o.lng) {
        const dist = window.getDistance(window.riderLocation.lat, window.riderLocation.lng, o.lat, o.lng);
        distanceText = `${dist.toFixed(1)} km away`;
    }

    // Contextual Action Button
    let actionButton = '';
    if (currentStatus === 'Arriving at Restaurant') {
        actionButton = `
            <button class="btn-complete-delivery orange" onclick="window.updateTripStatus('${id}', '${outletId}', 'At Restaurant')">
                <i data-lucide="map-pin"></i> ARRIVED AT RESTAURANT
            </button>`;
    } else if (currentStatus === 'At Restaurant') {
        actionButton = `
            <button class="btn-complete-delivery blue" onclick="window.openVerificationModal('${id}', '${outletId}')">
                <i data-lucide="clipboard-check"></i> VERIFY & PICKUP
            </button>`;
    } else {
        // Default: Out for Delivery
        actionButton = `
            <button class="btn-complete-delivery" onclick="window.openOTPPanel()">
                <i data-lucide="check-circle-2"></i> COMPLETE DELIVERY
            </button>`;
    }

    panel.innerHTML = `
        <div class="active-handle"></div>
        <div class="active-header-premium">
            <div class="live-indicator">
                <span class="pulse-ring"></span>
                <span class="live-text">${currentStatus.toUpperCase()}</span>
            </div>
            <div class="active-meta">
                <span class="active-outlet ${outletId}">${outletId.toUpperCase()}</span>
                <span class="active-id">#${orderIdText}</span>
            </div>
        </div>

        <div class="active-body-premium">
            <div class="active-main-info">
                <div class="info-group">
                    <h2 class="active-cust-name">${customerNameText}</h2>
                    <p class="active-dist-info"><i data-lucide="map-pin"></i> ${distanceText}</p>
                </div>
                <div class="action-buttons-circle">
                    ${cleanPhone ? `
                        <a href="tel:${cleanPhone}" class="circle-btn tel" title="Call Customer">
                            <i data-lucide="phone"></i>
                        </a>
                        <button class="circle-btn wa" onclick="window.contactCustomer('${cleanPhone}')" title="WhatsApp Customer">
                            <i data-lucide="message-circle"></i>
                        </button>
                    ` : ''}
                </div>
            </div>

            <div class="active-address-card" onclick="window.navigateToCustomer('${addressText}', ${o.lat}, ${o.lng})">
                <div class="address-icon-box">
                    <i data-lucide="navigation-2"></i>
                </div>
                <div class="address-text-box">
                    <p class="address-label">DELIVERY ADDRESS</p>
                    <p class="address-content">${addressText}</p>
                </div>
                <i data-lucide="chevron-right" class="address-chevron"></i>
            </div>

            <div class="active-summary-row">
                <div class="summary-item">
                    <span class="summary-lbl">COLLECT FROM CUSTOMER</span>
                    <span class="summary-val cash">${totalText}</span>
                </div>
                <div class="summary-item text-right">
                    <span class="summary-lbl">TRIP EARNINGS</span>
                    <span class="summary-val earn">₹${o.deliveryFee || 0}</span>
                </div>
            </div>

            ${actionButton}
        </div>
    `;

    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 10);
    return panel;
}

window.acceptOrder = async (id, outletId) => {
    window.haptic(40);
    try {
        const orderPath = `${outletId}/orders/${id}`;
        const result = await runTransaction(ref(db, orderPath), current => {
            if (current && current.assignedRider) {
                return; // Already taken
            }
            return {
                ...current,
                status: "Arriving at Restaurant",
                deliveryOTP: Math.floor(100000 + Math.random() * 900000).toString(),
                assignedRider: currentUser.email.toLowerCase(),
                acceptedAt: Date.now()
            };
        });
        if (result.committed) {
            showSection('active');
        } else {
            showToast("Sorry, this order was just accepted by another rider.", "warning");
        }
    } catch (e) {
        logError("acceptOrder", e);
        showToast("Operation failed. Please try again.", "error");
    }
};

/**
 * PHASE 2: PREMIUM WORKFLOW LOGIC
 */
window.updateTripStatus = async (id, outletId, newStatus) => {
    window.haptic(20);
    try {
        const orderPath = `${outletId}/orders/${id}`;
        await update(ref(db, orderPath), { status: newStatus });
        showToast(`Status updated to ${newStatus}`, "success");
    } catch (e) {
        logError("updateTripStatus", e);
        showToast("Failed to update status", "error");
    }
};

window.openVerificationModal = (id, outletId) => {
    window.haptic(30);
    const order = ordersMap.get(id);
    if (!order) return;

    const modal = document.getElementById('verificationModal');
    const container = document.getElementById('orderChecklist');
    container.innerHTML = '';

    if (order.items) {
        order.items.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'checklist-item';
            div.innerHTML = `
                <div class="check-box" id="check-${index}" onclick="this.classList.toggle('checked')">
                    <i data-lucide="check"></i>
                </div>
                <span class="item-name">${item.name}</span>
                <span class="item-qty">x${item.quantity}</span>
            `;
            container.appendChild(div);
        });
    }

    window.currentVerificationOrder = { id, outletId };
    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
};

window.confirmPickup = async () => {
    const { id, outletId } = window.currentVerificationOrder;
    const modal = document.getElementById('verificationModal');
    
    // Check if all items are checked (optional strictness)
    const boxes = document.querySelectorAll('.check-box');
    const allChecked = Array.from(boxes).every(b => b.classList.contains('checked'));
    
    if (!allChecked) {
        if (!confirm("Some items are not checked. Are you sure you have everything?")) return;
    }

    try {
        const orderPath = `${outletId}/orders/${id}`;
        await update(ref(db, orderPath), { status: 'Out for Delivery' });
        modal.classList.add('hidden');
        showToast("Order picked up! Drive safe.", "success");
    } catch (e) {
        logError("confirmPickup", e);
        showToast("Failed to update pickup status", "error");
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
        showToast("Navigation data not available.", "warning");
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
        showToast("Customer phone number not available.", "warning");
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
        showToast("No active order found.", "info");
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
        showToast("Unauthorized access attempt.", "error");
        return;
    }
    
    if (await showConfirmModal("FORCE COMPLETE", "FORCE COMPLETE: Bypass customer OTP?")) {
        window.haptic([50, 50, 50]);
        try {
            const outletId = window._currentOrderOutlet || 'pizza';
            const orderPath = `${outletId}/orders/${currentOrderId}`;
            
            await update(ref(db, orderPath), {
                status: "Delivered",
                deliveredAt: serverTimestamp(),
                overrideBy: currentUser.email
            });

            // Update rider stats
            const snap = await get(ref(db, orderPath));
            const order = snap.val();
            const riderId = currentUser.profile.id;
            const commission = Number(order.deliveryFee || 0);
            const statsPath = resolvePath(`riderStats/${riderId}`);
            
            await runTransaction(ref(db, statsPath), (current) => {
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
            logError("emergencyOverride", e);
            showToast("System error during override", "error");
        }
    }
};

window.closeOTPPanel = () => {
    const otpPanel = document.getElementById('otpPanel');
    if (otpPanel) otpPanel.classList.add('hidden');
};

window.verifyOTP = async () => {
    window.haptic(25);
    const otpInput = document.getElementById('otpInput');
    const otp = otpInput.value;
    if (!otp) return;

    const outletId = window._currentOrderOutlet || 'pizza';
    const otpAttemptsPath = `${outletId}/otpAttempts/${currentOrderId}`;
    const now = Date.now();

    try {
        // 1. Check for active blocks (Server-side check)
        const attemptsSnap = await get(ref(db, otpAttemptsPath));
        const userAttempts = attemptsSnap.val() || { count: 0, lastTry: 0, blockedUntil: 0 };

        if (userAttempts.blockedUntil > now) {
            const remaining = Math.ceil((userAttempts.blockedUntil - now) / 1000);
            showToast(`Verification blocked! Try again in ${remaining}s`, "error");
            return;
        }

        const orderPath = `${outletId}/orders/${currentOrderId}`;
        const snap = await get(ref(db, orderPath));
        const order = snap.val();
        
        if (!order) {
            showToast("Order not found.", "error");
            return;
        }

        // Fetch Master Fallback Code from Store Settings
        const settingsSnap = await get(ref(db, `${outletId}/settings/Store`));
        const storeSettings = settingsSnap.val() || {};
        const fallbackCode = storeSettings.deliveryBackupCode;

        // Verify against Customer OTP OR Admin Fallback Code
        const storedOTP = order.deliveryOTP || order.otp || order.otpCode;
        const matchesCustomer = String(otp).trim() === String(storedOTP).trim();
        const matchesFallback = fallbackCode && String(otp).trim() === String(fallbackCode).trim();

        if (matchesCustomer || matchesFallback) {
            // Success: Clear attempts node
            await remove(ref(db, otpAttemptsPath));

            await update(ref(db, orderPath), {
                status: "Delivered",
                deliveredAt: serverTimestamp(),
                verifiedBy: matchesFallback ? 'ADMIN_FALLBACK' : 'OTP'
            });

            // Update rider stats (totalOrders, totalEarnings)
            const riderId = currentUser.profile.id;
            const commission = Number(order.deliveryFee || 0); 
            const statsPath = resolvePath(`riderStats/${riderId}`);

            await runTransaction(ref(db, statsPath), (current) => {
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
            // Failure: Increment attempts (Server-side)
            const result = await runTransaction(ref(db, otpAttemptsPath), (current) => {
                const data = current || { count: 0, lastTry: 0, blockedUntil: 0 };
                data.count++;
                data.lastTry = now;
                // Hardening: Block after 10 failed attempts for 60 seconds
                if (data.count >= 10) {
                    data.blockedUntil = now + (60 * 1000); 
                }
                return data;
            });
            
            const failData = result.snapshot.val();
            if (failData.blockedUntil > now) {
                showToast("10 failed attempts! Blocked for 60s.", "error");
            } else {
                showToast(`Incorrect OTP! ${10 - failData.count} attempts left.`, "error");
            }
        }
    } catch (e) {
        logError("verifyOTP", e);
        showToast("System error during verification. Please try again.", "error");
    }
};

window.regenerateOTP = async () => {
    if (!currentOrderId) return;
    window.haptic(40);

    // Rate Limiting Check (Firebase-backed)
    const now = Date.now();
    const outletId = window._currentOrderOutlet || 'pizza';
    const otpAttemptsPath = `${outletId}/otpAttempts/${currentOrderId}`;
    
    const attemptsSnap = await get(ref(db, otpAttemptsPath));
    const attemptData = attemptsSnap.val() || {};
    const lastResend = attemptData.lastResend || 0;

    if (now - lastResend < 60000) { // 60s cooldown
        const remaining = Math.ceil((60000 - (now - lastResend)) / 1000);
        showToast(`Wait ${remaining}s before resending.`, "warning");
        return;
    }

    const btn = document.getElementById('btnResendOTP');
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Resending...";
    }
    
    try {
        const outletId = window._currentOrderOutlet || 'pizza';
        const orderPath = `${outletId}/orders/${currentOrderId}`;
        const newOTP = Math.floor(100000 + Math.random() * 900000).toString();
        
        await update(ref(db, orderPath), { deliveryOTP: newOTP, otp: newOTP });
        
        await runTransaction(ref(db, otpAttemptsPath), (current) => {
            const data = current || { count: 0, lastTry: 0, blockedUntil: 0 };
            data.resendCount = (data.resendCount || 0) + 1;
            data.lastResend = now;
            return data;
        });

        showToast("New OTP generated and sent to customer!", "success");
    } catch (e) {
        logError("regenerateOTP", e);
        showToast("Failed to regenerate OTP. Please try again.", "error");
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
    let bgColor = '#1e293b'; // info/default
    if (type === 'success') bgColor = '#10B981';
    if (type === 'error') bgColor = '#EF4444';
    if (type === 'warning') bgColor = '#F59E0B';

    toast.style = `
        position: fixed; bottom: 6.25rem; left: 50%; transform: translateX(-50%);
        background: ${bgColor};
        color: white; padding: 0.75rem 1.5rem; border-radius: 2rem; font-weight: 700;
        box-shadow: 0 0.625rem 1.5rem rgba(0,0,0,0.2); z-index: 9999;
        font-family: 'Inter', sans-serif;
        text-transform: uppercase;
        letter-spacing: 0.05rem;
        min-width: 15rem;
        text-align: center;
    `;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}


window.showConfirmModal = (title, message) => {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmTitle');
        const msgEl = document.getElementById('confirmMsg');
        const btnYes = document.getElementById('btnConfirmYes');
        const btnNo = document.getElementById('btnConfirmNo');

        if (!modal || !titleEl || !msgEl || !btnYes || !btnNo) {
            console.error("Confirmation modal elements missing!");
            resolve(false);
            return;
        }

        titleEl.textContent = title || "CONFIRM ACTION";
        msgEl.textContent = message || "Are you sure you want to proceed?";
        modal.classList.remove('hidden');

        const cleanup = (result) => {
            modal.classList.add('hidden');
            btnYes.onclick = null;
            btnNo.onclick = null;
            resolve(result);
        };

        btnYes.onclick = () => cleanup(true);
        btnNo.onclick = () => cleanup(false);
        
        modal.onclick = (e) => {
            if (e.target === modal) cleanup(false);
        };
    });
};

/**
 * UI HELPER: Update Performance Summary
 */
window.updateRiderPerformanceUI = () => {
    let totalEarnings = 0;
    let totalOrders = 0;
    let totalDist = 0;
    
    // ordersMap contains all orders including history
    ordersMap.forEach(o => {
        if (o.status === 'Delivered' && o.assignedRider === currentUser.email.toLowerCase()) {
            totalOrders++;
            totalEarnings += Number(o.deliveryFee || 0);
            totalDist += 5.8; // Placeholder: In production sum up real distances
        }
    });

    const earnEl = document.getElementById('statsTodayEarnings');
    const orderEl = document.getElementById('statsTodayDelivered');
    const distEl = document.getElementById('statsTodayDistance');
    const dateEl = document.getElementById('currentDate');

    if (earnEl) earnEl.innerText = \?\\;
    if (orderEl) orderEl.innerText = totalOrders;
    if (distEl) distEl.innerText = \\ km\;
    if (dateEl) {
        const d = new Date();
        dateEl.innerText = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
};


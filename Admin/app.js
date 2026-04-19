// ==========================================
// PIZZA ERP | ADMINISTRATION PANEL v3.0
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
    const downloadBtn = document.getElementById('menu-download');
    if (downloadBtn) downloadBtn.classList.remove('hidden');
});

window.installPWA = async () => {
    if (!deferredPrompt) {
        alert("The app is already installed or your browser doesn't support PWA installation.");
        return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        const downloadBtn = document.getElementById('menu-download');
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

const db = firebase.database();
const auth = firebase.auth();

// =============================
// FILE UPLOAD UTILITY (Base64)
// =============================
async function uploadImage(file, path) {
    if (!file) return null;
    
    // Validation: Only allow JPEG, PNG, WebP
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        alert("Invalid file type. Please upload JPEG, PNG, or WebP.");
        return null;
    }

    // Compression & Base64 Conversion
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 500; // Optimized for dashboard speed
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = (MAX_WIDTH / width) * height;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Return compressed DataURI
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.onerror = (err) => reject(new Error("Image processing failed"));
        };
        reader.onerror = (err) => reject(new Error("File reading failed"));
    });
}

async function deleteImage(url) {
    // If it's a Base64 string, it's overwritten/deleted when the DB entry is changed.
    // If it's an old Firebase Storage URL, we log it but don't attempt delete (Storage is off).
    if (!url) return;
    if (url.includes("firebasestorage.googleapis.com")) {
        console.log("Old storage image skipped (Storage disabled):", url);
    }
}

// =============================
// GLOBAL STATE & LOOKUPS
// =============================
let adminData = null;
const ordersMap = new Map(); // For XSS-safe access to order objects in UI

// SECONDARY AUTH FOR RIDER CREATION (Avoids logging out admin)
let secondaryAuth;
function initSecondaryAuth() {
    try {
        if (!window.firebaseConfig) {
            console.error("Firebase Config not found! Secondary auth check skipped.");
            secondaryAuth = firebase.auth();
            return;
        }
        if (firebase.apps.length > 1) {
            secondaryAuth = firebase.app("secondary").auth();
        } else {
            const secondaryApp = firebase.initializeApp(window.firebaseConfig, "secondary");
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
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    // Always refresh category dropdown when modal opens
    if (categories.length === 0) loadCategories();
    else updateActiveDishModalCategories();

    document.getElementById('modalTitle').innerText = dishId ? 'Edit Dish' : 'Add New Dish';
    const statusLabel = document.getElementById('uploadStatus');
    if(statusLabel) statusLabel.classList.add('hidden');

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
// Sidebar Helpers
window.toggleSidebar = () => {
    console.log("Toggle Sidebar Clicked");
    const sidebar = document.getElementById('sidebarNav');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar) {
        console.error("Sidebar Nav not found!");
        return;
    }

    window.haptic(15);
    
    if (window.innerWidth > 1024) {
        console.log("Desktop Toggle");
        document.body.classList.toggle('sidebar-collapsed');
    } else {
        const isActive = sidebar.classList.toggle('active');
        console.log("Mobile Toggle - Active:", isActive);
        if (overlay) overlay.classList.toggle('active', isActive);
    }
};

// Update switchTab to handle mobile sidebar auto-close
// Updated switchTab logic consolidated below at line 686


/**
 * =============================================
 * 1.5 PREMIUM MOBILE UX (Drawer & Haptics)
 * =============================================
 */
window.openOrderDrawer = (id) => {
    const o = ordersMap.get(id);
    if (!o) return;

    window.haptic(15); // Light tap

    const drawer = document.getElementById('orderDrawer');
    const overlay = document.getElementById('orderDrawerOverlay');
    const body = document.getElementById('orderDrawerBody');

    if (!drawer || !overlay || !body) return;

    const safeOrderId = escapeHtml(o.orderId || id.slice(-6));
    const safeTotal = escapeHtml(String(o.total || 0));
    const safeStatus = escapeHtml(o.status || 'Placed');

    const itemsHtml = (o.items || []).map(item => `
        <div class="flex-row flex-between mb-12 p-8-15 border-b-ghost">
            <div>
                <div class="font-bold text-main">${escapeHtml(item.name)}</div>
                <div class="text-muted-small">${escapeHtml(item.size)} x ${item.qty || 1}</div>
            </div>
            <div class="font-black text-primary">₹${item.price * (item.qty || 1)}</div>
        </div>
    `).join('');

    body.innerHTML = `
        <div style="text-align:center; margin-bottom:24px;">
            <div style="font-size:12px; font-weight:900; color:var(--primary); letter-spacing:1px; margin-bottom:4px;">ORDER DETAILS</div>
            <h2 style="font-size:24px; font-weight:900; color:var(--text-dark);">#${safeOrderId.toUpperCase()}</h2>
        </div>

        <div style="background:var(--bg-secondary); border-radius:20px; padding:20px; margin-bottom:24px;">
            ${itemsHtml}
            <div style="display:flex; justify-content:space-between; margin-top:10px; padding-top:12px; border-top:2px solid white;">
                <span style="font-weight:800; font-size:14px;">TOTAL AMOUNT</span>
                <span style="font-weight:900; font-size:20px; color:var(--primary);">₹${safeTotal}</span>
            </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:12px;">
            <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-align:center;">QUICK ACTIONS</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <button class="btn-primary" style="background:#10b981; border:none;" onclick="updateStatusFromDrawer('${id}', 'Confirmed')">CONFIRM</button>
                <button class="btn-primary" style="background:#3b82f6; border:none;" onclick="updateStatusFromDrawer('${id}', 'Preparing')">PREPARE</button>
                <button class="btn-primary" style="background:#f59e0b; border:none;" onclick="updateStatusFromDrawer('${id}', 'Cooked')">READY</button>
                <button class="btn-primary" style="background:#ef4444; border:none;" onclick="updateStatusFromDrawer('${id}', 'Out for Delivery')">DISPATCH</button>
            </div>
            <button class="btn-primary btn-full" style="margin-top:10px; background:#161616;" onclick="closeOrderDrawer()">CLOSE DETAILS</button>
        </div>
    `;

    drawer.classList.add('active');
    overlay.classList.add('active');
};

window.closeOrderDrawer = () => {
    const drawer = document.getElementById('orderDrawer');
    const overlay = document.getElementById('orderDrawerOverlay');
    if(drawer) drawer.classList.remove('active');
    if(overlay) overlay.classList.remove('active');
};

window.updateStatusFromDrawer = async (id, status) => {
    window.haptic(30); // Confirmation buzz
    await updateStatus(id, status);
    window.closeOrderDrawer();
};

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
let _ordersValueCb = null;
let _ordersChildCb = null;
let _ordersChangedCb = null;

// =============================
// AUTHENTICATION
// =============================
function doLogin() {
    window.haptic(10);
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
    if (authOverlay) authOverlay.classList.remove('hidden');
    const layout = document.querySelector(".layout");
    if (layout) layout.classList.add('hidden');
    auth.signOut();
};

auth.onAuthStateChanged(async user => {
    if (!user) {
        // Detach persistent listeners
        if (_ordersChildCb) { db.ref("orders").off("child_added", _ordersChildCb); _ordersChildCb = null; }
        if (_ordersValueCb) { db.ref("orders").off("value", _ordersValueCb); _ordersValueCb = null; }
        if (_ordersChangedCb) { db.ref("orders").off("child_changed", _ordersChangedCb); _ordersChangedCb = null; }
        if (window.currentOutlet) db.ref(`dishes/${window.currentOutlet}`).off();
        
        if (authOverlay) authOverlay.classList.remove('hidden');
        const layout = document.querySelector(".layout");
        if (layout) layout.classList.add('hidden');
        return;
    }

        try {
            const adminSnap = await db.ref("admins").once("value");
            adminData = null;
            const normalizedEmail = (user.email || "").toLowerCase();

            adminSnap.forEach(snap => {
                const val = snap.val();
                if (val && val.email && val.email.toLowerCase() === normalizedEmail) {
                    adminData = val;
                }
            });
        } catch (authErr) {
            console.error("Critical Permission Error on /admins check:", authErr);
        }

        try {
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
            if (authOverlay) authOverlay.classList.add('hidden');
            const layout = document.querySelector(".layout");
            if (layout) {
                layout.classList.remove('hidden');
                layout.classList.add('flex');
            }

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
    const mobBadge = document.getElementById('mobileOutletBadge');
    const sidebarBrand = document.getElementById('sidebarBrandText');
    const brand = window.currentOutlet === 'cake' ? 'cake' : 'pizza';
    const isPizza = brand === 'pizza';

    const label = isPizza ? 'PIZZA OUTLET' : 'CAKES OUTLET';
    const bgColor = isPizza ? 'var(--primary-orange)' : '#EC4899';

    if (badge) {
        badge.innerText = label;
        badge.classList.remove('brand-pizza-bg', 'brand-cake-bg');
        badge.classList.add(isPizza ? 'brand-pizza-bg' : 'brand-cake-bg');
    }
    if (mobBadge) {
        mobBadge.innerText = label;
        mobBadge.classList.remove('brand-pizza-bg', 'brand-cake-bg');
        mobBadge.classList.add(isPizza ? 'brand-pizza-bg' : 'brand-cake-bg');
    }
    if (sidebarBrand) {
        sidebarBrand.innerText = isPizza ? 'ROSHANI PIZZA' : 'ROSHANI CAKES';
    }
    document.title = (isPizza ? 'Roshani Pizza' : 'Roshani Cakes') + ' | Admin Dashboard';

    // Synchronize PWA Manifest & Icons (from branding.js)
    if (typeof window.switchBrand === 'function' && brand !== localStorage.getItem('admin_brand')) {
        localStorage.setItem('admin_brand', brand);
        console.log("[Branding] Outlet changed brand to:", brand);
        // We don't force reload here to avoid interrupting the user, 
        // but the NEXT visit or a manual reload will finalize the PWA icon.
        // We trigger the DOM update immediately though.
        location.reload(); 
    }

    const ridersMenu = document.getElementById("menu-riders");
    if (ridersMenu) {
        ridersMenu.classList.toggle('hidden', !(isPizza || (adminData && adminData.isSuper)));
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

function closeSidebar() {
    const sidebar = document.getElementById('sidebarNav');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}
window.closeSidebar = closeSidebar;
window.closeMobileSidebar = closeSidebar; // Support for either call style

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

// =============================
// ADAPTIVE UI & NOTIFICATIONS
// =============================
let notifications = [];

function addNotification(title, sub, type = 'info') {
    const notif = {
        id: Date.now(),
        title,
        sub,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type
    };
    notifications.unshift(notif);
    if (notifications.length > 50) notifications.pop();
    
    // Set Pending State
    if (window.currentActiveTab !== 'notifications') {
        window.isNotificationPending = true;
    }

    updateNotificationUI();
    
    // Play sound for notification if it's new/delivered
    if (type === 'new' || type === 'delivered') {
        playSound();
    }
}

function updateNotificationUI() {
    const badge = document.getElementById('notifBadge');
    const sideBadge = document.getElementById('sidebar-notif-count');
    const list = document.getElementById('notificationList');
    const fullList = document.getElementById('fullNotificationList');
    
    // 1. Update Badge Colors & Counts
    if (notifications.length > 0) {
        if (badge) {
            badge.classList.remove('hidden');
            badge.innerText = `+${notifications.length > 9 ? '9' : notifications.length}`;
            if (window.isNotificationPending) {
                badge.classList.add('pending');
            } else {
                badge.classList.remove('pending');
            }
        }
        if (sideBadge) {
            sideBadge.classList.toggle('hidden', !window.isNotificationPending);
            sideBadge.classList.toggle('block', window.isNotificationPending);
            sideBadge.innerText = notifications.length;
        }
    } else {
        if (badge) badge.classList.add('hidden');
        if (sideBadge) sideBadge.classList.add('hidden');
    }

    const emptyHtml = '<div class="empty-notif" style="padding:40px; text-align:center; color:#94a3b8; font-size:14px; font-weight:500;">No new notifications</div>';

    // 2. Update Dropdown List (if exists)
    if (list) {
        if (notifications.length === 0) {
            list.innerHTML = emptyHtml;
        } else {
            list.innerHTML = notifications.slice(0, 10).map(n => renderNotifItem(n)).join('');
        }
    }

    // 3. Update Dashboard List
    if (fullList) {
        if (notifications.length === 0) {
            fullList.innerHTML = emptyHtml;
        } else {
            fullList.innerHTML = notifications.map(n => renderNotifItem(n, true)).join('');
        }
    }
}

function renderNotifItem(n, isFull = false) {
    const safeTitle = escapeHtml(n.title);
    const safeSub = escapeHtml(n.sub);
    const safeTime = escapeHtml(n.time);
    const safeType = escapeHtml(n.type);

    return `
        <div class="notification-item ${safeType} ${isFull ? 'notif-item-full' : ''}">
            <div class="flex-grow-1">
                <div class="notif-title notif-title-premium">${safeTitle}</div>
                <div class="notif-sub notif-sub-premium">${safeSub}</div>
            </div>
            <div class="notif-time-badge notif-time-badge-premium">${safeTime}</div>
        </div>
    `;
}

window.clearAllNotifications = () => {
    notifications = [];
    window.isNotificationPending = false;
    updateNotificationUI();
};

window.toggleNotificationSheet = (show) => {
    const sheet = document.getElementById('notificationSheet');
    const overlay = document.getElementById('notificationOverlay');
    
    if (!sheet || !overlay) return;

    if (show === false || sheet.classList.contains('active')) {
        sheet.classList.remove('active');
        overlay.classList.remove('active');
    } else {
        sheet.classList.add('active');
        overlay.classList.add('active');
        // Clear pending mark when opened
        window.isNotificationPending = false;
        updateNotificationUI();
    }
};

window.clearNotifications = () => {
    notifications = [];
    updateNotificationUI();
};



window.switchTab = (tabId) => {
    window.currentActiveTab = tabId;
    console.log(`[Navigation] Switching to: ${tabId}`);

    // Unified Mobile Sidebar Close
    if (typeof closeSidebar === 'function') {
        closeSidebar();
    } else {
        const sidebar = document.getElementById('sidebarNav');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
    }

    if (typeof window.toggleNotificationSheet === 'function') {
        window.toggleNotificationSheet(false);
    }
    
    if (tabId === 'notifications') {
        window.isNotificationPending = false;
        if (typeof updateNotificationUI === 'function') updateNotificationUI();
    }

    const layout = document.querySelector('.layout');
    const posTab = document.getElementById('tab-walkin');

    // Handle POS (Walk-in) Fullscreen on Mobile
    if (tabId === 'walkin' && window.innerWidth < 768) {
        if (layout) layout.classList.add('pos-immersion');
        if (posTab) posTab.classList.add('pos-fullscreen');
        
        if (!document.getElementById('posExitBtn') && posTab) {
            const backBtn = document.createElement('button');
            backBtn.id = 'posExitBtn';
            backBtn.className = 'pos-back-btn mobile-only';
            backBtn.innerHTML = '<i data-lucide="chevron-left"></i> Back to Dashboard';
            backBtn.onclick = (e) => {
                e.stopPropagation();
                window.switchTab('dashboard');
            };
            posTab.prepend(backBtn);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    } else {
        if (layout) layout.classList.remove('pos-immersion');
        if (posTab) posTab.classList.remove('pos-fullscreen');
    }

    // Update Sidebar Navigation Active State
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
    const mainItem = document.getElementById(`menu-${tabId}`);
    if (mainItem) mainItem.classList.add('active');

    // Update Mobile Bottom Nav (if exists)
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('onclick')?.includes(`'${tabId}'`)) {
            item.classList.add('active');
        }
    });
    
    // Switch Content Tabs
    document.querySelectorAll('.tab-content').forEach(div => {
        div.classList.add('hidden');
    });

    const target = document.getElementById(`tab-${tabId}`);
    if (target) {
        target.classList.remove('hidden');
        
        // Tab-specific View Initializations
        if (tabId === 'liveTracker' && typeof window.initLiveRiderTracker === 'function') {
            setTimeout(() => window.initLiveRiderTracker(), 100);
        }
        if (tabId === 'settings' && typeof window.loadStoreSettings === 'function') {
            window.loadStoreSettings();
        }
    }

    // Update Header Titles
    const titles = {
        'dashboard': 'Dashboard',
        'orders': 'Order Management',
        'live': 'Live Operations',
        'walkin': 'POS Control',
        'menu': 'Menu Management',
        'categories': 'Categories',
        'riders': 'Delivery Fleet',
        'customers': 'Customer Base',
        'inventory': 'Inventory Tracking',
        'payments': 'Finances',
        'reports': 'Performance Analytics',
        'liveTracker': 'Rider Tracker',
        'notifications': 'Alerts',
        'settings': 'System Settings'
    };
    
    const titleText = titles[tabId] || 'Admin Dashboard';
    const mainTitle = document.getElementById('currentTabTitle');
    const mobTitle = document.getElementById('mobileTabTitle');
    if (mainTitle) mainTitle.innerText = titleText;
    if (mobTitle) mobTitle.innerText = titleText;
    document.title = `${titleText} | Roshani ERP`;

    // Data Loaders
    const canRead = window.currentOutlet || (window.adminData && window.adminData.isSuper);
    if (!canRead) return;

    if (tabId === 'walkin' && typeof loadWalkinMenu === 'function') loadWalkinMenu();
    if (tabId === 'menu' && typeof loadMenu === 'function') loadMenu();
    if (tabId === 'categories' && typeof loadCategories === 'function') loadCategories();
    if (tabId === 'riders' && typeof loadRiders === 'function') loadRiders();
    if (tabId === 'customers' && typeof loadCustomers === 'function') loadCustomers();
    if (tabId === 'feedback' && typeof loadFeedbacks === 'function') loadFeedbacks();
    if (tabId === 'reports' && typeof loadReports === 'function') loadReports();
};

function updateMobileCartSummaryState() {
    const cartSummary = document.getElementById('mobileCartSummary');
    if (!cartSummary) return;
    
    // Check both tab state and the data
    const cartItems = window.walkinCartData ? Object.values(window.walkinCartData) : [];
    const hasItems = cartItems.length > 0;
    const isWalkinTab = !document.getElementById('tab-walkin').classList.contains('hidden');

    if (hasItems && isWalkinTab && window.innerWidth < 768) {
        cartSummary.classList.remove('hidden');
        document.getElementById('mobileCartCount').innerText = `${cartItems.length} Items`;
        const total = cartItems.reduce((acc, item) => acc + (item.price * item.qty), 0);
        document.getElementById('mobileCartTotal').innerText = `₹${total.toLocaleString()}`;
    } else {
        cartSummary.classList.add('hidden');
    }
}

// =============================
// REAL-TIME LISTENERS
// =============================
function initRealtimeListeners() {
    // Detach any previous listeners first
    if (_ordersChildCb) db.ref("orders").off("child_added", _ordersChildCb);
    if (_ordersChangedCb) db.ref("orders").off("child_changed", _ordersChangedCb);
    if (_ordersValueCb) db.ref("orders").off("value", _ordersValueCb);

    let firstLoad = true;
    const loadTime = Date.now();

    // 1. New Orders Listener
    _ordersChildCb = snap => {
        if (!firstLoad) {
            const order = snap.val();
            const orderTime = typeof order.createdAt === 'number' ? order.createdAt : new Date(order.createdAt).getTime();
            const isRecent = orderTime && (Date.now() - orderTime) < 120000; // 2 min window
            const isPostLoad = orderTime && orderTime > loadTime - 5000;

            if (order && (order.outlet === currentOutlet || !currentOutlet) && order.status === "Placed" && isRecent && isPostLoad) {
                showAlert(order);
                addNotification(`New Order #${snap.key.slice(-5)}`, `Order for ₹${order.total} is placed.`, 'new');
                setTimeout(() => highlightOrder(snap.key), 1000);
            }
        }
    };
    db.ref("orders").on("child_added", _ordersChildCb);

    // 2. Status Transitions (e.g. Delivered)
    _ordersChangedCb = snap => {
        const order = snap.val();
        if (order && (order.outlet === currentOutlet || !currentOutlet)) {
            if (order.status === "Delivered") {
                addNotification(`Order Delivered (#${snap.key.slice(-5)})`, `Customer: ${order.customer?.name || 'Walk-in'} • ₹${order.total}`, 'delivered');
            }
        }
    };
    db.ref("orders").on("child_changed", _ordersChangedCb);

    setTimeout(() => { firstLoad = false; }, 3000);

    // 3. Full Data Sync
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

function showAlert(data, type = 'info') {
    const container = document.getElementById('alertContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `alert-box ${type}`;
    
    if (typeof data === 'string') {
        div.innerHTML = `
            <div class="alert-content">
                <div class="alert-title">${type === 'success' ? '✅' : 'ℹ️'} Message</div>
                <div class="alert-sub">${escapeHtml(data)}</div>
            </div>
        `;
    } else {
        const order = data;
        const orderKey = order.orderId || order.id;
        ordersMap.set(orderKey, order);

        div.innerHTML = `
            <div class="alert-content">
                <div class="alert-title">🔔 New Order #${escapeHtml((order.orderId || order.id).slice(-5))}</div>
                <div class="alert-sub">₹${escapeHtml(order.total)} • ${(order.items || []).length} item(s)</div>
            </div>
            <button class="alert-print-btn" data-order-id="${escapeHtml(orderKey)}">🖨️ Print</button>
        `;

        const printBtn = div.querySelector('.alert-print-btn');
        printBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = e.target.getAttribute('data-order-id');
            const foundOrder = ordersMap.get(id);
            if (foundOrder) printOrderReceipt(foundOrder);
        });
    }

    div.onclick = () => {
        if (typeof data !== 'string') switchTab('orders');
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
// =============================
// PRIVACY WRAPPERS (Global)
// =============================
window.chatOnWhatsapp = (orderId) => {
    const order = ordersMap.get(orderId);
    if (!order || !order.phone) return;
    
    // Only authorized users can see the full number or link
    if (!adminData) return;
    
    const cleanPhone = order.phone.replace(/\D/g, '');
    const msg = `Hi ${order.customerName || 'Customer'}, regarding your order #${order.orderId || orderId.slice(-5)}`;
    const url = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
};

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
        const orderDateStr = o.createdAt ? (typeof o.createdAt === 'string' ? o.createdAt : new Date(o.createdAt).toISOString()).split('T')[0] : '';
        if (orderDateStr === todayStr) today++;

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

        const displayPhone = o.phone ? o.phone : "Guest";
        const truncatedAddress = o.address ? (o.address.length > 30 ? o.address.substring(0, 30) + "..." : o.address) : "Counter Sale";

        // Store full phone in map for authorized actions
        ordersMap.set(id, o);

        const trHTML = `
            <td data-label="Order ID" style="font-family: monospace; font-weight: 600;">#${safeOrderId}</td>
            <td data-label="Customer">
                ${safeCustomerName}<br>
                <small style="color:var(--text-muted)">${displayPhone}</small>
                ${o.phone ? `<button onclick="window.chatOnWhatsapp('${id}')" class="btn-chat" title="Message on WhatsApp">💬</button>` : ''}
            </td>
            <td data-label="Address">
                <span title="${safeAddress}">${escapeHtml(truncatedAddress)}</span>
                ${safeLocationLink ? `<br><a href="${safeLocationLink}" target="_blank" style="color:var(--primary); font-size:11px; text-decoration:none;">📍 Map</a>` : ""}
            </td>
            <td data-label="Total" style="font-weight:700">₹${safeTotal}</td>
            <td data-label="Status"><span class="status ${safeStatusClass}">${safeStatus}</span></td>
            <td data-label="Actions">
                <div class="flex-row flex-gap-5">
                    <select onchange="updateStatus('${id}', this.value)" style="width:100px">
                        <option value="">Status</option>
                        <option value="Confirmed" ${safeStatus === "Confirmed" ? "selected" : ""}>Confirm</option>
                        <option value="Preparing" ${safeStatus === "Preparing" ? "selected" : ""}>Preparing</option>
                        <option value="Cooked" ${safeStatus === "Cooked" ? "selected" : ""}>Cooked</option>
                        <option value="Out for Delivery" ${safeStatus === "Out for Delivery" ? "selected" : ""}>Out for Delivery</option>
                        <option value="Delivered" ${safeStatus === "Delivered" ? "selected" : ""}>Delivered</option>
                        ${["Placed", "Pending"].includes(safeStatus) ? `<option value="Cancelled" ${safeStatus === "Cancelled" ? "selected" : ""}>Cancel</option>` : ""}
                    </select>
                    <button onclick="window.printReceiptById('${o.orderId || id}')" class="btn-icon" style="padding: 4px 8px; font-size: 16px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; cursor: pointer; border-radius: 4px;" title="Print Receipt">🖨️</button>
                </div>
                <div class="mt-5">
                    <select onchange="assignRider('${id}', this.value)" style="width:100%; max-width:145px;">
                        <option value="">Assign Rider</option>
                        ${ridersList.map(r => `<option value="${escapeHtml(r.email)}" ${o.assignedRider === r.email ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}
                    </select>
                </div>
            </td>
        `;
        

        // Populate Dashboard Table (Limit to 10)
        if (ordersCount < 10 && ordersTable) {
            const row = document.createElement("tr");
            row.id = `row-${id}`;
            row.className = "clickable-row";
            row.onclick = () => window.openOrderDrawer(id);
            row.innerHTML = trHTML;
            ordersTable.appendChild(row);
            ordersCount++;
        }

        // Populate Order History
        const rowFull = document.createElement("tr");
        rowFull.className = "clickable-row";
        rowFull.onclick = () => window.openOrderDrawer(id);
        rowFull.innerHTML = trHTML;
        if (document.getElementById("ordersTableFull")) document.getElementById("ordersTableFull").appendChild(rowFull);

        // Populate Live Table
        if (isLive && liveOrdersTable) {
            const rowLive = document.createElement("tr");
            rowLive.className = "clickable-row";
            rowLive.onclick = () => window.openOrderDrawer(id);
            const safeItemsHTML = o.items ? o.items.map(i => `<strong>${escapeHtml(i.name)}</strong> (${escapeHtml(i.size)})${i.addons?.length ? '<br>+ ' + i.addons.map(a => escapeHtml(a.name)).join(', ') : ''}`).join('<br>') : '1 item';
            rowLive.innerHTML = `
                <td data-label="Order ID" style="font-family: monospace; font-weight: 600;">#${safeOrderId}</td>
                <td data-label="Customer">${safeCustomerName}</td>
                <td data-label="Items">
                    <small>
                        ${safeItemsHTML}
                    </small>
                </td>
                <td data-label="Total" style="font-weight:700">₹${safeTotal}</td>
                <td data-label="Status"><span class="status ${safeStatusClass}">${safeStatus}</span></td>
                <td data-label="Rider">
                    <select onchange="assignRider('${id}', this.value)" style="width:120px">
                        <option value="">Select Rider</option>
                        ${ridersList.map(r => `<option value="${escapeHtml(r.email)}" ${o.assignedRider === r.email ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}
                    </select>
                </td>
                <td data-label="Action">
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
                <td data-label="Order ID" style="font-family: monospace;">#${safeOrderId}</td>
                <td data-label="Customer">${safeCustomerName}</td>
                <td data-label="Method">${safePMethod}</td>
                <td data-label="Total" style="font-weight:700">₹${safeTotal}</td>
                <td data-label="Status"><span class="status-${safePStatusClass}">${safePStatus}</span></td>
                <td data-label="Action">
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
                    <div style="position:absolute; top:10px; right:10px; background:${d.stock ? 'rgba(6,95,70,0.9)' : 'rgba(220,38,38,0.9)'}; color:white; padding:4px 10px; border-radius:20px; font-size:10px; font-weight:700; -webkit-backdrop-filter:blur(4px); backdrop-filter:blur(4px);">
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
        'background:rgba(0,0,0,0.7)', '-webkit-backdrop-filter:blur(4px)', 'backdrop-filter:blur(4px)',
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
                    <td data-label="Rider" style="padding:15px">
                        <div style="font-weight:700; color:var(--text-main)">${r.name}</div>
                        <small style="color:var(--action-green); font-weight:600;">${r.phone || 'No Phone'}</small>
                    </td>
                    <td data-label="Credentials" style="padding:15px">
                         <div style="font-size:11px; margin-bottom:4px;"><span style="color:var(--text-muted)">User:</span> <strong>${r.email}</strong></div>
                         <div style="font-size:11px;"><span style="color:var(--text-muted)">Password:</span> <span style="font-family:monospace; background:rgba(0,0,0,0.05); padding:2px 5px; border-radius:4px; font-weight:700; color:var(--action-green)">••••••••</span></div>
                    </td>
                    <td data-label="Status" style="padding:15px"><span class="status ${statusClass}" style="${r.status === 'Offline' ? 'background:rgba(0,0,0,0.1); color:gray' : ''}">${r.status || 'Active'}</span></td>
                    <td data-label="Portal" style="padding:15px">
                        <a href="${portalUrl}" target="_blank" style="font-size:10px; font-weight:800; color:var(--action-green); text-decoration:none; border:2px solid var(--action-green); padding:5px 10px; border-radius:8px; display:inline-block; transition:all 0.2s;" onmouseover="this.style.background='var(--action-green)'; this.style.color='white';" onmouseout="this.style.background='transparent'; this.style.color='var(--action-green)';">
                            🚀 DASHBOARD
                        </a>
                    </td>
                    <td data-label="Stats" style="padding:15px">
                        <div style="font-size:11px;"><strong>${stats.totalOrders}</strong> Orders</div>
                        <div style="font-size:11px; color:var(--action-green); font-weight:700;">₹${stats.totalEarnings.toLocaleString()}</div>
                    </td>
                    <td data-label="Actions" style="padding:15px; display:flex; gap:10px; align-items:center;">
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
// UTILITY: Image Preview to Base64
window.previewImage = (input, previewId) => {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById(previewId);
            const hidden = document.getElementById(previewId.replace('Preview', 'Url'));
            if (preview) preview.src = e.target.result;
            if (hidden) hidden.value = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.showRiderModal = () => {
    isEditRiderMode = false;
    currentEditingRiderId = null;
    document.getElementById('riderModalTitle').innerText = "Add New Rider";
    document.getElementById('saveRiderBtn').innerText = "Create Account";
    document.getElementById('riderEmail').disabled = false;
    document.getElementById('riderPassHint').style.display = "none";
    document.getElementById('riderPassLabel').innerText = "Secret Access Code (Password)";
    
    // Clear all 10 PII fields
    document.getElementById('riderName').value = "";
    document.getElementById('riderEmail').value = "";
    document.getElementById('riderPhone').value = "";
    document.getElementById('riderFatherName').value = "";
    document.getElementById('riderAge').value = "";
    document.getElementById('riderAadharNo').value = "";
    document.getElementById('riderQual').value = "";
    document.getElementById('riderAddress').value = "";
    document.getElementById('riderPass').value = "";
    
    // Reset Images
    document.getElementById('riderProfilePreview').src = "https://via.placeholder.com/150";
    document.getElementById('riderPhotoUrl').value = "";
    document.getElementById('aadharPreview').src = "https://via.placeholder.com/100x60";
    document.getElementById('aadharUrl').value = "";
    
    document.getElementById('riderModal').style.display = 'flex';
};

window.editRider = (id) => {
    const r = ridersList.find(x => x.id === id);
    if (!r) return;

    isEditRiderMode = true;
    currentEditingRiderId = id;
    
    document.getElementById('riderModalTitle').innerText = "Edit Rider Details";
    document.getElementById('saveRiderBtn').innerText = "Update Rider";
    document.getElementById('riderEmail').disabled = true;
    document.getElementById('riderPassHint').style.display = "block";
    document.getElementById('riderPassLabel').innerText = "Update Password (Optional)";

    // Populate all 10 PII fields
    document.getElementById('riderName').value = r.name || "";
    document.getElementById('riderEmail').value = r.email || "";
    document.getElementById('riderPhone').value = r.phone || "";
    document.getElementById('riderFatherName').value = r.fatherName || "";
    document.getElementById('riderAge').value = r.age || "";
    document.getElementById('riderAadharNo').value = r.aadharNo || "";
    document.getElementById('riderQual').value = r.qualification || "";
    document.getElementById('riderAddress').value = r.address || "";
    document.getElementById('riderPass').value = ""; 

    // Populate Images
    document.getElementById('riderProfilePreview').src = r.profilePhoto || "https://via.placeholder.com/150";
    document.getElementById('riderPhotoUrl').value = r.profilePhoto || "";
    document.getElementById('aadharPreview').src = r.aadharPhoto || "https://via.placeholder.com/100x60";
    document.getElementById('aadharUrl').value = r.aadharPhoto || "";

    document.getElementById('riderModal').style.display = 'flex';
};

window.hideRiderModal = () => document.getElementById('riderModal').style.display = 'none';

window.saveRiderAccount = async () => {
    const name = document.getElementById('riderName').value.trim();
    const email = document.getElementById('riderEmail').value.trim();
    const pass = document.getElementById('riderPass').value;
    const phone = document.getElementById('riderPhone').value.trim();
    const fatherName = document.getElementById('riderFatherName').value.trim();
    const age = document.getElementById('riderAge').value;
    const aadharNo = document.getElementById('riderAadharNo').value.trim();
    const qualification = document.getElementById('riderQual').value.trim();
    const address = document.getElementById('riderAddress').value.trim();
    const profilePhoto = document.getElementById('riderPhotoUrl').value;
    const aadharPhoto = document.getElementById('aadharUrl').value;

    if (!name || !email) {
        alert("Name and Email are required.");
        return;
    }

    // Strict 12-digit Aadhar Validation
    if (!/^\d{12}$/.test(aadharNo)) {
        alert("Invalid Aadhar Number! It must be exactly 12 digits.");
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
        }

        // 2. Save/Update rider details to DB
        const riderData = {
            name,
            email,
            phone,
            fatherName,
            age,
            aadharNo,
            qualification,
            address,
            profilePhoto,
            aadharPhoto,
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
                    <td data-label="Name">
                        <div style="font-weight:600; color:var(--text-main)">${escapeHtml(c.name)}</div>
                        <small style="color:var(--text-muted); font-size:10px;">Joined: ${c.registeredAt ? new Date(c.registeredAt).toLocaleDateString() : 'N/A'}</small>
                    </td>
                    <td data-label="WhatsApp">
                        <a href="https://wa.me/${phone.replace(/\D/g, "")}" target="_blank" style="color:var(--primary); text-decoration:none; display:flex; align-items:center; gap:5px;">
                            <i class="fab fa-whatsapp"></i> ${displayPhone}
                        </a>
                    </td>
                    <td data-label="Last Address">
                        <div style="font-size:12px; color:var(--text-main); max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(c.address || '')}">
                            ${escapeHtml(truncatedAddress)}
                        </div>
                        ${c.locationLink ? `<a href="${c.locationLink}" target="_blank" style="color:var(--primary); font-size:10px; text-decoration:none;">📍 Map Link</a>` : ""}
                    </td>
                    <td data-label="Orders" style="font-weight:600; color:var(--vibrant-orange)">${orderCount}</td>
                    <td data-label="LTV" style="font-weight:700; color:var(--warm-yellow)">₹${ltv.toLocaleString()}</td>
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
                <td data-label="Date" style="padding:15px; font-family:monospace; font-size:12px;">${formatDate(o.createdAt)}</td>
                <td data-label="Customer" style="padding:15px;">
                    <div style="font-weight:700; color:var(--text-main)">${o.customerName || 'Guest'}</div>
                    <div style="font-size:11px; color:var(--text-muted)">${o.phone || ''}</div>
                </td>
                <td data-label="Total" style="padding:15px; font-weight:800; color:var(--action-green)">₹${o.total || 0}</td>
                <td data-label="Method" style="padding:15px;"><small>${o.paymentMethod || 'COD'}</small></td>
                <td data-label="Items" style="padding:15px;">
                    <div style="max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; color:var(--text-muted)" title="${o.items ? o.items.map(i => `${i.name} x${i.quantity}`).join(', ') : ''}">
                        ${o.items ? o.items.map(i => `${i.name} x${i.quantity}`).join(', ') : 'Empty'}
                    </div>
                </td>
            </tr>
        `).join('') || "<tr><td colspan='5' style='text-align:center; padding:30px; color:var(--text-muted)'>No orders found for this range</td></tr>";

        // Render visual chart
        renderRevenueChart(salesData);
    });
};

let revenueChart; // Global chart instance
function renderRevenueChart(data) {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    // Aggregate by date
    const dailyData = {};
    data.forEach(o => {
        dailyData[o.dateStr] = (dailyData[o.dateStr] || 0) + Number(o.total || 0);
    });

    const labels = Object.keys(dailyData).sort();
    const values = labels.map(l => dailyData[l]);

    if (revenueChart) revenueChart.destroy();

    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Daily Revenue',
                data: values,
                borderColor: '#FF6B00',
                backgroundColor: 'rgba(255, 107, 0, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#FF6B00',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

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

        await db.ref("appConfig").update({ 
            shopName, 
            deliveryFee: Number(fee), 
            minOrder: Number(minOrder),
            address: addr, 
            whatsapp,
            status,
            masterOTP 
        });
        await db.ref("uiConfig").update({ welcomeImage: welcome, menuImage: menu });
        
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
window.toggleWifiPass = () => {
    const passInput = document.getElementById('settingWifiPass');
    if (passInput.type === 'password') {
        passInput.type = 'text';
    } else {
        passInput.type = 'password';
    }
};

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

    if (!window.jspdf) {
        alert("PDF export library not ready. Please refresh and try again.");
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
// formatDate already defined at top of file

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
        updateMobileCartSummaryState(); // Keep mobile summary synced
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
    updateMobileCartSummaryState(); // Keep mobile summary synced
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

    // Export walkinCart to window for mobile summary logic
    window.walkinCartData = walkinCart; 
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
            await custRef.transaction((current) => {
                if (current) {
                    current.orders = (current.orders || 0) + 1;
                    current.ltv = (current.ltv || 0) + total;
                    current.lastSeen = firebase.database.ServerValue.TIMESTAMP;
                    current.name = custName;
                    current.lastAddress = 'Walk-in';
                    return current;
                } else {
                    return {
                        name: custName,
                        orders: 1,
                        ltv: total,
                        lastSeen: firebase.database.ServerValue.TIMESTAMP,
                        lastAddress: 'Walk-in'
                    };
                }
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
        const storeSnap = await db.ref("settings/Store").once("value");
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
        const delSnap = await db.ref("settings/Delivery").once("value");
        let delData = delSnap.val() || {
            coords: { lat: 25.887444, lng: 85.026889 },
            slabs: [{ km: 2, fee: 20 }, { km: 5, fee: 40 }, { km: 8, fee: 60 }]
        };

        // Load Receipt / Store Info Settings
        const storeSnap = await db.ref("settings/Store").once("value");
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
            db.ref("settings/Delivery").update({ coords: { lat, lng }, notifyPhone, slabs }),
            db.ref("settings/Store").update(storeData)
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
                    <td data-label="Date" style="padding:15px; font-size:12px;">${dateStr}</td>
                    <td data-label="Order ID" style="padding:15px; font-family:monospace; font-weight:700;">#${escapeHtml(f.orderId || 'N/A')}</td>
                    <td data-label="Customer" style="padding:15px">
                        <div style="font-weight:700;">${escapeHtml(f.customerName || 'Guest')}</div>
                        <small style="color:var(--text-muted);">${escapeHtml(f.phone || '')}</small>
                    </td>
                    <td data-label="Rating" style="padding:15px; font-size:14px;">${stars}</td>
                    <td data-label="Feedback" style="padding:15px">
                        <div style="font-weight:600; color:var(--text-main);">${escapeHtml(f.reason || f.feedback || '')}</div>
                        ${f.comment ? `<div style="font-size:12px; color:var(--text-muted); margin-top:4px; font-style:italic;">"${escapeHtml(f.comment)}"</div>` : ''}
                    </td>
                </tr>
            `;
        });
    });
}

/**
 * =============================================
 * 9. LIVE RIDER TRACKER (ADMIN)
 * =============================================
 */
let adminTrackerMap = null;
let riderMarkersMap = new Map(); // Store markers by rider ID

window.initLiveRiderTracker = () => {
    const mapDiv = document.getElementById('adminLiveMap');
    if (!mapDiv || adminTrackerMap) return;

    // Initialize Map at a default center (e.g. India)
    adminTrackerMap = L.map('adminLiveMap').setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(adminTrackerMap);

    startRiderLocationListener();
};

function startRiderLocationListener() {
    db.ref('riders').on('value', snap => {
        let onlineCount = 0;
        let bounds = [];

        snap.forEach(child => {
            const r = child.val();
            const id = child.key;

            if (r.status === "Online" && r.location) {
                onlineCount++;
                const pos = [r.location.lat, r.location.lng];
                bounds.push(pos);

                if (riderMarkersMap.has(id)) {
                    // Update existing marker
                    const marker = riderMarkersMap.get(id);
                    marker.setLatLng(pos);
                    marker.getPopup().setContent(`
                        <div style="font-family: 'Outfit', sans-serif;">
                            <strong style="color:var(--primary)">${escapeHtml(r.name)}</strong><br>
                            <small>${escapeHtml(r.phone)}</small><br>
                            <div style="margin-top:5px; font-size:10px; font-weight:800; color:var(--success)">MOVED: ${new Date(r.location.ts).toLocaleTimeString()}</div>
                        </div>
                    `);
                } else {
                    // Create new marker
                    const marker = L.marker(pos, {
                        icon: L.icon({
                            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                            iconSize: [25, 41],
                            iconAnchor: [12, 41],
                            popupAnchor: [1, -34],
                            shadowSize: [41, 41]
                        })
                    }).addTo(adminTrackerMap).bindPopup(`
                        <div style="font-family: 'Outfit', sans-serif;">
                            <strong style="color:var(--primary)">${escapeHtml(r.name)}</strong><br>
                            <small>${escapeHtml(r.phone)}</small>
                        </div>
                    `);
                    riderMarkersMap.set(id, marker);
                }
            } else {
                // Remove marker if rider goes offline
                if (riderMarkersMap.has(id)) {
                    adminTrackerMap.removeLayer(riderMarkersMap.get(id));
                    riderMarkersMap.delete(id);
                }
            }
        });

        // Update Stats UI
        const statsEl = document.getElementById('trackerStats');
        if (statsEl) statsEl.innerText = `${onlineCount} Riders Online`;

        // Fit map to show all riders if it's the first load or count changed
        if (bounds.length > 0 && adminTrackerMap) {
            const currentBounds = L.latLngBounds(bounds);
            adminTrackerMap.fitBounds(currentBounds, { padding: [50, 50], maxZoom: 15 });
        }
    });
}

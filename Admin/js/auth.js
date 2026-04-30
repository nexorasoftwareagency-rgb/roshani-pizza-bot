import { auth, Outlet, ServerValue, EmailAuthProvider } from './firebase.js';
import { state } from './state.js';
import { showToast, logAudit } from './utils.js';
import * as ui from './ui.js';
import { initRealtimeListeners } from './features/orders.js';
import { loadRiders } from './features/riders.js';

let idleTimer;
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        showToast("Session expired due to inactivity", "info");
        auth.signOut();
    }, IDLE_TIMEOUT);
}

function updateBranding() {
    const brand = window.currentOutlet === 'cake' ? 'cake' : 'pizza';
    const primary = brand === 'pizza' ? '#F97316' : '#EC4899';
    const bg = brand === 'pizza' ? '#F8FAFC' : '#FFF1F2';
    
    document.documentElement.style.setProperty('--primary', primary);
    document.documentElement.style.setProperty('--bg-secondary', bg);
    
    const badge = document.getElementById('outletBadge');
    const mobileBadge = document.getElementById('mobileOutletBadge');
    const label = brand === 'pizza' ? '🍕 PIZZA OUTLET' : '🎂 CAKE OUTLET';
    
    if (badge) {
        badge.innerText = label;
        badge.className = `outlet-badge ${brand}`;
    }
    if (mobileBadge) {
        mobileBadge.innerText = label;
        mobileBadge.className = `outlet-badge ${brand}`;
    }
}

export function initAuth() {
    console.log("[Auth] Initializing State Listener...");
    
    // Setup login form listener
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            const emailEl = document.getElementById("adminEmail");
            const passEl = document.getElementById("adminPassword");
            if (emailEl && passEl) {
                doLogin(emailEl.value.trim(), passEl.value);
            } else {
                console.warn("[Auth] Login form fields missing!");
            }
        };
    }

    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            console.log("[Auth] State: Logged Out");
            state.adminData = null;
            const overlay = document.getElementById("authOverlay");
            const layout = document.querySelector(".layout");
            if (overlay) overlay.classList.remove('hidden');
            if (layout) layout.classList.add('hidden');
            return;
        }

        console.log("[Auth] State Change:", user.email, "Verified:", user.emailVerified);
        
        let adminData = null;
        try {
            console.log("[Auth] Fetching admin record for:", user.uid);
            
            // Use a promise with timeout to prevent hang
            const adminSnap = await Promise.race([
                Outlet.ref(`admins/${user.uid}`).once("value"),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
            ]);
            
            adminData = adminSnap.val();
            console.log("[Auth] Admin Data Received:", adminData ? "OK" : "MISSING");
        } catch (e) {
            console.error("[Auth] Admin Profile Fetch Error:", e);
            // Check custom claims for emergency super admin access
            try {
                const token = await user.getIdTokenResult(true);
                if (token.claims.admin) {
                    console.log("[Auth] Emergency Super Admin Access Granted via Claims");
                    adminData = { email: user.email, isSuper: true, name: "Super Admin", outlet: "pizza" };
                }
            } catch (claimsErr) {
                console.error("[Auth] Claims Check Failed:", claimsErr);
            }
        }

        if (!adminData) {
            showToast("ACCESS DENIED: Unauthorized Account", "error");
            setTimeout(() => auth.signOut(), 1500);
            return;
        }

        // Initialize Session
        state.adminData = adminData;
        logAudit('LOGIN_SUCCESS', { email: user.email });
        resetIdleTimer();

        const savedOutlet = sessionStorage.getItem('adminSelectedOutlet') || adminData.outlet || 'pizza';
        window.currentOutlet = savedOutlet.toLowerCase();

        // Handle Multi-Outlet Logic
        if (adminData.isSuper) {
            const switcher = document.getElementById('outletSwitcher');
            const switcherMobile = document.getElementById('outletSwitcherMobile');
            const outletOptionsHtml = `
                <option value="pizza">🍕 Pizza ERP</option>
                <option value="cake">🎂 Cakes ERP</option>
            `;
            if (switcher) {
                switcher.classList.remove('hidden');
                switcher.innerHTML = outletOptionsHtml;
                switcher.value = window.currentOutlet;
            }
            if (switcherMobile) {
                switcherMobile.classList.remove('hidden');
                switcherMobile.innerHTML = outletOptionsHtml;
                switcherMobile.value = window.currentOutlet;
            }
        }

        // Sync Branding
        const brandType = window.currentOutlet === 'cake' ? 'cake' : 'pizza';
        if (sessionStorage.getItem('admin_brand') !== brandType) {
            sessionStorage.setItem('admin_brand', brandType);
            location.reload();
            return;
        }

        // Show UI
        const authOverlay = document.getElementById("authOverlay");
        const layout = document.querySelector(".layout");
        if (authOverlay) authOverlay.classList.add('hidden');
        if (layout) {
            layout.classList.remove('hidden');
            layout.classList.add('flex');
        }

        const emailDisplay = document.getElementById("userEmailDisplay");
        if (emailDisplay) emailDisplay.innerText = user.email;

        // Start Features
        updateBranding();
        loadRiders();
        initRealtimeListeners();
        ui.switchTab('dashboard');
    });
}

export async function reauthenticateAdmin(password) {
    const user = auth.currentUser;
    if (!user) throw new Error("No user logged in.");
    const credential = EmailAuthProvider.credential(user.email, password);
    return user.reauthenticateWithCredential(credential);
}

export function requireAdminReauth(onSuccess) {
    const modal = document.getElementById('reauthModal');
    const passInput = document.getElementById('reauthPassword');
    const confirmBtn = document.getElementById('btnConfirmReauth');

    if (!modal || !passInput || !confirmBtn) return;

    modal.classList.remove('hidden');
    passInput.value = "";
    passInput.focus();

    confirmBtn.onclick = async () => {
        const pass = passInput.value;
        if (!pass) return showToast("Enter password", "warning");
        try {
            confirmBtn.disabled = true;
            confirmBtn.innerText = "Verifying...";
            await reauthenticateAdmin(pass);
            modal.classList.add('hidden');
            onSuccess();
        } catch (e) {
            showToast("Invalid password", "error");
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.innerText = "Confirm Access";
        }
    };
}

/**
 * LOGOUT
 */
export function userLogout() {
    logAudit('LOGOUT', { email: auth.currentUser?.email });
    auth.signOut();
}

/**
 * LOGIN (Manual trigger)
 */
export async function doLogin(email, pass) {
    const btn = document.querySelector("#loginForm button");
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerText = "Authenticating...";
        }
        await auth.signInWithEmailAndPassword(email, pass);
        logAudit('LOGIN_ATTEMPT', { email });
    } catch (error) {
        console.error("Login Error:", error);
        showToast(error.message, "error");
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Sign In";
        }
    }
}

import { auth, Outlet, ServerValue, EmailAuthProvider } from './firebase.js';
import { state } from './state.js';
import { showToast, logAudit } from './utils.js';
import * as ui from './ui.js';
import { initRealtimeListeners } from './features/orders.js';
import { loadRiders } from './features/riders.js';
import { updateBranding } from './branding.js';

let idleTimer;
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        showToast("Session expired due to inactivity", "info");
        userLogout();
    }, IDLE_TIMEOUT);
}

function initActivityListeners() {
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'visibilitychange'];
    events.forEach(e => window.addEventListener(e, resetIdleTimer, { passive: true }));
}

function removeActivityListeners() {
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'visibilitychange'];
    events.forEach(e => window.removeEventListener(e, resetIdleTimer));
}


export function initAuth() {
    console.log("[Auth] Initializing State Listener...");

    // Setup login form listener
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            const emailEl = document.getElementById("loginEmail");
            const passEl = document.getElementById("loginPassword");
            if (emailEl && passEl) {
                doLogin(emailEl.value.trim(), passEl.value);
            } else {
                console.warn("[Auth] Login form fields missing!");
            }
        };
    }

    // Add diagnostic button to login form (Gated for non-production/debug only)
    const isDebuggable = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || localStorage.getItem('DEBUG_MODE') === 'true';
    const loginCard = document.querySelector('.login-card');
    if (loginCard && isDebuggable && !document.getElementById('diagnosticBtn')) {
        const diagBtn = document.createElement('button');
        diagBtn.id = 'diagnosticBtn';
        diagBtn.type = 'button';
        diagBtn.innerText = '🔍 Run Diagnostics';
        diagBtn.style.cssText = 'margin-top: 15px; background: #666; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px;';
        diagBtn.onclick = () => {
            if (window.diagnoseDatabase) {
                window.diagnoseDatabase();
            } else {
                console.log("Diagnostic function not loaded yet");
            }
        };
        loginCard.appendChild(diagBtn);
    }

    auth.onAuthStateChanged(async (user) => {
        console.log("[Auth] State change detected:", user ? `Logged in as ${user.email}` : "Logged out");
        if (!user) {
            console.log("[Auth] State: Logged Out");
            state.adminData = null;
            const overlay = document.getElementById("authOverlay");
            const layout = document.querySelector(".layout");
            const loginBtn = document.querySelector("#loginForm button");
            
            if (overlay) overlay.classList.remove('hidden');
            if (layout) layout.classList.add('hidden');
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerText = "Sign In";
            }
            return;
        }

        console.log("[Auth] State Change:", user.email, "Verified:", user.emailVerified);
        console.log(`[Auth] User Logged In: ${user.email} (UID: ${user.uid})`);
        
        let adminData = null;
        try {
            console.log("[Auth] Fetching admin record for:", user.uid);
            console.log(`[Auth] Fetching profile from: admins/${user.uid}`);
            console.log("[Auth] Current outlet:", window.currentOutlet);

            // Ensure global paths are used for system-wide nodes
            const adminSnap = await Promise.race([
                db.ref(`admins/${user.uid}`).once("value"),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000))
            ]);
            console.log("[Auth] Admin snapshot exists:", adminSnap.exists());
            if (adminSnap.exists()) {
                const rawVal = adminSnap.val();
                const sanitized = { id: rawVal.id || user.uid, email: rawVal.email, role: rawVal.role, outlet: rawVal.outlet };
                console.log("[Auth] Admin snapshot (sanitized):", sanitized);
            }
            
            adminData = adminSnap.val();
            console.log("[Auth] Admin Data Received:", adminData ? "OK" : "MISSING");
            
            if (!adminData) {
                console.error("[Auth] Access Denied: No profile found for UID", user.uid);
                throw new Error("ACCESS_DENIED");
            }
            console.log("[Auth] Profile loaded successfully:", adminData.name, "(Outlet:", adminData.outlet, ")");
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
            console.error("[Auth] No admin data found after profile fetch and claims check.");
            showToast("ACCESS DENIED: Unauthorized Account", "error");
            
            const overlay = document.getElementById("authOverlay");
            if (overlay) {
                overlay.innerHTML = ''; // Clear previous content
                const modal = document.createElement('div');
                modal.className = 'auth-modal';
                
                const title = document.createElement('h2');
                title.className = 'text-danger';
                title.textContent = 'ACCESS DENIED';
                
                const msg = document.createElement('p');
                msg.textContent = 'No administrative profile found for this account.';
                
                const uidInfo = document.createElement('p');
                uidInfo.className = 'fs-12 text-muted';
                uidInfo.textContent = `UID: ${user.uid}`;
                
                const retryBtn = document.createElement('button');
                retryBtn.className = 'btn-primary mt-20';
                retryBtn.textContent = 'Try Another Account';
                retryBtn.addEventListener('click', () => location.reload());
                
                modal.append(title, msg, uidInfo, retryBtn);
                overlay.appendChild(modal);
            }
            
            setTimeout(() => auth.signOut(), 3000);
            return;
        }

        // Initialize Session
        state.adminData = adminData;
        logAudit('LOGIN_SUCCESS', { email: user.email });
        resetIdleTimer();
        initActivityListeners();

        const savedOutlet = sessionStorage.getItem('adminSelectedOutlet') || adminData.outlet || 'pizza';
        window.currentOutlet = savedOutlet.toLowerCase();
        state.currentOutlet = window.currentOutlet;

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
        
        // Initial Tab Navigation (Respect Hash or Default to Dashboard)
        const initialTab = window.location.hash.replace('#', '') || 'dashboard';
        ui.switchTab(initialTab, true);
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

    if (!modal || !passInput || !confirmBtn) {
        console.warn("[Auth] Reauth modal elements missing, bypassing...");
        if (typeof onSuccess === 'function') onSuccess();
        return;
    }

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
    removeActivityListeners();
    clearTimeout(idleTimer);
    auth.signOut();
}

/**
 * LOGIN (Manual trigger)
 */
export async function doLogin(email, pass) {
    const btn = document.getElementById("loginBtn");
    const errEl = document.getElementById("loginError");
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>Accessing Dashboard...</span> <div class="loading-spinner-small ml-10"></div>';
        }
        if (errEl) errEl.classList.add('hidden');
        
        logAudit('LOGIN_ATTEMPT', { email });
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (error) {
        console.error("Login Error:", error);
        if (errEl) {
            errEl.innerText = error.message;
            errEl.classList.remove('hidden');
        } else {
            showToast(error.message, "error");
        }
        
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Access Dashboard</span> <i data-lucide="arrow-right" class="ml-10" style="width:18px;"></i>';
            if (window.lucide) window.lucide.createIcons();
        }
    }
}

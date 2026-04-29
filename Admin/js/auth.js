import { auth, Outlet, db } from './firebase.js';
import { state } from './state.js';
import { showToast, haptic, logAudit } from './utils.js';
import { ui } from './ui.js';
import { updateBranding } from './branding.js';
import { loadRiders } from './features/riders.js';
import { initRealtimeListeners } from './features/orders.js';

const { switchTab } = ui;

let loginInProgress = false;
let loginCooldownActive = false;
let idleTimer;
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function resetIdleTimer() {
    if (!auth.currentUser) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        logAudit('SESSION_EXPIRED_IDLE');
        userLogout();
        showToast("Session expired due to inactivity.", "info");
    }, IDLE_TIMEOUT);
}

['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, resetIdleTimer, { passive: true });
});


/**
 * Standardizes Firebase Auth error messages.
 */
function standardizeAuthError(error) {
    if (!error || !error.code) return "An unexpected error occurred. Please try again.";

    switch (error.code) {
        case 'auth/invalid-email': return "The email address is not valid.";
        case 'auth/user-disabled': return "This account has been disabled.";
        case 'auth/user-not-found':
        case 'auth/wrong-password': return "Incorrect email or password.";
        case 'auth/too-many-requests': return "Too many failed attempts. Security lock active.";
        case 'auth/quota-exceeded': return "Login Quota Exceeded (Spark Plan limit).";
        case 'auth/email-already-in-use': return "This email address is already in use.";
        case 'auth/network-request-failed': return "Network error. Please check your connection.";
        default: return error.message || "Authentication failed.";
    }
}

export function doLogin() {
    if (loginInProgress) return;
    if (loginCooldownActive) {
        showToast("Please wait a few seconds before trying again.", "warning");
        return;
    }

    haptic(10);

    const emailEl = document.getElementById('adminEmail');
    const passEl = document.getElementById('adminPassword');
    const errorEl = document.getElementById('authError');
    const loginBtn = document.getElementById('loginBtn');

    if (!emailEl || !passEl) return;

    const email = emailEl.value.trim();
    const pass = passEl.value;

    if (!email || !pass) {
        if (errorEl) errorEl.innerText = "Please enter email and password.";
        return;
    }

    loginInProgress = true;
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerText = "Signing in...";
    }
    if (errorEl) errorEl.innerText = "Authenticating...";

    auth.signInWithEmailAndPassword(email, pass)
        .then(() => {
            loginInProgress = false;
        })
        .catch(e => {
            console.error("Login Error:", e);
            if (errorEl) errorEl.innerText = standardizeAuthError(e);
            loginInProgress = false;
            loginCooldownActive = true;
            setTimeout(() => { loginCooldownActive = false; }, 3000); 

            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerText = "Sign In";
            }
        });
}

export function userLogout() {
    const confirmed = confirm("Are you sure you want to logout?");
    if (!confirmed) return;
    
    logAudit('LOGOUT_INITIATED');
    const overlay = document.getElementById("authOverlay");
    const layout = document.querySelector(".layout");

    if (overlay) overlay.classList.remove('hidden');
    if (layout) layout.classList.add('hidden');

    sessionStorage.removeItem('adminSelectedOutlet');
    sessionStorage.removeItem('admin_brand');

    auth.signOut().catch(err => console.error("Logout Error:", err));
}

/**
 * Initialize Auth State Listener
 */
export function initAuth() {
    auth.onAuthStateChanged(async user => {
        console.log("[Auth] State Change:", user ? user.email : "Logged Out");

        if (!user) {
            clearTimeout(idleTimer);
            const authOverlay = document.getElementById("authOverlay");
            const layout = document.querySelector(".layout");
            if (authOverlay) {
                authOverlay.classList.remove('hidden');
                authOverlay.style.display = 'flex';
            }
            if (layout) layout.classList.add('hidden');
            return;
        }

        try {
            let adminData = null;
            let adminSnap = await Outlet.ref(`admins/${user.uid}`).once("value");
            adminData = adminSnap.val();

            if (!adminData) {
                const allSnap = await Outlet.ref("admins").once("value");
                const normalizedEmail = (user.email || "").toLowerCase();
                allSnap.forEach(snap => {
                    const val = snap.val();
                    if (val && val.email && val.email.toLowerCase() === normalizedEmail) {
                        adminData = val;
                        Outlet.ref(`admins/${user.uid}`).set({
                            ...val,
                            updatedAt: firebase.database.ServerValue.TIMESTAMP
                        });
                    }
                });
            }

            if (!adminData) {
                const token = await user.getIdTokenResult(true);
                if (token.claims.admin) {
                    adminData = { email: user.email, isSuper: true, name: "Super Admin", outlet: "pizza" };
                }
            }

            if (!adminData) {
                showToast("ACCESS DENIED: Unauthorized Account", "error");
                setTimeout(() => auth.signOut(), 1500);
                return;
            }

            state.adminData = adminData;
            logAudit('LOGIN_SUCCESS', { email: user.email });
            resetIdleTimer();
            
            // Handle Multi-Outlet Logic
            const savedOutlet = sessionStorage.getItem('adminSelectedOutlet') || adminData.outlet || 'pizza';
            window.currentOutlet = savedOutlet.toLowerCase();

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

            document.getElementById("userEmailDisplay").innerText = user.email;

            // Initializations (Direct calls)
            updateBranding();
            loadRiders();
            initRealtimeListeners();
            switchTab('dashboard');

        } catch (e) {
            console.error("Auth Exception:", e);
        }
    });
}

/**
 * Re-authenticates the current admin for sensitive operations (Phase 2.15).
 */
export async function reauthenticateAdmin(password) {
    const user = auth.currentUser;
    if (!user) throw new Error("No user logged in.");

    const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
    return user.reauthenticateWithCredential(credential);
}

/**
 * Global helper to trigger re-auth modal.
 */
export function requireAdminReauth(onSuccess) {
    const modal = document.getElementById('reauthModal');
    const passInput = document.getElementById('reauthPassword');
    const confirmBtn = document.getElementById('btnConfirmReauth');

    if (!modal || !passInput || !confirmBtn) {
        console.warn("Re-auth UI elements not found. Proceeding with caution.");
        onSuccess();
        return;
    }

    modal.classList.add('active');
    passInput.value = "";
    passInput.focus();

    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

    newBtn.addEventListener('click', async () => {
        const password = passInput.value;
        if (!password) {
            showToast("Password required for verification", "error");
            return;
        }

        newBtn.disabled = true;
        newBtn.innerHTML = `<i class="shimmer-fast"></i> Verifying...`;

        try {
            await reauthenticateAdmin(password);
            modal.classList.remove('active');
            showToast("Identity verified", "success");
            onSuccess();
        } catch (e) {
            console.error("Re-auth failed:", e);
            showToast(standardizeAuthError(e), "error");
        } finally {
            newBtn.disabled = false;
            newBtn.innerText = "Verify & Proceed";
        }
    });
}

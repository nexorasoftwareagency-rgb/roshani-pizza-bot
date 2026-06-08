/**
 * RIDER Auth + Profile — login, logout, status toggle, profile editing.
 */
import { auth, db, ref, update, serverTimestamp, signInWithEmailAndPassword, signOut } from './firebase.js';
import { initLocationTracking, stopLocationTracking } from './geo.js';

export function initAuth() {
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
            if (['auth/wrong-password', 'auth/user-not-found', 'auth/invalid-credential'].includes(e.code)) {
                msg = "Incorrect mobile number or password.";
            } else if (e.code === 'auth/too-many-requests') {
                msg = "Too many failed attempts. Try again later.";
            } else if (e.code === 'auth/network-request-failed') {
                msg = "Network error. Check internet connection.";
            }
            window.showToast(msg, "error");
        }
    };

    window.logout = async () => {
        if (await window.showConfirm("End your shift and logout?", "Confirm Logout")) {
            window.clearAllListeners();
            try {
                if (window.currentUser?.profile?.id) {
                    await update(ref(db, `riders/${window.currentUser.profile.id}`), { status: 'Offline', lastSeen: serverTimestamp() });
                }
            } catch (_) {}
            localStorage.removeItem('rider_authenticated');
            await signOut(auth);
        }
    };

    window.toggleRiderStatus = async () => {
        if (!window.currentUser?.profile) return window.showToast("Authentication error.", "error");
        const currentStatus = window.currentUser.profile.status || "Offline";
        const newStatus = currentStatus === "Online" ? "Offline" : "Online";
        try {
            await update(ref(db, `riders/${window.currentUser.profile.id}`), { status: newStatus, lastSeen: serverTimestamp() });
            window.currentUser.profile.status = newStatus;
            const btn = document.getElementById('statusToggleBtn');
            if (btn) {
                btn.classList.remove('Online', 'Offline', 'Busy');
                btn.classList.add(newStatus);
                const label = btn.querySelector('.status-text') || btn.querySelector('span');
                if (label) label.innerText = newStatus.toUpperCase();
                const dot = btn.querySelector('.pulse-dot');
                if (dot) { dot.classList.remove('Online', 'Offline', 'Busy'); dot.classList.add(newStatus); }
            }
            window.showToast(`You are now ${newStatus}`, "info");
            if (newStatus === "Online") initLocationTracking(); else stopLocationTracking();
        } catch (e) { window.showToast("Failed to sync status", "error"); }
    };

    // Profile sub-views
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

    // Profile photo upload
    window.triggerProfilePhotoUpload = () => {
        const input = document.getElementById('profile-photo-input');
        if (input) input.click();
    };

    window.uploadProfilePhoto = async (e) => {
        if (!window.currentUser?.profile?.id) return window.showToast("Not logged in.", "error");
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 500 * 1024) return window.showToast("Image too large (>500KB). Please compress.", "error");
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const base64 = ev.target.result;
            try {
                await update(ref(db, `riders/${window.currentUser.profile.id}`), { profilePhoto: base64 });
                window.currentUser.profile.profilePhoto = base64;
                const img = document.getElementById('r-profile-img');
                if (img) img.src = base64;
                const cached = JSON.parse(localStorage.getItem('riderProfile') || '{}');
                cached.profilePhoto = base64;
                localStorage.setItem('riderProfile', JSON.stringify(cached));
                window.showToast("Profile photo updated", "success");
            } catch (err) { window.showToast("Upload failed. Try again.", "error"); }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    // Profile phone edit
    window.editProfilePhone = async () => {
        if (!window.currentUser?.profile?.id) return;
        const span = document.getElementById('profilePhoneValue');
        if (!span) return;
        const current = window.currentUser.profile.phone || '';
        const newVal = prompt("Enter your new phone number:", current);
        if (newVal === null) return;
        const trimmed = newVal.trim();
        if (!trimmed) return window.showToast("Phone cannot be empty.", "error");
        if (!/^[0-9+\-\s]{6,20}$/.test(trimmed)) return window.showToast("Invalid phone format.", "error");
        try {
            await update(ref(db, `riders/${window.currentUser.profile.id}`), { phone: trimmed });
            window.currentUser.profile.phone = trimmed;
            span.innerText = trimmed;
            const profilePhone = document.getElementById('profilePhone');
            if (profilePhone) profilePhone.innerText = trimmed;
            const cached = JSON.parse(localStorage.getItem('riderProfile') || '{}');
            cached.phone = trimmed;
            localStorage.setItem('riderProfile', JSON.stringify(cached));
            window.showToast("Phone updated", "success");
        } catch (err) { window.showToast("Failed to update phone.", "error"); }
    };

    // Profile address edit
    window.editProfileAddress = async () => {
        if (!window.currentUser?.profile?.id) return;
        const span = document.getElementById('r-address');
        if (!span) return;
        const current = window.currentUser.profile.address || '';
        const newVal = prompt("Enter your new address:", current);
        if (newVal === null) return;
        const trimmed = newVal.trim();
        if (!trimmed) return window.showToast("Address cannot be empty.", "error");
        try {
            await update(ref(db, `riders/${window.currentUser.profile.id}`), { address: trimmed });
            window.currentUser.profile.address = trimmed;
            span.innerText = trimmed;
            const cached = JSON.parse(localStorage.getItem('riderProfile') || '{}');
            cached.address = trimmed;
            localStorage.setItem('riderProfile', JSON.stringify(cached));
            window.showToast("Address updated", "success");
        } catch (err) { window.showToast("Failed to update address.", "error"); }
    };
}

import { db, auth, secondaryAuth, secondaryAuthAvailable, Outlet } from '../firebase.js';
import { state } from '../state.js';
import { showToast, haptic, escapeHtml, standardizeAuthError, logAudit, showConfirm } from '../utils.js';
import { uploadImage } from '../firebase.js';
import { requireAdminReauth } from '../auth.js';

/**
 * INITIALIZE RIDER DATA
 */
export function loadRiders() {
    // Detach previous listeners
    cleanupRiders();

    const ridersRef = Outlet.ref("riders");
    const statsRef = Outlet.ref("riderStats");
    
    console.log(`[Riders] Initializing listeners at: ${ridersRef.toString()}`);
    
    // Ensure we are online
    db.goOnline();

    // Listen for performance stats
    statsRef.on("value", s => {
        state.riderStatsData = s.val() || {};
        if (state.ridersList.length > 0) renderRiders();
    });

    // Listen for riders
    ridersRef.on("value", snapshot => {
        console.log(`[Riders] Data received: ${snapshot.numChildren()} items`);
        const data = snapshot.val();
        state.ridersList = [];
        if (data) {
            Object.keys(data).forEach(key => {
                state.ridersList.push({ id: key, ...data[key] });
            });
        }
        renderRiders();
    });
}

/**
 * CLEANUP RIDER LISTENERS
 * Detaches listeners to save bandwidth on Spark plan.
 */
export function cleanupRiders() {
    console.log("[Riders] Detaching listeners...");
    Outlet.ref("riders").off();
    Outlet.ref("riderStats").off();
}

/**
 * RENDER RIDERS LIST
 */
export function renderRiders(searchTerm = "") {
    const table = document.getElementById("ridersTable");
    const activeDashboard = document.getElementById("riderStatusList");

    // Summary Elements
    const statOnline = document.getElementById("rider-stat-online");
    const statBusy = document.getElementById("rider-stat-busy");
    const statOffline = document.getElementById("rider-stat-offline");
    const statEarnings = document.getElementById("rider-stat-earnings");

    if (table) table.innerHTML = "";
    if (activeDashboard) activeDashboard.innerHTML = "";

    let onlineCount = 0;
    let busyCount = 0;
    let offlineCount = 0;
    let totalEarnings = 0;

    const query = (searchTerm || "").toLowerCase();

    state.ridersList.forEach(r => {
        const stats = state.riderStatsData[r.id] || { totalOrders: 0, avgDeliveryTime: 0, totalEarnings: 0 };
        totalEarnings += (stats.totalEarnings || 0);

        // Determine precise status
        let displayStatus = r.status || "Offline";
        if (displayStatus === "Online" && r.currentOrder) displayStatus = "On Delivery";

        if (displayStatus === "Online") onlineCount++;
        else if (displayStatus === "On Delivery") busyCount++;
        else offlineCount++;

        // Filter Logic
        if (query) {
            const matches = (r.name || "").toLowerCase().includes(query) ||
                (r.email || "").toLowerCase().includes(query) ||
                (r.phone || "").includes(query);
            if (!matches) return;
        }

        const statusClass = displayStatus.toLowerCase().replace(/\s+/g, '-');
        const profileImg = r.photoUrl || "https://ui-avatars.com/api/?name=" + encodeURIComponent(r.name) + "&background=random";

        // 1. Populate Management Table
        if (table) {
            const tr = document.createElement('tr');
            tr.className = "rider-row";
            
            // Mask phone for privacy in general list
            const maskedPhone = r.phone ? '******' + escapeHtml(r.phone.slice(-4)) : 'N/A';
            const safeEmail = escapeHtml(r.email || "");
            const safeName = escapeHtml(r.name || "Unnamed Rider");
            const safePhoto = (r.profilePhoto || profileImg).replace(/"/g, '&quot;');
            const safeId = escapeHtml(r.id);

            tr.innerHTML = `
                <td>
                    <div class="rider-identity-cell">
                        <img src="${safePhoto}" class="rider-avatar-large" alt="${safeName}">
                        <div class="rider-identity-text">
                            <span class="rider-name-bold">${safeName}</span>
                            <span class="rider-subtext"><i data-lucide="phone" style="width:10px;"></i> ${maskedPhone}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="credential-tag">
                        <span class="tag-label">ID:</span>
                        <span class="tag-value">${safeEmail}</span>
                    </div>
                </td>
                <td>
                    <div class="status-indicator-wrapper">
                        <span class="status-dot dot-${statusClass}"></span>
                        <span class="status-text text-${statusClass}">${escapeHtml(displayStatus)}</span>
                    </div>
                </td>
                <td>
                    <div class="quick-stats-grid">
                        <div class="stat-mini">
                            <span class="mini-label">Orders</span>
                            <span class="mini-value">${parseInt(stats.totalOrders || 0, 10)}</span>
                        </div>
                        <div class="stat-mini">
                            <span class="mini-label">Wallet</span>
                            <span class="mini-value text-success">₹${(stats.totalEarnings || 0).toLocaleString()}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="performance-bar-wrapper">
                        <div class="flex-between mb-4">
                            <span class="text-xs">Success Rate</span>
                            <span class="text-xs font-bold">98%</span>
                        </div>
                        <div class="performance-track">
                            <div class="performance-fill" style="width: 98%"></div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="action-buttons-flex">
                        <button data-action="editRider" data-id="${safeId}" class="btn-icon-premium" title="Edit Rider">
                            <i data-lucide="edit-2"></i>
                        </button>
                        <button data-action="resetRiderPassword" data-email="${safeEmail}" class="btn-icon-premium text-warning" title="Reset Password">
                            <i data-lucide="key"></i>
                        </button>
                        <button data-action="deleteRider" data-id="${safeId}" class="btn-icon-premium text-danger" title="Delete Rider">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            `;
            table.appendChild(tr);
        }

        // 2. Populate Active Dashboard (If exists)
        if (activeDashboard) {
            const card = document.createElement('div');
            card.className = `rider-status-card ${statusClass}`;
            const safeName = escapeHtml(r.name || "Rider");
            const safePhoto = (r.profilePhoto || profileImg).replace(/"/g, '&quot;');
            const safeStatus = escapeHtml(displayStatus);

            card.innerHTML = `
                <div class="rider-card-header">
                    <img src="${safePhoto}" alt="${safeName}">
                    <div class="rider-info">
                        <h4>${safeName}</h4>
                        <p>${safeStatus}</p>
                    </div>
                </div>
                ${displayStatus === 'On Delivery' && r.currentOrder ? `
                    <div class="active-task-pulse">
                        <span>Current: Order #${escapeHtml(String(r.currentOrder).slice(-5))}</span>
                    </div>
                ` : ''}
            `;
            activeDashboard.appendChild(card);
        }
    });

    // Update Summary
    if (statOnline) statOnline.innerText = onlineCount;
    if (statBusy) statBusy.innerText = busyCount;
    if (statOffline) statOffline.innerText = offlineCount;
    if (statEarnings) statEarnings.innerText = "₹" + totalEarnings.toLocaleString();

    // Re-init icons if Lucide is available
    if (window.lucide) window.lucide.createIcons();
}

/**
 * SHOW RIDER MODAL
 */
export function showRiderModal() {
    state.isEditRiderMode = false;
    state.currentEditingRiderId = null;

    document.getElementById('riderModalTitle').innerText = "Add New Rider";
    document.getElementById('saveRiderBtn').innerText = "Create Account";
    document.getElementById('riderEmail').disabled = false;
    document.getElementById('riderPassHint').classList.add('hidden');
    document.getElementById('riderPassLabel').innerText = "Secret Access Code (Password)";

    // Clear all fields
    const fields = ['riderName', 'riderEmail', 'riderPhone', 'riderFatherName', 'riderAge', 'riderAadharNo', 'riderQual', 'riderAddress', 'riderPass'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    // Reset Images
    const profilePreview = document.getElementById('riderProfilePreview');
    const aadharPreview = document.getElementById('aadharPreview');
    const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='12' fill='%23999\'%3ENo Photo%3C/text%3E%3C/svg%3E";
    
    if (profilePreview) profilePreview.src = placeholder;
    if (aadharPreview) aadharPreview.src = placeholder;

    const photoUrl = document.getElementById('riderPhotoUrl');
    const aadharUrl = document.getElementById('aadharUrl');
    if (photoUrl) photoUrl.value = "";
    if (aadharUrl) aadharUrl.value = "";

    const modal = document.getElementById('riderModal');
    if (modal) modal.classList.add('active');
}

/**
 * EDIT RIDER
 */
export function editRider(id) {
    const r = state.ridersList.find(x => x.id === id);
    if (!r) return;

    state.isEditRiderMode = true;
    state.currentEditingRiderId = id;

    document.getElementById('riderModalTitle').innerText = "Edit Rider Details";
    document.getElementById('saveRiderBtn').innerText = "Update Rider";
    document.getElementById('riderEmail').disabled = true;
    document.getElementById('riderPassHint').classList.remove('hidden');
    document.getElementById('riderPassLabel').innerText = "Update Password (Optional)";

    // Populate fields
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
    const SVG_PLACEHOLDER = "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23ccc%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20x%3D%223%22%20y%3D%223%22%20width%3D%2218%22%20height%3D%2218%22%20rx%3D%222%22%20ry%3D%222%22%3E%3C%2Frect%3E%3Cline%20x1%3D%223%22%20y1%3D%2221%22%20x2%3D%2221%22%20y2%3D%223%22%3E%3C%2Fline%3E%3C%2Fsvg%3E";
    
    document.getElementById('riderProfilePreview').src = r.profilePhoto || SVG_PLACEHOLDER;
    document.getElementById('riderPhotoUrl').value = r.profilePhoto || "";
    document.getElementById('aadharPreview').src = r.aadharPhoto || SVG_PLACEHOLDER;
    document.getElementById('aadharUrl').value = r.aadharPhoto || "";

    document.getElementById('riderModal').classList.add('active');
}

/**
 * HIDE RIDER MODAL
 */
export function hideRiderModal() {
    const modal = document.getElementById('riderModal');
    if (modal) modal.classList.remove('active');
}

/**
 * SAVE RIDER ACCOUNT (CREATE OR UPDATE)
 */
export async function saveRiderAccount() {
    const name = document.getElementById('riderName').value.trim();
    let email = document.getElementById('riderEmail').value.trim();
    const phone = document.getElementById('riderPhone').value.trim();
    let pass = document.getElementById('riderPass').value;

    if (!email) {
        showToast("Please provide a valid email address.", "error");
        return;
    }

    // Generate secure temp password if new account and no password provided
    if (!state.isEditRiderMode && !pass) {
        pass = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
        navigator.clipboard.writeText(pass);
        showToast("Rider Password Generated & Copied to Clipboard!", "success");
    }

    const fatherName = document.getElementById('riderFatherName').value.trim();
    const age = document.getElementById('riderAge').value;
    const aadharNo = document.getElementById('riderAadharNo').value.trim();
    const qualification = document.getElementById('riderQual').value.trim();
    const address = document.getElementById('riderAddress').value.trim();
    let profilePhoto = document.getElementById('riderPhotoUrl').value;
    let aadharPhoto = document.getElementById('aadharUrl').value;

    if (!name || !email || (!state.isEditRiderMode && !pass)) {
        showToast("Name, Email, and Password are required.", "error");
        return;
    }

    if (phone && !/^\d{10}$/.test(phone)) {
        showToast("Invalid Phone Number! Must be 10 digits.", "error");
        return;
    }

    if (!/^\d{12}$/.test(aadharNo)) {
        showToast("Invalid Aadhar Number! It must be exactly 12 digits.", "error");
        return;
    }

    const profileFile = document.getElementById('riderPhotoInput').files[0];
    const aadharFile = document.getElementById('aadharPhotoInput').files[0];
    const statusLabel = document.getElementById('uploadStatusRider');

    try {
        if (profileFile || aadharFile) {
            if (statusLabel) statusLabel.classList.remove('hidden');
        }

        if (profileFile) {
            profilePhoto = await uploadImage(profileFile, `riders/profile_${Date.now()}`);
        }
        if (aadharFile) {
            aadharPhoto = await uploadImage(aadharFile, `riders/aadhar_${Date.now()}`);
        }

        if (statusLabel) statusLabel.classList.add('hidden');

        if (state.isEditRiderMode) {
            // UPDATE EXISTING RIDER
            const riderId = state.currentEditingRiderId;
            const updateData = {
                name, phone, fatherName, age, aadharNo, qualification, address,
                profilePhoto, aadharPhoto,
                updatedAt: Date.now()
            };

            await Outlet.ref(`riders/${riderId}`).update(updateData);
            logAudit("Riders", `Updated Rider: ${name}`, riderId);
            showToast("Rider updated successfully!", "success");
            hideRiderModal();
        } else {
            // CREATE NEW RIDER
            if (!secondaryAuthAvailable) {
                showToast("Secondary Auth Service unavailable. Cannot create account.", "error");
                return;
            }

            const userCredential = await secondaryAuth.createUserWithEmailAndPassword(email, pass);
            const uid = userCredential.user.uid;

            const riderData = {
                uid, name, email, phone, fatherName, age, aadharNo, qualification, address,
                profilePhoto, aadharPhoto,
                status: "Offline",
                createdAt: Date.now()
            };

            await Outlet.ref(`riders/${uid}`).set(riderData);
            await secondaryAuth.signOut(); // Security: Sign out secondary user immediately

            logAudit("Riders", `Created New Rider: ${name}`, uid);
            showToast("Rider account created successfully!", "success");
            hideRiderModal();
        }
    } catch (error) {
        console.error("Rider Save Error:", error);
        showToast(standardizeAuthError(error), "error");
        if (statusLabel) statusLabel.classList.add('hidden');
    }
}

/**
 * DELETE RIDER
 */
export function deleteRider(id) {
    requireAdminReauth(async () => {
        if (!(await showConfirm("Are you sure you want to delete this rider? This will remove them from the system."))) return;
        haptic();

        try {
            const riderRef = Outlet.ref(`riders/${id}`);
            const snap = await riderRef.once('value');
            const riderName = snap.val()?.name || "Unknown";
            
            await riderRef.remove();
            logAudit("Riders", `Deleted Rider: ${riderName}`, id);
            showToast("Rider removed successfully.", "success");
        } catch (error) {
            showToast("Failed to delete rider.", "error");
        }
    });
}


/**
 * RESET RIDER PASSWORD
 */
export async function resetRiderPassword(email) {
    if (!(await showConfirm(`Send password reset email to ${email}?`))) return;
    haptic();

    try {
        await auth.sendPasswordResetEmail(email);
        logAudit("Riders", `Sent Password Reset: ${email}`, "Global");
        showToast("Reset link sent to rider email.", "success");
    } catch (error) {
        showToast(standardizeAuthError(error), "error");
    }
}

export function toggleRiderPass() {
    const passInput = document.getElementById('riderPass');
    if (passInput) {
        passInput.type = passInput.type === 'password' ? 'text' : 'password';
    }
}

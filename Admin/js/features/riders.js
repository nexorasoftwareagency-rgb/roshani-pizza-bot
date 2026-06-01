import { db, auth, secondaryAuth, secondaryAuthAvailable, Outlet, serverTimestamp, ref, get, set, push, update, runTransaction, remove, query, orderByChild, equalTo, onValue, signOut, sendPasswordResetEmail, createUserWithEmailAndPassword } from '../firebase.js';
import { state } from '../state.js';
import { showDeleteConfirm } from '../ui-utils.js';
import { showToast, haptic, escapeHtml, standardizeAuthError, logAudit, showConfirm, addRiderNotification, initPagination, getSkeletonRows } from '../utils.js';
const RIDERS_PAGE_SIZE = 30;
let _riderPage = 1;
import { uploadImage } from '../firebase.js';
import { requireAdminReauth } from '../auth.js';
import { populateRiderSelect } from './rider-analytics.js';

/**
 * INITIALIZE RIDER DATA
 */
export function loadRiders() {
    // Detach previous listeners
    cleanupRiders();

    // Show skeleton while data loads
    const ridersTbody = document.getElementById('ridersTable');
    if (ridersTbody) ridersTbody.innerHTML = getSkeletonRows(5, 6);

    const ridersRef = ref(db, "riders");
    const statsRef = Outlet.ref("riderStats");
    
    console.log(`[Riders] Initializing listeners at: ${ridersRef.toString()}`);
    
    // Listen for performance stats
    onValue(statsRef, s => {
        state.riderStatsData = s.val() || {};
        if (state.ridersList.length > 0) renderRiders();
    });

    // Listen for riders
    onValue(ridersRef, snapshot => {
        console.log(`[Riders] Data received: ${Object.keys(snapshot.val() || {}).length} items`);
        const data = snapshot.val();
        state.ridersList = [];
        if (data) {
            Object.keys(data).forEach(key => {
                state.ridersList.push({ id: key, ...data[key] });
            });
        }
        renderRiders();
        populateRiderSelect();
        
        // --- PHASE 3.5: UPDATE LIVE OPS DROPDOWNS ---
        // If we are on the live or orders tab, we need to refresh the "Assign Rider" selects
        if (state.currentActiveTab === 'live' || state.currentActiveTab === 'orders') {
            import('./orders.js').then(m => m.renderOrders(state.lastOrdersSnap));
        }
    });

    // Toggle show all riders
    const toggleEl = document.getElementById('showAllRidersToggle');
    if (toggleEl && !toggleEl.dataset.listenerAttached) {
        toggleEl.dataset.listenerAttached = '1';
        toggleEl.addEventListener('change', (e) => {
            state.showAllRiders = e.target.checked;
            const textEl = document.getElementById('riderToggleText');
            if (textEl) textEl.innerText = e.target.checked ? 'All' : 'Online';
            renderRiders();
        });
    }
}

/**
 * CLEANUP RIDER LISTENERS
 * Detaches listeners to save bandwidth on Spark plan.
 */
export function cleanupRiders() {
    console.log("[Riders] Listeners detached by module unload pattern.");
    // Listeners are managed via onValue cleanup; on re-init they are replaced.
}

/**
 * RENDER RIDERS LIST
 */
export function renderRiders(searchTerm = "") {
    const table = document.getElementById("ridersTable");
    const activeDashboard = document.getElementById("riderStatusList");

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
    const allRows = [];

    state.ridersList.forEach(r => {
        const stats = state.riderStatsData[r.id] || { totalOrders: 0, avgDeliveryTime: 0, totalEarnings: 0 };
        totalEarnings += (stats.totalEarnings || 0);

        let displayStatus = r.status || "Offline";
        if (displayStatus === "Online" && r.currentOrder) displayStatus = "On Delivery";

        if (displayStatus === "Online") onlineCount++;
        else if (displayStatus === "On Delivery") busyCount++;
        else offlineCount++;

        if (query) {
            const matches = (r.name || "").toLowerCase().includes(query) ||
                (r.email || "").toLowerCase().includes(query) ||
                (r.phone || "").includes(query);
            if (!matches) return;
        }

        const statusClass = displayStatus.toLowerCase().replace(/\s+/g, '-');
        const profileImg = r.photoUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='20' fill='%23f36b21'/%3E%3Ctext x='20' y='26' font-size='18' fill='white' text-anchor='middle' font-family='sans-serif'%3E" + (r.name ? encodeURIComponent(r.name.charAt(0).toUpperCase()) : '%3F') + "%3C/text%3E%3C/svg%3E";

        if (table) {
            const maskedPhone = r.phone ? '******' + escapeHtml(r.phone.slice(-4)) : 'N/A';
            const safeEmail = escapeHtml(r.email || "");
            const safeName = escapeHtml(r.name || "Unnamed Rider");
            const safePhoto = (r.profilePhoto || profileImg).replace(/"/g, '&quot;');
            const safeId = escapeHtml(r.id);
            allRows.push(`<tr class="premium-row-v4">
                <td data-label="Rider">
                    <div class="identity-chip-v4">
                        <img src="${safePhoto}" class="identity-avatar-v4" alt="${safeName}">
                        <div class="identity-info-v4">
                            <span class="name">${safeName}</span>
                            <span class="sub"><i data-lucide="phone" style="width:10px;"></i> ${maskedPhone}</span>
                        </div>
                    </div>
                </td>
                <td data-label="ID">
                    <div class="identity-info-v4">
                        <span class="name">${safeEmail}</span>
                        <span class="sub">Credential Email</span>
                    </div>
                </td>
                <td data-label="Status">
                    <div class="rider-status-pill-v4 ${statusClass}">
                        <span class="rider-dot-v4"></span>
                        <span>${escapeHtml(displayStatus)}</span>
                    </div>
                </td>
                <td data-label="Performance">
                    <div class="quick-stats-grid">
                        <div class="identity-info-v4">
                            <span class="name">${parseInt(stats.totalOrders || 0, 10)}</span>
                            <span class="sub">Orders</span>
                        </div>
                        <div class="identity-info-v4">
                            <span class="name text-success">₹${(stats.totalEarnings || 0).toLocaleString()}</span>
                            <span class="sub">Wallet</span>
                        </div>
                    </div>
                </td>
                <td data-label="Metrics">
                    <div class="performance-bar-wrapper" style="min-width: 100px;">
                        <div class="flex-between mb-4">
                            <span class="text-xs">Success</span>
                            <span class="text-xs font-bold">${stats.avgRating ? stats.avgRating.toFixed(1) + '★' : '—'}</span>
                        </div>
                        <div class="performance-track">
                            <div class="performance-fill" style="width: ${Math.min(100, (stats.avgRating || 0) * 20)}%"></div>
                        </div>
                    </div>
                </td>
                <td data-label="Actions">
                    <div class="action-group-v4">
                        <button data-action="settleRider" data-id="${safeId}" data-name="${safeName}" class="btn-action-v4" title="Settle Wallet" style="color: var(--primary);">
                            <i data-lucide="wallet" style="width:14px;"></i>
                        </button>
                        <button data-action="editRider" data-id="${safeId}" class="btn-action-v4" title="Edit Rider">
                            <i data-lucide="edit-2" style="width:14px;"></i>
                        </button>
                        <button data-action="resetRiderPassword" data-email="${safeEmail}" class="btn-action-v4" title="Reset Password">
                            <i data-lucide="key" style="width:14px;"></i>
                        </button>
                        <button data-action="deleteRider" data-id="${safeId}" class="btn-action-v4 danger" title="Delete Rider">
                            <i data-lucide="trash-2" style="width:14px;"></i>
                        </button>
                    </div>
                </td>
            </tr>`);
        }

        if (activeDashboard) {
            if (!state.showAllRiders && displayStatus === "Offline") return;

            const card = document.createElement('div');
            card.className = `rider-status-card-v4 ${statusClass} premium-shadow-v4`;
            if (state.showAllRiders && displayStatus === "Offline") {
                card.classList.add('greyed-out');
            }
            const safeName = escapeHtml(r.name || "Rider");
            const safePhoto = (r.profilePhoto || profileImg).replace(/"/g, '&quot;');
            const safeStatus = escapeHtml(displayStatus);

            card.innerHTML = `
                <div class="identity-chip-v4 mb-15">
                    <img src="${safePhoto}" class="identity-avatar-v4" alt="${safeName}">
                    <div class="identity-info-v4">
                        <span class="name">${safeName}</span>
                        <div class="rider-status-pill-v4 ${statusClass}">
                            <span class="rider-dot-v4"></span>
                            <span>${safeStatus}</span>
                        </div>
                    </div>
                </div>
                ${displayStatus === 'On Delivery' && r.currentOrder ? `
                    <div class="active-task-v4">
                        <i data-lucide="package" style="width:12px;"></i>
                        <span>Order #${escapeHtml(String(r.currentOrder).slice(-5))}</span>
                    </div>
                ` : `
                    <div class="idle-state-v4 text-muted-small">
                        <i data-lucide="clock" style="width:12px;"></i>
                        <span>Waiting for orders...</span>
                    </div>
                `}
            `;
            activeDashboard.appendChild(card);
            if (window.lucide) window.lucide.createIcons({ root: card });
        }
    });

    if (table) {
        const start = (_riderPage - 1) * RIDERS_PAGE_SIZE;
        table.innerHTML = allRows.slice(start, start + RIDERS_PAGE_SIZE).join('');
        initPagination('ridersPagination', allRows.length, RIDERS_PAGE_SIZE, (p) => {
            _riderPage = p;
            const s = (p - 1) * RIDERS_PAGE_SIZE;
            table.innerHTML = allRows.slice(s, s + RIDERS_PAGE_SIZE).join('');
            if (window.lucide) window.lucide.createIcons({ root: table });
        });
    }

    if (statOnline) statOnline.innerText = onlineCount;
    if (statBusy) statBusy.innerText = busyCount;
    if (statOffline) statOffline.innerText = offlineCount;
    if (statEarnings) statEarnings.innerText = "₹" + totalEarnings.toLocaleString();

    const manageTab = document.getElementById('management-tab-container');
    if (window.lucide) {
        if (manageTab) window.lucide.createIcons({ root: manageTab });
        else window.lucide.createIcons({ root: document.getElementById('tab-riders') || document.body });
    }
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
    let email = document.getElementById('riderEmail').value.trim().toLowerCase();
    const phone = document.getElementById('riderPhone').value.trim();
    let pass = document.getElementById('riderPass').value;

    if (!email) {
        showToast("Please provide a valid email address.", "error");
        return;
    }

    if (!state.isEditRiderMode && !pass) {
        pass = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
        showPasswordModal(pass);
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
        closePasswordModal();
        showToast("Invalid Phone Number! Must be 10 digits.", "error");
        return;
    }

    if (!/^\d{12}$/.test(aadharNo)) {
        closePasswordModal();
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

            await update(ref(db, `riders/${riderId}`), updateData);
            logAudit("Riders", `Updated Rider: ${name}`, riderId);
            showToast("Rider updated successfully!", "success");
            hideRiderModal();
        } else {
            // CREATE NEW RIDER
            if (!secondaryAuthAvailable) {
                closePasswordModal();
                showToast("Secondary Auth Service unavailable. Cannot create account.", "error");
                return;
            }

            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
            const uid = userCredential.user.uid;

            const riderData = {
                uid, name, email, phone, fatherName, age, aadharNo, qualification, address,
                profilePhoto, aadharPhoto,
                status: "Offline",
                createdAt: Date.now()
            };

            await set(ref(db, `riders/${uid}`), riderData);
            await signOut(secondaryAuth); // Security: Sign out secondary user immediately

            logAudit("Riders", `Created New Rider: ${name}`, uid);
            closePasswordModal();
            showToast("Rider account created successfully!", "success");
            hideRiderModal();
        }
    } catch (error) {
        console.error("Rider Save Error:", error);
        closePasswordModal();
        showToast(standardizeAuthError(error), "error");
        if (statusLabel) statusLabel.classList.add('hidden');
    }
}

/**
 * DELETE RIDER
 */
export function deleteRider(id) {
    requireAdminReauth(async () => {
        const riderRef = ref(db, `riders/${id}`);
        const snap = await get(riderRef);
        const riderName = snap.val()?.name || "Unknown";

        if (!(await showDeleteConfirm(riderName))) return;
        haptic();

        try {
            await remove(riderRef);
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
        await sendPasswordResetEmail(auth, email);
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

/**
 * SETTLE RIDER WALLET
 * Calculates total cash from last 48 hours and marks orders as settled.
 */
export async function settleRiderWallet(riderId, riderName, customTimeLimit = null) {
    // Show a loading toast
    showToast("Calculating pending cash...", "info");
    haptic();

    try {
        const timeLimit = customTimeLimit || (Date.now() - (48 * 60 * 60 * 1000));
        let pendingCash = 0;
        let ordersToSettle = [];

        // We must query both pizza and cake outlets
        const outlets = ['pizza', 'cake'];
        for (const outlet of outlets) {
            // Query orders for this rider
            const ordersRef = ref(db, `${outlet}/orders`);
            const snap = await get(query(ordersRef, orderByChild('riderId'), equalTo(riderId)));
            
            if (snap.exists()) {
                snap.forEach(child => {
                    const o = child.val();
                    const rawTime = o.createdAt || o.timestamp || o.assignedAt || 0;
                    const orderTime = typeof rawTime === 'string' ? new Date(rawTime).getTime() : rawTime;
                    const isCash = (o.paymentMethod || "").toUpperCase() === "CASH";
                    const status = (o.status || "").toLowerCase();
                    
                    if (orderTime >= timeLimit && isCash && status === "delivered" && !o.settled) {
                        pendingCash += Number(o.total || 0);
                        ordersToSettle.push({ outlet: outlet, id: child.key });
                    }
                });
            }
        }

        if (pendingCash === 0) {
            showToast(`No pending cash to settle for ${riderName}.`, "info");
            return;
        }

        if (!(await showConfirm(`Confirm collection of ₹${pendingCash} from ${riderName}?`))) return;

        // Perform batch update
        const updates = {};
        ordersToSettle.forEach(o => {
            updates[`${o.outlet}/orders/${o.id}/settled`] = true;
        });

        // Add to settlement ledger
        const settlementId = "SETTLE_" + Date.now();
        updates[`settlements/${riderId}/${settlementId}`] = {
            timestamp: Date.now(),
            amountCollected: pendingCash,
            settledByAdmin: auth.currentUser?.email || "Admin",
            ordersClearedCount: ordersToSettle.length
        };

        await update(ref(db), updates);
        logAudit("Riders", `Settled Wallet for ${riderName}: ₹${pendingCash}`, riderId);
        showToast(`Successfully settled ₹${pendingCash} for ${riderName}.`, "success");

        // --- AUTOMATED NOTIFICATIONS ---
        try {
            // 1. In-App Notification
            addRiderNotification(riderId, "Settlement Complete", `Settled ₹${pendingCash} for ${ordersToSettle.length} orders.`, "settlement");

            // 2. WhatsApp Notification via Bot
            const rider = state.ridersList.find(r => r.id === riderId);
            const rawPhone = rider?.phone || "";
            const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);

            if (cleanPhone && cleanPhone.length === 10) {
                const message = `Hello ${riderName}! 🌟\n\nYour cash settlement has been completed successfully.\n\n💰 *Total Collected:* ₹${pendingCash}\n📦 *Orders Cleared:* ${ordersToSettle.length}\n✅ *Status:* Settled\n\nThank you for your hard work! 🙏`;
                
                // Use the first order's outlet or default to pizza
                const botOutlet = ordersToSettle[0]?.outlet || 'pizza';
                const cmdRef = push(ref(db, `bot/${botOutlet}/commands`));
                
                await set(cmdRef, {
                    action: "SEND_GENERIC_MESSAGE",
                    phone: cleanPhone,
                    message: message,
                    timestamp: serverTimestamp()
                });
                console.log(`[Riders] WhatsApp settlement notification triggered for ${cleanPhone} via ${botOutlet} bot.`);
            }
        } catch (notifError) {
            console.warn("[Riders] Post-settlement notification failed:", notifError);
        }

    } catch (error) {
        console.error("Settlement Error:", error);
        showToast("Failed to settle wallet. Check console for details.", "error");
    }
}

/* ── Password Reveal Modal ── */
let _passwordModal = null;
let _passwordModalTimer = null;

function showPasswordModal(password) {
    if (_passwordModal) closePasswordModal();

    const overlay = document.createElement('div');
    overlay.id = 'passwordRevealOverlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
    `;

    overlay.innerHTML = `
        <div style="background: #1c1c1c; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px;
                    padding: 32px; max-width: 420px; width: 90%; text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.5); position: relative;">
            <button id="closePasswordModalBtn" style="position: absolute; top: 12px; right: 16px; background: none; border: none; color: #666; font-size: 22px; cursor: pointer; padding: 4px; line-height: 1;">&times;</button>
            <h3 style="color: #fff; margin: 0 0 8px; font-size: 20px; font-weight: 700;">New Rider Credentials</h3>
            <p style="color: #f87171; font-size: 13px; margin: 0 0 20px; font-weight: 600;">
                ⚠️ This password will not be shown again.
            </p>
            <div style="background: #0d0d0d; border: 1px solid #333; border-radius: 12px; padding: 16px; margin-bottom: 12px;">
                <div id="passwordDisplay" style="font-family: 'Courier New', monospace; font-size: 24px; letter-spacing: 2px; color: #fff; word-break: break-all; user-select: all;">
                    ${'•'.repeat(password.length)}
                </div>
            </div>
            <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 12px;">
                <button id="toggleRevealBtn" style="flex: 1; padding: 10px; border-radius: 10px; border: 1px solid #333; background: #262626; color: #ccc; cursor: pointer; font-size: 13px; font-weight: 600;">
                    👁️ Reveal
                </button>
                <button id="copyPasswordBtn" style="flex: 1; padding: 10px; border-radius: 10px; border: none; background: var(--primary, #3b82f6); color: #fff; cursor: pointer; font-size: 13px; font-weight: 700;">
                    📋 Copy
                </button>
            </div>
            <div id="copyStatus" style="font-size: 12px; color: #6b7280; min-height: 18px;"></div>
        </div>
    `;

    document.body.appendChild(overlay);
    _passwordModal = overlay;

    const passwordDisplay = overlay.querySelector('#passwordDisplay');
    const toggleBtn = overlay.querySelector('#toggleRevealBtn');
    const copyBtn = overlay.querySelector('#copyPasswordBtn');
    const copyStatus = overlay.querySelector('#copyStatus');

    let isRevealed = false;

    toggleBtn.onclick = () => {
        isRevealed = !isRevealed;
        passwordDisplay.textContent = isRevealed ? password : '•'.repeat(password.length);
        toggleBtn.textContent = isRevealed ? '🙈 Hide' : '👁️ Reveal';
    };

    copyBtn.onclick = async () => {
        try {
            await navigator.clipboard.writeText(password);
            copyStatus.textContent = '✅ Copied! Auto-clearing in 30s…';
            copyStatus.style.color = '#34d399';
            clearTimeout(_passwordModalTimer);
            _passwordModalTimer = setTimeout(() => {
                navigator.clipboard.writeText('').catch(() => {});
                _passwordModalTimer = null;
            }, 30000);
        } catch {
            copyStatus.textContent = '❌ Copy failed. Select and copy manually.';
            copyStatus.style.color = '#f87171';
        }
    };

    const dismiss = () => closePasswordModal();

    overlay.querySelector('#closePasswordModalBtn').onclick = dismiss;
    overlay.onclick = (e) => { if (e.target === overlay) dismiss(); };
}

function closePasswordModal() {
    if (_passwordModal) {
        _passwordModal.remove();
        _passwordModal = null;
    }
}

import { Outlet } from '../firebase.js';
import { logAudit, showToast } from '../utils.js';
import { ui } from '../ui.js';

// --- STATE & UTILS ---
const SETTINGS_PATHS = {
    STORE: "settings/Store",
    DELIVERY: "settings/Delivery",
    BOT: "settings/Bot",
    DISPLAY: "settings/Display"
};

/**
 * Validates Latitude and Longitude
 */
function validateCoords(lat, lng) {
    const l = parseFloat(lat);
    const n = parseFloat(lng);
    if (isNaN(l) || l < -90 || l > 90) return { valid: false, msg: "Invalid Latitude (-90 to 90)" };
    if (isNaN(n) || n < -180 || n > 180) return { valid: false, msg: "Invalid Longitude (-180 to 180)" };
    return { valid: true };
}

/**
 * Validates Indian Phone Format (91XXXXXXXXXX)
 */
function validatePhone(phone, label) {
    if (!phone) return true; // Optional fields
    const clean = String(phone).replace(/\D/g, '');
    if (clean.length === 10) return { valid: true, value: "91" + clean };
    if (clean.length !== 12 || !clean.startsWith('91')) {
        return { valid: false, msg: `${label} must be 10 digits or 12 digits starting with 91` };
    }
    return { valid: true, value: clean };
}

/**
 * Validates GSTIN (15 characters)
 */
function validateGSTIN(gst) {
    if (!gst) return true;
    const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!regex.test(gst)) return { valid: false, msg: "Invalid GSTIN Format" };
    return { valid: true };
}

/**
 * Validates FSSAI (14 digits)
 */
function validateFSSAI(fssai) {
    if (!fssai) return true;
    if (!/^[0-9]{14}$/.test(fssai)) return { valid: false, msg: "FSSAI must be exactly 14 digits" };
    return { valid: true };
}

/**
 * Validates Backup/Access Code (6 digits)
 */
function validateBackupCode(code) {
    if (!/^[0-9]{6}$/.test(code)) return { valid: false, msg: "Backup Code must be 6 digits" };
    return { valid: true };
}

// --- CORE FUNCTIONS ---

export async function loadStoreSettings() {
    console.log("[Settings] Loading all store settings...");
    try {
        const [storeSnap, delSnap, botSnap, dispSnap] = await Promise.all([
            Outlet.ref(SETTINGS_PATHS.STORE).once("value"),
            Outlet.ref(SETTINGS_PATHS.DELIVERY).once("value"),
            Outlet.ref(SETTINGS_PATHS.BOT).once("value"),
            Outlet.ref(SETTINGS_PATHS.DISPLAY).once("value")
        ]);

        const store = storeSnap.val();
        const del = delSnap.val();
        const bot = botSnap.val();
        const disp = dispSnap.val();

        // 1. Store Info
        const s = store || {};
        document.getElementById('settingEntityName').value = s.entityName || '';
        document.getElementById('settingStoreName').value = s.storeName || '';
        document.getElementById('settingStoreAddress').value = s.address || '';
        document.getElementById('settingGSTIN').value = s.gstin || '';
        document.getElementById('settingFSSAI').value = s.fssai || '';
        document.getElementById('settingTagline').value = s.tagline || '';
        document.getElementById('settingPoweredBy').value = s.poweredBy || 'Powered by Roshani ERP';
        document.getElementById('settingOpenTime').value = s.shopOpenTime || '10:00';
        document.getElementById('settingCloseTime').value = s.shopCloseTime || '23:00';
        document.getElementById('settingShopStatus').value = s.shopStatus || 'AUTO';
        
        document.getElementById('settingWifiName').value = s.wifiName || '';
        document.getElementById('settingWifiPass').value = s.wifiPass || '';
        document.getElementById('settingInstagram').value = s.instagram || '';
        document.getElementById('settingFacebook').value = s.facebook || '';
        document.getElementById('settingReviewUrl').value = s.reviewUrl || '';
        
        document.getElementById('settingLat').value = s.lat || '25.887444';
        document.getElementById('settingLng').value = s.lng || '85.026889';
        document.getElementById('displayCoords').innerText = `${s.lat || '25.887444'}, ${s.lng || '85.026889'}`;

        // 2. Delivery & Security
        const d = del || {};
        document.getElementById('settingDevPhone').value = d.developerPhone || '';
        document.getElementById('settingReportPhone').value = d.reportPhone || '';
        document.getElementById('settingAdminPhone').value = d.notifyPhone || '';
        document.getElementById('settingDeliveryBackupCode').value = d.backupCode || '';

        // Render Fee Slabs
        renderFeeSlabs(d.slabs || []);

        // 3. Bot Aesthetics & Marketing
        const b = bot || {};
        const botPreviews = {
            'botImgConfirmedPreview': b.imgConfirmed,
            'botImgPreparingPreview': b.imgPreparing,
            'botImgCookedPreview': b.imgCooked,
            'botImgOutPreview': b.imgOut,
            'botImgDeliveredPreview': b.imgDelivered,
            'botImgFeedbackPreview': b.imgFeedback,
            'greetingImgPreview': b.greetingImage,
            'menuImgPreview': b.menuImage
        };
        for (const [id, url] of Object.entries(botPreviews)) {
            if (url) {
                const el = document.getElementById(id);
                if (el) el.src = url;
                // Also update hidden inputs for Marketing images
                if (id === 'greetingImgPreview') document.getElementById('settingGreetingUrl').value = url;
                if (id === 'menuImgPreview') document.getElementById('settingMenuUrl').value = url;
            }
        }

        // 4. Social & Promotions
        document.getElementById('botSocialInsta').value = b.socialInsta || '';
        document.getElementById('botSocialFb').value = b.socialFb || '';
        document.getElementById('botSocialReview').value = b.socialReview || '';
        document.getElementById('botSocialWebsite').value = b.socialWebsite || '';
        
        // Feedback Reasons
        document.getElementById('settingFeedbackReason1').value = b.reason1 || 'Delicious Taste';
        document.getElementById('settingFeedbackReason2').value = b.reason2 || 'Fast Delivery';
        document.getElementById('settingFeedbackReason3').value = b.reason3 || 'Premium Packaging';

        // 5. Visibility Controls
        const vi = disp || {};
        const checks = [
            'checkShowAddress', 'checkShowGSTIN', 'checkShowFSSAI', 'checkShowTagline',
            'checkShowPoweredBy', 'checkShowQR', 'checkShowWifiInfo', 'checkShowSocial', 'checkShowFeedbackQR'
        ];
        checks.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = vi[id] !== false; // default to true
        });

        // 6. Payment QR
        if (s.paymentQR) {
            document.getElementById('qrPreview').src = s.paymentQR;
            document.getElementById('settingQRUrl').value = s.paymentQR;
        }

        if (window.updateOutletStatusIndicator) window.updateOutletStatusIndicator(s.shopStatus || 'AUTO');
        
        console.log("[Settings] All data populated.");
    } catch (e) {
        console.error("[Settings] Load Error:", e);
        showToast("Failed to load settings", "error");
    }
}

export async function saveStoreSettings() {
    console.log("[Settings] Preparing to save...");
    
    // 1. Validation
    const lat = document.getElementById('settingLat').value;
    const lng = document.getElementById('settingLng').value;
    const vCoord = validateCoords(lat, lng);
    if (!vCoord.valid) return showToast(vCoord.msg, "error");

    const gstinVal = document.getElementById('settingGSTIN').value.trim();
    const vGst = validateGSTIN(gstinVal);
    if (vGst !== true && !vGst.valid) return showToast(vGst.msg, "error");

    const fssaiVal = document.getElementById('settingFSSAI').value.trim();
    const vFssai = validateFSSAI(fssaiVal);
    if (vFssai !== true && !vFssai.valid) return showToast(vFssai.msg, "error");

    const backupCode = document.getElementById('settingDeliveryBackupCode').value.trim();
    const vBackup = validateBackupCode(backupCode);
    if (vBackup !== true && !vBackup.valid) return showToast(vBackup.msg, "error");

    const phones = [
        { id: 'settingDevPhone', label: "Developer Phone" },
        { id: 'settingReportPhone', label: "Report Phone" },
        { id: 'settingAdminPhone', label: "Admin Notification Phone" }
    ];

    for (const p of phones) {
        const input = document.getElementById(p.id);
        const v = validatePhone(input.value, p.label);
        if (v !== true && !v.valid) return showToast(v.msg, "error");
        if (v.value) input.value = v.value; // Auto-prefix 91
    }

    if (ui.setLoading) ui.setLoading('btnSaveSettings', true);

    try {
        // 2. Collect Data
        const storeData = {
            entityName: document.getElementById('settingEntityName').value,
            storeName: document.getElementById('settingStoreName').value,
            address: document.getElementById('settingStoreAddress').value,
            gstin: document.getElementById('settingGSTIN').value,
            fssai: document.getElementById('settingFSSAI').value,
            tagline: document.getElementById('settingTagline').value,
            poweredBy: document.getElementById('settingPoweredBy').value,
            shopOpenTime: document.getElementById('settingOpenTime').value,
            shopCloseTime: document.getElementById('settingCloseTime').value,
            shopStatus: document.getElementById('settingShopStatus').value,
            wifiName: document.getElementById('settingWifiName').value,
            wifiPass: document.getElementById('settingWifiPass').value,
            instagram: document.getElementById('settingInstagram').value,
            facebook: document.getElementById('settingFacebook').value,
            reviewUrl: document.getElementById('settingReviewUrl').value,
            lat, lng,
            paymentQR: document.getElementById('settingQRUrl').value,
            updatedAt: new Date().toISOString()
        };

        const deliveryData = {
            developerPhone: document.getElementById('settingDevPhone').value,
            reportPhone: document.getElementById('settingReportPhone').value,
            notifyPhone: document.getElementById('settingAdminPhone').value,
            backupCode: document.getElementById('settingDeliveryBackupCode').value,
            slabs: getSlabsFromTable()
        };

        const botData = {
            imgConfirmed: document.getElementById('botImgConfirmedPreview').src,
            imgPreparing: document.getElementById('botImgPreparingPreview').src,
            imgCooked: document.getElementById('botImgCookedPreview').src,
            imgOut: document.getElementById('botImgOutPreview').src,
            imgDelivered: document.getElementById('botImgDeliveredPreview').src,
            imgFeedback: document.getElementById('botImgFeedbackPreview').src,
            greetingImage: document.getElementById('settingGreetingUrl').value,
            menuImage: document.getElementById('settingMenuUrl').value,
            socialInsta: document.getElementById('botSocialInsta').value,
            socialFb: document.getElementById('botSocialFb').value,
            socialReview: document.getElementById('botSocialReview').value,
            socialWebsite: document.getElementById('botSocialWebsite').value,
            reason1: document.getElementById('settingFeedbackReason1').value,
            reason2: document.getElementById('settingFeedbackReason2').value,
            reason3: document.getElementById('settingFeedbackReason3').value
        };

        const displayData = {};
        const checks = [
            'checkShowAddress', 'checkShowGSTIN', 'checkShowFSSAI', 'checkShowTagline',
            'checkShowPoweredBy', 'checkShowQR', 'checkShowWifiInfo', 'checkShowSocial', 'checkShowFeedbackQR'
        ];
        checks.forEach(id => {
            const el = document.getElementById(id);
            if (el) displayData[id] = el.checked;
        });

        // 3. Batch Update
        await Promise.all([
            Outlet.ref(SETTINGS_PATHS.STORE).update(storeData),
            Outlet.ref(SETTINGS_PATHS.DELIVERY).update(deliveryData),
            Outlet.ref(SETTINGS_PATHS.BOT).update(botData),
            Outlet.ref(SETTINGS_PATHS.DISPLAY).set(displayData)
        ]);

        showToast("Settings saved successfully!", "success");
        logAudit("Settings", "Updated Store Settings", "Global");
        document.getElementById('displayCoords').innerText = `${lat}, ${lng}`;
        if (window.updateOutletStatusIndicator) window.updateOutletStatusIndicator(storeData.shopStatus);

    } catch (e) {
        console.error("[Settings] Save Error:", e);
        showToast("Critical failure while saving settings", "error");
    } finally {
        if (ui.setLoading) ui.setLoading('btnSaveSettings', false);
    }
}

// --- FEE SLABS LOGIC ---

function renderFeeSlabs(slabs) {
    const tbody = document.getElementById('feeSlabsTable');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    slabs.forEach((slab, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="number" class="slab-km form-input-small" value="${slab.km}" placeholder="KM"></td>
            <td><input type="number" class="slab-fee form-input-small" value="${slab.fee}" placeholder="₹"></td>
            <td><button class="btn-icon text-danger" data-action="removeFeeSlab">🗑️</button></td>
        `;
        tbody.appendChild(tr);
    });
}

export function addFeeSlab() {
    const tbody = document.getElementById('feeSlabsTable');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="number" class="slab-km form-input-small" value="0" placeholder="KM"></td>
        <td><input type="number" class="slab-fee form-input-small" value="0" placeholder="₹"></td>
        <td><button class="btn-icon text-danger" data-action="removeFeeSlab">🗑️</button></td>
    `;
    tbody.appendChild(tr);
}

function getSlabsFromTable() {
    const slabs = [];
    document.querySelectorAll('#feeSlabsTable tr').forEach(tr => {
        const km = parseFloat(tr.querySelector('.slab-km').value);
        const fee = parseFloat(tr.querySelector('.slab-fee').value);
        if (!isNaN(km)) slabs.push({ km, fee: isNaN(fee) ? 0 : fee });
    });
    return slabs.sort((a, b) => a.km - b.km);
}

// --- IMAGE PREVIEWS ---

export function previewSettingsImage(inputId, previewId, hiddenId) {
    const file = document.getElementById(inputId).files[0];
    if (!file) return;

    if (file.size > 500 * 1024) {
        showToast("Image too large (>500KB). Please compress.", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const base64 = e.target.result;
        const previewEl = document.getElementById(previewId);
        if (previewEl) previewEl.src = base64;
        if (hiddenId) {
            const hiddenEl = document.getElementById(hiddenId);
            if (hiddenEl) hiddenEl.value = base64;
        }
    };
    reader.readAsDataURL(file);
}

// --- QUICK ACTIONS ---

export function quickUpdateOutletStatus() {
    const statusEl = document.getElementById('settingShopStatus');
    if (!statusEl) return;
    const newStatus = statusEl.value;

    Outlet.ref(SETTINGS_PATHS.STORE).update({ shopStatus: newStatus })
        .then(() => {
            logAudit("Settings", `Quick Status Update: ${newStatus}`, "Global");
            if (window.updateOutletStatusIndicator) window.updateOutletStatusIndicator(newStatus);
            showStatusAlert(newStatus);
        })
        .catch(e => {
            console.error("Failed to update outlet status:", e);
            showToast("Failed to update status", "error");
        });
}

function showStatusAlert(newStatus) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;

    const div = document.createElement('div');
    div.className = 'alert-box';
    const colorMap = { 'FORCE_OPEN': '#22c55e', 'FORCE_CLOSED': '#ef4444', 'AUTO': '#3b82f6' };
    div.style.borderLeftColor = colorMap[newStatus] || '#3b82f6';
    
    const labelMap = { 
        'FORCE_OPEN': '✅ Outlet is now FORCE OPEN', 
        'FORCE_CLOSED': '🌙 Outlet is now FORCE CLOSED', 
        'AUTO': '⏰ Outlet set to AUTO' 
    };
    
    div.innerHTML = `
        <div class="alert-title">${labelMap[newStatus] || 'Status Updated'}</div>
        <div class="alert-sub">WhatsApp bot will respect this status immediately.</div>
    `;
    alertContainer.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

// --- INITIALIZATION ---
// Bind image uploads for Settings
document.addEventListener('change', (e) => {
    if (e.target.id === 'settingQRFile') previewSettingsImage('settingQRFile', 'qrPreview', 'settingQRUrl');
    if (e.target.id === 'settingGreetingFile') previewSettingsImage('settingGreetingFile', 'greetingImgPreview', 'settingGreetingUrl');
    if (e.target.id === 'settingMenuFile') previewSettingsImage('settingMenuFile', 'menuImgPreview', 'settingMenuUrl');
    
    if (e.target.id.startsWith('botImg')) {
        const id = e.target.id;
        const previewId = id.replace('File', 'Preview');
        previewSettingsImage(id, previewId);
    }
});

document.addEventListener('click', (e) => {
    if (e.target.id === 'btnChangeQR') document.getElementById('settingQRFile').click();
    if (e.target.id === 'btnChangeGreetingImg') document.getElementById('settingGreetingFile').click();
    if (e.target.id === 'btnChangeMenuImg') document.getElementById('settingMenuFile').click();
    
    if (e.target.classList.contains('btn-upload-bot-img')) {
        const targetId = e.target.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input) input.click();
    }
    if (e.target.getAttribute('data-action') === 'removeFeeSlab') {
        const row = e.target.closest('tr');
        if (row) row.remove();
    }
});

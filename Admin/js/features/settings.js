import { state } from '../state.js';
import { db, Outlet, ref, get, update, set } from '../firebase.js';
import { logAudit, showToast, getSkeletonRows } from '../utils.js';

// --- STATE & UTILS ---
const SETTINGS_PATHS = {
    STORE: "settings/Store",
    DELIVERY: "settings/Delivery",
    BOT: "settings/Bot",
    DISPLAY: "settings/Display"
};

/**
 * v5.0.0 One-time migration: remove deprecated bot image keys (imgPreparing, imgCooked).
 * Merged "Cooked" + "Ready" into a single "Ready" status; "Preparing" deleted.
 * Guarded by localStorage flag so it only runs once per browser.
 */
/**
 * COORDINATE VALIDATION
 */
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
 * Validates Backup/Access Code (4 digits)
 */
function validateBackupCode(code) {
    if (!/^[0-9]{4}$/.test(code)) return { valid: false, msg: "Backup Code must be 4 digits" };
    return { valid: true };
}

// --- CORE FUNCTIONS ---

export async function loadStoreSettings() {
    console.log("[Settings] Loading all store settings...");

    // Show skeleton while data loads
    const feeSlabsTbody = document.getElementById('feeSlabsTable');
    if (feeSlabsTbody) feeSlabsTbody.innerHTML = getSkeletonRows(3, 4);

    try {
        const [storeSnap, delSnap, botSnap, dispSnap] = await Promise.all([
            get(Outlet.ref(SETTINGS_PATHS.STORE)),
            get(Outlet.ref(SETTINGS_PATHS.DELIVERY)),
            get(Outlet.ref(SETTINGS_PATHS.BOT)),
            get(Outlet.ref(SETTINGS_PATHS.DISPLAY))
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
        document.getElementById('settingGoogleReviewLink').value = s.googleReviewLink || '';
        document.getElementById('settingWhatsappNumber').value = s.whatsappNumber || '';
        document.getElementById('settingReviewUrl').value = s.reviewUrl || '';
        document.getElementById('settingCustomerMenuBgImage').value = s.customerMenuBgImage || '';
        
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

        // 2b. Dine-In Settings (tax, service charge)
        const dineSnap = await get(Outlet.ref('dineinSettings'));
        const dine = dineSnap.val() || {};
        document.getElementById('dineinTaxEnabled').checked = dine.taxEnabled !== false;
        document.getElementById('dineinTaxName').value = dine.taxName || 'GST';
        document.getElementById('dineinTaxRate').value = typeof dine.taxRate === 'number' ? dine.taxRate : 5;
        document.getElementById('dineinServiceChargeEnabled').checked = dine.serviceChargeEnabled === true;
        document.getElementById('dineinServiceChargeName').value = dine.serviceChargeName || 'Service Charge';
        document.getElementById('dineinServiceChargeRate').value = typeof dine.serviceChargeRate === 'number' ? dine.serviceChargeRate : 10;

        // 3. Bot Aesthetics & Marketing
        const b = bot || {};
        const botPreviews = {
            'botImgConfirmedPreview': b.imgConfirmed,
            'botImgReadyPreview': b.imgReady,
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
            'checkShowStoreName', 'checkShowAddress', 'checkShowGSTIN', 'checkShowFSSAI', 'checkShowTagline',
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

        // 7. Today's Offers
        _renderOffers(dine.offers || []);

        if (window.updateOutletStatusIndicator) window.updateOutletStatusIndicator(s.shopStatus || 'AUTO');
        
        state.settingsDirty = false;
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
    if (backupCode) {
        const vBackup = validateBackupCode(backupCode);
        if (!vBackup.valid) return showToast(vBackup.msg, "error");
    }

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

    const saveBtn = document.getElementById('btnSaveSettings');
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Saving...';

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
            googleReviewLink: document.getElementById('settingGoogleReviewLink').value,
            whatsappNumber: document.getElementById('settingWhatsappNumber').value,
            reviewUrl: document.getElementById('settingReviewUrl').value,
            customerMenuBgImage: document.getElementById('settingCustomerMenuBgImage').value,
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
            imgReady: document.getElementById('botImgReadyPreview').src,
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
            'checkShowStoreName', 'checkShowAddress', 'checkShowGSTIN', 'checkShowFSSAI', 'checkShowTagline',
            'checkShowPoweredBy', 'checkShowQR', 'checkShowWifiInfo', 'checkShowSocial', 'checkShowFeedbackQR'
        ];
        checks.forEach(id => {
            const el = document.getElementById(id);
            if (el) displayData[id] = el.checked;
        });

        // 3. Atomic multi-path update
        const updates = {};
        updates[`${Outlet.current}/settings/Store`] = storeData;
        updates[`${Outlet.current}/settings/Delivery`] = deliveryData;
        updates[`${Outlet.current}/settings/Bot`] = botData;
        updates[`${Outlet.current}/settings/Display`] = displayData;
        updates[`${Outlet.current}/dineinSettings`] = {
            qrBaseUrl: (await get(Outlet.ref('dineinSettings'))).val()?.qrBaseUrl || '',
            taxEnabled: document.getElementById('dineinTaxEnabled').checked,
            taxName: document.getElementById('dineinTaxName').value.trim() || 'GST',
            taxRate: parseFloat(document.getElementById('dineinTaxRate').value) || 0,
            serviceChargeEnabled: document.getElementById('dineinServiceChargeEnabled').checked,
            serviceChargeName: document.getElementById('dineinServiceChargeName').value.trim() || 'Service Charge',
            serviceChargeRate: parseFloat(document.getElementById('dineinServiceChargeRate').value) || 0,
            offers: _getOffers()
        };
        await update(ref(db), updates);

        showToast("Settings saved successfully!", "success");
        state.settingsDirty = false;
        logAudit("Settings", "Updated Store Settings", "Global");
        document.getElementById('displayCoords').innerText = `${lat}, ${lng}`;
        if (window.updateOutletStatusIndicator) window.updateOutletStatusIndicator(storeData.shopStatus);

    } catch (e) {
        console.error("[Settings] Save Error:", e);
        showToast("Critical failure while saving settings", "error");
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save Settings';
    }
}

// --- FEE SLABS LOGIC ---

function renderFeeSlabs(slabs) {
    const tbody = document.getElementById('feeSlabsTable');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    slabs.forEach((slab, index) => {
        const tr = document.createElement('tr');
        tr.className = 'premium-row-v4';
        tr.innerHTML = `
            <td>
                <div class="flex-row flex-center flex-gap-8">
                    <i data-lucide="map-pin" class="text-muted" style="width:14px;"></i>
                    <input type="number" class="slab-km form-input-small w-80" value="${slab.km}" placeholder="KM">
                    <span class="text-muted-small">km</span>
                </div>
            </td>
            <td>
                <div class="flex-row flex-center flex-gap-8">
                    <span class="text-muted-small">₹</span>
                    <input type="number" class="slab-fee form-input-small w-80" value="${slab.fee}" placeholder="Fee">
                </div>
            </td>
            <td class="text-right">
                <button class="btn-icon-danger" data-action="removeFeeSlab" title="Remove Slab">
                    <i data-lucide="trash-2" style="width:16px;"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (window.lucide) window.lucide.createIcons({ root: tbody });
}

export function addFeeSlab() {
    const tbody = document.getElementById('feeSlabsTable');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.className = 'premium-row-v4';
    tr.innerHTML = `
        <td>
            <div class="flex-row flex-center flex-gap-8">
                <i data-lucide="map-pin" class="text-muted" style="width:14px;"></i>
                <input type="number" class="slab-km form-input-small w-80" value="0" placeholder="KM">
                <span class="text-muted-small">km</span>
            </div>
        </td>
        <td>
            <div class="flex-row flex-center flex-gap-8">
                <span class="text-muted-small">₹</span>
                <input type="number" class="slab-fee form-input-small w-80" value="0" placeholder="Fee">
            </div>
        </td>
        <td class="text-right">
            <button class="btn-icon-danger" data-action="removeFeeSlab" title="Remove Slab">
                <i data-lucide="trash-2" style="width:16px;"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
    if (window.lucide) window.lucide.createIcons({ root: tr });
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

    update(Outlet.ref(SETTINGS_PATHS.STORE), { shopStatus: newStatus })
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
    div.className = 'alert-box info';
    
    const labelMap = { 
        'FORCE_OPEN': '✅ Outlet is now FORCE OPEN', 
        'FORCE_CLOSED': '🌙 Outlet is now FORCE CLOSED', 
        'AUTO': '⏰ Outlet set to AUTO' 
    };
    
    div.innerHTML = `
        <div class="alert-title">
            <i data-lucide="zap" style="width:18px;"></i>
            <span>${labelMap[newStatus] || 'Status Updated'}</span>
        </div>
        <div class="alert-sub">The WhatsApp bot and ordering system will respect this status immediately.</div>
    `;
    alertContainer.appendChild(div);
    if (window.lucide) window.lucide.createIcons({ root: div });
    
    setTimeout(() => {
        div.style.animation = 'slideOutPremium 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards';
        setTimeout(() => div.remove(), 500);
    }, 4000);
}

window.updateOutletStatusIndicator = function(status) {
    const pill = document.getElementById('outletStatusPill');
    if (!pill) return;
    const label = { 'FORCE_OPEN': 'OPEN', 'FORCE_CLOSED': 'CLOSED', 'AUTO': 'AUTO' }[status] || 'AUTO';
    pill.textContent = label;
    pill.className = 'outlet-status-pill status-' + (status === 'FORCE_OPEN' ? 'open' : status === 'FORCE_CLOSED' ? 'closed' : 'auto');
};

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
        if (row) {
            row.remove();
            state.settingsDirty = true;
        }
    }
});

// Mark settings as dirty on ANY input change within the settings container
document.addEventListener('input', (e) => {
    const settingsTab = document.getElementById('tab-settings');
    if (settingsTab && settingsTab.contains(e.target)) {
        if (!state.settingsDirty) {
            console.log("[Settings] State is now DIRTY");
            state.settingsDirty = true;
        }
    }
});

// -------------------------------------------------------------------
// OFFERS MANAGEMENT
// -------------------------------------------------------------------
let _offers = [];

function _renderOffers(offers) {
    const arr = Array.isArray(offers) ? offers : (offers && typeof offers === 'object' ? Object.values(offers) : []);
    _offers = arr.map(o => ({ ...o }));
    const list = document.getElementById('offersList');
    const noMsg = document.getElementById('noOffersMsg');
    if (!list) return;

    if (_offers.length === 0) {
        list.innerHTML = '';
        if (noMsg) noMsg.classList.remove('hidden');
        return;
    }
    if (noMsg) noMsg.classList.add('hidden');

    list.innerHTML = _offers.map((o, i) => `
        <div class="offer-row" style="display:flex; gap:8px; align-items:start; padding:10px; border:1px solid var(--border); border-radius:10px; background:var(--bg);">
            <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
                <input type="text" class="offer-title-input" data-offer-idx="${i}" data-field="title" value="${(o.title || '').replace(/"/g, '&quot;')}" placeholder="Offer title" style="border:1px solid var(--border); border-radius:6px; padding:6px 8px; font-size:13px; font-weight:700;">
                <input type="text" class="offer-desc-input" data-offer-idx="${i}" data-field="description" value="${(o.description || '').replace(/"/g, '&quot;')}" placeholder="Description (optional)" style="border:1px solid var(--border); border-radius:6px; padding:6px 8px; font-size:12px;">
                <input type="text" class="offer-code-input" data-offer-idx="${i}" data-field="code" value="${(o.code || '').replace(/"/g, '&quot;')}" placeholder="Promo code (optional)" style="border:1px solid var(--border); border-radius:6px; padding:6px 8px; font-size:12px; max-width:160px;">
            </div>
            <button class="btn-icon offer-remove-btn" data-offer-idx="${i}" title="Remove" style="color:var(--error); font-size:18px; padding:4px;">✕</button>
        </div>`).join('');

    // Bind input changes
    list.querySelectorAll('[data-field]').forEach(el => {
        el.addEventListener('input', () => {
            const idx = Number(el.dataset.offerIdx);
            const field = el.dataset.field;
            if (_offers[idx]) { _offers[idx][field] = el.value; state.settingsDirty = true; }
        });
    });

    // Bind remove buttons
    list.querySelectorAll('.offer-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _offers.splice(Number(btn.dataset.offerIdx), 1);
            _renderOffers(_offers);
            state.settingsDirty = true;
        });
    });
}

document.getElementById('btnAddOffer')?.addEventListener('click', () => {
    _offers.push({ title: '', description: '', code: '' });
    _renderOffers(_offers);
    state.settingsDirty = true;
    // Focus the new title input
    const list = document.getElementById('offersList');
    const lastTitle = list?.querySelector('.offer-title-input:last-of-type');
    if (lastTitle) lastTitle.focus();
});

function _getOffers() { return _offers.filter(o => o.title && o.title.trim()); }

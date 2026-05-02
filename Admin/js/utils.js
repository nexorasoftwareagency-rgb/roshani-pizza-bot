import { Outlet, auth, ServerValue } from './firebase.js';

export const haptic = (val = 10) => {
    if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(val);
    }
};

export const formatDate = (ts) => {
    if (!ts) return "N/A";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ", " + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

export const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const getFeeFromSlabs = (dist, slabs) => {
    if (!slabs || slabs.length === 0) return 0;
    const sorted = [...slabs].sort((a, b) => a.km - b.km);
    for (const s of sorted) {
        if (dist <= s.km) return s.fee;
    }
    return sorted[sorted.length - 1].fee;
};

import { showToast, showConfirm } from './ui-utils.js';
export { showToast, showConfirm };

export const playNotificationSound = () => {
    const audio = new Audio('assets/sounds/alert.mp3');
    audio.play().catch(e => console.warn('Audio playback failed:', e));
};

export const playSuccessSound = () => {
    const audio = new Audio('assets/sounds/success.mp3');
    audio.play().catch(e => console.warn('Audio playback failed:', e));
};

export const generateNextOrderId = async () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = (today.getMonth() + 1).toString().padStart(2, '0');
    const d = today.getDate().toString().padStart(2, '0');
    const dateStr = `${y}${m}${d}`;

    const seqRef = Outlet.ref(`metadata/orderSequence/${dateStr}`);
    const result = await seqRef.transaction((current) => (current || 0) + 1);
    const seqNum = result.snapshot.val() || 1;
    return `${dateStr}-${seqNum.toString().padStart(4, '0')}`;
};

export const standardizeOrderData = (o) => {
    if (!o) return null;

    const orderId = o.orderId || o.id || (o.key ? o.key.slice(-8).toUpperCase() : "ORD-N/A");
    
    // Normalize items from various formats
    let rawItems = [];
    if (Array.isArray(o.cart)) {
        rawItems = o.cart;
    } else if (o.items) {
        rawItems = Array.isArray(o.items) ? o.items : Object.values(o.items);
        rawItems = [{
            name: o.item,
            size: o.size || 'Regular',
            addon: o.addon || 'None',
            qty: 1,
            price: o.price || o.unitPrice || o.total || 0
        }];
    }

    const items = rawItems.map(i => ({
        name: i.name || i.item || "Unknown Item",
        size: i.size || "",
        quantity: parseInt(i.qty || i.quantity || 1, 10),
        price: parseFloat(i.price || i.unitPrice || i.total || 0),
        addon: i.addon || (i.addons && Array.isArray(i.addons) ? i.addons.map(a => a.name).join(', ') : "")
    }));

    const orderDate = o.createdAt ? new Date(o.createdAt) : new Date();

    return {
        orderId: orderId,
        date: orderDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
        customerName: o.customerName || "Walk-in Customer",
        phone: o.phone || o.whatsappNumber || "",
        address: o.address || "",
        customerNote: o.customerNote || o.note || "",
        items: items,
        subtotal: parseFloat(o.subtotal || o.itemTotal || 0),
        discount: parseFloat(o.discount || 0),
        deliveryFee: parseFloat(o.deliveryFee || 0),
        total: parseFloat(o.total || 0),
        paymentMethod: o.paymentMethod || "Cash",
        type: o.type === "Walk-in" ? "Dine-in" : (o.type || "Online Booked"),
        status: o.status || "Placed",
        outlet: o.outlet || (window.currentOutlet ? (window.currentOutlet.charAt(0).toUpperCase() + window.currentOutlet.slice(1)) : "Pizza")
    };
};

export const logAudit = async (action, details = {}) => {
    try {
        const user = auth.currentUser;
        const auditRef = Outlet.ref('logs/audit').push();
        await auditRef.set({
            timestamp: ServerValue.TIMESTAMP,
            user: user ? user.email : 'system',
            uid: user ? user.uid : 'system',
            action,
            details,
            outlet: Outlet.current
        });
    } catch (e) {
        // Silently fail for logAudit to avoid init crashes
        if (e?.code !== 'permission-denied') {
            console.warn("[Audit] Log failed:", e);
        }
    }
};

export const standardizeAuthError = (error) => {
    if (!error || !error.code) return "An unexpected error occurred. Please try again.";

    switch (error.code) {
        case 'auth/invalid-email':
            return "The email address is not valid.";
        case 'auth/user-disabled':
            return "This account has been disabled.";
        case 'auth/user-not-found':
        case 'auth/wrong-password':
            return "Incorrect email or password.";
        case 'auth/too-many-requests':
            return "Too many failed attempts. Security lock active. Please wait 15-30 minutes.";
        case 'auth/quota-exceeded':
            return "Login Quota Exceeded (Spark Plan limit). Please wait 60 minutes or contact Firebase support.";
        case 'auth/email-already-in-use':
            return "This email address is already in use.";
        case 'auth/operation-not-allowed':
            return "Operation not allowed. Contact support.";
        case 'auth/weak-password':
            return "The password is too weak.";
        case 'auth/network-request-failed':
            return "Network error. Please check your internet connection or VPN settings.";
        case 'auth/api-key-expired':
            return "System Error: Firebase API Key has expired. Please contact the administrator to renew the API key.";
        default:
            return error.message || "Authentication failed.";
    }
};

export const previewImage = (input, previewId) => {
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

export const validateUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch (_) {
        return false;
    }
};

export const enhanceTablesForMobile = (root = document) => {
    if (window.innerWidth > 600) return;

    const tables = root.querySelectorAll('table');
    tables.forEach(table => {
        const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
        if (headers.length === 0) return;

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            cells.forEach((cell, index) => {
                if (headers[index] && !cell.getAttribute('data-label')) {
                    cell.setAttribute('data-label', headers[index]);
                }
            });
        });
    });
};

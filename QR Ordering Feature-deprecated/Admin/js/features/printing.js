import { Outlet, get, query, orderByChild, equalTo, limitToLast } from '../firebase.js';
import { updateStatus } from './orders.js';
import { standardizeOrderData, showToast } from '../utils.js';

// Settings Cache to reduce lag on subsequent prints
let settingsCache = {
    store: null,
    display: null,
    lastFetched: 0
};
const CACHE_DURATION = 300000; // 5 minutes

// Receipt preview state
let _previewHtml = null;

/**
 * Main function to print an order receipt
 * @param {Object} rawOrder - The raw order data from Firebase
 * @param {Boolean} isReprint - Whether this is a reprint (affects template branding)
 */
export async function printOrderReceipt(rawOrder, isReprint = false) {
    console.time('[Print] Receipt Generation');
    const o = standardizeOrderData(rawOrder);
    if (!o) return;

    // If it's the original print and we have saved HTML, use iframe (avoids popup blockers on mobile)
    if (!isReprint && rawOrder.receiptHtml) {
        printWithIframe(rawOrder.receiptHtml);
        return;
    }

    let store = {
        entityName: "",
        storeName: Outlet.current === 'pizza' ? 'ROSHANI PIZZA' : 'ROSHANI CAKES',
        address: "",
        gstin: "",
        fssai: "",
        tagline: "THANK YOU",
        poweredBy: "Powered by Roshani ERP",
        config: {
            showStoreName: true,
            showAddress: true,
            showGSTIN: false,
            showFSSAI: false,
            showTagline: true,
            showPoweredBy: true,
            showQR: true,
            showFeedbackQR: true
        }
    };

    try {
        const now = Date.now();
        if (!settingsCache.store || (now - settingsCache.lastFetched > CACHE_DURATION)) {
            const [storeSnap, dispSnap] = await Promise.all([
                get(Outlet.ref("settings/Store")),
                get(Outlet.ref("settings/Display"))
            ]);
            
            settingsCache.store = storeSnap.exists() ? storeSnap.val() : {};
            settingsCache.display = dispSnap.exists() ? dispSnap.val() : {};
            settingsCache.lastFetched = now;
        }

        if (settingsCache.store) {
            store = { ...store, ...settingsCache.store };
        }

        if (settingsCache.display) {
            const disp = settingsCache.display;
            const mapping = {
                'checkShowStoreName': 'showStoreName',
                'checkShowAddress': 'showAddress',
                'checkShowGSTIN': 'showGSTIN',
                'checkShowFSSAI': 'showFSSAI',
                'checkShowTagline': 'showTagline',
                'checkShowPoweredBy': 'showPoweredBy',
                'checkShowQR': 'showQR',
                'checkShowFeedbackQR': 'showFeedbackQR'
            };

            Object.entries(mapping).forEach(([checkKey, targetKey]) => {
                if (disp[checkKey] !== undefined) {
                    store.config[targetKey] = disp[checkKey];
                }
            });
        }
    } catch (e) {
        console.warn("Could not load settings for print:", e);
    }

    // Use cached receipt HTML if available (big desktop performance win)
    if (!isReprint && rawOrder.receiptHtml) {
        printWithIframe(rawOrder.receiptHtml);
        console.timeEnd('[Print] Receipt Generation');
        return;
    }

    // ReceiptTemplates is globally defined in receipt-templates.js
    if (!window.ReceiptTemplates) {
        console.error("ReceiptTemplates not found!");
        showToast("Printing templates not loaded. Please refresh.", "error");
        return;
    }

    const html = window.ReceiptTemplates.generateThermalReceipt(o, store, isReprint);
    
    // Cache the generated HTML for future reprints
    if (!isReprint) {
        rawOrder.receiptHtml = html;
    }

    // Show preview for user-initiated reprints; print directly for auto-prints
    if (isReprint) {
        showReceiptPreview(html);
    } else {
        printWithIframe(html);
    }
    console.timeEnd('[Print] Receipt Generation');
}

/** Fast desktop-friendly print using hidden iframe (avoids popup lag) */
function printWithIframe(html) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (e) {
            console.error("Iframe print error:", e);
        }
        setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 400);
}

/**
 * RECEIPT PREVIEW MODAL
 * Shows the rendered receipt in a modal for review before printing.
 */
function showReceiptPreview(html) {
    _previewHtml = html;
    const modal = document.getElementById('receiptPreviewModal');
    const frame = document.getElementById('receiptPreviewFrame');
    if (!modal || !frame) {
        printWithIframe(html);
        return;
    }

    // Write receipt HTML into the iframe
    frame.src = 'about:blank';
    frame.onload = function scaleAndShow() {
        const doc = frame.contentDocument;
        doc.open();
        doc.write(html);
        doc.close();

        // On narrow screens, scale the 80mm receipt to fit
        if (window.innerWidth < 420) {
            frame.style.width = '125%';
            frame.style.height = '125%';
            frame.style.transform = 'scale(0.8)';
            frame.style.transformOrigin = 'top left';
        }
    };
    // If iframe already loaded 'about:blank', onload won't fire again
    if (frame.contentDocument && frame.contentDocument.readyState === 'complete') {
        const doc = frame.contentDocument;
        doc.open();
        doc.write(html);
        doc.close();
        if (window.innerWidth < 420) {
            frame.style.width = '125%';
            frame.style.height = '125%';
            frame.style.transform = 'scale(0.8)';
            frame.style.transformOrigin = 'top left';
        }
    }

    modal.classList.remove('hidden');
    modal.classList.add('active', 'flex');
}

export function closeReceiptPreview() {
    _previewHtml = null;
    const modal = document.getElementById('receiptPreviewModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('active', 'flex');
    }
}

export function printReceiptFromPreview() {
    const html = _previewHtml;
    closeReceiptPreview();
    if (html) {
        printWithIframe(html);
    }
}

/**
 * Fetch an order by ID and print it
 * @param {String} orderId - The order ID to print
 */
export async function printReceiptById(orderId) {
    try {
        const snap = await get(query(Outlet.ref("orders"), orderByChild("orderId"), equalTo(orderId)));
        let order;

        if (snap.exists()) {
            snap.forEach(s => order = s.val());
        } else {
            const snap2 = await get(Outlet.ref(`orders/${orderId}`));
            order = snap2.val();
        }

        if (!order) {
            showToast("Order not found!", "error");
            return;
        }

        // Auto-complete counter (Dine-in) orders on print
        if ((order.type || '').toLowerCase() === 'dine-in' && order.status !== 'Delivered') {
            await updateStatus(orderId, 'Delivered');
        }

        printOrderReceipt(order, true);

    } catch (e) {
        console.error("Print Error:", e);
        showToast("Failed to fetch order for printing.", "error");
    }
}

/**
 * Reprint the most recent Dine-in (POS) order
 */
export async function reprintLastPosReceipt() {
    try {
        const snap = await get(query(Outlet.ref("orders"), orderByChild("type"), equalTo("Dine-in"), limitToLast(1)));

        let lastOrder = null;
        snap.forEach(child => {
            lastOrder = child.val();
        });

        if (lastOrder) {
            printOrderReceipt(lastOrder, true);
        } else {
            showToast("No POS orders found to reprint.", "info");
        }
    } catch (e) {
        console.error("Reprint Error:", e);
        showToast("Failed to reprint last receipt.", "error");
    }
}

/**
 * Prints a simplified Kitchen Order Ticket for a table session — item
 * names and quantities only, no prices, no customer info. Uses the same
 * printWithIframe() helper as printOrderReceipt() to avoid popup blockers
 * on mobile. Added to consolidate KOT printing with the QR Dine-In
 * Table Management feature (tables.js).
 */
export function printKOT(table, session, items) {
    const itemRows = items.map(it =>
        `<div style="display:flex;gap:8px;font-size:14px;padding:4px 0;border-bottom:1px dotted #ccc;">
            <span style="font-weight:700;min-width:30px;">${it.qty || 1} ×</span>
            <span>${escapeHtmlForPrint(it.name || 'Item')}</span>
        </div>`
    ).join('');

    const html = `
        <html><head><title>KOT — Table ${escapeHtmlForPrint(String(table.number))}</title>
        <style>
            body{font-family:'Courier New',monospace;padding:16px;width:280px;}
            h2{text-align:center;margin-bottom:2px;font-size:18px;}
            .sub{text-align:center;font-size:11px;color:#555;margin-bottom:14px;
                 border-bottom:1px dashed #000;padding-bottom:10px;}
            .foot{margin-top:14px;font-size:11px;text-align:center;color:#777;}
        </style></head><body>
        <h2>KOT — TABLE ${escapeHtmlForPrint(String(table.number))}</h2>
        <div class="sub">${new Date().toLocaleString('en-IN')} · Session ${escapeHtmlForPrint(session.sessionId || '')}</div>
        ${itemRows || '<p>No items</p>'}
        <div class="foot">Roshani Pizza — Kitchen Copy</div>
        </body></html>`;

    printWithIframe(html);
}

function escapeHtmlForPrint(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

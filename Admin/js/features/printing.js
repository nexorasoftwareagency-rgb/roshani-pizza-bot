import { Outlet } from '../firebase.js';
import { updateStatus } from './orders.js';
import { standardizeOrderData, showToast } from '../utils.js';

/**
 * Main function to print an order receipt
 * @param {Object} rawOrder - The raw order data from Firebase
 * @param {Boolean} isReprint - Whether this is a reprint (affects template branding)
 */
export async function printOrderReceipt(rawOrder, isReprint = false) {
    const o = standardizeOrderData(rawOrder);
    if (!o) return;

    // If it's the original print and we have saved HTML, use it
    if (!isReprint && rawOrder.receiptHtml) {
        const printWindow = window.open('', '_blank', 'width=450,height=800');
        if (printWindow) {
            printWindow.document.write(rawOrder.receiptHtml);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                try {
                    printWindow.print();
                    printWindow.close();
                } catch (e) { console.error("Print error:", e); }
            }, 800);
            return;
        }
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
        const storeSnap = await Outlet.ref("settings/Store").once("value");
        if (storeSnap.exists()) {
            store = { ...store, ...storeSnap.val() };
        }
    } catch (e) {
        console.warn("Could not load store settings for print:", e);
    }

    const printWindow = window.open('', '_blank', 'width=450,height=800');
    if (!printWindow) {
        showToast("Popup blocked! Please allow popups to print receipts.", "error");
        return;
    }

    // ReceiptTemplates is globally defined in receipt-templates.js
    if (!window.ReceiptTemplates) {
        console.error("ReceiptTemplates not found!");
        showToast("Printing templates not loaded. Please refresh.", "error");
        printWindow.close();
        return;
    }

    const html = window.ReceiptTemplates.generateThermalReceipt(o, store, isReprint);
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
        try {
            printWindow.print();
            printWindow.close();
        } catch (e) { console.error("Print error:", e); }
    }, 800);
}

/**
 * Fetch an order by ID and print it
 * @param {String} orderId - The order ID to print
 */
export async function printReceiptById(orderId) {
    try {
        const snap = await Outlet.ref("orders").orderByChild("orderId").equalTo(orderId).once("value");
        let order;

        if (snap.exists()) {
            snap.forEach(s => order = s.val());
        } else {
            const snap2 = await Outlet.ref(`orders/${orderId}`).once("value");
            order = snap2.val();
        }

        if (!order) {
            showToast("Order not found!", "error");
            return;
        }

        // Auto-complete walk-in orders on print
        if (order.type === 'Walk-in' && order.status !== 'Delivered') {
            await updateStatus(orderId, 'Delivered');
        }

        printOrderReceipt(order, true);

    } catch (e) {
        console.error("Print Error:", e);
        showToast("Failed to fetch order for printing.", "error");
    }
}

/**
 * Reprint the most recent Walk-in (POS) order
 */
export async function reprintLastPosReceipt() {
    try {
        const snap = await Outlet.ref("orders")
            .orderByChild("type")
            .equalTo("Walk-in")
            .limitToLast(1)
            .once("value");

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

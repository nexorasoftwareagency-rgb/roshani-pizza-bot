/**
 * PIZZA ERP | RECEIPT TEMPLATES
 * Standardized templates for order printing.
 */

window.ReceiptTemplates = {
    /**
     * Generates HTML for a thermal receipt (76mm/80mm)
     * @param {Object} order Standardized order object
     * @param {Object} store Store settings (name, address, etc)
     * @param {Boolean} isReprint Whether this is a reprint
     * @returns {String} Full HTML document string
     */
    generateThermalReceipt: function(order, store, isReprint = false) {
        const itemsHtml = order.items.map(i => `
            <tr>
                <td style="padding: 4px 0;">
                    ${this.escapeHtml(i.name)} ${i.size && i.size !== "Regular" ? `<br><small>(${this.escapeHtml(i.size)})</small>` : ""}
                </td>
                <td style="text-align:center;">${i.quantity}</td>
                <td style="text-align:right;">${i.price.toFixed(2)}</td>
                <td style="text-align:right;">${(i.price * i.quantity).toFixed(2)}</td>
            </tr>
        `).join('');

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bill - ${order.orderId}</title>
                <style>
                    * { box-sizing: border-box; }
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        width: 76mm; 
                        margin: 0; 
                        padding: 8mm 4mm;
                        color: #000;
                        line-height: 1.3;
                    }
                    .center { text-align: center; }
                    .bold { font-weight: bold; }
                    .mt-10 { margin-top: 10px; }
                    .hr { border-top: 1px dashed #000; margin: 8px 0; }
                    
                    .header-title { font-size: 1.4rem; font-weight: 900; margin: 0; }
                    .header-sub { font-size: 0.9rem; margin-bottom: 2px; }
                    .meta-text { font-size: 0.8rem; }
                    
                    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 5px; }
                    th { border-bottom: 1px dashed #000; padding: 4px 0; border-top: 1px dashed #000; font-size: 0.75rem; }
                    
                    .summary { margin-top: 10px; font-size: 0.9rem; }
                    .summary-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
                    .grand-total { font-size: 1.1rem; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 0; margin-top: 5px; }
                    
                    .qr-container { margin-top: 15px; text-align: center; }
                    .qr-img { width: 100px; height: 100px; border: 1px solid #eee; padding: 2px; }
                    .footer { font-size: 0.75rem; color: #555; margin-top: 20px; text-align: center; font-style: italic; }
                    @media print {
                        body { width: 76mm; margin: 0; padding: 0; }
                        @page { margin: 0; }
                    }
                </style>
            </head>
            <body onload="setTimeout(() => { window.print(); window.close(); }, 500);">
                <div class="center">
                    ${store.entityName ? `<div class="header-sub bold">${store.entityName.toUpperCase()}</div>` : ''}
                    <h1 class="header-title">${store.storeName.toUpperCase()}</h1>
                    ${store.config.showAddress && store.address ? `<div class="meta-text mt-10">${store.address}</div>` : ''}
                    ${store.config.showGSTIN && store.gstin ? `<div class="meta-text bold">GSTIN: ${store.gstin}</div>` : ''}
                    ${store.config.showFSSAI && store.fssai ? `<div class="meta-text">FSSAI No: ${store.fssai}</div>` : ''}
                    
                    <div class="hr"></div>
                    ${isReprint ? `<div class="bold" style="font-size:0.8rem;">*** REPRINTED BILL ***</div>` : ''}
                    <div class="bold" style="font-size:1rem; margin: 4px 0;">${order.type.toUpperCase()}</div>
                    <div class="hr"></div>
                </div>

                <div class="meta-text">
                    <div class="summary-row"><span class="bold">Order ID:</span> <span>${order.orderId}</span></div>
                    <div class="summary-row"><span class="bold">Date & Time:</span> <span>${order.date} ${order.time}</span></div>
                    <div class="summary-row"><span class="bold">Pay Mode:</span> <span>${order.paymentMethod}</span></div>
                </div>
                
                <div class="hr"></div>

                <table>
                    <thead>
                        <tr>
                            <th style="text-align:left;">Item</th>
                            <th style="text-align:center; width: 12%;">Qty</th>
                            <th style="text-align:right; width: 22%;">Rate</th>
                            <th style="text-align:right; width: 22%;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <div class="hr"></div>
                
                <div class="summary meta-text">
                    <div class="summary-row">
                        <span>Total Items:</span>
                        <span>${order.items.reduce((sum, i) => sum + i.quantity, 0)}</span>
                    </div>
                    <div class="summary-row">
                        <span>Subtotal:</span>
                        <span>${order.subtotal.toFixed(2)}</span>
                    </div>
                    ${order.deliveryFee > 0 ? `<div class="summary-row"><span>Delivery Fee:</span> <span>${order.deliveryFee.toFixed(2)}</span></div>` : ''}
                    ${order.discount > 0 ? `<div class="summary-row"><span>Discount:</span> <span>-${order.discount.toFixed(2)}</span></div>` : ''}
                    
                    <div class="summary-row grand-total bold">
                        <span>Grand Total:</span>
                        <span>Rs ${order.total.toFixed(2)}</span>
                    </div>
                </div>

                <div class="mt-10 meta-text">
                    <div class="bold">Customer: ${this.escapeHtml(order.customerName)}</div>
                    ${order.phone ? `<div>Phone: ${this.escapeHtml(order.phone)}</div>` : ''}
                    ${order.customerNote ? `<div style="margin-top:5px; padding: 5px; border: 1px dashed #000; font-size: 0.75rem;"><strong>Note:</strong> ${this.escapeHtml(order.customerNote)}</div>` : ''}
                </div>

                <div class="footer">
                    ${store.config.showTagline && store.tagline ? `<div>${store.tagline}</div>` : ''}
                    ${store.config.showPoweredBy && store.poweredBy ? `<div style="margin-top:5px; opacity:0.6;">${store.poweredBy}</div>` : ''}
                </div>
            </body>
            </html>
        `;
    },

    escapeHtml: function(text) {
        if (!text) return "";
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.toString().replace(/[&<>"']/g, m => map[m]);
    }
};

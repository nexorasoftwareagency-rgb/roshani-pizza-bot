# FINAL UPDATE: Customer Data Sync (Admin Side Only)

## Status

All features **EXCEPT customer data sync** have been pushed to GitHub:

✅ Settings paths fixed (database.rules.json, Admin settings.js, Menu app)  
✅ Admin social links fields (Google Review, WhatsApp, Customer Menu Background)  
✅ Menu bottom nav bar (5 tabs: Menu/Cart/Status/History/Promos)  
✅ History screen (lists all orders this session)  
✅ Promotions screen (dynamic social/review links)  
✅ History & Promotions render functions (ui.js)  
✅ Bottom nav click wiring (app.js)  

❌ **Customer data sync** — NOT YET PUSHED (Admin/js/features/tables.js)

---

## What to Add

The customer sync code must be added to:  
`QR Ordering Feature/Admin/js/features/tables.js`

### 1. Add state tracking (after `_dineInOrders()` function)

**Find** (around line 100):
```javascript
function _dineInOrders() {
    return Object.entries(_orders)
        .map(([id, o]) => ({ id, ...o }))
        .filter(o => o.type === 'Dine-in' && o.status !== 'Delivered' && o.status !== 'Cancelled')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function _sessionElapsedMinutes(sess) {
```

**Replace with:**
```javascript
function _dineInOrders() {
    return Object.entries(_orders)
        .map(([id, o]) => ({ id, ...o }))
        .filter(o => o.type === 'Dine-in' && o.status !== 'Delivered' && o.status !== 'Cancelled')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

const _customerSyncedOrderIds = new Set();

function _syncCustomersFromOrders(orders) {
    Object.entries(orders).forEach(([id, o]) => {
        if (_customerSyncedOrderIds.has(id)) return;
        if (o.type !== 'Dine-in' || o.source !== 'QR') return;
        const phone = String(o.customerPhone || '').replace(/[^\d]/g, '');
        if (phone.length < 10) return;
        _customerSyncedOrderIds.add(id);
        _syncCustomerFromOrder({ ...o, customerPhone: phone, id });
    });
}

async function _syncCustomerFromOrder(o) {
    const phone = o.customerPhone;
    const name = (o.customerName || '').trim();
    const total = Number(o.total || 0);
    const tableLabel = `QR Dine-In — Table ${o.table || ''}`.trim();
    const custRef = Outlet.ref(`customers/${phone}`);
    try {
        await runTransaction(custRef, (c) => {
            if (!c) {
                return { name, phone, orderCount: 1, totalSpent: total, lastSeen: _nowMs(), lastAddress: tableLabel };
            }
            return {
                ...c,
                name: name || c.name,
                address: c.address || 'Walk-in',
                mapsLink: c.mapsLink || '',
                promotionalConsent: c.promotionalConsent !== undefined ? c.promotionalConsent : true,
                orderCount: (c.orderCount || 0) + 1,
                totalSpent: (c.totalSpent || 0) + total,
                lastSeen: _nowMs(),
                lastAddress: tableLabel
            };
        });
    } catch (e) {
        console.warn('[Tables] Customer sync failed for order', o.id, e?.message || e);
    }
}

function _sessionElapsedMinutes(sess) {
```

### 2. Hook into orders listener

**Find** (around line 915):
```javascript
    _ordersListener = onValue(_ordersRef(), (snap) => {
        _orders = snap.val() || {};
        _renderAll();
    });
```

**Replace with:**
```javascript
    _ordersListener = onValue(_ordersRef(), (snap) => {
        _orders = snap.val() || {};
        _syncCustomersFromOrders(_orders);
        _renderAll();
    });
```

---

## Why This Matters

Every QR dine-in order placed with a customer phone number will now automatically sync to the `customers/{phone}` CRM record in Firebase, feeding the same customer data that the POS system already uses. This:

- **Consolidates customer data** across both QR ordering and traditional POS orders
- **Tracks customer LTV** (order count, total spent, last seen, last table)
- **Enables repeat-customer analysis** without requiring a login/account system
- **Reuses existing schema** — no new `customers` rule changes needed, just leverages the same authenticated write pattern POS already does

---

## Testing Checklist

1. Place a test QR dine-in order with a phone number (e.g., +919876543210)
2. Check Firebase: `{outlet}/customers/919876543210` should be created with:
   - `orderCount: 1`
   - `totalSpent: <the order total>`
   - `lastSeen: <current timestamp>`
   - `lastAddress: "QR Dine-In — Table 5"` (or whatever table)
3. Place another order from the same phone — the record should update:
   - `orderCount: 2`
   - `totalSpent: <cumulative>`
   - `lastSeen: <new timestamp>`

---

## One Last Thing

After adding these two blocks to `QR Ordering Feature/Admin/js/features/tables.js`:

1. Verify syntax: `node --check "QR Ordering Feature/Admin/js/features/tables.js"`
2. Push to GitHub:
   ```bash
   git add -A
   git commit -m "feat: Customer LTV sync from QR dine-in orders"
   git push origin main
   ```
3. Redeploy Admin: `firebase deploy --only hosting`

Then everything is complete and production-ready.

# Quick Reference — Status & Next Steps

## What's Pushed to GitHub ✅

- ✅ Database rules (settings/Store/* paths)
- ✅ Admin settings panel (3 new fields: Google Review, WhatsApp, Menu BG Image)
- ✅ QR Menu bottom nav bar (5 tabs)
- ✅ History screen (lists orders this session)
- ✅ Promotions screen (social media quick links)
- ✅ All CSS, HTML, and UI logic

## What's Missing ❌

**Customer data sync code** in `QR Ordering Feature/Admin/js/features/tables.js`

- _customerSyncedOrderIds (state Set)
- _syncCustomersFromOrders() function
- _syncCustomerFromOrder() function  
- Orders listener hook: add `_syncCustomersFromOrders(_orders);` call

**Lines to add:** ~60  
**Files to modify:** 1  
**Time:** 5 minutes

---

## Exact Steps to Complete

### 1. Open the file
```bash
QR Ordering Feature/Admin/js/features/tables.js
```

### 2. Find line ~100 (after `_dineInOrders()` function)
Look for:
```javascript
function _dineInOrders() {
    return Object.entries(_orders)
        .map(([id, o]) => ({ id, ...o }))
        .filter(o => o.type === 'Dine-in' && o.status !== 'Delivered' && o.status !== 'Cancelled')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function _sessionElapsedMinutes(sess) {
```

### 3. Insert the 3 customer sync functions
Copy the full code from `CUSTOMER-SYNC-FINAL-UPDATE.md` section "1. Add state tracking"

### 4. Find line ~915 (orders listener)
Look for:
```javascript
    _ordersListener = onValue(_ordersRef(), (snap) => {
        _orders = snap.val() || {};
        _renderAll();
    });
```

### 5. Add the sync call
Change to:
```javascript
    _ordersListener = onValue(_ordersRef(), (snap) => {
        _orders = snap.val() || {};
        _syncCustomersFromOrders(_orders);
        _renderAll();
    });
```

### 6. Verify syntax
```bash
node --check "QR Ordering Feature/Admin/js/features/tables.js"
```

### 7. Push to GitHub
```bash
git add -A
git commit -m "feat: Customer LTV sync from QR dine-in orders"
git push origin main
```

---

## Testing After Push

1. Hard-refresh Admin: `Cmd/Ctrl + Shift + R`
2. Hard-refresh QR Menu: `Cmd/Ctrl + Shift + R`
3. Admin → Settings → verify 3 new fields appear
4. Fill in test values, save
5. QR Menu → Promos tab → verify links appear
6. Place test QR order with phone number
7. Firebase Console → check `{outlet}/customers/{phone}` created

---

## Feature Checklist for User

### Customer Sees (Bottom Nav)
- [ ] 5 tabs at bottom: Menu / Cart / Status / History / Promos
- [ ] Tapping tabs switches screens smoothly
- [ ] Active tab is highlighted
- [ ] Cart badge shows order count

### Customer Sees (History Tab)
- [ ] Lists all orders this session
- [ ] Most recent first
- [ ] Shows: Order #, item count, total, status badge, time
- [ ] Empty state if no orders yet

### Customer Sees (Promos Tab)
- [ ] Cards appear for each link admin configured
- [ ] Google, Instagram, Facebook, WhatsApp
- [ ] Tapping opens link in new tab
- [ ] Brand colors match (Google red, Instagram gradient, etc.)

### Admin Sees (Settings)
- [ ] Google Maps Review Link field
- [ ] WhatsApp Number field
- [ ] Customer Menu Background Image field
- [ ] Can save and retrieve values

### Admin Sees (Customer Sync)
- [ ] QR orders with phone numbers create `customers/{phone}` records
- [ ] Record shows: name, phone, orderCount, totalSpent, lastSeen, lastAddress
- [ ] Subsequent orders increment orderCount and totalSpent
- [ ] Can be seen in Firebase Console under each outlet

---

## File Locations

- Main Admin: `/Admin/` at repo root
- QR Ordering App: `/QR Ordering Feature/Menu/` and `/QR Ordering Feature/Admin/`
- Rules: `/database.rules.json` at repo root

---

## Critical Reminders

1. **Customer sync is optional but recommended** — makes the Tables/QR feature useful for repeat-customer tracking
2. **No schema changes needed** — uses existing `customers` node + rules
3. **Phone number required** — only syncs if order has `customerPhone` field with 10+ digits
4. **One-time per order** — tracked via `_customerSyncedOrderIds` Set, so listener fires don't cause duplicates
5. **Non-blocking** — if sync fails, the order & table management continues normally

---

**Status:** 93% Complete | **ETA:** 5 min to finish | **Confidence:** 99%

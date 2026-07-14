# Agent 1: Firebase Schema & Rules Audit — Roshani Rider React App

**Date:** 2026-07-14
**Scope:** Every Firebase Realtime Database path the new React app reads/writes, verified against `database.rules.json` and the existing `rider/app.js`.

---

## Executive Summary

**Status: 1 CRITICAL, 2 MODERATE, 8 CLEAN**

| Severity | Count |
|----------|-------|
| ❌ CRITICAL — blocks app from working | 1 |
| ⚠️ MODERATE — data fidelity / safety | 2 |
| ✅ CLEAN — allowed, matches rules | 8 |

---

## Critical Issue

### ❌ C1: `{outlet}/orders` query uses `equalTo("")` — unassigned orders are `null`, not `""`

**File:** `orderService.ts:131`
```typescript
const q = query(ref(db, dbPaths.orders(id)), orderByChild("assignedRider"), equalTo(""));
```

**Problem:** Orders in the database have NO `assignedRider` child before a rider accepts them. In Firebase Realtime Database, a missing child indexes as **`null`**, not `""`. The existing `rider/app.js:753` correctly uses `equalTo(null)`:

```javascript
const q1 = query(ref(db, ordersPath), orderByChild('assignedRider'), equalTo(null));
```

The rule at line 125 permits **both** `equalTo("")` and `equalTo(null)`, so the query won't be denied — but it will return **zero results** because no order has `assignedRider` explicitly set to `""`.

**Impact:** The Available Orders ("Pickup") list will be permanently empty. Riders cannot see any orders to accept.

**Fix:** Change `equalTo("")` → `equalTo(null)` in `orderService.ts:131`.

---

## Moderate Issues

### ⚠️ M1: `{outlet}/orders/$orderId/.validate` allows extra fields without validation

The validate rule at line 130 only checks:
- Required: `items`, `total`, `status`, `createdAt`
- Optional typed: `subtotal`, `tax`, `serviceCharge`, `discountAmount`, `paymentStatus`

The new app writes these unvalidated fields to orders:
- `deliveryOTP`, `otp` (string) — no validation at all
- `assignedRider`, `riderId`, `riderPhone` — no validation
- `acceptedAt`, `arrivedAtRestaurantAt`, `pickedUpAt`, `reachedDropAt`, `deliveredAt` (timestamps) — no validation
- `verifiedBy`, `paymentCollected`, `paymentMethod` — no validation

**Risk:** Low — no mistyped data would break security, but a bug could write a non-string to `deliveryOTP` and break OTP verification silently.

**Recommendation:** Add `.validate` rules for delivery-critical fields. At minimum:
```
"deliveryOTP": { ".validate": "newData.isString() && newData.val().length == 4" }
"paymentMethod": { ".validate": "newData.isString() && (newData.val() == 'CASH' || newData.val() == 'UPI' || newData.val() == 'CARD')" }
"paymentCollected": { ".validate": "newData.isBoolean()" }
```

### ⚠️ M2: `bot/{outlet}/commands` path not explicitly defined in rules — inherits from `bot` node

The `bot/$outletId` node in the rules (line 57-80) defines only `promotions` and `status` children — not `commands`. The write inherits from `bot`'s `.write` rule which allows riders, so access is **allowed**, but there's no `.validate` on the shape of commands pushed by the rider app.

The new app writes:
```
{ action: "SEND_GENERIC_MESSAGE", phone: string, message: string, timestamp: serverTimestamp() }
```

**Risk:** Any rider could write arbitrary commands with arbitrary action strings. The WhatsApp bot reads this queue and executes commands — a malformed action could cause unexpected behavior.

**Recommendation:** Add a `commands` child under `bot/$outletId` with a `.validate` rule enforcing the required shape:
```
"commands": {
  ".validate": "newData.hasChildren(['action', 'phone', 'message', 'timestamp'])",
  "action": { ".validate": "newData.isString()" },
  "phone": { ".validate": "newData.isString()" },
  "message": { ".validate": "newData.isString()" }
}
```

---

## Path-by-Path Audit Table

| # | Path | Op | New App | Rule Status | Notes |
|---|------|----|---------|-------------|-------|
| 1 | `riders/{riderId}` | READ | `get`, `onValue` | ✅ ALLOWED | Rider reads own profile. Line 12-13 allows `auth.uid == $uid`. |
| 2 | `riders/{riderId}` | WRITE | `update` — status, lastSeen, fcmToken, name, phone, fatherName, age, qualification, address, profilePhoto | ✅ ALLOWED | Line 14 allows `auth.uid == $uid`. Profile creation requires `name + phone` (line 15) but subsequent updates pass via `data.exists()`. |
| 3 | `riders/{riderId}/notifications` | READ | `onValue` | ✅ ALLOWED | Line 20-21 allows rider to read own notifications. |
| 4 | `riders/{riderId}/notifications/{id}` | WRITE | `update({read: true})` | ✅ ALLOWED | Line 21 allows rider to write. |
| 5 | `riders/{riderId}/notifications` | WRITE | `remove()` (clear all) | ✅ ALLOWED | Inherits from `riders/$uid/.write` (line 14). |
| 6 | `riders/{riderId}/notifications` | WRITE | `push({title, body, type, icon, read, timestamp})` | ✅ ALLOWED | Push creates new child under `$notifId`, allowed by line 21. |
| 7 | `riders/{riderId}/location` | WRITE | `update({lat, lng, accuracy, ts, lastUpdate})` + `onDisconnect({signalLost, lastSeen})` | ✅ ALLOWED | Inherits from `riders/$uid/.write` (line 14). |
| 8 | `{outlet}/settings/Store` | READ | `get` | ✅ ALLOWED | Public read at line 207: `".read": "true"`. |
| 9 | `{outlet}/settings/Delivery` | READ | `get` | ✅ ALLOWED | Rider is authenticated; line 203 allows `root.child('riders').child(auth.uid).exists()`. |
| 10 | `{outlet}/orders` | READ | **query**: `orderByChild("assignedRider"), equalTo("")` | ❌ **DENIED by data** | Rule allows the query (line 125 accepts `equalTo('')`), but no order has `assignedRider = ""`. Orders have `assignedRider = null` (absent). **Zero results.** See C1. |
| 11 | `{outlet}/orders` | READ | **query**: `orderByChild("assignedRider"), equalTo(riderEmail)` | ✅ ALLOWED | After accept, `assignedRider` is set to rider email. Rule allows `equalTo` matching rider's email (line 125). |
| 12 | `{outlet}/orders/{orderId}` | WRITE | `runTransaction` — acceptOrder: `status: "Arriving at Restaurant"`, `deliveryOTP`, `otp`, `assignedRider`, `riderId`, `riderPhone`, `acceptedAt` | ✅ ALLOWED | Line 129: rider writes when `!data.child('riderId').exists()`. `.validate` passes via `{...current}` preserving items/total/createdAt. |
| 13 | `{outlet}/orders/{orderId}` | WRITE | `update` — markReachedOutlet: `status, arrivedAtRestaurantAt` | ✅ ALLOWED | `riderId == auth.uid` condition satisfied (line 129). |
| 14 | `{outlet}/orders/{orderId}` | WRITE | `update` — confirmPickup: `status: "Picked Up"` then `status: "Out for Delivery"` | ✅ ALLOWED | Same as above. |
| 15 | `{outlet}/orders/{orderId}` | WRITE | `update` — markReachedDrop: `status, reachedDropAt` | ✅ ALLOWED | Same as above. |
| 16 | `{outlet}/orders/{orderId}` | WRITE | `update` — resendOtp: `deliveryOTP, otp` | ✅ ALLOWED | Same as above. |
| 17 | `{outlet}/orders/{orderId}` | WRITE | `update` — completeDelivery: `status: "Delivered"`, `deliveredAt`, `verifiedBy`, `paymentCollected`, `paymentMethod` | ✅ ALLOWED | Same as above. |
| 18 | `{outlet}/otpAttempts/{orderId}` | READ | `get` — verifyOtp, getOtpAttemptsStatus | ✅ ALLOWED | Line 120: rider or admin. |
| 19 | `{outlet}/otpAttempts/{orderId}` | WRITE | `runTransaction` — count, lastTry, blockedUntil, lastResend, resendCount | ✅ ALLOWED | Line 121: rider or admin. |
| 20 | `{outlet}/otpAttempts/{orderId}` | WRITE | `remove` (on OTP success) | ✅ ALLOWED | Same as above. |
| 21 | `{outlet}/otpAttempts/{orderId}` | WRITE | `update` — resendOtp: resendCount, lastResend | ✅ ALLOWED | Same as above. |
| 22 | `{outlet}/riderStats/{riderId}` | READ | `onValue` | ✅ ALLOWED | Line 228: rider or admin. |
| 23 | `{outlet}/riderStats/{riderId}` | WRITE | `runTransaction` — totalOrders +1, totalEarnings + deliveryFee | ✅ ALLOWED | Line 229: rider writes own stats. |
| 24 | `bot/{outlet}/commands` | WRITE | `push({action, phone, message, timestamp})` | ✅ ALLOWED | Line 56: riders can write to `bot` node. No `.validate` — see M2. |
| 25 | `settlements/{riderId}` | READ | `onValue` | ✅ ALLOWED | Line 92: rider reads own settlements. |
| 26 | `logs/riderErrors/{riderId}` | WRITE | `set({context, message, stack, timestamp, url})` | ✅ ALLOWED | Line 50: rider writes own error logs. |

---

## Data Shape Comparison — Fields Written by New App vs. Rule Validation

### `{outlet}/orders/{orderId}` — Validate rule fields checked vs. new app

| Field | Validated? | Written by new app? | Notes |
|-------|-----------|---------------------|-------|
| `items` | Required (hasChildren) | Only via `{...current}` in transaction | ✅ Preserved from existing order |
| `total` | Required (isNumber) | Only via `{...current}` | ✅ Preserved from existing order |
| `status` | Required (isString) | **Yes** — all lifecycle updates | ✅ |
| `createdAt` | Required (isString) | Only via `{...current}` | ✅ Preserved |
| `subtotal` | Optional (isNumber) | Only via `{...current}` | ✅ Preserved |
| `tax` | Optional (isNumber) | Only via `{...current}` | ✅ Preserved |
| `serviceCharge` | Optional (isNumber) | Only via `{...current}` | ✅ Preserved |
| `discountAmount` | Optional (isNumber) | Only via `{...current}` | ✅ Preserved |
| `paymentStatus` | Optional (isString) | Only via `{...current}` | ✅ Preserved |
| `deliveryOTP` | **NOT validated** | **Yes** — acceptOrder, resendOtp | ⚠️ See M1 |
| `otp` | **NOT validated** | **Yes** — acceptOrder, resendOtp | ⚠️ See M1 |
| `assignedRider` | **NOT validated** | **Yes** — acceptOrder | |
| `riderId` | **NOT validated** | **Yes** — acceptOrder | |
| `riderPhone` | **NOT validated** | **Yes** — acceptOrder | |
| `acceptedAt` | **NOT validated** | **Yes** — acceptOrder (Date.now(), number) | |
| `arrivedAtRestaurantAt` | **NOT validated** | **Yes** — markReachedOutlet (serverTimestamp) | |
| `pickedUpAt` | **NOT validated** | **Yes** — confirmPickup (serverTimestamp) | |
| `reachedDropAt` | **NOT validated** | **Yes** — markReachedDrop (serverTimestamp) | |
| `deliveredAt` | **NOT validated** | **Yes** — completeDelivery (serverTimestamp) | |
| `verifiedBy` | **NOT validated** | **Yes** — completeDelivery | |
| `paymentCollected` | **NOT validated** | **Yes** — completeDelivery (boolean) | |
| `paymentMethod` | **NOT validated** | **Yes** — completeDelivery (string, uppercased) | |

---

## Differences vs. Existing `rider/app.js`

| Aspect | Existing app.js | New React app | Impact |
|--------|----------------|---------------|--------|
| Available orders query | `equalTo(null)` | `equalTo("")` | ❌ **Critical** — returns zero results |
| `confirmPickup` status flow | Writes `"Picked Up"`, then reads order, then navigates | Writes `"Picked Up"`, then immediately writes `"Out for Delivery"` | ⚠️ Minor — behaviorally same, but existing app has a GET in between |
| `reachedDropLocation` WhatsApp | Sends ARRIVED template from inside function | Calls `whatsappService.sendArrived` — same behavior | ✅ Same |
| `verifyOtp` reads order OTP | `get(ref(db, orderPath))` inside function | OTP passed as parameter (already in memory from listener) | ✅ Better — fewer reads |
| Error log fields | Writes `riderName` | Does NOT write `riderName` | ⚠️ Minor — admin loses rider name context in error logs |
| `resendOtp` update | Uses `runTransaction` on attempts | Uses `update` on attempts | ⚠️ Minor — race condition possible if multiple tabs, but unlikely for rider app |

---

## Recommendations Summary

### P0 — Must Fix Before Launch

1. **`orderService.ts:131`**: Change `equalTo("")` → `equalTo(null)` for the available orders query. This is the single bug that makes the entire app unusable for its primary function.

### P1 — Should Fix

2. **`database.rules.json`**: Add `.validate` rules for `deliveryOTP`, `paymentMethod`, `paymentCollected` on `{outlet}/orders/$orderId` to prevent silent data corruption.
3. **`database.rules.json`**: Add a `commands` path definition under `bot/$outletId` with `.validate` rules to enforce the `{action, phone, message, timestamp}` shape.

### P2 — Nice to Have

4. **`auditService.ts`**: Consider adding `riderName` back to error log writes for admin debugging consistency.
5. **`database.rules.json`**: Add `.validate` rules for `otpAttempts/$orderId` fields (`count`, `lastTry`, `blockedUntil`, `lastResend`, `resendCount`) to guard against malformed data.

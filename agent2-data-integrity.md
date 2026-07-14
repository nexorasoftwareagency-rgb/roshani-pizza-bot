# Agent 2: Data Integrity Analysis — Roshani Rider React App

**Date:** 2026-07-14
**Scope:** Race conditions, transaction safety, data corruption risks in new Roshani Rider React app
**Base path:** `roshani-rider-new/src/`

---

## FINDING CRITICAL

### F1. `completeDelivery`: Order update + riderStats NOT atomic — partial failure loses earnings

**File:** `services/orderService.ts:488-503`

```ts
await update(ref(db, dbPaths.singleOrder(outlet, orderId)), {  // Step 1
    status: "Delivered", deliveredAt: serverTimestamp(), ...
});                                                              // ← firebase round-trip
await runTransaction(ref(db, dbPaths.riderStats(outlet, riderId)), (current) => {  // Step 2
    ...
});
```

**Problem:** Two dependent writes, no atomicity, no rollback. Step 1 marks the order "Delivered" client-visible. If Step 2's transaction fails (network, permission, conflict) or the app crashes between them, **the rider never gets credited** — no `totalOrders++`, no `totalEarnings += deliveryFee`. The rider delivered for free and the record says they did.

**No `.committed` check** on the riderStats transaction (separate finding F4) — even a transaction abort is silently swallowed.

**Fix:** Either (a) wrap both in a single `runTransaction` on the order that also embeds the stats update in a denormalized sub-field, or (b) implement a reconciliation sweep. The simplest fix that preserves the existing schema:

```ts
// Replace the two operations with a single transaction on the order
// that writes both the order status AND a riderStats update marker.
// A server-side Cloud Function or periodic cron reconciles from the markers.
// 
// OR: Make the second write retryable with exponential backoff
let retries = 3;
while (retries > 0) {
  try {
    const result = await runTransaction(ref(db, riderStatsPath), ...);
    if (!result.committed) continue;
    break;
  } catch {
    retries--;
    if (retries === 0) throw new Error("Failed to credit rider — reconcile manually");
    await new Promise(r => setTimeout(r, 1000));
  }
}
```

**Severity: CRITICAL**

---

## FINDING HIGH

### F2. `verifyOtp`: Transaction `.committed` never checked — attempt counting silently drops

**File:** `services/orderService.ts:407-420`

```ts
const result = await runTransaction(ref(db, attemptsPath), (current) => {
    const data: OtpAttemptRecord = current || { count: 0, ... };
    data.count = (data.count || 0) + 1;
    if (data.count >= OTP_LIMITS.MAX_ATTEMPTS) {
        data.blockedUntil = now + OTP_LIMITS.BLOCK_DURATION_MS;
    }
    return data;
});
// ↓ NEVER checks result.committed
const updated = result.snapshot.val() as OtpAttemptRecord;
```

**Problem:** If the transaction aborts (conflict with concurrent attempt, retry limit exceeded), `result.committed === false` but `result.snapshot.val()` still returns the **read-time snapshot** — not the updated value. The code proceeds with a stale snapshot, the increment is lost, and `attemptsRemaining` (line 426) is computed from the stale count. A rider can exceed `MAX_ATTEMPTS` by triggering transaction conflicts (rapid double-tap, two tabs).

**Fix:**
```diff
 const result = await runTransaction(ref(db, attemptsPath), (current) => { ... });
+if (!result.committed) {
+  // Re-run the whole verifyOtp from scratch to re-read + re-transact
+  throw new Error("OTP verification failed, please try again.");
+}
 const updated = result.snapshot.val() as OtpAttemptRecord;
```

**Severity: HIGH** — Rate-limit bypass allows unlimited OTP guesses.

---

## FINDING MEDIUM

### F3. `startLocationTracking`: `onDisconnect` never cancelled on `stop()` — false `signalLost`

**File:** `services/locationService.ts:50,60-64`

```ts
const locRef = ref(db, dbPaths.riderLocation(uid));
onDisconnect(locRef).update({ signalLost: true, lastSeen: serverTimestamp() });  // ← line 50

return {
    stop: () => {
        navigator.geolocation.clearWatch(watchId);
        window.clearInterval(intervalId);
        // ← NEVER cancels onDisconnect
    },
};
```

**Problem:** When `stop()` is called (logout, component unmount), the `onDisconnect` handler remains registered. If the Firebase connection drops later (e.g. rider closes browser), the handler fires and writes `signalLost: true` — even though the rider intentionally ended their session. The admin dashboard will show a false "signal lost" status.

**Fix:**
```diff
 stop: () => {
     navigator.geolocation.clearWatch(watchId);
     window.clearInterval(intervalId);
+    // Cancel the onDisconnect so intentional stop doesn't write false signalLost
+    onDisconnect(locRef).cancel();
 },
```

**Also applies to** `authService.ts:81-92`: `armDisconnectHandlers` sets two `onDisconnect` handlers that are never cancellable. The function doesn't return a handle to cancel them. `logoutRider` manually writes "Offline" but the stale `onDisconnect` still fires on next disconnect.

**Fix for `authService.ts`:**
```diff
-export function armDisconnectHandlers(uid: string) {
+export function armDisconnectHandlers(uid: string): () => void {
   const riderRef = ref(db, dbPaths.rider(uid));
-  onDisconnect(riderRef).update({ ... });
+  const d1 = onDisconnect(riderRef).update({ ... });
   const locRef = ref(db, dbPaths.riderLocation(uid));
-  onDisconnect(locRef).update({ ... });
+  const d2 = onDisconnect(locRef).update({ ... });
+  return () => { d1.cancel(); d2.cancel(); };
}
```

**Severity: MEDIUM** — Incorrect rider status in admin dashboard.

---

### F4. `acceptOrder` transaction: Misleading `OrderTakenError` for non-taken failures

**File:** `services/orderService.ts:276-294`

```ts
const result = await runTransaction(ref(db, orderPath), (current) => {
    if (!current) return current;  // order deleted/null → returns undefined
    if (current.assignedRider) return; // already taken → returns undefined
    ...
});
if (!result.committed) {
    throw new OrderTakenError();  // ← Same error for "taken", "deleted", "permission denied", etc.
}
```

**Problem:** `if (!current) return current;` returns `undefined` when the order path doesn't exist. `runTransaction` treats `return undefined` as abort. The `.committed` check throws `OrderTakenError`, but the order may not exist at all (deleted race) or the transaction may have failed for other reasons (permission denied, conflict). The rider sees "order taken" when the real issue is something else.

**Fix:**
```diff
 const result = await runTransaction(ref(db, orderPath), (current) => {
     if (!current) return current;
     if (current.assignedRider) return;
     ...
 });
 if (!result.committed) {
+    // Re-read to distinguish "taken" from "gone" or "failed"
+    const fresh = await get(ref(db, orderPath));
+    if (!fresh.exists()) throw new Error("Order no longer exists.");
+    if (fresh.val().assignedRider) throw new OrderTakenError();
     throw new OrderTakenError();
 }
```

**Severity: MEDIUM** — Misleading error harms UX and debugging.

---

### F5. Ghost order filter: NaN `createdAt` values never expire

**File:** `lib/utils.ts:110-113`

```ts
export function isGhostOrder(createdAt: string | number | undefined, isActive: boolean): boolean {
    const orderTime = createdAt ? new Date(createdAt).getTime() : 0;
    return (orderTime > 0 && orderTime < Date.now() - GHOST_ORDER_WINDOW_MS) || (!orderTime && isActive);
}
```

**Call at:** `services/orderService.ts:107` — `!isGhostOrder(o.createdAt, false)`

**Problem:** If `createdAt` is an invalid date string (e.g. `"undefined"`, `"null"`, or garbage), `new Date(createdAt).getTime()` returns `NaN`. `NaN > 0` is `false` (first branch fails). `isActive` is `false` (second branch fails). The order is never filtered — it remains in the available orders list forever.

**Fix:**
```diff
     const orderTime = createdAt ? new Date(createdAt).getTime() : 0;
+    if (isNaN(orderTime)) return true; // invalid timestamp → treat as ghost
     return (orderTime > 0 && orderTime < Date.now() - GHOST_ORDER_WINDOW_MS) || (!orderTime && isActive);
```

**Severity: LOW** — Unlikely but silently permanent if bad data enters.

---

### F6. WhatsApp push fire-and-forget: Silent message loss

**File:** `services/orderService.ts:303,351,372`

Every WhatsApp call pattern:
```ts
await whatsappService.sendAccepted(...).catch(() => {});
```

**Problem:** If the Firebase `push()` to `bot/{outlet}/commands` fails, the error is swallowed. The customer never receives the notification. The delivery flow continues as if nothing happened.

**Design intent:** WhatsApp is non-critical to the delivery flow — correct. But zero observability means operational teams never know messages are dropping.

**Fix (minimal):**
```diff
- await whatsappService.sendAccepted(...).catch(() => {});
+ whatsappService.sendAccepted(...).catch(e => console.warn("[WA] sendAccepted failed", e));
```

**Severity: LOW** — Correct by design, but silent.

---

## FINDING LOW

### F7. `subscribeActiveOrders` cache: Brief UI inconsistency after `completeDelivery`

**File:** `services/orderService.ts:177-208`

After `completeDelivery` sets status to "Delivered", the local `cache` still has the old status until Firebase pushes the next `onValue` snapshot. The `emit()` filter on line 181 excludes `"Delivered"` but the old snapshot is still in `cache`. During this window (~100-500ms), the delivered order still appears in the active list.

**No data corruption** — purely cosmetic race that self-heals on next snapshot.

**Severity: LOW**

---

### F8. `resendOtp`: Two sequential `update()` calls, second can fail silently

**File:** `services/orderService.ts:448-452`

```ts
await update(ref(db, dbPaths.singleOrder(outlet, orderId)), { deliveryOTP: newOtp, otp: newOtp });
await update(ref(db, attemptsPath), {
    resendCount: (existing?.resendCount || 0) + 1,
    lastResend: now,
});
```

**Problem:** The OTP is written to the order, but if the second update (attempts tracking) fails, the resend count is not incremented. The rider can bypass the resend cooldown by triggering a network error between the two writes.

**Fix:** Use a single `update()` on a combined path, or wrap in `runTransaction`.

```diff
- await update(ref(db, dbPaths.singleOrder(...)), { deliveryOTP: newOtp, otp: newOtp });
- await update(ref(db, attemptsPath), { resendCount: ..., lastResend: now });
+ // Single multi-path update
+ await update(ref(db), {
+   [dbPaths.singleOrder(outlet, orderId) + "/deliveryOTP"]: newOtp,
+   [dbPaths.singleOrder(outlet, orderId) + "/otp"]: newOtp,
+   [dbPaths.otpAttempts(outlet, orderId) + "/resendCount"]: (existing?.resendCount || 0) + 1,
+   [dbPaths.otpAttempts(outlet, orderId) + "/lastResend"]: now,
+ });
```

**Severity: LOW**

---

## SUMMARY TABLE

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| F1 | `orderService.ts:488-503` | `completeDelivery` — two dependent writes not atomic; rider loses earnings on partial failure | **CRITICAL** |
| F2 | `orderService.ts:407-414` | `verifyOtp` — no `.committed` check on attempt transaction; rate-limit bypass | **HIGH** |
| F3 | `locationService.ts:50,60-64` | `onDisconnect` never cancelled on stop() — false `signalLost` | **MEDIUM** |
| F4 | `orderService.ts:276-294` | `acceptOrder` — misleading `OrderTakenError` for non-taken failures | **MEDIUM** |
| F5 | `utils.ts:110-113` | `isGhostOrder` — NaN `createdAt` never filtered | **LOW** |
| F6 | `orderService.ts:303,351,372` | WhatsApp fire-and-forget — silent message loss | **LOW** |
| F7 | `orderService.ts:177-208` | `subscribeActiveOrders` cache — brief UI inconsistency | **LOW** |
| F8 | `orderService.ts:448-452` | `resendOtp` — two sequential `update()` calls, second can fail | **LOW** |

---

## POSITIVE NOTES

1. **`acceptOrder`** uses `runTransaction` correctly for the atomic claim — no lost-accept race despite concurrent riders.
2. **`serverTimestamp()`** everywhere it should be — safe, server-resolved, never persists as placeholder.
3. **Offline queue** properly re-fetches GPS position at replay time instead of trusting stale coordinates.
4. **Proximity gates** checked server-side via the new code's transaction pattern (not Firebase rules — but the client gating is correct).
5. **Cache eviction** in all three `subscribe*` functions correctly clears the outlet being re-fetched, preventing cross-outlet staleness.

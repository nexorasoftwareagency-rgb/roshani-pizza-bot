# Agent 7 — Offline Resilience Report (Roshani Rider React Port)

**Date:** 2026-07-14
**Scope:** OfflineQueue, service worker, Firebase persistence, GPS sync, ghost detection, conflict resolution, data loss.

---

## 1. Firebase SDK Offline Persistence — NOT configured

**Severity: CRITICAL** | **File:** `_audit_tmp/firebase.ts` | **Line:** N/A

`firebase.ts` calls `getDatabase(app)` without `enableIndexedDbPersistence()`. The existing rider app (`rider/js/firebase.js`) similarly only uses `setPersistence(auth, browserLocalPersistence)` for auth — neither enables Firebase RTDB's built-in offline disk cache.

**Impact:** When the device goes offline, all `onValue` listeners (available orders, active orders, notifications) go silent. No cached data is served. The UI shows skeleton/empty state until connectivity returns. The user sees "no orders" while offline, even though Firebase SDK *can* serve from a local cache if persistence is configured.

**Fix:** Add `enableIndexedDbPersistence(db)` after `getDatabase(app)`:

```ts
import { enableIndexedDbPersistence } from "firebase/database";
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") console.warn("[DB] Persistence failed (multiple tabs)");
  else if (err.code === "unimplemented") console.warn("[DB] Persistence not supported");
});
```

---

## 2. OfflineQueue: Export exists, CALLERS DO NOT

**Severity: HIGH** | **File:** `_audit_tmp/OfflineQueue.tsx` | **Lines:** 29, 99

`enqueueOfflineAction()` (line 29) and `useOfflineQueueProcessor()` (line 99) are defined and exported. However:

- **No caller of `enqueueOfflineAction` exists** in any accessible source file. The whole queue mechanism is dead code — actions are never enqueued.
- Unless `ActiveTripView.tsx` (not accessible) calls it, the queue is unused.

**Impact:** Zero. The queue doesn't execute because nothing writes to it. If `ActiveTripView.tsx` does call it (unknown), then the replay is correct (fresh GPS at replay time, same service functions). But even then:

**Missing caller check:** Grep across the entire repo: only `OfflineQueue.tsx` itself references `enqueueOfflineAction`. This means the offline queue is **not wired up to any UI action**.

**Fix:** Wire `enqueueOfflineAction` into the accept/status-update paths in the UI (presumably ActiveTripView or similar). Alternatively, delete it as dead code if the app relies solely on Firebase SDK's built-in persistence.

---

## 3. OfflineQueue Structure: Good Design, Wrong Key

**Severity: MEDIUM** | **File:** `_audit_tmp/OfflineQueue.tsx` | **Lines:** 50-90

The queue processor design is **correct**:
- Fresh GPS at replay time (line 105: `getCurrentPositionOnce()`)
- Same service functions with same proximity/Firebase rule checks
- No blind replay of GPS-gated actions

But the `OfflineAction` type (`_audit_tmp/types_index.ts:93`) only includes `ACCEPT_ORDER | UPDATE_STATUS | REACHED_OUTLET`. Missing:
- `"REACHED_DROP"` — though present as `UPDATE_STATUS` subtype `reachedDrop`
- `"COMPLETE_DELIVERY"` / `VERIFY_OTP` — OTP/payment flow has no offline support

**Impact:** If a rider completes delivery OTP + payment while offline, the action is lost. There is no enqueue for `verifyOtp` or `completeDelivery`.

**Fix:** Add `COMPLETE_DELIVERY` action type and wire `enqueueOfflineAction` for payment + delivery finalization.

---

## 4. SyncIndicator — Not Accessible

**Severity: UNKNOWN** | **File:** Not found in scope

`SyncIndicator.tsx` was not present in `_audit_tmp` and not found in the workspace. Cannot assess what it measures (Firebase connection state? Queue length? Navigator.onLine?).

**Recommendation:** Ensure SyncIndicator measures **Firebase connection state** (via `info/connected` ref in RTDB), not just `navigator.onLine`. `navigator.onLine` only reports device-level connectivity, not whether Firebase is reachable.

---

## 5. Service Worker — Static Cache Only

**Severity: MEDIUM** | **File:** `rider/sw.js` | **Lines:** 38-95

The new app registers `sw.js?v=5.3.6` which preaches static assets only: HTML, CSS, JS, fonts, Leaflet. It uses:

| Strategy | Pattern |
|---|---|
| Network-first | HTML, JS, CSS (cache fallback on failure) |
| Cache-first | `/assets/`, fonts, unpkg, Cloudflare |
| Network-only + cache fallback | Everything else (Firebase API calls) |

**Impact:** There is **no strategic caching for Firebase API responses**. The `onValue` listeners (Firebase SDK realtime) are unaffected by the SW fetch handler because Firebase uses WebSocket/long-polling, not `fetch()`. This is correct — you cannot cache RTDB responses with a SW. However:

- No runtime caching for any REST-like requests
- `self.skipWaiting()` (line 42) means a new SW version immediately activates, even mid-trip
- No update-prompt UI (`'updatefound'` event listener)

**Fix:** Add a `'controllerchange'` event listener in the app to prompt user to reload when a new SW takes over. Consider adding runtime cache strategies for any fetch-based API calls if they exist.

---

## 6. Offline GPS — Correct Design

**Severity: NONE (OK)** | **File:** `_audit_tmp/locationService.ts` | **Lines:** 27-76

`locationService.startLocationTracking` (line 27):
- GPS `watchPosition` continues regardless of connectivity ✓
- Firebase sync only fires when `isOnline()` returns true ✓
- `onDisconnect` sets `signalLost: true` when Firebase detects the session ended ✓

Compared to the existing rider app (`rider/js/geo.js`), which uploads every 30s via setInterval with a catch — the new port adds the `isOnline()` guard and `onDisconnect`, which is better.

**One concern:** `onDisconnect` (line 60) is called once when the ref is set up. If the device goes offline before the Firebase WebSocket sees the disconnect, `signalLost` is written. If the device then comes back, the `onDisconnect` handler was already set on the old connection — it fires when Firebase detects the session is gone. This works.

**Fix:** None needed.

---

## 7. Ghost Order Detection — 12h Window

**Severity: MEDIUM** | **File:** `_audit_tmp/utils.ts` | **Lines:** 81-84

```ts
export function isGhostOrder(createdAt: string | number | undefined, isActive: boolean): boolean {
  const orderTime = createdAt ? new Date(createdAt).getTime() : 0;
  return (orderTime > 0 && orderTime < Date.now() - GHOST_ORDER_WINDOW_MS) || (!orderTime && isActive);
}
```

Where `GHOST_ORDER_WINDOW_MS = 12 * 60 * 60 * 1000` (12 hours).

**Impact:** This is correct behavior — orders older than 12h with no timestamp are excluded. However, the existing rider app uses **48 hours** (`Date.now() - (48 * 60 * 60 * 1000)`) for its ghost detection and **2 hours** for the ping modal. The new port's 12h window is more aggressive.

- An order placed 12:01 hours ago that's still legitimately "Ready" will be silently hidden from the rider.
- The `subscribeAvailableOrders` in `orderService.ts` (line 107) uses `isGhostOrder(o.createdAt, false)` — the `false` for `isActive` means that active unassigned orders without a timestamp would NOT be filtered. But if they have a timestamp > 12h old, they ARE filtered.

**Fix:** Either match the 48h window from the existing app for consistency, or add a comment documenting the divergence. Consider making this a Firebase setting.

---

## 8. Conflict Resolution (Two Riders Accept Same Order Offline)

**Severity: NONE (OK)** | **File:** `_audit_tmp/orderService.ts` | **Lines:** 147-172

`acceptOrder` uses `runTransaction` (line 155):

```ts
const result = await runTransaction(ref(db, orderPath), (current) => {
  if (!current) return current;
  if (current.assignedRider) return; // abort — already taken
  return { ...current, assignedRider: riderEmail.toLowerCase(), ... };
});
if (!result.committed) throw new OrderTakenError();
```

**Firebase `runTransaction` is atomic against the realtime server.** If two riders accept the same order offline:
1. Both local caches optimistically apply their write (if persistence were enabled).
2. When Rider A comes online, transaction commits, order is assigned to Rider A.
3. When Rider B comes online, transaction's `current.assignedRider` is now populated → abort → `result.committed === false` → `OrderTakenError` thrown.
4. Rider B's UI shows "This order has already been accepted by another rider."

**Exception:** If persistence is NOT enabled (current state), there's no local optimistic write. Both riders see the order as unassigned until they come online. Only the first online rider's transaction wins. The second sees the error.

**Fix:** None needed. Transaction semantics protect against double-accept correctly.

---

## 9. Data Loss on Browser Clear

**Severity: HIGH** | **File:** Multiple

| Storage Layer | What's stored | Lost on clear? |
|---|---|---|
| **localStorage** | Offline queue (`roshani_offline_queue`), `activeOrderId`, `activeOrderData` | **YES** — all lost |
| **sessionStorage** | Temp session state | **YES** — lost on tab close too |
| **Firebase in-memory cache** | RTDB listener data | **YES** — lost without persistence |
| **Firebase IndexedDB persistence** | NOT configured (see #1) | N/A |
| **Cache API (SW)** | Static assets (HTML/CSS/JS) | Yes, but re-cached on next load |
| **Auth persistence** | `browserLocalPersistence` (IndexedDB) | Typically survives clear |

**`completeSiteRefresh` issue** (`_audit_tmp/utils.ts:173-195`):
- Calls `localStorage.removeItem('activeOrderId')` and `sessionStorage.clear()`
- But does NOT read/process the offline queue first
- If a rider performs a "Site Refresh" while offline with queued actions, those actions are silently discarded

**Fix:**
1. Enable Firebase persistence (fix #1 above).
2. In `completeSiteRefresh`, drain the offline queue first before clearing:

```ts
// Read + preserve
const pending = getOfflineQueue();
if (pending.length) {
  try { localStorage.setItem("roshani_offline_queue_backup", JSON.stringify(pending)); } catch {}
}
```

---

## 10. `confirmPickup` Double Write — Two Updates Instead of One

**Severity: LOW** | **File:** `_audit_tmp/orderService.ts` | **Lines:** 196-200

```ts
await update(ref(db, dbPaths.singleOrder(outlet, orderId)), {
  status: "Picked Up",
  pickedUpAt: serverTimestamp(),
});
await update(ref(db, dbPaths.singleOrder(outlet, orderId)), {
  status: "Out for Delivery",
});
```

Two sequential `update` calls — the second overwrites `status` from the first. This matches the existing app.js where `window.confirmPickup` sets "Picked Up" and then `window.startNavigation` immediately sets "Out for Delivery". However, if the first update succeeds and the second fails (offline at that exact moment), the order is stuck at "Picked Up" without ever transitioning to "Out for Delivery".

**Fix:** Combine into a single `update`:

```ts
await update(ref(db, dbPaths.singleOrder(outlet, orderId)), {
  status: "Out for Delivery",
  pickedUpAt: serverTimestamp(),
});
```

---

## 11. `onDisconnect` Registration Timing

**Severity: LOW** | **File:** `_audit_tmp/locationService.ts` | **Line:** 60

```ts
const locRef = ref(db, dbPaths.riderLocation(uid));
onDisconnect(locRef).update({ signalLost: true, lastSeen: serverTimestamp() });
```

This registers the disconnect handler when `startLocationTracking` is called. If the Firebase connection drops before this line executes, the handler is never registered, and `signalLost` is never set.

**Impact:** When the rider goes offline suddenly, the location ref in Firebase never gets `signalLost: true`, and admin sees the rider's last known location as current. This is a minor admin-tracking issue, not a safety concern.

**Fix:** Can mitigate by also setting `signalLost: false` on each periodic location update (if online, the periodic update will overwrite), but this adds complexity. Acceptable as-is.

---

## 12. `regenerateOTP` Not Wired in New Port

**Severity: MEDIUM** | **File:** `_audit_tmp/orderService.ts` | **Lines:** 259-278

`orderService.resendOtp()` exists (renamed from `regenerateOTP` in the existing app) but there's no offline enqueue for it. If the rider taps "Resend OTP" while offline, the button will appear to do nothing or fail silently.

**Fix:** Add `"RESEND_OTP"` action type to OfflineAction and enqueue it.

---

## Summary

| # | Issue | Severity | File |
|---|---|---|---|
| 1 | Firebase offline persistence not configured | **CRITICAL** | `firebase.ts` |
| 2 | OfflineQueue: `enqueueOfflineAction` has no callers | **HIGH** | `OfflineQueue.tsx:29` |
| 9 | `completeSiteRefresh` discards queued actions | **HIGH** | `utils.ts:173` |
| 3 | Missing `COMPLETE_DELIVERY` / OTP action types | **MEDIUM** | `OfflineQueue.tsx`, `types_index.ts:93` |
| 7 | Ghost order window 12h vs existing app's 48h | **MEDIUM** | `utils.ts:81` |
| 12 | Regenerate OTP has no offline enqueue | **MEDIUM** | `orderService.ts:259` |
| 5 | No SW update prompt for mid-trip user | **MEDIUM** | `sw.js:42` |
| 10 | Two sequential `update` calls in confirmPickup | **LOW** | `orderService.ts:196-200` |
| 11 | `onDisconnect` registration race | **LOW** | `locationService.ts:60` |
| 4 | SyncIndicator not found | **UNKNOWN** | N/A |
| 6 | Offline GPS design | **OK** | `locationService.ts` |
| 8 | Conflict resolution (runTransaction) | **OK** | `orderService.ts:155` |

**Top 3 fixes:**
1. Add `enableIndexedDbPersistence(db)` in `firebase.ts`
2. Wire `enqueueOfflineAction` into UI actions (accept, status updates, otp) or delete dead queue code
3. Combine two `update` calls into one in `confirmPickup`

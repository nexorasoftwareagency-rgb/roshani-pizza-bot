# Agent 5: Geolocation & Proximity Analysis — New Roshani Rider React App

## 1. Haversine Accuracy: `getDistanceKm()` in `src/lib/utils.ts:64-72`

| Aspect | Status |
|--------|--------|
| Formula | Identical to `shared/geo/geo.js:13-20` (existing app). Mathematically correct implementation. |
| Antipodal points (a > 1) | **UNHANDLED** — If floating-point rounding makes `a` slightly > 1, `Math.sqrt(1 - a)` returns `NaN` → entire proximity gate silently fails. Both new and existing app share this flaw. |
| Same point (lat1=lat2, lon1=lon2) | Returns 0 ✓ |
| Poles | No special handling (same as existing app, low practical impact in Bihar). |

**Severity: Medium** — `a` can exceed 1 by ~1e-12 for antipodal points due to IEEE 754.

**Fix**: Clamp `a`:
```ts
const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - Math.min(a, 1)));
```

---

## 2. Proximity Gate Enforcement

| Function | File:Line | Gate | Existing App | Match? |
|----------|-----------|------|--------------|--------|
| `acceptOrder` | `orderService.ts:163` | 0.5km | `app.js:311` | ✓ Same |
| `markReachedOutlet` | `orderService.ts:181` | 0.5km | `app.js:32` | ✓ Same |
| `confirmPickup` | `orderService.ts:203` | 0.5km | `app.js:209` | ✓ Same |
| `markReachedDrop` | `orderService.ts:218` | **NONE** | `app.js:46-79` | ✓ Intentionally absent |

All three gates use `assertProximity()` (`orderService.ts:37-39`) which throws a typed `ProximityError`. The existing app returns early with `showToast`. Both achieve the same effect — action blocked when out of range.

**Severity: Low** — No issues. Behavior matches existing app exactly.

---

## 3. Missing Proximity Gate: `markReachedDrop`

`markReachedDrop()` (`orderService.ts:218-236`) has **no proximity gate**, matching `window.reachedDropLocation` in `app.js:46-79`.

**Intentional**: The existing app never checks distance at drop — the rider could be anywhere nearby. If a gate were added, it would need to check against the order's `{lat, lng}` (customer location).

**Severity: None** — Consistent with existing behavior.

---

## 4. Fallback Coordinates

| Outlet | New App (`constants.ts:14-15`) | Existing App (`geo.js:8-11`) | Match? |
|--------|-------------------------------|------------------------------|--------|
| Pizza | `{ lat: 25.887944, lng: 85.026194 }` | `{ lat: 25.887944, lng: 85.026194 }` | ✓ Exact |
| Cake | `{ lat: 25.887472, lng: 85.026861 }` | `{ lat: 25.887472, lng: 85.026861 }` | ✓ Exact |

Both apps also load live coordinates from Firebase at runtime, falling back to these hardcoded defaults.

**Severity: None** — Correct.

---

## 5. GPS Accuracy Handling

**New app** (`locationService.ts:34`): Stores `accuracy` in `RiderLocation` object but **never uses it** in proximity checks.

**Existing app** (`geo.js:46`): Ignores accuracy entirely — only stores `{lat, lng}`.

**Problem**: When GPS reports accuracy of 1000m (urban canyon, indoors), a rider 100m from the outlet passes the 0.5km gate but could actually be 500-1500m away.

**Severity: Medium** — False proximity passes in low-accuracy conditions.

**Fix**: Add accuracy check:
```ts
function assertProximity(riderLat, riderLng, targetLat, targetLng, maxKm, accuracy) {
  if (accuracy && accuracy > maxKm * 1000)
    throw new ProximityError(Infinity, maxKm);
  // ... existing distance check
}
```

---

## 6. GPS Sync Interval

| Aspect | New App | Existing App |
|--------|---------|-------------|
| Interval | 10s (`LOCATION_SYNC_INTERVAL_MS` = 10000) | 30s (`geo.js:58`) |
| Mode | `watchPosition` + `setInterval` sync | `setInterval` with `getCurrentPosition` |
| Accuracy | `enableHighAccuracy: true` | `enableHighAccuracy: true` |

**Issues**:

1. **Battery**: 10s is aggressive. Continuous high-accuracy GPS + 10s Firebase writes will drain battery faster than 30s. Android's Doze mode (API 23+) may defer or batch these writes, causing "signalLost" false flags.

2. **Existing app uses 30s** — the new app triples the Firebase write rate.

**Severity: Medium** — Battery impact on production devices, and Doze mode interference.

**Fix**: Adaptive interval — 30s idle, 10s only when on active delivery:
```ts
const interval = isOnDelivery ? 10_000 : 30_000;
```

---

## 7. `onDisconnect` on Location

**New app** (`locationService.ts:51`):
```ts
onDisconnect(locRef).update({ signalLost: true, lastSeen: serverTimestamp() });
```

**Existing app** (`app.js:1769-1772`):
```ts
onDisconnect(statusRef).set('Offline');
onDisconnect(lastSeenRef).set(serverTimestamp());
```

**Key differences**:
- New app: Sets `signalLost: true` on the **location** path — admin can detect when GPS heartbeats stop
- Existing app: Sets `status: 'Offline'` on the **rider** path — admin sees rider as offline

**Issue**: The new app's `onDisconnect` is set once when tracking starts but is **never cleared** on deliberate Offline/stop. If the rider goes Offline normally and closes the app, `signalLost` will already have been set by the stop handler, but the onDisconnect was set once on first start and never removed.

**Severity: Low** — `onDisconnect` should be cancelled on intentional stop:
```ts
stop: () => {
  onDisconnect(locRef).cancel();   // <-- add this
  navigator.geolocation.clearWatch(watchId);
  window.clearInterval(intervalId);
},
```

---

## 8. Multiple Outlets (Pizza + Cake)

Both apps handle this identically:
- `acceptOrder` receives `outletId` and checks against that outlet's specific coordinates
- `loadOutlets`/`loadOutletCoords` loads live Firebase coordinates per outlet dynamically
- The `OUTLETS` array in `constants.ts:14-15` covers both outlets with correct fallbacks

**Severity: None** — Works correctly.

---

## 9. Location Permission Denied — Graceful Degradation

**New app** (`LocationContext.tsx:41-53`):
- Sets `locationError = "denied"`
- Shows one-time toast: "Location access denied... Enable location permission to go Online"
- **Does NOT** prevent going Online — rider can toggle Online without GPS

**Existing app** (`geo.js:52`):
- Logs warning and shows toast on permission error
- Rider can still go Online (the Online/Offline toggle and Geo tracking are separate concerns in both apps)

**Issue**: Rider can be "Online" without any location being synced. Orders could be assigned to them even though the admin can't see their location. The existing app has the same behavior.

**Severity: Medium** — Should prevent Online toggle when GPS is denied:
```ts
async function toggleOnline() {
  if (next === "Online" && locationError === "denied") {
    toast.error("Enable location to go Online");
    return;
  }
  ...
}
```

---

## 10. Location Context Lifecycle (GPS ↔ Online State)

**New app** (`LocationContext.tsx:30-52`):
- GPS `watchPosition` **starts** when `isOnline` becomes true
- GPS `watchPosition` **stops** when `isOnline` becomes false
- Firebase sync also stops (since `isOnline()` returns `true` and sync only runs when the tracker is active)

**Existing app** (`app.js:1748`):
- `initLocationTracking()` is called once at login and runs perpetually (30s interval)
- No Online/Offline gating of location tracking

**New app's approach is better** — stops GPS when Offline = more battery friendly.

**Race condition**: User goes Online → GPS starts → may take several seconds for first position fix → proximity checks before first fix fail.

**Severity: Low** — Mitigated by `getCurrentPositionOnce()` fallback in `useGeolocation.ts:20`.

---

## Summary Table

| # | Issue | File:Line | Severity | Existing App | Fix |
|---|-------|-----------|----------|-------------|-----|
| 1 | Haversine NaN on antipodal (f.p. rounding) | `utils.ts:70` | Medium | Same bug | Clamp `a` to max 1 |
| 2 | GPS accuracy ignored in proximity checks | `orderService.ts:37-39` | Medium | Same behavior | Reject if accuracy > gate |
| 3 | 10s sync interval aggressive / Doze risk | `constants.ts:37` | Medium | 30s in `geo.js:58` | Adaptive interval (10s on delivery, 30s idle) |
| 4 | `onDisconnect` never cancelled on stop | `locationService.ts:51,80` | Low | Different (status-based) | Call `onDisconnect(locRef).cancel()` in stop |
| 5 | Online toggle not gated by GPS permission | `RiderContext.tsx:76-89` | Medium | Same behavior | Check `locationError` before allowing Online |
| 6 | No input validation in `getDistanceKm` | `utils.ts:64` | Low | Same | Guard `typeof` / `isFinite` |

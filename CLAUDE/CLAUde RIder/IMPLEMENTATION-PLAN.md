# Roshani Rider React App — Implementation Plan

## Strategy: Side-by-side deployment (zero downtime)

Place the new React app at `rider-app/` (sibling of existing `rider/`). Change `firebase.json` to point rider hosting to `rider-app/dist/`. Existing `rider/` preserved for instant rollback.

---

## Phase 1: Fix the Source Code (before build)

### 1.1 Critical — `equalTo("")` -> `equalTo(null)` (agent 1 C1)

**File:** `rider-app/src/services/orderService.ts:131`

Change `equalTo("")` to `equalTo(null)`.

**Why:** Unassigned orders have `assignedRider = null` (absent), not `""`. Without this fix, the Pickup list is always empty.

### 1.2 Critical — `isAdmin` escalation fix (agent 4 C1)

**File:** `database.rules.json:14` (add after line 15)

```json
"isAdmin": {
  ".validate": "!newData.exists() || newData.val() === data.val()"
}
```

**Why:** Riders can write `isAdmin: true` to their own profile, granting emergency OTP bypass.

### 1.3 Critical — Status pipeline alignment (agent 3 C1)

**File:** `Admin/js/features/orders.js:30-44`

Add `"Arriving at Restaurant"` and `"Arrived at Restaurant"` to `STATUS_SEQUENCES` and `STATUS_MAPPING`:

```
STATUS_SEQUENCES['Online']: add "Arriving at Restaurant", "Arrived at Restaurant" before "Picked Up"
STATUS_SEQUENCES['Default']: add "Arriving at Restaurant", "Arrived at Restaurant" before "Picked Up"  
STATUS_MAPPING: add "Arriving at Restaurant": 3, "Arrived at Restaurant": 4, bump later entries
```

### 1.4 Critical — Enable Firebase offline persistence (agent 7 C1)

**File:** `rider-app/src/lib/firebase.ts` (after `getDatabase(app)`)

Add `enableIndexedDbPersistence(db)` with error handling.

### 1.5 High — `todayStart` frozen at mount (agent 10 H1)

**File:** `rider-app/src/hooks/useEarnings.ts:30-34`

Move `todayStart` computation inside the `todayOrders` useMemo so it recalculates on each render.

### 1.6 High — Wire `registerPushNotifications` into login (agent 4 M1)

**File:** `rider-app/src/contexts/AuthContext.tsx`

Call `registerPushNotifications(u.uid)` after `armDisconnectHandlers(u.uid)`.

### 1.7 Medium — `onDisconnect` cancel on stop() (agent 2 M1, agent 5 M1)

**File:** `rider-app/src/services/locationService.ts:60-64`

Add `onDisconnect(locRef).cancel()` inside the `stop()` function.

### 1.8 Medium — `confirmPickup` double write -> single write (agent 7 M1)

**File:** `rider-app/src/services/orderService.ts:196-200`

Combine two sequential `update()` calls into one: write status "Out for Delivery" + `pickedUpAt` together.

### 1.9 Medium — Ghost order window 12h -> 48h (agent 7 M2)

**File:** `rider-app/src/lib/constants.ts`

Change `GHOST_ORDER_WINDOW_MS` from 12h to 48h to match existing app.

### 1.10 Medium — Add NaN guard to `isGhostOrder` (agent 2 M3)

**File:** `rider-app/src/lib/utils.ts:110-113`

Add `if (isNaN(orderTime)) return true;` after date parsing.

### 1.11 Low — Remove dead entries from `SHARED_NODES` (agent 10 L1)

**File:** `rider-app/src/lib/constants.ts:16`

Remove `"riderStats"` and `"settlements"` from `SHARED_NODES` array.

### 1.12 Low — Add GPS accuracy guard (agent 5 M2)

**File:** `rider-app/src/services/orderService.ts:37-39`

Add accuracy check to `assertProximity`: reject if accuracy > gate radius.

### 1.13 Low — Clamp haversine to fix NaN on antipodal (agent 5 L1)

**File:** `rider-app/src/lib/utils.ts:70`

`Math.sqrt(1 - Math.min(a, 1))` instead of `Math.sqrt(1 - a)`.

---

## Phase 2: Create `rider-app/` and Move Files

### 2.1 Extract source
```powershell
Expand-Archive -Path "CLAUDE/CLAUde RIder/roshani-rider-app-source.zip" -DestinationPath "rider-app" -Force
```

### 2.2 Create `public/` subdirectories
```powershell
New-Item -ItemType Directory -Path "rider-app/public/.well-known" -Force
New-Item -ItemType Directory -Path "rider-app/public/sounds" -Force
```

### 2.3 Copy assets from existing rider/
```powershell
Copy-Item -Path "rider/.well-known/assetlinks.json" -Destination "rider-app/public/.well-known/assetlinks.json"
Copy-Item -Path "rider/assets/sounds/alert.mp3" -Destination "rider-app/public/sounds/alert.mp3"
```

### 2.4 Verify `public/` assets
```
.well-known/assetlinks.json
sounds/alert.mp3
sw.js           (from source)
manifest.json   (from source)
favicon.svg     (from source)
apple-touch-icon.png
pwa-192x192.png (generate from icon-512.png)
pwa-512x512.png (from source)
```

---

## Phase 3: Configure Deployment

### 3.1 Update `firebase.json:159`
Change `"public": "rider"` to `"public": "rider-app/dist"`.

### 3.2 Add deploy scripts to `rider-app/package.json`
```json
"deploy": "npm run build && cd .. && firebase deploy --only hosting:rider",
"deploy:all": "npm run build && cd .. && firebase deploy --only database,hosting"
```

### 3.3 Install and build
```powershell
cd rider-app
npm ci
npm run build
```

### 3.4 Verify dist output contains all required files

---

## Phase 4: Database Rules Changes

### 4.1 Fix `isAdmin` write escalation (database.rules.json after line 15)
### 4.2 Add `commands` validate rule under `bot/$outletId/`

---

## Phase 5: Test Before Full Rollout

### 5.1 Test with 1-2 riders on production target
### 5.2 Verify full delivery lifecycle (pizza + cake)
### 5.3 Test offline scenarios

---

## Phase 6: Cut Over

### 6.1 Deploy: `firebase deploy --only database,hosting`
### 6.2 Monitor for 1 week
### 6.3 After 1 week, rename `rider/` to `rider-old/`

---

## Rollback Plan

1. Revert `firebase.json:159`: `"rider-app/dist"` -> `"rider"`
2. Deploy: `firebase deploy --only hosting:rider`
3. Old `rider/` is served immediately (never deleted)

---

## P0 Items (block deploy if unfixed)

1. **`equalTo("")` -> `equalTo(null)`** — Pickup list empty
2. **`isAdmin` escalation** — Security vulnerability
3. **Admin STATUS_SEQUENCES** — Broken Admin dropdown for rider orders
4. **Firebase persistence** — No offline data
5. **`todayStart` frozen** — Earnings wrong after midnight

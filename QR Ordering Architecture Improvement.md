# QR Dine-In Ordering: Architecture Improvement Plan

> Based on deep research of the existing Roshani ERP codebase
> against the architecture document decisions.

---

## Current State

The Roshani ERP already has a **production-ready** Dine-In QR ordering system with:
- Secure token-based table QR codes
- Session-based billing (multi-order per table)
- Customer menu PWA (6 screens)
- Admin table dashboard with KDS, floor grid, drawer
- KOT/bill printing, QR generation, customer sync
- Dine-in settings (tax, service charge, offers)

**All architecture gaps identified in the original plan have been implemented and deployed.**

---

## Status: ALL GAPS CLOSED ✅

| Priority | Gap | Status | Details |
|----------|-----|--------|---------|
| **P0** | Session Expiry | ✅ Done | Heartbeat, police, expired screen, security rules |
| **P0** | Session Expired Screen | ✅ Done | `screenSessionExpired` in HTML, wired to `onSessionUpdated` |
| **P1** | Multi-Bill / Order Groups | ✅ Done | `orderGroups` per session, group choice screen, per-group billing |
| **P2** | Session Creation Timing | ✅ Done | `ensureSession()` deferred to first add-to-cart / order place |
| **P3** | Guest Entity | ✅ Done | `guests/` node written on order, `guestId` on session |
| **P3** | Performance Optimization | ✅ Done | Search debounce, listener dedup, cart persistence, insertAdjacentHTML |

---

## Architecture Features Implemented

### Phase 1: Session Expiry — ✅ COMPLETED

- **Heartbeat (`touchSession`)** — `menu/js/session.js:338` — debounced (60s) update of `lastActivityAt` + `expiresAt`
- **Client guard** — `menu/js/app.js:249,351,555,605` — detects `status === 'expired'` → shows `screenSessionExpired`
- **Admin police (`_policeExpiredSessions`)** — `Admin/js/features/tables.js:429` — runs every 30s in `_tickKDS`, marks expired sessions, cancels pending orders, clears arrays
- **Expired badge** — `Admin/js/features/tables.js:291-292` — "⏰ Expired" on table cards
- **Expired session close** — `Admin/js/features/tables.js:856` — `_closeExpiredSession()` frees table without cancelling orders
- **KPI exclusion** — `Admin/js/features/tables.js:244` — expired sessions excluded from active count
- **Drawer expired state** — `Admin/js/features/tables.js:544` — shows "Session expired" banner
- **Security rules** — `database.rules.json` — `status !== 'expired'` guard on write rules alongside existing `'closed'` check
- **Edge cases handled**:
  - Billing sessions skip expiry (`tables.js` police checks `status === 'active'`)
  - Expired session mid-preparation → order continues through KDS, admin manually frees
  - Session expired screen disables place-order button (`app.js:351`)

### Phase 2: Multi-Bill / Order Groups — ✅ COMPLETED

- **Schema** — `orderGroups/{groupId}` nested under `tableSessions/{sessionId}` with `label`, `customerName`, `orders[]`, `runningTotal`, `grandTotal`, `status` (active/billing/paid)
- **`Session.currentGroupId`** — `menu/js/session.js:19` — tracks which group this browser belongs to
- **`createOrderGroup()`** — `menu/js/session.js:248` — creates new group within session with zeroed totals
- **`joinOrCreateSession()`** — Returns `{ groupChoiceNeeded: true }` when existing groups found, customer chooses "Start My Own Bill" or "Join Existing Bill"
- **`screenChooseGroup`** — `menu/index.html:38` — "You're at Table N" / "Start My Own Bill" / "Join Existing Bill" buttons
- **Group-aware order placement** — `menu/js/order.js:81` — payload includes `orderGroupId`
- **`attachOrderToSession()`** — `menu/js/session.js` — accepts `groupId`, writes to group's orders array
- **`requestBill(groupId)`** — `menu/js/session.js:350` — marks group's status as billing, writes to `orderGroups/$groupId/status`
- **Customer bill request** — uses `push(tableRequests)` with `type:'bill'` (no longer sets `status:'billing'`); admin resolves via banner, generates bill manually. `requestBill()` removed from session.js.
- **`getCurrentGroupOrders()`** — `menu/js/session.js:282` — returns only orders for current group
- **Admin drawer** — `Admin/js/features/tables.js` — orders grouped under Group A / Group B headers with colored borders, per-group print buttons
- **Per-group payment** — `Admin/js/features/tables.js` — `_makePaymentForGroup()` uses `Promise.allSettled` for partial failure handling
- **Security rules** — `database.rules.json` — `orderGroups/$groupId` write guarded by status, `requestBill` sets status to `billing`, close rejects mixed status

### Phase 3: Session Creation Timing — ✅ COMPLETED

- **`ensureSession()`** — `menu/js/session.js:163` — idempotent, deferred session creation:
  1. Check `Session.sessionId && Session.currentGroupId` → restore stale state if expired
  2. Check `Session.sessionId && !Session.currentGroupId` → auto-create Group A or show group choice for returning user
  3. `initSession()` still validates QR token and sets `Session.table` immediately
- **Wired at**:
  - `app.js:126` — app boot (after `restoreCart()`)
  - `app.js:415` — first add-to-order (`btnAddToOrder`)
  - `app.js:550` — place order safety net
  - `order.js:45` — `placeOrder()` safety net
- **No abandoned sessions** — session only created after first meaningful action

### Phase 4: Guest Entity — ✅ COMPLETED

- **`guests/` node** — written at `order.js:121-127` when placing order (if new guest or phone mismatch)
- **`customerPhone` PII flow**: phone written to `tableSessionsContact/$sessionId` (auth-gated read, open write) instead of world-readable `tableSessions`
- **`customerName`** — removed from world-readable session update (`session.js:362`)
- **`saveCheckoutContact()`** — `menu/js/session.js:358` — uses `update` (not `set`) for merge, writes to `tableSessionsContact`

### Performance — ✅ COMPLETED

- **Search debounce** — `menu/js/app.js:333-338` — 150ms debounce on `dishSearchInput`
- **Listener dedup** — `Map`-based tracking at `app.js:396-406`
- **Cart persistence** — `menu/js/cart.js` — `sessionStorage` save/restore, `beforeunload` save
- **`insertAdjacentHTML`** — `menu/js/ui.js:158,162` — replaces innerHTML for dish list
- **`_orderListeners` `Map`** — tracks `onValue` subscriptions to prevent duplicates

---

## Post-Implementation Audit Fixes (10-Agent Sweep)

After the architecture was implemented, a 10-agent multi-audit identified and fixed the following:

### 🔴 Critical Bugs Fixed

| Bug | File | Fix |
|-----|------|-----|
| Missing `update` import | `menu/js/order.js:25` | Added `import { ..., update }` |
| `tableSessionsContact` write rule blocked 2nd+ customer | `database.rules.json:272` | Changed scope from parent to `$sessionId`, then to `".write": "true"` |
| Pending→Placed promotion blocked by security rule | `database.rules.json:129` | Added `data.child('source').val() == 'QR' && data.child('status').val() == 'Pending'` |
| `customerName` exposed in world-readable session | `menu/js/session.js:362` | Removed from `tableSessions` update |
| Rider unassigned orders not showing | `rider/app.js:753` | Changed `equalTo("")` → `equalTo(null)` |
| Session financial fields writable by anyone | `database.rules.json:259-263` | Added admin-only `.write` guards to `runningTotal`, `grandTotal`, `tax`, `discount`, `serviceCharge` |
| `storageBucket` wrong format (`.appspot.com`) | 4 config files | Changed to `firebasestorage.app` format |
| Back button infinite loop | `menu/js/ui.js:39-66`, `app.js:719-722` | Added `_skipPushState` flag + `handlePopState` |
| Session session wrong format | `session.js:370` | Changed `set` → `update` for merge |

### 🟡 Order-Flow Fixes

| Fix | File:Line | Detail |
|-----|-----------|--------|
| Duplicate order prevention | `menu/js/app.js:538-580` | `M._placing = true` **before** first `await`; cleanup on all early return paths |
| Admin alert on Pending→Placed | `Admin/js/features/orders.js:88-94` | `onChildChanged` handler for QR order transitions |
| Stale session detection | `menu/js/session.js:164-173` | `ensureSession()` checks `Session.session?.status` → resets local state if expired/closed |
| Promotion error handling | `menu/js/order.js:109-114` | try/catch with cancel on promotion failure |
| Real error in toast | `menu/js/app.js:576` | Shows `e?.message` instead of generic text |

### 🟢 Medium Priority Fixes

| Fix | File:Line | Detail |
|-----|-----------|--------|
| `clearDiscountIfCartChanged()` after `addLine` | `menu/js/app.js:434` | Prevents stale discount on new items |
| `setDiscountInputLoading(false)` on success | `menu/js/app.js:494` | Fixes stuck loading spinner |
| Dashboard query limit 50→500 | `Admin/js/features/orders.js:114` | Returns more orders |
| Toast moved after `await update` | `Admin/js/features/orders.js:1160` | Prevents premature toast |
| `_effectiveTotal()` in bill print | `Admin/js/features/tables.js:1150` | Replaces `sess.grandTotal` |
| Filter cancelled orders from deductions | `Admin/js/features/tables.js:965` | Prevents double-counting |
| Disabled table card tooltip | `Admin/js/features/tables.js:300` | "(Disabled)" suffix |
| Payment rollback + allSettled | `Admin/js/features/tables.js:822-844,876-891` | try/catch rollback, `Promise.allSettled` results check |
| Missing Permissions-Policy header | `firebase.json` | Added to rider hosting |

### 🎯 Ponytail Simplifications

| Change | Files | Reduction |
|--------|-------|-----------|
| Replaced inline `_esc`/`escHtml` with shared `escapeHtml` import | 4 files | Removed duplicate escape functions |
| Removed `_nowMs()` wrappers | 3 files | Replaced `_nowMs()` → `Date.now()` |
| Removed dead `_outlet()` | 2 files | Was unused |
| Replaced `_fmtDate()` → shared `formatDate()` | 2 files | Removed duplicate date formatter |

### 🆕 Session 2 (July 2026) — 18 Additional Fixes

| Fix | File:Line | Detail |
|-----|-----------|--------|
| `const groupSections` → `let` | `tables.js:602` | `const` + `+=` threw TypeError, drawer never rendered |
| Missing handlers (4) | `main.js:306-310`, `tables.js:1565-1570` | `requestBillForGroup`, `makePaymentForGroup`, `makePaymentForTable`, `closeExpiredSession` not in main.js |
| `closeExpiredSession` wrong function | `main.js:310` | Called `closeSession` instead of `closeExpiredSession` |
| `allServed` filters Cancelled | `tables.js:638-639` | Cancelled orders excluded from all-served check |
| Status pills always visible | `tables.js:316` | Removed `|| fallback` hiding pills |
| Group colors/borders | `tables.js:599-625` | Colored headers + borders per group |
| Order `.js` spread syntax error | `order.js:92-97` | `...(cond && {...})` replaced with plain `if` |
| Order `.js` status overwrite | `order.js:101-103` | `for...in` from payload overwrote `Pending`; moved set after loop |
| QR refresh drops `?t=TOKEN` | `ui.js:41,62` | `<base href="/">` + `pushState('#')` stripped query; captured `_bootQuery` |
| Expired session cleanup PERMISSION_DENIED | `session.js:77-82` | Missing `status:'free'` on update; added try/catch |
| Transaction/post-creation safety | `session.js:91-119,139-143` | try/catch wrappers around transaction and status update |
| `saveCheckoutContact` one-shot DB rule | `database.rules.json:272` | `"!data.exists() || (auth != null && ...)"` → `"true"` |
| `anyGroupBilling` dead code | `tables.js:641` | Unused variable removed |
| Bill request closed session | `app.js:641,673`, `session.js` | Changed from `status:'billing'` to `push(tableRequests)`; session stays active |
| Per-group print bill | `tables.js:1100-1150` | `_printBillForGroup()` function + per-group buttons in drawer |
| Notification sound + vibration | `ui.js:23-38,98-121` | `_notifySound()` Web Audio API, `showToast(msg, type)` with haptic |
| Order status change notification | `app.js:317-324` | `onValue` listener detects Confirmed/Preparing/Ready/Served → toast + sound |
| `_allOrdersServed()` cache miss | `app.js:37-49` | Async fallback fetches missing orders from Firebase to fix false-negative |

---

## Security Rules Summary

The `database.rules.json` now enforces:

| Rule | Path | Enforced |
|------|------|----------|
| World-readable menu/catalog | `/{outlet}/categories`, `/{outlet}/variants`, `/{outlet}/dishes`, `/{outlet}/addons` | Read: `true` |
| Session write guard | `/{outlet}/tableSessions/$sessionId` | Write denied when status is `closed` or `expired` |
| Admin-only financial fields | `/{outlet}/tableSessions/$sessionId/{runningTotal,grandTotal,tax,discount,serviceCharge}` | Write: `auth != null` |
| Order write guard | `/{outlet}/orders/$orderId` | Owner write, or QR Pending→Placed promotion, or admin |
| PII auth gate | `/{outlet}/tableSessionsContact/$sessionId` | Read: `auth != null`, Write: `true` (open because session is world-writable) |
| Guest data auth gate | `/{outlet}/guests` | Read: `auth != null`, Write: match current session |
| Rider query support | `/{outlet}/orders` | `query.equalTo == null` allowed for unassigned orders |

---

## Implementation Roadmap — ALL COMPLETED ✅

### Phase 1: Session Expiry (P0) ✅

| Step | File | Status |
|------|------|--------|
| 1.1 | `menu/js/session.js` — `lastActivityAt`, `expiresAt` on creation | ✅ |
| 1.2 | `menu/js/session.js` — `touchSession()` heartbeat | ✅ |
| 1.3 | Wire `touchSession()` into attach/request/saveCheckout | ✅ |
| 1.4 | `menu/js/app.js:107` — detect `status === 'expired'` | ✅ |
| 1.5 | `menu/js/app.js:316` — guard `btnPlaceOrder` | ✅ |
| 1.6 | `menu/index.html` — `screenSessionExpired` | ✅ |
| 1.7 | `Admin/js/features/tables.js` — `_policeExpiredSessions()` | ✅ |
| 1.8 | Admin — exclude expired from KPIs | ✅ |
| 1.9 | Admin — expired badge on table card | ✅ |
| 1.10 | Admin — `_closeExpiredSession()` | ✅ |
| 1.11 | `database.rules.json` — expired write deny | ✅ |
| 1.12 | Wire `touchSession()` to menu browsing | ✅ |

### Phase 2: Multi-Bill / Order Groups (P1) ✅

| Step | File | Status |
|------|------|--------|
| 2.1 | `menu/index.html` — `screenChooseGroup` | ✅ |
| 2.2 | `menu/js/session.js` — `currentGroupId`, `createOrderGroup()` | ✅ |
| 2.3 | `joinOrCreateSession()` — existing groups check | ✅ |
| 2.4 | `attachOrderToSession()` — groupId param | ✅ |
| 2.5 | `requestBill()` — groupId param | ✅ |
| 2.6 | Boot flow — group choice after init | ✅ |
| 2.7 | `onSessionUpdated()` — filter by group | ✅ |
| 2.8 | `menu/js/order.js` — `orderGroupId` in payload | ✅ |
| 2.9 | `menu/js/ui.js` — group-aware bill card | ✅ |
| 2.10 | Admin — per-group display in card/drawer | ✅ |
| 2.11 | Admin — per-group billing/payment | ✅ |
| 2.12 | `database.rules.json` — `orderGroups` sub-rules | ✅ |

### Phase 3: Session Timing (P2) ✅

| Step | File | Status |
|------|------|--------|
| 3.1 | `menu/js/session.js` — `ensureSession()` | ✅ |
| 3.2 | Split `initSession()` — token validation + deferred creation | ✅ |
| 3.3 | `app.js:228` — Call in `btnAddToOrder` | ✅ |
| 3.4 | `app.js:333` — safety net in `btnPlaceOrder` | ✅ |
| 3.5 | `order.js:54` — safety net in `placeOrder()` | ✅ |

### Phase 4: Guest Entity + Performance (P3) ✅

| Step | File | Status |
|------|------|--------|
| 4.1 | `menu/js/session.js` — `guestId` on session | ✅ |
| 4.2 | `menu/js/order.js` — write to `guests/` | ✅ |
| 4.3 | `menu/js/app.js:170` — search debounce | ✅ |
| 4.4 | `menu/js/app.js:129` — duplicate listener fix | ✅ |
| 4.5 | `menu/js/cart.js` — `sessionStorage` cart persistence | ✅ |
| 4.6 | `menu/js/ui.js:108` — `insertAdjacentHTML` | ✅ |

---

## Key Design Decisions

| Decision | Rationale | File:Line |
|----------|-----------|-----------|
| `_effectiveTotal(sess)` replaces raw `sess.grandTotal` | `sess.grandTotal` can be stale; `_effectiveTotal` recalculates from live `_orders` data | `tables.js:92` |
| PII in separate `tableSessionsContact` path | World-readable `tableSessions` must not contain phone numbers | `session.js:379` |
| QR orders written `Pending` → promoted to `Placed` | Prevents KDS phantoms; only attach to session on real order | `order.js:99-114` |
| `tableSessionsContact` write rule `"true"` | Session itself is world-writable; same auth boundary | `database.rules.json:272` |
| `update` instead of `set` for contact | Merge preserves all fields, avoids overwrite | `session.js:370` |
| `M._placing` before first `await` | Prevent duplicate order submissions | `app.js:540` |
| Admin copy keeps separate `shared/` dirs | Separate hosting deployments can't share modules | Admin/shared/, rider/shared/ |
| `sess.grandTotal` fallback in KPI | Edge case when `_orders` data hasn't loaded yet | `tables.js:612` |

---

## Key Edge Cases (Verified Working)

| Scenario | Behavior |
|----------|----------|
| Customer browsing, cart in memory | Show expired screen, clear cart via `touchSession()` guard |
| Order placed, session expires mid-preparation | Session expired, order continues through KDS, admin manually frees table |
| Bill requested (status=billing) | Expiry NOT enforced — skip expiry check during billing |
| Second customer scans QR after expiry | `ensureSession()` rejects expired session, resets local state |
| Two customers at same table, different groups | `screenChooseGroup` → "Start My Own Bill" creates separate group |
| Multi-bill groups remain independent | `_makePaymentForGroup()` settles per-group, `Promise.allSettled` for partial failure |
| Rider sees unassigned orders | `equalTo(null)` query works with updated security rule |
| Duplicate place-order tap | `M._placing` guard prevents second submission |
| Customer requests bill, admin notifies | `tableRequests` push with `type:'bill'` — session stays active, admin resolves via banner |
| Order status changes mid-session | `onValue` listener detects Confirmed/Preparing/Ready/Served → toast with sound + vibrate |
| `_allOrdersServed()` cache miss race | Async fallback fetches order from Firebase before checking status |

---

## File Reference Index

| File | Role |
|------|------|
| `menu/js/app.js` | Customer app: order flow, group choice, session guard, debounce, listeners, status change notifications, async `_allOrdersServed()` |
| `menu/js/order.js` | Order lifecycle: Pending→Placed promotion, guest write, error handling |
| `menu/js/session.js` | Session management: `ensureSession()`, `touchSession()`, groups, PII, request bill removed |
| `menu/js/ui.js` | UI: screen transitions, `_skipPushState`, `_bootQuery`, `insertAdjacentHTML`, `_notifySound()`, toast with type/sound/haptic |
| `menu/js/cart.js` | Cart: `sessionStorage` persistence, save/restore |
| `menu/index.html` | HTML: `screenSessionExpired`, `screenChooseGroup` |
| `Admin/js/features/tables.js` | Admin: session police, `_effectiveTotal`, per-group display, payment rollback |
| `Admin/js/features/orders.js` | Admin: dashboard query, Pending→Placed alert, toast timing |
| `rider/app.js` | Rider: `equalTo(null)` for unassigned orders |
| `database.rules.json` | Security: auth gates, expiry guards, group rules, PII segregation |
| `firebase.json` | Deploy config: 3 hosting targets, Permissions-Policy header |
| `Admin/firebase-config.js`, `menu/js/firebase.js`, sw files | Firebase config: `storageBucket` fix |
| `shared/dom/escape.js` | Shared `escapeHtml` for XSS prevention |

---

## Deployment Notes

- `firebase deploy --only database,hosting` succeeds with all 3 targets (admin, rider, menu)
- Each deployment round pushes database rules + all 3 hosting targets together
- 3 rounds of deployment completed: architecture features → critical bug fixes → medium fixes
- No known active production errors

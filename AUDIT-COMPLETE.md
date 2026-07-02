# Prasant Pizza ERP — Complete Code Audit

**Date:** 2026-07-02 | **Scope:** Every file, folder, portal, and concept | **Head commit:** `a69fbae`

---

## Table of Contents
1. [Infrastructure & Security](#1-infrastructure--security)
2. [Admin Portal](#2-admin-portal)
3. [Menu/QR Portal](#3-menuqr-portal)
4. [Rider Portal](#4-rider-portal)
5. [Shared Modules](#5-shared-modules)
6. [WhatsApp Bot Backend](#6-whatsapp-bot-backend)
7. [Cloud Functions](#7-cloud-functions)
8. [Testing & CI/CD](#8-testing--cicd)
9. [CLAUDE Pending Work](#9-claude-pending-work)
10. [Cross-Cutting Concerns](#10-cross-cutting-concerns)
11. [Summary](#11-summary)

---

## 1. Infrastructure & Security

### 1.1 Firebase Hosting (`firebase.json`)

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 1.1.1 | CSP `img-src: https://*` — wildcard defeats CSP purpose | `firebase.json:72,101,122,143,181,206,227,271` | Medium | Open |
| 1.1.2 | CSP `script-src 'unsafe-inline'` weakens XSS protection | `firebase.json:72,101` | Medium | Open |
| 1.1.3 | CSP missing `frame-ancestors 'none'` directive | `firebase.json:all` | Low | Open |
| 1.1.4 | Missing COEP/COOP/`X-Permitted-Cross-Domain-Policies` headers | `firebase.json:all` | Low | Open |
| 1.1.5 | Permissions-Policy missing from Rider hosting (present in Admin/Menu) | `firebase.json:211` | Medium | Open |
| 1.1.6 | Explicit `index.html` header entries are dead config — overridden by broader `**/*.@(js\|html\|css)` rules | `firebase.json:106-125,211-230` | Low | Open |
| 1.1.7 | Menu CSP `connect-src` missing CDN origins used in `script-src` | `firebase.json:271` | Low | Open |
| 1.1.8 | Duplicate `https://fonts.gstatic.com` in Admin `connect-src` | `firebase.json:72` | Low | Open |
| 1.1.9 | Rider JS files lack `no-cache` headers unlike Admin | `firebase.json:186` | Medium | Open |
| 1.1.10 | Node 18 runtime (EOL 2025-04-30) in Cloud Functions | `functions/package.json:6` | Medium | Open |

### 1.2 Firebase Realtime DB Security Rules (`database.rules.json`)

**Critical:**

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 1.2.1 | **World-writable `bot` node** — any authenticated rider can write to entire `bot/*` including promotions, commands, logs | `database.rules.json:56` | **Critical** | Open |
| 1.2.2 | **Riders can write customers** — any rider can modify any customer record under any outlet | `database.rules.json:177` | **Critical** | Open |
| 1.2.3 | **Riders can write discount usage** — any rider can create fake discount usage records | `database.rules.json:186` | **Critical** | Open |
| 1.2.4 | **Emergency override bypass via self-write** — riders can set `isAdmin: true` on their own profile (rule: `auth.uid == $uid`) then bypass OTP | `database.rules.json:14` | **Critical** | Open |
| 1.2.5 | **Hardcoded super-admin emails** `nexorasoftware@gmail.com` and `roshanisudha@gmail.com` in 20+ rules — compromise of either account = total DB compromise | `database.rules.json:7,14,25,31,32,45,49,50,78,84,87-88,93,97-98,103,107,111,115,135,139,143,153-154,157-158,168-169,176-177,182,185-186,189,194,206-207,212,217-218,222,224,249,253` | **Critical** | **Fixed** — Replaced with Firebase custom claims (`superAdmin`/`owner`) |

**High:**

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 1.2.6 | Case-sensitive query mismatch: `.toLowerCase()` in rule but Firebase queries are case-sensitive; stored `assignedRider` may differ | `database.rules.json:125` | High | Open |
| 1.2.7 | `data.child('assignedRider').val().toLowerCase()` throws runtime error in rule if `assignedRider` field doesn't exist, denying access instead of treating as match | `database.rules.json:128` | High | Open |
| 1.2.8 | Rider validation incomplete — `data.exists()` fallback allows deleting required `name`/`phone` fields on update | `database.rules.json:15` | High | Open |
| 1.2.9 | Unauthenticated table request creation — anyone can create unlimited spam requests | `database.rules.json:243` | High | Open |
| 1.2.10 | Order `.validate` missing type checks on `total` (could be string) and `items` (could be object not array) | `database.rules.json:130` | High | Open |
| 1.2.11 | `$outletId` wildcard matches ANY string — write rules limit sub-paths but any string like `hacker` is a valid root child | `database.rules.json:117` | Medium | Open |
| 1.2.12 | `discounts/.read: true` — coupon codes publicly exposed | `database.rules.json:181` | Medium | Open |
| 1.2.13 | Complex unauthenticated table write rule (8-line boolean) — error-prone, hard to audit | `database.rules.json:224` | Medium | Open |
| 1.2.14 | `admins.$uid.validate` requires `email` and `outlet` on every write — partial updates fail | `database.rules.json:8` | Medium | Open |
| 1.2.15 | Duplicate `riderStats` paths (global + per-outlet) — ambiguous canonical path | `database.rules.json:29-34,214-219` | Medium | Open |
| 1.2.16 | `admins_list` and `errorLogs` referenced in `shared/firebase/paths.js` but **no rule exists** — writes silently denied | `database.rules.json:missing` | **Bug** | Open |

### 1.3 `.gitignore`

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 1.3.1 | `bot/service-account.json` recently added — previously exposed | `.gitignore` | **Fixed** | Closed |
| 1.3.2 | `firebase database.json` looks like a typo — doesn't ignore `database-export.json` | `.gitignore:12` | Low | Open |
| 1.3.3 | Missing patterns for `.vscode/`, `.idea/`, `*.key`, `*.pem` | `.gitignore` | Low | Open |

### 1.4 Firebase Config Duplication

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1.4.1 | 4 copies of Firebase credentials: `Admin/firebase-config.js`, `shared/firebase-config.js`, `rider/js/firebase.js` (inline), `menu/js/firebase.js` (inline) | Medium | Open |
| 1.4.2 | `fcmServerKey: ""` empty placeholder — if filled, would expose server key to browser clients | `shared/firebase-config.js:14` | Medium | Open |
| 1.4.3 | Storage bucket mismatch: Menu uses `*.appspot.com` (deprecated), shared uses `*.firebasestorage.app` (current) | `menu/js/firebase.js:30` vs `shared/firebase-config.js:11` | High | Open |
| 1.4.4 | Rider Firebase config has TODO comment for project ID reconciliation | `rider/js/firebase.js:20` | Low | Open |

---

## 2. Admin Portal

### 2.1 Bugs & Runtime Crashes

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 2.1.1 | Orders tab race condition: `state.unacknowledgedOrders` stores Firebase keys while `_lastNewOrder` stores `orderId` — mismatch causes notification sound issues | `Admin/js/features/orders.js:84` | High | Open |
| 2.1.2 | `showAlert(order)` called with stale data — `order.orderId` is value not key, shows `#undefined` | `Admin/js/features/orders.js:74-75` | High | Open |
| 2.1.3 | Date query uses string comparison on `createdAt` — if `createdAt` is server timestamp (number), string comparison fails silently | `Admin/js/features/orders.js:132-146` | High | Open |
| 2.1.4 | All forms globally prevented from submitting — dynamic modals with forms break | `Admin/js/main.js:37-39` | Medium | Open |
| 2.1.5 | `ordersMap` and `liveOrdersMap` never cleaned up — unbounded memory leak | `Admin/js/state.js:20-21` | High | Open |
| 2.1.6 | `Outlet.ref()` uses `window.currentOutlet` which is undefined before auth — falls through to sessionStorage, then `'pizza'` default — silent data corruption | `Admin/js/firebase.js:80-84` | High | Open |
| 2.1.7 | `state.ordersLoadedKeys` Set grows unboundedly — no eviction | `Admin/js/features/orders.js:229-233` | Medium | Open |
| 2.1.8 | `state._activeListeners` referenced but never defined — access on `undefined` throws | `Admin/js/features/orders.js:410-416` | **Bug** | Open |
| 2.1.9 | Dynamic import failure is cached — rejected promise never retried | `Admin/js/main.js:18-19` | Medium | Open |
| 2.1.10 | Duplicate `btnMigrateDishAddons` click listener — double execution | `Admin/js/main.js:374,429` | Medium | Open |
| 2.1.11 | `Lucide.createIcons` called multiple times — wasteful DOM re-processing | `Admin/js/main.js:326-332,699-702` | Low | Open |
| 2.1.12 | Global path whitelist in `Outlet.ref()` includes `riders`, `bot`, `logs` — any path starting with these bypasses outlet prefix | `Admin/js/firebase.js:91-96` | High | Open |

### 2.2 Security Issues

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 2.2.1 | reCAPTCHA App Check failure silently swallowed — no visible warning to admin | `Admin/js/firebase.js:22-31` | High | Open |
| 2.2.2 | reCAPTCHA site key may not load before App Check init — `window.reCaptchaSiteKey` could be undefined | `Admin/js/firebase.js:17-31` | Medium | Open |
| 2.2.3 | `window.diagnoseDatabase` and `window.forceOutlet` debugging utilities exposed in production — aid attackers | `Admin/js/firebase.js:103-144` | High | Open |
| 2.2.4 | Hardcoded super-admin emails in client-side JS — attacker can see which emails have privilege | `Admin/js/auth.js:116-137` | Medium | Open |
| 2.2.5 | Category deletion matches dishes by string `catName` — case-sensitive, could delete wrong dishes | `Admin/js/features/catalog.js:174` | High | Open |
| 2.2.6 | `deleteImage` is a no-op — "deleted" images remain in Storage | `Admin/js/firebase.js:176-181` | Medium | Open |
| 2.2.7 | Data URL images stored in RTDB — 10MB node limit, 33% base64 overhead, bandwidth cost | `Admin/js/features/catalog.js:99-101` | High | Open |
| 2.2.8 | XSS via Tabulator formatters — phone numbers not HTML-escaped before `innerHTML` | `Admin/js/tabulator-setup.js:128` | Medium | Open |
| 2.2.9 | Auth timeout shows dashboard flash before redirect — 3-second `signOut` delay | `Admin/js/auth.js:184` | Low | Open |

### 2.3 Dead Code

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 2.3.1 | `deleteImage` is permanent no-op | `Admin/js/firebase.js:176-181` | Medium | Open |
| 2.3.2 | `secondaryAuth` / `initSecondaryAuth` never used — dead code | `Admin/js/firebase.js:183-201` | Low | Open |
| 2.3.3 | `ui` export object duplicates individually-exported functions | `Admin/js/ui.js:325-332` | Low | Open |
| 2.3.4 | Outlet switcher uses emoji instead of Lucide icons | `Admin/js/auth.js:209-211` | Low | Open |
| 2.3.5 | `.btn-text-danger`, `.chip`, `.divider-top` CSS classes never used | `Admin/style.css:7741,7749,7750` | Low | Open |
| 2.3.6 | `serverTimestamp` imported but unused in `pos.js:7` | `Admin/js/features/pos.js:7` | Low | Open |
| 2.3.7 | `viewStockHistory` is a stub — shows toast instead of actual data | `Admin/js/features/inventory.js:375-377` | Medium | Open |

### 2.4 CSS Issues

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 2.4.1 | `--sidebar-accent` CSS variable defined twice — overwritten | `Admin/style.css:58,162` | Low | Open |
| 2.4.2 | `loaderProgress` keyframe starts at 30% width but animates 10-70% — jarring jump | `Admin/style.css:7114,7128-7131` | Low | Open |
| 2.4.3 | `border-radius:99px` used instead of `999px` for badge pills — inconsistent | `Admin/style.css:7589` | Low | Open |
| 2.4.4 | Missing dark mode for Tabulator grid | `Admin/style.css:7755` | Low | Open |
| 2.4.5 | CSS custom properties reference `var(--text)` etc. without fallback values | `Admin/style.css:84-88` | Low | Open |
| 2.4.6 | 8403-line CSS — extremely large for maintenance | `Admin/style.css` | Low | Open |

### 2.5 Service Worker

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 2.5.1 | SW version `5.3.7` ≠ app version `5.2.0` — cache invalidation mismatch | `Admin/sw.js:9` vs `Admin/js/main.js:23` | Medium | Open |
| 2.5.2 | `firebase-messaging-sw.js` cached in app shell — prevents FCM SW updates | `Admin/sw.js:20` | Medium | Open |
| 2.5.3 | Network-only for app code — no offline fallback for login page | `Admin/sw.js:129-142` | Low | Open |
| 2.5.4 | No version query string on cached assets — stale shell served after deploy | `Admin/sw.js:9` | Medium | Open |
| 2.5.5 | CDN cache-first strategy never updates libraries | `Admin/sw.js:52` | Low | Open |

---

## 3. Menu/QR Portal

### 3.1 Critical Issues

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 3.1.1 | **All QR tokens enumerable**: `tables` node is world-readable — attacker can fetch every table's `token` and craft valid QR URLs for ANY table, create fraudulent sessions and fake orders | `database.rules.json:220-222` + `menu/js/session.js:43-48` | **Critical** | Open |
| 3.1.2 | **Discount label/source written as empty string**: `validateCoupon()` returns no `label`/`source` fields — `order.js` stores `discountLabel: ''`, admin sees blank discount on order | `menu/js/order.js:88-89`, `menu/js/discount.js:55-63` | **Critical** | Open |
| 3.1.3 | **Orphaned session**: transaction sets `currentSession` but subsequent `set()` could fail — table points to non-existent session, permanently dead to QR ordering | `menu/js/session.js:73-106` | High | Open |
| 3.1.4 | **Null spread crash**: `...sessSnap.val()` throws if session was deleted (admin action) | `menu/js/session.js:113` | High | Open |
| 3.1.5 | **`globalLimit` dead code**: discount usage never written to Firebase — `stats.usedCount` never incremented, so `globalLimit` never enforced | `menu/js/order.js` + `menu/js/discount.js:49` | High | Open |
| 3.1.6 | **Timestamp comparison broken**: `startsAt`/`endsAt` as ISO strings → `NaN` comparison → all discounts appear active | `menu/js/discount.js:44-45` | High | Open |
| 3.1.7 | Discount apply/unapply UX bug — must click Apply twice to enter new code | `menu/js/app.js:262-294` | Medium | Open |

### 3.2 Menu App Issues

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 3.2.1 | Duplicate `onValue({onlyOnce:true})` listeners for same order ID — multiple bill card re-renders | `menu/js/app.js:129-136` | Medium | Open |
| 3.2.2 | `renderHistoryScreen` renders twice with "Loading..." flash; errors silently swallowed | `menu/js/app.js:437-445` | Medium | Open |
| 3.2.3 | `renderPromotionsScreen` concurrent fetch race — no in-flight guard | `menu/js/app.js:448-469` | Medium | Open |
| 3.2.4 | No debounce on search input — full DOM re-render on every keystroke | `menu/js/app.js:170` | Medium | Open |
| 3.2.5 | Phone validation accepts any 10-char string, not just digits | `menu/js/app.js:323` | Medium | Open |
| 3.2.6 | `session:updated` listener registered AFTER `initSession()` returns — first update may be missed | `menu/js/app.js:45-46` | Medium | Open |
| 3.2.7 | `Cart` and `clearCart` imported but unused in `app.js` | `menu/js/app.js:8` | Low | Open |
| 3.2.8 | `Cart` imported but unused in `order.js` | `menu/js/order.js:27` | Low | Open |
| 3.2.9 | No error handling around `initializeApp`/`getDatabase` | `menu/js/firebase.js:34-35` | Low | Open |
| 3.2.10 | URL path parsing fragile under subdirectory deployment | `menu/js/firebase.js:43-44` | Low | Open |
| 3.2.11 | No timeout on `get(outletRef('tables'))` — permanent hang on network failure | `menu/js/session.js:41-48` | Low | Open |
| 3.2.12 | Inline `onerror` handlers violate CSP | `menu/js/ui.js:125,183` | Low | Open |
| 3.2.13 | Order payload missing explicit `outlet` field | `menu/js/order.js:64-92` | Low | Open |
| 3.2.14 | All rendering uses `innerHTML =` — destroys DOM state, no diffing | `menu/js/ui.js:103-195` | Low | Open |

### 3.3 Menu CSS & HTML

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 3.3.1 | `<base href="/">` prevents subdirectory deployment | `menu/index.html:4` | Low | Open |
| 3.3.2 | No service worker — no offline support | `menu/` | Low | Open |
| 3.3.3 | No App Check — `initializeAppCheck()` never called | `menu/js/firebase.js` | High | Open |
| 3.3.4 | Cart in memory only — lost on page refresh | `menu/js/cart.js:10-12` | Medium | Open |

---

## 4. Rider Portal

### 4.1 Critical Issues

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 4.1.1 | **Unassigned orders query `equalTo("")` is DENIED by database rules** — rule line 125 requires `query.equalTo == riderEmail`, `""` never matches. Riders NEVER see available pickup orders | `rider/app.js:753` + `database.rules.json:125` | **Critical** | Open |
| 4.1.2 | **OTP stored in plaintext in order data** — any rider assigned to order can read OTP, completely defeats OTP verification | `rider/app.js:319,324,527` | **Critical** | Open |
| 4.1.3 | **Emergency override gated only by `isAdmin` flag on rider profile** — riders can set `isAdmin: true` on their own profile (rules allow `auth.uid == $uid` write) | `rider/app.js:495-508` + `database.rules.json:14` | **Critical** | Open |
| 4.1.4 | **OTP attempt counter writable by rider** — can delete or reset `blockedUntil` to bypass rate limiting | `rider/app.js:364,410-414` + `database.rules.json:121` | **Critical** | Open |
| 4.1.5 | **Two conflicting version-check mechanisms** using different localStorage keys cause infinite reload loop | `rider/index.html:21-26,33-46` | **Critical** | Open |
| 4.1.6 | **SW unregister + reload race condition** — can cause broken SW state | `rider/index.html:33-46` | High | Open |

### 4.2 High Severity

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 4.2.1 | App Check without client-side reCAPTCHA — silently fails, blocks operations | `rider/js/firebase.js:31-34` | High | Open |
| 4.2.2 | Base64 image stored in RTDB — will exhaust 256MB node limit | `rider/js/auth.js:92-108` | High | Open |
| 4.2.3 | No accuracy threshold check on GPS — 500m accuracy renders distance checks meaningless | `rider/js/geo.js:44-57` | High | Open |
| 4.2.4 | No distance threshold before geo upload — ~120 writes/hour/rider even when stationary | `rider/js/geo.js:70-78` | High | Open |
| 4.2.5 | Event listener leak on inactivity timer — never removed, accumulates on each re-auth | `rider/app.js:1804-1806` | High | Open |
| 4.2.6 | Ping timer interval not cleared on listener refresh — stale state after clear | `rider/app.js:683-694` | High | Open |
| 4.2.7 | `setupPushNotifications` FCM token write may fail validation if rider node doesn't exist | `rider/app.js:150-154` + `database.rules.json:15` | High | Open |
| 4.2.8 | `auth.currentUser.uid` accessed without null check on settlement — crashes on expired token | `rider/js/settlement.js:15` | High | Open |
| 4.2.9 | `logError` can write to `logs/riderErrors/undefined/...` before profile fully initialized | `rider/app.js:95,1741` | High | Open |
| 4.2.10 | Location interval 30s too infrequent for 500m pickup radius — rider at 30km/h covers 250m in 30s | `rider/js/geo.js:43-58` | Medium | Open |
| 4.2.11 | GPS timeout 10s too short — frequent timeout errors indoors, no location updates | `rider/js/geo.js:56,66` | Medium | Open |
| 4.2.12 | Empty error handler on first GPS read — `window.riderLocation` null for first 30s | `rider/js/geo.js:65` | Medium | Open |
| 4.2.13 | OTP entered as "undefined" matches undefined OTP — `String(undefined).trim()` = `"undefined"` | `rider/app.js:396` | Medium | Open |
| 4.2.14 | `initRealtimeListeners` crashes if `currentUser.profile` undefined during 10-min refresh | `rider/app.js:793` | Medium | Open |
| 4.2.15 | Distance check uses `||` on lat=0 — outlets at equator fail (not an issue for India) | `rider/app.js:31,209,311` | Low | Open |

### 4.3 Rider UI & Events

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 4.3.1 | `showSection` with invalid `sectionId` crashes — `document.getElementById(null)` throws | `rider/js/ui.js:31-53` | Medium | Open |
| 4.3.2 | `showConfirm` uses `.onclick =` instead of `addEventListener` — overwrites previous handler | `rider/js/ui.js:85-87` | Low | Open |
| 4.3.3 | `showToast` creates new DOM element each call — no rate limit | `rider/js/ui.js:56-63` | Low | Open |
| 4.3.4 | Global slider listeners on `document` and `window` never removed | `rider/app.js:927-932` | Medium | Open |
| 4.3.5 | `onMessage` plays notification sound even in foreground — no view-state check | `rider/app.js:185-190` | Medium | Open |
| 4.3.6 | `limitToLast` imported but never used | `rider/app.js:2` | Low | Open |

---

## 5. Shared Modules

### 5.1 Bug: `shared/format/date.js` — Invalid Date Crashes

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 5.1.1 | `toIST()` doesn't validate input — `new Date(null/undefined)` creates Invalid Date, `.toISOString()` on Invalid Date throws `RangeError` | `shared/format/date.js:10-12` | **Bug** | Open |
| 5.1.2 | `getISTDateString()` calls `toIST(dateInput).toISOString()` — same crash | `shared/format/date.js:19` | **Bug** | Open |
| 5.1.3 | `formatTimeShort()` missing `isNaN` check — contrast with `formatDateShort()` which has it | `shared/format/date.js:43-51` | **Bug** | Open |

### 5.2 Security & Consistency

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 5.2.1 | Backtick escaping missing from CJS `escape.cjs` — template-literal XSS risk | `shared/dom/escape.cjs:13` vs `shared/dom/escape.js:20` | Medium | Open |
| 5.2.2 | `modal.js` — `firstEl.focus()` may throw if element hidden/disabled | `shared/dom/modal.js:88` | Low | Open |
| 5.2.3 | `GLOBAL_PATHS` includes `admins_list` and `errorLogs` — no corresponding database rules exist | `shared/firebase/paths.js:16,19` | **Bug** | Open |
| 5.2.4 | `audio/player.js` creates new `Audio` object every interval in `setInterval` — memory leak if `stopContinuousBeep` called | `shared/audio/player.js:46` | Low | Open |
| 5.2.5 | `notifications.js` uses `Date.now()` for timestamps — client clock can be manipulated | `shared/notifications.js:33-35` | Low | Open |
| 5.2.6 | `order-status.js` has duplicate weights (both "Arriving" and "Arrived" = weight 3, "picked up" and "out for delivery" = weight 4) | `shared/order-status.js:19,43` | Low | Open |

---

## 6. WhatsApp Bot Backend

### 6.1 Bugs & Crashes

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 6.1.1 | **No bounds check on `m.messages[0]`** — `m.type === 'notify'` with empty `m.messages` causes `msg` to be `undefined`, then `msg.message` throws crash | `bot/index.js:922` | **Crash** | Open |
| 6.1.2 | `isSocketDead` checks `typeof sock.ws === 'undefined'` — `null` ws (typeof 'object') NOT detected as dead | `bot/utils.js:216-221` | **Bug** | Open |
| 6.1.3 | `getProcessedStatus('global')` never exists — `!status` command always shows 0 orders | `bot/index.js:1049-1050` | **Bug** | Open |
| 6.1.4 | `user.total` never defined — `(base.totalSpent \|\| 0) + (user.total \|\| 0)` means customer `totalSpent` never updated | `bot/index.js:1550` | **Bug** | Open |
| 6.1.5 | Duplicate condition `!currentProcessedStatus?.lastOtp && !currentProcessedStatus?.lastOtp` — second clause identical to first | `bot/index.js:628` | **Bug** | Open |
| 6.1.6 | Addon flow dead — `addonTotal` calculated but addons never collected (flow skips ADDONS step) | `bot/index.js:1194` | **Bug** | Open |
| 6.1.7 | `stockDeducted: true` hardcoded BEFORE stock deduction — flag lies if deduction fails | `bot/index.js:1501` | **Bug** | Open |

### 6.2 Code Quality

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 6.2.1 | Duplicate `escapeHtml` in `bot/utils.js` — missing backtick escaping | `bot/utils.js:8-16` | Low | Open |
| 6.2.2 | Duplicate Haversine + fee slab functions — identical to `shared/geo/geo.js` | `bot/utils.js:107-124` | Medium | Open |
| 6.2.3 | Inconsistent rider field names: `order.riderId \|\| order.assignedRiderUid` vs `order.riderId \|\| order.assignedRider` | `bot/rider.js:12,73,142` vs `bot/index.js:691` | Medium | Open |
| 6.2.4 | Cache has no size eviction limit — unbounded growth over uptime | `bot/firebase.js:62-71` | Medium | Open |
| 6.2.5 | Hardcoded phone `9724649971` in 4 places — developer number exposed | `bot/index.js:17,189,294,1034` | Medium | Open |
| 6.2.6 | Revenue includes `"Confirmed"` status orders as revenue — confirmed ≠ paid | `bot/reports.js:33` | **Bug** | Open |

---

## 7. Cloud Functions

| # | Finding | File:Line | Severity | Status |
|---|---------|-----------|----------|--------|
| 7.1 | Cloud Function + Bot send DUPLICATE notifications for same event — FCM push + WhatsApp | `functions/index.js:22-77` + `bot/index.js:859-882` | High | Open |
| 7.2 | `riderId` read only — assignments via `assignedRider` or `assignedRiderUid` missed | `functions/index.js:36` | High | Open |
| 7.3 | `sendToRider()` no retry on FCM failure — expired tokens cause silent loss | `functions/index.js:131-154` | Medium | Open |
| 7.4 | Outlet list hardcoded `["pizza", "cake"]` — new outlets ignored | `functions/index.js:16` | Medium | Open |
| 7.5 | No error monitoring (Sentry, etc.) | All | Medium | Open |

---

## 8. Testing & CI/CD

| # | Finding | File | Severity | Status |
|---|---------|------|----------|--------|
| 8.1 | **Zero unit tests** — no jest/vitest/mocha for any module | Entire project | **Critical** | Open |
| 8.2 | **Zero CI/CD** — no `.github/workflows/`, no GitHub Actions | Entire project | **Critical** | Open |
| 8.3 | **Zero integration tests** — no Firebase emulator test suite | Entire project | **Critical** | Open |
| 8.4 | **Zero security rules tests** for `database.rules.json` | Entire project | **Critical** | Open |
| 8.5 | All tests hit production Firebase — no test DB or dev environment | `test-*.js` | **Critical** | Open |
| 8.6 | Tests use ad-hoc `console.log` + manual checks — no assertion library | `test-*.js` | High | Open |
| 8.7 | Tests have no CI-parsable output format (JUnit, TAP, JSON) | `test-*.js` | Medium | Open |
| 8.8 | Only Chromium tested — Firefox and WebKit untested | `test-*.js` | Medium | Open |
| 8.9 | Playwright test scripts exist but no `npm test` script in `package.json` | root `package.json` | Medium | Open |

---

## 9. CLAUDE Pending Work (DELETED)

The `CLAUDE/` directory was deleted on 2026-07-02 (commit `a69fbae`). These design references were AI-generated working files that were never applied to production. If any of these changes need to be re-implemented, they must be designed fresh against the current codebase.

| # | Item | Status |
|---|------|--------|
| 9.1 | Bottom nav unclickable fix | **DELETED** — needs fresh implementation |
| 9.2 | Promotions blank screen fix | **DELETED** — needs fresh implementation |
| 9.3 | Customer data sync feature | **DELETED** — needs fresh implementation |
| 9.4 | POS & Analytics redesign | **DELETED** — needs fresh implementation |
| 9.5 | Settings page redesign | **DELETED** — needs fresh implementation |
| 9.6 | QR Menu POS port | **DELETED** — needs fresh implementation |
| 9.7 | Promotions page redesign | **DELETED** — needs fresh implementation |
| 9.8 | QR card branding redesign | **DELETED** — needs fresh implementation |

---

## 10. Cross-Cutting Concerns

### 10.1 Notification Firehose

An order status change triggers ALL of these:
1. Cloud Function `onOrderUpdate` → FCM to rider
2. Cloud Function `onNewOrder` → FCM to all admins
3. Bot `child_changed` → WhatsApp to customer
4. Bot `child_added` → WhatsApp to customer (if new)
5. Bot `notifyAdmin` → WhatsApp to admin
6. Bot `sendFCMToAdmins` → FCM to admins (DUPLICATE with #2)

### 10.2 Payment Flow Gaps

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 10.2.1 | No payment gateway integration — all payments manual Cash/UPI | High | Open |
| 10.2.2 | `paymentStatus` not tracked on orders or sessions | High | Open |
| 10.2.3 | Admin has no way to know if Rider collected COD | High | Open |
| 10.2.4 | Rider has no way to sync payment to Admin | High | Open |
| 10.2.5 | No settlement reconciliation — Admin and Rider payment data can diverge | High | Open |
| 10.2.6 | No payment audit trail — no separate payment transaction log | High | Open |

### 10.3 Cross-Portal Data Flow Gaps

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 10.3.1 | No "Acknowledged" status — customer can't see restaurant saw their order | Medium | Open |
| 10.3.2 | Admin can't push status updates back to Menu customer (no FCM for unauthenticated users) | Medium | Open |
| 10.3.3 | Rider updates don't sync to Menu tracking screen | Medium | Open |
| 10.3.4 | Table requests don't push notification to Menu customer | Low | Open |
| 10.3.5 | Session data doesn't sync to Rider — rider can't see which table placed Dine-in order | Low | Open |
| 10.3.6 | QR orders have `discount: 0` hardcoded — discount evaluation never called | Medium | Open |

### 10.4 Version & Library Consistency

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 10.4.1 | Firebase SDK 10.7.1 consistent across all portals | ✅ | Good |
| 10.4.2 | Lucide 0.344.0 consistent across Admin/Rider | ✅ | Good |
| 10.4.3 | Menu has no version constant | Low | Open |
| 10.4.4 | Menu has no App Check — security gap | High | Open |
| 10.4.5 | Rider loads TWO font families (Inter + Outfit) — unnecessary | Low | Open |

### 10.5 Debug Logs in Production

| # | Portal | Count | Severity | Status |
|---|--------|-------|----------|--------|
| 10.5.1 | Admin feature modules | ~50 `console.log` statements | Medium | Open |
| 10.5.2 | Rider | ~10 `console.log` statements | Low | Open |
| 10.5.3 | Shared | ~5 `console.log` statements | Low | Open |

### 10.6 Bot SDK Bypasses All Database Rules

The bot uses `firebase-admin` with service account, completely bypassing `database.rules.json`. Every bot write succeeds regardless of rules. If the service account is leaked (not gitignored until this session), entire database is compromised.

---

## 11. Summary

### By Severity

| Section | Critical | High | Medium | Low | Total |
|---------|----------|------|--------|-----|-------|
| 1. Infrastructure & Security | 4 | 4 | 10 | 5 | 23 |
| 2. Admin Portal | 0 | 12 | 15 | 18 | 45 |
| 3. Menu/QR Portal | 3 | 4 | 9 | 8 | 24 |
| 4. Rider Portal | 5 | 10 | 12 | 6 | 33 |
| 5. Shared Modules | 0 | 0 | 2 | 4 | 6 |
| 6. Bot Backend | 1 | 3 | 3 | 2 | 9 |
| 7. Cloud Functions | 0 | 2 | 2 | 0 | 4 |
| 8. Testing & CI/CD | 5 | 1 | 2 | 0 | 8 |
| 9. CLAUDE Pending (DELETED) | 0 | 0 | 0 | 0 | 0 |
| 10. Cross-Cutting | 0 | 5 | 3 | 2 | 10 |
| **Total** | **18** | **41** | **58** | **45** | **162** |

### Priority Actions

| Priority | Action | Section |
|----------|--------|---------|
| **P0** | Restrict `bot/.write` rule — riders should NOT write to bot node | 1.2.1 |
| **P0** | Fix unassigned orders query — riders can't see available pickups | 4.1.1 |
| **P0** | Hash OTP client-side — don't store plaintext in order data | 4.1.2 |
| **P0** | Fix emergency override — server-verify admin flag from DB | 4.1.3 |
| **P0** | Fix OTP attempt counter — riders can bypass rate limiting | 4.1.4 |
| **P0** | Fix version-check infinite reload loop in Rider | 4.1.5 |
| **P1** | Fix `tables/node` world-readability — QR tokens exposed | 3.1.1 |
| **P1** | Apply bottom-nav and promotions bug fixes from CLAUDE | 9.1, 9.2 |
| **P1** | Add CI/CD pipeline with automated testing | 8.1-8.5 |
| **P1** | Add App Check to Menu portal | 3.3.3 |
| **P1** | Consolidate 4 Firebase configs into shared single source | 1.4.1 |
| **P1** | Fix discount label/source empty string bug | 3.1.2 |
| **P1** | Fix `m.messages[0]` crash in bot | 6.1.1 |
| **P1** | Reconcile storage bucket URLs (`appspot.com` vs `firebasestorage.app`) | 1.4.3 |

# Pizza ERP — Comprehensive Audit Report

**Generated:** 2026-07-02
**Scope:** Admin (`roshani-sudha-admin.web.app`), Menu/QR (`roshani-sudha-menu.web.app`), Rider (`roshani-sudha-rider`), WhatsApp Bot Backend, Firebase Infrastructure
**Head Commit:** `aefb45c` — fix: add .discount-applied CSS rule, add root redirect to menu
**Platform:** Firebase Realtime Database, Firebase Hosting (3 targets), Firebase Cloud Functions, Firebase App Check (reCAPTCHA v3)

---

## 1. Infrastructure & Security

### 1.1 Firebase Hosting & Project Configuration

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 1.1.1 | `service-account.json` present in repository root — grants full Firebase Admin SDK access. While `.gitignore` lists it, the file exists on disk and was potentially committed at some point. | `service-account.json` (root) | **Critical** | Open | Remove immediately from working tree. Revoke key in Firebase Console, generate new one, store only in secret manager. Verify with `git log --all --diff-filter=A -- 'service-account.json'` if it ever existed in history. |
| 1.1.2 | CSP `img-src` includes `https://*` allowing images from any HTTPS origin. Weakens XSS protection. | `firebase.json:72,101,122,143` (Admin) | Medium | Open | Enumerate required image CDNs (lh3.googleusercontent.com, firebasestorage.googleapis.com) instead of wildcard. |
| 1.1.3 | CSP `connect-src` includes `https://*` across multiple hosting targets (Admin, Menu, Rider). Extremely broad. | `firebase.json:72,101,122,143,181,206,227,271` | Medium | Open | Audit each `https://*` origin; replace with specific Firebase endpoints and API hosts. |
| 1.1.4 | Rider Hosting target `index.html` headers missing `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Admin and Menu targets set these. | `firebase.json:211` | Medium | Open | Add these security headers to Rider hosting for consistency with Admin/Menu. |
| 1.1.5 | `fcmServerKey` is empty string `""` in both `Admin/firebase-config.js` and `shared/firebase-config.js`. FCM server-side notifications will not work. | `Admin/firebase-config.js:8`, `shared/firebase-config.js:14` | Medium | Open | Configure the Firebase Cloud Messaging server key, or remove the field if server-side FCM is not used. |
| 1.1.6 | Cloud Functions runtime pinned to `node:18` — end-of-life since 2025-04-30, no longer receives security patches. | `functions/package.json:6` | Medium | Open | Update to Node 20 or 22 in `package.json` engines, and update `firebase-admin`/`firebase-functions` SDKs. |
| 1.1.7 | `storageBucket` discrepancy: Menu firebase uses `prashant-pizza-e86e4.appspot.com` while Admin/shared use `prashant-pizza-e86e4.firebasestorage.app` — potential upload failures. | `menu/js/firebase.js:30`, `shared/firebase-config.js:11` | Medium | Open | Reconcile to a single consistent bucket value across all apps. |
| 1.1.8 | Rider Firebase config has TODO comment: `// TODO: reconcile project IDs or use env-based config` — potential project ID mismatch risk. | `rider/js/firebase.js:20` | Low | Open | Resolve the hardcoded project ID mismatch; consolidate via `shared/firebase-config.js`. |
| 1.1.9 | `.gitignore` does not cover IDE directories (`.vscode/`, `.idea/`), swap files (`*.swp`), or `.env` properly. | `.gitignore` | Low | Open | Add patterns for `.vscode/`, `.idea/`, `*.swp`, `*.bak`. |
| 1.1.10 | `shared/` package.json imports structure but some files may be unused (`firebase/paths.js`, `dom/modal.js`, `dom/table-filter.js`). No dead-code checker. | `shared/package.json` | Low | Open | Audit `shared/` for dead files, add import checker script. |

### 1.2 Firebase Realtime Database Security Rules

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 1.2.1 | Per-outlet `orders.$orderId.read` allows unauthenticated access for ANY QR-source order: `\|\| data.child('source').val() == 'QR'` — no table/session token check. An attacker can read ALL QR orders across all outlets. | `database.rules.json:128` | **High** | Open | Tighten to also require session token validation, or limit to top-level `$orderId` with token check. |
| 1.2.2 | Per-outlet `discounts` is world-readable (`.read: true`). Discount codes (including coupon codes) can be enumerated by anyone. | `database.rules.json:181` | Medium | Open | If coupons must remain secret, move to authenticated-only read. If this is by design for Menu app, document explicitly. |
| 1.2.3 | Per-outlet `tables` is world-readable (`.read: true`). Anyone can read table tokens, statuses, current sessions. | `database.rules.json:220-221` | Medium | Open | Table tokens are meant to be secret (per Decision #6), but are exposed via `.read: true`. Consider limiting read to authenticated roles, or at minimum excluding the `token` field via rules. |
| 1.2.4 | Per-outlet `tableSessions` is world-readable (`.read: true`). Session data (running totals, order IDs, guest counts) exposed publicly. | `database.rules.json:228-229` | Medium | Open | Restrict read to authenticated admins/riders; Menu app can use token-based per-session reads. |
| 1.2.5 | Global `sizes`, `addons`, `categories`, `dishes` are all world-readable (`.read: true`). Also duplicated per-outlet (lines 133-151). | `database.rules.json:101-116,133-151` | Low | Open | This is intentional for Menu app access, but the duplication (global + per-outlet) creates drift risk. Consolidate to a single canonical path. |
| 1.2.6 | `dineinSettings` is world-readable (`.read: true`). Tax rates, service charge rates, QR base URLs exposed publicly. | `database.rules.json:251-252` | Low | Open | Acceptable for Menu app to read tax rates for display. Document as intentional. |
| 1.2.7 | `uiConfig` is world-readable (`.read: true`). | `database.rules.json:210-211` | Low | Open | Acceptable — UI config is meant to be public. |
| 1.2.8 | Per-outlet `orders` `.write` rule allows unauthenticated CREATE for QR-source orders: `\|\| (!data.exists() && newData.child('source').val() == 'QR')`. Correctly prevents overwriting existing orders. | `database.rules.json:129` | Low | Open (by design) | This is the intended mechanism for Menu app order creation. Ensure the `validate` rule at line 130 (requiring `items`, `total`, `status`, `createdAt`) is sufficient to prevent abuse. |
| 1.2.9 | Table write rule (line 224) is extremely complex — 8-line boolean expression combining admin auth, token-based updates, and session state transitions. Error-prone and hard to audit. | `database.rules.json:224` | Medium | Open | Refactor into Firebase Security Rule functions (available in `rules_version = '2'`) for readability and testability. |
| 1.2.10 | `admins.$uid.validate` rule (line 8) requires `email` and `outlet` children on every write — even updates. An admin editing only their name would fail validation. | `database.rules.json:8` | Medium | Open | Add condition: `newData.hasChildren(['email', 'outlet']) \|\| data.exists()` to allow partial updates. |
| 1.2.11 | Global `riderStats` (lines 29-34) and per-outlet `riderStats` (lines 214-219) both exist with identical structure — ambiguous canonical path. Rider app writes to global path, not per-outlet. | `database.rules.json:29-34,214-219` | Medium | Open | Remove per-outlet `riderStats` (lines 214-219) if unused, or consolidate to single path. |

---

## 2. Admin Portal

### 2.1 Authentication & Authorization

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 2.1.1 | App Check failure silently swallowed. `initializeAppCheck()` try/catch only logs a warning. If reCAPTCHA v3 fails (wrong site key, HTTP, etc.), database is unprotected. | `Admin/js/firebase.js:22-31` | **High** | Open | Add visible toast notification or dashboard banner when App Check fails. Consider showing a degraded-mode warning and blocking DB operations. |
| 2.1.2 | Secondary Auth app initialized unconditionally on every page load, even when reauthentication is never needed. Creates a second Firebase app instance (`"secondary_auth"`) eagerly. | `Admin/js/firebase.js:185-200` | Low | Open | Lazily initialize secondary auth only when `requireAdminReauth()` is actually called. |
| 2.1.3 | Admin session timeout hardcoded to 30 min, no user-configurable option. | `Admin/js/auth.js:12` | Low | Open | Consider making timeout configurable via Settings UI or environment variable. |

### 2.2 Tables Module (`tables.js`)

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 2.2.1 | KOT and Session Bill printing uses `window.open()` which can be blocked by browsers. No fallback if popup is blocked. | `tables.js:748,979` | Medium | Open | Add popup-blocker detection (check if `w` is null) — line 980 does this for single QR print but not for KOT (line 748) or bill print. Add to all print functions. |
| 2.2.2 | Bulk QR print generates all QR codes sequentially in a `for...of` loop. For 30+ tables, this is slow and has no progress indicator. | `tables.js:1000-1017` | Medium | Open | Add batch parallelization (limit 3-4 concurrent) and a progress indicator (e.g., "Generating QR 5/30"). |
| 2.2.3 | `_openTableDrawerByOrder` looks up `o.tableId` — but Menu app's `order.js` writes `id: tableId` not `tableId` as the field name. Potential field name mismatch means the "Open in Orders tab" link might not work for QR orders whose order doc stores the table link differently. | `tables.js:602-604` | Medium | Open | Verify the field name used by Menu's order creation. The order doc's `table` field is set to `tableNumber` (string), not the table database ID. |
| 2.2.4 | `_syncCustomersFromOrders` iterates over ALL `_orders` on every listener change to find Dine-in QR orders for customer sync — O(n) scan. | `tables.js:107-116` | Low | Open | Maintain a separate ordered list of QR order IDs to avoid full iteration on every change event. |
| 2.2.5 | Secure token generation uses `window.crypto.getRandomValues` with fallback to `window.msCrypto` (IE11). Acceptable but uses only 12 bytes for a 16-char base36 string. | `tables.js:66-70` | Low | Open | Consider using 16+ bytes for stronger tokens, though current 96 bits is sufficient. |

### 2.3 Catalog Module (`catalog.js`)

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 2.3.1 | `runImageMigration` function converts Storage URLs to DataURIs by downloading and re-uploading as `"temp"` — creates orphaned blobs in Firebase Storage with generic names. | `catalog.js:731-788` | Medium | Open | Use proper upload paths with dish/category IDs instead of `"temp"`. Better yet, skip the migration — Storage URLs are functionally equivalent. |
| 2.3.2 | `runImageMigration` has only a single confirmation dialog and runs without admin reauthentication. If accidentally triggered, it rewrites ALL dish/category images. | `catalog.js:731-733` | Medium | Open | Wrap destructive migrations in `requireAdminReauth()` and add a second confirmation that requires typing "CONFIRM". |
| 2.3.3 | Fallback images use `placehold.co` — external service dependency. If placehold.co is down, UI shows broken images. | `catalog.js:53,241` | Low | Open | Host a local placeholder SVG or use a data URI fallback instead. |
| 2.3.4 | Button text includes `🚀` emoji (`addCategory` line 140) — inconsistent with codebase convention of using Lucide icons elsewhere. | `catalog.js:140` | Low | Open | Replace with consistent Lucide icon usage. |
| 2.3.5 | `addCategory` validates duplicate name via client-side `state.categories` array but doesn't re-check against Firebase before write — possible race condition if two admins add simultaneously. | `catalog.js:82-85` | Low | Open | Consider using `runTransaction` or checking via a Cloud Function for uniqueness enforcement. |

### 2.4 Discounts Module (`discounts.js`)

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 2.4.1 | Discount document ID uses `disc_${Date.now().toString(36)}` — timestamp-based, predictable. Anyone who can observe the pattern can enumerate discount IDs. | `discounts.js:266` | Low | Open | Use a random ID or push-generated key instead of timestamp-based IDs. |
| 2.4.2 | Toggle changes fire immediately on checkbox change — no debounce. Rapid clicking could trigger multiple Firebase writes. | `discounts.js:298-304` | Low | Open | Add debounce (300ms) on the toggle change handler to prevent rapid-fire writes. |

### 2.5 Inventory Module (`inventory.js`)

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 2.5.1 | `viewStockHistory` is a stub — displays toast instead of actual stock history from `inventory-log` node. | `inventory.js:375-377` | Medium | Open | Implement the actual history viewer reading from the `inventory-log` path. |
| 2.5.2 | `autoDeductStock` reads ALL inventory items to find matching dish — full scan on every order. No index on `dishId`. | `inventory.js:259-281` | Medium | Open | Add an index on `dishId` field in the inventory node, or maintain a separate `dishId → inventoryId` lookup map. |
| 2.5.3 | Line 270: `update(Outlet.ref(...))` is called without `await` (fire-and-forget) when auto-linking dishId. If this write fails, the link is silently lost. | `inventory.js:270` | Low | Open | Await the update or add `.catch()` logging. |
| 2.5.4 | Toggle persistence uses `localStorage` as fallback with 500ms debounce — if user clears localStorage, toggles reset to defaults. | `inventory.js:428-451,453-458` | Low | Open | Acceptable behavior; document that toggles are per-device. |

### 2.6 Promotions Module (`promotions.js`)

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 2.6.1 | Event listener leak: `window.addEventListener('botStatusChange', ...)` is called on every `loadPromotions()` but `cleanupPromotions()` only removes the last handler via `window._botStatusEventHandler`. If `loadPromotions()` is called multiple times (e.g., tab switching), multiple listeners accumulate. | `promotions.js:299-303,319-321` | Medium | Open | Use a named function (not a variable reference) for both add/remove, or use an AbortController. |
| 2.6.2 | Campaign launch writes to both `promotions/campaigns/${id}` AND `bot/commands/` — dual-write pattern. If the command write succeeds but campaign write fails, the bot has a command referencing a non-existent campaign. | `promotions.js:539-556` | Medium | Open | Use a transaction or single-source-of-truth design. Consider having the bot read from `campaigns/` directly instead of using a separate commands queue. |
| 2.6.3 | Character counter shows `1500` as hard limit. WhatsApp Business API has a 1024-character limit for most message templates. | `promotions.js:747` | Low | Open | Reduce hard limit to 1024 characters for WhatsApp compatibility. |
| 2.6.4 | XLSX download function checks `window.XLSX` at call time but the library is loaded asynchronously via CDN. If it hasn't loaded, the function falls back to CSV. | `promotions.js:906-909` | Low | Open | Either load XLSX library eagerly in the SW cache list, or handle the async import properly. |
| 2.6.5 | Media URL cloning in `_cloneCampaign` doesn't verify Firebase Storage signed URLs haven't expired. | `promotions.js:674-693` | Low | Open | If URLs are short-lived signed URLs, re-upload the media instead of copying the URL. |

### 2.7 Analytics Module (`analytics.js`)

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 2.7.1 | Date-based query uses string comparison (`>= from` and `<= to` on date strings) after already applying Firebase `startAt`/`endAt`. The client-side filter is redundant but harmless. | `analytics.js:218` | Low | Open | Remove the redundant client-side date filter to simplify code. |
| 2.7.2 | Comparison mode performs a SECOND query to Firebase for the previous period — double the read cost for report generation. | `analytics.js:237-261` | Low | Open | Cache previous period data in memory or localStorage to avoid re-fetching on every filter change. |

### 2.8 POS Module (`pos.js`)

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 2.8.1 | `import { serverTimestamp }` imported (line 7) but never used in the module file. Dead import. | `pos.js:7` | Low | Open | Remove unused import. |

### 2.9 CSS & UI

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 2.9.1 | `--sidebar-accent` CSS variable defined twice — at line 58 (`#sidebar-bg block`) and at line 162 (root-level). The latter overwrites the former. | `Admin/style.css:58,162` | Low | Open | Remove the duplicate at line 162 (redundant `:root` block). |
| 2.9.2 | CSS file is 8403 lines long — extremely large for maintenance. Many utility classes defined that may be unused. | `Admin/style.css` | Low | Open | Consider splitting into modules (layout, components, utilities) and purging unused classes. |

---

## 3. Menu / QR Portal

### 3.1 Architecture & Security

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 3.1.1 | Menu app operates without Firebase Auth — all access control relies on DB Security Rules. This is an intentional design choice, but means any Security Rule misconfiguration exposes data globally. | `menu/js/firebase.js:1-50` | **High** | Open (by design) | Document this dependency explicitly. Add automated rule tests. Consider monitoring alerts for rule changes that weaken protections. |
| 3.1.2 | Cart stored entirely in memory — lost on page refresh. UX issue where accidental refresh discards all unsaved items. | `menu/js/cart.js:10-12` | Medium | Open | Add `sessionStorage` persistence for the cart so it survives accidental refreshes. |

### 3.2 Discount & Order Flow

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 3.2.1 | Discount code cache TTL is 60 seconds — admin-disabled codes remain usable for up to 60s, newly created codes take 60s to appear. | `menu/js/discount.js:9-11` | Medium | Open | Reduce TTL to 15-30s, or add a real-time `onValue` listener that invalidates cache on discount changes. |
| 3.2.2 | Boot failure shows `screenInvalid` with no retry mechanism — user must manually refresh. | `menu/js/app.js:481-485` | Low | Open | Add a "Retry" button on `screenInvalid` that re-invokes `boot()`. |

---

## 4. Rider Portal

### 4.1 Critical / High Issues

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 4.1.1 | `emergencyOverride()` checks admin flag from client-side `currentUser.profile.isAdmin` only, not from Firebase DB. Stale/tampered client object could allow unauthorized OTP bypass. | `rider/app.js:495-508` | **High** | Open | Re-verify admin flag from DB (`riders/${uid}`) at time of override. Add Cloud Function webhook to log all emergency overrides. |
| 4.1.2 | `regenerateOTP()` writes new OTP directly to Firebase with no server-side authorization check that the requesting rider is actually assigned to this order. Compromised rider could regenerate OTPs for any order. | `rider/app.js:510-537` | **High** | Open | Add Cloud Function trigger for OTP regeneration that validates rider assignment before writing. |
| 4.1.3 | All Firebase listeners cleared and re-initialized every 10 minutes. During the brief window between `clearAllListeners()` and `initRealtimeListeners()`, orders can be missed and the UI flickers to skeleton state. | `rider/app.js:1581-1585` | Medium | Open | Use delta-based refresh instead of full teardown/rebuild. If full refresh is necessary, add debounce and loading guard. |

### 4.2 Location & Geo

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 4.2.1 | GPS coordinates sent to Firebase every 30 seconds with no distance threshold. High write cost for Firebase. | `rider/js/geo.js:58` | Low | Open | Implement minimum-distance threshold (e.g., 50 meters) before writing new location. |
| 4.2.2 | Hardcoded outlet coordinates as fallback (DEFAULT_COORDS). If Firebase load fails, stale coordinates used silently. | `rider/js/geo.js:8-11` | Medium | Open | Add validation warning when loaded vs hardcoded coordinates differ significantly. Consider requiring valid Firebase data or showing error. |
| 4.2.3 | `loadOutletCoords()` catches all errors silently and falls back to defaults with only a console.warn. No user-facing feedback. | `rider/js/geo.js:34-36` | Low | Open | Show a non-blocking warning when fallback coordinates are used. |

### 4.3 UI & Settlement

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 4.3.1 | `showToast` creates new DOM element on each call with `white-space: nowrap` — long messages will overflow on mobile. | `rider/js/ui.js:56-63` | Low | Open | Cache the toast element and reuse, or remove `nowrap` and allow wrapping. |
| 4.3.2 | `settlement.js` accesses `auth.currentUser.uid` at line 15 without null check — if `auth.currentUser` is null, this throws and shows error state, but the root cause (unauthenticated user viewing settlements) is not surfaced. | `rider/js/settlement.js:15` | Low | Open | Add null check with descriptive error message if user is not authenticated. |

---

## 5. Cross-Cutting Concerns

### 5.1 Service Worker & Caching

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 5.1.1 | Admin SW returns 408 error when offline for non-CDN assets. Explicitly by design ("cannot function without backend"), but login page (cached at install) is unreadable offline. | `Admin/sw.js:129-142` | Low | Open (by design) | Cache the shell (login page, CSS, branding) with cache-first strategy so login renders offline. |
| 5.1.2 | Menu and Rider portals have no service worker — no offline fallback at all. | Menu/Rider | Low | Open | Consider adding basic offline service worker for Menu app (at least show cached menu data). |

### 5.2 Testing & CI

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 5.2.1 | Three Playwright test scripts exist (`test-admin.js`, `test-menu.js`, `test-full-audit.js`) but no CI pipeline, no `package.json` `"test"` script, and no `.github/workflows/`. Tests must be run manually. | Root directory | Medium | Open | Create GitHub Actions workflow to run Playwright tests on push. Configure to fail build on CRITICAL/HIGH severity. |
| 5.2.2 | No unit tests exist for any JavaScript module. No jest/vitest/mocha configuration. | Entire project | Medium | Open | Add unit testing framework and write tests for shared modules (order-status.js, discount-evaluator.js) and critical Admin/rider logic. |

### 5.3 Cloud Functions

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 5.3.1 | `sendToRider()` logs FCM message ID but does not retry on failure. Expired rider tokens cause silent notification loss. | `functions/index.js:131-154` | Medium | Open | Add 2-3 retries with exponential backoff. Track delivery statistics, surface undelivered in Admin dashboard. |
| 5.3.2 | Functions `package.json` has `"private": true` but no `"test"` script. No emulator test suite. | `functions/package.json` | Low | Open | Add Firebase Emulator test suite for the FCM trigger function. |

### 5.4 WhatsApp Bot Backend (Not Fully Audited)

| # | Finding | File:Line | Severity | Status | Recommendation |
|---|---------|-----------|----------|--------|----------------|
| 5.4.1 | Bot directory (`bot/`, `Cake-bot/`) code was out of scope for this audit. These backends interact with the same Firebase RTDB and can write to `bot/*`, `orders/*`, `customers/*` paths. | `bot/`, `Cake-bot/` | **High** | Open (out of scope) | Schedule a dedicated audit of bot codebases focusing on: Firebase credentials, input sanitization, rate limiting, error handling, reconnection logic. |

---

## 6. Fixed / Already Addressed Issues

| # | Issue | Commit | Detail |
|---|-------|--------|--------|
| 6.1 | 3 critical database rules vulnerabilities fixed | `a6b61ec` | Recent security fix addressing critical RTDB rule gaps. |
| 6.2 | Admin/shared/ and rider/shared/ deleted (32 files) | `bc14bb6` (confirmed in HEAD diff) | Duplicate per-app shared copies removed to eliminate drift. Root `shared/` is now canonical. |
| 6.3 | Discount read access opened for Menu app | `369b6d6` | Menu discount validation now has read access. |
| 6.4 | Base href added to Menu for correct CSS/JS resolution | `1729a1b` | Fixed path resolution for menu assets. |
| 6.5 | Tables parent write rule relaxed for Menu billing status | `fcbd4d3` | Menu app can set billing status on sessions. |
| 6.6 | `.discount-applied` CSS rule added | `aefb45c` | CSS fix for discount application visual state. |
| 6.7 | Root index.html redirect to /menu/ | `aefb45c` | Root domain now redirects to Menu portal. |

---

## Summary

| Section | Critical | High | Medium | Low | Total |
|---------|----------|------|--------|-----|-------|
| 1. Infrastructure & Security | 1 | 1 | 7 | 3 | 12 |
| 2. Admin Portal | 0 | 1 | 8 | 8 | 17 |
| 3. Menu / QR Portal | 0 | 1 | 2 | 1 | 4 |
| 4. Rider Portal | 0 | 2 | 2 | 4 | 8 |
| 5. Cross-Cutting | 0 | 1 | 4 | 2 | 7 |
| 6. Fixed Issues | — | — | — | — | 7 |
| **Total** | **1** | **6** | **23** | **18** | **55** |

> Note: Items marked "Open (by design)" are acknowledged architectural decisions but are noted for their risk profile.

### Top 7 Immediate Actions

1. **Remove `service-account.json`** from repository and rotate the key (Critical — §1.1.1)
2. **Tighten `orders.$orderId.read` QR bypass** to prevent unauthenticated access to all QR orders (High — §1.2.1)
3. **Add server-side validation for rider OTP regeneration** (High — §4.1.2)
4. **Server-side verify emergency override admin flag** from DB, not client cache (High — §4.1.1)
5. **Fix App Check failure visibility** — show banner when reCAPTCHA v3 is not active (High — §2.1.1)
6. **Fix botStatusChange event listener leak** in promotions module (Medium — §2.6.1)
7. **Add CI pipeline** with Playwright audit tests (Medium — §5.2.1)

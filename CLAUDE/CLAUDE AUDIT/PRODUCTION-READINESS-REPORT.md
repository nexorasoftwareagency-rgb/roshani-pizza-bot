# Roshani Pizza Bot ERP — Full System Production Readiness Report

**Audit date:** June 22, 2026
**Source:** Fresh GitHub clone, `main` @ `ad5db50` ("Fix settings/Store read rule...")
**Scope:** Admin portal (19 tabs), QR Menu app (`menu/`), Rider PWA (`rider/`), Cloud Functions (`functions/`), Firebase Security Rules — every connectivity path, every Settings field, Discounts, Promotions, and their real-world application points.

---

## Executive Summary

| Severity | Count | Status |
|---|---|---|
| 🔴 Critical | 1 | **Fixed** — patched rules file provided |
| 🟠 High | 1 | **Fixed** — patched rules file provided |
| 🟡 Medium | 2 | Documented — needs a product decision, not a code bug |
| 🟢 Low / Observational | 3 | Documented for awareness |

**Bottom line:** The system is **production-ready after applying the two rule fixes below**. Everything else is either already solid, or a feature gap (not a defect) that's worth a deliberate decision rather than a silent patch.

The two critical/high issues were both introduced very recently — one in the commit right before this audit, one has likely existed since the Tables feature shipped but only triggers on a specific customer action sequence. Neither has caused damage by being found now instead of in production, but both should be patched before the next deploy.

---

## 🔴 CRITICAL — Security Regression: WiFi Password & Tax IDs Now Public

**File:** `database.rules.json` → `$outletId/settings/Store`
**Introduced in:** commit `ad5db50` (the very latest commit, same day as this audit)
**Found by:** Cross-referencing the rule against everything actually saved under `settings/Store`

### What happened

The latest commit added `.read: "true"` directly on the **parent** `Store` node:

```json
"Store": {
  ".read": "true",          // ← this line
  "storeName": { ".read": "true" },
  "customerMenuBgImage": { ".read": "true" },
  "instagram": { ".read": "true" },
  "facebook": { ".read": "true" },
  "googleReviewLink": { ".read": "true" },
  "whatsappNumber": { ".read": "true" }
}
```

In Firebase Realtime Database rules, a `.read: true` on a parent node **cascades to the entire subtree**, regardless of any child-level rules. The 6 explicit per-field overrides underneath become redundant — and everything else under `Store` becomes public too, including:

- **`wifiPass`** — the restaurant's WiFi password, now readable by anyone with no authentication, via a single REST call
- **`gstin`** — GST registration number
- **`fssai`** — food safety license number
- **`paymentQR`** — the UPI/payment QR data
- `wifiName`, `address`, `entityName`, `tagline`, `lat`/`lng`, etc.

**Confirmed:** no public-facing app (`menu/`, `rider/`) ever actually reads `wifiPass` or any of the sensitive fields — this exposure serves zero functional purpose. It's a pure accidental over-grant, almost certainly because the original intent ("make storeName and the background image public") was implemented at the wrong level.

### Fix

Remove the parent-level `.read`, keep only the 6 intended per-field overrides (which already existed and already cover everything any public app needs):

```json
"Store": {
  "storeName": { ".read": "true" },
  "customerMenuBgImage": { ".read": "true" },
  "instagram": { ".read": "true" },
  "facebook": { ".read": "true" },
  "googleReviewLink": { ".read": "true" },
  "whatsappNumber": { ".read": "true" }
}
```

This is included in the attached `database.rules.FIXED.json`. **Deploy this before anything else** — `firebase deploy --only database`.

---

## 🟠 HIGH — Billing Desync: Items Ordered After "Request Bill" Get Cooked But Never Charged

**Files:** `database.rules.json` → `tableSessions/$sessionId`, plus `menu/js/session.js` (`attachOrderToSession`)
**Trigger:** A dine-in guest taps "Request Bill," then orders something else before the table is actually closed.

### What happens, step by step

1. Guest finishes eating, taps **Request Bill**. `session.status` flips to `'billing'`.
2. Guest (or another guest at the same table) goes back to the menu and places one more order — dessert, another drink, whatever.
3. `order.js` writes the new order to `/orders` — this succeeds (that rule already allows it during `'billing'`).
4. `attachOrderToSession()` then runs a transaction to fold the new order's total into the session's `runningTotal`/`tax`/`grandTotal`. This transaction targets the **whole session node**, and the rule guarding that node currently requires `status == 'active'`. Since status is now `'billing'`, **this write is rejected.**
5. The customer sees a generic *"Could not place order. Please try again"* toast — even though the order **was** placed. If they retry, they risk creating a duplicate.
6. The kitchen still sees the order (KDS reads `/orders` directly, not session-scoped) and cooks it.
7. The Admin's Tables drawer computes the bill from `session.orders[]` only — which never got this order added. **The amount shown to the customer at checkout is short by the price of whatever they ordered after requesting the bill.**

This is a real revenue-leak path, not a cosmetic bug, and it's triggered by a perfectly normal guest behavior ("oh, can we also get a dessert" after asking for the check).

### Fix

The `orders` sub-path under a session already uses a more lenient condition (`!= 'closed'` instead of `== 'active'`) for exactly this reason — it just wasn't applied to the parent node that `attachOrderToSession`'s transaction actually targets. Aligning the two:

```json
"$sessionId": {
  ".write": "auth != null || (!data.exists() || data.child('status').val() != 'closed')"
}
```

This keeps the transaction's atomicity (no race condition between two guests ordering at once) while allowing it to succeed any time before the session is truly closed — matching what the `orders` child rule already intended. Included in the attached fixed rules file.

---

## 🟡 MEDIUM — QR Dine-In Orders Get Zero Discount Treatment

**Files:** `Admin/js/features/discount-evaluator.js` (the shared logic), `menu/js/order.js` (where it's absent)

The Discounts engine (`evaluateDiscount()`) is genuinely well-built: first-order discounts, coupon codes, global percent/flat discounts, category-specific discounts, priority-ranked, with max-caps and a feature kill-switch. Its own docstring says it's *"used by both Admin (POS preview) and Bot (order placement)"* — and checking the code confirms exactly that: `pos.js` calls it, the WhatsApp ordering bot calls it.

**`menu/js/order.js` never calls it at all.** The QR dine-in session record even has a `discount: 0` field sitting in its schema — a placeholder that's never computed or filled in.

**Net effect:** if you run a "20% off first order" or a coupon campaign, a customer ordering via WhatsApp or at the counter (POS) gets it automatically. A customer scanning the table QR code and ordering through the dine-in menu does **not**, with no error or indication — they simply pay full price.

This isn't a code defect — there's no broken logic, the feature was just never extended to this third channel. It's a product decision: do dine-in QR orders need the same discount engine? If yes, the integration point would be admin-side (similar to the customer-LTV sync already built for Tables) rather than exposing the `discounts` node to unauthenticated clients, since `discounts`/`discountsUsage` are correctly admin-only in the rules today.

---

## 🟡 MEDIUM — Cloud Functions Hardcode the Outlet List

**File:** `functions/index.js`, line 14

```js
const OUTLETS = ["pizza", "cake"];
```

Both push-notification functions (`onOrderUpdate` for riders, `onNewOrder` for admins) check incoming writes against this fixed array and silently skip anything outside it. Everywhere else in the system, outlets are handled generically via the `$outletId` wildcard — Functions is the one place that isn't. If a third outlet is ever added, push notifications for it simply won't fire, with no error logged anywhere to explain why. Easy fix whenever a new outlet is onboarded (or could be made dynamic by reading from a `/outlets` list instead), just flagging it now so it isn't a surprise later.

---

## 🟢 Low / Observational Findings

1. **`Admin/js/features/orders.js`'s listeners are never torn down** when leaving Dashboard/Orders/Live/Payments for another tab — `cleanupOrders()` exists and is correctly written, but isn't wired into the tab-switch cleanup list the way every other feature module's cleanup is. I deliberately **did not** patch this myself: only the `'orders'` tab case actually re-attaches the listener (`loadOrdersPage(true)`); Dashboard, Live, and Payments all just passively read whatever `state.lastOrdersSnap` already holds. Wiring cleanup in without also making those three tabs self-sufficient would trade a minor always-on listener for a worse bug — those tabs going stale/frozen if visited directly without passing through "Orders" first. Worth a deliberate look, not a blind patch.

2. **`promotions.js` has a dead constant** — `PROMO_ENABLED_PATH = 'bot/{outlet}/promotions/enabled'` is declared with a literal, never-interpolated `{outlet}` placeholder and is never read anywhere; the actual kill-switch/enabled state correctly goes through `_promoRef('enabled')` instead. Harmless, just unused code worth deleting in a cleanup pass.

3. **`Admin/js/features/rider-analytics.js`'s `cleanupRiderAnalytics()`** is also unwired into the tab-switch cleanup list, but unlike orders.js this one only resets some DOM text to placeholder values (no listener teardown) — cosmetic only, low priority.

---

## ✅ Confirmed Working — Admin Portal (All 19 Tabs)

Every tab in the sidebar was checked against its actual `case` in `switchTab()` and confirmed to call a real, exported loader function in the matching feature module, with a matching cleanup function wired for anything that attaches a live listener:

| Tab | Module | Loader | Cleanup wired? |
|---|---|---|---|
| Dashboard / Orders / Live | `orders.js` + `riders.js` | `renderOrders`, `loadOrdersPage`, `loadRiders` | See Low Finding #1 |
| Live Tracker | `tracker.js` | `initLiveRiderTracker` | ✓ |
| Catalog / Categories / Menu | `catalog.js` | `loadCategories`, `loadMenu` | ✓ |
| Riders | `riders.js` | `loadRiders` | ✓ |
| Feedback | `feedback.js` | `loadFeedbacks` | ✓ |
| Walk-in (POS) | `pos.js` | `loadWalkinMenu` | n/a (no live listener) |
| Settings | `settings.js` | `loadStoreSettings` | n/a (loads once) |
| Customers | `customers.js` | `loadCustomers` | n/a (loads once) |
| Reports | `analytics.js` | `loadReports` | ✓ |
| Lost Sales | `lost-sales.js` | `loadLostSales` | n/a |
| Inventory | `inventory.js` | `loadInventory` | ✓ |
| Rider Analytics | `rider-analytics.js` | `initRiderAnalytics` | See Low Finding #3 |
| Payments | `orders.js` | `renderOrders` (reuses Orders' data) | shares Orders' lifecycle |
| Promotions | `promotions.js` | `loadPromotions` | ✓ |
| Discounts | `discounts.js` | `loadDiscounts` | ✓ (+ `discountsReports`) |
| Tables | `tables.js` | `loadTableManagement` | ✓ |
| Notifications | (sheet/dropdown, not a tab swap) | `toggleNotificationSheet` | n/a by design |

**Verdict: structurally sound.** No orphaned tabs, no missing modules, no dangling references.

---

## ✅ Settings Page — Full Connectivity Flow

Checked every `id="settingXXX"` field in `Admin/index.html` against every `getElementById('settingXXX')` reference in `settings.js`'s load **and** save functions:

- **33 fields total**, 33 referenced in JS, 33 present in HTML — **zero orphans either direction.**
- Save writes a single `storeData` object to `settings/Store` covering: entity name, store name, address, GSTIN, FSSAI, tagline, powered-by line, open/close time, shop status, WiFi name/password, Instagram, Facebook, Google Review link, WhatsApp number, receipt feedback URL, customer menu background image, lat/lng, payment QR.
- Dine-in specific settings (`taxEnabled`, `serviceChargeEnabled`, `serviceChargeRate`, etc.) save to a separate `dineinSettings` node, and are read identically by both the QR Menu app's cart calculation and the Admin Tables drawer's bill display — **confirmed they compute totals the same way in both places**, so a customer never sees a different total than what the admin sees when generating the bill.
- The only thing that needed fixing was *where* the public-facing fields were exposed (the Critical finding above) — the load/save round-trip logic itself is complete and correct.

---

## ✅ QR Ordering App (`menu/`) — Full Flow Re-Verified

Relocated from `QR Ordering Feature/Menu/` to root `menu/` in a recent commit — re-checked everything survived the move and the subsequent "Phase 1–4" feature work:

- **Bottom Nav (Menu / Cart / Status / History / Promos)** — present, wired, all 6 reference points found
- **Token-based table session join-or-create**, secure random QR tokens, transaction-guarded against double-session creation — unchanged, still correct
- **Tax & service charge toggles** — sourced from `dineinSettings`, applied identically in cart, order payload, and session totals
- **Guest count, special notes, checkout contact** — all save correctly to the session record
- **History screen** — lists this-session's orders with live status badges
- **Promotions screen** — dynamically renders Google/Instagram/Facebook/WhatsApp cards based on what's configured in Admin Settings, gracefully hides any not configured
- Every `outletRef()` path the app touches (`categories`, `dishes`, `orders`, `tables`, `tableSessions`, `tableRequests`, `dineinSettings`, `settings/Store/*`) was cross-checked against the live rules — all correctly scoped except the Critical/High findings above, both now fixed.

---

## ✅ Discounts — What It Is & Where It Applies

**Admin tab:** Discounts (`discounts.js` + `discount-evaluator.js` + `discountsReports.js`)

This is a real, fairly sophisticated discount engine:
- **Types:** first-order, coupon code, global (storewide), category-specific — each with percent-or-flat mode and an optional max cap
- **Priority-ranked** when multiple discounts could apply (first-order beats coupon beats global beats category)
- **Feature kill-switch** (`discounts/featureEnabled`) to disable the whole system instantly
- **30-second cache** to avoid hammering Firebase on every cart change
- **Usage tracking** (`discountsUsage`) records every time a discount is actually given, by order/customer/channel

**Where it's actually wired in:** POS (Admin walk-in orders) and the WhatsApp ordering bot. **Not wired into QR dine-in** — see Medium finding above. The rules (`discounts`, `discountsUsage`) are correctly admin-only, no exposure issues.

---

## ✅ Promotions — Two Different Things, Both Confirmed Working

This is worth spelling out clearly since "Promotions" means two different things in this codebase:

### 1. Admin "Promotions" Tab — WhatsApp Campaign Composer
**File:** `Admin/js/features/promotions.js` (990 lines — substantial feature)

This is a bulk WhatsApp messaging tool for the restaurant owner: compose a message with an optional image/menu attachment, pick recipients (from the Customers list, with phone-number-shaped column auto-detection on CSV/Excel import), cap at 300 recipients per campaign, live send progress, and a kill switch. Data lives under `bot/{outlet}/promotions/*`, correctly admin-gated in the rules (confirmed: no public exposure). One dead/unused constant found (see Low finding #2), no functional issues.

### 2. Customer-Facing "Promotions" Screen — Social/Review Quick Links
**File:** `menu/index.html` + `ui.js` (`renderPromotionsLinks`)

This is the bottom-nav "Promos" tab customers see on their phone after scanning the table QR code — four cards (Google Review, Instagram, Facebook, WhatsApp) sourced live from the same Admin Settings fields. Confirmed working, confirmed gracefully hides any link the admin hasn't configured yet, confirmed it correctly survived the `menu/` relocation.

**These are unrelated features that happen to share a name** — the Admin tab sends messages *to* customers; the customer screen sends customers *to* your social pages. Worth keeping that distinction in mind if either gets extended later.

---

## Cloud Functions (`functions/`)

Two functions, both push-notification triggers on `/{outlet}/orders/{orderId}` writes:
- `onOrderUpdate` — notifies the assigned rider on new assignment or key status changes (ready/cancelled)
- `onNewOrder` — notifies all admin devices on order creation

Both read FCM tokens correctly from `riders/{id}/fcmToken` (global, not outlet-scoped — consistent with how `riders`/`admins` are structured everywhere else). Logically sound. Only issue: the hardcoded outlet list (Medium finding above).

---

## Production Readiness Checklist

- [ ] **Deploy the attached `database.rules.FIXED.json`** — fixes both Critical and High findings in one file
- [ ] Decide whether QR dine-in orders should get the same discount treatment as POS/WhatsApp (product decision, not urgent)
- [ ] Update `functions/index.js`'s `OUTLETS` array before onboarding a 3rd outlet
- [ ] Optional cleanup: remove the dead `PROMO_ENABLED_PATH` constant in `promotions.js`
- [ ] Optional: decide how to handle Orders' listener lifecycle (see Low finding #1) — not urgent, no data-correctness impact, just a minor efficiency question

---

## Final Verdict

**Production-ready once the rules fix is deployed.** This is a mature, well-architected system — consistent patterns across modules, careful attention to security rule scoping almost everywhere, real transactional safety where it matters (session totals, table assignment), and genuinely sophisticated features (the discount engine and promotions composer are both more capable than most systems this size bother building). The two issues found here are exactly the kind that are easy to introduce in a fast-moving codebase and easy to miss without a dedicated cross-check between "what the rules allow" and "what the code actually does" — which is precisely what this audit was for.

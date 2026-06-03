# Discount Control Panel — Feature Plan

**Status:** Researched, refined after self-review, awaiting implementation (follow-up to Promotions Page)
**Target branch / module:** Admin dashboard + POS + WhatsApp bot + RTDB schema
**Created:** 2026-06-02 · **Last refined:** 2026-06-02
**Companion docs:** `Promotion Page Plan.md` (sister feature), `Review and Improvements.md` (audit trail of what was added in this revision)

---

## 1. Background & Motivation

A "Promotions Page" sends marketing **messages**. A "Discount Control Panel" actually
**changes prices** for the customer at checkout.

Today, discounts are completely **ad-hoc**:
- **POS (walk-in)**: cashier manually types an amount or picks a % in the cart.
  - `state.walkinDiscount` (₹) OR `state.walkinDiscountPct` (%)
  - Applied at sale time only — no record of *why* it was given.
- **Online (WhatsApp bot)**: no UI to apply a discount at all.
  `user.discount` is referenced at `bot/index.js:1850` but **never set anywhere in the bot** — it's dead code. Online orders have always had zero discount.
- **No concept of**: scheduled discounts, first-order discounts, coupon codes,
  product/category-specific discounts, max-cap, or audit log.

### What the user asked for
- "If the promotion says, **5% discount today** … a particular **selected date + time** can be assigned for 5% discount."
- "**New customer discount 5%** — editable features."
- Lives in the **same Marketing group** as the Promotions page (follow-up).

---

## 2. Goals
1. Schedule **time-windowed discounts** (e.g. "Today only — 5% off the entire menu").
2. Configure a **New-Customer Welcome Discount** (e.g. 5% off first order, capped at ₹100).
3. Auto-apply discounts at **both POS and WhatsApp bot** checkout, with audit trail.
4. Support **coupon codes** the customer can quote in WhatsApp.
5. Full **CRUD UI** inside the Marketing group, with enable/disable toggles.
6. Co-exist with the existing manual discount input (cashier override wins).
7. Cross-link with the Promotions page: a campaign can optionally generate per-recipient coupon codes (see `Promotion Page Plan.md` §3, `generateCoupons`).

---

## 3. Competitor Research Summary

| Source | Inspiration |
|---|---|
| **BigCommerce Bulk Price Editor & Promotions Scheduler** | Schedule start/end, auto-rollback, percent or fixed, item-level rules. |
| **Odoo SMS / Promo Codes** | Date ranges, usage limits, per-customer eligibility, code generation. |
| **AliExpress / Aurate "New Shopper" labels** | First-order eligibility via order history, sticky until used. |
| **Posist / FoodChow** | Schedule Happy Hours, item/discount matrix, bill-time auto-apply. |

Common patterns we will adopt:
- A **time window** (start, end) drives auto-apply.
- A **type** field: `global` (everything) / `category` (one or more) / `firstOrder` (new customers) / `coupon` (code-based).
- A **value** field: percent OR fixed ₹ + optional **max cap**.
- A **stackable** flag (default false — exclusive).
- A **status** field: `draft | active | expired | paused`.
- An **auditable usage** field on every order: `discountSource: "promo:PROMO123" | "firstOrder" | "manual"`.

---

## 4. Pre-Flight Must-Haves (Quick Wins — ship first)

These 6 items are low-effort, high-value, and prevent the most common disasters. Ship them **before** the bulk of the feature.

| # | Item | Effort | Why it matters |
|---|---|---|---|
| 1 | Add `AWAIT_COUPON` step in the bot state machine (between `CART_VIEW → CHECKOUT` and final `CONFIRM_PAY`) | 30 min | Without this, coupon redemption is impossible |
| 2 | Use `customers/{phone}.orderCount` (from POS) as the canonical "is new?" check in the bot — read **before** `processOrderPlacement` | 15 min | Bot currently creates the customer record **after** order placement, so the timing matters |
| 3 | Use `runTransaction` for `stats.usedCount` writes | 10 min | Prevents lost-increments under concurrent sales |
| 4 | Update the 5 invoice lines in `bot/index.js` (lines 526, 1110, 1176, 1249, 1942) to include `discountLabel` | 15 min | Customer-visible: "🎁 Discount (Festive 5%): -₹50" |
| 5 | Update `Admin/receipt-templates.js:135` to show `discountLabel` + `discountSource` on the printed receipt | 10 min | Cashier + customer both see the reason |
| 6 | Add a 30 s in-process cache for `discounts/*` reads (so a 100-order rush doesn't burn 50K Firebase reads/day) | 15 min | Spark-plan cost safety |

**Total:** ~1.5 hours. Do these in one sitting before opening the rest of the feature work.

---

## 5. Database Schema Changes

### NEW nodes (under each outlet)
```
{pizza|cake}/
  discounts/                              ← Discount definitions
    {discountId}/
      name: "Festive 5% Off"
      type: "global" | "category" | "firstOrder" | "coupon"
      mode: "percent" | "fixed"
      value: 5                  ← % if mode=percent else ₹
      maxCap: 100               ← optional ₹ cap
      minSubtotal: 0            ← optional minimum bill
      categoryIds: []           ← if type=category
      couponCode: "FESTIVE5"    ← if type=coupon
      distribution: "manual" | "per-customer-auto" | "include-in-promo"  ← coupon only
      startsAt: <ts>            ← UTC ms; UI displays IST
      endsAt: <ts>              ← UTC ms; 0 = no end
      stackable: false
      exclusiveGroup: "welcome" ← optional; only one per group can apply
      perCustomerLimit: 0       ← 0 = unlimited
      globalLimit: 0            ← 0 = unlimited
      engineVersion: 1          ← for future-proofing
      enabled: true
      createdBy, createdAt
      stats: { usedCount, totalDiscountGiven }   ← written via runTransaction
  discountsUsage/                        ← audit log (one entry per usage)
    {usageId}/
      discountId, discountLabel,
      orderId, customerPhone,
      amountGiven, appliedAt, channel: "pos"|"whatsapp"
```

### MODIFIED nodes
```
customers/{phone}/
  + firstOrderDiscountUsed: <ts>          ← marks welcome discount as consumed
  + firstOrderDiscountId: "<discountId>"  ← which one they used
  + orderCount: <int>                     ← already tracked by POS via runTransaction (pos.js:657–666)
  + promotionalConsent: true              ← set on first order; required for promo sends (cross-link to Promotions)
orders/{orderId}/
  + discountSource: "promo:PROMO123" | "firstOrder" | "coupon:FESTIVE5" | "manual" | "auto:global" | "none"
  + discountId: "<discountId>"            ← when auto-applied (null for manual)
  + discountLabel: "Festive 5% Off"       ← shown on receipt/WhatsApp summary
  (existing field `discount: <₹amount>` stays as-is for backward compat)
```

### Database rules (delta)
Add to `database.rules.json` under both `$outletId` blocks:
```json
"discounts": {
  ".read":  "auth != null && (…admin rules…)",
  ".write": "auth != null && (…admin rules…)"
},
"discountsUsage": {
  ".read":  "auth != null && (…admin rules…)",
  ".write": "auth != null && (…admin rules…)"
}
```
The existing admin write rule template applies (same shape as `settings/`).

---

## 6. Files to Touch

### NEW
| File | Purpose |
|---|---|
| `Admin/js/features/discounts.js` | CRUD UI for `discounts/*` node. Renders active, scheduled, expired tabs. Handles enable/disable toggles and live usage counters. |
| `Admin/js/features/discount-evaluator.js` | **Shared helper** that, given a cart subtotal + customer, returns the best applicable discount (or `null`). Used by both POS and bot at sale time. |

### EDIT
| File | Change |
|---|---|
| `Admin/index.html` | New `menu-discounts` under Marketing group + new `<div id="tab-discounts">` (active/scheduled/expired tabs, table of discounts, "New Discount" modal). |
| `Admin/js/ui.js` | Add `case 'discounts':` to `switch (tabId)`. |
| `Admin/js/main.js` | Click handlers for `data-action="newDiscount"`, `data-action="toggleDiscount"`, `data-action="deleteDiscount"`, `data-action="editDiscount"`. |
| `Admin/js/state.js` | Add `state.activeDiscountsCache = []` and `state.discounts = { byId: {}, lastFetched: 0 }`. |
| `Admin/js/features/pos.js` | (a) Before `submitWalkinSale` finalizes the order, call `discount-evaluator.js` and **prefer** the auto discount unless cashier's manual entry is non-zero. (b) Persist `discountSource / discountId / discountLabel` on the order. (c) Update `customer.firstOrderDiscountUsed` after a `firstOrder` discount is consumed. (d) Log a `discountsUsage` entry via `runTransaction`. (e) Show live "Effective discount" indicator in cart summary. (f) The cashier's manual input stays as an **override** (recorded with `discountSource: "manual"`). |
| `bot/index.js` | (a) New helper `evaluateAndApplyDiscount(user, cartSubtotal, customerPhone)` mirroring the Admin helper. (b) Add `AWAIT_COUPON` state in the state machine (see §7 below). (c) Call the helper inside `processOrderPlacement` **after** subtotal is known and **before** `total` is computed. (d) When first-order is consumed, write `firstOrderDiscountUsed/Id` on the customer **before** creating the customer record. (e) Persist `discountSource` on the order. (f) Log `discountsUsage` entry. (g) Update 5 invoice-formatting lines (526, 1110, 1176, 1249, 1942) to use the new `formatDiscountLine()` helper. |
| `database.rules.json` | Add `discounts` and `discountsUsage` rules (delta above). |
| `Admin/receipt-templates.js` | Update line 135 to show `discountLabel` + `discountSource` (see §10). |

---

## 7. Bot State Machine — `AWAIT_COUPON` step

Currently the bot goes: `CART_VIEW → (2) → REUSE_PROFILE / NAME → ... → CONFIRM_PAY → PLACE_ORDER`.

We add an optional coupon step between `CART_VIEW` and the rest:

```
CART_VIEW
   ↓ user picks "2" (proceed to checkout)
[NEW] AWAIT_COUPON
   "🎟 Have a coupon code? Reply with it, or type 0 to skip."
   ↓ (coupon code, or "0" to skip)
   • If code provided: validate against `discounts/*.{coupon}.couponCode`
     - Match → store on `user.couponCode`, show "✅ Coupon FESTIVE5 applied! 10% off"
     - No match → "❌ Invalid code. Try again or reply 0 to skip."
   • If "0" → no coupon; user.couponCode remains null
REUSE_PROFILE / NAME flow continues as before
```

**New fields on `user`:**
- `user.couponCode: string | null`
- `user.discount: number` (the resolved ₹ amount; used at line 1850)
- `user.discountId: string | null`
- `user.discountLabel: string | null`
- `user.discountSource: string | null`

**No change** to the existing `user.discount` reference at line 1850 — that variable is just now **populated by the new logic** instead of always being `undefined`.

---

## 8. Discount Engine Logic (shared helper)

```js
// discount-evaluator.js — shared between Admin and bot
const _cache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 30_000;

async function getAllDiscounts() {
  const now = Date.now();
  if (_cache.data && (now - _cache.fetchedAt) < CACHE_TTL_MS) return _cache.data;
  const snap = await get(ref(db, `${Outlet.current}/discounts`));
  _cache.data = snap.val() || {};
  _cache.fetchedAt = now;
  return _cache.data;
}

export async function evaluateDiscount({ customer, subtotal, couponCode, cart, now = Date.now() }) {
  if (subtotal <= 0) return null;          // safety: don't compute on zero/negative
  const all = await getAllDiscounts();
  const list = Object.entries(all).map(([id, d]) => ({ id, ...d }));

  const candidates = list.filter(d =>
    d.enabled
    && now >= (d.startsAt || 0)
    && (d.endsAt === 0 || d.endsAt == null || now <= d.endsAt)
    && (!d.minSubtotal || subtotal >= d.minSubtotal)
  );

  const applicable = candidates.filter(d => {
    if (d.type === 'global')     return true;
    if (d.type === 'firstOrder') return !customer?.firstOrderDiscountUsed;
    if (d.type === 'category')   return cartHasCategory(cart, d.categoryIds);
    if (d.type === 'coupon')     return !!couponCode && couponCode.toLowerCase() === (d.couponCode || '').toLowerCase();
    return false;
  });

  if (applicable.length === 0) return null;

  // Group-aware exclusivity
  const byGroup = new Map();
  for (const d of applicable) {
    const g = d.exclusiveGroup || '__none__';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(d);
  }
  const bestPerGroup = [...byGroup.values()].map(group => pickBest(group, subtotal));
  const stackable = bestPerGroup.filter(d => d.stackable);
  const exclusive = bestPerGroup.filter(d => !d.stackable);
  const winner = exclusive.length > 0
    ? pickBest(exclusive, subtotal)
    : null;

  const chosen = winner
    ? [winner]
    : bestPerGroup; // all are stackable

  // Apply caps
  let total = 0;
  for (const d of chosen) {
    let amt = d.mode === 'percent' ? subtotal * (d.value / 100) : d.value;
    if (d.maxCap) amt = Math.min(amt, d.maxCap);
    total += amt;
  }
  // Defensive cap: never discount more than the subtotal itself
  total = Math.min(total, subtotal);

  return {
    discount: chosen[0],                 // primary (used for label, id)
    allApplied: chosen,                  // for analytics
    amount: Math.round(total),
  };
}

function pickBest(group, subtotal) {
  // Priority: firstOrder > coupon > global > category. Then by amount (highest first).
  const priority = { firstOrder: 4, coupon: 3, global: 2, category: 1 };
  return group.sort((a, b) => {
    const pa = priority[a.type] || 0, pb = priority[b.type] || 0;
    if (pa !== pb) return pb - pa;
    const va = a.mode === 'percent' ? subtotal * (a.value/100) : a.value;
    const vb = b.mode === 'percent' ? subtotal * (b.value/100) : b.value;
    return vb - va;
  })[0];
}
```

Used in:
- **POS**: `submitWalkinSale` calls it; if cashier already entered a manual discount, that wins (override) and `discountSource: "manual"`.
- **Bot**: `evaluateAndApplyDiscount(user, subtotal, customer.phone)` is called inside `processOrderPlacement` after subtotal is known and **before** `total` is computed.

### First-order eligibility (the critical timing issue)
The bot's `customers/{phone}` is **created at `bot/index.js:1882`, AFTER order placement**. So the eligibility check is "the customer record doesn't exist at evaluation time":

```js
const existing = await getData(`customers/${cleanPhone}`);
const isNewCustomer = !existing;
```

After the order succeeds, write the customer record with `firstOrderDiscountUsed: Date.now()` and `firstOrderDiscountId: <id>` so future orders skip the discount.

### Discount applies to **food subtotal only**, not delivery fee
This is industry standard. The bot already does:
```js
total: subtotal + deliveryFee - (user.discount || 0)
```
We keep this exact formula. `user.discount` is the ₹ amount returned by the evaluator.

---

## 9. Order-Time Behavior (new contract)

### Before
- `total = subtotal + deliveryFee - user.discount` (bot; `user.discount` always undefined)
- `total = subtotal - state.walkinDiscount` (POS)

### After
1. **Subtotal** computed normally.
2. **Auto-discount** evaluated by `discount-evaluator.js` (using `user.couponCode` if set, and `customer` profile if known).
3. **Manual discount** checked — if cashier entered one (POS) or if a bot command set one, that **overrides** the auto discount (and gets `discountSource: "manual"`).
4. **Final**: `total = subtotal + deliveryFee - effectiveDiscount`.
5. **Order persisted** with `discountId`, `discountLabel`, `discountSource`.
6. **Audit row** written to `discountsUsage/{id}` via `runTransaction`.
7. **Customer record** updated if `firstOrder` was consumed.
8. **Stats** on the discount: `usedCount++`, `totalDiscountGiven += amount` (via `runTransaction`).
9. **Receipt** prints new line: `🎁 Discount (Festive 5%): -₹50` (see §10).
10. **WhatsApp invoice** shows the discount line with label.

---

## 10. Receipt & Invoice Changes (exact code)

### `Admin/receipt-templates.js` line 135
Replace:
```js
${order.discount > 0 ? `<div class="summary-row"><span class="bold">Discount Allotted:</span> <span class="bold">-₹${Number(order.discount).toFixed(2)}</span></div>` : ''}
```
With:
```js
${order.discount > 0 ? `
  <div class="summary-row">
    <span class="bold">Discount${order.discountLabel ? ' (' + order.discountLabel + ')' : ''}:</span>
    <span class="bold">-₹${Number(order.discount).toFixed(2)}</span>
  </div>
  ${order.discountSource ? `<div class="summary-row" style="font-size:10px;color:#888;"><span>Source: ${order.discountSource}</span></div>` : ''}
` : ''}
```

### `bot/index.js` — new helper, used in 5 places
```js
function formatDiscountLine(order) {
  if (!order?.discount || order.discount <= 0) return '';
  const label = order.discountLabel ? ` (${order.discountLabel})` : '';
  return `🎁 Discount${label}: -₹${Number(order.discount).toFixed(0)}\n`;
}
```
Apply at lines **526, 1110, 1176, 1249, 1942**.

### `orders.js` table — small pill
Add a column or tooltip on the orders table showing `discountSource` so staff can explain a discount to a confused customer.

---

## 11. UI Wireframe — Discounts Tab

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [❔ How to use]            DISCOUNT CONTROL PANEL  ·  PIZZA OUTLET       │
│ 💸 Scheduled, new-customer & coupon discounts       [+ New Discount]    │
├──────────────────────────────────────────────────────────────────────────┤
│ [Active: 2]  [Scheduled: 1]  [Expired: 4]                                 │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ Name              Type        Value     Window          Status  ⚙  │ │
│ │ Festive 5%        global      5%        12 Jun 10:00 →  14 Jun  🟢  │ │
│ │                                  23:59               Active        │ │
│ │ First-Order 5%   firstOrder  5% cap ₹100  Always on          🟢  │ │
│ │ Pizza Mania      category    10%       10 Jun → 11 Jun 23:59 ⏸ │ │
│ │ FESTIVE5         coupon      10%       12 Jun → 16 Jun     🟢  │ │
│ │ Used 47× • Given away ₹2,310                                          │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### "New Discount" modal
Fields:
- **Name** (required)
- **Type**: radio — `global / category / firstOrder / coupon`
- **Mode**: `percent` OR `fixed` (₹)
- **Value** + **Max cap** (optional)
- **Min subtotal** (optional)
- **Categories** (multi-select chips) — only if `type=category`
- **Coupon code** (auto-suggest + editable) — only if `type=coupon`
- **Distribution** — only if `type=coupon`: `manual / per-customer-auto / include-in-promo`
- **Starts at** (date + time, IST)
- **Ends at** (date + time, IST) — "no end" toggle
- **Stackable** (default false)
- **Exclusive group** (optional text) — e.g. `welcome` for first-order discounts
- **Per-customer limit** (optional)
- **Global limit** (optional)
- **Enabled** (default true)
- Buttons: **Save Draft** / **Save & Activate** / **Cancel**

---

## 12. Edge Cases & Safety
- **Double-apply**: prevented by `stackable=false` default; or by `exclusiveGroup`.
- **Manual override wins** in POS so the cashier is never blocked.
- **Bot offline**: Discount engine reads from `discounts/*` RTDB; evaluator caches 30 s. If first read fails, falls back to no discount (never errors out the order).
- **Time-zone**: all `startsAt`/`endsAt` stored as UTC ms. UI displays in IST using existing `getISTDateString` helper. Evaluation uses `Date.now()` UTC directly — no TZ math at evaluation time.
- **Race on schedule expiry**: every order re-evaluates `now()` against the discount window — no stale cache.
- **Coupon reuse**: each coupon can be marked `usageLimit` via `globalLimit` (optional, future). v1 = unlimited.
- **First-order abuse**: only one welcome discount per customer; tracked in `customer.firstOrderDiscountUsed`.
- **New schema write failures**: if `discountsUsage` write fails, the order still goes through (best-effort logging); warn admin in POS UI.
- **Subtotal ≤ 0**: evaluator returns `null` immediately.
- **Engine versioning**: `engineVersion: 1` written on every discount; evaluator logs its version into `discountsUsage` for future debugging.

---

## 13. Refund Policy
- **Full refund**: delete the `discountsUsage/{id}` row, decrement `stats.usedCount` via `runTransaction`, and (if it was a `firstOrder` discount) clear `customer.firstOrderDiscountUsed/Id`.
- **Partial refund**: keep the usage but mark it `partiallyRefunded: true` and store `refundedAmount`.

---

## 14. Testing & Rollback

### Unit / integration tests (manual test plan)
1. **Schedule a 5% global discount** for the next hour; place a WhatsApp order; verify auto-discount applied.
2. **Place a second order for a different phone**; verify `firstOrder` discount applied.
3. **Place a third order with a coupon code**; verify the discount matches the coupon and the order is marked with `discountSource: "coupon:..."`.
4. **POS manual override** — cashier types ₹100 discount; verify it wins over auto-discount and `discountSource: "manual"`.
5. **Expiry** — schedule a discount for 2 minutes from now; wait 3 minutes; verify it's not applied.
6. **Refund flow** — refund a discounted order; verify `stats.usedCount` decrements; for first-order, verify customer is re-eligible.
7. **Concurrent edits** — two admins edit the same discount; verify no lost writes on `stats.usedCount` (because of `runTransaction`).
8. **Concurrent customer types** — `firstOrder` and `global` both match; verify `firstOrder` wins (priority).
9. **BOT-43 race** — bot restart mid-discount-eval; verify cache re-fetches.
10. **POS previews** — open POS, add items, see the "Effective discount" indicator update on every cart change.

### Rollback plan
- **Feature flag** at `pizza/discounts/featureEnabled: false` (default `true` after launch).
- Setting it to `false` makes the evaluator return `null` immediately — no discount is ever applied, no DB writes happen.
- Existing discounts remain in RTDB for inspection.
- The Admin UI hides the Discounts tab when the flag is off.

---

## 15. Migration
- **No data migration needed** — `discounts/*` is a brand-new node.
- **Orders** get new optional fields (`discountSource / discountId / discountLabel`); existing orders display "—" for these in the Admin UI.

---

## 16. Implementation Order
1. **Pre-Flight Must-Haves** (6 items from §4) — ~1.5 hrs.
2. **DB schema** — add `discounts/`, `discountsUsage/`, rules delta.
3. **Shared helper** — `discount-evaluator.js` (testable in isolation).
4. **Bot state machine** — add `AWAIT_COUPON` step, wire `user.couponCode`.
5. **Bot integration** — call helper in `processOrderPlacement`, persist new order fields, write `firstOrderDiscountUsed`.
6. **POS integration** — call helper in `submitWalkinSale`, persist new order fields, show preview, update customer.
7. **Admin CRUD UI** — `discounts.js` + tab + modal.
8. **Receipt + WhatsApp invoice** — 5 lines in `bot/index.js` + 1 line in `receipt-templates.js`.
9. **Refund flow** — in orders.js.
10. **End-to-end test** — full manual test plan from §14.
11. **Version bump** — `ADMIN_VERSION` `4.10.0` → `4.11.0` (after Promotions lands).

---

## 17. Effort Estimate
~300 lines shared helper + 250 lines bot integration + 700 lines Admin UI + 60 lines schema + 30 lines receipt/WhatsApp updates.
Total: ~1,340 lines (does not include the ~1,600 from Promotions page).

---

## 18. v2 (Deferred) Features
- **Item-level discounts** (vs. subtotal-based) — `type: "item"`, `dishIds: [...]`.
- **Buy-X-Get-Y** — `type: "bxgy"`, `buyQuantity`, `getQuantity`, `getDiscount`.
- **Loyalty-tier discounts** — `type: "loyalty"`, `tier: "gold"`, `ltvThreshold: 5000`.
- **Abandoned-cart auto-discount** — triggered by `lostSales/{id}` age > N hours.
- **Per-customer daily limit** — tracked via `discountsUsage` query.
- **A/B testing variants** — different discount % for 50/50 random split.
- **Multi-code coupons** — single `discounts/{id}` with N unique codes generated and distributed.
- **Coupon-distribution auto-DM** — `distribution: "per-customer-auto"` actually implemented.
- **Discount analytics dashboard** — revenue impact ("we gave ₹2,310 → produced ₹8,000 in extra orders").
- **Tax-aware discounts** — apply pre-tax or post-tax (currently always pre-tax; defer to when GST logic is added separately).
- **Loyalty points integration** — earn X points per ₹Y, redeem at thresholds.

---

## 19. Open Decisions (need confirmation before implementation)
- **Coupon code case-sensitivity**? (Default: **case-insensitive** for the customer-facing code, but `couponCode` is stored as-typed.)
- **First-order phone requirement**? In WhatsApp flow, yes (we already collect phone). In POS, the cashier can enter any phone — we trust them. The eligibility check is `!exists customers/{phone}` regardless.
- **Expired discount auto-archive**? Default: keep with `enabled=false` set by a daily heartbeat (no `_archive/` sub-node in v1).

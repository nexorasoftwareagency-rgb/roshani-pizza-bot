# Plan Review — Missing Items & Improvements

**Date:** 2026-06-02
**Scope:** Critical review of `Promotion Page Plan.md` + `Discount Control Panel Feature.md` against the current codebase in `bot/index.js` and `Admin/*`.
**Method:** Re-read both plans line-by-line, cross-referenced every claim against the actual repo, and looked for gaps.

---

## PART A — Critical Findings (must address)

### A1. `user.discount` is dead code in the bot
**Where:** `bot/index.js:1850`
```js
total: subtotal + deliveryFee - (user.discount || 0)
```
`user.discount` is **referenced but never assigned anywhere in `bot/index.js`**. Online (WhatsApp) orders have **always** had `user.discount = undefined` → `total = subtotal + deliveryFee`. The Discount plan correctly identifies this, but it does not call out:

- The bot state machine has **no `AWAIT_COUPON` step** for the customer to type a coupon code. We'd need to add one (between `CART_VIEW → CHECKOUT` and the final `CONFIRM_PAY`).
- The customer record is **created at `bot/index.js:1882`, AFTER the order is placed**. For a `firstOrder` discount check, we need to query `customers/{phone}` **before** `processOrderPlacement` and only treat "new" as `!exists`.
- The bot's `saveUserProfile(sender, ...)` at `bot/index.js:1863` writes to `botUsers/{jid}`. This is **separate** from `customers/{phone}`. We need to pick one canonical "is new customer?" source — recommend `customers/{phone}` (POS already maintains `orderCount` there).

**Action item:** Update Discount plan §6 to explicitly call out the `AWAIT_COUPON` state-machine addition and the `customers/{phone}.orderCount` eligibility check.

---

### A2. `appendContactInfo` will mangle promotional messages
**Where:** `bot/index.js:344–355`
```js
async function appendContactInfo(text, outlet = 'pizza') {
  ...
  return `${text}\n\n━━━━━━━━━━━━━━━━━━━━\nIf you have any Doubt Contact Admin: *${adminNum}*`;
}
```
Every bot message — including the new promotional sends — would get the trailing "If you have any Doubt Contact Admin: 9876543210" line. For a promotional message, this looks unprofessional and clutters the message.

**Action item:** Promotions plan must add a flag (e.g. `appendContactInfo(text, outlet, skipFooter=true)`) **or** a dedicated `sendPromotionalMessage()` wrapper that omits the footer and instead appends "Reply STOP to unsubscribe" when the campaign sets `includeOptOut: true`.

---

### A3. Bot restart loses in-memory campaign state
**Where:** `bot/index.js:77–79, 1385–1404`
```js
let cryptoErrorCount = 0;
let reconnectAttempts = 0;
...
if (connection === 'open') {
  reconnectAttempts = 0;
  cryptoErrorCount = 0;
}
```
The bot's in-memory counters reset on reconnect, and `startBot()` is called recursively on every disconnect (with exponential backoff up to 120 s). A campaign running in memory would be **silently lost** on any bot restart.

**Action item:** Promotions plan must specify that `runPromotionCampaign` is **idempotent and re-entrant**: on every `startBot()`, scan `bot/{outlet}/promotions/campaigns/{id}` for entries with `status="running"`, and **resume from `currentIndex`** (also: re-validate the WhatsApp socket is actually `open` before resuming; do not resume during reconnect-backoff). Same goes for the 5-min heartbeat picking up `status="scheduled"` entries.

---

## PART B — Missing in Promotion Page Plan

### B1. Test / sandbox mode
There is no "send to one number first" flow. Before blasting 200 customers, the admin should be able to send a single test message to themselves.

**Add:** A "🧪 Send Test" button in the composer that uses a hardcoded `DEVELOPER_NUMBER` (already in `bot/index.js:197`).

### B2. Business-hours / quiet-hours guard
WhatsApp penalises messages sent at unusual hours. Default to "send only between 10:00–21:00 IST". Configurable per campaign.

**Add:** `quietHoursStart`, `quietHoursEnd` fields in the campaign doc. The campaign loop sleeps past quiet hours.

### B3. Image / media support
All examples in the plan are text-only. The current `sock.sendMessage` API supports `image`, `video`, `document` payloads. A promotional message with the menu image converts far better.

**Add:** Optional "📎 Attach media" field in the composer (max 1 image or PDF, ≤ 5 MB). Pass `mediaUrl` in the command; bot uses existing `sendImage(sock, jid, url, text, outlet)` from `bot/index.js:357`.

### B4. Resume after bot crash
See A3 above. The plan should have a "Resumability" section.

### B5. Crypto-error auto-pause
The plan respects `MAX_CRYPTO_ERRORS = 500` for session health but doesn't tie it to campaign health. A campaign should auto-pause if `cryptoErrorCount > 100` (session degrading → next send likely to fail).

**Add:** In the campaign loop, before each send, check `cryptoErrorCount`. If > 100, mark `status="paused"` with `reason="session-degraded"` and exit.

### B6. Per-send socket-health check
The plan checks socket health "before each batch" but not "before each send". A 5-minute campaign can outlive the socket.

**Add:** Wrap each `await sock.sendMessage(...)` in a check: if `sock.ws.isClosed === true` or `sock.user == null`, pause the campaign.

### B7. De-duplication within recipient list
The UI allows pasting arbitrary numbers. The same number twice in the list will cause a duplicate send. Also: a customer may have multiple JIDs (e.g. the same phone on two devices — WhatsApp uses device-specific JIDs in some cases).

**Add:** A pre-flight `Set` deduplication in the Admin UI, and in the bot loop skip any JID already in the campaign's `sent` log.

### B8. Recipient-list CSV column detection
"Upload CSV/Excel" is in the wireframe but there's no column-detection logic. CSVs come in `Phone`, `phone`, `Mobile`, `mobile_no`, `Phone Number`…

**Add:** Smart column picker — auto-detect a column whose header matches `/phone|mobile|whatsapp|number/i` (case-insensitive). If multiple matches, show a dropdown. If none, fall back to the first column with valid 10-digit numbers.

### B9. Campaign concurrency lock
Nothing prevents the admin from starting Campaign A and Campaign B simultaneously. Two parallel loops on the same Baileys socket will trip WhatsApp's anti-spam harder.

**Add:** A `bot/{outlet}/promotions/lock` node with `{campaignId, acquiredAt}`. The bot only enters `runPromotionCampaign` if it can acquire the lock; otherwise it queues the second one.

### B10. Campaign cloning / duplication
Once an admin has a "winning" campaign, they'll want to re-use it next month with the new dates. The plan doesn't have a "Clone" action.

**Add:** A "📋 Duplicate" button on each row in the history list. Copies the campaign doc with a new ID and `status="draft"`.

### B11. CSV export of campaign results
The live log is good for a glance; for a post-mortem or for sharing with stakeholders, an admin will want to download the full per-recipient log.

**Add:** "⬇ Export CSV" button. The plan already has `xlsx.full.min.js` loaded at `Admin/index.html:87` — use it.

### B12. Failed-send retry policy
Currently one-shot. If a send fails (e.g. transient network blip), the number is marked `failed` and never retried.

**Add:** Up to **2 automatic retries** with a 5 s gap before marking `failed`. Reset retry counter on the first success.

### B13. Scheduled-campaign missed-window behaviour
If the bot is offline at the `runAt` time, the scheduled campaign will be picked up only on the next 5-min heartbeat tick (up to 5 min late). The plan should specify:

- A scheduled campaign with `runAt` < `now - 15 min` on pickup is **auto-cancelled** (it's too late).
- A scheduled campaign with `runAt` ≤ `now` and `now - runAt` ≤ 15 min is **executed immediately**.

### B14. Coupon-style tracking for the campaign itself
The plan calls the recipient-list selector "Custom (paste/upload)" but doesn't mention attaching a `couponCode` to the campaign. The `personalizeTemplate` table mentions `{couponCode}` but no UI to generate one.

**Add:** A "🎟 Generate coupon" toggle in the composer. When enabled, the bot generates a unique alphanumeric code per recipient (e.g. `FESTIVE-A4B7`) and stamps it in `{couponCode}`. The coupon codes are also written to a new `bot/{outlet}/promotions/coupons/{code}` node so the bot can later **redeem** them in a follow-up Discount feature (cross-link to the Discount plan).

### B15. Customer reply classification during a campaign
If a customer replies "👍" or "Order now" mid-campaign, the existing `messages.upsert` handler will treat it as a new conversation and start a new order flow. That's actually OK — but we should suppress the bot's automated greeting for people who just received a campaign within the last 24 h.

**Add:** Set `user.step = "RECENTLY_PROMOTED"` for 24 h after a campaign send; the START-state handler checks this and sends a shorter greeting.

### B16. Per-outlet isolation clarification
The codebase runs **two bots** (one per outlet). The Promotions plan should explicitly say: "one running campaign per outlet, not per process". The `bot/{outlet}/` prefix already enforces this; just call it out.

### B17. Campaign doc size limits
A recipient list of 500 phones ≈ 6–7 KB. The `commands/{cmdId}` node must stay under Firebase's 256 KB path limit. We're fine for ≤ 500 numbers, but if we ever raise the cap, we'd need to chunk into a `recipients/` sub-node.

**Add:** A note that the hard cap of 500 is also a Firebase-write-size safety.

### B18. Bilingual / i18n
The current bot messages are in English; the admin UI uses English. For an Indian restaurant in Bihar/UP, Hindi would be a big win.

**Add:** Tag every user-facing string in the new files with the existing `t('key', 'fallback')` helper from `Admin/js/l10n.js`. New keys: `promo.*`, `discount.*`.

### B19. Accessibility
`aria-label`, keyboard-focus, escape-to-close for the modals. The existing modals have some a11y; the new ones should match.

### B20. Mobile responsive tab
The Promotions tab on mobile should be touch-friendly (composer textarea should not zoom iOS on focus, buttons ≥ 44×44 px). The existing `mobile-overrides.css` should cover most of it, but the new tab should be smoke-tested.

---

## PART C — Missing in Discount Control Panel Plan

### C1. `AWAIT_COUPON` state in the bot
Same as A1, but with more design detail. Concretely:

```
CART_VIEW
   ↓ user picks "2" (proceed)
[if discounts include type=coupon]
   ↓
AWAIT_COUPON: "🎟 Have a coupon code? Reply with it, or type 0 to skip."
   ↓ (code or skip)
REUSE_PROFILE / NAME flow continues...
```

The new state needs:
- A new `couponCode` field on `user`.
- Validation against `discounts/*` (read RTDB, find by `couponCode`).
- A "✅ Coupon applied!" or "❌ Invalid coupon" response.

### C2. Tax / GST handling
The current `order.discount` is a single ₹ number applied to subtotal. The Indian tax regime: GST is calculated on the post-discount value (typically). The current code doesn't seem to compute GST at all (search confirms: no `gst`, `tax`, `cgst`, `sgst`, `igst` in `bot/index.js`).

**Add:** A note in the plan that discount currently applies pre-tax and we should add `gst` calculation as a **separate ticket**. Otherwise the plan silently assumes no tax.

### C3. Discount applies to delivery fee or not?
The bot does: `total = subtotal + deliveryFee - user.discount`. The plan's evaluator is called on `subtotal` only. Need to specify: **discount applies to food subtotal, not delivery fee** (this matches industry norm). Update the plan and the code.

### C4. Item-level vs order-level discounts
The plan is order-level only (subtotal-based). A common requirement: "₹50 off any Large Pizza". This is item-level.

**Add:** v1 = order-level only (subtotal/category/firstOrder/coupon). v2 = item-level. Document the deferral.

### C5. Refund policy
If a customer is refunded a discounted order, what happens to the `discountsUsage` record? Do we increment `usedCount` back down? Do we re-eligible the customer for `firstOrder`?

**Add:** A "Refund" section: on full refund, delete the `discountsUsage/{id}` row, decrement `stats.usedCount`, and (if it was a `firstOrder` discount) clear `customer.firstOrderDiscountUsed`. On partial refund: keep the usage but mark it.

### C6. Discount-eligible user check for the bot, with `orderCount` in the customer record
The bot's `customers/{phone}` is written **after** order placement (`bot/index.js:1882`). The plan says to check `firstOrderDiscountUsed` on the customer. But the FIRST order's evaluation happens before the record exists.

**Add:** For `firstOrder` discount, the eligibility check is: `!await getData(customers/{phone})`. If the record doesn't exist, the customer is new. After order placement, write the customer record with `firstOrderDiscountUsed: <now>` and `firstOrderDiscountId: <id>`.

### C7. Concurrent edits to a discount while it's being applied
Admin A edits "Festive 5%" → "Festive 7%" while Admin B's POS sale is mid-flight. The sale picks the old value, then the write-back to `stats` may conflict.

**Add:** Use `runTransaction` for the `stats.usedCount++` update. Already used elsewhere in the codebase (`pos.js:623, 657`).

### C8. Discount engine performance
Every order reads `discounts/*` (could be 50+ entries), filters, sorts. On a 100-order/min rush, this is 5K+ RTDB reads/min = 7.2M/day against the 50K/day Spark plan free tier.

**Add:** Cache `discounts/*` for 30 s in memory (server-side) and 60 s in the bot process. Already mentioned in the helper sketch but should be the **default**, not optional.

### C9. Discount previews in POS
Cashier is about to apply a manual discount of ₹100. The UI should show: "🪄 Auto-discount of ₹50 (Festive 5%) will also apply. Use it? Or override?"

**Add:** A live "Effective discount" indicator in the POS cart summary, recalculated on every cart change.

### C10. Coupon-code distribution
The plan defines coupons but doesn't say how customers learn the codes. Options:
- Print on the receipt.
- Send via promotional message (cross-link to Promotions plan).
- Admin prints flyers.
- Auto-generate per-customer codes and send on every order.

**Add:** A "Distribution" field per coupon-type discount: `distribution: "manual" | "per-customer-auto" | "include-in-promo"`. For `per-customer-auto`, the bot auto-generates a unique code and DMs it after every order.

### C11. Discount notification to customers
When a discount is activated that affects the customer (e.g. they had a cart abandoned 24 h ago, and a new "10% off" coupon just got enabled), should we proactively message them?

**Add:** Out of scope for v1. Document as a v2 feature (cross-link to Promotions plan).

### C12. Loyalty / tier-based discounts
Customers above a certain LTV get a permanent 5% discount. Common in food ERPs.

**Add:** v2 feature. Document: `type: "loyalty"`, `tier: "gold"`, `ltvThreshold: 5000`.

### C13. Buy-X-Get-Y
"Buy 2 pizzas, get 1 free". Requires line-item awareness.

**Add:** v2 feature. Out of scope for v1.

### C14. Pre-expiry admin warnings
3 days before "Festive 5%" ends, show a banner in the Discounts tab.

**Add:** Daily heartbeat in the Admin UI that flags discounts ending in < 72 h with a yellow "⏰ Expiring soon" pill.

### C15. Discount usage analytics
The plan tracks `usedCount` and `totalDiscountGiven` per discount. But not the **revenue impact** (i.e. "we gave away ₹2,310 → did it produce ₹8,000 in extra orders?").

**Add:** v2. Out of scope for v1, but plan should mention the `orders.discountId` index so we can later compute revenue impact.

### C16. Receipt & WhatsApp invoice: exact line to add
Plan says "show new line on receipt" but doesn't show the markup. The current line is at `Admin/receipt-templates.js:135`:
```js
${order.discount > 0 ? `<div class="summary-row"><span class="bold">Discount Allotted:</span> <span class="bold">-₹${Number(order.discount).toFixed(2)}</span></div>` : ''}
```
**Add:** Suggested replacement:
```js
${order.discount > 0 ? `
  <div class="summary-row">
    <span class="bold">Discount${order.discountLabel ? ' (' + order.discountLabel + ')' : ''}:</span>
    <span class="bold">-₹${Number(order.discount).toFixed(2)}</span>
  </div>
  ${order.discountSource ? `<div class="summary-row" style="font-size:10px;color:#888;"><span>Source: ${order.discountSource}</span></div>` : ''}
` : ''}
```

### C17. WhatsApp invoice: same change
The bot has three places that print a discount line:
- `bot/index.js:526` (in `formatOrderInvoice`)
- `bot/index.js:1110` (rider pickup notification)
- `bot/index.js:1176` (rider assignment)
- `bot/index.js:1249` (broadcast to riders)
- `bot/index.js:1942` (final customer invoice)

All five should be updated to include the `discountLabel` when present.

**Add:** Add a helper `formatDiscountLine(order)` to the bot that returns `🎁 Discount (Festive 5%): -₹50` or just `🎁 Discount: -₹50` if no label, and use it in all five places.

### C18. Failed `discountsUsage` write after successful order
If the order is saved but the usage audit write fails, we have an inconsistency.

**Add:** Best-effort retry (3x with 1 s gap) inside a try/catch. Log to console; do not throw. Same pattern as `deductInventoryStock` (`bot/index.js:383–422`).

### C19. Bot offline / first-read of `discounts/*`
If the bot is starting up and the first read of `discounts/*` fails (Redis hiccup, etc.), the evaluator returns `null` → no discount. The plan covers this. But the **converse** — if a customer's order arrives during a network blip — needs the same fallback. Confirm the helper's try/catch is broad.

### C20. Discount "max redemptions" per customer
The plan doesn't cap how many times a single customer can use a discount. A bug-prone customer could exploit `global` discounts infinitely.

**Add:** Optional `perCustomerLimit: <int>`. Tracked via a `discountsUsage` query at evaluation time.

### C21. Discount "max total redemptions"
Same as C20, but campaign-wide.

**Add:** Optional `globalLimit: <int>`. Compared to `stats.usedCount`.

### C22. Timezone for `startsAt` / `endsAt`
The plan doesn't say IST explicitly. The bot already uses `getISTDateInfo` (`bot/index.js:171`) for reports — we should use the same here for consistency.

**Add:** "All `startsAt` / `endsAt` stored as UTC ms. UI displays in IST using existing `getISTDateString` helper. Evaluation uses `Date.now()` UTC directly — no TZ math at evaluation time."

### C23. What about `stackable` semantics in detail?
Plan mentions `stackable: false` default but doesn't define what happens when true.

**Add:** When `stackable=true`, the evaluator sums all matching discounts. Cap at a new field `maxTotalDiscount` to prevent runaway. Document the math.

### C24. Subtotal = 0 or negative edge case
If subtotal is 0 (impossible at our price points, but defensive), `5% of 0 = 0`, so safe. If subtotal is **negative** (refund scenario, line-item voided), the discount becomes negative — that's nonsensical.

**Add:** In the evaluator: `if (subtotal <= 0) return null;`

### C25. Coupon re-use after `endsAt` passes
A coupon code is in the system. Admin extends `endsAt` from yesterday to next month. The code should immediately become valid again.

**Add:** No change needed (evaluator checks `now <= endsAt` every time). But document: "Coupon validity is recomputed at every order, not at first-use."

### C26. Discount on the order-invoice, in the admin dashboard
The admin's Orders tab should show the discount source so staff can explain to a confused customer.

**Add:** Update `orders.js` table to show a small pill: "Festive 5% Off" or "First-Order" or "Manual".

### C27. Bulk discount application
"Apply 10% off all in-flight abandoned carts right now". Useful operationally.

**Add:** v2. Out of scope for v1.

### C28. Discount "exclusivity groups"
"First-Order" and "Global" should never combine. The `stackable` flag handles pair-wise, but groups are cleaner.

**Add:** Optional `exclusiveGroup: "welcome"`. Only one discount per group can be active at a time.

---

## PART D — Cross-cutting / Process Gaps

### D1. No testing strategy
Neither plan has a section on testing. Recommend:
- **Unit tests** for `discount-evaluator.js` (pure logic, easy).
- **Integration tests** for `runPromotionCampaign` using a mock `sock` and a fake Firebase.
- **Manual test plan** documented for the cashier / admin.

### D2. No rollback plan
If a campaign goes rogue and starts spamming 10K customers, how do we stop it?
- The Pause/Stop buttons help, but a global "🔴 KILL ALL CAMPAIGNS" emergency button is missing.
- DB-level: an `enabled` flag at `bot/{outlet}/promotions/lock` that, when set to false, makes the bot ignore all queued commands.

**Add:** A "panic stop" that flips a global `KILL_SWITCH` flag the bot checks before every send.

### D3. No staff-facing documentation
The "How to use" modal is for the admin panel. The cashier also needs to know: "if you see this discount, you can override it, but the audit log will show it."

**Add:** A printable PDF / docs page covering the new discount behaviour for cashiers.

### D4. Firebase Spark plan cost
The Promotions `onValue` listener that powers the live progress bar is a persistent connection. On the free Spark plan (50K concurrent reads/day), this can blow the quota.

**Add:** Use `onValue` only when the Promotions tab is **active**. Detach the listener on tab switch (already the pattern in `ui.js` for other modules — see `cleanupRiders`, `cleanupInventory`).

### D5. Audit log of admin actions
"Which admin launched which campaign, and when?" — useful for accountability.

**Add:** Log every campaign `start / pause / resume / stop` action to the existing `logs/audit/{id}` node (the database rules already cover this).

### D6. Two-admins-editing-same-discount
Nothing prevents Admin A from editing "Festive 5%" while Admin B is reading it for an in-flight sale.

**Add:** Use `updatedAt` + a `version` field. Evaluator always reads the latest; the in-flight sale gets a snapshot at evaluation time. Document the eventual-consistency model.

### D7. Cross-outlet campaigns
The current code runs two bots (pizza, cake). A "Festive 5%" discount defined under `pizza/discounts/` should **not** apply to cake. The plan's schema is already outlet-scoped — just call it out so it doesn't get refactored later.

### D8. Versioning of the discount engine
When we change the evaluator logic next year (e.g. add loyalty tiers), old in-flight campaigns might give surprising results.

**Add:** Add `engineVersion: 1` to each `discounts/{id}` doc. Evaluator includes its version in the audit log so we can debug.

### D9. Rate-limiting the campaign UI
Nothing prevents a script from clicking "Start" 1000 times. The Firebase `commands/{id}` push already has its own key (auto-generated by `push`), so it's safe — but the UI should disable the Start button while a campaign is `running` for that outlet.

**Add:** Already implicit in the offline banner; extend to "in-campaign" state.

### D10. Privacy / consent
GDPR-style: we should record the consent timestamp. We do (each order's `createdAt`), but for **promotional sends** we don't have a record that the customer opted in.

**Add:** A `consent` field on each customer record. Set to `true` when the customer places their first order (implicit consent: "I gave you my number to receive order updates"). Promotional sends to customers with `consent !== true` are skipped.

---

## PART E — Minor / Style

- E1. The Promotions plan §6 says "exactly 2 s between sends" — this is the spec from the user. The plan should also expose a configurable delay (default 2000 ms).
- E2. The Discount plan §6 has a JavaScript snippet, but no TypeScript types. Consider adding JSDoc for IDE intellisense.
- E3. Both plans use emoji in code comments. Consistent with the existing codebase, but the `// ` comment in a `.js` file shouldn't be emoji-heavy.
- E4. The Promotions plan doesn't have a "test data" section. Add 3 sample campaigns (small / medium / large) for local testing.
- E5. The Discount plan's "New Discount" modal wireframe lists "Save Draft / Save & Activate / Cancel" — clarify: a `draft` discount is invisible to the evaluator.

---

## PART F — Quick Wins (low effort, high value)

| # | Item | Effort | Impact |
|---|---|---|---|
| 1 | Add `AWAIT_COUPON` step in bot | 30 min | Unlocks coupon redemption |
| 2 | Pre-flight `formatJid` dedup | 15 min | Prevents accidental double-sends |
| 3 | CSV column auto-detect | 20 min | Removes a 90 % support headache |
| 4 | "Send Test" button | 15 min | Admin confidence before bulk send |
| 5 | Kill-switch flag | 10 min | Insurance against runaway campaign |
| 6 | Quiet-hours guard | 10 min | Reduces WhatsApp ban risk |
| 7 | Resume on bot start | 30 min | Resilience |
| 8 | `usedCount` via `runTransaction` | 10 min | Concurrency safety |
| 9 | `discountLabel` in 5 invoice spots | 15 min | Visible to customer |
| 10 | `consent: true` on first order | 5 min | Privacy posture |

Total ≈ 3 hours of code, huge safety + UX win. Recommend doing these **before** the bulk of either feature is shipped.

---

## PART G — Recommended Update Order

1. **Update `Discount Control Panel Feature.md`** with the A1, A3, C1–C6 findings (state machine + eligibility + dead-code).
2. **Update `Promotion Page Plan.md`** with the A2, A3, B1–B6 findings (footer, resume, test mode, quiet hours, media, retries).
3. **Add a "Quick Wins" section** at the top of each plan, calling out items from Part F that should be done first.
4. **Add a "Testing & Rollback" section** (D1, D2) to both plans.
5. **Re-verify with the user** before implementation starts.

---

## PART H — Items to Discard

Some ideas in the original plans are over-engineered for v1. Defer to v2:
- H1. Per-customer `dailyLimit` (no one needs this yet)
- H2. A/B testing variants (premature)
- H3. Item-level discounts (real but not now)
- H4. Loyalty tiers (real but not now)
- H5. Buy-X-Get-Y (real but not now)
- H6. Multi-code coupons (premature)
- H7. Coupon distribution via abandoned-cart triggers (premature)

Keep the data model **extensible** so these can land later without schema migration.

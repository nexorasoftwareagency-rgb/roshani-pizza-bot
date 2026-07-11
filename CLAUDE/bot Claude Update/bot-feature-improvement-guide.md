# Roshani Bot — Improvement Guide: From Script to Production System

Based on what your `bot/` folder actually does today: `index.js` (order flow engine), `discount-engine.js`,
`promotions.js`, `reports.js`, `rider.js`, `utils.js`, `firebase.js`. Organized by module, then cross-cutting
upgrades that apply to all of them, plus a section covering the wider system (`database.rules.json`,
`Admin/js/`, `shared/`) since the second audit round surfaced real issues there too.

You're already doing several things most bots skip — opt-out tracking, quiet hours, a promo kill switch,
campaign locking, and resumable "stuck" promotions. This guide builds on that foundation rather than
starting from zero.

> **Re-audited twice.** Round 1: commits `2bacf98`→`903f5f7` (Baileys 6.17.16 → 7.0.0-rc13 upgrade, aimed
> at fixing the LID delivery issue from our earlier debugging session). Round 2: a 20-item audit from 3
> parallel agents covering the full repo, independently verified line-by-line — 7 confirmed real, 3
> confirmed false positives, the rest lower-priority or needing product decisions. Full before/after code
> for every confirmed item is in `code-changes-before-after.md`; this file focuses on what it means for
> each module and what to prioritize.

---

## 1. Core Order Flow (`index.js`)

**What it does:** state machine (`CATEGORY → DISH → SIZE → QUANTITY → ADDED_TO_CART`), cart management,
admin command listener on `bot/{outlet}/commands`.

**Update on the `@lid` delivery issue from our earlier debugging session:** Baileys was upgraded from
6.17.16 to 7.0.0-rc13 specifically to fix LID routing (per the commit message: "Baileys 7.x has robust LID
routing — lidMapping, USyncQuery, session validation"). This is the right move and should genuinely fix it.
Two loose ends worth closing: (1) confirm with the real customer whether `@lid` replies are landing now —
don't just trust `[SEND OK]` in the logs, since that was true before the upgrade too and the customer still
didn't receive the message; (2) a `normalizeJid`/`lidJidMap` utility was added as a fallback but never
actually wired into the send path — see `code-changes-before-after.md` §7 for the two ways to resolve that.

**Confirmed bug (Round 2, highest priority in this section):** the order-placement success path ends with
`return null;` inside the message-handling IIFE, intended to signal "clear this session, fresh start next
message." That return value is never captured by the outer scope, so it does nothing — the session is
saved as-is afterward, with stale `step`/`cart` state intact. A customer's very next message after a
completed order can land back inside checkout logic instead of starting fresh. Two-line fix in
`code-changes-before-after.md` §R2 — capture the IIFE's return value and branch the final `saveSession`
call on it.

**Where it can go further:**

- **Session TTL.** Abandoned carts (`user.step` stuck mid-flow) should expire after N minutes of inactivity
  and reset to `START`, both to free Redis memory and so a customer returning after a day doesn't land in a
  stale, confusing mid-order state. Same root cause as the R2 bug above — sessions currently never expire
  or reset except by explicit code paths, and one of those paths turned out to be broken.
- **Message queueing instead of drop-on-disconnect.** Still open. Note this is separate from the session
  *persistence* fallback that was added since this guide was first written — `index.js` now keeps an
  in-memory `localSessionCache` alongside Redis, so a customer's conversation state survives a Redis blip.
  That protects the *state*, not the *messages* — if the socket is down when a message arrives, it's still
  simply lost. Queue inbound events (even a simple Redis list) and drain the queue on `connection.update` →
  `open`, so nothing is lost during a reconnect window.
- **Idempotent order creation.** If a customer double-taps or a webhook retries, make sure order writes are
  keyed by a client-generated idempotency key, not just a timestamp — prevents duplicate orders from
  network hiccups.
- **Structured state transitions.** The current `if (user.step === "X")` chain works, but as you add steps
  it gets harder to reason about. Consider a small explicit state-transition table (`{from, event} -> {to, handler}`)
  so invalid transitions are caught centrally instead of scattered `sendInvalidInputHelp()` calls. This
  would also have made the R2 bug structurally impossible — an explicit "clear" transition instead of a
  return-value convention that's easy to silently break.
- **Correlation IDs in logs.** Tag every log line for a single customer interaction with a short request ID
  so you can `grep` one conversation's full lifecycle instead of interleaving all customers' logs (this
  would have made our `@lid` debugging session much faster).

---

## 2. Discount Engine (`discount-engine.js`)

**What it does:** evaluates best-fit discount, validates coupon codes, records usage.

**Confirmed bug (still the #1 priority across both audit rounds):** `evaluateDiscount`'s `globalLimit`
check reads a 30-second-cached `usedCount` from `getAllDiscounts()`, while the actual atomic increment
happens later in `recordDiscountUsage`'s Firebase transaction. Two customers redeeming a `globalLimit: 1`
coupon within that window can both pass the cap check. Full fix (moving the cap check inside the same
transaction as the increment) is in `code-changes-before-after.md` §5 — this is real money, fix it first.

**Where it can go further:**

- **Abuse detection.** Log discount usage per phone number and flag/rate-limit repeat redemption of the same
  single-use coupon from device-hopping or number-cycling abuse.
- **Discount audit trail.** You're already calling `recordDiscountUsage` — make sure it's queryable per
  campaign (total discount given, redemption count, conversion rate) so promotions can be evaluated on ROI,
  not just "did it send."
- **Expiry pre-check caching.** `getAllDiscounts` is likely called per customer interaction — cache active
  discounts in Redis with a short TTL (60–120s) rather than hitting Firebase on every cart evaluation. Note:
  this is the same cache that's implicated in the race condition above — the cache itself isn't the bug,
  the missing atomic cap-check is, so don't remove the cache as a "fix," just add the transaction guard.

---

## 3. Promotions (`promotions.js`)

**What it does:** campaign sending with retry, opt-out/consent checks, quiet hours, kill switch, locking,
resumable stuck campaigns, scheduled pickup, log expiry. This is the most mature module in the codebase.

**Where it can go further:**

- **WhatsApp ban-risk pacing.** `sendWithRetry` handles per-message retry, but for bulk campaigns the bigger
  risk is WhatsApp rate-limiting or banning the number for bulk-messaging patterns. Add randomized jitter
  between sends (not fixed intervals) and a daily send cap per number, separate from per-message retry logic.
- **Template compliance.** If you ever move to the official WhatsApp Business API (Cloud API) instead of
  Baileys for promotional (non-session) messages, you'll need pre-approved message templates — Baileys
  sends as a "personal" session which is more ban-prone for outbound marketing at scale. Worth planning the
  migration path now, even if you don't execute it yet.
- **Consent re-verification.** `hasPromoConsent`/`isOptedOut` — make sure opt-outs propagate instantly (not
  just checked at campaign start) in case someone opts out mid-campaign-run.
- **Campaign metrics dashboard.** You already log results via `logPromoResult`/`logPromoSkip` — surface
  delivered/skipped/failed counts back to the admin in a single command or dashboard card instead of only
  in raw Firebase logs.
- **Dead-letter handling.** `resumeStuckPromotions` recovers stuck campaigns — add a cap on resume attempts
  so a permanently-broken campaign doesn't retry forever; move it to a "failed" state after N resume
  attempts and alert an admin.

---

## 4. Reports (`reports.js`)

**What it does:** daily/weekly/monthly sales reports via WhatsApp.

**Confirmed bugs (Round 2):**
- **Revenue under-reported on comma-formatted totals.** `outletRevenue += parseFloat(order.total || 0)` —
  `parseFloat('1,234')` returns `1`, not `1234`, if `order.total` is ever a comma-formatted string anywhere
  in the pipeline. Silent, no error thrown — the report just quietly shows the wrong number. One-line fix
  in `code-changes-before-after.md` §R1.
- **Loads the entire order history on every run.** `getData(\`${OUTLET}/orders\`)` fetches every order ever
  placed, then filters to the target day in JS. Gets slower and more memory-hungry every month you're in
  business. Fix uses the existing `createdAt` index to query only the relevant day server-side — §R15/§15
  in the code doc.

**Where it can go further:**

- **Failure alerting.** If `sendDailyReport` throws (Firebase timeout, empty data, etc.), does anyone find
  out? Wrap the scheduled call so a failure pings the admin directly ("Daily report failed to generate — check logs"),
  not just a console error no one reads until asked.
- **Report backfill.** If the bot was down when a scheduled report should have fired, add a catch-up check
  on startup: "was today's report already sent? If not and it's past report time, send it now."
  Handled poorly. Given restarts happen often (per our earlier debugging), this is a real gap.
- **Export beyond WhatsApp text.** For monthly reports especially, a CSV/PDF attachment (you already have
  the `pdf`/`xlsx` skills available in this environment if you want me to build that) is far more useful for
  actual bookkeeping than a WhatsApp text message that scrolls away.

---

## 5. Rider (`rider.js`)

**What it does:** pickup notification, assignment notification, broadcast pickup-available to riders.

**Where it can go further:**

- **Assignment timeout/escalation.** If `broadcastPickupAvailable` goes out and no rider accepts within
  N minutes, escalate — re-broadcast wider, or alert an admin to manually assign. Right now a silent "no
  one responded" looks identical to "no one available."
- **Idempotent acceptance.** If two riders tap "accept" near-simultaneously, make sure assignment is an
  atomic Firebase transaction so the order can't double-assign.
- **Rider load balancing.** If you have more than a couple of riders, track active-order-count per rider and
  bias broadcast/assignment toward whoever's free, rather than pure broadcast-to-all-and-first-response.
- **Delivery confirmation loop.** Notify the customer when the rider is assigned and again when marked
  delivered — closing the loop reduces "where's my order" messages back into the bot.

---

## 6. The Wider System (`database.rules.json`, `Admin/js/`, `shared/`) — new in Round 2

The first audit round only looked at `bot/`. The second round covered the full repo and found real issues
outside it — worth tracking here even though they're not in `bot/`, since they affect the same orders and
customers the bot serves.

**Security rules (`database.rules.json`):**
- `tableSessionsContact` is writable by anyone with no auth check (only a shape validation) — genuine PII
  exposure for dine-in customer contact info. Fix in `code-changes-before-after.md` §R4/§12 — test in
  Firebase's Rules Simulator before deploying, it's the riskiest rules change proposed.
- `tableSessions` and `discounts` are world-readable. `discounts` being public may be an intentional
  tradeoff (client-side coupon validation) rather than a bug — see §R5/§13 for the reasoning either way.
- `admins_list`/`errorLogs` have no rules at all — sounds alarming, actually means they're locked down by
  Firebase's default-deny. Worth confirming nothing in the app actually depends on writing to them (if so,
  those writes are failing silently right now — a functionality bug, not a security one).

**Admin dashboard (`Admin/js/`):**
- `_printBillForGroup` (in `features/tables.js`) hardcodes `discount: 0` on printed dine-in group bills,
  ignoring any actual discount applied to the underlying orders — staff could be printing bills that don't
  match what the customer was actually charged. Fix in §R6/§9.
- Dine-in orders may never trigger stock deduction for QR-placed orders specifically (staff-entered POS
  sales are excluded by design, assumed to deduct at sale time — but QR orders might fall through both
  paths). Needs one verification step before the fix is safe to apply — see §R9/§10.
- No refund/reversal path once `markAsPaid` is called — a payment mistake currently has no undo. This is a
  feature gap more than a bug; worth a product conversation about what a refund flow should look like
  (partial refunds? full only? does it reverse stock deduction?) before building it.

**Shared code (`shared/`) and menu app (`menu/js/`):**
- `shared/order-status.js`'s `STATUS_SEQUENCES['Dine-in']` is missing `'Placed'` as the first step — this
  is the confirmed §R3/§4 bug from the priority list below, and it's cross-confirmed by `menu/js/ui.js`
  independently defining its *own* Dine-in step list that already assumes `'Placed'` exists. Two
  hand-maintained copies of the same sequence, disagreeing with each other — once the shared one is fixed,
  worth having `ui.js` import from it instead of keeping a second copy that can drift again.
- `shared/audio/player.js`'s continuous-beep loop creates a new `Audio` object every tick instead of
  reusing one — minor, low priority, one-line fix available (§R8/§18 equivalent in the code doc).
- `shared/firebase-config.js` has an empty `fcmServerKey` — leave it empty. Filling it with a real value
  would put a fully-privileged push-notification credential into every customer's browser. If push
  notifications are needed, build them server-side using the same Admin SDK credentials the bot already has.

---

## 7. Cross-Cutting: What Actually Separates This From "a Script"

- **Observability.** Replace scattered `console.log` with structured logging (pino, which you already have
  as a dependency) at consistent levels, and ship logs somewhere queryable (CloudWatch Logs is free-tier
  friendly on EC2) instead of relying on `pm2 logs` tailing during an incident.
- **Health checks.** Expose a tiny HTTP endpoint (even just `http.createServer` on a spare port) returning
  `{ whatsapp: connected, redis: connected, firebase: connected, uptime }`. Pair it with an uptime monitor
  (UptimeRobot, or a CloudWatch alarm) that pages you the moment the socket drops, instead of finding out
  from a customer complaint.
- **Secrets management.** `service-account.json` and `.env` currently live as plain files on the EC2 disk.
  Moving credentials to AWS Secrets Manager or SSM Parameter Store (with an IAM role on the instance) means
  a compromised disk snapshot doesn't leak Firebase admin credentials directly.
- **Session backup.** `session_data_pizza/` is the one thing that, if lost, requires a full QR re-scan and
  bot downtime until someone's physically available to scan it. Cron a nightly encrypted backup of that
  folder to S3.
- **Staging environment.** Right now all testing happens on the live number against real customers (as in
  our debugging session). A second WhatsApp number + separate PM2 app + separate Firebase path as a staging
  environment would let you test Baileys upgrades, discount logic, etc. without risking the production
  channel.
- **Automated tests for the state machine.** The `CATEGORY → DISH → SIZE → QUANTITY` flow is pure logic once
  you abstract it from the socket — a small Jest/vitest suite feeding fake inputs through the step handlers
  would catch regressions (like the Firebase `undefined` bug) before they hit production.
- **Multi-outlet scaling.** `pizza-bot` and `cake-bot` currently run as two separate PM2 processes from the
  same codebase. If you add a third outlet, plan now whether that stays "one PM2 app per outlet" (simple,
  but N processes to babysit) or moves to one process handling multiple `OUTLET` values with per-outlet
  session/Redis namespacing (more complex, but scales cleaner past 4–5 outlets).
- **Version-pin discipline.** Keep `package.json` and the installed version in lockstep (we caught a drift
  between pinned `6.13.0` and installed `6.17.16` this session) — run `npm outdated` as a routine check, not
  just when something's broken.

---

## Suggested priority order (updated — Round 2)

Section 6 above has the full context; this is the actionable order. Two of the original audit's seven
"critical" items turned out to be false positives on verification (an `.indexOn` claim and a rider
security-rule claim) — worth knowing in case those specific concerns come up again elsewhere.

1. Discount coupon race condition (§2 above / Round 1) — still the highest-priority live financial bug
2. **Order session not clearing after checkout** (§1 above / R2) — customers can land back in stale
   checkout state after a completed order; similar severity to #1
3. **Revenue report `parseFloat` comma bug** (§4 above / R1) — cheap fix, directly affects numbers ownership sees
4. **Dine-in orders missing `'Placed'` status** (§6 above / R3) — confirmed via two independently-written
   files disagreeing with each other; breaks order-tracking progress display today
5. **`tableSessionsContact` open write rule** (§6 above / R4) — real PII exposure, but test the fix in
   Firebase's Rules Simulator before deploying, it's the riskiest change in this round
6. Confirm the `@lid` fix with the real customer, decide the fate of unused `normalizeJid` (§1 above / Round 1 carryover)
7. Structured logging + health-check endpoint (§7 below)
8. Session folder backup to S3 (§7 below)
9. Rider atomic-transaction fixes, report failure alerting, staging environment (§5, §4, §7)

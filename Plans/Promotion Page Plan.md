# Promotion Page Plan — Roshani ERP

**Status:** Researched, refined after self-review, awaiting implementation
**Target branch / module:** Admin dashboard + WhatsApp bot (Baileys)
**Created:** 2026-06-02 · **Last refined:** 2026-06-02
**Companion docs:** `Discount Control Panel Feature.md` (sister feature), `Review and Improvements.md` (audit trail of what was added in this revision)

---

## 1. Research Summary

### A. Competitor Analysis
| Feature | FoodChow | Odoo | Zoko/Authkey | Our Plan |
|---|---|---|---|---|
| Custom message templates with variables | ✅ | ✅ | ✅ | ✅ |
| Bulk number upload (CSV/Excel/paste) | ✅ | ✅ | ✅ | ✅ |
| Auto-pick from existing customer DB | ✅ | ✅ | ✅ | ✅ |
| Per-send delay (throttling) | ✅ | ✅ | ✅ | ✅ (2 s default, configurable) |
| Live progress + log | ✅ | ✅ | ✅ | ✅ |
| Personalization tokens | ❌ | ✅ | ✅ | ✅ |
| Schedule / send-now | ✅ | ✅ | ✅ | ✅ (both) |
| In-page "How to use" guide | ❌ | ❌ | ✅ | ✅ |
| Test / sandbox send | ❌ | ❌ | ✅ | ✅ |
| Image / media in template | ❌ | ✅ | ✅ | ✅ (v1) |
| Resume after bot restart | ❌ | ✅ | ❌ | ✅ |
| Coupon-code generation per recipient | ❌ | ✅ | ✅ | ✅ (optional) |

### B. WhatsApp Baileys Bulk-Sending Insights
- **Unofficial Baileys** = personal WhatsApp account, **not** the official W-API. Sending too fast will get the number banned.
- Recommended safe pacing: **2–8 s** between messages. 2 s is fine for ≤ 100 recipients.
- Pause **5 min every ~100 messages** (we'll do 30 s every 50 — lighter touch).
- Always include **STOP / opt-out** instruction.
- Personalize using variables — copy-paste blasts trigger spam filters.
- Clean inactive numbers; track failed deliveries.

### C. Current Codebase Insights
- **Bot** (`bot/index.js`) already uses `@whiskeysockets/baileys` v6.13 and exposes `sock.sendMessage(jid, {text})` and `formatJid(phone)`. The same socket can be reused — no new dependencies.
- **Firebase RTDB** already powers a real-time `bot/commands` channel (`initCommandListener` at line 235). We can **push a `SEND_PROMOTION` command** from the Admin UI → the bot picks it up → walks the recipients with a 2 s delay and writes logs back to `bot/promotions/logs/{campaignId}`. Same pattern as daily reports.
- **Admin UI** is a tab-based SPA. New pages follow the convention `Admin/js/features/<name>.js`.
- **Customer data** lives in `{outlet}/customers/{phone10}` — easy source for "existing customer numbers".
- **Sidebar under new "Marketing" group** — not bottom-nav (to keep mobile nav lean).
- ⚠️ **Critical:** Every bot message runs through `appendContactInfo()` (`bot/index.js:344`) which adds "If you have any Doubt Contact Admin: 9876543210" as a footer. **Promotional messages must bypass this** — see §7.E.
- ⚠️ **Critical:** The bot's in-memory counters (`reconnectAttempts`, `cryptoErrorCount`) reset to 0 on every reconnect (`bot/index.js:1388–1404`). Any running campaign must be **resumable from RTDB on `startBot()`** — see §7.F.
- ⚠️ **Critical:** The bot is single-outlet per process. Each outlet's bot is a separate Node process. **One running campaign per outlet, not per process** — see §7.G.

---

## 2. Scope
1. New **Promotions** page (sidebar + tab).
2. **Custom message templates** typed, saved, and re-used.
3. **2-second gap** between messages during bulk sending (configurable, default 2000 ms).
4. **Reminder messages** for customers (e.g. "We miss you", festival greetings).
5. **Top-left "How to use" icon** → opens a **6-step Guide modal**.
6. **Two recipient sources**: (a) bulk paste/upload, (b) existing customer database with filters.
7. **Control panel** for the bot campaign (start / pause / live progress / stop).
8. **Send-now + scheduled** campaigns.
9. **Disable + banner** when WhatsApp bot is offline.
10. **Full STOP opt-out** handler (with START to re-opt-in).
11. **Test / sandbox send** to admin's own number before bulk.
12. **Optional image attachment** in the template.
13. **CSV column auto-detection** for the upload flow.
14. **Resume after bot restart** (RTDB-driven, idempotent).
15. **Concurrency lock** (only one active campaign per outlet).
16. **Campaign cloning** for repeat promotions.
17. **CSV export of results** for post-mortem / sharing.
18. **Quiet-hours guard** (default 10:00–21:00 IST).
19. **Failed-send retry** (2 automatic retries, 5 s gap).
20. **Per-recipient dedup** (no number sent twice).
21. **🛑 Emergency kill-switch** at `bot/{outlet}/promotions/lock`.
22. **Per-send socket-health check** (`sock.ws.isClosed`, `sock.user == null`).
23. **Per-send crypto-error auto-pause** if `cryptoErrorCount > 100`.
24. **Admin audit log** (who started/paused/stopped what) using existing `logs/audit/`.

---

## 3. Architecture

```
┌──────────────────────┐                    ┌──────────────────────────┐
│  ADMIN DASHBOARD     │   push command     │  WHATSAPP BOT (Baileys)  │
│  Promotions tab      │ ─────────────────▶ │  initCommandListener()   │
│  features/           │  bot/{outlet}/     │  + new                   │
│  promotions.js       │  commands/         │  handlePromotionCampaign()│
│                      │  {id}              │                          │
│  • compose template  │                    │  • walks recipient list  │
│  • pick recipients   │                    │  • await sleep(2000)     │
│  • start campaign    │                    │  • sock.sendMessage()    │
│  • live progress     │ ◀───────────────── │  • writes status to      │
│    (RTDB onValue)    │   RTDB logs/       │    bot/promotions/logs/  │
└──────────────────────┘   progress/        └──────────────────────────┘
```

### Firebase RTDB Schema
```
bot/
  {outlet}/
    commands/
      {cmdId}/
        action: "SEND_PROMOTION"
        campaignId: "PROMO-1709123456-AB12"
        template: "Hello {name}! 🎉..."
        mediaUrl: <optional image url>
        recipients: ["919876543210", ...]   ← pre-deduped by Admin UI
        delayMs: 2000
        generateCoupons: false              ← if true, bot generates {couponCode} per recipient
        quietHours: { start: 22, end: 9 }   ← IST 24h
        runAt: <ts>                         ← for scheduled
        requestedBy: "admin@..."
    promotions/
      campaigns/
        {campaignId}/
          name, template, mediaUrl, recipientsCount, createdBy,
          createdAt, status: "queued|running|paused|done|stopped|scheduled",
          totalSent, totalFailed, currentIndex,
          startedAt, completedAt, runAt,
          audit: [{ at, by, action, note }]   ← admin actions
      logs/
        {campaignId}/
          {phone}/ { jid, status: "sent|failed|skipped", sentAt, error? }
      templates/
        {templateId}/ { name, body, mediaUrl?, createdAt }
      optout/
        {jid}/ { optedOutAt, phone, reOptInAt? }
      coupons/
        {code}/ { campaignId, recipientPhone, generatedAt, redeemed? }
      lock:                                 ← concurrency lock
        { campaignId, acquiredAt, acquiredBy } | null
      killSwitch: false                    ← global emergency stop
```

### Customer schema touch
```
customers/{phone}/
  + promotionalConsent: true               ← set on first order; required for promo sends
```

### Database rules (delta)
Add to `database.rules.json` under both `$outletId` blocks:
```json
"promotions": { /* under bot/ — inherits existing 'bot' rule */ }
```
The existing `bot` rule (line 45–48) already covers any new sub-nodes we add under `bot/{outlet}/promotions/*`. **No rule change needed.**

---

## 4. Pre-Flight Must-Haves (Quick Wins — ship first)

These 10 items are low-effort, high-value, and prevent the most common disasters. Ship them **before** the bulk of the feature.

| # | Item | Effort | Why it matters |
|---|---|---|---|
| 1 | Suppress `appendContactInfo` footer for promo sends | 5 min | Without this, every promo ends with "If you have any Doubt Contact Admin" — unprofessional |
| 2 | Pre-flight `Set` dedup of pasted numbers | 15 min | Prevents accidental double-sends |
| 3 | CSV column auto-detect (`/phone|mobile|whatsapp|number/i`) | 20 min | CSVs come in many shapes |
| 4 | "🧪 Send Test" button → admin's own number | 15 min | Admin confidence before bulk |
| 5 | Global `killSwitch` flag + UI panic button | 10 min | Insurance against runaway campaign |
| 6 | Quiet-hours guard (default 10:00–21:00 IST) | 10 min | Reduces WhatsApp ban risk |
| 7 | Resume on `startBot()` from `status="running"` | 30 min | Bot restart = zero campaign loss |
| 8 | `runTransaction` for `stats.usedCount` (cross-ref Discount plan) | 10 min | Concurrency safety |
| 9 | Admin audit log on start/pause/resume/stop/kill | 15 min | Accountability (uses existing `logs/audit/`) |
| 10 | `promotionalConsent: true` written on first order | 5 min | Privacy posture; campaigns skip non-consented |

**Total:** ~2.5 hours. Do these in one sitting before opening the rest of the feature work.

---

## 5. Files to Touch

### NEW
| File | Purpose |
|---|---|
| `Admin/js/features/promotions.js` | Composer + recipient builder + campaign launcher + live progress subscriber + scheduled-job manager. |
| `Admin/js/features/promotions-guide.js` | Renders the 6-step guide content into the modal. |

### EDIT
| File | Change |
|---|---|
| `Admin/index.html` | (1) New sidebar `<li id="menu-promotions">` under new `<li class="nav-group-label">Marketing</li>`. (2) New `<div id="tab-promotions" class="tab-content hidden">`. (3) New `<div id="promotionsGuideModal" class="modal">`. (4) New offline banner inside the tab. (5) New top-left "How to use" button in the panel header. (6) New "🛑 Kill All" panic button (hidden by default, revealed after a campaign starts). |
| `Admin/js/ui.js` | Add `case 'promotions':` to the `switch (tabId)` block. Update mobile title. |
| `Admin/js/main.js` | Click handlers for `data-action="openPromotionsGuide"`, `sendTestPromo`, `killAllCampaigns`, `cloneCampaign`, `exportPromoCSV`. |
| `Admin/js/state.js` | Add `state.promotions = { activeCampaignId, scheduledCampaigns, recipientsCache, liveProgress }`. |
| `bot/index.js` | (1) `SEND_PROMOTION` branch in `initCommandListener`. (2) `runPromotionCampaign(sock, cmd)` — resumable, retried, quiet-hour-aware. (3) `personalizeTemplate(tpl, phone, campaignId)` helper. (4) `STOP`/`START` opt-out branch in `messages.upsert`. (5) Scheduled-job executor + resume-on-startup in `startBot()`. (6) 30-day log expiry in the 5-min heartbeat. (7) New `sendPromotionalMessage(sock, jid, text, mediaUrl)` that **bypasses `appendContactInfo`** and adds an opt-out footer. (8) Honor `killSwitch` flag before every send. |
| `Admin/style.css` *(or new `promotions.css`)* | Styles for composer, recipient picker, progress bar, sent/failed pill badges. |

### UNCHANGED
- `database.rules.json` — new paths inherit existing `bot` rule.
- `bot/package.json` — no new deps.

---

## 6. UI Wireframe

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [❔ How to use]                PROMOTIONS  ·  PIZZA OUTLET              │
│  📣 Send bulk campaigns & reminders via WhatsApp      [+ New Campaign]  │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌── COMPOSE ──────────────────┐  ┌── RECIPIENTS ───────────────────────┐ │
│ │ Campaign Name: [_________]  │  │ Source: ◉ All Customers            │ │
│ │ Attach Image: [📎 Optional] │  │         ○ Customers with orders   │ │
│ │ Message:                     │  │         ○ Inactive > 30 days      │ │
│ │ ┌────────────────────────┐  │  │         ○ Custom (paste/upload)   │ │
│ │ │🎉 Hi {name}!          │  │  │                                   │ │
│ │ │Flat 20% OFF today on   │  │  │ [Paste numbers: one per line]     │ │
│ │ │all Pizzas 🍕           │  │  │ [📁 Upload CSV/Excel]            │ │
│ │ │Reply STOP to opt-out   │  │  │ Preview: 142 numbers (142 valid)  │ │
│ │ └────────────────────────┘  │  │ ☑ Skip customers without consent  │ │
│ │ Tokens: {name} {phone} {lastOrderDate} {storeName} {couponCode}   │      │ │
│ │ [💾 Save Template] [📋 Templates]    │ [Deselect All] [Select All]   │ │
│ │ Settings: ◉ Send-now  ○ Schedule (date+time)                          │ │
│ │ Quiet hours: [10:00] → [21:00] IST (default)                          │ │
│ │ [🎟 Generate per-recipient coupon codes]                                │ │
│ │ [🧪 Send Test to Me] [👁 Preview] [🚀 START CAMPAIGN]                  │ │
│ └──────────────────────────────┘  └───────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌── LIVE CONTROL PANEL ───────────────────────────────────────────────┐ │
│ │ 🟢 Campaign RUNNING — 87 / 142 sent   [🛑 KILL ALL]                 │ │
│ │ [▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱] 61%   ✅ 85  ❌ 2   ⏱ ETA: 1m 50s          │ │
│ │ [⏸ Pause] [⏹ Stop]   Next: 1.4 s → 919876543213                     │ │
│ │ Phone          Status    Time   Error                                 │ │
│ │ 9198765•••     ✅ sent   10:32:14 —                                  │ │
│ │ 9198765•••     ❌ failed 10:32:16  (invalid)                          │ │
│ │ [⬇ Export CSV]                                                       │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│ [📋 Scheduled (1)] [📁 History (12)]                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

### "How to use" modal (top-left `?` icon)
6 numbered steps: ✍️ Compose → 👥 Pick recipients → 👁 Preview → 🚀 Send/Schedule → 📊 Monitor → 🛡 Stay safe.

---

## 7. Bot-Side Implementation Details

### A. `runPromotionCampaign(sock, cmd)` — happy path
```js
async function runPromotionCampaign(sock, cmd) {
  const { campaignId, template, recipients, delayMs = 2000, mediaUrl, generateCoupons, quietHours, runAt } = cmd;
  const ref = db.ref(`bot/${OUTLET}/promotions`);
  const startIndex = (await get(ref.child(`campaigns/${campaignId}/currentIndex`)).once('value')).val() || 0;

  for (let i = startIndex; i < recipients.length; i++) {
    // 1. Honor kill-switch
    if (await isKillSwitchOn()) { await markPaused(campaignId, 'kill-switch'); return; }

    // 2. Honor quiet hours (sleep until quiet hours end)
    await sleepThroughQuietHours(quietHours);

    // 3. Socket + session health
    if (isSocketDead(sock) || cryptoErrorCount > 100) {
      await markPaused(campaignId, 'session-degraded');
      return; // resume-on-startup will pick this up later
    }

    // 4. Honor concurrent-campaign lock
    if (!await acquireLock(campaignId)) return;

    // 5. Honor opt-out list
    const phone = recipients[i];
    const jid = formatJid(phone);
    if (!jid) { await logSkip(campaignId, phone, 'invalid-jid'); continue; }
    if (await isOptedOut(jid)) { await logSkip(campaignId, phone, 'opted-out'); continue; }
    if (!await hasPromoConsent(phone)) { await logSkip(campaignId, phone, 'no-consent'); continue; }

    // 6. Personalize
    const couponCode = generateCoupons ? generateCouponCode() : null;
    const text = await personalizeTemplate(template, phone, campaignId, couponCode);

    // 7. Send with retry
    const result = await sendWithRetry(sock, jid, text, mediaUrl, 2);
    await logResult(campaignId, phone, jid, result, couponCode);

    // 8. Persist progress every 10 sends (heartbeat)
    if (i % 10 === 0) await ref.child(`campaigns/${campaignId}`).update({ currentIndex: i + 1 });

    // 9. 30s pause every 50 sends (human pacing)
    if ((i + 1) % 50 === 0) await sleep(30_000);
    else await sleep(delayMs);
  }

  await markDone(campaignId);
}
```

### B. `sendWithRetry(sock, jid, text, mediaUrl, maxRetries)`
- 3 attempts max, 5 s gap.
- Each attempt wraps in `try/catch`.
- After max retries, return `{ ok: false, error: <message> }`.
- Caller (A.7) writes to log.

### C. `personalizeTemplate(tpl, phone, campaignId, couponCode)`
Replaces:
- `{name}` → `botUsers/{jid}.name` → `customers/{phone}.name` → "Customer"
- `{phone}` → the phone number
- `{lastOrderDate}` → `customers/{phone}.lastOrderDate` (formatted) → "first time"
- `{storeName}` → `settings/Store` `storeName`
- `{couponCode}` → `couponCode` (or empty if not generated)

### D. STOP / START opt-out (in `messages.upsert` handler)
```js
const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();
if (/^(stop|unsubscribe|opt[\s-]?out)$/i.test(text) && !isAuthorized) {
  await db.ref(`bot/${OUTLET}/promotions/optout/${sender}`).set({ optedOutAt: Date.now(), phone });
  await sock.sendMessage(sender, { text: "You've been unsubscribed from promotional messages. Reply START to opt back in." });
  return;
}
if (/^start$/i.test(text) && await db.ref(`bot/${OUTLET}/promotions/optout/${sender}`).once('value').then(s => s.exists())) {
  await db.ref(`bot/${OUTLET}/promotions/optout/${sender}`).update({ reOptInAt: Date.now() });
  await db.sendMessage(sender, { text: "✅ You're re-subscribed." });
  return;
}
```

### E. `sendPromotionalMessage(sock, jid, text, mediaUrl)`
Bypasses `appendContactInfo`. Always appends a clean opt-out line unless the message already contains "STOP".
```js
async function sendPromotionalMessage(sock, jid, text, mediaUrl) {
  const optOut = /stop/i.test(text) ? '' : '\n\n_Reply STOP to unsubscribe._';
  const final = text + optOut;
  if (mediaUrl) return sendImage(sock, jid, mediaUrl, final, OUTLET); // existing helper
  return sock.sendMessage(jid, { text: final });
}
```

### F. Resume on `startBot()` (in `startBot()` after `sock.ev.on('connection.update')`)
```js
// At end of startBot(), after listeners wired:
const stuck = await db.ref(`bot/${OUTLET}/promotions/campaigns`).orderByChild('status').equalTo('running').once('value');
if (stuck.exists()) {
  for (const [id, campaign] of Object.entries(stuck.val())) {
    console.log(`[Promo] Resuming campaign ${id} from index ${campaign.currentIndex || 0}`);
    const cmdSnap = await db.ref(`bot/${OUTLET}/commands`).orderByChild('campaignId').equalTo(id).limitToLast(1).once('value');
    if (cmdSnap.exists()) {
      const [cmdId, cmd] = Object.entries(cmdSnap.val())[0];
      runPromotionCampaign(sock, { campaignId: id, ...cmd });
    }
  }
}
```

### G. Concurrency lock
```js
async function acquireLock(campaignId) {
  const ref = db.ref(`bot/${OUTLET}/promotions/lock`);
  const tx = await ref.transaction(c => c && c.campaignId === campaignId ? c : null);
  return tx.committed;
}
async function releaseLock(campaignId) {
  await db.ref(`bot/${OUTLET}/promotions/lock`).remove();
}
```
The lock auto-expires on campaign completion. UI prevents starting a second one anyway.

### H. `isSocketDead(sock)`
```js
function isSocketDead(sock) { return !sock?.user || !sock?.ws || sock.ws.isClosed === true; }
```

### I. `sleepThroughQuietHours(quietHours)`
Compares current IST hour to `[start, end)`. If inside quiet window, sleep until `end`.

### J. Scheduled-job pickup
In the existing 5-min heartbeat (~line 1309), add:
```js
const due = await db.ref(`bot/${OUTLET}/promotions/campaigns`)
  .orderByChild('runAt').endAt(Date.now()).once('value');
if (due.exists()) {
  for (const [id, c] of Object.entries(due.val())) {
    if (c.status === 'scheduled' && Date.now() - c.runAt <= 15*60*1000) {
      await db.ref(`bot/${OUTLET}/promotions/campaigns/${id}`).update({ status: 'running' });
      // push command (re-fetch original template etc. from the campaign doc)
      const cmdRef = db.ref(`bot/${OUTLET}/commands`).push();
      await cmdRef.set({ action: 'SEND_PROMOTION', campaignId: id, ... });
    } else if (c.status === 'scheduled' && Date.now() - c.runAt > 15*60*1000) {
      await db.ref(`bot/${OUTLET}/promotions/campaigns/${id}`).update({ status: 'expired', reason: 'missed-window' });
    }
  }
}
```

### K. Admin audit log
Wrap every start/pause/resume/stop in the existing pattern:
```js
await db.ref('logs/audit').push({
  action: 'PROMO_START',
  campaignId, by: <adminEmail>, timestamp: Date.now()
});
```
Already covered by `logs/audit` rules (line 27–33 of `database.rules.json`).

---

## 8. Admin-Side Implementation Details

### A. Recipient CSV auto-detect
```js
function detectPhoneColumn(headers) {
  for (const h of headers) {
    if (/phone|mobile|whatsapp|number/i.test(h)) return h;
  }
  return headers.find(h => /* column with most 10-digit values */) || headers[0];
}
```

### B. "Send Test" flow
- Reads `DEVELOPER_NUMBER` from existing constant (`bot/index.js:197`) or admin's last-order phone.
- Pushes a special command with `recipients: [<testPhone>], generateCoupons: false`.
- Skips the `consent` check for the test recipient.

### C. Live progress subscriber
- On `tab-promotions` open, `onValue(campaigns/{activeId})`.
- Render progress bar with `% = currentIndex / recipients.length * 100`.
- **Detach listener on tab switch** to stay under Firebase Spark plan 50K reads/day limit. Follow the pattern of `cleanupRiders()` (`riders.js:70`).

### D. Kill-switch UI
- Hidden by default.
- Revealed when a campaign is `running`.
- Click → confirm → set `bot/{outlet}/promotions/killSwitch = true`.
- Bot's `isKillSwitchOn()` checks this before every send.
- A "Resume" button sets it back to `false`.

### E. Scheduled-missed-window handling
- The Admin UI shows scheduled campaigns with a countdown.
- If the bot was offline and the time passed, the UI shows: "❌ Missed — bot was offline" and offers a one-click "Run Now" or "Cancel".

### F. CSV export
- Use already-loaded `xlsx.full.min.js` (`Admin/index.html:87`).
- Build a sheet with columns: `phone, status, sentAt, error, couponCode`.

### G. Campaign clone
- On a History row, "📋 Duplicate" button.
- Deep-copies the campaign doc with new `campaignId`, `status="draft"`, `createdAt: now`, `currentIndex: 0`, no logs.

### H. UI strings
All user-facing strings go through the existing `t('key', 'fallback')` helper from `Admin/js/l10n.js`. New keys:
```
promo.title, promo.howTo, promo.compose, promo.recipients, ...
promo.test, promo.start, promo.kill, promo.export, ...
```

---

## 9. Safety / Compliance
- **Throttle:** exactly 2 s between sends (configurable, default 2000 ms).
- **30 s pause every 50 sends.**
- **Hard cap 500 recipients** per campaign (also a Firebase-write-size safety).
- **Number validation:** `formatJid` skips bad numbers; logged as `skipped: invalid-jid`.
- **Failed delivery** caught per-send with retry (max 2); never crashes the loop.
- **Bot socket health** checked before **every** send, not just at batch start.
- **Crypto-error auto-pause** at `cryptoErrorCount > 100`.
- **Quiet-hours guard** default 10:00–21:00 IST (configurable per campaign).
- **STOP opt-out** auto-skips future sends; START re-opts-in.
- **Promotional consent** required (`customers/{phone}.promotionalConsent === true`); set on first order.
- **Global kill-switch** for emergencies.
- **Concurrency lock** — one active campaign per outlet.

---

## 10. Personalization Tokens
| Token | Replaced with | Source |
|---|---|---|
| `{name}` | Customer's saved name | `botUsers/{jid}.name` → `customers/{phone}.name` → "Customer" |
| `{phone}` | Their phone | always |
| `{lastOrderDate}` | "12 May 2026" | `customers/{phone}.lastOrderDate` |
| `{storeName}` | "Roshani Pizza" | `settings/Store` |
| `{couponCode}` | per-recipient code (if `generateCoupons=true`) | bot-generated, also written to `bot/{outlet}/promotions/coupons/{code}` for later redemption (cross-link to Discount plan) |

---

## 11. Testing & Rollback

### Unit / integration tests (manual test plan, since project has no Jest setup)
1. **Test send** to admin's own number — verify message arrives without admin contact footer.
2. **Stop word** — admin replies "STOP" to a campaign; verify next campaign skips them. Reply "START"; verify next campaign includes them again.
3. **Resume** — start a 20-recipient campaign, kill the bot process after 5 sends, restart, verify the campaign resumes from index 5.
4. **Kill-switch** — start a campaign, click Kill All mid-flight, verify bot halts within 2 s.
5. **Quiet hours** — schedule a campaign for 23:00 IST, verify bot sleeps and resumes at 10:00.
6. **Concurrent campaigns** — try to start a second campaign while one is running, verify the UI blocks it.
7. **CSV column detection** — upload CSVs with columns named `Phone`, `phone`, `Mobile`, `WhatsApp Number`, `Customer` (no number column) — verify auto-detect handles all 5.
8. **Dedup** — paste the same number 3 times — verify recipient list shows 1.
9. **Image attachment** — attach a menu image, verify it sends as a WhatsApp image with caption.
10. **Per-send socket health** — disconnect WiFi mid-campaign, verify campaign pauses with `session-degraded`.

### Rollback plan
- **Feature flag** at `bot/{outlet}/promotions/featureEnabled: false` (default `true` after launch).
- Setting it to `false` makes the bot silently ignore any `SEND_PROMOTION` commands.
- The Admin UI hides the Promotions tab when the flag is off.
- Existing campaigns remain in RTDB (no data loss) for inspection.

---

## 12. Implementation Order
1. **Pre-Flight Must-Haves** (10 items from §4) — ~2.5 hrs.
2. **DB schema** — `bot/{outlet}/promotions/{campaigns,logs,templates,optout,coupons,lock,killSwitch}`.
3. **Bot side** — `sendPromotionalMessage` + `runPromotionCampaign` + STOP/START + scheduled pickup + resume-on-startup.
4. **Admin UI** — `promotions.js` + `index.html` tab + sidebar + modal.
5. **Live progress subscriber** — wire `onValue` with proper cleanup.
6. **Guide modal** — content + i18n keys.
7. **Audit log** — wire to existing `logs/audit/`.
8. **End-to-end test** — full manual test plan from §11.
9. **Version bump** — `ADMIN_VERSION` `4.9.0` → `4.10.0`.

---

## 13. Effort Estimate
~700 lines bot + ~900 lines Admin (composer + guide modal + control panel + CSV).

---

## 14. v2 (Deferred) Features
- Per-customer daily send limit
- A/B testing variants
- Item-level attachments
- Voice note support
- Webhook callbacks (3rd-party CRM integration)
- Per-send delivery receipts (requires WhatsApp Business API, not Baileys)

# Code Changes: Before vs After

Six concrete changes, each grounded in your actual code (file + line references from the current
`main` branch). Copy-paste ready. Ordered by impact-to-effort ratio.

> **Updated after re-audit of commits `2bacf98`→`903f5f7`** (Baileys 6.17.16 → 7.0.0-rc13 upgrade).
> Status per item is marked below. Two new findings from that audit are appended as #7 and #8.

---

## 1. Centralize `undefined` sanitization in `firebase.js`

**Why:** We already patched one instance of this bug (`bot/logs/{id}.phone`, `index.js:609`) with a
one-off guard. But `setData`/`updateData`/`pushData` are called from ~15+ places across `index.js`
(`saveUserProfile` calls at lines 1349, 1384, 1399, 1410, 1432 all pass `user.phone` etc. straight through).
Any one of those can hit the same Firebase "undefined" rejection the next time a field is missing. Fixing
it once at the source in `firebase.js` closes the whole bug class instead of relying on every call site
remembering to guard.

**File:** `bot/firebase.js`

**Before:**
```js
async function setData(path, data, outlet = 'pizza') {
    try {
        const resolved = resolvePath(path, outlet);
        _cache.delete(resolved);
        await db.ref(resolved).set(data);
        return true;
    } catch (err) {
        console.error("SET ERROR:", err, "Path:", path);
        return false;
    }
}
async function updateData(path, data, outlet = 'pizza') {
    try {
        const resolved = resolvePath(path, outlet);
        _cache.delete(resolved);
        await db.ref(resolved).update(data);
    } catch (err) {
        console.error("UPDATE ERROR:", err, "Path:", path);
    }
}

async function pushData(path, data, outlet = 'pizza') {
    try {
        const resolved = resolvePath(path, outlet);
        _cache.delete(resolved);
        await db.ref(resolved).push(data);
    } catch (err) {
        console.error("PUSH ERROR:", err, "Path:", path);
    }
}
```

**After:**
```js
// Recursively strip `undefined` values (Firebase rejects them; `null` is the
// correct way to represent "no value" and is what this converts them to).
function stripUndefined(obj) {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(stripUndefined);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        out[k] = v === undefined ? null : stripUndefined(v);
    }
    return out;
}

async function setData(path, data, outlet = 'pizza') {
    try {
        const resolved = resolvePath(path, outlet);
        _cache.delete(resolved);
        await db.ref(resolved).set(stripUndefined(data));
        return true;
    } catch (err) {
        console.error("SET ERROR:", err, "Path:", path);
        return false;
    }
}
async function updateData(path, data, outlet = 'pizza') {
    try {
        const resolved = resolvePath(path, outlet);
        _cache.delete(resolved);
        await db.ref(resolved).update(stripUndefined(data));
    } catch (err) {
        console.error("UPDATE ERROR:", err, "Path:", path);
    }
}

async function pushData(path, data, outlet = 'pizza') {
    try {
        const resolved = resolvePath(path, outlet);
        _cache.delete(resolved);
        await db.ref(resolved).push(stripUndefined(data));
    } catch (err) {
        console.error("PUSH ERROR:", err, "Path:", path);
    }
}
```
Also add `stripUndefined` to the `module.exports` if you want to reuse it elsewhere (e.g. `discount-engine.js`).

---

## 2. Stop silencing the Baileys logger + log *why* it disconnected

**Status: partially done.** Since this was written, `sock.sendMessage` got monkey-patched to log
`[SEND OK]`/`[SEND ERR]` with `wsOpen` and `cryptoErrorCount` — that's a good, working solution to the
"was the send actually acknowledged" half of this problem, and better than what we originally proposed
below (it wraps every call site automatically instead of relying on each call remembering to log). The
`connection.update` close handler was also updated to include the raw `code` in the disconnect log. What's
**still open**: the core `logger: pino({ level: 'silent' })` passed into `makeWASocket` itself is
untouched, and the disconnect log prints the raw numeric `code` rather than the human-readable
`DisconnectReason` name — still requires manually cross-referencing Baileys source to know what `code=428`
means, for example. The fix below is now scoped down to just those two remaining gaps.

**Why:** `logger: pino({ level: 'silent' })` was the exact reason we had zero visibility during the
`@lid` investigation. Separately, printing the raw disconnect `code` instead of its name still means
you're manually cross-referencing Baileys source to know that, say, `428` means `conflict` (session opened
elsewhere) versus `408` meaning `timedOut` — those need completely different responses.

**File:** `bot/index.js`

**Before (line ~815, current code as of the Baileys 7.0.0-rc13 upgrade):**
```js
const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' }),
    browser: ['Windows', 'Chrome', '10'],
    connectTimeoutMs: 90000,
    defaultQueryTimeoutMs: 120000,
    keepAliveIntervalMs: 15000,
    markOnlineOnConnect: false,
    emitOwnEvents: true
});
// Patch sendMessage to log every send attempt with delivery diagnostics
const _origSendMessage = sock.sendMessage.bind(sock);
sock.sendMessage = async function(jid, content, opts) {
    const textPreview = content?.text ? content.text.slice(0, 60) : (content?.caption ? content.caption.slice(0, 60) : 'non-text');
    try {
        const result = await _origSendMessage(jid, content, opts);
        const msgId = result?.key?.id || result;
        const cryptoWarn = cryptoErrorCount > 10 ? ` cryptoErrs=${cryptoErrorCount}` : '';
        console.log(`[SEND OK] to ${maskJid(jid)} text="${textPreview}" wsOpen=${sock.ws?.isOpen} msgId=${msgId}${cryptoWarn}`);
        return result;
    } catch (err) {
        console.error(`[SEND ERR] to ${maskJid(jid)} text="${textPreview}":`, err.message || err);
        throw err;
    }
};
```
(The `sendMessage` patch is already good — leave it as-is. Only the `logger:` line needs to change below.)

**After (only the `logger:` line actually changes — everything else stays exactly as it is now):**
```js
const baileysLogger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'warn' });

const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: baileysLogger,               // ← was: pino({ level: 'silent' })
    browser: ['Windows', 'Chrome', '10'], // unchanged
    connectTimeoutMs: 90000,
    defaultQueryTimeoutMs: 120000,
    keepAliveIntervalMs: 15000,
    markOnlineOnConnect: false,
    emitOwnEvents: true                   // unchanged
});
// sendMessage patch below this stays exactly as it already is — no change needed there.
```
`'warn'` surfaces real problems without flooding logs the way `'debug'` would in steady state. Set
`BAILEYS_LOG_LEVEL=debug` in the environment temporarily when investigating a specific incident.

**Before (line ~944, `connection === 'close'` block — already improved to include the raw code):**
```js
if (connection === 'close') {
    const code = lastDisconnect?.error?.output?.statusCode;
    if (code !== DisconnectReason.loggedOut) {
        reconnectAttempts++;
        const delay = Math.min(5000 * Math.pow(3, Math.min(reconnectAttempts - 1, 3)), 120000);
        console.log(`🔌 Disconnected (attempt ${reconnectAttempts}, code=${code}). Reconnecting in ${(delay / 1000).toFixed(0)}s...`);
        if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; startBot(); }, delay);
    } else {
        console.log("❌ Logged out. Delete session folder and restart.");
    }
}
```
The raw `code` is now printed (good, wasn't before) — the remaining gap is that it's a bare number, not a
name. This is the last small piece of #2.

**After:**
```js
const DISCONNECT_REASON_NAMES = Object.fromEntries(
    Object.entries(DisconnectReason).map(([name, code]) => [code, name])
);

if (connection === 'close') {
    const code = lastDisconnect?.error?.output?.statusCode;
    const reasonName = DISCONNECT_REASON_NAMES[code] || `unknown(${code})`;
    if (code !== DisconnectReason.loggedOut) {
        reconnectAttempts++;
        const delay = Math.min(5000 * Math.pow(3, Math.min(reconnectAttempts - 1, 3)), 120000);
        console.log(`🔌 Disconnected [${reasonName}, code=${code}] (attempt ${reconnectAttempts}). Reconnecting in ${(delay / 1000).toFixed(0)}s...`);
        if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; startBot(); }, delay);
    } else {
        console.log(`❌ Logged out [${reasonName}]. Delete session folder and restart.`);
    }
}
```
Now a `conflict` (someone opened WhatsApp Web/Desktop with the same number) is instantly distinguishable
in the logs from a plain network `timedOut` — the fix for each is completely different, and you keep the
raw code alongside the name for cross-referencing Baileys' source if needed.

---

## 3. Load `.env` reliably

**Status: still open.** Confirmed on re-audit — `bot/package.json` has no `dotenv` entry and nothing in
`index.js` calls `require('dotenv').config()`. Unchanged since it was first found.

**Why:** confirmed in our earlier debugging that no `dotenv` dependency exists and nothing calls
`require('dotenv').config()`. Your production box happened to have `REDIS_URL` etc. set some other way
(directly exported in the shell, or PM2's cached env) — but that's fragile and undocumented. A fresh
deploy or a new team member's box won't work the same way unless it's explicit in code.

**File:** `bot/package.json`

**Before:**
```json
"dependencies": {
    "@whiskeysockets/baileys": "^6.13.0",
    "firebase-admin": "^12.0.0",
    "pino": "^8.19.0",
    "qrcode-terminal": "^0.12.0",
    "redis": "^5.12.1"
}
```

**After:**
```json
"dependencies": {
    "@whiskeysockets/baileys": "^6.13.0",
    "dotenv": "^16.4.5",
    "firebase-admin": "^12.0.0",
    "pino": "^8.19.0",
    "qrcode-terminal": "^0.12.0",
    "redis": "^5.12.1"
}
```

**File:** `bot/index.js` — **Before (line 1, very top of file):**
```js
/**
 * ROSHANI ERP | WHATSAPP BOT CORE v4.0
 * Single-Outlet Instance (Pizza-Bot / Cake-Bot)
 */

// =============================
// OUTLET CONFIGURATION (UNIFIED CORE)
// =============================
const OUTLET = process.env.OUTLET || 'pizza';
```

**After:**
```js
/**
 * ROSHANI ERP | WHATSAPP BOT CORE v4.0
 * Single-Outlet Instance (Pizza-Bot / Cake-Bot)
 */
require('dotenv').config();

// =============================
// OUTLET CONFIGURATION (UNIFIED CORE)
// =============================
const OUTLET = process.env.OUTLET || 'pizza';
```
Run `npm install` in `bot/` after this change to actually install the new dependency, then
`pm2 restart pizza-bot cake-bot --update-env`.

---

## 4. Add a health-check HTTP endpoint

**Status: still open.** No `http.createServer` or `HEALTH_PORT` anywhere in `index.js` on re-audit.

**Why:** right now the only way to know the bot's connection state is `pm2 logs` or waiting for a
customer complaint. A tiny endpoint lets you wire up an uptime monitor (UptimeRobot, CloudWatch, etc.)
that pages you the moment the socket drops instead of finding out reactively.

**File:** `bot/index.js` — add near the top-level state variables (after `let currentSock;` and similar
declarations, before `startBot()` is defined):

**New code:**
```js
// =============================
// HEALTH CHECK ENDPOINT
// =============================
const http = require('http');
const HEALTH_PORT = process.env.HEALTH_PORT || (OUTLET === 'pizza' ? 3001 : 3002);

http.createServer((req, res) => {
    if (req.url !== '/health') { res.writeHead(404); return res.end(); }
    const isConnected = currentSock && !isSocketDead(currentSock);
    const body = JSON.stringify({
        outlet: OUTLET,
        whatsapp: isConnected ? 'connected' : 'disconnected',
        redis: redisClient ? 'configured' : 'not_configured',
        uptimeSeconds: Math.floor(process.uptime()),
        cryptoErrorCount,
        timestamp: new Date().toISOString()
    });
    res.writeHead(isConnected ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(body);
}).listen(HEALTH_PORT, () => console.log(`🩺 Health check listening on :${HEALTH_PORT}/health`));
```
Give `pizza-bot` and `cake-bot` distinct ports in `ecosystem.config.js`'s `env` block
(`HEALTH_PORT: 3001` / `3002`) so they don't collide on the same EC2 instance. Test with:
```bash
curl http://localhost:3001/health
```

---

## 5. Fix the discount coupon race condition

**Status: still open — reconfirmed on re-audit.** `discount-engine.js:73` still reads
`(!d.globalLimit || (d.stats?.usedCount || 0) < d.globalLimit)` against the cached, non-atomic
`getAllDiscounts()` result. This is the highest-value fix still outstanding — it's a live correctness bug,
not just a robustness gap like the others.

**Why (real, confirmed bug):** in `discount-engine.js`, eligibility is checked with a **cached, stale
read** —
```js
(!d.globalLimit || (d.stats?.usedCount || 0) < d.globalLimit)
```
— using `getAllDiscounts()`, which caches for 30 seconds (`CACHE_TTL_MS = 30_000`). The actual increment
in `recordDiscountUsage()` happens *after* the order is already confirmed to the customer, via a proper
Firebase `.transaction()` — which is correctly atomic for the increment itself, but doesn't stop two
customers from both passing the earlier eligibility check when only one redemption slot remains. Net
result: a coupon with `globalLimit: 1` can be redeemed by 2+ customers if their orders land within the
same ~30s cache window (or even just close together, since the check-then-act gap exists regardless of
cache).

**File:** `bot/discount-engine.js`

**Before:**
```js
async function recordDiscountUsage({ OUTLET, discountId, orderId, customerPhone, amountGiven, channel, discountLabel, discountSource }) {
    try {
        const usageId = db.ref(`${OUTLET}/discountsUsage`).push().key;
        const usage = {
            discountId, discountLabel: discountLabel || '',
            orderId: orderId || '', customerPhone: customerPhone || '',
            amountGiven: Math.round(Number(amountGiven) || 0),
            appliedAt: Date.now(), channel: channel || 'whatsapp',
            source: discountSource || ''
        };
        await Promise.all([
            db.ref(`${OUTLET}/discountsUsage/${usageId}`).set(usage),
            db.ref(`${OUTLET}/discounts/${discountId}/stats`).transaction((cur) => {
                cur = cur || {};
                return {
                    usedCount: (cur.usedCount || 0) + 1,
                    totalDiscountGiven: (cur.totalDiscountGiven || 0) + Math.round(Number(amountGiven) || 0),
                    lastUsedAt: Date.now()
                };
            })
        ]);
    } catch (e) {
        console.warn('[Discounts] recordDiscountUsage failed:', e?.message || e);
    }
}
```

**After** — the transaction now enforces the cap itself (aborting if the limit's already hit) and reports
back whether the slot was actually reserved, instead of trusting a stale pre-check:
```js
/**
 * Persist a usage record + atomically bump the discount's stats — and enforce
 * globalLimit INSIDE the transaction so two concurrent redemptions can't both
 * slip through a stale eligibility check. Returns false if the cap was already hit.
 */
async function recordDiscountUsage({ OUTLET, discountId, orderId, customerPhone, amountGiven, globalLimit, channel, discountLabel, discountSource }) {
    try {
        let reserved = true;
        const txResult = await db.ref(`${OUTLET}/discounts/${discountId}/stats`).transaction((cur) => {
            cur = cur || {};
            const nextCount = (cur.usedCount || 0) + 1;
            if (globalLimit && nextCount > globalLimit) {
                reserved = false;
                return; // abort — returning undefined cancels the transaction write
            }
            return {
                usedCount: nextCount,
                totalDiscountGiven: (cur.totalDiscountGiven || 0) + Math.round(Number(amountGiven) || 0),
                lastUsedAt: Date.now()
            };
        });

        if (!reserved || !txResult.committed) {
            console.warn(`[Discounts] Redemption cap reached for ${discountId} — usage not recorded.`);
            return false;
        }

        const usageId = db.ref(`${OUTLET}/discountsUsage`).push().key;
        await db.ref(`${OUTLET}/discountsUsage/${usageId}`).set({
            discountId, discountLabel: discountLabel || '',
            orderId: orderId || '', customerPhone: customerPhone || '',
            amountGiven: Math.round(Number(amountGiven) || 0),
            appliedAt: Date.now(), channel: channel || 'whatsapp',
            source: discountSource || ''
        });
        return true;
    } catch (e) {
        console.warn('[Discounts] recordDiscountUsage failed:', e?.message || e);
        return false;
    }
}
```

**Caller change required** — wherever `recordDiscountUsage` is called in `index.js` (during checkout,
after `evaluateDiscount` returns a match), check the return value and fall back to full price if it's
`false`:
```js
const usageOk = await discountEngine.recordDiscountUsage({
    OUTLET, discountId: discount.discount.id, orderId, customerPhone,
    amountGiven: discount.amount, globalLimit: discount.discount.globalLimit,
    channel: 'whatsapp', discountLabel: discount.label, discountSource: discount.source
});
if (!usageOk) {
    // Coupon slot lost the race — recompute total without the discount and inform the customer
    finalTotal = subtotal; // instead of subtotal - discount.amount
    discountAppliedMsg = `⚠️ Sorry, that offer just reached its redemption limit — order placed at full price.`;
}
```
(Exact variable names will need to match wherever this is wired into your checkout flow — the important
part is: don't assume `recordDiscountUsage` succeeding, check it.)

---

## 6. Alert on report failures instead of failing silently

**Status: still open.** No `sendDailyReportSafely` or equivalent try/catch wrapper around the report calls
in the heartbeat interval on re-audit.

**Why:** `sendDailyReport` is called from inside the 5-minute heartbeat interval with no failure handling
beyond whatever's inside the function itself. If it throws (Firebase timeout, malformed order data for
that day, etc.), `dailyReportSent` never gets set to `true`... but there's also no admin notification, so
you'd only find out by noticing the report never arrived.

**File:** `bot/index.js` (inside the `reportInterval` heartbeat, ~line 844)

**Before:**
```js
// 1. Daily Report at 9:30 PM (21:30)
if (hour === 21 && minute === 30 && !dailyReportSent) {
    await sendDailyReport(currentSock, { OUTLET, OUTLET_NAME, OUTLET_EMOJI, getData, getCachedAdminJids });
    dailyReportSent = true;
}

// 2. Late Night Catch-up (If bot was off at 21:30, send it at 1:30 AM for YESTERDAY)
if (hour === 1 && minute === 30 && !dailyReportSent) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yDateStr = getISTDateString(yesterday.toISOString());
    await sendDailyReport(currentSock, { OUTLET, OUTLET_NAME, OUTLET_EMOJI, getData, getCachedAdminJids }, yDateStr);
    dailyReportSent = true;
}
```

**After:**
```js
async function sendDailyReportSafely(dateOverride = null) {
    try {
        await sendDailyReport(currentSock, { OUTLET, OUTLET_NAME, OUTLET_EMOJI, getData, getCachedAdminJids }, dateOverride);
        dailyReportSent = true;
    } catch (err) {
        console.error('[REPORT] ❌ Daily report failed:', err);
        // Best-effort admin alert — separate from the report itself, so a report-generation
        // bug doesn't also suppress the failure notice.
        const jids = await getCachedAdminJids().catch(() => []);
        const alertMsg = `⚠️ *Daily report failed to generate* for ${OUTLET_NAME} (${dateOverride || 'today'}).\nCheck \`pm2 logs ${OUTLET === 'pizza' ? 'pizza-bot' : 'cake-bot'}\` for details.`;
        await Promise.all((jids || []).map(jid => sock.sendMessage(jid, { text: alertMsg }).catch(() => {})));
        // Deliberately NOT setting dailyReportSent = true, so it retries at the 1:30 AM catch-up.
    }
}

// 1. Daily Report at 9:30 PM (21:30)
if (hour === 21 && minute === 30 && !dailyReportSent) {
    await sendDailyReportSafely();
}

// 2. Late Night Catch-up (If bot was off at 21:30, send it at 1:30 AM for YESTERDAY)
if (hour === 1 && minute === 30 && !dailyReportSent) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yDateStr = getISTDateString(yesterday.toISOString());
    await sendDailyReportSafely(yDateStr);
}
```
This also fixes the silent-restart gap from the lessons-learned doc: if the bot was down at 21:30 *and*
crashes again before 1:30 AM, you now at least get an explicit "report failed" WhatsApp message instead
of just... nothing, forever, until someone asks where the report is.

---

## 7. NEW — Wire in or remove the unused `normalizeJid`/`lidJidMap` utility

**Why:** the Baileys upgrade commit added a real LID→JID resolution utility to `utils.js`:
```js
const lidJidMap = new Map();
function normalizeJid(jid) {
    if (!jid || typeof jid !== 'string') return jid;
    if (!jid.endsWith('@lid')) return jid;
    const mapped = lidJidMap.get(jid);
    if (mapped) return mapped;
    const digits = jid.replace(/[^0-9]/g, '').slice(-10);
    if (digits.length === 10) {
        const resolved = formatJid(digits);
        if (resolved) { lidJidMap.set(jid, resolved); return resolved; }
    }
    const withPhone = jid.replace('@lid', '@s.whatsapp.net');
    lidJidMap.set(jid, withPhone);
    return withPhone;
}
```
It's exported and imported into `index.js` (`normalizeJid, lidJidMap` are destructured from `./utils` at
the top of the file) — but **`normalizeJid(` is never called anywhere in `index.js`**. The `sender`
variable at the top of the `messages.upsert` handler is deliberately left as the raw `@lid` JID, with a
comment explaining the team is now trusting Baileys 7.x's native LID routing instead. That's a defensible
bet — but it leaves a fully-built fallback path sitting unused, which is worth a deliberate decision
rather than an accidental one:

**Option A — Remove it**, if you're confident Baileys 7.x's native handling (mentioned in the commit
message: "lidMapping, USyncQuery, session validation") is sufficient on its own. Delete the unused export
to avoid confusing future maintainers into thinking it's active:
```js
// utils.js — remove normalizeJid, lidJidMap, and their export
// index.js — remove `normalizeJid, lidJidMap` from the destructured import
```

**Option B — Actually use it as a safety net**, in case Baileys 7.x's native resolution has edge cases it
doesn't cover (new/never-messaged `@lid` contacts, for instance). Populate the map on every inbound message
and consult it before outbound sends:
```js
// Inside messages.upsert, right after `let sender = msg.key.remoteJid;`
if (sender.endsWith('@lid') && msg.key.participant) {
    lidJidMap.set(sender, msg.key.participant); // capture WhatsApp's own resolved PN when available
}
```
```js
// Inside the sendMessage patch, before calling _origSendMessage:
const resolvedJid = normalizeJid(jid);
const result = await _origSendMessage(resolvedJid, content, opts);
```
Either is fine — what's not fine is leaving it half-wired, since it silently does nothing right now while
looking, at a glance, like part of the LID fix.

---

## 8. NEW — De-risk the Baileys release-candidate pin

**Why:** `package.json` now pins `"@whiskeysockets/baileys": "^7.0.0-rc13"`. Two things worth knowing:

1. **It's a release candidate, not a stable release.** RCs can and do get follow-up fixes before the
   stable `7.0.0` tag — running a pre-release in production on your primary revenue channel carries more
   risk than a normal minor-version bump, even though it was necessary here to get the LID fixes.
2. **`^` on a pre-release version is not what it looks like.** Per npm's semver rules, a caret range on a
   version with a `-rc13` pre-release tag will **only** match that exact `7.0.0-rc13` — it will *not*
   automatically pick up `7.0.0-rc14` or the eventual stable `7.0.0` on a plain `npm install`. So this pin
   is actually more locked-down than it appears, which is safe (no surprise upgrades) but also means you
   won't get follow-up RC fixes without a manual bump.

**Action, not a code change:** watch the [Baileys releases page](https://github.com/WhiskeySockets/Baileys/releases)
for the `7.0.0` stable tag, and plan a deliberate upgrade (ideally tested against your staging environment,
per the improvement guide) once it ships — rather than leaving `rc13` pinned indefinitely. Set a calendar
reminder or a `npm outdated` check into your weekly routine rather than relying on remembering.

---

---
---

# Round 2: External Audit Findings (agent-reported, verified against source)

Your parallel-agent audit surfaced 20 items. I re-checked every Critical and High item, plus a sample of
Medium items, directly against the current `main` branch before writing anything below. **Two of the seven
"Critical" items are false positives** — already fixed or already correctly handled — and one is real but
the actual mechanism is different from how it was described. Flagging that up front because pushing "fixes"
for the false positives would have been wasted effort at best, and risked breaking working security rules
at worst.

## ✅ Confirmed real — fixed below

### R1. Revenue under-reported on comma-formatted totals (was Critical #1)

**Verified:** `bot/reports.js` line ~34 does `outletRevenue += parseFloat(order.total || 0);`.
`parseFloat` stops at the first non-digit character, so `parseFloat('1,234')` really does return `1`, not
`1234`. If `order.total` is ever stored as a string with a thousands separator anywhere in the pipeline,
daily revenue reports would silently under-report by orders of magnitude for that order.

**File:** `bot/reports.js`

**Before:**
```js
if (order.status === "Delivered" || order.status === "Confirmed" || order.paymentStatus === "Paid") {
    outletRevenue += parseFloat(order.total || 0);
}
```

**After:**
```js
if (order.status === "Delivered" || order.status === "Confirmed" || order.paymentStatus === "Paid") {
    const cleanTotal = Number(String(order.total ?? 0).replace(/,/g, ''));
    outletRevenue += Number.isFinite(cleanTotal) ? cleanTotal : 0;
}
```
`Number()` on a cleaned string is stricter than `parseFloat` (returns `NaN` on genuinely malformed input
instead of silently truncating), which is why the `Number.isFinite` guard is there — better to skip a bad
value than silently mis-add it.

---

### R2. Order-completion session isn't actually cleared (was Critical #2, mechanism corrected)

**Verified, but the audit's description doesn't match the actual bug.** The claim was "`saveSession` saves
`null` after order placement — overwrites user state." That's backwards. Here's what's actually happening:

```js
await (async () => {
    // ... order placement logic ...
    return null;   // comment: "Return null to signify session should be cleared"
})();               // ← return value is never captured or assigned to anything

await saveSession(sender, user);   // `user` is still the pre-order object — untouched by the `return null` above
```

The IIFE's `return null` is **dead code** — nothing captures the IIFE's return value, so it has zero
effect. `saveSession` then runs with the original `user` object, which was never reset (no `user.step = ...`,
no `user.cart = []` before the `return null`). Net effect: **the session is never cleared after a
successful order**, so the customer's next message resumes from whatever step/cart state they were in at
checkout — the opposite of "overwrites state with null," but arguably a worse bug, since a real customer
could end up appearing to re-enter a stale checkout flow after their order already went through.

**File:** `bot/index.js`

**Before (~line 1073 through ~1649, structure only — full function is long):**
```js
await (async () => {
    // ... many steps ...
    if (/* order placement success path */) {
        // ...
        // Return null to signify session should be cleared
        return null;
    }
})();

// Final Session Save
await saveSession(sender, user);
```

**After:**
```js
const sessionSignal = await (async () => {
    // ... many steps, unchanged ...
    if (/* order placement success path */) {
        // ...
        // Signals the outer scope to clear this session instead of persisting stale checkout state
        return 'CLEAR_SESSION';
    }
})();

// Final Session Save
if (sessionSignal === 'CLEAR_SESSION') {
    await saveSession(sender, null); // saveSession(sender, null) already deletes the Redis + local-cache entry
} else {
    await saveSession(sender, user);
}
```
Only two lines need to change inside the giant IIFE (`const sessionSignal =` on the way in, `return
'CLEAR_SESSION';` instead of `return null;` on the way out) — everything else in that ~600-line block stays
exactly as-is.

---

### R3. Dine-in orders missing `'Placed'` in their status sequence (was Critical #4 — strongly confirmed)

**Verified with cross-file evidence, which makes this more solid than the original report suggested.**
`shared/order-status.js` defines:
```js
export const STATUS_SEQUENCE = ["Placed", "Confirmed", "Ready", ...]; // 'Online' orders
export const STATUS_SEQUENCES = {
    'Online': STATUS_SEQUENCE,
    'Dine-in': ["Confirmed", "Ready", "Delivered"],   // ← no 'Placed'
    'Default': STATUS_SEQUENCE
};
```
But `menu/js/ui.js` independently defines its own Dine-in step tracker that **already assumes `'Placed'`
is a valid first step**:
```js
const DINE_IN_STEPS = [
    { key: 'Placed', label: 'Order Received' },   // step 0
    { key: 'Confirmed', label: 'Preparing' },      // step 1
    ...
];
```
So the frontend expects a Dine-in order to legitimately be in status `'Placed'` and show it at step 0 — but
the canonical backend sequence has no `'Placed'` entry, meaning anything that does
`STATUS_SEQUENCES['Dine-in'].indexOf(order.status)` for a freshly-placed Dine-in/QR order gets `-1` instead
of a valid index. That breaks any progress-bar or step-gating logic built on `shared/order-status.js`
specifically (separate from `ui.js`'s own hardcoded copy, which happens to handle it correctly by accident).

**File:** `shared/order-status.js`

**Before:**
```js
export const STATUS_SEQUENCES = {
    'Online': STATUS_SEQUENCE,
    'Dine-in': ["Confirmed", "Ready", "Delivered"],
    'Default': STATUS_SEQUENCE
};
```

**After:**
```js
export const STATUS_SEQUENCES = {
    'Online': STATUS_SEQUENCE,
    'Dine-in': ["Placed", "Confirmed", "Ready", "Delivered"],
    'Default': STATUS_SEQUENCE
};
```
**Also worth doing while you're in both files:** `menu/js/ui.js`'s `DINE_IN_STEPS`/`dineInStepIndex` is a
second, independently-maintained copy of this exact sequence (this is audit item #18, Medium). Once R3 is
fixed, consider having `ui.js` import `STATUS_SEQUENCES['Dine-in']` from `shared/order-status.js` instead of
hardcoding its own array, so the two can't drift again:
```js
import { STATUS_SEQUENCES } from '../../shared/order-status.js';
const DINE_IN_LABELS = { Placed: 'Order Received', Confirmed: 'Preparing', Ready: 'Ready To Serve', Delivered: 'Served' };
const DINE_IN_STEPS = STATUS_SEQUENCES['Dine-in'].map(key => ({ key, label: DINE_IN_LABELS[key] }));
function dineInStepIndex(status) {
    const idx = STATUS_SEQUENCES['Dine-in'].indexOf(status);
    return idx === -1 ? 0 : idx;
}
```

---

### R4. `tableSessionsContact` is world-writable (was Critical #7 — confirmed, real PII exposure)

**Verified:** `database.rules.json` → `$outletId/tableSessionsContact/$sessionId` has `".write": "true"` —
genuinely open to anyone, authenticated or not, gated only by a `.validate` shape check (must include
`customerPhone`/`guestPhone`), which restricts *shape*, not *who*. Any client can write arbitrary contact
records into any table session.

**File:** `database.rules.json`

**Before:**
```json
"tableSessionsContact": {
    ".read": "auth != null && (root.child('admins').child(auth.uid).child('outlet').val() == $outletId || root.child('admins').child(auth.uid).child('isSuper').val() == true || root.child('admins').child(auth.uid).child('isSupreme').val() == true)",
    "$sessionId": {
        ".write": "true",
        ".validate": "newData.hasChildren(['customerPhone','guestPhone'])",
        ...
    }
}
```

**After** — scope the write to the session's own QR/table flow instead of the entire internet. The exact
condition depends on how your QR ordering flow authenticates (likely anonymous Firebase auth or a
session-token check) — here's the pattern assuming anonymous auth is already in use elsewhere in the app
(check `Admin/firebase-config.js` / the customer menu app for how QR sessions currently authenticate):
```json
"tableSessionsContact": {
    ".read": "auth != null && (root.child('admins').child(auth.uid).child('outlet').val() == $outletId || root.child('admins').child(auth.uid).child('isSuper').val() == true || root.child('admins').child(auth.uid).child('isSupreme').val() == true)",
    "$sessionId": {
        ".write": "auth != null && (root.child('admins').child(auth.uid).child('outlet').val() == $outletId || root.child('admins').child(auth.uid).child('isSuper').val() == true || root.child('admins').child(auth.uid).child('isSupreme').val() == true || (!data.exists() && newData.exists()))",
        ".validate": "newData.hasChildren(['customerPhone','guestPhone'])",
        ...
    }
}
```
This tightens it to: admins can always write, and an anonymous/unauthenticated client can only **create** a
contact record that doesn't exist yet (`!data.exists() && newData.exists()`) — not overwrite or delete
someone else's. It's a meaningful improvement, but confirm against your actual QR-flow auth model before
deploying — if the customer app doesn't currently sign in anonymously at all, `auth != null` will break
the QR flow entirely and you'll need `auth == null` allowed specifically for the create-only case instead.
**Test this one in the Firebase Rules Simulator before pushing to production** — it's the riskiest change
in this document to get subtly wrong.

---

### R5. `tableSessions` and `discounts` are world-readable (was High #12, #13 — both confirmed)

**Verified:** both have `".read": "true"` at the collection root.

- `tableSessions`: exposes every table's order IDs, items, and running totals to anyone with your Firebase
  project config (which is unavoidably public in a web app — client-side Firebase config isn't a secret,
  security rules are the actual gate).
- `discounts`: exposes every discount code and its terms (percentage, min order, expiry) to anyone.

**File:** `database.rules.json`

**Before:**
```json
"tableSessions": {
    ".read": "true",
    ...
}
```
```json
"discounts": {
    ".read": "true",
    ...
}
```

**After** — for `tableSessions`, this one is genuinely tricky: the customer-facing QR ordering page
presumably needs to read *its own* session to show "your table's order status," which is why `.read: true`
is probably there in the first place — restricting to `auth != null` would break that flow unless the QR
page authenticates. The safer middle ground, if the QR page can't easily authenticate, is scoping read
access at the `$sessionId` level to require knowing the session ID (which functions like a capability token,
since it's a random push ID, not enumerable) rather than the whole `tableSessions` collection:
```json
"tableSessions": {
    ".indexOn": ["status", "openedAt", "tableId"],
    "$sessionId": {
        ".read": "auth != null || true",
        ...
    }
}
```
That specific rule still allows anyone with a session ID to read that one session — genuinely closing this
requires the QR flow to pass some kind of token, which is a product decision, not a one-line fix. **Flagging
as needing a design discussion, not just a rules edit** — happy to help scope that separately if useful.

For `discounts`, this one has a clean fix since only the *active, currently-valid* discounts need to be
public (for client-side coupon-code validation in the menu app), not the full history:
```json
"discounts": {
    ".read": "true",
    ".write": "auth != null && (root.child('admins').child(auth.uid).child('isSuper').val() == true || root.child('admins').child(auth.uid).child('isSupreme').val() == true || root.child('admins').child(auth.uid).child('outlet').val() == $outletId)"
}
```
Actually — on reflection, if the menu app needs to validate coupon codes client-side against this list,
public read is probably intentional and hard to avoid without a Cloud Function proxy. **Recommend leaving
`discounts` read-public as a deliberate, documented decision** rather than "fixing" it, unless you're
comfortable moving coupon validation server-side (into the bot's `discount-engine.js`, which already has
`evaluateDiscount` — the menu app could call that via a Cloud Function instead of reading Firebase
directly). Noting this as a design tradeoff rather than shipping a rules change that might break checkout.

---

### R6. `_printBillForGroup` ignores discounts on dine-in group bills (was High #9 — confirmed)

**Verified:** `Admin/js/features/tables.js`, in `_printBillForGroup`, hardcodes `discount: 0` in the
`printOrderReceipt(...)` call regardless of any discount applied to the underlying orders in the group.

**File:** `Admin/js/features/tables.js`

**Before:**
```js
await printOrderReceipt({
    orderId: `TABLE-${t.number}-${g.label.replace(/\s/g, '')}`,
    type: 'Dine-in', items: allItems,
    total: grandTotal, subtotal, tax, taxItems,
    taxName: taxRates.map(r => r.name).join(' + ') || 'Tax',
    serviceCharge,
    serviceChargeName: dine.serviceChargeName || 'Service Charge',
    serviceChargeRate: scRate,
    discount: 0, deliveryFee: 0,
    tableNo: String(t.number),
    createdAt: sess.openedAt || Date.now(),
    paymentMethod: g.paymentMethod || 'Cash',
    status: 'Delivered',
    ...
});
```

**After:**
```js
const groupDiscount = groupOrders.reduce((sum, o) => sum + Number(o.discount || 0), 0);
const grandTotalAfterDiscount = subtotal + tax + serviceCharge - groupDiscount;

await printOrderReceipt({
    orderId: `TABLE-${t.number}-${g.label.replace(/\s/g, '')}`,
    type: 'Dine-in', items: allItems,
    total: grandTotalAfterDiscount, subtotal, tax, taxItems,
    taxName: taxRates.map(r => r.name).join(' + ') || 'Tax',
    serviceCharge,
    serviceChargeName: dine.serviceChargeName || 'Service Charge',
    serviceChargeRate: scRate,
    discount: groupDiscount, deliveryFee: 0,
    tableNo: String(t.number),
    createdAt: sess.openedAt || Date.now(),
    paymentMethod: g.paymentMethod || 'Cash',
    status: 'Delivered',
    ...
});
```
Double-check whether `grandTotal` (used elsewhere in this function, e.g. for the on-screen total shown
before printing) also needs the same discount subtraction — the snippet above only shows the print call;
if `grandTotal` is displayed to staff before this point, it needs the matching fix or staff will see one
number and the printed receipt will show another.

---

### R7. `escapeHtml` doesn't escape backticks (was Medium #19 — confirmed, narrower risk than it sounds)

**Verified:** `bot/utils.js`'s `escapeHtml` handles `& < > " '` but not `` ` ``. Backtick isn't an HTML
metacharacter on its own, so this isn't a classic HTML-injection risk — but if any code path takes
`escapeHtml()`'s output and later interpolates it into a JS template literal (`` `...${escaped}...` ``)
without further escaping, an unescaped backtick could break out of that literal.

**File:** `bot/utils.js`

**Before:**
```js
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
```

**After:**
```js
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/`/g, '&#096;');
}
```
Low priority relative to R1–R6, but a one-line fix while it's fresh.

---

### R8. Audio object churn in the continuous-beep loop (was Medium #17 — confirmed, minor)

**Verified:** `shared/audio/player.js`'s `startContinuousBeep` creates a brand-new `Audio` object on every
interval tick and reassigns `_continuousAudio`, abandoning the previous instance by reference instead of
reusing one element.

**File:** `shared/audio/player.js`

**Before:**
```js
export function startContinuousBeep(intervalMs = 10000) {
    stopContinuousBeep();
    _continuousAudio = new Audio(BEEP_PATH);
    _continuousAudio.play().catch(e => console.warn('[Audio] Continuous beep failed:', e));
    _continuousInterval = setInterval(() => {
        _continuousAudio = new Audio(BEEP_PATH);
        _continuousAudio.play().catch(() => {});
    }, intervalMs);
    return stopContinuousBeep;
}
```

**After:**
```js
export function startContinuousBeep(intervalMs = 10000) {
    stopContinuousBeep();
    _continuousAudio = new Audio(BEEP_PATH);
    _continuousInterval = setInterval(() => {
        _continuousAudio.currentTime = 0;
        _continuousAudio.play().catch(() => {});
    }, intervalMs);
    return stopContinuousBeep;
}
```
One `Audio` element, rewound and replayed each tick, instead of a new element (and a new HTTP/decode cycle
for the audio file) every 10 seconds an admin has the dashboard open with pending orders.

---

## ⚠️ Real, but needs one more check before writing a diff

### R9. QR/Dine-in orders may skip stock deduction (was High #10 — plausible, root cause identified)

**Verified the mechanism, can't fully confirm the gap without seeing the POS-side deduction code.**
`Admin/js/features/orders.js` line ~996: `const isPosSale = (type || '').toLowerCase() === 'dine-in';`, and
line ~1112: `if (status === "Delivered" && !order.stockDeducted && !isPosSale) { autoDeductStock(...); }` —
so **all** Dine-in orders (QR-placed or manually entered at POS) are excluded from this deduction path. The
comment says "POS deducts at sale time" — implying a *different* code path handles Dine-in stock deduction
at order-creation time. That's a reasonable design for staff manually ringing up a table sale, but if a
**QR-placed** Dine-in order doesn't go through that same "at sale time" POS code path (since it's created
by the customer's phone, not a staff POS action), it could fall through both gaps entirely.

**Before I hand you a diff:** find wherever "POS deducts at sale time" actually happens (search for
`autoDeductStock` or `stockDeducted` elsewhere in `Admin/js/`) and confirm it fires for QR-sourced Dine-in
orders specifically, not just staff-entered ones. If it doesn't, the fix is to remove the blanket
`!isPosSale` exclusion and instead check the order's actual source:
```js
// Only skip this auto-deduction if the order was ALREADY deducted at POS sale time —
// not just because it's type 'Dine-in' in general.
if (status === "Delivered" && !order.stockDeducted) {
    const items = order.normalizedItems || order.cart || [];
    if (items.length > 0) {
        logger.info('ORDERS', `Auto-deducting stock on Delivered: ${items.length} items`);
        autoDeductStock(items);
        updates.stockDeducted = true;
    }
}
```
This is safe either way, because of the `!order.stockDeducted` guard — if POS already deducted it and set
`stockDeducted: true`, this block is a no-op regardless. Removing `!isPosSale` can only help catch orders
that fell through, never double-deduct ones that didn't.

---

## ❌ False positives — verified NOT to be bugs

### R10. `.indexOn` for `riderId`/`orderId`/`type`/`assignedRider` (was Critical #3)

**Verified false.** `database.rules.json` → `$outletId/orders` already has:
```json
".indexOn": ["createdAt", "status", "riderId", "assignedRider", "orderId", "type"]
```
All four fields the audit flagged as missing are already present. No action needed — the agent that
reported this likely looked at a different `.indexOn` array in the same file (there are several, one per
collection) and misattributed it to `orders`.

### R11. Rider `equalTo(null)` query on `assignedRider` (was Critical #6)

**Verified false.** `rider/app.js:753` does query `orderByChild('assignedRider').equalTo(null)`, but the
security rule was specifically written to handle exactly this:
```
".read": "... || (root.child('riders').child(auth.uid).exists() && (query.orderByChild == 'assignedRider' && (query.equalTo == root.child('riders').child(auth.uid).child('email').val().toLowerCase() || query.equalTo == '' || query.equalTo == null)))"
```
`query.equalTo == null` is explicitly one of the three permitted values. And per-child, the `$orderId` rule
allows read when `!data.child('assignedRider').exists()` — which is true for any order where
`assignedRider` was never set (Firebase RTDB removes a field entirely when it's set to `null`, so
"doesn't exist" and "is null" are the same state in practice). The two halves of the rule were clearly
designed together for this exact query. No action needed.

### R12. `admins_list` / `errorLogs` "have no rules" (was High #14 — real observation, wrong risk direction)

**Verified the observation, but the conclusion is backwards.** Neither key appears anywhere in
`database.rules.json`, and the root itself has no `.read`/`.write` default. In Firebase RTDB, a path with no
matching rule anywhere in its ancestor chain is **denied by default** — so these paths currently reject all
client-SDK read/write, which is the *safe* direction, not a vulnerability. **The actual risk, if any, is
functional rather than a security hole:** if any client-side code (Admin dashboard JS, not the bot — the bot
uses the Admin SDK, which bypasses rules entirely) tries to write to `errorLogs` or `admins_list` directly,
those writes are currently failing silently. Worth a quick `grep -rn "errorLogs\|admins_list" Admin/js/` to
confirm whether that's happening — if so, it's a "why isn't this working" bug, not a security fix.

### R13. FCM server key is empty (was Medium #16 — real, but the "fix" would be a new vulnerability)

**Verified the empty string, but pushing back on the framing.** `shared/firebase-config.js` has
`fcmServerKey: ""` in a file that ships to every client browser. **Do not fill this in with a real key** —
the legacy FCM server key is a fully-privileged credential capable of sending push notifications to any
device on the project; putting a real one in client-side code would be a significantly worse problem than
push notifications not working. If push notifications are actually needed, the correct fix is sending them
server-side via the FCM HTTP v1 API using the same service-account credentials `bot/firebase.js` already
uses (Admin SDK), never a client-embedded server key. Flagging as "leave as empty string, build server-side
if needed" rather than a diff.

---

## Updated rollout order (supersedes the previous one — discount race condition from Round 1 is still top priority)

1. Discount race condition (Round 1, §5) — still the highest-priority live financial bug
2. **R2** — session-clear fix — second financial/UX-correctness bug of similar severity, customers hitting stale checkout state post-order
3. **R1** — revenue report parseFloat fix — cheap, high-trust-impact (owner-facing numbers)
4. **R3** — Dine-in `'Placed'` status fix — breaks order tracking UI for every dine-in order today
5. **R4** — `tableSessionsContact` write rule — test in Rules Simulator first, this is the riskiest edit here
6. **R6** — discount-ignoring bill printer
7. **R9** — confirm the QR stock-deduction gap, then apply if confirmed
8. **R5** — `tableSessions`/`discounts` read exposure — needs a product decision, not just a code change
9. **R7, R8** — low-priority cleanup, bundle with your next unrelated deploy

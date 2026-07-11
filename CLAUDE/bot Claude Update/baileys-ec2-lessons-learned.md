# Baileys WhatsApp Bot on EC2 — Lessons Learned & Rules to Never Break

Compiled from real production incidents on `roshani-pizza-bot` (pizza-bot / cake-bot, PM2, EC2 Ubuntu 24.04).
Goal: the bot should run indefinitely without silent failures, crashes, or "not replying" incidents.

---

## 1. Never run with a silent logger

**Mistake:** Baileys was initialized with `logger: pino({ level: 'silent' })`.

**Why it hurt us:** When the socket disconnected/reconnected, we had zero visibility into *why*. We wasted time chasing Redis, Firebase, and PM2 theories because the one log that mattered — Baileys' own connection/disconnect reason — was suppressed.

**Rule:**
- Never set `level: 'silent'` in production. Use `level: 'warn'` at minimum, `'debug'` while investigating.
- Always log `connection.update` events explicitly in your own code (`connection open`, `connection close`, `DisconnectReason`), don't rely on the library logger alone.
- Log **after** `sendMessage()` resolves too, not just before — log the result (`key.remoteJid`, `key.id`, `fromMe`) or the caught error. A "SEND" log with no matching "SEND OK/ERROR" is a black hole you can't debug.

```js
try {
    const result = await sock.sendMessage(jid, { text: msg });
    console.log("[SEND OK]", { remoteJid: result?.key?.remoteJid, id: result?.key?.id, fromMe: result?.key?.fromMe });
} catch (err) {
    console.error("[SEND ERROR]", err);
}
```

---

## 2. Never let `.env` exist without something actually loading it

**Mistake:** `.env` was gitignored and present on the server, but no `dotenv` dependency and no `require('dotenv').config()` anywhere in the codebase — and PM2's `ecosystem.config.js` didn't set the needed vars in its `env` block either.

**Why it hurt us:** Any variable that's only ever set in `.env` (e.g. `REDIS_URL`) silently evaluates to `''`/`undefined` at runtime, and code degrades to a fallback path (in-memory only) with just a console warning — nothing crashes, so it's easy to miss.

**Rule:**
- If you use `.env`, install `dotenv` and call `require('dotenv').config()` at the very top of `index.js`, **or** set every required variable explicitly inside `ecosystem.config.js`'s `env` block per app.
- After any deploy or `pm2 restart`, grep the boot log for your "fallback" warnings (e.g. `Redis not configured`) to confirm real config loaded, not a degraded default.
- `pm2 restart <app> --update-env` when environment variables change — a plain `restart` does **not** reload env vars from a changed `.env`/ecosystem file into a running PM2 daemon's cached env.

---

## 3. Never let Firebase writes contain `undefined`

**Mistake:** `handleOrderStatusUpdate()` wrote `phone: order.phone` straight into a Firebase `update()` call. For Dine-in orders with no phone captured, `order.phone` was `undefined`, and the Firebase Admin SDK throws on `undefined` values (it accepts `null`, not `undefined`).

**Why it hurt us:** Produced a recurring `UPDATE ERROR: values argument contains undefined` in the error log on every Dine-in status change — noise that obscured the real issue during debugging, and a real (if minor) functional bug.

**Rule:**
- Never pass a possibly-`undefined` field straight into `set()`/`update()`. Always normalize first:
  ```js
  phone: order.phone || null,
  // or, to omit the key entirely:
  ...(order.phone && { phone: order.phone })
  ```
- Wrap every Firebase write in try/catch and log the **path** being written, not just the error — makes it instantly obvious which document/order caused it.

---

## 4. Never assume "no error log" means "no problem"

**Mistake:** `pizza-bot-error.log` was empty and `unstable restarts: 0`, which we initially worried might indicate crash-looping. It didn't — those restarts were manual (`pm2 restart`) during debugging.

**Rule:**
- Check `pm2 describe <app>` for `restarts` vs `unstable restarts` — the second is the real crash signal, not the first.
- Don't `pm2 restart` a live bot mid-investigation unless you intend to; every restart drops the WhatsApp socket briefly, and any customer message arriving in that window gets no reply. If you're actively debugging a live production bot, prefer reading logs over restarting.

---

## 5. Never test connectivity against the wrong hostname

**Mistake:** Ran `echo > /dev/tcp/wss.web.whatsapp.net/443` to check network access. That hostname doesn't exist — Baileys/WhatsApp Web no longer resolves through it — so the test failed and looked like a DNS/firewall problem when it wasn't.

**Rule:**
- Test against `web.whatsapp.com` (`ping`, `nslookup`, `curl -I https://web.whatsapp.com`) for a basic reachability check.
- Better: log the actual WebSocket endpoint Baileys connects to at runtime (it's dynamic/versioned) rather than guessing a hostname to test manually.
- Confirm the EC2 Security Group allows **outbound** 443/WSS — this is the actual failure mode to check for, not a made-up hostname.

---

## 6. Never ignore `@lid` vs `@s.whatsapp.net` JID differences

**Mistake:** Assumed `sendMessage()` returning a message ID with `fromMe: true` meant delivery succeeded, for a customer whose JID was `...@lid` (WhatsApp's newer Linked-ID identity format) rather than the classic `...@s.whatsapp.net`.

**Why it hurt us:** This was the actual root cause of "bot not replying" — Baileys accepted and ack'd the send, but it never reached the customer, because LID routing needs correct resolution that older Baileys versions handle inconsistently.

**Rule:**
- Keep `@whiskeysockets/baileys` current — pin a specific version in `package.json` **and** keep `package-lock.json` in sync with what's actually installed (`npm outdated @whiskeysockets/baileys` periodically). LID handling has changed across multiple 6.x releases as WhatsApp rolled it out.
- Don't trust `SEND OK` alone as proof of delivery for `@lid` contacts. If possible, cross-check with a delivery/read receipt event (`messages.update` with `status`), not just the initial send ack.
- When debugging "not receiving" reports, always check whether the affected JID is `@lid` or `@s.whatsapp.net` — treat them as two different code paths to verify, not one.

---

## 7. Never run two bot instances against the same session folder

**Setup note (verify, don't assume):** `pizza-bot` and `cake-bot` run as separate PM2 apps from the same `cwd: './bot'`. Baileys session state lives in `session_data_pizza/` etc. — confirm each `OUTLET` env var maps to a genuinely distinct session directory in your auth-state code.

**Rule:**
- Two Baileys sockets authenticated with the **same** session files will fight over the encryption ratchet and produce `Bad MAC` / decrypt failures that look exactly like "bot not replying" (messages arrive but can't be decrypted, so no reply is ever generated).
- Double check session folder paths are derived from `OUTLET` (or another unique key) with no possibility of collision, especially after refactors.

---

## 8. Never let PM2 restart forever without backoff or alerting

**Rule (preventative, not yet an incident, but worth locking in now):**
- Set `exp_backoff_restart_delay` and `max_restarts` in `ecosystem.config.js` so a genuine crash loop doesn't hammer WhatsApp's servers and risk a temporary ban:
  ```js
  {
    name: 'pizza-bot',
    script: 'index.js',
    cwd: './bot',
    max_restarts: 10,
    min_uptime: '30s',
    exp_backoff_restart_delay: 100,
    max_memory_restart: '300M'
  }
  ```
- Install `pm2-logrotate` so `pizza-bot-out.log` doesn't grow unbounded and eventually fill the EC2 disk (`pm2 install pm2-logrotate`).
- Add a global handler so one bad message can't take down the whole process:
  ```js
  process.on('unhandledRejection', (err) => console.error('[UNHANDLED]', err));
  process.on('uncaughtException', (err) => console.error('[UNCAUGHT]', err));
  ```

---

## Quick pre-deploy checklist

- [ ] Logger is not `silent`
- [ ] Every `sendMessage()` call has try/catch with logged result
- [ ] `.env` variables are confirmed loaded (grep boot log for fallback warnings)
- [ ] No `undefined` values reach any Firebase `set()`/`update()` call
- [ ] `package.json` Baileys version matches what's actually installed, and it's current
- [ ] Each bot instance's session folder is unique and verified non-colliding
- [ ] `ecosystem.config.js` has `max_restarts` + backoff + `max_memory_restart`
- [ ] `pm2-logrotate` installed
- [ ] Global `unhandledRejection` / `uncaughtException` handlers in place
- [ ] Security group allows outbound 443 for WhatsApp's WebSocket endpoints

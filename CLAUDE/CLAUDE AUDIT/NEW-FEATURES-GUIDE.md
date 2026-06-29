# New Features — Placement Guide & Production Checklist

Everything below is **already applied** to the files in this package (not
patch instructions this time — the real files are ready to drop in).
This doc tells you exactly *what changed, in which file*, and what's
still needed for true production readiness.

---

## 1. Hero Banner — Welcome Screen

**Files touched:**
- `Menu/css/app.css` — `.welcome-screen` rule
- `Menu/js/app.js` — the `boot()` function, background-image block

**What changed:**
Previously the welcome screen was a flat dark gradient with no banner
treatment until a custom photo was set, and the photo (once set) would
pop in abruptly. Now:
- A tasteful **default mesh-gradient** (orange glow, brand-colored) renders
  immediately — looks intentional even before you upload a custom photo
- When `pizza/settings/customerMenuBgImage` **is** set, the image now
  **preloads** before swapping in, then fades in smoothly (`has-photo`
  class + `heroPhotoFadeIn` animation) instead of flashing in half-loaded

**Nothing extra required** — this works with your existing
`customerMenuBgImage` setting. If that setting is empty, the default
gradient is the hero banner; no broken/missing-image state is possible.

**Optional, not required:** if you want a *real* restaurant photo as the
permanent hero (recommended for the best first impression), upload one
via Admin → Settings → Customer Menu Background Image. 1080×1920px
(portrait) or larger, optimized to <300KB, works best.

---

## 2. Haptic Feedback — Customer App (Step 3 + beyond)

**Files touched:**
- `Menu/js/ui.js` — new `haptic()` export
- `Menu/js/app.js` — imported and called at 7 interaction points

**What changed:** This was the one confirmed gap from the earlier UI/UX
audit (Admin already had `haptic()`, Menu had none). Added a tiny
feature-detected helper using the native `navigator.vibrate()` API —
**no new dependency, no library**. Wired into:
- Size selection (Step 3)
- Add-on toggle (Step 3)
- Qty stepper +/− (Step 3 **and** Cart screen)
- "Add to Order" button (double-pulse — stronger confirmation)
- "Place Order" button (double-pulse)
- All 4 Call Waiter buttons

**⚠️ Production note — platform limitation, not a bug:**
`navigator.vibrate()` is **not supported on iOS Safari** (Apple has never
implemented the Vibration API, on any iOS browser, since they all use
WebKit). On Android Chrome it works perfectly. The `haptic()` helper
already feature-detects and silently no-ops where unsupported — so iOS
users simply get visual/toast feedback only, with no errors or crashes.
**There is no code fix for this** — it's an Apple platform restriction.
If haptics are business-critical on iOS, the only path is wrapping the
site in a native shell (Capacitor/Cordova) with a real haptics plugin —
out of scope for a pure web app.

---

## 3. "Need Assistance" → Admin Notifications

This was the biggest piece — required a real Firebase rules fix plus a
new listener, not just UI.

**Files touched:**
- `database.rules.json` — `tableRequests` rule fixed (see below)
- `Admin/js/features/tables.js` — new 4th listener, render functions, resolve action
- `Admin/index.html` — notification banner container + 8th KPI card
- `Admin/style.css` — banner/chip/alert-pulse styling

**Rules bug found and fixed while building this:** the original
`tableRequests` rule I gave you in the last package had `.validate:
"!data.exists() && ..."` — this is **create-only by design**, but it
meant **even the admin could never mark a request as resolved**, because
any update to an *existing* request would fail that validate check. Fixed
by moving the create-only restriction into `.write` (where it belongs,
gated by an admin-OR clause) and leaving `.validate` to just check shape.
**You must re-deploy `database.rules.json` again** — this is a real fix,
not cosmetic.

**What you'll see in Admin → Tables:**
1. A red alert banner appears at the top of the tab, one chip per pending
   request: *"Table 07 · Call Waiter · 2 min ago [Resolve]"*
2. An 8th KPI card, "Pending Requests", with a gentle pulsing border while > 0
3. A red badge on the sidebar **Tables** nav item — visible from any tab
4. A toast + vibration fires the moment a *new* request arrives (existing
   pending requests from before you opened the tab load silently, so you're
   not bombarded with toasts for old requests on every page load)

**⚠️ Production limitation — read this before you rely on it:**
`tables.js` is **lazy-loaded** — its Firebase listener only exists while
the Tables tab is open. **If your admin is on the Orders tab when a
customer taps "Call Waiter", nothing happens until they switch to
Tables.** The sidebar badge won't update either, because the module that
maintains it isn't loaded.

This is a real architecture gap, not something I patched around — fixing
it properly means moving the `tableRequests` listener into a globally-loaded
file (`main.js` or `auth.js`) instead of the lazily-loaded `tables.js`, so
it's always listening regardless of which tab is open. **I did not make
that change** because it touches your global init path, which I'd want
to confirm with you before editing (it's a different blast radius than a
feature-scoped file). If round-the-clock coverage matters — and for a
"call waiter" feature it probably does — say so and I'll build that
version next.

**Also recommended for real production use (not built — flagging only):**
- A **sound** alert (not just vibration) so a busy staff member notices
  even without looking at the screen. Browsers block autoplay audio
  without a prior user gesture, so this needs a one-time "enable sound
  alerts" toggle the admin taps once per session.
- If you want alerts to reach staff **away from a screen entirely**
  (phone in pocket), that requires a real push-notification pipeline
  (Firebase Cloud Messaging) — a bigger addition than this feature set.

---

## 4. Print Bill — Table Drawer

**File touched:** `Admin/js/features/tables.js` only (new function +
1 button + 1 switch-case)

**What it does:** A new "Print Bill" button sits next to "Print KOT" in
the table drawer's action row. Unlike Print KOT (kitchen-only, no
prices), this prints a **customer-facing, itemized bill across every
order in the session** — subtotal, tax, grand total — using the same
totals already shown live in the drawer's total card, so the printed
number always matches what staff see on screen.

**Nothing extra required.** Uses `window.open()` + `window.print()`,
same pattern as the existing KOT printer — no new library, no new
Firebase path, no rules change needed (it only reads data already
covered by the existing admin-authenticated listeners).

---

## 5. Order Action Buttons in Table Drawer

**File touched:** `Admin/js/features/tables.js`, `Admin/style.css`

**What was actually wrong:** `_advanceOrder(orderId, nextStatus)` already
existed in the code and was already wired into the click-delegation
switch statement — but **no button anywhere ever called it**. It was
dead code. Each order card in the drawer showed only a status badge and
an "Open in Orders tab" link — there was no way to actually accept,
progress, or cancel an order from the drawer itself.

**Now fixed:** each order card shows the right action for its current
status:
| Status | Button shown |
|---|---|
| Placed | "Accept Order" → Confirmed, + Cancel |
| Confirmed | "Mark Ready" → Ready, + Cancel |
| Ready | "Mark Served" → Delivered |
| Delivered / Cancelled | (none — terminal state) |

**Note on status naming:** the button says "Mark Ready" but writes the
literal status `"Confirmed"` → wait, re-read: Placed→**Confirmed**,
Confirmed→**Ready**, Ready→**Delivered**. These exact string values match
your *existing* `STATUS_SEQUENCES['Dine-in']` in `orders.js` — I did not
introduce a new status value (no `"Preparing"` literal is ever written),
specifically so this stays compatible with your existing status pipeline,
KDS grouping, and printing logic without touching `orders.js` at all.

**Nothing extra required** — no new Firebase paths, no rules change
(order writes were already covered by the rules fix from the previous
package).

---

## ✅ What's required before you push, overall

1. **Re-deploy `database.rules.json`** even if you already deployed the
   previous version — the `tableRequests` fix in this package is new.
2. Everything else in this package is drop-in; no other manual edits needed.
3. Test on **both** an Android and an iPhone if possible, specifically to
   confirm you're comfortable with the no-haptics-on-iOS limitation (#2 above).
4. Decide whether you want the cross-tab notification fix (#3's limitation)
   before launch, or as a fast follow — it doesn't block shipping, but staff
   should know "Call Waiter" alerts currently only show up while the Tables
   tab is open.

Nothing here required guessing at your Firebase config or credentials —
all five features are scoped entirely to client-side code + the rules file.

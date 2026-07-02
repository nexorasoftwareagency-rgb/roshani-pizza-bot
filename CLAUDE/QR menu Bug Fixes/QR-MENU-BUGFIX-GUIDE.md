# Fix Guide — Bottom Nav Touch Area + Promotions Page

Two bugs, two files, both confirmed root-caused (not guesses) against
your real current GitHub code.

## Files to replace

| File | Replace at |
|---|---|
| `app.css` | `menu/css/app.css` |
| `app.js` | `menu/js/app.js` |

No other files touched. `menu/index.html`, `menu/js/ui.js`,
`menu/js/session.js`, `menu/js/cart.js`, `menu/js/order.js`,
`menu/js/firebase.js`, and `database.rules.json` are all untouched —
confirmed via diff and a rules check (the Promotions bug turned out to
be a JS-side fetch bug, not a rules bug, so no `database.rules.json`
deploy is needed for this fix).

---

## Bug 1 — Bottom nav partially unclickable

### Root cause
`Menu/css/app.css`'s `.toast` element:
```css
.toast{ position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
  ... z-index:999; opacity:0; transition:opacity .25s ease; ... }
```

It's `position:fixed`, sits at the same vertical area as the bottom nav,
horizontally centered (so it overlaps the middle nav buttons — Status
and History), with `z-index:999` versus the nav's `z-index:35`. It was
hidden via `opacity:0` only — **`opacity:0` does not stop an element
from intercepting clicks.** So this invisible div sat permanently on top
of the middle bottom-nav buttons, swallowing taps meant for them, while
the outer buttons (Menu, Cart, Promos) worked because they fell outside
the toast's horizontal width.

### Fix
**Find:**
```css
.toast{ position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#1a1a1a; color:#fff; padding:12px 20px; border-radius:12px; font-size:13px; font-weight:600; z-index:999; opacity:0; transition:opacity .25s ease; max-width:90%; text-align:center; }
```

**Replace with:**
```css
.toast{ position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#1a1a1a; color:#fff; padding:12px 20px; border-radius:12px; font-size:13px; font-weight:600; z-index:999; opacity:0; pointer-events:none; transition:opacity .25s ease; max-width:90%; text-align:center; }
```

(`.toast.show{opacity:1;}` is unchanged — `pointer-events` isn't toggled
on the `.show` state because by the time a toast is actually visible,
it's brief and centered low enough that it's an acceptable, expected
tap-block; the bug was specifically that it never went away.)

---

## Bug 2 — Promotions page blank / "not connected"

### Root cause
This is a Firebase Realtime Database rules behavior, not a missing
feature. `database.rules.json` correctly grants public read on each
individual social-link field:
```json
"settings": {
  "Store": {
    "instagram": { ".read": "true" },
    "facebook": { ".read": "true" },
    "googleReviewLink": { ".read": "true" },
    "whatsappNumber": { ".read": "true" }
  }
}
```

But `Menu/js/app.js` was fetching the **parent** node in one call:
```js
const snap = await get(outletRef('settings/Store'));
```

Firebase does not apply a child's `.read` rule to a request for its
*parent* — a parent-level read falls back to the nearest ancestor rule,
which here is `settings`'s own rule (admin/rider-only). So this fetch
was **always rejected** for the unauthenticated QR customer, the promise
threw, `renderPromotionsLinks()` never ran, and the screen showed only
the static header text ("Stay Connected") with nothing else — which is
exactly the "not linked, no designed page" symptom.

**No rules change is needed** — the rules were already correctly shaped
for individual field reads, which is exactly the access pattern this fix
switches to.

### Fix

**Find** (in `Menu/js/app.js`):
```js
async function renderPromotionsScreen() {
    if (!_storeSettingsCache) {
        const snap = await get(outletRef('settings/Store'));
        _storeSettingsCache = snap.val() || {};
    }
    UI.renderPromotionsLinks(_storeSettingsCache);
}
```

**Replace with:**
```js
async function renderPromotionsScreen() {
    if (!_storeSettingsCache) {
        try {
            const [instagramSnap, facebookSnap, googleReviewSnap, whatsappSnap] = await Promise.all([
                get(outletRef('settings/Store/instagram')),
                get(outletRef('settings/Store/facebook')),
                get(outletRef('settings/Store/googleReviewLink')),
                get(outletRef('settings/Store/whatsappNumber'))
            ]);
            _storeSettingsCache = {
                instagram: instagramSnap.val() || '',
                facebook: facebookSnap.val() || '',
                googleReviewLink: googleReviewSnap.val() || '',
                whatsappNumber: whatsappSnap.val() || ''
            };
        } catch (e) {
            console.error('[Promotions] Could not load social links:', e);
            _storeSettingsCache = {};
        }
    }
    UI.renderPromotionsLinks(_storeSettingsCache);
}
```

No other changes needed — `UI.renderPromotionsLinks()` (in `ui.js`)
already correctly handles each of these 4 fields and already gracefully
shows a "No promotion links have been set up yet" message if all 4 come
back empty. That part was working correctly all along; only the fetch
that fed it data was broken.

---

## How "Promotions" connects to Settings (confirming the link works end-to-end)

This confirms the actual wiring, in case it's still unclear where to
manage these links:

1. **Admin → Settings tab** has 4 input fields: Instagram Handle,
   Facebook Page URL, Google Maps Review Link, WhatsApp Number
2. Saving Settings writes those into Firebase at
   `{outlet}/settings/Store/{instagram,facebook,googleReviewLink,whatsappNumber}`
3. The QR Menu app's Promotions tab (bottom nav, 5th icon) reads those
   same 4 fields and renders one card per field that has a value —
   "Rate us on Google", "Follow on Instagram", "Like us on Facebook",
   "Chat on WhatsApp" — each opening the right link in a new tab
4. Any field left blank in Settings simply doesn't get a card — no
   broken/empty buttons ever show

So the connection to Settings was always real; the bug was purely that
the read that powers step 3 was being rejected by Firebase before it
ever reached step 4's render logic.

---

## Testing checklist

1. Hard-refresh the QR Menu app on a phone
2. Tap each of the 5 bottom-nav buttons (Menu, Cart, Status, History,
   Promos) — including the **middle two specifically** (Status, History)
   since those are the ones that were silently blocked — confirm every
   tap registers and switches screens correctly, with no need to
   tap-and-hold or tap a specific corner
3. In Admin → Settings, fill in at least one of the 4 social fields
   (e.g. WhatsApp Number) if not already set, save
4. In the QR Menu app, tap the Promos tab — confirm a card now appears
   for that field, with the right icon, title, and that tapping it opens
   the correct link
5. Temporarily clear all 4 Settings fields and re-check the Promos tab —
   confirm it shows the graceful "No promotion links have been set up
   yet" message rather than a blank screen or a JS error in the console

# Guide.md — Where Everything Goes

This is the single, up-to-date guide for everything delivered across the
**POS redesign** and **Analytics/Reports redesign** rounds, now merged
into one consistent set of files — plus a new fix for the POS Size &
Add-ons screen (was opening as a partial drawer/sheet, now a true
full-screen page on mobile).

## Why a merge was needed

The POS round and the Analytics round were each built from a separate
GitHub pull, at different times. Since neither was pushed back to
GitHub in between, **the two `style.css` files I delivered separately
were divergent** — the POS one had POS fixes but not Analytics fixes
(which didn't exist yet at that point), and the Analytics one had
Analytics fixes but the POS duplicates/issues were still sitting there
unfixed, because that pull happened before the POS fixes existed in your
repo.

I caught this before it became a problem: I rebuilt one final version
starting from the more recent pull, then re-applied every POS fix on top
of it by hand, validating after every single edit. **The three files
below are the only ones you need — they supersede every previous
delivery in this conversation.**

---

## Files to replace (drop-in, no merging needed on your end)

| File | Replace at |
|---|---|
| `style.css` | `Admin/style.css` |
| `mobile-overrides.css` | `Admin/mobile-overrides.css` |
| `index.html` | `Admin/index.html` |

No JS files were touched anywhere in this conversation — HTML/CSS only,
as requested. Just overwrite these three and you're done; there's
nothing else to thread through manually.

---

## What's in each file

### `style.css` (665 lines changed vs. your current file)

**From the POS round:**
- Category tabs — consolidated from 3 competing definitions down to 1, warm gradient active state, fixed tap responsiveness
- Dish cards — consolidated transitions, added tap feedback, added `content-visibility` for performance on long menus
- Size picker cards (in the Add Item modal) — consolidated from 3 definitions to 1 (kept the nicer one with the animated checkmark badge), fixed tap feedback
- Add-on rows + checkboxes — consolidated from 3 definitions to 1 (removed two that were styling an HTML structure that doesn't actually exist — your add-on rows use a custom div-based checkbox, not a plain `<input>`)
- Quantity buttons (modal + cart row) — consolidated, fixed tap feedback
- "Add to Cart" / total footer — consolidated from 3 definitions (which had escalating `!important` flags fighting each other) into 1 clean warm-gradient button
- Cart list — now scrolls in its own bounded region; the cart panel now actually sticks in place on desktop while scrolling the dish grid (the CSS class was named `.sticky-cart` but had never been wired to `position: sticky` until now)
- Cart row layout — quantity badge on the left, item name + size shown as its own subtitle line, price + icon actions on the right (matches the reference design you shared earlier)
- Checkout button text — fixed a corrupted emoji (`âœ… Record Sale` → `✅ Record Sale`)

**From the Analytics round:**
- Removed a large amount of dead CSS left over from before the Reports table was migrated to Tabulator.js — `.report-table-wrapper`, `.report-cell`, `.report-date-cell`, `.report-cust-name`, `.report-cust-phone`, `.report-total-cell`, and duplicate `.report-date-input`/`.report-gen-btn` definitions. None of it was attached to anything anymore.
- Reports table header — was a flat corporate blue (`#4472C4`, completely off-brand); now uses the same warm orange gradient as the rest of the app. **Scoped to `#tab-reports` only** — Tabulator's theme is shared by 7 other tabs (Customers, Feedback, Inventory, Lost Sales, Payments, Rider Analytics, Riders), which I left alone since this round was scoped to Analytics specifically.
- Payment method badges (Cash/UPI/COD) in the Reports table — were using colors meant for a dark background, rendering almost invisible on the white table cells. Now each has a distinct, legible color.
- Excel/PDF export buttons, WhatsApp Bot Report button — smoother transitions, proper tap feedback.

### `mobile-overrides.css` (129 lines changed)

- Removed the dead Tabulator-superseded mobile card-layout CSS for `#tab-reports` (same root cause as above — it targeted `<td data-label="...">` elements Tabulator doesn't generate)
- **New this round:** the POS Size & Add-ons modal was opening as a 90vh bottom sheet with rounded top corners — a partial drawer, with the dish grid still faintly visible (blurred) above and around it. It's now a true full-screen page on mobile: fills 100% of the viewport height, no rounded corners, no backdrop bleed-through. Scoped to the existing mobile breakpoint (`max-width: 1024px`) — desktop keeps its right-side drawer, which is a normal, fine pattern for a mouse/larger-screen context and wasn't part of any complaint.

### `index.html` (2 lines changed)

- Just the corrupted-emoji fix on the "Record Sale" button text. Everything else byte-identical to your current file — confirmed via diff.

---

## Performance touches included throughout

- Replaced every `transition: all` in the touched areas with the
  specific properties actually animating (`transform`, `box-shadow`,
  `border-color`, etc.) — `all` makes the browser watch every animatable
  property every frame; naming 2–3 specific ones is cheaper.
- Added `touch-action: manipulation` to every tappable element across
  both POS and Reports — removes the ~300ms tap delay phones add by
  default before registering a tap (used for double-tap-to-zoom
  detection), so taps feel instant.
- Added `content-visibility: auto` to POS dish cards so the browser can
  skip layout/paint work for cards scrolled out of view.
- Did **not** add `content-visibility` to the Tabulator-rendered Reports
  table rows — Tabulator does its own row virtualization internally, and
  stacking a CSS-level visibility trick on top risks fighting the
  library rather than helping it.

---

## Testing checklist after applying

**POS:**
1. Add a single-size, no-add-on item (e.g. a Coke) → adds instantly, no modal, card pulses, badge shows `×1`
2. Add a multi-size item (e.g. a pizza with Small/Medium/Large) → **the Size & Add-ons screen now opens as a true full page**, not a partial sheet — confirm it fills the entire screen with no rounded corners or visible background behind it
3. Select a size, toggle an add-on, adjust quantity → total updates live, then tap Add to Cart
4. In the cart, confirm each row shows: quantity badge on the left, item name + size subtitle, price + icon buttons on the right
5. Complete a sale → confirm the checkout button reads "✅ Record Sale" correctly (not garbled text)

**Analytics / Reports:**
1. Open Analytics & Reports, generate a report for a date range with Cash/UPI/COD orders in it
2. Confirm the table header shows the warm orange gradient, not blue
3. Confirm payment badges are clearly readable with distinct colors
4. Test Excel and PDF export buttons — should still work exactly as before, just with smoother hover/tap feedback
5. Visit Customers, Inventory, or Riders tabs — confirm their tables are unchanged (still the original blue Tabulator theme, since that wasn't part of this scope)

---

## If anything looks off

Diff the delivered files against what's currently live before
overwriting, if you want to review line-by-line first. Every edit in
this round was validated for brace balance and zero duplicate
definitions immediately after being made — but a final visual pass
after deploying is always worth doing.

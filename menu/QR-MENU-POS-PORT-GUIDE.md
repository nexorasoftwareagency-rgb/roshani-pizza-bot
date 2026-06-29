# QR Menu — Ported From the Real POS Design

Fetched the actual current Admin POS design (`Admin/style.css`'s
`.pos-dish-btn-v4` card + `.category-tab` pills, as they really exist in
your repo today) and ported that same visual language onto the real QR
Menu app's Browsing screen. This is real code for your two actual files —
not a preview/mockup.

## Files to replace

| File | Replace at |
|---|---|
| `app.css` | `menu/css/app.css` |
| `ui.js` | `menu/js/ui.js` |

`menu/index.html` and `menu/js/app.js` needed **zero changes** — confirmed
via diff and a cross-check that every DOM id `ui.js` references still
exists. Nothing else in the app was touched.

---

## What changed, and why

### Category pills — now match `.category-tab` exactly
**Before:** a 48×48 icon circle + label underneath, icon色from a hardcoded
`CATEGORY_ICONS` map.
**After:** flat pill, plain text, gradient-orange fill when active — the
literal same visual treatment as the real POS's category tabs. The old
icon-circle design and the now-unused `CATEGORY_ICONS` constant were
removed.

### Dish cards — now match `.pos-dish-btn-v4` exactly
**Before:** a horizontal row — small 60×60 thumbnail, name+price beside
it, a separate small square "+" button.
**After:** a vertical card in a 2-column grid — a 4:3 image with the
price shown as a dark chip overlaid on the bottom-right corner of the
photo (not as separate text), then the dish name and its category label
underneath. The whole card is tappable; the separate "+" button is gone,
matching how POS works (tap the card, not a corner button).

### Small fixes made along the way
- Caught and removed a leftover CSS rule for the old "+" button
  (`.dish-card-add`) that would have been dead weight after the redesign
- Caught a transition conflict — a later "hover feedback" section was
  redefining `transition` on `.category-pill` in a way that would have
  silently killed the smooth color animation on the active state, leaving
  only the lift effect working. Fixed.
- Added `touch-action: manipulation` and `content-visibility: auto` to
  the new dish cards, matching the same performance treatment already
  applied to the real POS cards.

---

## Testing checklist

1. Open the QR Menu app on a phone, scan a table code as usual
2. Category row — confirm pills are flat (no icon circles), and the
   active one shows the gradient-orange fill
3. Dish grid — confirm 2 columns, each card shows the photo with the
   price as a dark badge in the bottom-right corner of the image, name
   and category text underneath
4. Tap anywhere on a card — confirm it opens the dish detail/customize
   screen exactly as before (click handling logic itself is unchanged,
   only the markup structure that triggers it changed)
5. Scroll through a long category — should feel smooth; this is what the
   `content-visibility` addition is for

# Promotions Page Redesign — Placement Guide

## Files to replace

| File | Replace at |
|---|---|
| `index.html` | `menu/index.html` |
| `app.css` | `menu/css/app.css` |
| `ui.js` | `menu/js/ui.js` |
| `app.js` | `menu/js/app.js` |

All 4 diffed clean against your current GitHub files — nothing outside
the Promotions page and the two carried-over bug fixes (below) was
touched. `menu/js/session.js`, `menu/js/cart.js`, `menu/js/order.js`,
`menu/js/discount.js`, `menu/js/firebase.js` are all untouched.

---

## Heads up — two earlier fixes were still not live

Before touching the redesign, I checked whether the two fixes from the
last round (**bottom-nav touch area** and **Promotions page blank
screen**) were actually deployed. Neither was — this fresh pull from
GitHub still had both bugs. Since I was rebuilding
`renderPromotionsScreen` anyway for this redesign, I folded both fixes
back in rather than build new UI on top of code that still couldn't load
its data. Both are included in the files above:

1. **`.toast` pointer-events fix** (`app.css`) — the invisible toast
   notification was sitting on top of the bottom nav's middle buttons
   and eating taps meant for them
2. **`settings/Store` parent-fetch fix** (`app.js`) — was fetching a
   Firebase path that gets silently rejected for the public/unauthenticated
   customer client; switched to reading each field individually, which
   the existing rules already correctly allow

If you'd deployed those separately already, these are safe no-op
re-applies — the code ends up identical either way.

---

## What's new: Active Offers section

This is genuinely new functionality, not just a re-skin. The Promotions
page's biggest problem wasn't just looks — it had *nothing to actually
promote*. It was just 4 social-media buttons under a generic "Stay
Connected" header.

**New:** a live "🎉 Active Offers" section at the top, sourced from the
exact same `discounts` node your Admin Discounts tab already manages
(that node already has public read access — no rules change needed).
Each active coupon-type discount now shows as a ticket-style card:

- The discount value in a bold orange strip (`20% OFF` or `₹100 OFF`)
- The offer name (from Discounts tab's "Name" field)
- Any conditions (`On orders above ₹299`, `up to ₹150 off`)
- The actual code in a dashed "ticket stub" chip
- A **"Use Code"** button

### Why only coupon-type discounts show here
I checked how QR checkout actually applies discounts
(`menu/js/discount.js`) — it only validates `type:"coupon"` discounts
where the customer enters a code. It does *not* auto-apply `global` or
`firstOrder` discount types. So this section deliberately only surfaces
coupon codes — showing a "global 10% off" banner here would have
promised something checkout couldn't actually honor. If you want
`global`/`firstOrder` discounts to auto-apply at QR checkout too, that's
a separate, real feature to build in `discount.js` — happy to do that
next if useful, just flagging it's not silently included here.

### "Use Code" — real UX, not just a copy button
Tapping "Use Code" jumps straight to the Cart screen, fills the existing
discount-code input with that code, and — if the cart already has items
— taps "Apply" automatically, reusing your existing validation logic
exactly as-is (no logic duplicated). If the cart is empty, the code
stays pre-filled with a toast telling them to add items first, so it's
one tap away the moment they do.

### Filtering logic
Offers only show if: `enabled !== false`, currently within their
`startsAt`/`endsAt` window, and haven't hit their `globalLimit` yet —
matching the same rules the real checkout validation applies. This is
informational display only; `discount.js`'s `validateCoupon()` is still
the single source of truth when a code is actually submitted.

---

## What changed visually

**Header:** replaced the plain "Stay Connected" text line with a proper
hero — icon, title, subtitle, subtle gradient wash.

**Social links section:** kept the same 4 brand-recognizable icon colors
(Google red, Instagram gradient, Facebook blue, WhatsApp green — people
recognize these by color, changing them would hurt usability) but
restyled the card shell to match the app's actual visual language —
softer shadows, tighter spacing, smaller/cleaner icon badges — and moved
it under its own "💬 Follow & Connect" section label instead of being
the only thing on the page.

**Layout:** the whole screen now scrolls as one page (`Active Offers`
then `Follow & Connect`) instead of the old single flat list, so it can
grow to however many offers/links you have without feeling cramped.

**Empty states:** each section shows its own graceful empty message
(dashed border, muted text) if there's nothing to show — no more risk of
a totally blank screen if either data source is temporarily empty.

---

## Testing checklist

1. Go to Admin → Discounts, create (or confirm you have) an **enabled,
   coupon-type** discount with a code, a name, and it's within its
   active date range
2. Hard-refresh the QR Menu app, tap the Promos tab (bottom nav)
3. Confirm the offer card appears with the correct value, name, and code
4. Tap all 5 bottom-nav buttons including the middle two (Status,
   History) — confirm every tap registers now
5. Add an item to cart, go back to Promos, tap **"Use Code"** on the
   offer — confirm it jumps to Cart with the code filled in and already
   applied (green success message, total reduced)
6. Clear the cart, repeat — tap "Use Code" with an empty cart, confirm
   it jumps to Cart with the code filled in but *not* applied yet, and
   shows the "add items, then tap Apply" toast
7. In Admin Settings, confirm your 4 social fields are filled in, check
   they render correctly under "Follow & Connect"
8. Temporarily disable the discount (or let it expire) — confirm the
   Active Offers section falls back to its empty state gracefully

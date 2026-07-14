# Roshani Rider App — Production Build v1.0.0
## Integration, Deployment & Cutover Guide

> Full React 19 + TypeScript + Vite rebuild of Roshani's `rider/` portal, matching
> FoodHubbie Rider's UI/UX/features/flow exactly, but wired to **Roshani's own,
> separate Firebase project** (`prashant-pizza-e86e4`), its real single-tenant
> schema, its real two-fixed-outlet model, and its real (ledger-free) earnings
> model. This is a completely separate project — it does not touch or replace
> the FoodHubbie `RiderApp/` in any way.

**Status:** `npx tsc --noEmit` — 0 errors. `npm run build` — succeeds, 0 warnings.
**Files:** 119 source files.
**Deliverables:** `roshani-rider-app-source.zip`, `roshani-rider-app-dist-prebuilt.zip`.

---

## 1. How this was built

Rather than reuse FoodHubbie's data layer with a new coat of paint, I cloned
`roshani-pizza-bot` fresh and read the real `rider/app.js` (1,842 lines),
`rider/js/*.js`, `database.rules.json`, and `storage.rules` line-by-line —
the same way I originally verified FoodHubbie against its own `app.js`. Every
Firebase path, status string, radius value, and message template below is
copied from what's actually deployed, not assumed from the FoodHubbie port.

The UI layer (screens, components, design system, gestures, offline handling,
error states) is FoodHubbie Rider's proven, already-audited implementation,
carried over wholesale and re-skinned. The data layer (services, contexts,
types, Firebase config) was rewritten from scratch against Roshani's real schema.

---

## 2. Real differences from FoodHubbie — verified, not assumed

| Area | FoodHubbie | Roshani (verified against real code) |
|---|---|---|
| **Firebase project** | `food-hubbie` | `prashant-pizza-e86e4` — a genuinely separate project |
| **App Check** | None | **Firebase App Check with reCAPTCHA v3** is active in the real app — replicated here (`src/lib/firebase.ts`) |
| **Tenancy model** | Dynamic multi-business discovery (`businesses/{bid}/outlets/{oid}/...`) | Exactly **two fixed outlets**, hardcoded: `pizza` 🍕 and `cake` 🎂 — no discovery needed, no `bid` anywhere. Paths are single-segment: `{outlet}/orders/{orderId}`, `{outlet}/otpAttempts/{orderId}`, `{outlet}/riderStats/{riderId}` |
| **Proximity gates** | Tiered: 1.0km (accept/reach-outlet), 0.3km (confirm-pickup) | **One uniform 0.5km radius**, used for accept, reach-outlet, *and* confirm-pickup |
| **Reached-drop proximity** | Gated at rider's configured radius | **No gate at all** — verified directly against `window.reachedDropLocation()`, which contains no distance check |
| **Status pipeline** | Placed→...→Ready→Out for Delivery→Reached Drop Location→Delivered | Placed→...→Ready→**Arriving at Restaurant**→**Arrived at Restaurant**→**Picked Up**→Out for Delivery→Reached Drop Location→Delivered (both map onto the same 4 UI steps) |
| **Wallet/ledger** | `riders/{uid}/wallet` + `riders/{uid}/ledger/{txId}` per-delivery transactions | **No wallet or ledger exists in the real schema at all.** `completeDelivery()` writes only `{outlet}/riderStats/{riderId}` = `{totalOrders, totalEarnings}`. The Wallet tab was redesigned around this — see §3 |
| **OTP-at-drop WhatsApp message** | Rider app sends the OTP via WhatsApp when reaching the drop location | **Deliberately does not.** Real code comment: *"Removed triggerWhatsAppAlert from here to hide OTP from Rider... The WhatsApp Bot will detect the field change and send the alert instead."* Replicated exactly — the rider app only ever sends an `ARRIVED` message, never the OTP itself |
| **Photo upload limit** | 200KB target | **300KB** — matches `storage.rules`' real `maxRiderPhotoSize()` exactly |
| **Brand color** | `#FF5200` | `#E84908` (with `#D946EF` purple as the Cake outlet's own accent, `#E84908` for Pizza) |
| **Customer-facing brand name** | "FoodHubbie" | **"Roshani Sudha"** — the actual name used in the real WhatsApp templates (the app itself is titled "Roshani Pizza \| Rider Portal" / "Roshani Rider Hub" per the real `manifest.json`) |

---

## 3. Wallet tab — honestly redesigned, not faked

Since there's no ledger, the Wallet tab shows:
- **Total lifetime earnings** (from `riderStats`, summed across both outlets)
- **Per-outlet breakdown** (Pizza vs Cake — a natural, real split since `riderStats` is already stored per-outlet)
- **Recent Deliveries** — a real activity feed built directly from completed orders (not a fabricated ledger)
- **"Awaiting Settlement"** — computed honestly as `totalEarnings − sum(settlements already recorded)`, using the real `settlements/{riderId}` node
- **Settlement History** — real, admin-issued records, same as FoodHubbie

Similarly, the Dashboard's "On-Time Rate" stat couldn't be honestly replicated —
Roshani's orders have no `estimatedMinutes` field to compare actual delivery time
against. I swapped that card for a real "This Week" earnings figure instead of
inventing a percentage with no backing data.

---

## 4. One thing worth double-checking before go-live

The real rules do have a properly-scoped `$orderId`-level write rule (unlike the
FoodHubbie rules, which I flagged as ambiguous in that project's guide) — so I'm
more confident here that a rider's writes to their own assigned order are cleanly
permitted. Still worth one real accept→deliver cycle on a test order before
rolling out to real riders, same standard I'd hold any Firebase rules change to.

One gap I noticed but left alone: `database.rules.json`'s `.indexOn` for
`{outlet}/orders` doesn't include `assignedRider`, even though both the real
app and this port query it via `orderByChild('assignedRider')`. Harmless (just an
unindexed-query console warning), pre-existing in the real app, not something I
introduced — flagging it in case you want to add it for query performance at scale.

---

## 5. Local setup

```bash
unzip roshani-rider-app-source.zip -d RoshaniRiderApp
cd RoshaniRiderApp
npm install
npm run dev
```

No `.env` needed — Firebase config is hardcoded in `src/lib/firebase.ts`, matching
the real `rider/js/firebase.js` convention exactly (including the App Check site key).

## 6. Build & deploy

```bash
npm run build   # outputs to RoshaniRiderApp/dist
```

Check `firebase.json` / `.firebaserc` in the `roshani-pizza-bot` repo for the
existing rider hosting target before deploying — same safe-cutover principle as
FoodHubbie applies: deploy to a staging target first, test with 1–2 real riders
through a full pizza *and* cake delivery, then cut over the production target.

---

## 7. File structure

Same architecture as FoodHubbie Rider (see that project's guide for the full
tree) — `lib/`, `types/`, `services/`, `contexts/`, `hooks/`, `components/{ui,
layout, auth, dashboard, orders, active-trip, modals, wallet, earnings, profile,
notifications, shared}`, `pages/`. The two projects share no files or state;
every Firebase-touching layer was rewritten against Roshani's real schema.

---

*Built by cloning and reading the real roshani-pizza-bot repo directly — every
path, radius, status string, and message template is verified against actual
deployed code, not inferred from FoodHubbie's equivalent.*

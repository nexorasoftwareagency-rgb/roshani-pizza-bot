# Changelog

All notable admin/rider PWA changes are documented in this file. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> **Note on commit history (v5.1.5 and v5.1.5.1):** The two commits also
> contain the in-progress **Promotions module** work
> (`Admin/index.html`, `Admin/js/features/promotions.js`,
> `Admin/js/features/promotions-guide.js`, `bot/index.js`) because the
> pre-deploy stash failed to fully revert already-modified files
> (`git stash push -- <paths>` does not revert already-staged edits; a
> `git checkout HEAD -- <file>` is required). The deployed state is
> correct (Firebase uploads all files in `Admin/` regardless of git
> status), but if you read the diff for `071b2e6` or `3eb70fb` you will
> see promotions code alongside the live-tracker changes. Decision was
> made to leave the history as-is and document it here rather than
> rewrite already-deployed history.

---

## [Unreleased] — Admin v5.1.6 (planned)

### Planned
- Finish Promotions module: campaign list/builder, send/preview, kill-switch
  widget, opt-out handling in bot, scheduled pickup + auto-expiry.
- i18n on Analytics (PR 3 from v5.1.1 refactor follow-up).
- Table pagination + search (PR 2 from v5.1.1 refactor follow-up).
- IST audit across all date filters (PR 4 from v5.1.1 refactor follow-up).
- Inventory-log cleanup cron (no TTL on `/logs/inventory/` today).

---

## Admin v5.1.5.2 — 2026-06-02

### Fixed — Rider Analytics mobile (PWA)
- **Title-controls row stayed side-by-side on phone.** Root cause: base
  `.flex-row` in `style.css` has `flex-direction: row !important`, so the
  1024px override without `!important` was silently losing. Added
  `!important` to `flex-direction: column` on the title row and the
  controls card at both 1024 px and 480 px.
- **Controls card children did not stack on phone.** Same root cause:
  the controls card itself needed `flex-direction: column !important`,
  and `report-date-input`/`select`/`btn-primary`/`btn-secondary`
  children needed `flex: 1 1 100% !important; width: 100% !important`
  at the 1024 px breakpoint (previously only the rider select was full
  width, dates/buttons were 50/50 on phone).
- **KPI grid had a hole in row 2.** The `.warning` class was on the
  4th card (Avg. Delivery Time) which made it `grid-column: span 2`,
  producing a 1+1+2+1 layout. Moved `.warning` to the 5th card (Rider
  Rating) for a clean 2+2+1 layout.

### Changed
- `mobile-overrides.css?v=5.1.5.2` (was 5.1.5).
- `style.css?v=5.1.5.2` (was 5.1.5).
- `CACHE_NAME = 'roshani-erp-v5.1.5.2'` (was v5.1.5).
- `ADMIN_VERSION = '4.11.1'` (was 4.11.0).

---

## Admin v5.1.5.1 — 2026-06-02 (commit `3eb70fb`)

### Fixed
- **Live Tracker status pill class mismatch:** `tracker.js` was emitting
  `class="rider-status-pill-v4 delivery"` while the shared CSS (built for
  `riders.js`) uses `on-delivery` after `displayStatus.toLowerCase().replace(/\s+/g, '-')`.
  Patched the tracker to emit `cls: "on-delivery"` and added the missing
  `.rider-status-pill-v4.on-delivery` rule (amber background, dark amber
  text).
- **Marker pill anchor offset:** `L.divIcon` was instantiated with
  `iconSize: null`, falling back to a CSS `translate(-28px, -14px)`
  workaround that placed the pill roughly 28 px northwest of the actual
  rider location. Replaced with explicit `iconSize: [70, 28]` and
  `iconAnchor: [35, 14]` (pill bottom-centre on the lat/lng) and dropped
  the now-unused transform.

### Removed
- Unused `STATUS_COLORS` constant in `tracker.js`.
- Unnecessary transform on `.rider-marker-pill`.

> Also contains in-progress Promotions module changes (see note at top).

---

## Admin v5.1.5 — 2026-06-02 (commit `071b2e6`)

### Added — Live Tracker (`#tab-liveTracker`)
- Right-hand sidebar `#trackerSidebar` (260 px, scrollable to 600 px) with
  online riders list `#trackerOnlineList` + collapsible offline section
  `#trackerOfflineSection` (toggled by `#btnTrackerShowOffline`).
- Map wrapper `.tracker-map-wrap` containing `#adminLiveMap` and a
  horizontal mobile chip rail `#trackerMobileChips` (visible ≤ 768 px in
  place of the sidebar).
- Header status strip `#trackerStats` with three live counters
  (`N Online · M On Delivery · K Offline`) and a collapse arrow
  `#btnToggleTrackerSidebar` that hides the sidebar and lets the map
  fill the row (`#trackerStats` font-size 10 px on mobile so it fits).
- "Live · Last update N s ago" auto-refresh ticker
  `#trackerLastUpdated` driven by `startLastUpdatedTicker()` every 5 s.
- `tracker.js` now exports `initLiveRiderTracker`,
  `stopRiderLocationListener`, `cleanupLiveRiderTracker`. Reads
  **global** `/riders` (both outlets).
- Rich Leaflet popups (`.tracker-popup`): photo, name, status pill,
  phone, current order id, "Open in Google Maps" and "Locate on map"
  actions, last update time. Emojis used instead of Lucide icons so the
  popup is self-contained.
- Marker pills: `L.divIcon` with rider first name and a coloured status
  dot. `iconSize: [70, 28]`, `iconAnchor: [35, 14]` (v5.1.5.1).
- `window.trackerLocateRider(id)` global for the "Locate" button.

### Changed — Rider Analytics (`#tab-riderAnalytics`)
- **1024 px and below:** title stacks above the controls card; rider
  select is full-width; From/To dates are 50/50; "Analyze" and
  "Settle" buttons are 50/50 with a 140 px minimum.
- **480 px and below:** every control stacks 100 % with a 38 px
  minimum height. KPIs switch to a 2 × 2 grid with the 5th card
  ("Rider Rating") spanning both columns (2 + 2 + 1). Chart height
  drops to 200 px. Section title 18 px.

> Also contains in-progress Promotions module changes (see note at top).

---

## Admin v5.1.4 — 2026-06-01 (commit `edb99e9`)

### Fixed — Add New Dish modal
- `modal-content` is now a flex column with `min-height: 0`, allowing
  inner panes to scroll.
- `.modal-grid-2col` is `flex: 1; min-height: 0; overflow-y: auto`.
- `.modal-footer` is sticky to the bottom of the modal.
- `#dishModal` scrim uses `rgba(0, 0, 0, 0.25)` with **no** backdrop
  blur; other modals keep the dim/blur.

---

## Admin v5.1.3 — 2026-06-01 (commit `8533da8`)

### Fixed — Menu page mobile layout (`#tab-menu`)
- `.panel-header` column-stacks below the breakpoint.
- "Add Dish" button is `flex-shrink: 0` so it never gets squeezed.
- Dish card uses tighter padding and typography for narrow viewports.
- `.menu-grid` drops to 2 columns at 480 px.
- "Add New Dish" modal grid is single-column with the image stacked
  above the form fields.

---

## Admin v5.1.2 — 2026-06-01 (commit `adc0aaa`)

### Fixed
- Analytics date filter now wraps on small screens. Root cause:
  `.flex-row` has `flex-wrap: nowrap`; the existing `.flex-wrap-mobile`
  only changed child widths. Force `flex-wrap: wrap` on the parent at
  768 px and 480 px breakpoints.

### Follow-up fix (`7162ffb`)
- `clearLostSales` was being imported through the wrong module path
  (`customers.js`) in `main.js:140`; corrected to `lost-sales.js`.

---

## Admin v5.1.1 — 2026-05-31 (commit `2657fda`)

### Refactor — Analytics module split
- Split `analytics.js` into three ES modules: `analytics.js` (~340
  lines), `lost-sales.js` (~120), `customers.js` (~120).
- 12 bug fixes merged in the same commit.
- Mobile adaptation: controls stack below 768 px; tables become
  scrollable; chart height 240 px.

### Deferred (PRs 2-4)
- i18n on analytics (PR 3).
- Table pagination + search (PR 2).
- IST audit across all date filters (PR 4).

---

## Admin v5.1.0 — Inventory v2 (commit `f8961c8`)

- Full rewrite of `Admin/js/features/inventory.js`.
- Follow-up commit `47b004a`: slice filtered rows to current page
  before mapping; rename shadowed `t` → `threshold`;
  `refreshInventoryTogglesForOutlet()`; localised empty-state + toast;
  stock label flex layout; drop redundant `formatTimestamp` branch +
  unused import.

---

## Rider v5.0.1 — 2026-05-30 (commit `2ef083d`)

### Removed
- Dead CSS selectors `.badge-dot:empty` and `.badge-dot[data-count="0"]`
  from `rider/style.css` (unreachable — `renderNotifications` always
  sets `innerText`).

### Changed
- Bumped rider asset `?v=5.0.0` → `?v=5.0.1` in `index.html` and
  `login.html`.
- Bumped service worker `CACHE_NAME` `roshani-rider-v8.0` →
  `roshani-rider-v8.1`.

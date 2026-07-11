# Analytics — Unified Redesign (Guide.md)

A single card-based design — KPI cards with sparklines, a Sales Overview chart, Top Highlights, a Payment Method donut, and a completely rebuilt Detailed Sales Data table — now applies at **every screen size**, with bold, saturated color throughout and a substantial desktop typography increase. Nothing from the old desktop layout survives unchanged.

*(This started as a mobile-only build — file names still say "mobile" for that reason — then was extended to replace the desktop layout too, then to replace the Detailed Sales Data table itself. Each expansion is documented below.)*

---

## 1. What this is, and what's kept vs. replaced

| | Old desktop | New (all sizes) |
|---|---|---|
| Filter bar | Title + date inputs + selects + buttons, one crowded row | Hero header + toolbar card with quick presets (Today/7D/30D/Custom) + Filters flyout |
| Top stats | 4 KPI cards (icon bubbles, gradient) + separate Payment Breakdown row | 4 KPI cards with sparklines + trend, one Payment Method donut |
| Comparison | Opt-in via a toggle button, shown as a separate bar | Always-on, shown directly on every KPI card |
| Revenue Trends chart | Separate line chart | Replaced by the new Sales Overview chart (date-range-adaptive) |
| Order Type Distribution chart | Separate donut chart | **Not replaced — see Section 5** |
| **Detailed Sales Data table** | Tabulator grid | **Rebuilt from scratch** — plain HTML table, horizontally scrollable, no Tabulator dependency for this view at all |
| Color treatment | Light 10%-opacity tints on icon backgrounds/badges | Solid, saturated fills — white icon/text on top |
| Desktop text size | Same sizing as mobile, just more horizontal room | Meaningfully bigger and heavier at every element, not just wider layout |

Everything pulls from the **same data fetch** (`analytics.js`'s existing `generateCustomReport()`) — nothing is fetched twice, and nothing can disagree on the numbers.

---

## 2. File manifest

| File | Goes where | What it does |
|---|---|---|
| `analytics-mobile.html` | Inserted into `Admin/index.html`, as the **first child** inside `<div id="tab-reports">` | The new section's markup — hero header, date toolbar, KPI cards, Sales Overview chart, Top Highlights, Payment donut, custom Detailed Sales Data table, Excel + PDF export buttons |
| `analytics-mobile.css` | Append to end of `Admin/mobile-overrides.css` | All styling for the new section at every width — bold/solid color treatment throughout, a significant desktop typography increase, the new table's styles, and the visibility rules that hide the entire old KPI/chart/table layout everywhere |
| `analytics-mobile.js` | New file at `Admin/js/features/analytics-mobile.js` | All data computation and rendering logic — sparklines, the big chart, Top Highlights math, the payment donut, New/Repeat customer counts, and the custom table (sorting, badges, rendering) |
| *(edit)* `analytics.js` | Five small additions to the existing file | Wires the new module in — see Section 3 |

File names still say "mobile" — this started as a mobile-only build before being extended to replace the desktop layout too. Renaming would mean updating cross-references across every file in this delivery for no functional benefit; flagging it here so it's not confusing.

---

## 3. The `analytics.js` edit — six additions, nothing removed or rewritten

### 3.1 — Add an import at the top of the file

**Find:**
```js
import { createGrid, updateGridData, GRID_DEFAULTS, PAGINATION_DEFAULTS } from '../tabulator-setup.js';
```

**Add directly below it:**
```js
import { initMobileAnalyticsUI, renderMobileAnalytics, cleanupMobileAnalytics } from './analytics-mobile.js';
```

### 3.2 — Wire the one-time UI setup into `loadReports()`

**Find** (end of `loadReports()`):
```js
    console.log(`[Reports] Initializing with default range: ${fromVal} to ${toVal}`);
    generateCustomReport();
}
```

**Replace with:**
```js
    console.log(`[Reports] Initializing with default range: ${fromVal} to ${toVal}`);
    initMobileAnalyticsUI(generateCustomReport);
    generateCustomReport();
}
```

### 3.3 — Always fetch the comparison period (needed for "vs Previous Period" on every mobile KPI card)

The desktop view only fetches the previous period's data when the "vs Previous" toggle is on (`if (_compareMode) { ... }`). The reference design shows a trend percentage on *every* KPI card, all the time — not behind a toggle. So this fetch needs to always run.

**Find:**
```js
        if (_compareMode) {
            const rangeMs = new Date(to).getTime() - new Date(from).getTime();
```

**Replace `if (_compareMode) {` with a bare block** (keeps the same local-variable scoping, just removes the condition):
```js
        // Always fetch the previous-period comparison data now — the
        // mobile view's KPI cards show "vs Previous Period" on every
        // card unconditionally, not just when the desktop compare
        // toggle is on. (Was: `if (_compareMode) { ... }`.)
        {
            const rangeMs = new Date(to).getTime() - new Date(from).getTime();
```

Everything else inside that block (down to its closing `}`) stays exactly as it is — only the `if (_compareMode)` condition itself is removed, replaced with a plain `{`.

### 3.4 — Feed the new section at the end of `renderFromCache()`, and drop the three now-superseded calls

**Find** (these three calls are not adjacent in the real file — there's an unrelated block between the first and the other two; shown here exactly as it appears, not simplified):
```js
    buildGrid(filtered);

    if (_compareMode && prevPeriodData.length > 0) {
        const bar = document.getElementById('reportComparisonBar');
        if (bar) bar.classList.remove('hidden');
        _renderComparison();
    }

    renderRevenueChart(filtered);
    renderOrderTypeChart(orderTypeCounts);
}
```

**Replace with:**
```js
    if (_compareMode && prevPeriodData.length > 0) {
        const bar = document.getElementById('reportComparisonBar');
        if (bar) bar.classList.remove('hidden');
        _renderComparison();
    }

    renderMobileAnalytics(salesData, prevPeriodData); // fire-and-forget; same fetch, feeds the new section (including its own table)
}
```

This removes `buildGrid()` (the Tabulator table) along with `renderRevenueChart()` and `renderOrderTypeChart()` — all three rendered into elements that are now permanently hidden, since the new section includes its own replacement for all three (a custom table, the Sales Overview chart, and the Payment Method donut). None of `buildGrid`, `renderRevenueChart`, `renderOrderTypeChart`, the `Tabulator` import, or the `#reportTableBody`/`#revenueChart`/`#orderTypeChart` elements in `index.html` need to be deleted — nothing breaks if you leave them in place (they just won't render into anything visible), so this is safe to do incrementally or skip if you'd rather revisit later. `cleanupReports()`'s existing guards around `revenueChart`/`orderTypeChart` stay harmless no-ops either way.

The `_compareMode`/`_renderComparison()` block in the middle is **deliberately left untouched** — it writes into `#reportComparisonBar`, which `analytics-mobile.css` already hides permanently at every width. Leaving it costs nothing (it just updates an invisible element), and removing it isn't necessary for anything in this guide to work; flagged here only so it doesn't look like an oversight.

Note this passes `salesData` (the full, **unfiltered** order set for the date range) rather than `filtered` (which respects the desktop's Delivered/All/Cancelled-only dropdown) — the new section's Top Highlights needs to see Delivered *and* Cancelled *and* Pending simultaneously to show the breakdown, and the new table shows every status too (matching what the old Tabulator table did). KPI totals (Revenue/Orders/Avg Order Value) are still computed from the Delivered subset internally, for consistency with what "Total Revenue" has always meant in this app.

### 3.5 — Make Excel/PDF export always match the table (not the old Status filter)

**Find:**
```js
function _filteredForExport() {
    const filter = STATUS_OPTIONS[_currentStatusFilter] || STATUS_OPTIONS.delivered;
    return salesData.filter(filter.match);
}
```

**Replace with:**
```js
function _filteredForExport() {
    // Always exports everything in the selected date range, matching
    // the new Detailed Sales Data table exactly (all statuses — the
    // table's own Status column shows Delivered/Cancelled/Pending per
    // row). Previously this respected the Status filter dropdown
    // (_currentStatusFilter, defaulting to "Delivered Only"), which
    // meant an export could silently contain fewer rows than what the
    // table showed on screen, with no obvious reason why.
    return salesData;
}
```

This was a direct decision, not an assumption — the original mismatch (table shows all statuses, export defaulted to Delivered-only) was flagged and confirmed before making this change.

**One consequence worth knowing:** `#reportStatusFilter` (the "Delivered Only / All Orders / Cancelled Only" dropdown) no longer affects anything, anywhere — not the table, not export. `analytics-mobile.js`'s `initMobileAnalyticsUI()` has already been written to leave it un-relocated rather than show a control that visibly does nothing (see its own comments). If you want that filter to matter again for something, it needs a new job — right now it's inert.

### 3.6 — Clean up on tab exit

**Find:**
```js
export function cleanupReports() {
    if (revenueChart) { revenueChart.destroy(); revenueChart = null; }
    if (orderTypeChart) { orderTypeChart.destroy(); orderTypeChart = null; }
}
```

**Replace with:**
```js
export function cleanupReports() {
    if (revenueChart) { revenueChart.destroy(); revenueChart = null; }
    if (orderTypeChart) { orderTypeChart.destroy(); orderTypeChart = null; }
    cleanupMobileAnalytics();
}
```

That's the entire `analytics.js` diff — six additions, zero deletions, zero rewritten functions.

---

## 4. Business-logic decisions — please verify these match your intent

Two of the reference design's metrics (New Customers, Repeat Customers) don't correspond to anything already computed elsewhere in the codebase, so I had to define them. Both definitions are implemented in `analytics-mobile.js` and documented in its header comment, but they're judgment calls you should sanity-check against what you actually want the numbers to mean.

*(This section reflects a corrected version of the logic — a first pass had four real issues, caught in a follow-up self-review: a missing upper bound that inflated the previous-period new-customer count, a sparkline that faked its data instead of computing it, a payment category that doesn't exist in your real data model, and a percentage that displayed like a trend but was computed as a composition ratio. All four are fixed in the files delivered here.)*

- **New Customer** = a customer whose `registeredAt` timestamp (from the existing `pizza/customers/{phone}` node — the same one `customers.js` already reads) falls **inside** the selected date range.
- **Repeat Customer** = a customer who placed a **Delivered** order inside the selected range, **and** whose `registeredAt` is **before** the range start.
- Customers with no `registeredAt` on file are counted in **neither** bucket, rather than guessed one way or the other.
- **Delivered / Cancelled / Pending** percentages are **composition ratios** — each count divided by the total orders in the range — matching the reference, where these three show plain percentages with no +/- sign.
- **Repeat Customers' percentage is the one exception**: the reference shows it with a `+` sign ("+10.3%"), which reads as a trend, not a composition ratio. It's computed as the period-over-period change in repeat-customer count (this period's repeat count vs. the equivalent previous period's), using `deltaOf()` — the same comparison function every KPI card already uses — rather than a share of this period's own customers.
- **New Customer sparkline** — each new customer is attributed to the day of their *earliest* order within the range (found explicitly, not by relying on array order, since orders are fetched newest-first elsewhere in this app).
- **Payment Method buckets are `cash` / `upi` / `cod`** — the exact three categories your existing desktop Payment Breakdown row already uses. An earlier pass invented a fourth "Card" category to match the reference's "Card Payments" label; there's no such payment method in your actual data, so real COD orders were quietly being counted under it. The mobile donut's third slice is now labeled "COD Payments" instead.

The one **new** Firebase read this adds: `pizza/customers`, fetched once per "Generate Report" click (same cost as `customers.js`'s own `loadCustomers()` — not a per-render or per-scroll cost).

**Excel and PDF export** — both buttons are click-forwards to the existing `#btnDownloadExcel` / `#btnDownloadPDF` buttons, which already have complete, working implementations in `analytics.js` (`downloadExcel()` and `downloadPDF()`, the latter using the `jsPDF` + `jspdf-autotable` libraries already loaded in `index.html`). Nothing new was built for export — the new section just gives the same two working exports a spot in the redesigned layout, styled with the same green/rose color convention the original desktop buttons already used.

---

## 5. Deliberately not built / no longer available — please confirm these are OK

- **Order Type Distribution chart (Online vs POS vs Dine-in)** — this desktop chart isn't replaced by anything in the new design. The new Payment Method donut shows a *different* breakdown (Cash/UPI/COD, not order channel). If you use Order Type Distribution regularly, it's currently just gone — worth flagging before you ship this, since it's the one piece of real information this redesign drops rather than relocates. Happy to add a small "Order Type" donut alongside the Payment Method one if you want it back.
- **Tabulator's extra table features are gone from this view** — the new Detailed Sales Data table is a plain HTML `<table>`, not Tabulator. It keeps click-to-sort on every column (ascending/descending) and full horizontal + vertical scrolling, but it does **not** have Tabulator's column reordering (drag to rearrange), column resizing (drag to widen/narrow), or row selection. If any of those mattered to you day-to-day, this is a real reduction, not just a visual change — worth trying the new table for a few days before committing, since it's a meaningfully different tool even though it shows the same data.
- **Bottom navigation bar** — the reference screenshot shows a native-app-style bottom tab bar (Dashboard/Orders/Live/Walk-in/Tables/Analytics). Per your instruction, this isn't duplicated — your app already navigates via the sidebar + `switchTab()`, and building a second, parallel navigation system would conflict with that rather than complement it.
- **Top hamburger button** — similarly, your app already has a persistent `#mobileAppHeader` with its own hamburger wired to `toggleSidebar()`. The new "Analytics" hero header is page-specific decorative content (title, subtitle, outlet indicator) that sits *below* your existing app-wide mobile header, not a replacement for it.
- **Outlet switcher** — the green "PIZZA ▾" pill is a **read-only indicator** (shows `state.currentOutlet`, capitalized), not a working dropdown. Actually switching outlets is an app-wide concern that affects every tab, not something scoped to Analytics — building a real switcher here would mean either duplicating or fighting whatever outlet-switching mechanism exists (or doesn't yet exist) elsewhere in the app. Flagging as a separate, larger piece of work if you want it.
- **Custom calendar widget** — tapping "Custom" reveals the *existing* native `#reportFrom`/`#reportTo` date inputs inline rather than a bespoke calendar picker matching the reference's exact visual style. Building a fully custom date-range picker component is a substantial standalone task; reusing the native inputs means zero new date-logic bugs, at the cost of not matching the reference's picker UI pixel-for-pixel.
- **"This Week ▾" dropdown** on the Sales Overview card — would functionally duplicate the Date Range control already at the top of the page. Not added; the chart now adapts its own granularity automatically based on how wide a range is selected instead (see Section 4).

---

## 6. Integration steps

1. Copy `analytics-mobile.js` into `Admin/js/features/analytics-mobile.js`.
2. Make the five edits from Section 3 to `Admin/js/features/analytics.js`.
3. Open `analytics-mobile.html`, copy its contents, and paste as the **first** element inside `<div id="tab-reports">` in `Admin/index.html` (before the existing "Sales Analytics & Reports" title row).
4. Open `analytics-mobile.css`, copy its contents, and paste at the end of `Admin/mobile-overrides.css`.
5. Hard-refresh and open the Analytics tab — the new section now shows at every width, so check both a phone and a desktop browser.

No changes to `style.css`, no changes to any other tab, no build step.

---

## 7. Testing checklist

1. **Every width, not just mobile**: confirm the new section (hero header, KPI cards, Sales Overview, Highlights, Payment donut) shows at both a narrow phone width AND full desktop width — not just below 768px. Confirm the old filter bar, old 4-card KPI row, Payment Breakdown row, and comparison bar are gone at every width (check DevTools, not just visually — they should not be in the rendered layout at all, not just scrolled past).
2. **KPI cards + sparklines**: confirm all 4 cards populate with real numbers and each sparkline draws a distinct trend line in its card's accent color. On desktop, confirm they lay out 4-across, not stretched 2x2.
3. **Date presets**: tap Today, 7D, 30D — confirm the date range updates and all numbers refresh. Tap Custom — confirm the existing native date inputs appear inline and still work.
4. **Filters flyout**: tap "Filters" — confirm the Outlet select appears and still filters correctly. (Status is deliberately not here anymore — see Section 3.5.)
5. **Sales Overview chart adapts to range**: with a ≤7 day range, confirm weekday labels (Mon, Tue…). With a 30-day range, confirm date labels instead. With a multi-month custom range, confirm it buckets by week rather than cramming in dozens of daily points. Confirm the peak point renders larger/filled, and tapping any point shows the styled tooltip.
6. **Top Highlights**: confirm Delivered + Cancelled + Pending counts sum to the total order count for the range, and percentages are consistent.
7. **New vs Repeat Customers**: cross-check a known customer's phone number against `pizza/customers/{phone}/registeredAt` in Firebase directly to confirm they land in the bucket you'd expect, given the definitions in Section 4.
8. **Payment donut**: confirm the legend's three percentages sum to ~100% and match the donut's visual proportions.
9. **Export buttons work and match the table exactly**: tap both Excel and PDF, confirm each triggers its real download (check your downloads folder, not just that a click fired). Note the row count shown in the table (top-right of the Detailed Sales Data card) and confirm each exported file has the same number of rows — including at least one Cancelled or Pending order, not just Delivered ones.
10. **New Detailed Sales Data table**: confirm it renders below the Payment Method section, shows every order in the range (not just Delivered — check a Cancelled or Pending order appears), and click each column header to confirm sort works both directions (arrow indicator should flip). On a narrow screen, confirm you can swipe the table horizontally to reach the Total column without it being squeezed.
11. **Bold color check**: confirm KPI icon chips, Top Highlights icons, table Type/Payment badges, active range pill, Filters button, and both export buttons all show solid/saturated color fills — not pale tinted backgrounds. This was the main visual complaint this round; if anything still looks washed out, it's worth flagging exactly which element.
12. **Desktop typography check**: compare the same KPI card or heading at ~400px width vs. ~1400px width — text should be visibly larger AND bolder on the wide screen, not just the same size with more surrounding whitespace.
13. **Tab switch away and back**: confirm no console errors, and confirm charts don't duplicate/stack on repeated visits (this is what `cleanupMobileAnalytics()` in Section 3.6 prevents).

---

## 8. Rollback

- Remove the six additions from `analytics.js` (each is clearly commented) — if you removed `buildGrid()`/`renderRevenueChart()`/`renderOrderTypeChart()` per Section 3.4, restore those three lines too, and restore the original `_filteredForExport()` per Section 3.5 if you want the Status filter to matter again.
- Delete `analytics-mobile.js`.
- Remove the `#reportsMobileView` block from `index.html`.
- Delete the `analytics-mobile.css` block from the end of `mobile-overrides.css`.

Unlike the original mobile-only version of this build, this rollback **does** restore the old desktop view — the CSS in `analytics-mobile.css` is what's hiding the old KPI rows, comparison bar, Tabulator table, and the two charts at every width now, not just ≤768px. Deleting that block brings all of it back exactly as it was.

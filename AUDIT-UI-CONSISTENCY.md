# Admin UI Consistency Audit — Findings (gold = Analytics/Reports)

Research-only audit across all Admin tabs. Reference design language:
`.kpi-card-v4` (glass, radius 24px, 60px icon-wrap, glow), `.glass-card.p-24`,
`.section-title`, Tabulator grids, `.badge-type`/`.badge-payment` pills, lucide icons.

## P0 — Undefined classes (cross-tab wins, one-line CSS fixes)

| Class | Used in | Defined? | Fix |
|---|---|---|---|
| `.badge-placed/.badge-confirmed/.badge-delivered` | `tables.js:341` | No | Add pill variants |
| `.btn-text` | dashboard, walkin-picker, mobile-overrides | No (only `-primary-sm`/`-danger`) | Add base `.btn-text` |
| `.btn-sm` | promotions, orders | No | Add size variant |
| `.form-label/.required-label/.required-star` | menu.js | No (only `.form-label-small`) | Add base form-label |
| `.section-title/.panel-header/.panel-title` | dashboard, orders, walkin | Only scoped to `#tab-reports/#tab-menu/#tab-liveTracker/#tab-tables` | Promote to base |
| `.table-responsive` | dashboard, orders | Only in `mobile-overrides.css:1198` | Promote to base |
| `.skeleton-dish-card` | menu.js | Only mobile rule (`mobile-overrides.css:39`) | Add desktop rule |
| `.premium-shadow-v4` | menu (dead) | No | Remove from markup |
| `tr.table-header-row` | live | No | Add or replace markup |

## P1 — Design-language drift

- **tables**: cards radius 14px vs 24px gold; undefined pills; missing `.btn-text`
- **menu**: emoji icons vs lucide; dead `premium-shadow-v4`
- **inventory**: full legacy `.panel` + `.glass-card` + `.kpi-card-v4` mix; 3 table styles coexist; `.grid-btn` blue `#4472C4` clashes with orange `btn-primary`; legacy `stock-status-badge`
- **promotions**: flat `#fff` cards 10px vs glass 24px; no skeleton; emoji vs lucide; `.btn .btn-sm` undefined; hand-rolled preview modal
- **live**: no KPI row; `.premium-table-v4/.premium-row-v4` (no streak) vs Tabulator on other tabs; skeleton markup mismatch
- **dashboard**: unstyled `.section-title`/`.panel-header`; `.table-responsive` undefined; skeleton desktop issues; card chrome mismatch; compact table density
- **reports (gold itself)**: dead legacy DOM still in `index.html`; orphaned CSS `mobile-overrides.css:2078-2333`; `.kpi-row`/`.kpi-card` CSS duped at overlapping widths (5, 1842-1937)

## P2 — Structural

- Analytics old desktop markup hidden via `display:none !important` (`mobile-overrides.css:2590-2596`) — delete, not hide
- Dead/orphaned CSS blocks targeted at hidden layout (reports, menu) — remove

## Recommended batch 1 (highest value, lowest risk)
1. Base `.section-title`/`.panel-header`/`.panel-title`/`.table-responsive`/`.btn-text`/`.btn-sm`
2. Status pill variants for tables.js
3. Desktop `.skeleton-dish-card`

Re-deploy after: `firebase deploy --only hosting`

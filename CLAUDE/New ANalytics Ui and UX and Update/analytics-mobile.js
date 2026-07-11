/**
 * ROSHANI ERP | ANALYTICS UNIFIED VIEW  (Admin/js/features/analytics-mobile.js)
 * ============================================================================
 * Renders the redesigned Analytics layout (KPI cards with sparklines, Sales
 * Overview chart, Top Highlights, Payment Method donut, and a custom
 * Detailed Sales Data table) — at every screen size, not just mobile. File
 * name still says "mobile" because this started as a mobile-only build
 * before being extended to replace the desktop layout too; renaming would
 * mean updating cross-references across every file in this delivery for no
 * functional benefit.
 *
 * This is a COMPANION module to analytics.js — it does not fetch its own
 * order data; analytics.js calls renderMobileAnalytics() at the end of its
 * existing renderFromCache(), passing the same salesData / prevPeriodData
 * arrays it already fetched. The only NEW fetch here is `pizza/customers`
 * (needed for New vs Repeat Customer counts), done once per report
 * generation, mirroring the exact pattern already used in customers.js's
 * loadCustomers().
 *
 * NOTHING FROM THE OLD DESKTOP LAYOUT SURVIVES UNCHANGED except the data
 * itself. The old KPI rows, Payment Breakdown row, comparison bar, Revenue
 * Trends chart, and Order Type Distribution chart are all hidden (see
 * analytics-mobile.css) — #reportsMobileView shows at every width. The old
 * Detailed Sales Data table (Tabulator) is also hidden and fully replaced:
 * this file's _renderDataTable() renders a plain HTML <table>, not
 * Tabulator, inside a horizontally-scrolling wrapper.
 *
 * BUSINESS-LOGIC DEFINITIONS — see Guide.md for the full reasoning, briefly:
 *   New Customer    = a customer (by phone, from the `pizza/customers` node)
 *                      whose `registeredAt` falls inside the selected date range.
 *   Repeat Customer  = a customer who placed an order in the selected range
 *                      AND whose `registeredAt` is BEFORE the range start —
 *                      i.e. an existing customer who came back, not a new one.
 *   Delivered/Cancelled/Pending = computed from the SAME unfiltered order set
 *                      analytics.js already fetches (salesData), using the
 *                      same status strings orders.js's STATUS_MAPPING
 *                      already treats as canonical.
 * ============================================================================
 */
import { Outlet, get } from '../firebase.js';
import { escapeHtml } from '../utils.js';

let sparkRevenue = null, sparkOrders = null, sparkAvg = null, sparkNewCust = null;
let overviewChart = null, paymentDonut = null;
let _customersCache = null; // { phone: { registeredAt, ... } }, refetched once per generateCustomReport() call

const PALETTE = {
    revenue: '#E84908',
    orders: '#2563eb',
    avgOrder: '#9333ea',
    newCust: '#d97706'
};

function fmtMoney(n) {
    const v = Number(n || 0);
    return '₹' + (v % 1 === 0 ? v.toLocaleString('en-IN') : v.toLocaleString('en-IN', { maximumFractionDigits: 1 }));
}
function pct(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }
function formatDateTime(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })
        + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}
function deltaOf(cur, prev) {
    if (!prev) return null;
    return ((cur - prev) / prev) * 100;
}

/**
 * Fetches pizza/customers once per report run. Cheap enough to always
 * refetch on "Generate" (same cost as customers.js's own load), avoided on
 * every render tick by caching per-call in the caller.
 */
async function fetchCustomers() {
    const snap = await get(Outlet.ref('customers'));
    const map = {};
    snap.forEach(child => { map[child.key] = child.val() || {}; });
    return map;
}

// ---------------------------------------------------------------------
// Day-bucketing helper — same IST-day-key approach analytics.js already
// uses for the desktop Revenue Trends chart, reused here for sparklines
// and the Sales Overview chart so all charts agree on what "a day" means.
// ---------------------------------------------------------------------
function dayKey(ts) {
    return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function dayLabel(key, spanDays) {
    const d = new Date(key + 'T00:00:00');
    // FIXED: this used to always return a short weekday name (Mon, Tue…)
    // regardless of how wide the selected date range was — fine for a
    // 7-day view (matches the reference exactly), but meaningless for
    // anything longer: a 30-day or multi-month range would repeat the
    // same 7 weekday labels over and over with no way to tell WHICH
    // Monday a point belongs to. Now it adapts to the actual range.
    if (spanDays <= 7) return d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' });
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/**
 * Buckets orders by day when the range is short enough for daily points
 * to stay readable on a small chart, or by week when it's not. Returns
 * the same {keys, values} shape buildDailySeries does, so callers don't
 * need to know which granularity was chosen.
 */
function buildAdaptiveSeries(orders, rangeFrom, rangeTo) {
    const spanDays = Math.max(1, Math.round((new Date(rangeTo) - new Date(rangeFrom)) / 86400000) + 1);
    if (spanDays <= 31) {
        const daily = buildDailySeries(orders, o => Number(o.total || 0));
        return { ...daily, spanDays, granularity: 'day' };
    }
    // Wider than a month — bucket by week (starting from rangeFrom) so a
    // multi-month range still renders as a readable ~10-20 point chart
    // instead of 90+ daily slivers.
    const buckets = {};
    const rangeStart = new Date(rangeFrom).getTime();
    orders.forEach(o => {
        const weekIdx = Math.floor((o.createdAt - rangeStart) / (7 * 86400000));
        const weekStartKey = dayKey(rangeStart + weekIdx * 7 * 86400000);
        buckets[weekStartKey] = (buckets[weekStartKey] || 0) + Number(o.total || 0);
    });
    const keys = Object.keys(buckets).sort();
    return { keys, values: keys.map(k => buckets[k]), spanDays, granularity: 'week' };
}
function buildDailySeries(orders, valueFn) {
    const buckets = {};
    orders.forEach(o => {
        const k = dayKey(o.createdAt);
        buckets[k] = (buckets[k] || 0) + valueFn(o);
    });
    const keys = Object.keys(buckets).sort();
    return { keys, values: keys.map(k => buckets[k]) };
}
function buildDailyCountSeries(orders) {
    return buildDailySeries(orders, () => 1);
}

// ---------------------------------------------------------------------
// Main entry point — called from analytics.js's renderFromCache()
// ---------------------------------------------------------------------
export async function renderMobileAnalytics(salesData, prevPeriodData) {
    const root = document.getElementById('reportsMobileView');
    if (!root) return; // container not present (e.g. desktop-only build) — no-op
    updateMobileDateRangeText();

    const delivered = salesData.filter(o => o.status === 'Delivered');
    const cancelled = salesData.filter(o => (o.status || '').toLowerCase() === 'cancelled');
    const pending = salesData.filter(o => o.status !== 'Delivered' && (o.status || '').toLowerCase() !== 'cancelled');

    // KPI base numbers use the SAME "delivered" order set as the desktop
    // default filter, so the two views never disagree on Total Revenue.
    const curRev = delivered.reduce((s, o) => s + Number(o.total || 0), 0);
    const curOrd = delivered.length;
    const curAvg = curOrd > 0 ? curRev / curOrd : 0;

    const prevDelivered = (prevPeriodData || []).filter(o => o.status === 'Delivered');
    const prevRev = prevDelivered.reduce((s, o) => s + Number(o.total || 0), 0);
    const prevOrd = prevDelivered.length;
    const prevAvg = prevOrd > 0 ? prevRev / prevOrd : 0;

    // ---- New vs Repeat customers ----
    if (!_customersCache) {
        try { _customersCache = await fetchCustomers(); } catch (e) { _customersCache = {}; console.error('[AnalyticsMobile] customers fetch failed', e); }
    }
    const fromEl = document.getElementById('reportFrom');
    const toEl = document.getElementById('reportTo');
    const rangeFrom = fromEl?.value || dayKey(Date.now() - 7 * 86400000);
    const rangeTo = toEl?.value || dayKey(Date.now());

    const phonesInRange = new Set(delivered.map(o => o.phone).filter(Boolean));
    let newCustCount = 0, repeatCustCount = 0;
    phonesInRange.forEach(phone => {
        const c = _customersCache[phone];
        const registeredDate = c?.registeredAt ? dayKey(c.registeredAt) : null;
        if (registeredDate && registeredDate >= rangeFrom && registeredDate <= rangeTo) newCustCount++;
        else if (registeredDate && registeredDate < rangeFrom) repeatCustCount++;
        // Customers with no registeredAt on file are counted in neither
        // bucket rather than guessed — see Guide.md.
    });
    const prevPhonesInRange = new Set(prevDelivered.map(o => o.phone).filter(Boolean));
    // Previous period's window boundaries — computed ONCE outside the loop
    // (was being recomputed per-phone) and now with BOTH bounds, not just
    // a floor. Missing the ceiling here previously meant anyone registered
    // any time from this floor through TODAY got counted as a "previous
    // period new customer" — including people who actually registered
    // during the CURRENT period, which inflated prevNewCustCount and threw
    // off the New Customers trend arrow.
    const periodMs = new Date(rangeTo).getTime() - new Date(rangeFrom).getTime();
    const pFromKey = dayKey(new Date(rangeFrom).getTime() - periodMs - 86400000);
    const pToKey = dayKey(new Date(rangeFrom).getTime() - 86400000);
    let prevNewCustCount = 0, prevRepeatCustCount = 0;
    prevPhonesInRange.forEach(phone => {
        const c = _customersCache[phone];
        const registeredDate = c?.registeredAt ? dayKey(c.registeredAt) : null;
        if (registeredDate && registeredDate >= pFromKey && registeredDate <= pToKey) prevNewCustCount++;
        else if (registeredDate && registeredDate < pFromKey) prevRepeatCustCount++;
    });

    // ---- KPI cards ----
    _setKpi('mobKpiRevenue', fmtMoney(curRev), deltaOf(curRev, prevRev));
    _setKpi('mobKpiOrders', String(curOrd), deltaOf(curOrd, prevOrd));
    _setKpi('mobKpiAvgOrder', fmtMoney(Math.round(curAvg)), deltaOf(curAvg, prevAvg));
    _setKpi('mobKpiNewCust', String(newCustCount), deltaOf(newCustCount, prevNewCustCount));

    // ---- Sparklines (daily series over the CURRENT range only) ----
    const revSeries = buildDailySeries(delivered, o => Number(o.total || 0));
    const ordSeries = buildDailyCountSeries(delivered);
    const avgSeries = { keys: revSeries.keys, values: revSeries.values.map((v, i) => ordSeries.values[i] ? v / ordSeries.values[i] : 0) };
    // Real per-day new-customer counts — each new customer counted once,
    // on the day of their EARLIEST order within range. Explicitly finds
    // each phone's minimum createdAt rather than relying on iteration
    // order: salesData is sorted newest-first elsewhere in this app, so
    // a naive "first occurrence wins" walk would credit a new customer's
    // most RECENT visit instead of the day they actually first showed up,
    // for anyone who ordered more than once inside the selected range.
    const newCustByDay = {};
    revSeries.keys.forEach(k => { newCustByDay[k] = 0; });
    const firstOrderByPhone = {};
    delivered.forEach(o => {
        if (!o.phone) return;
        if (!firstOrderByPhone[o.phone] || o.createdAt < firstOrderByPhone[o.phone]) {
            firstOrderByPhone[o.phone] = o.createdAt;
        }
    });
    Object.entries(firstOrderByPhone).forEach(([phone, firstTs]) => {
        const c = _customersCache[phone];
        const registeredDate = c?.registeredAt ? dayKey(c.registeredAt) : null;
        if (registeredDate && registeredDate >= rangeFrom && registeredDate <= rangeTo) {
            const orderDay = dayKey(firstTs);
            if (newCustByDay[orderDay] !== undefined) newCustByDay[orderDay]++;
        }
    });
    const newCustSeries = revSeries.keys.map(k => newCustByDay[k] || 0);
    _drawSparkline('sparkRevenue', revSeries.values, PALETTE.revenue, s => sparkRevenue = s, sparkRevenue);
    _drawSparkline('sparkOrders', ordSeries.values, PALETTE.orders, s => sparkOrders = s, sparkOrders);
    _drawSparkline('sparkAvgOrder', avgSeries.values, PALETTE.avgOrder, s => sparkAvg = s, sparkAvg);
    _drawSparkline('sparkNewCust', newCustSeries, PALETTE.newCust, s => sparkNewCust = s, sparkNewCust);

    // ---- Sales Overview big chart ----
    _renderOverviewChart(buildAdaptiveSeries(delivered, rangeFrom, rangeTo), curRev, deltaOf(curRev, prevRev));

    // ---- Top Highlights ----
    // Delivered/Cancelled/Pending are composition percentages (share of
    // this period's orders) — matches the reference, which shows these
    // three as plain percentages with no +/- sign.
    const totalForPct = salesData.length || 1;
    _setHighlight('mobHlDelivered', delivered.length, ((delivered.length / totalForPct) * 100).toFixed(1) + '%', true);
    _setHighlight('mobHlCancelled', cancelled.length, ((cancelled.length / totalForPct) * 100).toFixed(1) + '%', false);
    _setHighlight('mobHlPending', pending.length, ((pending.length / totalForPct) * 100).toFixed(1) + '%', null);
    // Repeat Customers is the one highlight the reference shows WITH a
    // +/- sign ("+10.3%") — that's a period-over-period trend, not a
    // composition ratio, so it needs the previous period's repeat count
    // (computed above, alongside prevNewCustCount) rather than a share
    // of this period's own customer count.
    const repeatDeltaPct = deltaOf(repeatCustCount, prevRepeatCustCount);
    _setHighlight('mobHlRepeat', repeatCustCount, repeatDeltaPct === null ? '—' : pct(repeatDeltaPct), repeatDeltaPct === null ? null : repeatDeltaPct >= 0);

    // ---- Payment method donut ----
    // Buckets match the EXISTING desktop Payment Breakdown row's real
    // categories (cash / upi / cod) — an earlier version of this invented
    // a "card" bucket that doesn't exist anywhere else in this app's data
    // model, and silently folded real COD orders into it.
    const paymentTotals = { cash: 0, upi: 0, cod: 0 };
    delivered.forEach(o => {
        const pm = (o.paymentMethod || 'cod').toLowerCase();
        const bucket = pm === 'upi' ? 'upi' : (pm === 'cash' ? 'cash' : 'cod');
        paymentTotals[bucket] += Number(o.total || 0);
    });
    _renderPaymentDonut(paymentTotals, curRev);

    // ---- Detailed Sales Data — custom table (replaces Tabulator) ----
    // Uses the full unfiltered salesData, not just `delivered` — the old
    // Tabulator table showed every status, and this should too.
    _renderDataTable(salesData);

    root.classList.remove('reports-mobile-loading');
}

let _tableSortField = 'createdAt', _tableSortDir = 'desc', _tableData = [];

// itemsStr is a real, already-computed field — analytics.js's
// generateCustomReport() builds it from o.cart || o.items (handling
// both possible field names, plus a singular o.item fallback) into a
// consistent "Name xQty, Name xQty" string on every salesData entry
// before this module ever sees it (confirmed by reading that function,
// not assumed). An earlier version of this file tried to re-derive the
// same string locally from o.items directly — redundant, and actually
// wrong: salesData entries also carry the RAW o.items object (spread
// via ...o), so that local logic would fire on the raw object instead
// of falling through to itemsStr, producing a differently-formatted
// string ("2x Margherita" instead of "Margherita x2") than what Excel/
// PDF export shows for the exact same order. Using itemsStr directly
// avoids the inconsistency entirely.

function _badgeType(type) {
    const t = type || 'Online';
    const cls = t.toLowerCase().replace(/[- ]/g, '');
    return `<span class="mob-badge mob-badge-type-${cls}">${escapeHtml(t)}</span>`;
}
function _badgePayment(pm) {
    const p = (pm || 'COD');
    const cls = p.toLowerCase() === 'upi' ? 'upi' : (p.toLowerCase() === 'cash' ? 'cash' : 'cod');
    return `<span class="mob-badge mob-badge-pay-${cls}">${escapeHtml(p)}</span>`;
}
function _badgeStatus(status) {
    const s = status || 'Placed';
    const low = s.toLowerCase();
    const cls = s === 'Delivered' ? 'delivered' : low === 'cancelled' ? 'cancelled' : 'pending';
    return `<span class="mob-badge mob-badge-status-${cls}">${escapeHtml(s)}</span>`;
}

/**
 * Renders the Detailed Sales Data table — a plain HTML <table>, not
 * Tabulator. Click a header to sort by that column (toggles asc/desc);
 * default is newest-first, matching the old table's behavior. The
 * table itself sits inside .mob-table-scroll (see CSS) which handles
 * the "slide to see more columns" behavior on narrow screens — there's
 * no responsive column-hiding logic here at all, unlike the Tabulator
 * version's collapse/hide config: every column is always in the DOM,
 * reachable by horizontal scroll, so nothing is ever missing, only
 * off-screen until you swipe.
 */
function _renderDataTable(orders) {
    const tbody = document.getElementById('mobDataTableBody');
    const countEl = document.getElementById('mobTableCount');
    if (!tbody) return;
    _tableData = orders || [];
    if (countEl) countEl.textContent = `${_tableData.length} order${_tableData.length === 1 ? '' : 's'}`;

    const sorted = [..._tableData].sort((a, b) => {
        let av = a[_tableSortField], bv = b[_tableSortField];
        if (_tableSortField === 'total') { av = Number(av || 0); bv = Number(bv || 0); }
        else { av = String(av || ''); bv = String(bv || ''); }
        const cmp = av > bv ? 1 : av < bv ? -1 : 0;
        return _tableSortDir === 'asc' ? cmp : -cmp;
    });

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="mob-table-empty">No orders found for this range.</td></tr>`;
        return;
    }

    tbody.innerHTML = sorted.map(o => {
        const itemsShort = o.itemsStr || 'No items';
        const itemsTrunc = itemsShort.length > 40 ? itemsShort.slice(0, 40) + '…' : itemsShort;
        return `<tr>
            <td>
                <div class="mob-td-strong">${formatDateTime(o.createdAt)}</div>
                <div class="mob-td-sub">#${escapeHtml(String(o.orderId || o.id || '').slice(-5).toUpperCase())}</div>
            </td>
            <td>
                <div class="mob-td-strong">${escapeHtml(o.customerName || 'Guest')}</div>
                <div class="mob-td-sub">${escapeHtml(o.phone || '')}</div>
            </td>
            <td>${_badgeStatus(o.status)}</td>
            <td>${_badgeType(o.type)}</td>
            <td>${_badgePayment(o.paymentMethod)}</td>
            <td><span class="mob-outlet-chip">${escapeHtml((o.outlet || 'pizza').toUpperCase())}</span></td>
            <td><span class="mob-td-items" title="${escapeHtml(itemsShort)}">${escapeHtml(itemsTrunc)}</span></td>
            <td class="mob-th-right"><span class="mob-td-total">₹${Number(o.total || 0).toLocaleString('en-IN')}</span></td>
        </tr>`;
    }).join('');
}

function _setKpi(prefix, value, deltaPct) {
    const valEl = document.getElementById(prefix + 'Val');
    const trendEl = document.getElementById(prefix + 'Trend');
    if (valEl) valEl.textContent = value;
    if (trendEl) {
        if (deltaPct === null || !isFinite(deltaPct)) {
            trendEl.innerHTML = `<span class="mob-trend-flat">— vs Previous Period</span>`;
        } else {
            const up = deltaPct >= 0;
            trendEl.innerHTML = `<span class="mob-trend ${up ? 'up' : 'down'}">${up ? '↑' : '↓'} ${Math.abs(deltaPct).toFixed(1)}%</span> <span class="mob-trend-sub">vs Previous Period</span>`;
        }
    }
}

function _setHighlight(id, value, subPct, isPositive) {
    const valEl = document.getElementById(id + 'Val');
    const pctEl = document.getElementById(id + 'Pct');
    if (valEl) valEl.textContent = value;
    if (pctEl) {
        pctEl.textContent = subPct;
        pctEl.className = 'mob-highlight-pct' + (isPositive === true ? ' mob-pct-good' : isPositive === false ? ' mob-pct-bad' : '');
    }
}

function _drawSparkline(canvasId, values, color, setter, existing) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    if (existing) { existing.destroy(); }
    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: values.map((_, i) => i),
            datasets: [{
                data: values.length ? values : [0, 0],
                borderColor: color,
                backgroundColor: color + '22',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 0,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: { x: { display: false }, y: { display: false } },
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            elements: { line: { capBezierPoints: true } }
        }
    });
    setter(chart);
}

function _renderOverviewChart(series, totalVal, deltaPct) {
    const canvas = document.getElementById('mobOverviewChart');
    const totalEl = document.getElementById('mobOverviewTotal');
    const trendEl = document.getElementById('mobOverviewTrend');
    if (totalEl) totalEl.textContent = fmtMoney(totalVal);
    if (trendEl && deltaPct !== null && isFinite(deltaPct)) {
        const up = deltaPct >= 0;
        trendEl.innerHTML = `<span class="mob-trend ${up ? 'up' : 'down'}">${up ? '↑' : '↓'} ${Math.abs(deltaPct).toFixed(1)}%</span> <span class="mob-trend-sub">vs Previous Period</span>`;
    }
    if (!canvas || typeof Chart === 'undefined') return;
    if (overviewChart) overviewChart.destroy();
    // FIXED: labels now adapt to the actual selected range (see dayLabel/
    // buildAdaptiveSeries above) instead of always showing short weekday
    // names — a multi-week or multi-month range now shows real dates
    // instead of repeating "Mon Tue Wed" with no way to tell which week.
    const labels = series.keys.map(k => dayLabel(k, series.spanDays));
    const values = series.values;
    const peakIdx = values.length ? values.indexOf(Math.max(...values)) : -1;

    overviewChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels.length ? labels : ['—'],
            datasets: [{
                data: values.length ? values : [0],
                borderColor: PALETTE.revenue,
                backgroundColor: (ctx) => {
                    const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
                    // Bolder gradient (was a thin 33%→1% fade) — closer to
                    // the reference's more saturated fill under the line.
                    g.addColorStop(0, PALETTE.revenue + '80');
                    g.addColorStop(0.6, PALETTE.revenue + '20');
                    g.addColorStop(1, PALETTE.revenue + '02');
                    return g;
                },
                borderWidth: 3,
                // Peak day gets a larger, solid-filled point — echoes the
                // reference's emphasis on its best day (the "₹8,620 Friday"
                // callout) without needing a custom always-on annotation
                // plugin; tapping/hovering any point still shows the
                // styled tooltip for that point specifically.
                pointRadius: values.map((_, i) => i === peakIdx ? 6 : 4),
                pointBackgroundColor: values.map((_, i) => i === peakIdx ? PALETTE.revenue : '#fff'),
                pointBorderColor: PALETTE.revenue,
                pointBorderWidth: 2,
                tension: 0.35,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(15,23,42,.06)' }, ticks: { callback: v => '₹' + (v >= 1000 ? (v / 1000) + 'K' : v), font: { size: 10 }, color: '#94a3b8' } },
                // maxTicksLimit keeps a long date range (30D, custom
                // multi-month) from cramming dozens of labels — Chart.js
                // auto-thins them out instead of overlapping text.
                x: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: '#64748b', maxTicksLimit: 8, autoSkip: true } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#fdba74',
                    bodyColor: '#fff',
                    padding: 10,
                    cornerRadius: 10,
                    displayColors: false,
                    callbacks: {
                        title: (items) => fmtMoney(items[0].parsed.y),
                        label: (item) => item.label
                    }
                }
            }
        }
    });
}

function _renderPaymentDonut(totals, grandTotal) {
    const canvas = document.getElementById('mobPaymentDonut');
    const centerTotalEl = document.getElementById('mobDonutCenterTotal');
    if (centerTotalEl) centerTotalEl.textContent = fmtMoney(grandTotal);

    const entries = [
        { key: 'upi', label: 'UPI Payments', color: PALETTE.revenue },
        { key: 'cash', label: 'Cash Payments', color: '#15803d' },
        { key: 'cod', label: 'COD Payments', color: '#2563eb' }
    ];
    const sum = totals.upi + totals.cash + totals.cod || 1;
    const legendEl = document.getElementById('mobPaymentLegend');
    if (legendEl) {
        legendEl.innerHTML = entries.map(e => {
            const val = totals[e.key] || 0;
            const p = Math.round((val / sum) * 100);
            return `<div class="mob-legend-row">
                <span class="mob-legend-dot" style="background:${e.color}"></span>
                <span class="mob-legend-label">${escapeHtml(e.label)}</span>
                <span class="mob-legend-val">${fmtMoney(val)}</span>
                <span class="mob-legend-pct" style="background:${e.color}">${p}%</span>
            </div>`;
        }).join('');
    }
    if (!canvas || typeof Chart === 'undefined') return;
    if (paymentDonut) paymentDonut.destroy();
    paymentDonut = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: entries.map(e => e.label),
            datasets: [{ data: entries.map(e => totals[e.key] || 0), backgroundColor: entries.map(e => e.color), borderWidth: 3, borderColor: '#fff' }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '72%',
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => fmtMoney(item.parsed) } } }
        }
    });
}

// ---------------------------------------------------------------------
// Quick date-range presets (Today / 7D / 30D) — set the SAME
// #reportFrom / #reportTo inputs the desktop filter bar already uses,
// then trigger the existing generateCustomReport() so both views stay
// in sync off one shared data-fetch path.
// ---------------------------------------------------------------------
export function applyQuickRange(preset, regenerateFn) {
    const to = new Date();
    const from = new Date();
    if (preset === 'today') { /* from = to, same day */ }
    else if (preset === '7d') from.setDate(to.getDate() - 6);
    else if (preset === '30d') from.setDate(to.getDate() - 29);
    const fromEl = document.getElementById('reportFrom');
    const toEl = document.getElementById('reportTo');
    if (fromEl) fromEl.value = from.toISOString().split('T')[0];
    if (toEl) toEl.value = to.toISOString().split('T')[0];
    document.querySelectorAll('.mob-range-pill').forEach(b => b.classList.toggle('active', b.dataset.preset === preset));
    if (typeof regenerateFn === 'function') regenerateFn();
}

export function cleanupMobileAnalytics() {
    [sparkRevenue, sparkOrders, sparkAvg, sparkNewCust, overviewChart, paymentDonut].forEach(c => { try { c?.destroy(); } catch (e) {} });
    sparkRevenue = sparkOrders = sparkAvg = sparkNewCust = overviewChart = paymentDonut = null;
    _customersCache = null;
}

// ---------------------------------------------------------------------
// One-time UI wiring — called once when the tab first loads (safe to
// call repeatedly; guarded by a data-attribute so it only runs once).
// Moves the EXISTING #reportFrom/#reportTo/#reportOutletFilter elements
// into the mobile toolbar's flyout panels instead of cloning them, so
// there is exactly one date range and one outlet filter shared by both
// views — never two sources of truth.
//
// #reportStatusFilter is deliberately NOT relocated here. Once exports
// were changed to always match the full table (all statuses, per your
// decision), that dropdown stopped affecting anything — the table
// always shows everything, and export now always matches the table.
// Showing a filter control that visibly does nothing is worse than not
// showing it at all, so it's left in place inside the old filter bar
// row, which is already hidden by analytics-mobile.css at every width.
// ---------------------------------------------------------------------
export function initMobileAnalyticsUI(regenerateFn) {
    const root = document.getElementById('reportsMobileView');
    if (!root || root.dataset.wired) return;
    root.dataset.wired = '1';

    const datesHost = document.getElementById('mobInlineDates');
    const filtersHost = document.getElementById('mobInlineFilters');
    const fromEl = document.getElementById('reportFrom');
    const toEl = document.getElementById('reportTo');
    const outletEl = document.getElementById('reportOutletFilter');
    if (datesHost && fromEl && toEl) { datesHost.appendChild(fromEl); datesHost.appendChild(toEl); }
    if (filtersHost && outletEl) { filtersHost.appendChild(outletEl); }

    root.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        switch (btn.dataset.action) {
            case 'mobToggleCustomDates':
                datesHost?.classList.toggle('hidden');
                filtersHost?.classList.add('hidden');
                break;
            case 'mobToggleFilters':
                filtersHost?.classList.toggle('hidden');
                datesHost?.classList.add('hidden');
                break;
            case 'mobExportExcel':
                document.getElementById('btnDownloadExcel')?.click();
                break;
            case 'mobExportPDF':
                document.getElementById('btnDownloadPDF')?.click();
                break;
        }
    });

    root.querySelectorAll('.mob-range-pill[data-preset]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.preset === 'custom') return; // handled by mobToggleCustomDates above
            applyQuickRange(btn.dataset.preset, regenerateFn);
        });
    });

    // Table column sort — click a header to sort by it, click again to
    // flip direction. Re-renders from _tableData (already-fetched data,
    // no re-query) rather than calling generateCustomReport() again.
    document.querySelectorAll('#mobDataTable th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (_tableSortField === field) {
                _tableSortDir = _tableSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                _tableSortField = field;
                _tableSortDir = field === 'total' || field === 'createdAt' ? 'desc' : 'asc';
            }
            document.querySelectorAll('#mobDataTable th[data-sort]').forEach(h => h.classList.remove('mob-sort-asc', 'mob-sort-desc'));
            th.classList.add(_tableSortDir === 'asc' ? 'mob-sort-asc' : 'mob-sort-desc');
            _renderDataTable(_tableData);
        });
    });

    // Outlet pill — read-only indicator, not a switcher. Changing outlet
    // is an app-wide concern (affects every tab, not just Analytics) and
    // out of scope for this view — see Guide.md.
    import('../state.js').then(({ state }) => {
        const nameEl = document.getElementById('mobOutletName');
        if (nameEl) nameEl.textContent = (state.currentOutlet || 'pizza').toUpperCase();
    }).catch(() => {});
}

/** Updates the pill-style date range text shown on the mobile toolbar. */
export function updateMobileDateRangeText() {
    const el = document.getElementById('mobDateRangeText');
    const fromEl = document.getElementById('reportFrom');
    const toEl = document.getElementById('reportTo');
    if (!el || !fromEl?.value || !toEl?.value) return;
    const from = new Date(fromEl.value + 'T00:00:00');
    const to = new Date(toEl.value + 'T23:59:59');
    const fmt = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    el.textContent = `${fmt(from)} – ${fmt(to)}`;
}

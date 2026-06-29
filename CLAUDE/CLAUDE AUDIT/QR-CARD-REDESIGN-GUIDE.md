# QR Card Redesign — "Food Craving" Branding — Placement Guide

Redesigns the printed table QR cards (single print + bulk print) and the
in-app preview modal with: a warm orange→red gradient border, the store
name as a branded header, and a "Powered by {X}" footer sourced live from
the Settings tab's existing "Powered By" field.

**Nothing new to configure** — if you've already filled in Store Name and
Powered By under Admin → Settings, this picks them up automatically. If
Powered By is left blank, the footer line is simply omitted (no awkward
"Powered by" with nothing after it).

---

## 1. `Admin/js/features/tables.js`

### 1a. Add the branding fetch + shared card template

**Find:**
```javascript
async function _dineInBaseUrl() {
    const snap = await get(_settingsRef('qrBaseUrl'));
    return snap.exists() ? snap.val() : `${window.location.origin}/menu/`;
}
```

**Replace with:**
```javascript
async function _dineInBaseUrl() {
    const snap = await get(_settingsRef('qrBaseUrl'));
    return snap.exists() ? snap.val() : `${window.location.origin}/menu/`;
}

// Store branding for the printable/preview QR card — sourced from the
// SAME fields the Settings tab already manages (Store Name, Powered By),
// so updating either there automatically reflects here. Cached for the
// lifetime of the Tables tab session since branding rarely changes
// mid-session and this avoids an extra read on every QR open/print.
let _storeBrandingCache = null;
async function _fetchStoreBranding() {
    if (_storeBrandingCache) return _storeBrandingCache;
    const snap = await get(Outlet.ref('settings/Store'));
    const s = snap.val() || {};
    _storeBrandingCache = {
        storeName: s.storeName || 'Our Restaurant',
        poweredBy: (s.poweredBy || '').trim()
    };
    return _storeBrandingCache;
}

// ---------------------------------------------------------------------
// "Food Craving" QR card template — shared by the single-table print and
// the bulk grid print so both stay visually identical. `compact` shrinks
// padding/QR size to fit a multi-card grid page; full size is used for
// the single, one-per-page print.
// ---------------------------------------------------------------------
function _qrCardMarkup({ storeName, poweredBy, tableNumber, qrSrc, compact }) {
    const qrSize = compact ? 150 : 220;
    const footer = poweredBy
        ? `<div class="qr-divider"></div><div class="qr-footer">Powered by <b>${escapeHtml(poweredBy)}</b></div>`
        : '';
    return `
    <div class="qr-frame${compact ? ' qr-frame-compact' : ''}">
        <div class="qr-card">
            <div class="qr-header">
                <div class="qr-store-name">🍕 ${escapeHtml(storeName)}</div>
                <div class="qr-tagline">DINE-IN MENU</div>
            </div>
            <div class="qr-body">
                <div class="qr-table-label">TABLE</div>
                <div class="qr-table-number">${escapeHtml(String(tableNumber))}</div>
                <div class="qr-scan-cta">📷 Scan &amp; Crave</div>
                <div class="qr-img-frame">${qrSrc ? `<img src="${qrSrc}" width="${qrSize}" height="${qrSize}">` : '<p style="font-size:11px;color:#c81d11;">QR failed</p>'}</div>
            </div>
            ${footer}
        </div>
    </div>`;
}

// Shared CSS for the "food craving" design — warm orange/red gradient
// border, branded header strip, dashed receipt-style divider above the
// Powered By footer. One definition, reused by both print paths.
const QR_CARD_CSS = `
    .qr-frame{ display:inline-block; background:linear-gradient(135deg,#FFB347,#E84908 55%,#C81D11); border-radius:26px; padding:5px; box-shadow:0 10px 26px rgba(232,73,8,.25); }
    .qr-frame-compact{ border-radius:20px; padding:4px; box-shadow:none; break-inside:avoid; page-break-inside:avoid; }
    .qr-card{ background:#fff; border-radius:22px; overflow:hidden; width:300px; text-align:center; font-family:-apple-system,'Segoe UI',sans-serif; }
    .qr-frame-compact .qr-card{ border-radius:17px; width:230px; }
    .qr-header{ background:linear-gradient(135deg,#FF8A3D,#E84908); color:#fff; padding:16px 14px 14px; }
    .qr-frame-compact .qr-header{ padding:11px 10px 10px; }
    .qr-store-name{ font-size:17px; font-weight:900; letter-spacing:.01em; text-transform:uppercase; line-height:1.2; }
    .qr-frame-compact .qr-store-name{ font-size:13px; }
    .qr-tagline{ font-size:10px; opacity:.92; margin-top:3px; font-weight:700; letter-spacing:.1em; }
    .qr-body{ padding:20px 18px 16px; }
    .qr-frame-compact .qr-body{ padding:13px 12px 10px; }
    .qr-table-label{ font-size:11px; font-weight:800; color:#E84908; letter-spacing:.14em; }
    .qr-table-number{ font-size:40px; font-weight:900; color:#1a1a1a; line-height:1; margin:2px 0 12px; }
    .qr-frame-compact .qr-table-number{ font-size:28px; margin-bottom:8px; }
    .qr-scan-cta{ font-size:12px; font-weight:800; color:#C81D11; margin-bottom:12px; }
    .qr-frame-compact .qr-scan-cta{ font-size:10px; margin-bottom:8px; }
    .qr-img-frame{ display:inline-block; padding:10px; background:#fff7ed; border:3px solid #FFB347; border-radius:14px; }
    .qr-frame-compact .qr-img-frame{ padding:6px; border-radius:11px; border-width:2px; }
    .qr-img-frame img{ display:block; }
    .qr-divider{ border-top:2px dashed #f3cba8; margin:14px 18px 0; }
    .qr-frame-compact .qr-divider{ margin:10px 12px 0; }
    .qr-footer{ padding:10px 14px 16px; font-size:10px; color:#b97a4e; font-weight:600; }
    .qr-frame-compact .qr-footer{ padding:7px 10px 11px; font-size:8px; }
    .qr-footer b{ color:#E84908; }
`;
```

### 1b. Replace the single-table print function

**Find:**
```javascript
function _printSingleQr() {
    const img = document.getElementById('tableQrModalImage');
    const title = document.getElementById('tableQrModalTitle')?.textContent || 'Table QR';
    if (!img?.src) return;
    const w = window.open('', '_blank', 'width=400,height=560');
    w.document.write(`<html><head><title>${escapeHtml(title)}</title><style>
        body{font-family:sans-serif;text-align:center;padding:24px;}
        h2{margin-bottom:4px;} .sub{color:#777;margin-bottom:18px;font-size:13px;}
        img{width:240px;height:240px;} .foot{margin-top:14px;font-size:12px;color:#999;}
        </style></head><body><h2>${escapeHtml(title)}</h2><div class="sub">Scan to order</div>
        <img src="${img.src}"><div class="foot">Roshani Pizza — Thank You!</div>
        <script>window.onload=function(){window.print();};</script></body></html>`);
    w.document.close();
}
```

**Replace with:**
```javascript
async function _printSingleQr() {
    const img = document.getElementById('tableQrModalImage');
    const titleText = document.getElementById('tableQrModalTitle')?.textContent || 'Table QR';
    const tableNumberMatch = titleText.match(/Table\s+(\S+)/i);
    const tableNumber = tableNumberMatch ? tableNumberMatch[1] : titleText;
    if (!img?.src) return;

    const { storeName, poweredBy } = await _fetchStoreBranding();
    const w = window.open('', '_blank', 'width=420,height=620');
    w.document.write(`<html><head><title>Table ${escapeHtml(tableNumber)} QR — ${escapeHtml(storeName)}</title><style>
        *{box-sizing:border-box;margin:0;padding:0;}
        body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fef3e8;padding:24px;}
        ${QR_CARD_CSS}
        </style></head><body>
        ${_qrCardMarkup({ storeName, poweredBy, tableNumber, qrSrc: img.src, compact: false })}
        <script>window.onload=function(){window.print();};</script></body></html>`);
    w.document.close();
}
```

### 1c. Replace the bulk print function

**Find:**
```javascript
async function _bulkQrPrint() {
    const tables = Object.values(_tables).filter(t => t.status !== 'disabled').sort((a, b) => Number(a.number) - Number(b.number));
    if (tables.length === 0) { showToast('No tables to print', 'warning'); return; }
    const ok = await showConfirm(`Generate printable QR cards for all ${tables.length} tables?`, 'Bulk QR Print');
    if (!ok) return;

    showToast('Generating QR codes…', 'info');
    const cards = [];
    for (const t of tables) {
        const url = await _qrUrlForTable(t);
        const dataUri = await _qrDataUri(url, 200);
        cards.push({ t, dataUri });
    }
    const w = window.open('', '_blank');
    const cardsHtml = cards.map(({ t, dataUri }) => `
        <div class="qr-card">
            <div class="qr-card-label">TABLE</div>
            <div class="qr-card-number">${escapeHtml(t.number)}</div>
            <div class="qr-card-scan">SCAN TO ORDER</div>
            ${dataUri ? `<img src="${dataUri}">` : '<p>QR failed</p>'}
            <div class="qr-card-thanks">Thank You!</div>
        </div>`).join('');
    w.document.write(`<html><head><title>Bulk QR Print — Roshani Pizza</title><style>
        body{font-family:sans-serif;margin:0;padding:16px;}
        .qr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
        .qr-card{border:2px solid #E84908;border-radius:12px;padding:16px;text-align:center;break-inside:avoid;page-break-inside:avoid;}
        .qr-card-label{font-size:11px;letter-spacing:2px;color:#E84908;font-weight:700;}
        .qr-card-number{font-size:36px;font-weight:900;color:#1a1a1a;margin:2px 0 6px;}
        .qr-card-scan{font-size:11px;color:#777;margin-bottom:8px;font-weight:600;}
        .qr-card img{width:140px;height:140px;}
        .qr-card-thanks{font-size:11px;color:#999;margin-top:8px;}
        @media print{ .qr-grid{grid-template-columns:repeat(2,1fr);} }
        </style></head><body><div class="qr-grid">${cardsHtml}</div>
        <script>window.onload=function(){setTimeout(function(){window.print();},300);};</script></body></html>`);
    w.document.close();
}
```

**Replace with:**
```javascript
async function _bulkQrPrint() {
    const tables = Object.values(_tables).filter(t => t.status !== 'disabled').sort((a, b) => Number(a.number) - Number(b.number));
    if (tables.length === 0) { showToast('No tables to print', 'warning'); return; }
    const ok = await showConfirm(`Generate printable QR cards for all ${tables.length} tables?`, 'Bulk QR Print');
    if (!ok) return;

    showToast('Generating QR codes…', 'info');
    const { storeName, poweredBy } = await _fetchStoreBranding();
    const cards = [];
    for (const t of tables) {
        const url = await _qrUrlForTable(t);
        const dataUri = await _qrDataUri(url, 150);
        cards.push({ t, dataUri });
    }
    const w = window.open('', '_blank');
    const cardsHtml = cards.map(({ t, dataUri }) =>
        _qrCardMarkup({ storeName, poweredBy, tableNumber: t.number, qrSrc: dataUri, compact: true })
    ).join('');
    w.document.write(`<html><head><title>Bulk QR Print — ${escapeHtml(storeName)}</title><style>
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:-apple-system,'Segoe UI',sans-serif;background:#fef3e8;padding:20px;}
        .qr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;justify-items:center;}
        ${QR_CARD_CSS}
        @media print{ body{background:#fff;} .qr-grid{grid-template-columns:repeat(2,1fr);} }
        </style></head><body><div class="qr-grid">${cardsHtml}</div>
        <script>window.onload=function(){setTimeout(function(){window.print();},300);};</script></body></html>`);
    w.document.close();
}
```

### 1d. Resize the modal's generated QR to match the new preview frame

**Find:**
```javascript
        const dataUri = await _qrDataUri(url, 240);
```

**Replace with:**
```javascript
        const dataUri = await _qrDataUri(url, 200);
```

---

## 2. `Admin/style.css`

**Find:**
```css
/* QR modal preview */
.table-qr-preview-wrap {
    display: flex; justify-content: center; padding: 16px;
    background: #fff; border-radius: 14px; border: 1px solid var(--border-color, #e2e8f0);
}
.table-qr-preview-wrap img { width: 220px; height: 220px; image-rendering: pixelated; }
```

**Replace with:**
```css
/* QR modal preview — matches the "food craving" gradient-bordered
   design used on the actual printed QR cards (see tables.js
   _qrCardMarkup / QR_CARD_CSS), so what admin previews here is what
   customers will see on the table. */
.table-qr-preview-wrap {
    display: flex; justify-content: center; padding: 6px;
    background: linear-gradient(135deg, #FFB347, #E84908 55%, #C81D11);
    border-radius: 20px;
}
.table-qr-preview-wrap-inner {
    background: #fff7ed; border-radius: 15px; padding: 14px;
    border: 3px solid #FFB347; display: flex; justify-content: center;
}
.table-qr-preview-wrap img { width: 200px; height: 200px; image-rendering: pixelated; display: block; }
```

---

## 3. `Admin/index.html`

**Find:**
```html
                <div class="table-qr-preview-wrap">

                    <img id="tableQrModalImage" alt="QR code" width="220" height="220">

                </div>
```

**Replace with:**
```html
                <div class="table-qr-preview-wrap">

                    <div class="table-qr-preview-wrap-inner">

                        <img id="tableQrModalImage" alt="QR code" width="200" height="200">

                    </div>

                </div>
```

---

## What changed, visually

**Before:** thin flat 2px orange line border, plain "TABLE 07 / SCAN TO ORDER / Thank You!" text-only card, no store branding, no powered-by line.

**After:**
- Thick warm gradient border (orange → red), rounded, with a soft drop shadow
- A solid-gradient header strip showing the actual configured **store name** in bold uppercase, with a 🍕 accent and "DINE-IN MENU" tagline
- "TABLE" label + big bold table number, "📷 Scan & Crave" call-to-action (more appetite-appeal than plain "scan to order")
- The QR code itself sits in a cream-colored inset frame with a gold border for contrast/scannability
- A dashed receipt-style divider, then **"Powered by {your configured value}"** — pulled live from Settings → Powered By; the whole footer is omitted gracefully if that field is empty
- The in-app preview modal (before you print) now shows the same gradient-framed look, so what you see when you click "View QR" matches what comes out of the printer

**Where it applies:** single-table "Print QR Card" button, "Bulk QR Print" (all tables at once, scaled down to fit a grid), and the live preview modal. All three pull store name + powered-by from the same place — update it once in Settings, it updates everywhere.

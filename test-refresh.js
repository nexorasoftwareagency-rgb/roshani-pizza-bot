const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8805;
const ADMIN_DIR = path.join(__dirname, 'Admin');
const MIME = {'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json'};

const server = http.createServer((req, res) => {
  let fp = path.join(ADMIN_DIR, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type': MIME[path.extname(fp)]||'text/plain'});
  fs.createReadStream(fp).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const outDir = path.join(__dirname, '.playwright-screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:393,height:852}});

  // Listen for console messages
  page.on('console', msg => {
    if (msg.text().includes('CLICK') || msg.text().includes('SYSTEM') || msg.text().includes('Nuclear')) {
      console.log(`[BROWSER] ${msg.text()}`);
    }
  });

  await page.goto(`http://localhost:${PORT}/index.html`, {waitUntil:'networkidle'});
  await page.waitForTimeout(1000);

  // Bypass auth
  await page.evaluate(() => {
    sessionStorage.setItem('adminIsLoggedIn', 'true');
    document.querySelector('.layout').classList.remove('hidden');
    document.querySelector('.layout').style.display = 'flex';
    const ao = document.getElementById('authOverlay');
    if (ao) { ao.classList.add('hidden'); ao.style.display = 'none'; }
  });
  await page.waitForTimeout(300);

  // Navigate to Settings via sidebar
  await page.evaluate(() => {
    document.querySelectorAll('.bottom-nav .nav-item').forEach(n => {
      if (n.textContent.trim() === 'More') n.click();
    });
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const s = document.querySelector('.sidebar [data-tab="settings"]');
    if (s) s.click();
  });
  await page.waitForTimeout(500);

  // Scroll to Danger Zone
  await page.evaluate(() => {
    const dangerZone = document.querySelector('[data-action="completeSiteRefresh"]');
    if (dangerZone) dangerZone.scrollIntoView({behavior: 'instant', block: 'center'});
  });
  await page.waitForTimeout(300);

  // Check button info
  const btnInfo = await page.evaluate(() => {
    const btn = document.querySelector('[data-action="completeSiteRefresh"]');
    if (!btn) return {error: 'button not found'};
    const r = btn.getBoundingClientRect();
    const s = getComputedStyle(btn);
    return {
      tag: btn.tagName,
      text: btn.textContent.trim(),
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
      display: s.display,
      visibility: s.visibility,
      pointerEvents: s.pointerEvents,
      disabled: btn.disabled,
    };
  });
  console.log('Button info:', JSON.stringify(btnInfo, null, 2));

  // Screenshot before click
  await page.screenshot({ path: path.join(outDir, 'before-refresh-click.png'), fullPage: false });

  // Click the button
  console.log('Clicking button...');
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('[data-action="completeSiteRefresh"]');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  console.log('Click dispatched:', clicked);
  await page.waitForTimeout(1000);

  // Check if confirm modal appeared
  const modalInfo = await page.evaluate(() => {
    const overlay = document.querySelector('.dynamic-modal-overlay');
    return {
      exists: !!overlay,
      visible: overlay ? getComputedStyle(overlay).display !== 'none' : false,
      zIndex: overlay ? getComputedStyle(overlay).zIndex : 'N/A',
    };
  });
  console.log('Confirm modal:', JSON.stringify(modalInfo));

  // Screenshot after click
  await page.screenshot({ path: path.join(outDir, 'after-refresh-click.png'), fullPage: false });

  await browser.close();
  server.close();
})();

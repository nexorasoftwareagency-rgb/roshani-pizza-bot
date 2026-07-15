import { chromium } from 'playwright';

const MENU_URL = 'https://roshani-sudha-menu.web.app';
const TOKEN = '1W2JP397Z12BJ1W2'; // Table 04
const ADMIN_URL = 'https://roshani-sudha-admin.web.app';
const RIDER_URL = 'https://roshani-sudha-rider.web.app';

let pass = 0, fail = 0, issues = [];

function check(label, ok) {
  const sym = ok ? '✓' : '✗';
  console.log(`  ${sym} ${label}`);
  if (ok) pass++; else { fail++; issues.push(label); }
}

async function captureErrors(page) {
  const errs = [];
  page.on('pageerror', e => errs.push(`PAGE: ${e.message.slice(0,120)}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errs.push(msg.text().slice(0,120));
  });
  page.on('requestfailed', req => {
    const u = req.url();
    if (!u.includes('recaptcha') && !u.includes('google') && !u.includes('gstatic'))
      errs.push(`NET: ${u.slice(0,80)} ${req.failure()?.errorText || ''}`);
  });
  return errs;
}

async function testQRMenuFullFlow(browser) {
  console.log('\n═══ TEST 1: QR Menu — Full Ordering Flow ═══');
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await ctx.newPage();
  const errs = await captureErrors(page);

  // Step 1: Open with real table token
  await page.goto(`${MENU_URL}?t=${TOKEN}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  // Wait for loading to finish and welcome screen to be active
  await page.waitForSelector('#screenWelcome.active', { timeout: 20000 }).catch(async () => {
    // Fallback: wait for any active screen
    await page.waitForSelector('.screen.active', { timeout: 10000 }).catch(() => {});
  });

  // Step 2: Show welcome screen — click START ORDERING
  const startBtn = await page.$('#btnStartOrdering');
  if (startBtn) {
    console.log('  Welcome screen — clicking START ORDERING');
    await startBtn.click({ force: true });
    await page.waitForTimeout(2000);
  } else {
    // Check if already on menu screen (auto-rejoin)
    const menuScreen = await page.$('#screenMenu.active');
    if (menuScreen) console.log('  Already on menu screen (auto-rejoin)');
  }

  // Step 3: Verify menu screen loaded
  const menuScreen = await page.$('#screenMenu');
  const menuActive = menuScreen ? await menuScreen.evaluate(el => el.classList.contains('active')) : false;
  check('Menu screen active after start', menuActive);

  // Step 4: Wait for dish cards to appear
  await page.waitForSelector('.dish-card', { timeout: 10000 }).catch(() => {});
  const dishCount = await page.$$eval('.dish-card', els => els.length);
  check(`Dish cards rendered: ${dishCount}`, dishCount > 0);

  const visibleDishCount = await page.$$eval('.dish-card', els => els.filter(e => e.offsetParent !== null).length);
  console.log(`  Visible dish cards: ${visibleDishCount}/${dishCount}`);

  // Step 5: Click first visible dish card
  const firstDish = await page.$('.dish-card');
  if (firstDish) {
    const dishName = await firstDish.$eval('.dish-card-name', el => el.textContent);
    console.log(`  Clicking dish: ${dishName}`);

    // Scroll into view if needed
    await firstDish.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await firstDish.click({ timeout: 5000 }).catch(e => {
      console.log(`  Could not click dish: ${e.message.slice(0,60)}`);
    });
    await page.waitForTimeout(2000);
  }

  // Step 6: Check if customization screen appeared
  const customScreen = await page.$('#screenCustomize');
  const customActive = customScreen ? await customScreen.evaluate(el => el.classList.contains('active')) : false;
  check('Customization screen opened', customActive);

  // Step 7: Choose Medium size if available
  const sizeOptions = await page.$$('#sizeOptionsRow .size-chip, .size-option');
  if (sizeOptions.length > 0) {
    // Try to pick the second option (Medium / larger size) if it exists
    const pickIdx = sizeOptions.length > 1 ? 1 : 0;
    await sizeOptions[pickIdx].click();
    await page.waitForTimeout(300);
    console.log(`  Selected size option ${pickIdx}`);
  }

  // Step 8: Click ADD TO ORDER
  const addBtn = await page.$('#btnAddToOrder');
  if (addBtn) {
    check('Add to order button present', true);
    await addBtn.click();
    await page.waitForTimeout(2000);

    // Step 9: Check if item was added to cart (menu bar should appear)
    const cartBar = await page.$('#menuCartBar');
    const cartBarVisible = cartBar ? await cartBar.isVisible() : false;
    check('Cart bar visible after adding', cartBarVisible);

    // Step 10: Wait for toast to fade, then open cart via bottom nav
    await page.waitForTimeout(2000);
    const cartNavBtn = await page.$('[data-bottom-tab="screenCart"]');
    if (cartNavBtn) {
      await cartNavBtn.click({ force: true });
      await page.waitForTimeout(1000);
    } else {
      // Fallback: try the topbar cart button
      const cartBtn = await page.$('#btnOpenCartFromMenu');
      if (cartBtn) {
        await cartBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    const cartScreen = await page.$('#screenCart');
    const cartActive = cartScreen ? await cartScreen.evaluate(el => el.classList.contains('active')) : false;
    check('Cart screen active', cartActive);

    // Step 11: Fill checkout fields
    // Wait for checkout fields to be visible
    await page.waitForTimeout(500);
    const nameInput = await page.$('#checkoutName');
    const phoneInput = await page.$('#checkoutPhone');
    if (nameInput) {
      await nameInput.fill('Playwright Test');
      check('Name filled', true);
    }
    if (phoneInput) {
      await phoneInput.fill('9876543210');
      check('Phone filled', true);
    }

    // Step 12: Place the order
    const placeBtn = await page.$('#btnPlaceOrder');
    if (placeBtn) {
      check('Place Order button present', true);
      await placeBtn.click({ force: true });
      await page.waitForTimeout(5000);

      // Step 13: Check tracking screen
      const trackingScreen = await page.$('#screenTracking');
      const trackingActive = trackingScreen ? await trackingScreen.evaluate(el => el.classList.contains('active')) : false;
      check('Tracking screen shown after order placed', trackingActive);

      // Step 14: Verify order ID is shown
      const orderIdEl = await page.$('#trackingOrderId');
      const orderId = orderIdEl ? await orderIdEl.textContent() : '';
      check(`Order ID generated: ${orderId}`, orderId && orderId.length > 0);

      // Step 15: Verify status label
      const statusLabel = await page.$('#trackingStatusLabel');
      const status = statusLabel ? await statusLabel.textContent() : '';
      console.log(`  Order status: ${status}`);
    }
  } else {
    check('Add to order button present', false);
    issues.push('Missing add-to-order button');
  }

  // Step 16: Check console errors
  const filtered = errs.filter(e =>
    !e.includes('favicon') && !e.includes('storage') && !e.includes('requestStorageAccess') && !e.includes('recaptcha'));
  check(`Console/net errors: ${filtered.length}`, filtered.length === 0);
  if (filtered.length > 0) console.log(`  ERRORS: ${filtered.slice(0,5).join(' | ')}`);

  await page.screenshot({ path: 'test1-menu-flow.png', fullPage: true });
  console.log('  Screenshot: test1-menu-flow.png');
  await ctx.close();
}

async function testAdminDashboard(browser) {
  console.log('\n═══ TEST 2: Admin Dashboard — Load & Login ═══');
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errs = await captureErrors(page);

  await page.goto(ADMIN_URL, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(3000);

  const title = await page.title();
  check(`Title: "${title}"`, title.includes('Admin'));

  const hasLoginForm = await page.$('#loginForm, .login-form, form, input[type="email"]');
  check('Login form present', !!hasLoginForm);

  // Check source has isBody (fix deployed)
  const sources = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[src]')).map(s => s.src)
  );
  const mainJsUrl = sources.find(s => s.includes('main.js'));
  if (mainJsUrl) {
    const resp = await page.context().request.get(mainJsUrl);
    const text = await resp.text();
    check('isBody fix deployed', text.includes('isBody'));
  }

  const filtered = errs.filter(e => !e.includes('favicon'));
  check(`Console errors: ${filtered.length}`, filtered.length === 0);
  if (filtered.length > 0) issues.push(...filtered);

  await page.screenshot({ path: 'test2-admin-login.png', fullPage: false });
  await ctx.close();
}

async function testAdminOrdersSource(browser) {
  console.log('\n═══ TEST 3: Admin Orders Source — dw-* Classes ═══');
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();

  const ordersJsUrl = `${ADMIN_URL}/js/features/orders.js`;
  try {
    const resp = await page.context().request.get(ordersJsUrl);
    const text = await resp.text();

    const dwClasses = ['dw-body','dw-header','dw-section','dw-actions','dw-money-panel',
      'dw-completed-banner','dw-rider-select','dw-item-row','dw-item-qty'];
    const found = dwClasses.filter(c => text.includes(c));
    check(`orders.js reachable (${text.length} bytes)`, text.length > 1000);
    check(`dw-* classes: ${found.length}/${dwClasses.length}`, found.length >= 7);
    if (found.length < 7) console.log(`  Missing: ${dwClasses.filter(c => !found.includes(c)).join(', ')}`);

    check('STATUS_SEQUENCES has 9-step Online',
      text.includes('Arriving at Restaurant') && text.includes('Arrived at Restaurant'));
    check('DRAWER_ONLINE_PHASES has Arriving',
      text.includes("label: 'Arriving'") || text.includes('"Arriving"'));
    check('_advanceOrder uses runTransaction',
      text.includes('runTransaction(_ordersRef(orderId)'));
  } catch (e) {
    check(`Fetch orders.js: ${e.message}`, false);
    issues.push(`orders.js fetch failed: ${e.message}`);
  }

  await ctx.close();
}

async function testRiderApp(browser) {
  console.log('\n═══ TEST 4: Rider App — Load & Login ═══');
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  const errs = await captureErrors(page);

  await page.goto(RIDER_URL, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(3000);

  const title = await page.title();
  check(`Title: "${title}"`, title.includes('Rider'));

  const root = await page.$('#root');
  check('React root mounted', !!root);

  const hasInputs = await page.$$('input[type="text"], input[type="email"]');
  check('Login inputs present', hasInputs.length > 0);

  const filtered = errs.filter(e =>
    !e.includes('favicon') && !e.includes('requestStorageAccess') && !e.includes('recaptcha') && !e.includes('react'));
  check(`Console errors: ${filtered.length}`, filtered.length === 0);
  if (filtered.length > 0) issues.push(...filtered);

  await page.screenshot({ path: 'test4-rider-login.png' });
  await ctx.close();
}

async function testPWAFeatures(browser) {
  console.log('\n═══ TEST 5: PWA Features ═══');
  let ctx, page;

  ctx = await browser.newContext();
  page = await ctx.newPage();
  await page.goto(MENU_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  const menuSW = await page.evaluate(() =>
    navigator.serviceWorker?.getRegistrations?.()
      .then(r => r.map(x => ({ scope: x.scope, active: !!x.active })))
  );
  check('Menu SW registered', menuSW && menuSW.length > 0);
  const manifestLink = await page.$('link[rel="manifest"]');
  check('Menu manifest link', !!manifestLink);
  await ctx.close();

  ctx = await browser.newContext();
  page = await ctx.newPage();
  await page.goto(ADMIN_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  const adminSW = await page.evaluate(() =>
    navigator.serviceWorker?.getRegistrations?.()
      .then(r => r.map(x => ({ scope: x.scope, active: !!x.active })))
  );
  check('Admin SW registered', adminSW && adminSW.length > 0);
  await ctx.close();
}

async function testFirebaseRules() {
  console.log('\n═══ TEST 6: Firebase Rules — Key Paths ═══');
  const base = 'https://prashant-pizza-e86e4-default-rtdb.firebaseio.com';

  for (const [label, path] of [['tables', '/pizza/tables.json?shallow=true'],
    ['dishes', '/pizza/dishes.json?shallow=true'],
    ['tableSessions', '/pizza/tableSessions.json?shallow=true']]) {
    try {
      const resp = await fetch(`${base}${path}`);
      check(`${label}: world-readable`, resp.ok);
    } catch (e) {
      check(`${label}: ${e.message}`, false);
    }
  }

  // tableSessionsContact should be blocked (PII guard)
  try {
    const resp = await fetch(`${base}/pizza/tableSessionsContact.json`);
    check('tableSessionsContact: blocked (PII guard)', !resp.ok);
  } catch (e) {
    check('tableSessionsContact: blocked (PII guard)', true);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   ROSHANI ERP — FULL E2E TEST SUITE     ║');
  console.log('║   Real browser tests via Playwright      ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`Started: ${new Date().toISOString()}`);

  const browser = await chromium.launch({ headless: true });

  try {
    await testQRMenuFullFlow(browser);
    await testAdminDashboard(browser);
    await testAdminOrdersSource(browser);
    await testRiderApp(browser);
    await testPWAFeatures(browser);
    await testFirebaseRules();
  } finally {
    await browser.close();
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════════════════');
  console.log(`  PASS: ${pass}`);
  console.log(`  FAIL: ${fail}`);
  console.log(`  Total: ${pass + fail}`);
  console.log(`  Pass rate: ${Math.round(pass/(pass+fail)*100)}%`);

  if (issues.length > 0) {
    console.log('\n  ISSUES:');
    issues.forEach((i, n) => console.log(`  ${n+1}. ${i}`));
  } else {
    console.log('\n  ✅ All checks passed');
  }

  console.log(`\nFinished: ${new Date().toISOString()}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });

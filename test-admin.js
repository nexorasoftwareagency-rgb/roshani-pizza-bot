const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    
    const issues = [];
    const warnings = [];
    const screenshots = [];
    
    async function screenshot(name) {
        const dir = 'C:/Prasant-Pizza-ERP/test-screenshots/admin';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const p = path.join(dir, name + '.png');
        await page.screenshot({ path: p, fullPage: false });
        screenshots.push({ name, path: p });
    }
    
    const consoleErrors = [];
    page.on('pageerror', e => consoleErrors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    
    const networkErrors = [];
    page.on('requestfailed', req => networkErrors.push({ url: req.url(), error: req.failure()?.errorText }));
    
    // TEST 1: Login page loads
    console.log('=== TEST 1: Login Page ===');
    await page.goto('https://roshani-sudha-admin.web.app', { waitUntil: 'networkidle', timeout: 30000 });
    await screenshot('01-login-page');
    
    const emailInput = await page.locator('input[type="email"], #email, [placeholder*="email" i]').count();
    const passwordInput = await page.locator('input[type="password"], #password').count();
    const loginBtn = await page.locator('button:has-text("Login"), button:has-text("Sign"), button[type="submit"]').count();
    console.log(`Login form: email=${emailInput}, password=${passwordInput}, btn=${loginBtn}`);
    if (emailInput === 0 || passwordInput === 0 || loginBtn === 0) {
        issues.push({ severity: 'CRITICAL', test: 'Login Form', detail: `Missing elements: email=${emailInput}, password=${passwordInput}, btn=${loginBtn}` });
    }
    
    const title = await page.title();
    console.log(`Title: ${title}`);
    
    const stylesheets = await page.locator('link[rel="stylesheet"]').count();
    const scripts = await page.locator('script[src]').count();
    console.log(`Resources: ${stylesheets} stylesheets, ${scripts} scripts`);
    
    // TEST 2: Try demo login
    console.log('\n=== TEST 2: Demo Login ===');
    const demoBtn = await page.locator('button:has-text("Demo"), button:has-text("demo"), a:has-text("Demo")').count();
    console.log(`Demo button found: ${demoBtn}`);
    
    const errorElements = await page.locator('.error, .alert-danger, [class*="error"]').count();
    console.log(`Error elements visible: ${errorElements}`);
    
    // TEST 3: Check all navigation tabs exist
    console.log('\n=== TEST 3: Navigation Structure ===');
    const navHTML = await page.evaluate(() => {
        const nav = document.querySelector('nav, .nav, .sidebar, .tabs, [role="tablist"]');
        return nav ? nav.innerHTML.substring(0, 2000) : 'NO NAV FOUND';
    });
    console.log('Nav:', navHTML.substring(0, 500));
    
    // TEST 4: Check modals exist in DOM
    console.log('\n=== TEST 4: Modal Inventory ===');
    const modals = await page.evaluate(() => {
        const modalElements = document.querySelectorAll('[id*="Modal"], [id*="modal"], .modal, [role="dialog"]');
        return Array.from(modalElements).map(m => ({
            id: m.id || 'no-id',
            classes: m.className.substring(0, 100),
            hidden: m.classList.contains('hidden') || m.style.display === 'none',
            role: m.getAttribute('role'),
            ariaModal: m.getAttribute('aria-modal'),
            ariaLabel: m.getAttribute('aria-label'),
        }));
    });
    console.log(`Found ${modals.length} modals:`);
    modals.forEach(m => {
        console.log(`  - ${m.id}: hidden=${m.hidden} role=${m.role} aria-modal=${m.ariaModal} aria-label=${m.ariaLabel}`);
        if (!m.ariaModal) warnings.push({ test: 'Accessibility', detail: `Modal #${m.id} missing aria-modal="true"` });
        if (!m.ariaLabel) warnings.push({ test: 'Accessibility', detail: `Modal #${m.id} missing aria-label` });
    });
    
    // TEST 5: Check all buttons have click handlers or proper types
    console.log('\n=== TEST 5: Button Audit ===');
    const buttons = await page.evaluate(() => {
        const btns = document.querySelectorAll('button, [role="button"], input[type="submit"]');
        return Array.from(btns).slice(0, 50).map(b => ({
            text: (b.textContent || '').trim().substring(0, 50),
            type: b.type,
            disabled: b.disabled,
            hasOnclick: !!b.onclick,
            dataAction: b.getAttribute('data-action'),
            ariaLabel: b.getAttribute('aria-label'),
            className: b.className.substring(0, 80),
        }));
    });
    console.log(`Found ${buttons.length} buttons (showing first 50):`);
    const buttonsWithoutLabels = buttons.filter(b => !b.text && !b.ariaLabel && !b.dataAction);
    if (buttonsWithoutLabels.length > 0) {
        warnings.push({ test: 'Accessibility', detail: `${buttonsWithoutLabels.length} buttons without text/aria-label` });
    }
    
    // TEST 6: Check tables exist and have proper structure
    console.log('\n=== TEST 6: Tables ===');
    const tables = await page.evaluate(() => {
        const tbls = document.querySelectorAll('table');
        return Array.from(tbls).map(t => ({
            id: t.id || 'no-id',
            rows: t.rows?.length || 0,
            hasHeaders: t.querySelector('th') !== null,
            className: t.className.substring(0, 80),
        }));
    });
    console.log(`Found ${tables.length} tables:`);
    tables.forEach(t => console.log(`  - ${t.id}: ${t.rows} rows, headers=${t.hasHeaders}`));
    
    // TEST 7: Check for inline onclick handlers (should use data-action)
    console.log('\n=== TEST 7: Inline onclick audit ===');
    const inlineHandlers = await page.evaluate(() => {
        const els = document.querySelectorAll('[onclick]');
        return Array.from(els).slice(0, 20).map(e => ({
            tag: e.tagName,
            onclick: e.getAttribute('onclick')?.substring(0, 100),
            text: (e.textContent || '').trim().substring(0, 50),
        }));
    });
    console.log(`Inline onclick handlers: ${inlineHandlers.length}`);
    inlineHandlers.forEach(h => console.log(`  <${h.tag}> onclick="${h.onclick}" text="${h.text}"`));
    if (inlineHandlers.length > 0) {
        warnings.push({ test: 'Code Quality', detail: `${inlineHandlers.length} inline onclick handlers found (should use data-action)` });
    }
    
    // TEST 8: Check CSS custom properties loaded
    console.log('\n=== TEST 8: CSS Variables ===');
    const cssVars = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        return {
            primary: root.getPropertyValue('--primary'),
            bgMain: root.getPropertyValue('--bg-main'),
            cardBg: root.getPropertyValue('--card-bg'),
            textMain: root.getPropertyValue('--text-main'),
            transitionFast: root.getPropertyValue('--transition-fast'),
            transitionNormal: root.getPropertyValue('--transition-normal'),
        };
    });
    console.log('CSS Variables:', JSON.stringify(cssVars, null, 2));
    if (!cssVars.primary) warnings.push({ test: 'CSS', detail: '--primary not set' });
    
    // TEST 9: Check KPI cards
    console.log('\n=== TEST 9: KPI Cards ===');
    const kpis = await page.evaluate(() => {
        const cards = document.querySelectorAll('.kpi-card, [class*="kpi"], [class*="stat-card"]');
        return Array.from(cards).map(c => ({
            text: (c.textContent || '').trim().substring(0, 100),
            className: c.className.substring(0, 80),
        }));
    });
    console.log(`Found ${kpis.length} KPI cards:`);
    kpis.forEach(k => console.log(`  - "${k.text.substring(0, 60)}"`));
    
    // TEST 10: Check forms
    console.log('\n=== TEST 10: Form Elements ===');
    const forms = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input, select, textarea');
        return Array.from(inputs).slice(0, 30).map(i => ({
            tag: i.tagName,
            type: i.type,
            id: i.id || 'no-id',
            name: i.name || 'no-name',
            placeholder: (i.placeholder || '').substring(0, 50),
            required: i.required,
            ariaLabel: i.getAttribute('aria-label'),
        }));
    });
    console.log(`Found ${forms.length} form elements:`);
    const inputsWithoutLabels = forms.filter(f => !f.ariaLabel && !f.placeholder && !f.id);
    if (inputsWithoutLabels.length > 0) {
        warnings.push({ test: 'Accessibility', detail: `${inputsWithoutLabels.length} inputs without labels/placeholders` });
    }
    
    // TEST 11: Check for broken images
    console.log('\n=== TEST 11: Image Audit ===');
    const images = await page.evaluate(() => {
        const imgs = document.querySelectorAll('img');
        return Array.from(imgs).map(i => ({
            src: i.src.substring(0, 100),
            alt: i.alt || 'NO ALT',
            loaded: i.complete && i.naturalWidth > 0,
        }));
    });
    const brokenImages = images.filter(i => !i.loaded);
    console.log(`Found ${images.length} images, ${brokenImages.length} broken`);
    if (brokenImages.length > 0) {
        issues.push({ severity: 'HIGH', test: 'Images', detail: `${brokenImages.length} broken images: ${brokenImages.map(i => i.src).join(', ')}` });
    }
    
    // TEST 12: Mobile viewport
    console.log('\n=== TEST 12: Mobile Responsive ===');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await screenshot('12-mobile-view');
    const mobileOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
    });
    console.log(`Horizontal overflow on mobile: ${mobileOverflow}`);
    if (mobileOverflow) {
        issues.push({ severity: 'HIGH', test: 'Responsive', detail: 'Horizontal overflow on mobile viewport (375px)' });
    }
    
    await page.setViewportSize({ width: 1440, height: 900 });
    
    // SUMMARY
    console.log('\n========== SUMMARY ==========');
    console.log(`Console Errors: ${consoleErrors.length}`);
    consoleErrors.forEach(e => console.log(`  ERROR: ${e.substring(0, 200)}`));
    console.log(`Network Errors: ${networkErrors.length}`);
    networkErrors.forEach(e => console.log(`  FAIL: ${e.url} - ${e.error}`));
    console.log(`Issues: ${issues.length}`);
    issues.forEach(i => console.log(`  [${i.severity}] ${i.test}: ${i.detail}`));
    console.log(`Warnings: ${warnings.length}`);
    warnings.forEach(w => console.log(`  [WARN] ${w.test}: ${w.detail}`));
    console.log(`Screenshots: ${screenshots.length}`);
    
    await browser.close();
    
    const report = { consoleErrors, networkErrors, issues, warnings, screenshots: screenshots.map(s => s.name), modals, buttons: buttons.length, tables: tables.length, forms: forms.length, images: images.length };
    fs.writeFileSync('C:/Prasant-Pizza-ERP/test-screenshots/admin/report.json', JSON.stringify(report, null, 2));
    console.log('\nReport written to test-screenshots/admin/report.json');
})();

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    const issues = [];
    const warnings = [];

    async function screenshot(name) {
        const dir = 'C:/Prasant-Pizza-ERP/test-screenshots/menu';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: false });
    }

    const consoleErrors = [];
    page.on('pageerror', e => consoleErrors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    const networkErrors = [];
    page.on('requestfailed', req => networkErrors.push({ url: req.url(), error: req.failure()?.errorText }));

    // TEST 1: Page loads
    console.log('=== TEST 1: Home Page ===');
    await page.goto('https://roshani-sudha-menu.web.app', { waitUntil: 'networkidle', timeout: 30000 });
    await screenshot('01-home-page');

    const title = await page.title();
    console.log(`Title: ${title}`);

    // TEST 2: Check viewport meta
    console.log('\n=== TEST 2: Viewport Meta ===');
    const viewportMeta = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="viewport"]');
        return meta ? meta.content : 'NOT FOUND';
    });
    console.log(`Viewport: ${viewportMeta}`);
    if (viewportMeta.includes('user-scalable=no')) {
        issues.push({ severity: 'HIGH', test: 'Viewport', detail: 'user-scalable=no found (accessibility issue)' });
    }

    // TEST 3: Check navigation
    console.log('\n=== TEST 3: Navigation ===');
    const nav = await page.evaluate(() => {
        const links = document.querySelectorAll('a, [role="link"], .nav-item, .tab');
        return Array.from(links).slice(0, 20).map(l => ({
            text: (l.textContent || '').trim().substring(0, 50),
            href: l.href || '',
            tag: l.tagName,
        }));
    });
    console.log(`Navigation elements: ${nav.length}`);
    nav.forEach(n => console.log(`  <${n.tag}> "${n.text}" -> ${n.href}`));

    // TEST 4: Check images
    console.log('\n=== TEST 4: Image Audit ===');
    const images = await page.evaluate(() => {
        const imgs = document.querySelectorAll('img');
        return Array.from(imgs).map(i => ({
            src: i.src.substring(0, 120),
            alt: i.alt || 'NO ALT',
            loaded: i.complete && i.naturalWidth > 0,
            width: i.naturalWidth,
        }));
    });
    const brokenImages = images.filter(i => !i.loaded && i.src !== '');
    console.log(`Images: ${images.length} total, ${brokenImages.length} broken`);
    brokenImages.forEach(i => {
        console.log(`  BROKEN: ${i.src}`);
        issues.push({ severity: 'HIGH', test: 'Images', detail: `Broken: ${i.src}` });
    });
    const imagesNoAlt = images.filter(i => !i.alt || i.alt === 'NO ALT');
    if (imagesNoAlt.length > 0) {
        warnings.push({ test: 'A11y', detail: `${imagesNoAlt.length} images without alt text` });
    }

    // TEST 5: Check menu items / cards
    console.log('\n=== TEST 5: Menu Content ===');
    const menuContent = await page.evaluate(() => {
        const cards = document.querySelectorAll('.dish-card, .menu-card, [class*="dish"], [class*="menu-item"], .product-card');
        const categories = document.querySelectorAll('.category, [class*="category"], .section-title, h2, h3');
        return {
            cards: cards.length,
            categories: Array.from(categories).map(c => (c.textContent || '').trim().substring(0, 50)),
        };
    });
    console.log(`Menu cards: ${menuContent.cards}`);
    console.log(`Categories: ${menuContent.categories.join(', ')}`);

    // TEST 6: Check cart functionality
    console.log('\n=== TEST 6: Cart ===');
    const cartElements = await page.evaluate(() => {
        const cart = document.querySelector('.cart, #cart, [class*="cart"], [id*="cart"]');
        const cartCount = document.querySelector('.cart-count, .badge, [class*="cart-count"]');
        const allBtns = document.querySelectorAll('button, [data-action="add-to-cart"], .add-to-cart, input[type="submit"]');
        const addToCartBtns = Array.from(allBtns).filter(el => {
            const text = (el.textContent || '').toLowerCase();
            const action = (el.getAttribute('data-action') || '').toLowerCase();
            const cls = (el.className || '').toLowerCase();
            return text.includes('add') || action.includes('add-to-cart') || cls.includes('add-to-cart');
        });
        return {
            cartExists: !!cart,
            cartCount: cartCount?.textContent?.trim() || 'none',
            addToCartButtons: addToCartBtns.length,
        };
    });
    console.log(`Cart exists: ${cartElements.cartExists}, count: ${cartElements.cartCount}, add buttons: ${cartElements.addToCartButtons}`);

    // TEST 7: Check CSS hover states
    console.log('\n=== TEST 7: CSS Hover States ===');
    const hoverCSS = await page.evaluate(() => {
        const sheets = document.styleSheets;
        let hoverRules = 0;
        let transitionRules = 0;
        try {
            for (const sheet of sheets) {
                for (const rule of sheet.cssRules || []) {
                    if (rule.selectorText && rule.selectorText.includes(':hover')) hoverRules++;
                    if (rule.style && rule.style.transition) transitionRules++;
                }
            }
        } catch(e) {}
        return { hoverRules, transitionRules };
    });
    console.log(`Hover rules: ${hoverCSS.hoverRules}, Transition rules: ${hoverCSS.transitionRules}`);

    // TEST 8: Check accessibility
    console.log('\n=== TEST 8: Accessibility ===');
    const a11y = await page.evaluate(() => {
        return {
            lang: document.documentElement.lang,
            ariaLabels: document.querySelectorAll('[aria-label]').length,
            ariaRoles: document.querySelectorAll('[role]').length,
            focusVisible: !!document.querySelector('style, link[rel="stylesheet"]'),
            skipLinks: !!document.querySelector('a[href="#main"], a[href="#content"], .skip-link'),
            headings: {
                h1: document.querySelectorAll('h1').length,
                h2: document.querySelectorAll('h2').length,
                h3: document.querySelectorAll('h3').length,
            },
        };
    });
    console.log('Accessibility:', JSON.stringify(a11y, null, 2));
    if (!a11y.lang) warnings.push({ test: 'A11y', detail: 'No lang attribute on html' });
    if (!a11y.skipLinks) warnings.push({ test: 'A11y', detail: 'No skip navigation link' });
    if (a11y.headings.h1 === 0) warnings.push({ test: 'A11y', detail: 'No h1 element found' });

    // TEST 9: Focus visible CSS
    console.log('\n=== TEST 9: Focus Visible ===');
    const focusVisibleCSS = await page.evaluate(() => {
        const sheets = document.styleSheets;
        let focusVisibleRules = 0;
        let focusRules = 0;
        try {
            for (const sheet of sheets) {
                for (const rule of sheet.cssRules || []) {
                    if (rule.selectorText) {
                        if (rule.selectorText.includes(':focus-visible')) focusVisibleRules++;
                        if (rule.selectorText.includes(':focus')) focusRules++;
                    }
                }
            }
        } catch(e) {}
        return { focusVisibleRules, focusRules };
    });
    console.log(`:focus-visible rules: ${focusVisibleCSS.focusVisibleRules}, :focus rules: ${focusVisibleCSS.focusRules}`);

    // TEST 10: prefers-reduced-motion
    console.log('\n=== TEST 10: Reduced Motion ===');
    const reducedMotion = await page.evaluate(() => {
        const sheets = document.styleSheets;
        let found = false;
        try {
            for (const sheet of sheets) {
                for (const rule of sheet.cssRules || []) {
                    if (rule.conditionText && rule.conditionText.includes('prefers-reduced-motion')) {
                        found = true;
                    }
                }
            }
        } catch(e) {}
        return found;
    });
    console.log(`prefers-reduced-motion: ${reducedMotion}`);

    // TEST 11: Check for console warnings too
    console.log('\n=== TEST 11: Console Warnings ===');
    const consoleWarnings = [];
    page.on('console', msg => { if (msg.type() === 'warning') consoleWarnings.push(msg.text()); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    console.log(`Console warnings: ${consoleWarnings.length}`);
    consoleWarnings.forEach(w => console.log(`  WARN: ${w.substring(0, 200)}`));

    // TEST 12: Performance metrics
    console.log('\n=== TEST 12: Performance ===');
    const perf = await page.evaluate(() => {
        const timing = performance.getEntriesByType('navigation')[0];
        return {
            domContentLoaded: Math.round(timing?.domContentLoadedEventEnd || 0),
            loadComplete: Math.round(timing?.loadEventEnd || 0),
            resources: performance.getEntriesByType('resource').length,
            transferSize: performance.getEntriesByType('resource').reduce((sum, r) => sum + (r.transferSize || 0), 0),
        };
    });
    console.log('Performance:', JSON.stringify(perf, null, 2));

    // TEST 13: Desktop viewport
    console.log('\n=== TEST 13: Desktop View ===');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);
    await screenshot('13-desktop-view');
    const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`Desktop overflow: ${desktopOverflow}`);

    // TEST 14: Check all interactive elements have cursor:pointer
    console.log('\n=== TEST 14: Cursor Pointer Audit ===');
    const clickableNoPointer = await page.evaluate(() => {
        const clickables = document.querySelectorAll('button, a, [role="button"], input[type="submit"], .clickable');
        let count = 0;
        clickables.forEach(el => {
            const style = getComputedStyle(el);
            if (style.cursor !== 'pointer' && style.cursor !== 'default') {
                count++;
            }
        });
        return count;
    });
    console.log(`Clickable elements without pointer cursor: ${clickableNoPointer}`);

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

    await browser.close();

    const report = { consoleErrors, networkErrors, issues, warnings, images: images.length, brokenImages: brokenImages.length, menuCards: menuContent.cards, a11y, hoverCSS, focusVisibleCSS, reducedMotion, perf };
    fs.writeFileSync('C:/Prasant-Pizza-ERP/test-screenshots/menu/report.json', JSON.stringify(report, null, 2));
})();

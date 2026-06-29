const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const allIssues = [];
    
    // ========== ADMIN ==========
    console.log('=== ADMIN RECHECK ===');
    const admin = await browser.newPage();
    await admin.setViewportSize({ width: 1440, height: 900 });
    const adminErrors = [];
    admin.on('pageerror', e => adminErrors.push(e.message));
    admin.on('console', msg => { if (msg.type() === 'error') adminErrors.push(msg.text()); });
    await admin.goto('https://roshani-sudha-admin.web.app', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => adminErrors.push(e.message));
    await admin.waitForTimeout(1500);
    
    console.log(`JS errors: ${adminErrors.length}`);
    adminErrors.forEach(e => console.log(`  ❌ ${e.substring(0, 150)}`));
    
    // H1: promoMenuImageImg
    const promoSrc = await admin.evaluate(() => {
        const img = document.getElementById('promoMenuImageImg');
        return img ? img.getAttribute('src') : 'NOT FOUND';
    });
    const h1Pass = promoSrc && promoSrc.length > 10 && !promoSrc.endsWith('/');
    console.log(`H1 (promoMenuImageImg): ${h1Pass ? '✅ PASS' : '❌ FAIL'} — src=${promoSrc?.substring(0, 60)}`);
    if (!h1Pass) allIssues.push('H1 FAIL');
    
    // L5: hardcoded transitions
    const hardcoded = await admin.evaluate(() => {
        let count = 0;
        try {
            for (const sheet of document.styleSheets) {
                for (const rule of sheet.cssRules || []) {
                    if (rule.style?.transition) {
                        const t = rule.style.transition;
                        if (t.match(/0\.[24]s cubic-bezier/)) count++;
                    }
                }
            }
        } catch(e) {}
        return count;
    });
    console.log(`L5 (hardcoded transitions): ${hardcoded} remaining (target: ≤3) ${hardcoded <= 3 ? '✅' : '⚠️'}`);
    
    // All modals ARIA
    const adminModals = await admin.evaluate(() => {
        return Array.from(document.querySelectorAll('[id*="Modal"], [id*="modal"]')).map(m => ({
            id: m.id, role: m.getAttribute('role'), ariaModal: m.getAttribute('aria-modal')
        }));
    });
    const adminBadModals = adminModals.filter(m => m.role && !m.ariaModal);
    console.log(`Modals: ${adminModals.length} total, ${adminBadModals.length} missing aria-modal`);
    adminBadModals.forEach(m => console.log(`  ⚠️ ${m.id} has role=${m.role} but no aria-modal`));
    
    // Mobile check
    await admin.setViewportSize({ width: 375, height: 812 });
    await admin.waitForTimeout(300);
    const adminMobileOk = await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    console.log(`Mobile overflow: ${adminMobileOk ? '✅' : '❌'}`);
    
    await admin.close();
    
    // ========== RIDER ==========
    console.log('\n=== RIDER RECHECK ===');
    const rider = await browser.newPage();
    await rider.setViewportSize({ width: 375, height: 812 });
    const riderErrors = [];
    rider.on('pageerror', e => riderErrors.push(e.message));
    rider.on('console', msg => { if (msg.type() === 'error') riderErrors.push(msg.text()); });
    await rider.goto('https://roshani-sudha-rider.web.app', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => riderErrors.push(e.message));
    await rider.waitForTimeout(1500);
    
    console.log(`JS errors: ${riderErrors.length}`);
    riderErrors.forEach(e => console.log(`  ❌ ${e.substring(0, 150)}`));
    
    // H2: settlementModal
    const settlement = await rider.evaluate(() => {
        const m = document.getElementById('settlementModal');
        return m ? { role: m.getAttribute('role'), ariaModal: m.getAttribute('aria-modal'), ariaLabel: m.getAttribute('aria-label') } : null;
    });
    const h2Pass = settlement?.role === 'dialog' && settlement?.ariaModal === 'true';
    console.log(`H2 (settlementModal ARIA): ${h2Pass ? '✅ PASS' : '❌ FAIL'} — role=${settlement?.role} aria-modal=${settlement?.ariaModal} aria-label=${settlement?.ariaLabel}`);
    if (!h2Pass) allIssues.push('H2 FAIL');
    
    // M4: focus-visible rules
    const focusRules = await rider.evaluate(() => {
        let count = 0;
        try {
            for (const sheet of document.styleSheets) {
                for (const rule of sheet.cssRules || []) {
                    if (rule.selectorText?.includes(':focus-visible')) count++;
                }
            }
        } catch(e) {}
        return count;
    });
    const m4Pass = focusRules >= 5;
    console.log(`M4 (focus-visible rules): ${focusRules} ${m4Pass ? '✅ PASS' : '❌ FAIL'}`);
    if (!m4Pass) allIssues.push('M4 FAIL');
    
    // All Rider modals ARIA
    const riderModals = await rider.evaluate(() => {
        return Array.from(document.querySelectorAll('[id*="Modal"], [id*="modal"]')).map(m => ({
            id: m.id, role: m.getAttribute('role'), ariaModal: m.getAttribute('aria-modal')
        }));
    });
    const riderBadModals = riderModals.filter(m => !m.role || !m.ariaModal);
    console.log(`Modals: ${riderModals.length} total, ${riderBadModals.length} without ARIA`);
    riderBadModals.forEach(m => console.log(`  ❌ ${m.id} missing role/aria-modal`));
    
    // Functions check
    const funcs = await rider.evaluate(() => {
        const check = ['startPingSound','stopPingSound','showPingModal','hidePingModal','renderAllOrders','confirmPickup','finalizeDeliverySequence'];
        return check.filter(f => typeof window[f] !== 'function');
    });
    console.log(`Functions: ${funcs.length === 0 ? '✅ All exist' : '❌ Missing: ' + funcs.join(', ')}`);
    
    // Audio check
    const audio = await rider.evaluate(() => {
        const a = document.getElementById('pingAudio');
        return a ? { src: a.querySelector('source')?.src || a.src, preload: a.preload } : null;
    });
    console.log(`Audio: ${audio ? '✅ ' + audio.src.substring(0, 60) : '❌ Missing'}`);
    
    // Mobile overflow
    const riderMobileOk = await rider.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    console.log(`Mobile overflow: ${riderMobileOk ? '✅' : '❌'}`);
    
    await rider.close();
    
    // ========== MENU ==========
    console.log('\n=== MENU RECHECK ===');
    const menu = await browser.newPage();
    await menu.setViewportSize({ width: 375, height: 812 });
    const menuErrors = [];
    menu.on('pageerror', e => menuErrors.push(e.message));
    menu.on('console', msg => { if (msg.type() === 'error') menuErrors.push(msg.text()); });
    await menu.goto('https://roshani-sudha-menu.web.app', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => menuErrors.push(e.message));
    await menu.waitForTimeout(1500);
    
    console.log(`JS errors: ${menuErrors.length}`);
    menuErrors.forEach(e => console.log(`  ❌ ${e.substring(0, 150)}`));
    
    // M1: h1
    const h1Count = await menu.evaluate(() => document.querySelectorAll('h1').length);
    const m1Pass = h1Count > 0;
    console.log(`M1 (<h1>): ${m1Pass ? '✅ PASS' : '❌ FAIL'} — ${h1Count} found`);
    if (!m1Pass) allIssues.push('M1 FAIL');
    
    // M2: skip link
    const skipLink = await menu.evaluate(() => {
        const el = document.querySelector('.skip-link, a[href="#screenMenu"], a[href="#main"]');
        return el ? el.textContent.trim() : null;
    });
    const srOnly = await menu.evaluate(() => {
        let found = false;
        try {
            for (const sheet of document.styleSheets) {
                for (const rule of sheet.cssRules || []) {
                    if (rule.selectorText?.includes('.sr-only')) found = true;
                }
            }
        } catch(e) {}
        return found;
    });
    const m2Pass = !!skipLink && srOnly;
    console.log(`M2 (skip link): ${skipLink ? '✅ "' + skipLink + '"' : '❌ Not found'}`);
    console.log(`M2 (.sr-only CSS): ${srOnly ? '✅' : '❌'}`);
    if (!m2Pass) allIssues.push('M2 FAIL');
    
    // Viewport
    const vp = await menu.evaluate(() => document.querySelector('meta[name="viewport"]')?.content);
    console.log(`Viewport: ${vp?.includes('user-scalable=no') ? '❌ user-scalable=no' : '✅ OK'}`);
    
    // Images
    const imgs = await menu.evaluate(() => {
        return Array.from(document.querySelectorAll('img')).map(i => ({
            loaded: i.complete && i.naturalWidth > 0,
            src: i.src.substring(0, 80)
        }));
    });
    const brokenImgs = imgs.filter(i => !i.loaded);
    console.log(`Images: ${imgs.length} total, ${brokenImgs.length} broken ${brokenImgs.length === 0 ? '✅' : '❌'}`);
    
    // Responsive
    console.log('Responsive:');
    for (const bp of [375, 768, 1024, 1440]) {
        await menu.setViewportSize({ width: bp, height: 900 });
        await menu.waitForTimeout(200);
        const ok = await menu.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        console.log(`  ${bp}px: ${ok ? '✅' : '❌ OVERFLOW'}`);
        if (!ok) allIssues.push(`Menu overflow at ${bp}px`);
    }
    
    await menu.close();
    
    // ========== FINAL ==========
    console.log(`\n${'='.repeat(50)}`);
    console.log(`FINAL RESULT: ${allIssues.length === 0 ? '✅ ALL FIXES VERIFIED — 0 REMAINING ISSUES' : '❌ ' + allIssues.length + ' ISSUES REMAIN: ' + allIssues.join(', ')}`);
    console.log(`${'='.repeat(50)}`);
    
    await browser.close();
})();

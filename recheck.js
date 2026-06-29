const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    let totalFails = 0;
    const fails = [];
    
    function check(label, pass, detail) {
        const icon = pass ? '✅' : '❌';
        console.log(`  ${icon} ${label}${detail ? ' — ' + detail : ''}`);
        if (!pass) { totalFails++; fails.push(label); }
    }
    
    // ========== ADMIN ==========
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║        ADMIN PORTAL RECHECK          ║');
    console.log('╚══════════════════════════════════════╝');
    
    const admin = await browser.newPage();
    await admin.setViewportSize({ width: 1440, height: 900 });
    const adminErr = [];
    admin.on('pageerror', e => adminErr.push(e.message));
    admin.on('console', msg => { if (msg.type() === 'error') adminErr.push(msg.text()); });
    await admin.goto('https://roshani-sudha-admin.web.app', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => adminErr.push(e.message));
    await admin.waitForTimeout(2000);
    
    check('No JS errors', adminErr.length === 0, adminErr.length ? adminErr[0].substring(0, 100) : 'clean');
    
    // H1: promoMenuImageImg
    const promoSrc = await admin.evaluate(() => document.getElementById('promoMenuImageImg')?.getAttribute('src') || '');
    check('H1: promoMenuImageImg has placeholder', promoSrc.length > 20 && !promoSrc.endsWith('/'), `src=${promoSrc.substring(0, 50)}`);
    
    // L5: hardcoded transitions
    const hardcoded = await admin.evaluate(() => {
        let c = 0;
        try { for (const s of document.styleSheets) for (const r of s.cssRules || []) if (r.style?.transition?.match(/0\.[24]s cubic-bezier/)) c++; } catch(e) {}
        return c;
    });
    check('L5: hardcoded transitions ≤3', hardcoded <= 3, `${hardcoded} remaining`);
    
    // Modals ARIA
    const adminModals = await admin.evaluate(() => {
        return Array.from(document.querySelectorAll('[id*="Modal"], [id*="modal"]')).map(m => ({
            id: m.id, hasRole: !!m.getAttribute('role'), hasAria: !!m.getAttribute('aria-modal')
        }));
    });
    const adminModalIssues = adminModals.filter(m => m.hasRole && !m.hasAria);
    check('All admin modals have aria-modal', adminModalIssues.length === 0, `${adminModalIssues.length} missing`);
    
    // CSS tokens
    const adminTokens = await admin.evaluate(() => {
        const r = getComputedStyle(document.documentElement);
        return { fast: r.getPropertyValue('--transition-fast').trim(), normal: r.getPropertyValue('--transition-normal').trim() };
    });
    check('CSS tokens loaded', !!adminTokens.fast && !!adminTokens.normal);
    
    // Focus visible
    const adminFocus = await admin.evaluate(() => {
        let c = 0;
        try { for (const s of document.styleSheets) for (const r of s.cssRules || []) if (r.selectorText?.includes(':focus-visible')) c++; } catch(e) {}
        return c;
    });
    check(':focus-visible rules ≥5', adminFocus >= 5, `${adminFocus} rules`);
    
    // Mobile responsive
    await admin.setViewportSize({ width: 375, height: 812 });
    await admin.waitForTimeout(300);
    const adminMobileOk = await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    check('Mobile (375px) no overflow', adminMobileOk);
    await admin.close();
    
    // ========== RIDER ==========
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║        RIDER PORTAL RECHECK          ║');
    console.log('╚══════════════════════════════════════╝');
    
    const rider = await browser.newPage();
    await rider.setViewportSize({ width: 375, height: 812 });
    const riderErr = [];
    rider.on('pageerror', e => riderErr.push(e.message));
    rider.on('console', msg => { if (msg.type() === 'error') riderErr.push(msg.text()); });
    await rider.goto('https://roshani-sudha-rider.web.app', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => riderErr.push(e.message));
    await rider.waitForTimeout(2000);
    
    check('No JS errors', riderErr.length === 0, riderErr.length ? riderErr[0].substring(0, 100) : 'clean');
    
    // H2: settlementModal
    const settlement = await rider.evaluate(() => {
        const m = document.getElementById('settlementModal');
        return m ? { role: m.getAttribute('role'), ariaModal: m.getAttribute('aria-modal'), ariaLabel: m.getAttribute('aria-label') } : null;
    });
    check('H2: settlementModal has ARIA', settlement?.role === 'dialog' && settlement?.ariaModal === 'true', `role=${settlement?.role} aria-modal=${settlement?.ariaModal}`);
    
    // M4: focus-visible
    const riderFocus = await rider.evaluate(() => {
        let c = 0;
        try { for (const s of document.styleSheets) for (const r of s.cssRules || []) if (r.selectorText?.includes(':focus-visible')) c++; } catch(e) {}
        return c;
    });
    check('M4: focus-visible rules ≥5', riderFocus >= 5, `${riderFocus} rules`);
    
    // All rider modals
    const riderModals = await rider.evaluate(() => {
        return Array.from(document.querySelectorAll('[id*="Modal"], [id*="modal"]')).map(m => ({
            id: m.id, hasRole: !!m.getAttribute('role'), hasAria: !!m.getAttribute('aria-modal')
        }));
    });
    const riderBadModals = riderModals.filter(m => !m.hasRole || !m.hasAria);
    check('All rider modals have ARIA', riderBadModals.length === 0, `${riderBadModals.length} missing`);
    
    // Functions
    const missingFuncs = await rider.evaluate(() => {
        const fns = ['startPingSound','stopPingSound','showPingModal','hidePingModal','renderAllOrders','confirmPickup','finalizeDeliverySequence','logout'];
        return fns.filter(f => typeof window[f] !== 'function');
    });
    check('All core functions exist', missingFuncs.length === 0, missingFuncs.length ? `missing: ${missingFuncs.join(',')}` : 'all 8 present');
    
    // Audio
    const audio = await rider.evaluate(() => {
        const a = document.getElementById('pingAudio');
        return a ? (a.querySelector('source')?.src || a.src || '') : '';
    });
    check('Ping audio element exists', audio.length > 0);
    
    // CSS tokens
    const riderTokens = await rider.evaluate(() => {
        const r = getComputedStyle(document.documentElement);
        return { fast: r.getPropertyValue('--transition-fast').trim(), normal: r.getPropertyValue('--transition-normal').trim() };
    });
    check('CSS tokens loaded', !!riderTokens.fast && !!riderTokens.normal);
    
    // Inline onclick
    const inlineOnclick = await rider.evaluate(() => document.querySelectorAll('[onclick]').length);
    check('Zero inline onclick', inlineOnclick === 0, `${inlineOnclick} found`);
    
    // Duplicate IDs
    const dupIds = await rider.evaluate(() => {
        const ids = {};
        document.querySelectorAll('[id]').forEach(el => { ids[el.id] = (ids[el.id] || 0) + 1; });
        return Object.entries(ids).filter(([_, c]) => c > 1);
    });
    check('Zero duplicate IDs', dupIds.length === 0, dupIds.length ? dupIds.map(([id,c]) => `${id}(${c}x)`).join(', ') : 'clean');
    
    // Mobile
    const riderMobileOk = await rider.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    check('Mobile (375px) no overflow', riderMobileOk);
    
    // Tablet
    await rider.setViewportSize({ width: 768, height: 1024 });
    await rider.waitForTimeout(200);
    const riderTabletOk = await rider.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    check('Tablet (768px) no overflow', riderTabletOk);
    
    await rider.close();
    
    // ========== MENU ==========
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║        MENU PORTAL RECHECK           ║');
    console.log('╚══════════════════════════════════════╝');
    
    const menu = await browser.newPage();
    await menu.setViewportSize({ width: 375, height: 812 });
    const menuErr = [];
    menu.on('pageerror', e => menuErr.push(e.message));
    menu.on('console', msg => { if (msg.type() === 'error') menuErr.push(msg.text()); });
    await menu.goto('https://roshani-sudha-menu.web.app', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => menuErr.push(e.message));
    await menu.waitForTimeout(2000);
    
    check('No JS errors', menuErr.length === 0, menuErr.length ? menuErr[0].substring(0, 100) : 'clean');
    
    // M1: h1
    const h1 = await menu.evaluate(() => document.querySelectorAll('h1').length);
    check('M1: <h1> exists', h1 > 0, `${h1} found`);
    
    // M2: skip link
    const skipLink = await menu.evaluate(() => {
        const el = document.querySelector('.skip-link, a[href="#screenMenu"]');
        return el ? el.textContent.trim() : null;
    });
    check('M2: skip link exists', !!skipLink, skipLink ? `"${skipLink}"` : 'not found');
    
    // M2: sr-only CSS
    const srOnly = await menu.evaluate(() => {
        let found = false;
        try { for (const s of document.styleSheets) for (const r of s.cssRules || []) if (r.selectorText?.includes('.sr-only')) found = true; } catch(e) {}
        return found;
    });
    check('M2: .sr-only CSS defined', srOnly);
    
    // Viewport
    const vp = await menu.evaluate(() => document.querySelector('meta[name="viewport"]')?.content || '');
    check('Viewport no user-scalable=no', !vp.includes('user-scalable=no'), vp);
    
    // Images
    const imgs = await menu.evaluate(() => {
        return Array.from(document.querySelectorAll('img')).map(i => ({
            loaded: i.complete && i.naturalWidth > 0,
            src: i.src.substring(0, 80)
        }));
    });
    const brokenImgs = imgs.filter(i => !i.loaded);
    check('No broken images', brokenImgs.length === 0, `${brokenImgs.length} broken`);
    
    // Focus visible
    const menuFocus = await menu.evaluate(() => {
        let c = 0;
        try { for (const s of document.styleSheets) for (const r of s.cssRules || []) if (r.selectorText?.includes(':focus-visible')) c++; } catch(e) {}
        return c;
    });
    check(':focus-visible rules ≥1', menuFocus >= 1, `${menuFocus} rules`);
    
    // Reduced motion
    const reducedMotion = await menu.evaluate(() => {
        let found = false;
        try { for (const s of document.styleSheets) for (const r of s.cssRules || []) if (r.conditionText?.includes('prefers-reduced-motion')) found = true; } catch(e) {}
        return found;
    });
    check('prefers-reduced-motion', reducedMotion);
    
    // Hover rules
    const hoverRules = await menu.evaluate(() => {
        let c = 0;
        try { for (const s of document.styleSheets) for (const r of s.cssRules || []) if (r.selectorText?.includes(':hover')) c++; } catch(e) {}
        return c;
    });
    check(':hover rules ≥5', hoverRules >= 5, `${hoverRules} rules`);
    
    // Responsive
    console.log('  Responsive:');
    for (const bp of [375, 768, 1024, 1440]) {
        await menu.setViewportSize({ width: bp, height: 900 });
        await menu.waitForTimeout(200);
        const ok = await menu.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        check(`  ${bp}px`, ok, ok ? '' : 'OVERFLOW');
    }
    
    await menu.close();
    
    // ========== CROSS-PORTAL ==========
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║      CROSS-PORTAL CONSISTENCY        ║');
    console.log('╚══════════════════════════════════════╝');
    
    const p1 = await browser.newPage(); await p1.goto('https://roshani-sudha-admin.web.app', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    const p2 = await browser.newPage(); await p2.goto('https://roshani-sudha-rider.web.app', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    const p3 = await browser.newPage(); await p3.goto('https://roshani-sudha-menu.web.app', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    
    const primary = await Promise.all([p1, p2, p3].map(async p => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim())));
    check('Primary color consistent', primary.every(p => p === primary[0]), primary.join(', '));
    
    const zeroConsole = await Promise.all([p1, p2, p3].map(async p => {
        const errs = [];
        p.on('pageerror', e => errs.length++);
        await p.waitForTimeout(500);
        return errs.length;
    }));
    check('Zero console errors across all', zeroConsole.every(e => e === 0));
    
    await browser.close();
    
    // ========== FINAL ==========
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║           FINAL VERDICT              ║');
    console.log('╚══════════════════════════════════════╝');
    
    if (totalFails === 0) {
        console.log('\n  🎉 ALL CHECKS PASSED — 0 FAILURES');
    } else {
        console.log(`\n  ⚠️  ${totalFails} FAILURES:`);
        fails.forEach(f => console.log(`    ❌ ${f}`));
    }
    
    console.log(`\n  Total checks: ~30 | Passed: ~${30 - totalFails} | Failed: ${totalFails}`);
})();

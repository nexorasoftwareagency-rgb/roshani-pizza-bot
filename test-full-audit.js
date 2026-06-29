const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_DIR = 'C:/Prasant-Pizza-ERP/test-screenshots/full-audit';
const URLS = {
    menu: 'https://roshani-sudha-menu.web.app',
    admin: 'https://roshani-sudha-admin.web.app',
    rider: 'https://roshani-sudha-rider.web.app',
};

const results = {
    timestamp: new Date().toISOString(),
    apps: {},
    summary: { totalErrors: 0, totalWarnings: 0, totalIssues: 0, pagesScanned: 0, screenshotsTaken: 0 }
};

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function screenshot(page, name) {
    const p = path.join(BASE_DIR, name + '.png');
    await page.screenshot({ path: p, fullPage: false });
    results.summary.screenshotsTaken++;
    return p;
}

async function auditPage(page, appName, pageName, consoleErrors, networkErrors, issues, warnings) {
    results.summary.pagesScanned++;

    // Check broken images
    const images = await page.evaluate(() => {
        const imgs = document.querySelectorAll('img');
        return Array.from(imgs).map(i => ({
            src: i.src.substring(0, 150),
            alt: i.alt || 'NO ALT',
            loaded: i.complete && i.naturalWidth > 0,
        }));
    });
    const brokenImages = images.filter(i => !i.loaded && !i.src.startsWith('data:'));
    if (brokenImages.length > 0) {
        brokenImages.forEach(img => {
            issues.push({ severity: 'HIGH', app: appName, page: pageName, category: 'Broken Image', detail: `${img.src}` });
        });
    }

    // Check images without alt
    const noAltImages = images.filter(i => !i.alt || i.alt === 'NO ALT');
    if (noAltImages.length > 0) {
        warnings.push({ app: appName, page: pageName, category: 'A11y', detail: `${noAltImages.length} images missing alt text` });
    }

    // Check buttons audit
    const buttons = await page.evaluate(() => {
        const btns = document.querySelectorAll('button, [role="button"], input[type="submit"]');
        return Array.from(btns).map(b => ({
            text: (b.textContent || '').trim().substring(0, 60),
            type: b.type,
            disabled: b.disabled,
            ariaLabel: b.getAttribute('aria-label'),
            dataAction: b.getAttribute('data-action'),
            visible: b.offsetParent !== null || b.offsetHeight > 0,
        }));
    });
    const buttonsWithoutLabels = buttons.filter(b => !b.text && !b.ariaLabel && !b.dataAction && b.visible);
    if (buttonsWithoutLabels.length > 0) {
        warnings.push({ app: appName, page: pageName, category: 'A11y', detail: `${buttonsWithoutLabels.length} buttons without accessible labels` });
    }

    // Check tables
    const tables = await page.evaluate(() => {
        const tbls = document.querySelectorAll('table');
        return Array.from(tbls).map(t => ({
            id: t.id || 'no-id',
            rows: t.rows?.length || 0,
            hasHeaders: t.querySelector('th') !== null,
        }));
    });

    // Check forms/inputs
    const inputs = await page.evaluate(() => {
        const els = document.querySelectorAll('input, select, textarea');
        return Array.from(els).map(i => ({
            tag: i.tagName,
            type: i.type,
            id: i.id || '',
            placeholder: (i.placeholder || '').substring(0, 50),
            ariaLabel: i.getAttribute('aria-label'),
            label: i.labels?.length > 0,
        }));
    });
    const unlabeledInputs = inputs.filter(i => !i.ariaLabel && !i.label && !i.placeholder && !i.id);
    if (unlabeledInputs.length > 0) {
        warnings.push({ app: appName, page: pageName, category: 'A11y', detail: `${unlabeledInputs.length} inputs without labels/placeholders/ids` });
    }

    // Check accessibility basics
    const a11y = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        h1: document.querySelectorAll('h1').length,
        ariaLabels: document.querySelectorAll('[aria-label]').length,
        roles: document.querySelectorAll('[role]').length,
        skipLink: !!document.querySelector('.skip-link, a[href="#main"], a[href="#content"]'),
    }));
    if (!a11y.lang) warnings.push({ app: appName, page: pageName, category: 'A11y', detail: 'No lang attribute on <html>' });
    if (a11y.h1 === 0) warnings.push({ app: appName, page: pageName, category: 'A11y', detail: 'No <h1> element found' });

    // Check horizontal overflow
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) {
        issues.push({ severity: 'HIGH', app: appName, page: pageName, category: 'Responsive', detail: 'Horizontal overflow detected' });
    }

    // Check CSS variables
    const cssVars = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        return {
            primary: root.getPropertyValue('--primary')?.trim(),
            bgMain: root.getPropertyValue('--bg-main')?.trim(),
        };
    });

    // Check inline onclick handlers
    const inlineOnclick = await page.evaluate(() => {
        const els = document.querySelectorAll('[onclick]');
        return els.length;
    });
    if (inlineOnclick > 0) {
        warnings.push({ app: appName, page: pageName, category: 'Code Quality', detail: `${inlineOnclick} inline onclick handlers found` });
    }

    // Check forms with onsubmit
    const onsubmitForms = await page.evaluate(() => {
        const forms = document.querySelectorAll('form[onsubmit]');
        return forms.length;
    });
    if (onsubmitForms > 0) {
        warnings.push({ app: appName, page: pageName, category: 'Code Quality', detail: `${onsubmitForms} forms with inline onsubmit handlers` });
    }

    // Check console errors count for this page
    const pageErrors = [...consoleErrors];

    return {
        images: { total: images.length, broken: brokenImages.length, noAlt: noAltImages.length },
        buttons: { total: buttons.length, unlabeled: buttonsWithoutLabels.length },
        tables: tables.length,
        inputs: { total: inputs.length, unlabeled: unlabeledInputs.length },
        a11y,
        overflow,
        cssVars,
        inlineOnclick,
        onsubmitForms,
    };
}

(async () => {
    ensureDir(BASE_DIR);
    const browser = await chromium.launch({ headless: true });

    // =============================================
    // APP 1: MENU (Mobile-first, 375x812)
    // =============================================
    console.log('\n========================================');
    console.log('  TESTING: MENU APP (Customer Ordering)');
    console.log('========================================');

    const menuCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const menuPage = await menuCtx.newPage();
    const menuConsoleErrors = [];
    const menuConsoleWarnings = [];
    const menuNetworkErrors = [];
    const menuIssues = [];
    const menuWarnings = [];

    menuPage.on('pageerror', e => menuConsoleErrors.push(e.message));
    menuPage.on('console', msg => {
        if (msg.type() === 'error') menuConsoleErrors.push(msg.text());
        if (msg.type() === 'warning') menuConsoleWarnings.push(msg.text());
    });
    menuPage.on('requestfailed', req => menuNetworkErrors.push({ url: req.url(), error: req.failure()?.errorText }));

    // Test 1: Menu Home
    console.log('\n--- Menu: Home Page ---');
    try {
        await menuPage.goto(URLS.menu, { waitUntil: 'networkidle', timeout: 30000 });
        await screenshot(menuPage, 'menu/01-home');
        const menuHome = await auditPage(menuPage, 'menu', 'home', menuConsoleErrors, menuNetworkErrors, menuIssues, menuWarnings);
        console.log(`  Images: ${menuHome.images.total} (${menuHome.images.broken} broken), Buttons: ${menuHome.buttons.total}, Tables: ${menuHome.tables}, Inputs: ${menuHome.inputs.total}`);
        console.log(`  Overflow: ${menuHome.overflow}, A11y H1: ${menuHome.a11y.h1}`);

        // Test Welcome screen
        const welcomeVisible = await menuPage.evaluate(() => {
            const el = document.getElementById('screenWelcome');
            return el && !el.classList.contains('hidden');
        });
        console.log(`  Welcome screen visible: ${welcomeVisible}`);

        // Test START ORDERING button
        const startBtn = await menuPage.locator('#btnStartOrdering');
        if (await startBtn.count() > 0) {
            await startBtn.click().catch(() => {});
            await menuPage.waitForTimeout(1000);
            await screenshot(menuPage, 'menu/02-after-start-ordering');
            console.log('  Clicked START ORDERING');
        }

        // Test Menu screen
        const menuScreen = await menuPage.evaluate(() => {
            const el = document.getElementById('screenMenu');
            return el && !el.classList.contains('hidden');
        });
        console.log(`  Menu screen visible: ${menuScreen}`);

        // Test category pills
        const categories = await menuPage.evaluate(() => {
            const pills = document.querySelectorAll('#categoryPillsRow .category-pill, #categoryPillsRow button, #categoryPillsRow [class*="pill"]');
            return pills.length;
        });
        console.log(`  Category pills: ${categories}`);

        // Test search
        const searchInput = await menuPage.locator('#dishSearchInput');
        if (await searchInput.count() > 0) {
            await searchInput.fill('pizza');
            await menuPage.waitForTimeout(500);
            await screenshot(menuPage, 'menu/03-search-results');
            await searchInput.fill('');
            console.log('  Search test: OK');
        }

        // Test cart button
        const cartBtns = await menuPage.locator('#btnOpenCartFromMenu, #btnViewCartBar, [data-bottom-tab="screenCart"]').count();
        console.log(`  Cart-related buttons: ${cartBtns}`);

        // Test bottom nav
        const bottomNav = await menuPage.evaluate(() => {
            const nav = document.getElementById('bottomNav');
            if (!nav) return { exists: false };
            const items = nav.querySelectorAll('.bottom-nav-item');
            return { exists: true, items: items.length };
        });
        console.log(`  Bottom nav: exists=${bottomNav.exists}, items=${bottomNav.items}`);

        // Click through bottom nav tabs
        const navTabs = ['screenMenu', 'screenCart', 'screenTracking', 'screenHistory', 'screenPromotions'];
        for (const tab of navTabs) {
            const btn = menuPage.locator(`[data-bottom-tab="${tab}"]`);
            if (await btn.count() > 0) {
                await btn.click().catch(() => {});
                await menuPage.waitForTimeout(300);
                const tabName = tab.replace('screen', '').toLowerCase();
                await screenshot(menuPage, `menu/04-nav-${tabName}`);
                console.log(`  Navigated to: ${tabName}`);
            }
        }

        // Test Waiter screen
        const waiterBtn = await menuPage.locator('#btnGotoCallWaiter');
        if (await waiterBtn.count() > 0) {
            await waiterBtn.click().catch(() => {});
            await menuPage.waitForTimeout(500);
            await screenshot(menuPage, 'menu/05-waiter-screen');
            console.log('  Waiter screen: OK');

            // Test waiter buttons
            const waiterBtns = await menuPage.locator('.btn-waiter-primary, .btn-waiter-secondary').count();
            console.log(`  Waiter action buttons: ${waiterBtns}`);

            // Go back
            const backBtn = await menuPage.locator('#btnBackFromWaiter');
            if (await backBtn.count() > 0) {
                await backBtn.click().catch(() => {});
                await menuPage.waitForTimeout(300);
            }
        }

        // Test desktop viewport
        await menuPage.setViewportSize({ width: 1440, height: 900 });
        await menuPage.waitForTimeout(500);
        await screenshot(menuPage, 'menu/06-desktop-view');
        const desktopOverflow = await menuPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        console.log(`  Desktop overflow: ${desktopOverflow}`);
        if (desktopOverflow) {
            menuIssues.push({ severity: 'MEDIUM', app: 'menu', page: 'desktop', category: 'Responsive', detail: 'Horizontal overflow on desktop 1440px' });
        }

    } catch (e) {
        console.log(`  ERROR loading menu: ${e.message}`);
        menuIssues.push({ severity: 'CRITICAL', app: 'menu', page: 'home', category: 'Load Error', detail: e.message });
    }

    results.apps.menu = {
        consoleErrors: menuConsoleErrors,
        consoleWarnings: menuConsoleWarnings.length,
        networkErrors: menuNetworkErrors,
        issues: menuIssues,
        warnings: menuWarnings,
    };

    await menuCtx.close();

    // =============================================
    // APP 2: ADMIN (Desktop-first, 1440x900)
    // =============================================
    console.log('\n========================================');
    console.log('  TESTING: ADMIN APP (Dashboard)');
    console.log('========================================');

    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminCtx.newPage();
    const adminConsoleErrors = [];
    const adminConsoleWarnings = [];
    const adminNetworkErrors = [];
    const adminIssues = [];
    const adminWarnings = [];

    adminPage.on('pageerror', e => adminConsoleErrors.push(e.message));
    adminPage.on('console', msg => {
        if (msg.type() === 'error') adminConsoleErrors.push(msg.text());
        if (msg.type() === 'warning') adminConsoleWarnings.push(msg.text());
    });
    adminPage.on('requestfailed', req => adminNetworkErrors.push({ url: req.url(), error: req.failure()?.errorText }));

    // Test 1: Admin Login Page
    console.log('\n--- Admin: Login Page ---');
    try {
        await adminPage.goto(URLS.admin, { waitUntil: 'networkidle', timeout: 30000 });
        await screenshot(adminPage, 'admin/01-login-page');

        const loginForm = await adminPage.evaluate(() => {
            const emailInput = document.querySelector('#loginEmail, input[type="email"]');
            const passInput = document.querySelector('#loginPassword, input[type="password"]');
            const loginBtn = document.querySelector('#loginBtn, button[type="submit"]');
            return {
                emailExists: !!emailInput,
                passExists: !!passInput,
                btnExists: !!loginBtn,
                title: document.title,
            };
        });
        console.log(`  Login form: email=${loginForm.emailExists}, pass=${loginForm.passExists}, btn=${loginForm.btnExists}`);
        console.log(`  Title: ${loginForm.title}`);

        if (!loginForm.emailExists || !loginForm.passExists || !loginForm.btnExists) {
            adminIssues.push({ severity: 'CRITICAL', app: 'admin', page: 'login', category: 'Missing Elements', detail: `Login form incomplete: email=${loginForm.emailExists}, pass=${loginForm.passExists}, btn=${loginForm.btnExists}` });
        }

        // Check CSS loaded
        const cssLoaded = await adminPage.evaluate(() => {
            const root = getComputedStyle(document.documentElement);
            return {
                primary: root.getPropertyValue('--primary')?.trim(),
                fontFamily: root.fontFamily,
                hasStyles: document.styleSheets.length,
            };
        });
        console.log(`  CSS: ${cssLoaded.hasStyles} stylesheets, primary=${cssLoaded.primary}, font=${cssLoaded.fontFamily.substring(0, 40)}`);

        // Check lucide icons loaded
        const iconsLoaded = await adminPage.evaluate(() => {
            const svgIcons = document.querySelectorAll('svg.lucide, [data-lucide]');
            return svgIcons.length;
        });
        console.log(`  Lucide icons: ${iconsLoaded}`);

        // Check version banner
        const versionBanner = await adminPage.evaluate(() => {
            const banner = document.getElementById('versionBanner');
            return banner ? { exists: true, hidden: banner.classList.contains('hidden') } : { exists: false };
        });
        console.log(`  Version banner: exists=${versionBanner.exists}, hidden=${versionBanner.hidden}`);

        // Check loader
        const loader = await adminPage.evaluate(() => {
            const el = document.getElementById('initial-loader');
            return el ? { exists: true, display: getComputedStyle(el).display } : { exists: false };
        });
        console.log(`  Initial loader: exists=${loader.exists}`);

        // Check connection banner
        const connBanner = await adminPage.evaluate(() => {
            const el = document.getElementById('connectionBanner');
            return el ? { exists: true, hidden: el.classList.contains('hidden') } : { exists: false };
        });
        console.log(`  Connection banner: exists=${connBanner.exists}, hidden=${connBanner.hidden}`);

    } catch (e) {
        console.log(`  ERROR loading admin: ${e.message}`);
        adminIssues.push({ severity: 'CRITICAL', app: 'admin', page: 'login', category: 'Load Error', detail: e.message });
    }

    // Test 2: Check all sidebar nav items
    console.log('\n--- Admin: Navigation Audit ---');
    try {
        const navItems = await adminPage.evaluate(() => {
            const btns = document.querySelectorAll('[data-action="switchTab"]');
            return Array.from(btns).map(b => ({
                text: (b.textContent || '').trim(),
                tab: b.getAttribute('data-tab'),
                visible: b.offsetParent !== null,
                id: b.closest('li')?.id || 'no-id',
            }));
        });
        console.log(`  Nav items found: ${navItems.length}`);
        navItems.forEach(n => console.log(`    [${n.visible ? 'VISIBLE' : 'hidden '}] ${n.text} -> tab:${n.tab} (${n.id})`));

        // Click through each admin tab (without login, tabs are hidden but we can check DOM)
        const tabs = ['dashboard', 'orders', 'live', 'walkin', 'tables', 'menu', 'categories', 'inventory',
                       'riders', 'customers', 'promotions', 'discounts', 'lostSales', 'reports',
                       'riderAnalytics', 'feedback', 'liveTracker', 'notifications', 'payments', 'settings'];

        for (const tab of tabs) {
            const tabContent = await adminPage.evaluate((tabId) => {
                const el = document.getElementById(`tab-${tabId}`);
                if (!el) return { exists: false };
                const btns = el.querySelectorAll('button');
                const inputs = el.querySelectorAll('input, select, textarea');
                const tables = el.querySelectorAll('table');
                return {
                    exists: true,
                    hidden: el.classList.contains('hidden'),
                    buttons: btns.length,
                    inputs: inputs.length,
                    tables: tables.length,
                };
            }, tab);
            const status = tabContent.exists ? `${tabContent.buttons}btn/${tabContent.inputs}inp/${tabContent.tables}tbl` : 'MISSING';
            console.log(`  Tab [${tab}]: ${status}`);
            if (!tabContent.exists) {
                adminIssues.push({ severity: 'HIGH', app: 'admin', page: tab, category: 'Missing Tab', detail: `Tab content #tab-${tab} not found in DOM` });
            }
        }
    } catch (e) {
        console.log(`  ERROR: ${e.message}`);
    }

    // Test 3: Check modals
    console.log('\n--- Admin: Modal Inventory ---');
    try {
        const modals = await adminPage.evaluate(() => {
            const modalEls = document.querySelectorAll('[id*="Modal"], [id*="modal"], .modal, .modal-overlay, [role="dialog"]');
            return Array.from(modalEls).map(m => ({
                id: m.id || 'no-id',
                hidden: m.classList.contains('hidden') || getComputedStyle(m).display === 'none',
                role: m.getAttribute('role'),
                ariaModal: m.getAttribute('aria-modal'),
                ariaLabel: m.getAttribute('aria-label'),
            }));
        });
        console.log(`  Modals found: ${modals.length}`);
        modals.forEach(m => {
            console.log(`    ${m.id}: hidden=${m.hidden} role=${m.role} aria-modal=${m.ariaModal}`);
            if (!m.ariaModal && !m.hidden) adminWarnings.push({ app: 'admin', page: 'modals', category: 'A11y', detail: `Modal #${m.id} missing aria-modal="true"` });
            if (!m.ariaLabel && !m.hidden) adminWarnings.push({ app: 'admin', page: 'modals', category: 'A11y', detail: `Modal #${m.id} missing aria-label` });
        });
    } catch (e) {
        console.log(`  ERROR: ${e.message}`);
    }

    // Test 4: Admin page audit
    console.log('\n--- Admin: Page Audit ---');
    try {
        const adminAudit = await auditPage(adminPage, 'admin', 'login', adminConsoleErrors, adminNetworkErrors, adminIssues, adminWarnings);
        console.log(`  Images: ${adminAudit.images.total} (${adminAudit.images.broken} broken), Buttons: ${adminAudit.buttons.total}, Tables: ${adminAudit.tables}`);
        console.log(`  Inputs: ${adminAudit.inputs.total} (${adminAudit.inputs.unlabeled} unlabeled), A11y H1: ${adminAudit.a11y.h1}`);
        console.log(`  Overflow: ${adminAudit.overflow}, Inline onclick: ${adminAudit.inlineOnclick}`);
    } catch (e) {
        console.log(`  ERROR: ${e.message}`);
    }

    // Test 5: Mobile responsive
    console.log('\n--- Admin: Mobile Responsive ---');
    try {
        await adminPage.setViewportSize({ width: 375, height: 812 });
        await adminPage.waitForTimeout(500);
        await screenshot(adminPage, 'admin/02-mobile-view');
        const mobileOverflow = await adminPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        console.log(`  Mobile overflow: ${mobileOverflow}`);
        if (mobileOverflow) {
            adminIssues.push({ severity: 'HIGH', app: 'admin', page: 'mobile', category: 'Responsive', detail: 'Horizontal overflow on mobile 375px' });
        }

        // Check mobile hamburger
        const hamburger = await adminPage.evaluate(() => {
            const el = document.getElementById('mobileHamburger');
            return el ? { exists: true, visible: el.offsetParent !== null } : { exists: false };
        });
        console.log(`  Mobile hamburger: ${hamburger.exists}, visible=${hamburger.visible}`);

        // Check mobile header
        const mobileHeader = await adminPage.evaluate(() => {
            const el = document.getElementById('mobileAppHeader');
            return el ? { exists: true, visible: el.offsetParent !== null } : { exists: false };
        });
        console.log(`  Mobile header: ${mobileHeader.exists}, visible=${mobileHeader.visible}`);

        // Test hamburger toggle
        if (hamburger.exists) {
            const hamBtn = adminPage.locator('#mobileHamburger');
            if (await hamBtn.count() > 0 && hamburger.visible) {
                await hamBtn.click().catch(() => {});
                await adminPage.waitForTimeout(500);
                await screenshot(adminPage, 'admin/03-mobile-sidebar-open');
                const sidebarOpen = await adminPage.evaluate(() => {
                    const sidebar = document.getElementById('sidebarNav');
                    return sidebar ? getComputedStyle(sidebar).transform !== 'none' || sidebar.classList.contains('open') : false;
                });
                console.log(`  Sidebar opened: ${sidebarOpen}`);
            }
        }
    } catch (e) {
        console.log(`  ERROR: ${e.message}`);
    }

    results.apps.admin = {
        consoleErrors: adminConsoleErrors,
        consoleWarnings: adminConsoleWarnings.length,
        networkErrors: adminNetworkErrors,
        issues: adminIssues,
        warnings: adminWarnings,
    };

    await adminCtx.close();

    // =============================================
    // APP 3: RIDER (Mobile-first, 375x812)
    // =============================================
    console.log('\n========================================');
    console.log('  TESTING: RIDER APP');
    console.log('========================================');

    const riderCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const riderPage = await riderCtx.newPage();
    const riderConsoleErrors = [];
    const riderConsoleWarnings = [];
    const riderNetworkErrors = [];
    const riderIssues = [];
    const riderWarnings = [];

    riderPage.on('pageerror', e => riderConsoleErrors.push(e.message));
    riderPage.on('console', msg => {
        if (msg.type() === 'error') riderConsoleErrors.push(msg.text());
        if (msg.type() === 'warning') riderConsoleWarnings.push(msg.text());
    });
    riderPage.on('requestfailed', req => riderNetworkErrors.push({ url: req.url(), error: req.failure()?.errorText }));

    // Test 1: Rider Login Page
    console.log('\n--- Rider: Login Page ---');
    try {
        await riderPage.goto(URLS.rider, { waitUntil: 'networkidle', timeout: 30000 });
        await screenshot(riderPage, 'rider/01-login-page');

        const riderLogin = await riderPage.evaluate(() => {
            const emailInput = document.querySelector('#email');
            const passInput = document.querySelector('#password');
            const loginBtn = document.querySelector('#loginBtn');
            const authSection = document.getElementById('auth-section');
            const dashboard = document.getElementById('dashboard');
            return {
                emailExists: !!emailInput,
                passExists: !!passInput,
                btnExists: !!loginBtn,
                authVisible: authSection ? !authSection.classList.contains('hidden') : false,
                dashboardHidden: dashboard ? dashboard.classList.contains('hidden') : true,
                title: document.title,
            };
        });
        console.log(`  Login form: email=${riderLogin.emailExists}, pass=${riderLogin.passExists}, btn=${riderLogin.btnExists}`);
        console.log(`  Auth visible: ${riderLogin.authVisible}, Dashboard hidden: ${riderLogin.dashboardHidden}`);
        console.log(`  Title: ${riderLogin.title}`);

        // Check rider page audit
        const riderAudit = await auditPage(riderPage, 'rider', 'login', riderConsoleErrors, riderNetworkErrors, riderIssues, riderWarnings);
        console.log(`  Images: ${riderAudit.images.total} (${riderAudit.images.broken} broken), Buttons: ${riderAudit.buttons.total}`);
        console.log(`  Inputs: ${riderAudit.inputs.total}, A11y H1: ${riderAudit.a11y.h1}`);

        // Check dashboard sections exist in DOM
        const sections = await riderPage.evaluate(() => {
            const secs = ['sec-home', 'sec-available', 'sec-active', 'sec-completed', 'sec-earnings', 'sec-profile'];
            return secs.map(id => {
                const el = document.getElementById(id);
                return { id, exists: !!el, hidden: el ? el.classList.contains('hidden') || !el.classList.contains('active') : null };
            });
        });
        console.log(`  Dashboard sections: ${sections.length}`);
        sections.forEach(s => console.log(`    ${s.id}: exists=${s.exists}`));

        // Check bottom nav
        const riderBottomNav = await riderPage.evaluate(() => {
            const nav = document.querySelector('.bottom-nav');
            if (!nav) return { exists: false };
            const items = nav.querySelectorAll('.nav-item');
            return { exists: true, items: items.length };
        });
        console.log(`  Bottom nav: exists=${riderBottomNav.exists}, items=${riderBottomNav.items}`);

        // Check OTP panel
        const otpPanel = await riderPage.evaluate(() => {
            const el = document.getElementById('otpPanel');
            return el ? { exists: true, hidden: el.classList.contains('hidden') || getComputedStyle(el).display === 'none' } : { exists: false };
        });
        console.log(`  OTP panel: exists=${otpPanel.exists}`);

        // Check payment panel
        const paymentPanel = await riderPage.evaluate(() => {
            const el = document.getElementById('paymentPanel');
            return el ? { exists: true } : { exists: false };
        });
        console.log(`  Payment panel: exists=${paymentPanel.exists}`);

        // Check new order ping modal
        const pingModal = await riderPage.evaluate(() => {
            const el = document.getElementById('newOrderPingModal');
            return el ? { exists: true, hidden: el.classList.contains('hidden') } : { exists: false };
        });
        console.log(`  Ping modal: exists=${pingModal.exists}`);

        // Check notification sheet
        const notifSheet = await riderPage.evaluate(() => {
            const el = document.getElementById('notificationSheet');
            return el ? { exists: true } : { exists: false };
        });
        console.log(`  Notification sheet: exists=${notifSheet.exists}`);

        // Check settlement modal
        const settlementModal = await riderPage.evaluate(() => {
            const el = document.getElementById('settlementModal');
            return el ? { exists: true } : { exists: false };
        });
        console.log(`  Settlement modal: exists=${settlementModal.exists}`);

        // Check success overlay
        const successOverlay = await riderPage.evaluate(() => {
            const el = document.getElementById('successOverlay');
            return el ? { exists: true } : { exists: false };
        });
        console.log(`  Success overlay: exists=${successOverlay.exists}`);

        // Check audio element
        const audioEl = await riderPage.evaluate(() => {
            const el = document.getElementById('pingAudio');
            return el ? { exists: true, src: el.src } : { exists: false };
        });
        console.log(`  Ping audio: exists=${audioEl.exists}`);

    } catch (e) {
        console.log(`  ERROR loading rider: ${e.message}`);
        riderIssues.push({ severity: 'CRITICAL', app: 'rider', page: 'login', category: 'Load Error', detail: e.message });
    }

    // Test 2: Rider mobile responsive
    console.log('\n--- Rider: Mobile Responsive ---');
    try {
        await riderPage.setViewportSize({ width: 375, height: 812 });
        await riderPage.waitForTimeout(500);
        const mobileOverflow = await riderPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        console.log(`  Mobile overflow: ${mobileOverflow}`);
        if (mobileOverflow) {
            riderIssues.push({ severity: 'HIGH', app: 'rider', page: 'mobile', category: 'Responsive', detail: 'Horizontal overflow on mobile 375px' });
        }

        // Desktop viewport
        await riderPage.setViewportSize({ width: 1440, height: 900 });
        await riderPage.waitForTimeout(500);
        await screenshot(riderPage, 'rider/02-desktop-view');
        const desktopOverflow = await riderPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        console.log(`  Desktop overflow: ${desktopOverflow}`);
        if (desktopOverflow) {
            riderIssues.push({ severity: 'MEDIUM', app: 'rider', page: 'desktop', category: 'Responsive', detail: 'Horizontal overflow on desktop 1440px' });
        }
    } catch (e) {
        console.log(`  ERROR: ${e.message}`);
    }

    results.apps.rider = {
        consoleErrors: riderConsoleErrors,
        consoleWarnings: riderConsoleWarnings.length,
        networkErrors: riderNetworkErrors,
        issues: riderIssues,
        warnings: riderWarnings,
    };

    await riderCtx.close();

    // =============================================
    // APP 4: RIDER LOGIN (Separate page)
    // =============================================
    console.log('\n========================================');
    console.log('  TESTING: RIDER LOGIN (Separate Page)');
    console.log('========================================');

    const loginCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const loginPage = await loginCtx.newPage();
    const loginConsoleErrors = [];
    const loginConsoleWarnings = [];
    const loginNetworkErrors = [];
    const loginIssues = [];
    const loginWarnings = [];

    loginPage.on('pageerror', e => loginConsoleErrors.push(e.message));
    loginPage.on('console', msg => {
        if (msg.type() === 'error') loginConsoleErrors.push(msg.text());
        if (msg.type() === 'warning') loginConsoleWarnings.push(msg.text());
    });
    loginPage.on('requestfailed', req => loginNetworkErrors.push({ url: req.url(), error: req.failure()?.errorText }));

    try {
        console.log('\n--- Rider Login: Page ---');
        await loginPage.goto(URLS.rider + '/login.html', { waitUntil: 'networkidle', timeout: 30000 });
        await screenshot(loginPage, 'rider-login/01-login-page');

        const loginPageAudit = await loginPage.evaluate(() => {
            const emailInput = document.querySelector('#email');
            const passInput = document.querySelector('#password');
            const loginBtn = document.querySelector('#loginBtn');
            const errorEl = document.querySelector('#loginError');
            return {
                emailExists: !!emailInput,
                passExists: !!passInput,
                btnExists: !!loginBtn,
                errorExists: !!errorEl,
                title: document.title,
                hasCSS: document.styleSheets.length,
            };
        });
        console.log(`  Login form: email=${loginPageAudit.emailExists}, pass=${loginPageAudit.passExists}, btn=${loginPageAudit.btnExists}`);
        console.log(`  Error element: ${loginPageAudit.errorExists}, Title: ${loginPageAudit.title}`);
        console.log(`  Stylesheets: ${loginPageAudit.hasCSS}`);

        // Test submitting empty form
        const loginBtn = loginPage.locator('#loginBtn');
        if (await loginBtn.count() > 0) {
            await loginBtn.click().catch(() => {});
            await loginPage.waitForTimeout(500);
            await screenshot(loginPage, 'rider-login/02-empty-submit');
            const errorVisible = await loginPage.evaluate(() => {
                const el = document.getElementById('loginError');
                return el ? !el.classList.contains('hidden') && el.textContent.trim() !== '' : false;
            });
            console.log(`  Error shown on empty submit: ${errorVisible}`);
        }

        // Check accessibility
        const loginA11y = await auditPage(loginPage, 'rider-login', 'login', loginConsoleErrors, loginNetworkErrors, loginIssues, loginWarnings);
        console.log(`  Images: ${loginA11y.images.total}, Buttons: ${loginA11y.buttons.total}, Inputs: ${loginA11y.inputs.total}`);

        // Mobile responsive
        await loginPage.setViewportSize({ width: 375, height: 812 });
        await loginPage.waitForTimeout(300);
        const mobileOverflow = await loginPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        console.log(`  Mobile overflow: ${mobileOverflow}`);
        if (mobileOverflow) {
            loginIssues.push({ severity: 'HIGH', app: 'rider-login', page: 'login', category: 'Responsive', detail: 'Horizontal overflow on mobile 375px' });
        }

    } catch (e) {
        console.log(`  ERROR loading rider login: ${e.message}`);
        loginIssues.push({ severity: 'CRITICAL', app: 'rider-login', page: 'login', category: 'Load Error', detail: e.message });
    }

    results.apps.riderLogin = {
        consoleErrors: loginConsoleErrors,
        consoleWarnings: loginConsoleWarnings.length,
        networkErrors: loginNetworkErrors,
        issues: loginIssues,
        warnings: loginWarnings,
    };

    await loginCtx.close();

    // =============================================
    // GENERATE FINAL REPORT
    // =============================================
    console.log('\n========================================');
    console.log('  FINAL SUMMARY');
    console.log('========================================');

    let totalErrors = 0, totalWarnings = 0, totalIssues = 0;
    for (const [app, data] of Object.entries(results.apps)) {
        const errs = data.consoleErrors.length;
        const warns = data.warnings.length;
        const issues = data.issues.length;
        totalErrors += errs;
        totalWarnings += warns;
        totalIssues += issues;
        console.log(`\n  ${app.toUpperCase()}:`);
        console.log(`    Console Errors: ${errs}`);
        console.log(`    Console Warnings: ${data.consoleWarnings}`);
        console.log(`    Network Errors: ${data.networkErrors.length}`);
        console.log(`    Issues: ${issues}`);
        console.log(`    Warnings: ${warns}`);

        if (errs > 0) {
            data.consoleErrors.slice(0, 5).forEach(e => console.log(`      ERR: ${e.substring(0, 150)}`));
        }
        data.issues.forEach(i => console.log(`      [${i.severity}] ${i.category}: ${i.detail.substring(0, 150)}`));
        data.warnings.forEach(w => console.log(`      [WARN] ${w.category}: ${w.detail.substring(0, 150)}`));
    }

    results.summary.totalErrors = totalErrors;
    results.summary.totalWarnings = totalWarnings;
    results.summary.totalIssues = totalIssues;

    console.log(`\n  TOTALS:`);
    console.log(`    Pages Scanned: ${results.summary.pagesScanned}`);
    console.log(`    Screenshots Taken: ${results.summary.screenshotsTaken}`);
    console.log(`    Console Errors: ${totalErrors}`);
    console.log(`    Issues Found: ${totalIssues}`);
    console.log(`    Warnings: ${totalWarnings}`);

    // Write JSON report
    fs.writeFileSync(path.join(BASE_DIR, 'report.json'), JSON.stringify(results, null, 2));
    console.log(`\n  Report saved to: ${BASE_DIR}/report.json`);

    await browser.close();
})();

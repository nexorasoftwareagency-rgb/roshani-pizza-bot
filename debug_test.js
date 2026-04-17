// Debug Test Script — validates Admin & Rider code integrity
const fs = require('fs');
const path = require('path');

let errors = 0;
let warnings = 0;

function check(label, condition, msg) {
    if (condition) {
        console.log(`  ✅ ${label}`);
    } else {
        console.log(`  ❌ ${label}: ${msg}`);
        errors++;
    }
}

function warn(label, condition, msg) {
    if (condition) {
        console.log(`  ✅ ${label}`);
    } else {
        console.log(`  ⚠️  ${label}: ${msg}`);
        warnings++;
    }
}

// ============================
// ADMIN PANEL TESTS
// ============================
console.log("\n🔷 ADMIN PANEL (Admin/app.js + Admin/index.html)");
console.log("=".repeat(50));

const adminJS = fs.readFileSync(path.join(__dirname, 'Admin', 'app.js'), 'utf-8');
const adminHTML = fs.readFileSync(path.join(__dirname, 'Admin', 'index.html'), 'utf-8');

// Bug 1: Duplicate loadReports removed
const loadReportsMatches = adminJS.match(/function loadReports\(\)/g);
check("No duplicate loadReports()", loadReportsMatches && loadReportsMatches.length === 1, 
    `Found ${loadReportsMatches ? loadReportsMatches.length : 0} declarations`);

// Bug 2: categories declared
check("'categories' properly declared with let/const/var", 
    /\b(let|const|var)\s+categories\s*=/.test(adminJS),
    "categories is used as implicit global");

// Bug 3: isEditRiderMode declared
check("'isEditRiderMode' properly declared", 
    /\b(let|const|var)\s+isEditRiderMode\s*=/.test(adminJS),
    "isEditRiderMode is used as implicit global");

// Bug 3: currentEditingRiderId declared
check("'currentEditingRiderId' properly declared", 
    /\b(let|const|var)\s+currentEditingRiderId\s*=/.test(adminJS),
    "currentEditingRiderId is used as implicit global");

// Bug 7: logoutBtn has onclick
check("Logout button has onclick handler", 
    adminHTML.includes('id="logoutBtn" onclick="userLogout()"'),
    "logoutBtn missing onclick attribute");

// Bug 6: Customer table header matches JS (5 columns)
const customerHeaders = adminHTML.match(/<th>.*?<\/th>/g);
const customerTableSection = adminHTML.substring(
    adminHTML.indexOf('id="customersTable"') - 500,
    adminHTML.indexOf('id="customersTable"')
);
const thCount = (customerTableSection.match(/<th>/g) || []).length;
check("Customer table has 5 column headers", thCount === 5,
    `Found ${thCount} headers, expected 5`);

// Bug 8: Dashboard rider list targets correct element
check("Rider list targets 'riderStatusList' (not 'activeRidersDashboard')", 
    adminJS.includes('getElementById("riderStatusList")') && !adminJS.includes('getElementById("activeRidersDashboard")'),
    "Still targeting wrong element ID");

// Bug 9: statRidersActive KPI updated
check("'statRidersActive' KPI gets updated in renderRiders()", 
    adminJS.includes('getElementById("statRidersActive")'),
    "Riders Online KPI is never updated");

// RBAC: No hardcoded email bypass
check("No hardcoded email RBAC bypass", 
    !adminJS.includes('roshanipizza@gmail.com'),
    "Hardcoded email bypass still present");

// Rider URL casing
check("Rider portal URL uses lowercase '/rider/'", 
    adminJS.includes('/rider/index.html') && !adminJS.includes('/Rider/index.html'),
    "Rider URL still uses uppercase");

// XSS: escapeHtml exists
check("escapeHtml() function defined", 
    adminJS.includes('function escapeHtml'),
    "No XSS sanitization function");

// Element ID cross-check: HTML IDs used in JS exist in HTML
const jsIdRefs = adminJS.match(/getElementById\("([^"]+)"\)/g) || [];
const htmlIds = adminHTML.match(/id="([^"]+)"/g) || [];
const htmlIdSet = new Set(htmlIds.map(m => m.match(/id="([^"]+)"/)[1]));
const missingIds = [];
for (const ref of jsIdRefs) {
    const id = ref.match(/getElementById\("([^"]+)"\)/)[1];
    // Skip dynamic IDs (contain template literals or variables)
    if (id.includes('${') || id.includes('+')) continue;
    if (!htmlIdSet.has(id)) {
        missingIds.push(id);
    }
}
// Filter out known dynamic/generated IDs
// These IDs are dynamically injected via innerHTML (Settings tab, dashboard)
const dynamicIds = new Set([
    'setConfigName','setConfigFee','setConfigMinOrder','setConfigAddress',
    'setConfigPhone','setConfigStatus','setConfigMasterOTP',
    'setUIWelcome','setUIMenu','welcomeFile','menuFile',
    'topItemsDashboard','dishModal','riderModal','settingsContainer','reportsContainer'
]);
const truelyMissing = missingIds.filter(id => 
    !dynamicIds.has(id) && !id.startsWith('cat-') && !id.startsWith('order-')
);
warn("All JS-referenced element IDs exist in HTML (excluding dynamic)", 
    truelyMissing.length === 0,
    `Missing IDs: ${truelyMissing.join(', ')}`);


// ============================
// RIDER PANEL TESTS
// ============================
console.log("\n🔷 RIDER PANEL (rider/app.js + rider/index.html)");
console.log("=".repeat(50));

const riderJS = fs.readFileSync(path.join(__dirname, 'rider', 'app.js'), 'utf-8');
const riderHTML = fs.readFileSync(path.join(__dirname, 'rider', 'index.html'), 'utf-8');
const riderFirebase = fs.readFileSync(path.join(__dirname, 'rider', 'firebase.js'), 'utf-8');

// OTP fix
check("OTP reads deliveryOTP with fallback", 
    riderJS.includes('order.deliveryOTP || order.otp') || riderJS.includes('order.deliveryOTP||order.otp'),
    "OTP field mismatch — rider reads wrong field");

// Rider stats update
check("Rider stats updated after delivery (riderStats transaction)", 
    riderJS.includes('riderStats/') && riderJS.includes('transaction'),
    "riderStats never updated after delivery");

// XSS: escapeHtml exists  
check("escapeHtml() function defined", 
    riderJS.includes('function escapeHtml'),
    "No XSS sanitization function");

// Firebase transaction for order acceptance
check("Order acceptance uses Firebase transaction", 
    riderJS.includes('.transaction('),
    "Race condition risk — no transaction on order acceptance");

// RBAC: Rider must exist in riders/ collection
check("RBAC: Rider verified against riders/ collection", 
    riderJS.includes('riders/') && (riderJS.includes('signOut') || riderJS.includes('sign_out')),
    "No RBAC check for rider identity");

// Firebase config matches between rider and admin
const riderProjectId = riderFirebase.match(/projectId:\s*"([^"]+)"/);
const adminProjectId = adminHTML.match(/projectId:\s*"([^"]+)"/);
check("Firebase projectId consistent between Admin and Rider", 
    riderProjectId && adminProjectId && riderProjectId[1] === adminProjectId[1],
    `Admin: ${adminProjectId?.[1]}, Rider: ${riderProjectId?.[1]}`);

// Rider HTML element IDs check
const riderJsIdRefs = riderJS.match(/getElementById\(['"]([^'"]+)['"]\)/g) || [];
const riderHtmlIds = riderHTML.match(/id="([^"]+)"/g) || [];
const riderHtmlIdSet = new Set(riderHtmlIds.map(m => m.match(/id="([^"]+)"/)[1]));
const riderMissingIds = [];
for (const ref of riderJsIdRefs) {
    const id = ref.match(/getElementById\(['"]([^'"]+)['"]\)/)[1];
    if (!riderHtmlIdSet.has(id)) {
        riderMissingIds.push(id);
    }
}
warn("All Rider JS-referenced element IDs exist in HTML", 
    riderMissingIds.length === 0,
    `Missing IDs: ${riderMissingIds.join(', ')}`);


// ============================
// BOT TESTS
// ============================
console.log("\n🔷 BOT (bot/index.js)");
console.log("=".repeat(50));

const botJS = fs.readFileSync(path.join(__dirname, 'bot', 'index.js'), 'utf-8');

// Reconnection fix — bot now has: if (code === 515) return; ... setTimeout(startBot)
check("Bot reconnects on non-401 disconnects", 
    botJS.includes('code === 515') && botJS.includes('setTimeout(() => startBot()'),
    "Bot only reconnects on 401");

// Firebase config exists
check("Bot has Firebase config", 
    botJS.includes('firebase') || botJS.includes('database'),
    "No Firebase integration");


// ============================
// SUMMARY
// ============================
console.log("\n" + "=".repeat(50));
console.log(`\n📊 RESULTS: ${errors} errors, ${warnings} warnings`);
if (errors === 0) {
    console.log("🎉 ALL CRITICAL CHECKS PASSED!");
} else {
    console.log("🚨 SOME CHECKS FAILED — see above");
}
console.log("");

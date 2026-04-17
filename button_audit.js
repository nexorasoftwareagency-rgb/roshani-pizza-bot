// Button Audit — checks every button/onclick in HTML has a matching function in JS
const fs = require('fs');
const path = require('path');

let errors = 0;
let passes = 0;

function check(label, condition, msg) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passes++;
    } else {
        console.log(`  ❌ ${label}: ${msg}`);
        errors++;
    }
}

// ============================
// Extract all onclick handlers from HTML
// ============================
function extractOnclicks(html) {
    const results = [];
    const regex = /onclick="([^"]+)"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        let handler = match[1];
        // Extract function name (before the parenthesis)
        const fnMatch = handler.match(/^([a-zA-Z_$][\w$]*)\s*\(/);
        if (fnMatch) {
            results.push({
                handler: handler,
                fnName: fnMatch[1],
                full: match[0]
            });
        }
    }
    return results;
}

// Check if function is defined in JS (as function declaration, arrow, or window.xxx)
function fnExists(js, fnName) {
    // function fnName(
    if (new RegExp(`function\\s+${fnName}\\s*\\(`).test(js)) return true;
    // window.fnName =
    if (new RegExp(`window\\.${fnName}\\s*=`).test(js)) return true;
    // const/let/var fnName =
    if (new RegExp(`(const|let|var)\\s+${fnName}\\s*=`).test(js)) return true;
    // It might be a DOM method like document.getElementById().click() — skip
    if (fnName === 'document') return true;
    return false;
}

// ============================
// ADMIN PANEL
// ============================
console.log("\n🔷 ADMIN PANEL — Button/onclick Audit");
console.log("=".repeat(55));

const adminHTML = fs.readFileSync(path.join(__dirname, 'Admin', 'index.html'), 'utf-8');
const adminJS = fs.readFileSync(path.join(__dirname, 'Admin', 'app.js'), 'utf-8');

const adminOnclicks = extractOnclicks(adminHTML);
const adminFunctions = new Set();

// Collect all unique function names
adminOnclicks.forEach(o => adminFunctions.add(o.fnName));

console.log(`\n  Found ${adminOnclicks.length} onclick handlers calling ${adminFunctions.size} unique functions:\n`);

for (const fnName of [...adminFunctions].sort()) {
    // Some are inline like document.getElementById('catFile').click() — skip  
    if (fnName === 'document') continue;
    
    const exists = fnExists(adminJS, fnName);
    // Also check if it's defined inline in the HTML <script> block
    const inlineExists = fnExists(adminHTML, fnName);
    
    check(`${fnName}()`, exists || inlineExists, `Function '${fnName}' not found in app.js or inline scripts`);
}

// Also check buttons WITHOUT onclick that might need one
const noOnclickBtns = adminHTML.match(/<button[^>]*(?!onclick)[^>]*>.*?<\/button>/gs) || [];
const btnsMissingHandler = [];
for (const btn of noOnclickBtns) {
    // Skip if it has onclick
    if (/onclick=/.test(btn)) continue;
    // Skip if it has an ID (might be handled via addEventListener)
    const idMatch = btn.match(/id="([^"]+)"/);
    if (idMatch) {
        // Check if addEventListener is used for this ID
        const id = idMatch[1];
        if (adminJS.includes(`getElementById("${id}")`)) continue;
        if (adminJS.includes(`getElementById('${id}')`)) continue;
        btnsMissingHandler.push(`#${id}: ${btn.substring(0, 80).replace(/\n/g, ' ')}`);
    }
}

if (btnsMissingHandler.length > 0) {
    console.log(`\n  ⚠️  Buttons with ID but no onclick AND no addEventListener:`);
    btnsMissingHandler.forEach(b => console.log(`     - ${b}`));
}

// ============================
// Check dynamically generated buttons in JS
// ============================
console.log("\n\n🔷 ADMIN PANEL — Dynamic Buttons (generated in JS)");
console.log("=".repeat(55));

// Find onclick= in JS template strings
const jsOnclickRegex = /onclick=(?:\\"|'|")([^"'\\]+)(?:\\"|'|")/g;
const dynamicOnclicks = new Set();
let jsMatch;
while ((jsMatch = jsOnclickRegex.exec(adminJS)) !== null) {
    const handler = jsMatch[1];
    const fnMatch = handler.match(/^([a-zA-Z_$][\w$]*)\s*\(/);
    if (fnMatch) dynamicOnclicks.add(fnMatch[1]);
}

console.log(`\n  Found ${dynamicOnclicks.size} unique functions called from dynamic buttons:\n`);

for (const fnName of [...dynamicOnclicks].sort()) {
    if (fnName === 'document') continue;
    check(`${fnName}()`, fnExists(adminJS, fnName), `Function '${fnName}' not found`);
}


// ============================
// RIDER PANEL
// ============================
console.log("\n\n🔷 RIDER PANEL — Button/onclick Audit");
console.log("=".repeat(55));

const riderHTML = fs.readFileSync(path.join(__dirname, 'rider', 'index.html'), 'utf-8');
const riderJS = fs.readFileSync(path.join(__dirname, 'rider', 'app.js'), 'utf-8');

const riderOnclicks = extractOnclicks(riderHTML);
const riderFunctions = new Set();

riderOnclicks.forEach(o => riderFunctions.add(o.fnName));

console.log(`\n  Found ${riderOnclicks.length} onclick handlers calling ${riderFunctions.size} unique functions:\n`);

for (const fnName of [...riderFunctions].sort()) {
    if (fnName === 'document') continue;
    
    const exists = fnExists(riderJS, fnName);
    const inlineExists = fnExists(riderHTML, fnName);
    
    check(`${fnName}()`, exists || inlineExists, `Function '${fnName}' not found in app.js or inline scripts`);
}

// Dynamic buttons in rider JS
console.log("\n\n🔷 RIDER PANEL — Dynamic Buttons (generated in JS)");
console.log("=".repeat(55));

const riderDynamicOnclicks = new Set();
let riderJsMatch;
const riderJsOnclickRegex = /onclick=(?:\\"|'|")([^"'\\]+)(?:\\"|'|")/g;
while ((riderJsMatch = riderJsOnclickRegex.exec(riderJS)) !== null) {
    const handler = riderJsMatch[1];
    const fnMatch = handler.match(/^([a-zA-Z_$][\w$]*)\s*\(/);
    if (fnMatch) riderDynamicOnclicks.add(fnMatch[1]);
}

console.log(`\n  Found ${riderDynamicOnclicks.size} unique functions called from dynamic buttons:\n`);

for (const fnName of [...riderDynamicOnclicks].sort()) {
    if (fnName === 'document') continue;
    check(`${fnName}()`, fnExists(riderJS, fnName), `Function '${fnName}' not found`);
}

// ============================
// Check addEventListener bindings
// ============================
console.log("\n\n🔷 ADMIN — addEventListener Bindings");
console.log("=".repeat(55));

const addListenerRegex = /getElementById\(["']([^"']+)["']\).*?addEventListener/g;
const addListenerMatches = [];
let alMatch;
while ((alMatch = addListenerRegex.exec(adminJS)) !== null) {
    addListenerMatches.push(alMatch[1]);
}

// Also check direct .onclick =
const directOnclickRegex = /getElementById\(["']([^"']+)["']\).*?\.onclick\s*=/g;
let doMatch;
while ((doMatch = directOnclickRegex.exec(adminJS)) !== null) {
    addListenerMatches.push(doMatch[1]);
}

// Check click handlers set up in code
const clickSetupRegex = /["']([^"']+)["']\)\.(?:addEventListener\(["']click|onclick)/g;
let csMatch;
while ((csMatch = clickSetupRegex.exec(adminJS)) !== null) {
    addListenerMatches.push(csMatch[1]);
}

if (addListenerMatches.length > 0) {
    console.log(`\n  Found ${addListenerMatches.length} JS-bound click handlers:\n`);
    addListenerMatches.forEach(id => {
        const inHTML = adminHTML.includes(`id="${id}"`);
        check(`#${id} exists in HTML`, inHTML, `Element #${id} not found in index.html`);
    });
} else {
    console.log("\n  No addEventListener/onclick bindings found in JS");
    // Check for common patterns
    const clickPatterns = adminJS.match(/\.addEventListener\s*\(\s*["']click["']/g) || [];
    console.log(`  (${clickPatterns.length} click listeners found via other patterns)`);
}


// ============================
// SUMMARY
// ============================
console.log("\n" + "=".repeat(55));
console.log(`\n📊 BUTTON AUDIT RESULTS: ${passes} passed, ${errors} failed`);
if (errors === 0) {
    console.log("🎉 ALL BUTTONS PROPERLY WIRED!");
} else {
    console.log("🚨 SOME BUTTONS ARE BROKEN — see above");
}
console.log("");

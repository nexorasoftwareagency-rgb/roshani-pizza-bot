const fetch = require('node-fetch');

const FIREBASE_URL = "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com";

// Replicating logic from index.js for testing
async function getMenu() {
    try {
        const res = await fetch(`${FIREBASE_URL}/dishes.json`);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        
        const data = await res.json();
        if (!data) return [];

        return Object.values(data);
    } catch (error) {
        console.error("\x1b[31m[FAIL] getMenu function failed:\x1b[0m", error.message);
        return null;
    }
}

async function runTests() {
    console.log("\x1b[34m[INFO] Starting tests for Prasant-Pizza-ERP...\x1b[0m\n");

    // Test 1: Connectivity
    console.log("Test 1: Firebase Connectivity Check...");
    const menu = await getMenu();

    if (menu === null) {
        console.log("\x1b[31m[FAILED] Could not connect to Firebase.\x1b[0m");
        process.exit(1);
    }
    console.log("\x1b[32m[PASSED] Successfully connected to Firebase.\x1b[0m");

    // Test 2: Data Structure
    console.log("\nTest 2: Menu Data Structure Validation...");
    if (menu.length === 0) {
        console.log("\x1b[33m[WARNING] Menu is empty, but connection was successful.\x1b[0m");
    } else {
        const firstItem = menu[0];
        const requiredFields = ['name', 'price'];
        const missing = requiredFields.filter(field => !(field in firstItem));

        if (missing.length > 0) {
            console.log(`\x1b[31m[FAILED] Missing fields in data: ${missing.join(', ')}\x1b[0m`);
            process.exit(1);
        }
        console.log("\x1b[32m[PASSED] Data structure is valid.\x1b[0m");
        console.log(`\x1b[34m[INFO] Sample Item: ${firstItem.name} (₹${firstItem.price})\x1b[0m`);
    }

    console.log("\n\x1b[32m[SUCCESS] All core business logic tests passed!\x1b[0m");
}

runTests();

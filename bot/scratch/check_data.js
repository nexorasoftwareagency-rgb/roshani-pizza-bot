const { getData } = require('../firebase');

async function check() {
    try {
        console.log("--- CATEGORIES ---");
        const categories = await getData('categories') || {};
        console.log(JSON.stringify(categories, null, 2));

        console.log("\n--- DISHES (ROOT) ---");
        const dishesRoot = await getData('dishes') || {};
        // Log keys to see if they are categories or dishes
        for (const key in dishesRoot) {
            const val = dishesRoot[key];
            if (val && typeof val === 'object' && !val.name) {
                console.log(`Node 'dishes/${key}' has children:`, Object.keys(val).slice(0, 5));
            } else {
                console.log(`Node 'dishes/${key}' is a dish:`, val.name);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

check();

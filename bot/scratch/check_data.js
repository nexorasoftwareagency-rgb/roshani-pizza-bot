const { getData } = require('../firebase');

async function check() {
    try {
        console.log("--- CATEGORIES ---");
        const categories = await getData('categories') || {};
        console.log(JSON.stringify(categories, null, 2));

        const dishesPizza = await getData('dishes/pizza') || {};
        console.log(`\n--- DISHES (PIZZA) ---`);
        for (const id in dishesPizza) {
            console.log(`- ${dishesPizza[id].name} (${dishesPizza[id].category})`);
        }

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

check();

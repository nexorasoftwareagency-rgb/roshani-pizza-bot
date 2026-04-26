const { db, getData } = require('../firebase');

async function repair() {
    console.log("Starting Menu Data Repair...");

    const updates = {};

    // 1. Recover Categories from Menu/Categories
    const menuCats = await getData('Menu/Categories') || {};
    const rootCats = await getData('categories') || {};

    // Map existing root categories by name for easy lookup
    const rootCatsByName = {};
    for (const id in rootCats) {
        const catName = rootCats[id]?.name;
        if (catName) {
            rootCatsByName[catName.toLowerCase()] = id;
        }
    }

    for (const [id, cat] of Object.entries(menuCats)) {
        if (cat.name) {
            const nameLower = cat.name.toLowerCase();
            if (!rootCatsByName[nameLower]) {
                console.log(`Recovering category '${cat.name}' from Menu/Categories...`);
                // Move to root categories under a new push ID or the same ID if not conflicting
                let recoveryCounter = 0;
                for (const [id, cat] of Object.entries(menuCats)) {
                    if (cat.name) {
                        const nameLower = cat.name.toLowerCase();
                        if (!rootCatsByName[nameLower]) {
                            console.log(`Recovering category '${cat.name}' from Menu/Categories...`);
                            const newId = rootCats[id] ? `cat_recovered_${Date.now()}_${recoveryCounter++}` : id;
                            updates[`categories/${newId}`] = {
                                updates[`categories/${newId}`] = {
                                    ...cat,
                                    outlet: cat.outlet || (nameLower === 'cakes' ? 'cake' : 'pizza'),
                                    isActive: true
                                };
                                rootCatsByName[nameLower] = newId;
                            }
                        }
                    }

                    // 2. Fix Dishes in dishes/pizza
                    const dishesPizza = await getData('dishes/pizza') || {};
                    for (const [id, dish] of Object.entries(dishesPizza)) {
                        let changed = false;
                        let newCategory = dish.category;

                        // Known invalid category ID
                        if (dish.category === '-OqFFFrmrdqeZTZZny6F' || !dish.category || dish.category === 'undefined') {
                            // Intelligent guessing based on name
                            const nameLower = (dish.name || "").toLowerCase();
                            if (nameLower.includes('pizza')) {
                                newCategory = "Pizza";
                            } else if (nameLower.includes('burger')) {
                                newCategory = "Burger";
                            } else if (nameLower.includes('cake')) {
                                newCategory = "Cakes";
                            } else {
                                newCategory = "Pizza"; // Default to Pizza if unknown
                            }
                            console.log(`Repairing dish '${dish.name}': category ${dish.category} -> ${newCategory}`);
                            changed = true;
                        }

                        if (!dish.outlet) {
                            dish.outlet = "pizza";
                            changed = true;
                        }

                        if (changed) {
                            updates[`dishes/pizza/${id}/category`] = newCategory;
                            updates[`dishes/pizza/${id}/outlet`] = dish.outlet;
                        }
                    }

                    // 3. Ensure existing categories have outlet
                    for (const [id, cat] of Object.entries(rootCats)) {
                        if (!cat.outlet) {
                            console.log(`Adding outlet=pizza to root category '${cat.name}'`);
                            updates[`categories/${id}/outlet`] = 'pizza';
                        }
                    }

                    if (Object.keys(updates).length > 0) {
                        console.log(`Applying ${Object.keys(updates).length} updates...`);
                        await db.ref('/').update(updates);
                        console.log("Repair Completed successfully!");
                    } else {
                        console.log("No repairs needed.");
                    }

                    process.exit(0);
                }

                repair().catch(err => {
                    console.error("Repair Failed:", err);
                    process.exit(1);
                });

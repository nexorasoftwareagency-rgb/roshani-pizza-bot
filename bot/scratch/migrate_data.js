const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com"
});

const db = admin.database();

async function migrate() {
  console.log("Starting Data Migration...");

  const rootRef = db.ref('/');
  const snapshot = await rootRef.once('value');
  const data = snapshot.val();

  if (!data) {
    console.log("No data found.");
    return;
  }

  const updates = {};

  // 1. Migrate Dishes
  const dishes = data.dishes || {};
  const pathsToMigrate = ['undefined', 'null', 'Pizza Shop'];
  
  // Dishes to be moved to 'pizza' (default)
  const targetOutlet = 'pizza';

  for (const path of pathsToMigrate) {
    if (dishes[path]) {
      console.log(`Migrating dishes from 'dishes/${path}' to 'dishes/${targetOutlet}'...`);
      const dishesToMove = dishes[path];
      for (const [id, dish] of Object.entries(dishesToMove)) {
        updates[`dishes/${targetOutlet}/${id}`] = dish;
      }
      // Mark for deletion
      updates[`dishes/${path}`] = null;
    }
  }

  // 2. Handle flat dishes in root dishes/ (like dish_1, dish_2)
  for (const [key, val] of Object.entries(dishes)) {
    // If the key is not one of the known valid outlets and contains dish data (has a name)
    if (key !== 'pizza' && key !== 'cake' && !pathsToMigrate.includes(key) && val.name) {
      console.log(`Migrating flat dish 'dishes/${key}' to 'dishes/${targetOutlet}/${key}'...`);
      updates[`dishes/${targetOutlet}/${key}`] = val;
      updates[`dishes/${key}`] = null;
    }
  }

  // 3. Update Categories to have outlet property
  const categories = data.categories || {};
  for (const [catId, cat] of Object.entries(categories)) {
    if (!cat.outlet) {
      console.log(`Setting outlet=pizza for category '${cat.name}'...`);
      updates[`categories/${catId}/outlet`] = 'pizza';
    }
  }

  if (Object.keys(updates).length > 0) {
    console.log(`Applying ${Object.keys(updates).length} updates...`);
    await rootRef.update(updates);
    console.log("Migration Successful!");
  } else {
    console.log("No updates needed.");
  }

  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration Failed:", err);
  process.exit(1);
});

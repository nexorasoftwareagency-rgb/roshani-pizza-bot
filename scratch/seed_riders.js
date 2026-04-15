const { setData } = require('../bot/firebase');

const riders = {
  "r1": { "name": "Ravi", "email": "ravi@rider.com" },
  "r2": { "name": "Suman", "email": "suman@rider.com" }
};

setData("riders", riders)
  .then(() => {
    console.log("Riders seeded successfully");
    process.exit(0);
  })
  .catch(err => {
    console.error("Error seeding riders:", err);
    process.exit(1);
  });

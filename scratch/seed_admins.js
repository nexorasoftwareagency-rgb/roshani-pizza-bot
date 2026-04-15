const { setData } = require('../bot/firebase');

const admins = {
  "a1": { "email": "roshanipizza@gmail.com", "outlet": "Pizza Shop" },
  "a2": { "email": "roshanicakes@gmail.com", "outlet": "Cake Shop" }
};

setData("admins", admins)
  .then(() => {
    console.log("Admins seeded successfully");
    process.exit(0);
  })
  .catch(err => {
    console.error("Error seeding admins:", err);
    process.exit(1);
  });

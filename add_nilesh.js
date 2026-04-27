const { setData } = require('./bot/firebase');

async function run() {
  const nilesh = {
    email: process.env.ADMIN_EMAIL || "2nileshshah84870@gmail.com",
    isSuper: true,
    name: "Nilesh Shah",
    outlet: "pizza"
  };

  console.log(`Seeding admin: ${nilesh.email}...`);
  const adminUid = process.env.ADMIN_UID || "sfrhHdH4R7NdHeEoAFFeTW2ieC53";
  const success = await setData(`admins/${adminUid}`, nilesh);
  if (success) {
    console.log("Success! Admin is now seeded in RTDB.");
    process.exit(0);
  } else {
    console.error("Failed to seed admin.");
    process.exit(1);
  }
}

run();

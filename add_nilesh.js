const { setData } = require('./bot/firebase');

async function run() {
  const nilesh = {
    email: "2nileshshah84870@gmail.com",
    isSuper: true,
    name: "Nilesh Shah",
    outlet: "pizza"
  };

  console.log("Seeding Nilesh Shah as admin...");
  const success = await setData("admins/sfrhHdH4R7NdHeEoAFFeTW2ieC53", nilesh);
  if (success) {
    console.log("Success! Nilesh is now an admin in RTDB.");
  } else {
    console.log("Failed to seed Nilesh.");
  }
  process.exit(0);
}

run();

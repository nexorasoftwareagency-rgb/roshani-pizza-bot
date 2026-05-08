# ROSHANI PIZZA & CAKE | Complete WhatsApp Order Flow

This document outlines the step-by-step conversational journey for a customer ordering **1 Pizza** and **1 Burger**, through to delivery and payment confirmation.

---

### Phase 1: Menu Discovery & Cart Building

**User:** Hi
**Bot:** Hello *Nilesh kumar*! 👋
✨ *WELCOME TO ROSHANI PIZZA & CAKE* 🍕🎂
━━━━━━━━━━━━━━━━━━━━━━━━━━
Delicious food, delivered fast to your doorstep! 🚀

Please select an outlet to view the menu:
1️⃣ *Pizza Outlet* 🍕
2️⃣ *Cake Outlet* 🎂
_Reply with the number to explore!_

---

**User:** 1 (Pizza Outlet)
**Bot:** 👋 *SELECT CATEGORY - PIZZA* 🍕
━━━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣ Pizza
2️⃣ Burger
0️⃣ *Back to Menu* ⬅️

---

**User:** 1 (Pizza)
**Bot:** 🍽️ *SELECT DISH: PIZZA*
━━━━━
1️⃣ Farmhouse Pizza
2️⃣ Margherita Pizza
0️⃣ *Back* ⬅️

---

**User:** 1 (Farmhouse Pizza)
**Bot:** 🍕 *Farmhouse Pizza*
Mixed vegetables, mushrooms, and mozzarella.
━━━━━━━━━━━━━━━━━━━━
1️⃣ Regular - ₹299
2️⃣ Medium - ₹499
0️⃣ *Cancel* ⬅️

---

**User:** 1 (Regular)
**Bot:** ✅ *Farmhouse Pizza (Regular)* added to cart!
━━━━━━━━━━━━━━━━━━━━
1️⃣ Add more items 🛒
2️⃣ View Cart & Checkout 🧾

---

**User:** 1 (Add more)
**Bot:** 👋 *SELECT CATEGORY - PIZZA* 🍕
━━━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣ Pizza
2️⃣ Burger
0️⃣ *Back to Menu* ⬅️

---

**User:** 2 (Burger)
**Bot:** 🍔 *SELECT DISH: BURGER*
━━━━━
1️⃣ Aloo Tikki Burger - ₹99
2️⃣ Veg Cheese Burger - ₹149
0️⃣ *Back* ⬅️

---

**User:** 2 (Veg Cheese Burger)
**Bot:** ✅ *Veg Cheese Burger* added to cart!
━━━━━━━━━━━━━━━━━━━━
1️⃣ Add more items 🛒
2️⃣ View Cart & Checkout 🧾

---

### Phase 2: Checkout & Confirmation

**User:** 2 (View Cart & Checkout)
**Bot:** 🧾 *YOUR ORDER SUMMARY*
━━━━━━━━━━━━━━━━━━━━
🍕 1x Farmhouse Pizza (Reg) - ₹299
🍔 1x Veg Cheese Burger - ₹149
━━━━━━━━━━━━━━━━━━━━
💰 Subtotal: ₹448
🚚 Shipping: ₹40
💵 *TOTAL AMOUNT: ₹488*

1️⃣ Proceed to Checkout 🚀
2️⃣ Clear Cart 🗑️

---

**User:** 1 (Proceed)
*(Bot collects Name, Address, and Location)*
**Bot:** 🧾 *YOUR FULL INVOICE*
━━━━━━━━━━━━━━━━━━━━
📦 ITEMS: Farmhouse Pizza (Reg), Veg Cheese Burger
💵 GRAND TOTAL: ₹488
━━━━━━━━━━━━━━━━━━━━
👤 NAME: Nilesh shah
🏠 ADDRESS: Apex Public School, Hajipur
📍 LOCATION: [Link]

1️⃣ Confirm Order ✅
2️⃣ Cancel Order ❌

---

**User:** 1 (Confirm)
**Bot:** 💳 *SELECT PAYMENT METHOD*
━━━━━━━━━━━━━━━━━━━━
1️⃣ *Cash on Delivery*
2️⃣ *UPI / Online* (Pay on Delivery)
3️⃣ *Any / Flexible*
_Please reply with 1, 2 or 3_

---

**User:** 2 (UPI)
**Bot:** 🎉 *ORDER PLACED SUCCESSFULLY!* 🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* #71422
🏪 *Shop:* Roshani Pizza (Hajipur)
━━━━━━━━━━━━━━━━━━━━━━━━━━
*Please wait while the admin confirms your order!* ⏳

---

### Phase 3: Admin & Rider Operations (Backend)

**Bot (To Admin):** 🔔 *NEW ORDER RECEIVED!* (#71422)
━━━━━━━━━━━━━━━━━━━━
Customer: Nilesh shah
Items: Farmhouse Pizza, Veg Cheese Burger
Total: ₹488
*Status: Placed*

---

**Bot (To Customer):** 👨‍🍳 *ORDER UPDATED!*
Your order #71422 is now **Confirmed** and is being prepared with love! ❤️

---

### Phase 4: Delivery & Payment Received

**Bot (To Customer):** 🛵 *OUT FOR DELIVERY!*
Our rider is on the way to your location. Please keep ₹488 ready.
📞 *Rider:* +91 91XXX XXXX (Ramesh)

---

**Bot (To Customer):** ✅ *ORDER DELIVERED SUCCESSFULLY!* 🍕
━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* #71422
🤝 *Payment Received via:* UPI
💵 *Total Paid:* ₹488
━━━━━━━━━━━━━━━━━━━━━━━━━━
*Thank you for choosing Roshani Pizza & Cake!* ❤️
_Please rate our service from 1 to 5 stars._

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fetch = require('node-fetch');

// Hardcoded for guaranteed connectivity
const FIREBASE_URL = "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com";
const OWNER_NUMBER = "919724649971@s.whatsapp.net";

const sessions = {};

/**
 * Fetches data from Firebase with error handling
 */
async function getData(path) {
  try {
    const res = await fetch(`${FIREBASE_URL}/${path}.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error(`Fetch error for ${path}:`, err);
    return null;
  }
}

/**
 * Sends an image with caption, falls back to text if image fails
 */
async function sendImage(sock, to, image, text) {
  try {
    await sock.sendMessage(to, {
      image: { url: image },
      caption: text
    });
  } catch (err) {
    await sock.sendMessage(to, { text });
  }
}

/**
 * Reusable Greeting & Category Menu (The Perfect Fallback)
 */
async function sendGreeting(sock, sender, user) {
    const categories = await getData("categories");
    const config = await getData("appConfig");
    
    // Check if shop is open
    if (config && config.shopOpen === false) {
        await sock.sendMessage(sender, { text: "🏮 *SHOP IS CURRENTLY CLOSED*\n\nSorry, we are not accepting orders at this moment. Please check back later!" });
        return;
    }

    const shopName = config?.shopName || "Prashant Pizza";
    const shopAddress = config?.address || "Near Government Hospital Parsa";
    const shopMobile = config?.phone || "9262980919";

    if (!categories) {
        await sock.sendMessage(sender, { text: "Service temporarily unavailable. Please try again later." });
        return;
    }

    let message = `🍕 *WELCOME TO ${shopName.toUpperCase()}*\n`;
    message += `📍 ${shopAddress}\n`;
    message += `📞 ${shopMobile}\n\n`;
    message += "Your Tasty Food is just a message away! 😋\n\n";
    message += "*INSTRUCTIONS:*\n";
    message += "1️⃣ Select a *Category*\n";
    message += "2️⃣ Pick your *Dish* & *Size*\n";
    message += "3️⃣ Add to *Cart* & Checkout\n\n";

    if (user.cart && user.cart.length > 0) {
        message += `🛒 *Your Cart:* ${user.cart.length} item(s)\n\n`;
    }

    message += "*--- SELECT A CATEGORY ---*\n\n";

    let catEntries = Object.entries(categories).map(([id, val]) => ({ id, ...val }));
    catEntries.forEach((cat, i) => {
      message += `${i + 1}. ${cat.name}\n`;
    });

    // Update state without wiping cart
    user.step = "CATEGORY";
    user.categories = catEntries;
    user.current = {}; // Clear current selection draft
    
    await sendImage(sock, sender, "https://images.unsplash.com/photo-1594007654729-407eedc4be65", message);
}

/**
 * Generates a professional invoice string from the cart
 */
function generateInvoice(user, deliveryFee = 30) {
    let invoice = "🧾 *PRASHANT PIZZA - INVOICE*\n";
    invoice += "------------------------------\n";
    let grandTotal = 0;

    user.cart.forEach((item, index) => {
        const qty = item.quantity || 1;
        const itemSubtotal = item.total * qty;
        invoice += `${index + 1}. *${item.name}* x${qty}\n`;
        invoice += `   Size: ${item.size}\n`;
        if (item.addon && item.addon !== "None") {
            invoice += `   + ${item.addon}: ₹${item.addonPrice}\n`;
        }
        invoice += `   *Subtotal: ₹${itemSubtotal}*\n\n`;
        grandTotal += itemSubtotal;
    });

    invoice += "------------------------------\n";
    invoice += `🚚 Delivery Charge: ₹${deliveryFee}\n`;
    invoice += `💰 *GRAND TOTAL: ₹${grandTotal + deliveryFee}*\n`;
    invoice += "------------------------------\n";
    return { invoice, grandTotal: grandTotal + deliveryFee };
}

/**
 * Helper to get YYYYMMDD prefix
 */
function getOrderDatePrefix() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

async function startBot() {
  console.log("BOT STARTING...");
  
  const { state, saveCreds } = await useMultiFileAuthState('session_data');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' })
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    }
    if (connection === 'open') console.log("✅ BOT READY");
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
    const phone = sender.split('@')[0].split(':')[0];

    // Initialize session if new
    if (!sessions[sender]) {
        console.log(`[SESSION] New session for ${sender}`);
        sessions[sender] = { 
            step: "START",
            cart: [],
            current: {}
        };
    }
    const user = sessions[sender];
    if (!user.current) user.current = {};

    // ===== GLOBAL COMMANDS (CANCEL / MENU / RESET) =====
    if (text === "cancel" || text === "reset") {
      delete sessions[sender];
      await sock.sendMessage(sender, { text: "❌ *Order cancelled.*" });
      await sendGreeting(sock, sender, { step: "START" });
      return;
    }

    if (text === "menu" || text === "hi" || text === "hello" || text === "hii") {
      await sendGreeting(sock, sender, user);
      return;
    }

    // ===== STEP: START (Catch-all for random first messages) =====
    if (user.step === "START") {
      await sendGreeting(sock, sender, user);
      return;
    }

    // ===== STEP: CATEGORY SELECT =====
    if (user.step === "CATEGORY") {
      const index = parseInt(text) - 1;
      const category = user.categories ? user.categories[index] : null;

      if (!category) {
          await sock.sendMessage(sender, { text: "⚠️ *Invalid selection.* Restarting for you..." });
          return await sendGreeting(sock, sender, user);
      }

      const dishes = await getData("dishes");
      if (!dishes) return;

      const filtered = Object.entries(dishes)
        .filter(([id, d]) => d.categoryId === category.id)
        .map(([id, d]) => ({ id, ...d }));

      if (filtered.length === 0) {
          await sock.sendMessage(sender, { text: "⚠️ *No items in this category.*" });
          return await sendGreeting(sock, sender, user);
      }

      user.dishes = filtered;
      user.step = "DISH";

      let msgText = `🍕 *${category.name.toUpperCase()}*\n\nSelect a dish:\n\n`;
      filtered.forEach((d, i) => {
        msgText += `${i + 1}. ${d.name}\n`;
      });

      await sendImage(sock, sender, category.image || "https://images.unsplash.com/photo-1513104890138-7c749659a591", msgText);
      return;
    }

    // ===== STEP: DISH SELECT =====
    if (user.step === "DISH") {
      const dishIndex = parseInt(text) - 1;
      const dish = user.dishes ? user.dishes[dishIndex] : null;
      
      if (!dish) {
          await sock.sendMessage(sender, { text: "⚠️ *Dish not found.* Let's start over:" });
          return await sendGreeting(sock, sender, user);
      }

      user.current.dish = dish;
      const sizes = await getData(`sizes/${dish.id}`);

      if (!sizes || Object.keys(sizes).length === 0) {
          user.current.size = "Standard";
          user.current.basePrice = dish.price || 0;
          user.current.addonPrice = 0;
          user.current.total = user.current.basePrice;
          
          user.step = "QUANTITY";
          console.log(`[STEP] Transitioning to QUANTITY (No Sizes) for ${sender}`);
          await sock.sendMessage(sender, { text: "🔢 *Enter Quantity:* (1, 2, 3... or type any number)" });
          return;
      }

      user.current.sizes = sizes;
      user.step = "SIZE";

      let msgText = "📏 *SELECT SIZE*\n\n";
      let i = 1;
      let sizeKeys = Object.keys(sizes);
      user.current.sizeKeys = sizeKeys;

      sizeKeys.forEach(s => {
        msgText += `${i}. ${s} - ₹${sizes[s]}\n`;
        i++;
      });

      await sendImage(sock, sender, dish.imageUrl || "https://images.unsplash.com/photo-1513104890138-7c749659a591", msgText);
      return;
    }

    // ===== STEP: SIZE SELECT =====
    if (user.step === "SIZE") {
      const sizeIndex = parseInt(text) - 1;
      const size = user.current.sizeKeys ? user.current.sizeKeys[sizeIndex] : null;

      if (!size) {
          await sock.sendMessage(sender, { text: "⚠️ *Invalid size.* Returning to menu..." });
          return await sendGreeting(sock, sender, user);
      }

      user.current.size = size;
      user.current.basePrice = user.current.sizes[size];
      user.current.addonPrice = 0;
      user.current.total = user.current.basePrice;

      const addons = await getData(`addons/${user.current.dish.id}`);

      if (!addons || Object.keys(addons).length === 0) {
          user.step = "QUANTITY";
          console.log(`[STEP] Transitioning to QUANTITY (No Addons) for ${sender}`);
          await sock.sendMessage(sender, { text: "🔢 *Enter Quantity:* (1, 2, 3... or type any number)" });
          return;
      }

      user.current.addons = addons;
      user.step = "ADDON";

      let msgText = "🧀 *ADD-ONS*\n\n";
      let addonList = Object.entries(addons).map(([id, val]) => ({ id, ...val }));
      user.current.addonList = addonList;

      addonList.forEach((a, i) => {
        msgText += `${i + 1}. ${a.name} - ₹${a[size] || 0}\n`;
      });

      msgText += "\n0. Skip";

      await sendImage(sock, sender, user.current.dish.imageUrl || "https://images.unsplash.com/photo-1600891964599-f61ba0e24092", msgText);
      return;
    }

    // ===== STEP: ADDON =====
    if (user.step === "ADDON") {
      if (text !== "0") {
        const addonIndex = parseInt(text) - 1;
        const addon = user.current.addonList ? user.current.addonList[addonIndex] : null;

        if (addon) {
            user.current.addon = addon.name;
            user.current.addonPrice = (addon[user.current.size] || 0);
            user.current.total += user.current.addonPrice;
        } else {
            await sock.sendMessage(sender, { text: "⚠️ *Invalid addition.* Let's start over:" });
            return await sendGreeting(sock, sender, user);
        }
      }

      user.step = "QUANTITY";
      console.log(`[STEP] Transitioning to QUANTITY (After Addons) for ${sender}`);
      await sock.sendMessage(sender, { text: "🔢 *Enter Quantity:* (1, 2, 3... or type any number)" });
      return;
    }

    // ===== STEP: QUANTITY =====
    if (user.step === "QUANTITY") {
      const qty = parseInt(text);
      if (isNaN(qty) || qty < 1) {
          await sock.sendMessage(sender, { text: "⚠️ *Invalid quantity.* Please enter a number (1, 2, 3...):" });
          return;
      }

      user.current.quantity = qty;
      
      // Finalize item and add to cart
      user.cart.push({
          name: user.current.dish.name,
          size: user.current.size,
          addon: user.current.addon || "None",
          basePrice: user.current.basePrice,
          addonPrice: user.current.addonPrice || 0,
          total: user.current.total, // Base per-item total (base + addon)
          quantity: qty
      });

      user.step = "NEXT_ACTION";
      await sock.sendMessage(sender, { text: `🛒 *${qty}x ${user.current.dish.name} added to cart!*\n\n1️⃣ Add another item\n2️⃣ Proceed to Checkout` });
      return;
    }

    // ===== STEP: NEXT_ACTION (Decision point) =====
    if (user.step === "NEXT_ACTION") {
        if (text === "1") {
            return await sendGreeting(sock, sender, user);
        } else if (text === "2") {
            user.step = "NAME";
            await sock.sendMessage(sender, { text: "Please enter your name for the order:" });
            return;
        } else {
            await sock.sendMessage(sender, { text: "⚠️ *Invalid choice.* \n\n1️⃣ Add another item\n2️⃣ Proceed to Checkout" });
            return;
        }
    }

    // ===== STEP: NAME =====
    if (user.step === "NAME") {
      if (text.length < 2) {
          await sock.sendMessage(sender, { text: "⚠️ *Message unclear. Please start again.*" });
          return await sendGreeting(sock, sender, user);
      }
      user.name = text;
      user.step = "MOBILE";
      await sock.sendMessage(sender, { text: "📞 *Please enter your Mobile Number for the order:*" });
      return;
    }

    // ===== STEP: MOBILE (Manual Entry) =====
    if (user.step === "MOBILE") {
      const cleanPhone = text.replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        await sock.sendMessage(sender, { text: "⚠️ *Invalid phone number.* Please enter at least 10 digits:" });
        return;
      }
      user.customPhone = text; // Keep original formatting but mapped
      user.step = "ADDRESS";
      await sock.sendMessage(sender, { text: "🏠 *Please enter your House No, Street, and Landmark (Compulsory):*" });
      return;
    }

    // ===== STEP: ADDRESS (Compulsory Text) =====
    if (user.step === "ADDRESS") {
      const locationMsg = msg.message.locationMessage || msg.message.liveLocationMessage;
      
      if (locationMsg) {
        const lat = locationMsg.degreesLatitude;
        const lon = locationMsg.degreesLongitude;
        user.locationLink = `https://www.google.com/maps?q=${lat},${lon}`;
        await sock.sendMessage(sender, { text: "📍 *Location received!* \n\nNow please type your full *text Address* (House No, Street, Landmark) below to complete the info:" });
        return;
      }

      if (text.length < 5) {
        await sock.sendMessage(sender, { text: "⚠️ *Address too short. Please enter your full text address:*" });
        return;
      }

      user.addressText = text;
      user.step = "SHARE_LOCATION";
      await sock.sendMessage(sender, { text: "📍 *Optional:* Share your Current Location from WhatsApp for faster delivery, or type *'Skip'* to continue." });
      return;
    }

    // ===== STEP: SHARE_LOCATION (Optional) =====
    if (user.step === "SHARE_LOCATION") {
      const locationMsg = msg.message.locationMessage || msg.message.liveLocationMessage;

      if (locationMsg) {
        const lat = locationMsg.degreesLatitude;
        const lon = locationMsg.degreesLongitude;
        user.locationLink = `https://www.google.com/maps?q=${lat},${lon}`;
      } else if (text !== "skip") {
        // If they typed something other than skip, maybe they meant to type address?
        // But they already typed address. Let's assume standard flow.
        if (text.length > 3) {
            // If they type a long string, maybe they are correcting the address? 
            // For simplicity, let's just proceed or ask to skip/share.
            await sock.sendMessage(sender, { text: "Please type *'Skip'* or share your *Location* to proceed." });
            return;
        }
      }

      user.step = "NOTE";
      await sock.sendMessage(sender, { text: "Any special instructions for the rider? (or type 'none')" });
      return;
    }

    // ===== STEP: NOTE =====
    if (user.step === "NOTE") {
      user.note = text;
      user.step = "CONFIRM";
      const config = await getData("appConfig");
      const deliveryFee = config?.deliveryFee || 30;

      const { invoice, grandTotal } = generateInvoice(user, deliveryFee);
      user.grandTotal = grandTotal;

      let summary = invoice;
      summary += `👤 *Customer:* ${user.name}\n`;
      summary += `📞 *Phone:* ${user.customPhone}\n`;
      summary += `🏠 *Address:* ${user.addressText}\n`;
      if (user.locationLink) {
        summary += `📍 *Location:* ${user.locationLink}\n`;
      }
      summary += `📝 *Note:* ${user.note || "N/A"}\n\n`;
      summary += `1️⃣ *Confirm Order*\n`;
      summary += `2️⃣ *Cancel and Restart*`;

      await sock.sendMessage(sender, { text: summary });
      return;
    }

    // ===== STEP: CONFIRM =====
    if (user.step === "CONFIRM") {
      if (text === "1") {
        const datePrefix = getOrderDatePrefix();
        const countPath = `order_counts/${datePrefix}`;
        
        // Fetch current count
        let count = await getData(countPath) || 0;
        count++;
        
        // Update count back to Firebase
        await fetch(`${FIREBASE_URL}/${countPath}.json`, {
          method: "PUT",
          body: JSON.stringify(count)
        });

        const orderId = `${datePrefix}${String(count).padStart(2, '0')}`;
        const { invoice, grandTotal } = generateInvoice(user);
        
        const order = {
          orderId,
          customerName: user.name,
          phone: user.customPhone || phone,
          address: user.addressText,
          location: user.locationLink || null,
          note: user.note,
          cart: user.cart,
          total: grandTotal,
          status: "Pending",
          createdAt: new Date().toISOString()
        };

        await fetch(`${FIREBASE_URL}/orders/${orderId}.json`, {
          method: "PUT",
          body: JSON.stringify(order)
        });

        await sock.sendMessage(sender, {
          text: `✅ *Order Placed!* \n\nYour Order ID is #${orderId}. We are preparing your food.`
        });

        let ownerMsg = `🚨 *NEW ORDER RECEIVED (#${orderId})*\n\n`;
        ownerMsg += `👤 *Customer:* ${user.name}\n`;
        ownerMsg += `📞 *Phone:* ${user.customPhone || ('+' + phone)}\n\n`;
        ownerMsg += invoice;
        ownerMsg += `\n🏠 *Address:* ${user.addressText}\n`;
        if (user.locationLink) {
            ownerMsg += `📍 *Location:* ${user.locationLink}\n`;
        }
        ownerMsg += `📝 *Note:* ${user.note || "None"}\n\n`;
        ownerMsg += `✅ *Reply to this message to coordinate.*`;

        await sock.sendMessage(OWNER_NUMBER, { text: ownerMsg });

        delete sessions[sender];
      } else {
        await sock.sendMessage(sender, { text: "❌ *Order Cancelled.* Type 'Menu' to start fresh." });
        delete sessions[sender];
      }
      return;
    }

    // FINAL FALLBACK: If user reaches here without a step-match
    await sendGreeting(sock, sender, user);
  });
}

startBot();
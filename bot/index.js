const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { getData, setData, updateData } = require('./firebase');

const sessions = {};
const processedStatus = {};

const SESSION_TTL = 30 * 60 * 1000;
const STATUS_TTL = 24 * 60 * 60 * 1000;

// Session cleanup - prevent memory leaks
setInterval(() => {
    const now = Date.now();
    for (const sender in sessions) {
        const user = sessions[sender];
        if (user.lastActivity && now - user.lastActivity > SESSION_TTL) {
            delete sessions[sender];
        }
    }
    for (const id in processedStatus) {
        if (now - (processedStatus[id]?.timestamp || 0) > STATUS_TTL) {
            delete processedStatus[id];
        }
    }
}, 5 * 60 * 1000);

// =============================
// HELPERS
// =============================


async function sendImage(sock, to, image, text) {
    try {
        await sock.sendMessage(to, {
            image: { url: image },
            caption: text
        });
    } catch {
        await sock.sendMessage(to, { text });
    }
}

// =============================
// GREETING
// =============================
async function sendGreeting(sock, sender, user) {
    const settings = await getData("settings");

    let msg = `✨ *WELCOME* 🍽️\n\n`;
    msg += `1️⃣ Pizza 🍕\n`;
    msg += `2️⃣ Cake 🎂\n\n`;
    msg += `Reply with number`;

    user.step = "OUTLET";

    await sendImage(sock, sender, settings?.bannerImage, msg);
}

// =============================
// CATEGORY
// =============================
async function sendCategories(sock, sender, user) {
    const data = await getData(`categories/${user.outlet}`);
    if (!data) {
        user.categoryList = [];
        user.step = "CATEGORY";
        return sock.sendMessage(sender, { text: "❌ No categories available. Try again later." });
    }

    user.categoryList = Object.entries(data).map(([id, val]) => ({ id, ...val }));
    if (user.categoryList.length === 0) {
        user.step = "CATEGORY";
        return sock.sendMessage(sender, { text: "❌ No categories available. Try again later." });
    }

    let msg = `📂 *SELECT CATEGORY*\n\n`;
    user.categoryList.forEach((c, i) => {
        msg += `${i + 1}️⃣ ${c.name}\n`;
    });
    msg += `\n0️⃣ Back`;
    user.step = "CATEGORY";

    await sendImage(sock, sender, user.categoryList[0]?.image, msg);
}

// =============================
// START BOT
// =============================
async function startBot() {

    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('connection.update', (u) => {
        if (u.qr) qrcode.generate(u.qr, { small: true });
        if (u.connection === 'open') console.log("✅ WHATSAPP BOT ONLINE");
        if (u.connection === 'close') {
            const code = u.lastDisconnect?.error?.output?.statusCode;
            console.log("🔌 Disconnected:", code);
            if (code === 401) {
                console.log("🚫 Session invalid. Reconnecting...");
                setTimeout(() => startBot(), 5000);
            }
        }
        if (u.connection === 'connecting') console.log("🔄 Connecting...");
    });

    sock.ev.on('creds.update', saveCreds);

    // =============================
    // REALTIME STATUS LISTENER
    // =============================
    setInterval(async () => {
        try {
            const orders = await getData("orders");
            if (!orders) return;

            for (const id in orders) {

                const order = orders[id];
                if (!order) continue;

                const phone = order.whatsappNumber || order.phone;
                if (!phone) continue;

                if (!processedStatus[id]) {
                    processedStatus[id] = { status: order.status, timestamp: Date.now() };
                    continue;
                }

                if (processedStatus[id].status !== order.status) {

                    processedStatus[id] = { status: order.status, timestamp: Date.now() };

                    const number = phone + "@s.whatsapp.net";

                let msg = "";

                if (order.status === "Confirmed") {
                    msg = `✅ *Order Confirmed*\n🍽️ Your order is accepted`;
                }

                if (order.status === "Preparing") {
                    msg = `👨‍🍳 Preparing your food`;
                }

                if (order.status === "Cooked") {
                    msg = `🍕 Food is ready`;
                }

                if (order.status === "Out for Delivery") {
                    msg = `🚚 Out for delivery`;
                }

                if (order.status === "Delivered") {
                    msg = `🎉 Delivered!\n🙏 Thank you\n⭐ Please review us`;
                }

                if (msg) {
                    await sock.sendMessage(number, { text: msg });
                }
            }

        }
        } catch (err) {
            console.error("Order listener error:", err);
        }

    }, 3000);

    // =============================
    // OTP LISTENER (RIDER → BOT)
    // =============================
    const processedOTP = {};

    setInterval(async () => {

        const orders = await getData("orders");
        if (!orders) return;

        for (const id in orders) {

            const order = orders[id];

            // skip if no OTP
            if (!order.deliveryOTP) continue;

            // skip if already processed
            if (processedOTP[id] === order.deliveryOTP) continue;

            // mark processed
            processedOTP[id] = order.deliveryOTP;

            const number = order.whatsappNumber + "@s.whatsapp.net";

            const msg = `🔐 *Delivery OTP*\n\n` +
                `Your OTP is: *${order.deliveryOTP}*\n\n` +
                `👉 Share this only after receiving your order.`;

            try {
                await sock.sendMessage(number, { text: msg });
                console.log("OTP sent to:", number);
            } catch (err) {
                console.log("OTP send failed:", err);
            }

        }

    }, 3000);

    // =============================
    // MESSAGE HANDLER
    // =============================
    sock.ev.on('messages.upsert', async (m) => {

        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();

if (!sessions[sender]) {
            sessions[sender] = { step: "START", current: {} };
        }
        sessions[sender].lastActivity = Date.now();
        const user = sessions[sender];

        // GLOBAL - word boundary match to prevent false positives
        const lower = text.toLowerCase();
        const words = lower.split(/\s+/);
        const greetings = ["hi", "hello", "menu", "start", "pizza", "cake"];
        if (words.some(w => greetings.includes(w))) {
            return sendGreeting(sock, sender, user);
        }

        if (text.toLowerCase() === "cancel") {
            sessions[sender] = { step: "START", current: {} };
            return sock.sendMessage(sender, { text: "❌ Cancelled. Reply 'hi' to start fresh." });
        }

        // OUTLET
        if (user.step === "OUTLET") {
            if (text === "1") user.outlet = "pizza";
            else if (text === "2") user.outlet = "cake";
            else return;

            return sendCategories(sock, sender, user);
        }

        // CATEGORY
        if (user.step === "CATEGORY") {
            if (text === "0") return sendGreeting(sock, sender, user);

            const cat = user.categoryList[parseInt(text) - 1];
            if (!cat) return;

            const dishes = await getData(`dishes/${user.outlet}`) || {};

            user.dishList = Object.entries(dishes)
                .filter(([id, d]) => d.categoryId === cat.id)
                .map(([id, d]) => ({ id, ...d }));

            if (user.dishList.length === 0) {
                return sock.sendMessage(sender, { text: "❌ No dishes available in this category." });
            }

            let msgText = `🍽️ ${cat.name}\n\n`;

            user.dishList.forEach((d, i) => {
                msgText += `${i + 1}. ${d.name}\n`;
            });

            user.step = "DISH";

            return sendImage(sock, sender, cat.image, msgText);
        }

        // DISH
        if (user.step === "DISH") {

            const dish = user.dishList[parseInt(text) - 1];
            if (!dish) return;

            user.current.dish = dish;

            const sizes = await getData(`sizes/${user.outlet}/${dish.id}`) || {};
            user.sizeList = Object.entries(sizes);

            if (user.sizeList.length === 0) {
                return sock.sendMessage(sender, { text: "❌ No sizes available for this dish." });
            }

            let msgText = `📏 Select Size\n\n`;

            user.sizeList.forEach(([s, p], i) => {
                msgText += `${i + 1}. ${s} - ₹${p}\n`;
            });

            user.step = "SIZE";

            return sendImage(sock, sender, dish.imageUrl, msgText);
        }

        // SIZE
        if (user.step === "SIZE") {

            const [size, price] = user.sizeList[parseInt(text) - 1] || [];
            if (!size) return;

            user.current.size = size;
            user.current.total = price;

            user.step = "NAME";
            return sock.sendMessage(sender, { text: "Enter Name:" });
        }

        // NAME
        if (user.step === "NAME") {
            user.name = text;
            user.step = "PHONE";
            return sock.sendMessage(sender, { text: "Enter Mobile Number:" });
        }

        // PHONE - validate and normalize
        if (user.step === "PHONE") {
            const cleaned = text.replace(/\D/g, '').slice(-10);
            if (cleaned.length < 10) {
                return sock.sendMessage(sender, { text: "⚠️ Please enter a valid 10-digit mobile number.\nExample: 9876543210" });
            }
            user.phone = "+91" + cleaned;
            user.step = "ADDRESS_TEXT";
            return sock.sendMessage(sender, { text: "🏠 Please type your *full delivery address*:\n\nExample: House no, street, landmark" });
        }

        // ADDRESS_TEXT
        if (user.step === "ADDRESS_TEXT") {
            if (!text || text.length < 5) {
                return sock.sendMessage(sender, { text: "⚠️ Please enter a valid address (at least 5 characters)." });
            }
            user.address = text;
            user.step = "LOCATION";
            return sock.sendMessage(sender, { text: "📍 Now send your *LIVE LOCATION*\n\nTap 📎 → Location → Send Current Location" });
        }

        // LOCATION
        if (user.step === "LOCATION") {
            const location = msg.message?.locationMessage || msg.message?.liveLocationMessage;
            if (!location) {
                return sock.sendMessage(sender, { text: "📍 Please send your *LIVE LOCATION* only.\n\nTap 📎 → Location → Send Current Location" });
            }
            const lat = location.degreesLatitude;
            const lng = location.degreesLongitude;
            user.location = { lat, lng };
            user.locationLink = `https://www.google.com/maps?q=${lat},${lng}`;
            user.step = "CONFIRM";
            
            let summary = `🧾 Summary\n\n`;
            summary += `${user.current.dish.name}\n`;
            summary += `${user.current.size}\n`;
            summary += `₹${user.current.total}\n\n`;
            summary += `${user.name}\n${user.phone}\n${user.address}\n`;
            summary += `${user.locationLink}\n\n`;
            summary += `1 Confirm\n2 Cancel`;
            return sock.sendMessage(sender, { text: summary });
        }

        // CONFIRM
        if (user.step === "CONFIRM") {
            if (text !== "1") {
                sessions[sender] = { step: "START", current: {} };
                return sock.sendMessage(sender, { text: "❌ Cancelled. Reply 'hi' to start fresh." });
            }

            const orderId = "ORD" + Date.now().toString(36).toUpperCase();

            await setData(`orders/${orderId}`, {
                orderId,
                outlet: user.outlet,
                customerName: user.name,
                whatsappNumber: sender.split('@')[0],
                phone: user.phone,
                address: user.address,
                locationLink: user.locationLink || null,
                total: user.current.total,
                status: "Placed",
                createdAt: new Date().toISOString(),
                items: [{
                    name: user.current.dish?.name || user.current.dish,
                    size: user.current.size,
                    quantity: user.current.quantity || 1
                }]
            });

            await sock.sendMessage(sender, {
                text: `✅ Order Placed\nID: ${orderId}`
            });

            delete sessions[sender];
        }

    });

}

startBot();
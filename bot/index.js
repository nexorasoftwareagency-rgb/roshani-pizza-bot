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

    user.categoryList = Object.entries(data).map(([id, val]) => ({ id, ...val }));

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
        if (u.connection === 'open') console.log("BOT READY");
    });

    sock.ev.on('creds.update', saveCreds);

    // =============================
    // REALTIME STATUS LISTENER
    // =============================
    setInterval(async () => {

        const orders = await getData("orders");
        if (!orders) return;

        for (const id in orders) {

            const order = orders[id];

            if (!processedStatus[id]) {
                processedStatus[id] = order.status;
                continue;
            }

            if (processedStatus[id] !== order.status) {

                processedStatus[id] = order.status;

                const number = order.phone + "@s.whatsapp.net";

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

        const user = sessions[sender];

        // GLOBAL
        if (["hi", "hello", "menu"].includes(text.toLowerCase())) {
            return sendGreeting(sock, sender, user);
        }

        if (text.toLowerCase() === "cancel") {
            delete sessions[sender];
            return sock.sendMessage(sender, { text: "❌ Cancelled" });
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

            const dishes = await getData(`dishes/${user.outlet}`);

            user.dishList = Object.entries(dishes)
                .filter(([id, d]) => d.categoryId === cat.id)
                .map(([id, d]) => ({ id, ...d }));

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

            const sizes = await getData(`sizes/${user.outlet}/${dish.id}`);
            user.sizeList = Object.entries(sizes);

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

        // PHONE
        if (user.step === "PHONE") {
            user.phone = text;
            user.step = "ADDRESS";
            return sock.sendMessage(sender, { text: "Enter Address:" });
        }

        // ADDRESS
        if (user.step === "ADDRESS") {
            user.address = text;

            let summary = `🧾 Summary\n\n`;
            summary += `${user.current.dish.name}\n`;
            summary += `${user.current.size}\n`;
            summary += `₹${user.current.total}\n\n`;
            summary += `${user.name}\n${user.phone}\n${user.address}\n\n`;
            summary += `1 Confirm\n2 Cancel`;

            user.step = "CONFIRM";

            return sock.sendMessage(sender, { text: summary });
        }

        // CONFIRM
        if (user.step === "CONFIRM") {

            if (text !== "1") {
                delete sessions[sender];
                return sock.sendMessage(sender, { text: "Cancelled" });
            }

            const orderId = Date.now();

            await setData(`orders/${orderId}`, {
                orderId,
                outlet: user.outlet,
                customerName: user.name,
                whatsappNumber: sender.split('@')[0],
                phone: user.phone,
                address: user.address,
                total: user.current.total,
                status: "Placed",
                createdAt: new Date().toISOString()
            });

            await sock.sendMessage(sender, {
                text: `✅ Order Placed\nID: ${orderId}`
            });

            delete sessions[sender];
        }

    });

}

startBot();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { getData, setData, updateData, db, pushData } = require('./firebase');

const sessions = {};
const processedStatus = {};

const SESSION_TTL = 30 * 60 * 1000;
const STATUS_TTL = 24 * 60 * 60 * 1000;

// Session cleanup logic
function cleanupSessions() {
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
}

// =============================
// RIDER RESOLUTION HELPER
// =============================
async function getRiderByEmail(email, outlet = 'pizza') {
    if (!email) return null;
    try {
        const riders = await getData("riders", outlet);
        if (!riders) return null;
        for (const uid in riders) {
            if (riders[uid].email?.toLowerCase() === email.toLowerCase()) {
                return { uid, ...riders[uid] };
            }
        }
    } catch (err) {
        console.error("Rider Lookup Error:", err);
    }
    return null;
}

async function addInAppNotification(uid, title, body, type = 'info', icon = 'bell', outlet = 'pizza') {
    if (!uid) return;
    try {
        const notifId = "NOTIF" + Date.now();
        await setData(`riders/${uid}/notifications/${notifId}`, {
            id: notifId,
            title,
            body,
            type,
            icon,
            timestamp: Date.now(),
            read: false
        }, outlet);
    } catch (err) {
        console.error("Failed to add in-app notification:", err);
    }
}

// Graceful shutdown handling is now within startBot if needed, 
// but for simplicity we'll just allow process exit.

// =============================
// HELPERS
// =============================
function formatJid(phone) {
    if (!phone) return null;
    let clean = String(phone).replace(/\D/g, '');
    if (clean.length === 10) clean = '91' + clean;
    return (clean.length >= 10) ? (clean + "@s.whatsapp.net") : null;
}

// =============================
// GLOBAL STATE
// =============================
let reportInterval = null;

async function sendImage(sock, to, image, text) {
    if (!image) {
        await sock.sendMessage(to, { text });
        return;
    }
    try {
        let payload;
        // Detect if image is a Base64 data string (starts with "data:image")
        if (typeof image === 'string' && image.startsWith('data:image')) {
            // Extract the base64 part
            const base64Data = image.split(',')[1];
            if (base64Data) {
                payload = { image: Buffer.from(base64Data, 'base64'), caption: text };
            } else {
                throw new Error("Invalid base64 format");
            }
        } else {
            // Assume it's a URL
            payload = { image: { url: image }, caption: text };
        }
        await sock.sendMessage(to, { ...payload });
    } catch (err) {
        console.error("Image Send Error:", err);
        // Fallback to text message
        await sock.sendMessage(to, { text });
    }
}

async function notifyDeveloper(sock, errorMsg) {
    try {
        const storeData = await getData("settings/Store");
        const devPhone = storeData?.developerPhone;
        if (!devPhone) return;

        const adminJid = formatJid(devPhone);
        if (!adminJid) return;

        // Sanitize & Truncate to prevent leaking user data or long stack traces
        const safeError = String(errorMsg)
            .replace(/file:\/\/\/[^"'\s]+/g, '[PATH]')
            .replace(/[0-9]{10,}/g, '[PHONE]')
            .substring(0, 500);

        const alertMsg = `🛑 *CRITICAL BOT ALERT* 🛑\n` +
            `` +
            `⚠️ *Error:* ${safeError}\n` +
            `⏰ *Time:* ${new Date().toLocaleString()}\n` +
            `` +
            `_Check logs for details._`;

        await sock.sendMessage(adminJid, { text: alertMsg });
    } catch (err) {
        console.error("Failed to notify developer:", err);
    }
}

// Haversine Distance Helper
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of earth in KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Delivery fee tier lookup
function getFeeFromSlabs(distance, slabs) {
    if (!slabs || slabs.length === 0) return 0;
    for (const slab of slabs) {
        if (distance <= slab.km) return slab.fee;
    }
    return slabs[slabs.length - 1].fee; // Max tier
}

// Time parsing helper (Global for use in isShopOpen and Scheduler)
function parseTime(timeStr) {
    if (!timeStr) return 0;
    // Clean string and handle AM/PM
    const cleanStr = String(timeStr).trim().toUpperCase();
    const isPM = cleanStr.includes('PM');
    const isAM = cleanStr.includes('AM');
    
    // Extract numbers
    const parts = cleanStr.replace(/AM|PM/i, '').trim().split(':');
    let hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    return hours * 60 + minutes;
}

function isShopOpen(openTime, closeTime, statusOverride) {
    if (statusOverride === 'FORCE_OPEN') return true;
    if (statusOverride === 'FORCE_CLOSED') return false;
    if (!openTime || !closeTime) return true; // Default to open if not set

    // FORCE IST (Asia/Kolkata) Timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(now);
    const hourPart = parts.find(p => p.type === 'hour');
    const minutePart = parts.find(p => p.type === 'minute');

    const h = hourPart ? parseInt(hourPart.value) : 0;
    const m = minutePart ? parseInt(minutePart.value) : 0;
    const currentTime = h * 60 + m;

    const start = parseTime(openTime);
    const end = parseTime(closeTime);

    // console.log(`[ShopHours] Current(IST): ${h}:${m} (${currentTime}m) | Open: ${openTime}(${start}m) | Close: ${closeTime}(${end}m)`);

    // Handle overnight hours (e.g. 10:00 PM to 02:00 AM)
    if (end < start) {
        return currentTime >= start || currentTime <= end;
    }
    return currentTime >= start && currentTime <= end;
}

async function sendDailyReport(sock, targetOutlet = null) {
    try {
        const migrationInfo = await getData("migrationStatus/multiOutlet") || {};
        const outlets = targetOutlet ? [targetOutlet] : (migrationInfo.outlets || ['pizza', 'cake']);
        
        // Always use target outlet settings for report contacts if possible, otherwise fallback to default
        const reportSettingsOutlet = targetOutlet || 'pizza';
        const storeData = await getData("settings/Store", reportSettingsOutlet) || {};
        const recipients = [];
        
        const adminJid = formatJid(storeData.reportPhone);
        const devJid = formatJid(storeData.developerPhone);
        
        if (adminJid) recipients.push(adminJid);
        if (devJid) recipients.push(devJid);

        if (recipients.length === 0) {
            console.log(`[Report] No recipients configured for ${reportSettingsOutlet}.`);
            return;
        }

        // Fetch Today's Orders (IST Based)
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        
        let allTodayOrders = [];
        let revenueByOutlet = {};

        for (const outlet of outlets) {
            const orders = await getData("orders", outlet) || {};
            const todayOrders = Object.values(orders).filter(o => o.createdAt && o.createdAt.startsWith(todayStr));
            
            allTodayOrders = allTodayOrders.concat(todayOrders);
            revenueByOutlet[outlet] = todayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        }

        // Handle zero orders case gracefully
        if (allTodayOrders.length === 0) {
            console.log(`[Report] Zero orders found for ${targetOutlet || 'all outlets'} on ${todayStr}. Sending Zero Sales report.`);
        }

        const totalRevenue = allTodayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

        let reportMsg = `📊 *DAILY SALES SUMMARY* 📊\n`;
        reportMsg += ``;
        reportMsg += `📅 *Date:* ${new Date().toLocaleDateString()}\n`;
        if (targetOutlet) {
            reportMsg += `🏪 *Store:* ${targetOutlet.toUpperCase()}\n`;
        } else {
            reportMsg += `🏪 *Store:* ALL OUTLETS\n`;
        }
        reportMsg += `\n`;
        reportMsg += `💰 *TOTAL REVENUE:* ₹${totalRevenue.toLocaleString()}\n`;
        reportMsg += `📦 *TOTAL ORDERS:* ${allTodayOrders.length}\n\n`;
        
        for (const [outlet, rev] of Object.entries(revenueByOutlet)) {
            const label = outlet.charAt(0).toUpperCase() + outlet.slice(1);
            const emoji = outlet === 'pizza' ? '🍕' : '🎂';
            reportMsg += `${emoji} *${label} Sales:* ₹${rev.toLocaleString()}\n`;
        }
        
        reportMsg += ``;
        reportMsg += `_Generated automatically at closing time._`;

        for (const jid of recipients) await sock.sendMessage(jid, { text: reportMsg });
        
        // Mark as sent for the specific outlets processed
        for (const outlet of outlets) {
            await updateData('settings/Bot', { lastReportDate: todayStr }, outlet);
        }

    } catch (err) {
        console.error("Daily Report Error:", err);
    }
}

// Format cart items for display
function formatCartSummary(cart) {
    if (!cart || cart.length === 0) return '_Your cart is empty_';
    let lines = '';
    let subtotal = 0;
    cart.forEach((item, i) => {
        const itemTotal = item.total * item.quantity;
        subtotal += itemTotal;
        lines += `  ${i + 1}. *${item.name}* (${item.size})`;
        if (item.addons && item.addons.length > 0) {
            lines += `\n     + ${item.addons.map(a => a.name).join(', ')}`;
        }
        lines += `\n     Qty: ${item.quantity} × ₹${item.total} = ₹${itemTotal}\n`;
    });
    return { lines, subtotal };
}

function formatOrderInvoice(orderId, order) {
    let itemsText = "";
    if (order.items) {
        order.items.forEach((item, i) => {
            const qty = item.quantity || 1;
            const price = item.price || item.unitPrice || 0;
            const itemTotal = item.lineTotal || (price * qty);
            itemsText += `• *${item.name}* (${item.size}) x ${qty} - ₹${itemTotal}\n`;
            if (item.addons && item.addons.length > 0) {
                itemsText += `  _Addons: ${item.addons.map(a => a.name).join(", ")}_\n`;
            }
        });
    }

    const safeId = String(order.orderId || orderId || "");
    const displayId = safeId ? safeId.slice(-5) : "N/A";
    const type = order.type === 'Walk-in' ? 'Dine-in' : 'Online';

    const name = order.customerName || "";
    const greeting = name ? `Hello *${name}*! 👋\n\n` : "";

    let msg = `${greeting}🧾 *ORDER SUMMARY*\n`;
    msg += ``;
    msg += `🆔 *Order ID:* #${displayId}\n`;
    msg += `📍 *Type:* ${type}\n`;
    msg += `👤 *Customer:* ${order.customerName || "Guest"}\n`;
    msg += ``;
    msg += `📦 *ITEMS:*\n${itemsText || 'No items listed'}\n`;
    msg += ``;
    msg += `💰 *BILLING:*\n`;
    msg += `Subtotal: ₹${order.subtotal || order.itemTotal || 0}\n`;
    if (order.discount) msg += `Discount: ₹${order.discount}\n`;
    msg += `*TOTAL AMOUNT: ₹${order.total || 0}*\n`;
    msg += ``;
    return msg;
}

function formatCompactSummary(order) {
    if (!order.items) return "";
    let items = order.items.map(item => `• *${item.name}* (${item.size}) x${item.quantity || 1}`).join("\n");
    return `📦 *ORDER ITEMS:*\n${items}\n`;
}

// =============================
// FUNNY FOOD JOKES
// =============================
function getFunnyFoodJoke() {
    const jokes = [
        "Why did the pizza go to the doctor? It was feeling a bit 'cheesy'! 🍕",
        "What's a pizza's favorite movie? 'Slice of life'! 🎬",
        "What do you call a fake pizza? A 'pepper-phoney'! 🍕",
        "How do you fix a broken pizza? With tomato paste! 🍅",
        "Why did the baker go to jail? He was caught 'kneading' the dough too much! 🥯",
        "What's a pizza's favorite song? 'Slice, Slice, Baby'! 🎶",
        "Why did the pizza delivery guy get a promotion? He always 'delivered' on time! 🛵",
        "What do you call a sleepy pizza? A 'doze-za'! 😴",
        "Why did the tomato turn red? Because it saw the pizza dressing! 🍅",
        "What's the best way to eat pizza? With your mouth! (Okay, that was a bad one, but we hope it made you smile!) 😊"
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
}

function getFoodFunnyProgress(status, name = "") {
    const nameSuffix = name ? `, ${name}` : "";
    const quips = {
        "Preparing": [
            `Our chef is currently whispering sweet nothings to your dough to make it extra fluffy${nameSuffix}. 👨‍🍳`,
            `Ingredients are being introduced to each other. It's a very romantic kitchen session${nameSuffix}. 🥣`,
            `We're making sure your pizza is more circular than the wheels on a delivery bike${nameSuffix}! 🍕`
        ],
        "Cooked": [
            `Your food is currently in its final photo shoot${nameSuffix}. It's looking delicious and ready to travel! 📸`,
            `It's hot, it's fresh, and it's currently being tucked into its box for a cozy ride${nameSuffix}. 🍱`,
            `Smelling so good even the neighboring building is jealous! Almost ready${nameSuffix}! 🍱`
        ],
        "Out for Delivery": [
            `Our delivery hero is moving faster than a pizza falling off a table${nameSuffix}! Keep the napkins ready. 🚀`,
            `Escape plan successful! Your food has left the kitchen and is racing to your doorstep${nameSuffix}. 🛵`,
            `The bike is fueled, the box is hot, and the hunger games are almost over${nameSuffix}! 🚀`
        ]
    };

    const bars = {
        "Confirmed":  "✅⬜⬜⬜⬜",
        "Preparing":  "✅👨‍🍳⬜⬜⬜",
        "Cooked":     "✅👨‍🍳🔥⬜⬜",
        "Out for Delivery": "✅👨‍🍳🔥🍱🚀",
        "Delivered":  "✅👨‍🍳🔥🍱🍕"
    };

    const statusQuips = quips[status] || [`Almost there, ${name}!`];
    const quip = statusQuips[Math.floor(Math.random() * statusQuips.length)];
    const bar = bars[status] || "⬜⬜⬜⬜⬜";

    return `\n*Progress:* [ ${bar} ]\n\n_${quip}_\n`;
}

// =============================
// GREETING
// =============================
async function sendGreeting(sock, sender, user) {
    const settings = await getData("settings");
    const name = user.name || user.pushName || "";
    const greeting = name ? `Hello *${name}*! 👋\n` : "";

    let msg = `${greeting}✨ *WELCOME TO ROSHANI PIZZA & CAKE* 🍕🎂\n`;
    msg += ``;
    msg += `Delicious food, delivered fast to your doorstep! 🚀\n\n`;
    msg += `Please select an outlet to view the menu:\n\n`;
    msg += `1️⃣ *Pizza Outlet* 🍕\n`;
    msg += `2️⃣ *Cake Outlet* 🎂\n\n`;
    msg += `_Reply with the number to explore!_`;

    user.step = "OUTLET";
    user.cart = user.cart || [];
    user.current = {};

    await sendImage(sock, sender, settings?.bannerImage, msg);
}

// =============================
// ORDER ID GENERATION (Shared daily sequence)
// =============================
async function generateOrderId(outlet = 'pizza') {
    const today = new Date();
    const y = today.getFullYear();
    const m = (today.getMonth() + 1).toString().padStart(2, '0');
    const d = today.getDate().toString().padStart(2, '0');
    const dateStr = `${y}${m}${d}`;
    
    // Sequence is now per-outlet
    const seqRef = db.ref(`${outlet}/metadata/orderSequence/${dateStr}`);
    const result = await seqRef.transaction((current) => (current || 0) + 1);
    
    const seqNum = result.snapshot.val() || 1;
    return `${dateStr}-${seqNum.toString().padStart(4, '0')}`;
}

// =============================
// CATEGORY
// =============================
async function sendCategories(sock, sender, user) {
    const currentOutlet = user.outlet || 'pizza';
    const categoriesData = await getData(`categories`, currentOutlet);
    const botSettings = await getData(`settings/Bot`, currentOutlet) || {};
    const bannerFallback = botSettings.imgWelcome || "https://via.placeholder.com/600x400?text=Roshani+ERP";

    if (!categoriesData) {
        user.categoryList = [];
        user.step = "CATEGORY";
        return sock.sendMessage(sender, { text: "❌ *No categories available.* \nPlease try again later." });
    }

    // Data is already isolated by resolvePath, just map it
    user.categoryList = Object.entries(categoriesData || {})
        .map(([id, val]) => ({ id, ...val }));

    if (user.categoryList.length === 0) {
        user.step = "CATEGORY";
        return sock.sendMessage(sender, { text: "❌ *Oops!* No categories found for this outlet." });
    }

    const outletName = user.outlet === 'pizza' ? 'Pizza' : 'Cake';
    const outletEmoji = user.outlet === 'pizza' ? '🍕' : '🎂';
    const name = user.name || user.pushName || "";

    let msg = name ? `Hi *${name}*! 👋\n\n` : "";

    // Show mini cart if items exist
    if (user.cart && user.cart.length > 0) {
        msg += `🛒 *CART (${user.cart.length} item${user.cart.length > 1 ? 's' : ''}):*\n`;
        user.cart.forEach((item, i) => {
            msg += `  • ${item.name} (${item.size}) x${item.quantity}\n`;
        });
        msg += `\n`;
    }

    msg += `📂 *SELECT CATEGORY - ${outletName.toUpperCase()}* ${outletEmoji}\n`;
    msg += `\n`;
    user.categoryList.forEach((c, i) => {
        msg += `${i + 1}️⃣  ${c.name}\n`;
    });
    msg += `\n0️⃣  *Back to Menu* ⬅️`;
    user.step = "CATEGORY";

    // Use specific category image if available, else use banner fallback
    const displayImg = user.categoryList[0]?.image || bannerFallback;
    await sendImage(sock, sender, displayImg, msg);
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
        logger: pino({ level: 'silent' }),
        browser: ['Windows', 'Chrome', '11.0.0']
    });

    // =============================
    // HEARTBEAT & SCHEDULER (Atomic)
    // =============================
    if (reportInterval) clearInterval(reportInterval);
    reportInterval = setInterval(async () => {
        cleanupSessions();

        try {
            const migrationInfo = await getData("migrationStatus/multiOutlet") || {};
            const outlets = migrationInfo.outlets || ['pizza', 'cake'];
            const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

            for (const outlet of outlets) {
                const storeSettings = await getData("settings/Store", outlet);
                const botSettings = await getData("settings/Bot", outlet) || {};

                // Daily Report Trigger (Sync'd to Asia/Kolkata)
                if (storeSettings?.shopCloseTime && botSettings.lastReportDate !== today) {
                    const now = new Date();
                    const istParts = new Intl.DateTimeFormat('en-US', {
                        timeZone: 'Asia/Kolkata',
                        hour: 'numeric',
                        minute: 'numeric',
                        hourCycle: 'h23'
                    }).formatToParts(now);
                    
                    const istHourPart = istParts.find(p => p.type === 'hour');
                    const istMinutePart = istParts.find(p => p.type === 'minute');
                    
                    const curH = istHourPart ? parseInt(istHourPart.value) : 0;
                    const curM = istMinutePart ? parseInt(istMinutePart.value) : 0;

                    const closeTimeMinutes = parseTime(storeSettings.shopCloseTime);
                    const currentTimeMinutes = curH * 60 + curM;

                    const isAutoClosed = currentTimeMinutes >= closeTimeMinutes;
                    const isManuallyClosed = storeSettings.statusOverride === 'FORCE_CLOSED';

                    if (isAutoClosed || isManuallyClosed) {
                        console.log(`[Scheduler] Triggering report for ${outlet} (${isManuallyClosed ? 'Manual' : 'Auto'} Close)`);
                        // Pass specific outlet to reporter
                        await sendDailyReport(sock, outlet);
                    }
                }
            }

            // Heartbeat
            updateData('bot/status', {
                lastSeen: Date.now(),
                status: 'Online'
            }).catch(e => console.error("Heartbeat error:", e));

        } catch (err) {
            console.error("Scheduler Error:", err);
        }
    }, 60 * 1000); // Check every minute

    sock.ev.on('connection.update', (u) => {
        const { connection, lastDisconnect, qr } = u;
        if (qr) qrcode.generate(qr, { small: true });

        if (connection === 'connecting') console.log("🔄 Re-establishing connection...");
        if (connection === 'open') console.log("✅ WHATSAPP BOT ONLINE & READY");

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.code;
            const shouldReconnect = code !== 401; // Allow retry on 515 or other transient errors

            console.log(`🔌 Disconnected (Code: ${code}). Reconnecting: ${shouldReconnect}`);

            if (shouldReconnect) {
                setTimeout(() => startBot(), 5000);
            } else {
                console.log("❌ Authentication failed or logged out. Please restart and scan QR.");
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // =============================
    // EVENT LISTENERS (Real-time, Multi-Outlet)
    // =============================
    const migrationInfo = await getData("migrationStatus/multiOutlet") || {};
    const outlets = migrationInfo.outlets || ['pizza', 'cake'];
    const botStartTime = Date.now();

    outlets.forEach(outlet => {
        const orderRef = db.ref(`${outlet}/orders`);
        
        orderRef.on("child_changed", async (snap) => {
            const id = snap.key;
            const order = snap.val();
            if (order) handleOrderStatusUpdate(sock, id, order);
        });

        orderRef.on("child_added", async (snap) => {
            const id = snap.key;
            const order = snap.val();
            if (order) {
                // Fill cache silently for old orders on startup
                if (Date.now() - botStartTime < 10000) {
                    processedStatus[id] = { status: order.status, timestamp: Date.now() };
                    if (order.deliveryOTP) processedOTP[id] = order.deliveryOTP;
                    return;
                }

                // [NEW] NOTIFY ADMIN IMMEDIATELY
                try {
                    await notifyAdmin(sock, id, order, 'NEW');
                    await handleOrderStatusUpdate(sock, id, order, true); 
                } catch (err) {
                    console.error(`New Order Processing Error (${outlet}):`, err);
                }
            }
        });
    });

    async function notifyAdmin(sock, orderId, order, type = 'NEW') {
        try {
            const outletId = order.outlet || 'pizza';
            const delSettings = await getData("settings/Delivery", outletId);
            const storeSettings = await getData("settings/Store", outletId);
            
            // Priority: notifyPhone > developerPhone > Default
            const rawPhone = delSettings?.notifyPhone || storeSettings?.developerPhone;
            if (!rawPhone) return;

            const adminNumber = formatJid(rawPhone);
            if (!adminNumber) return;
            
            let itemsText = "";
            if (order.items) {
                order.items.forEach(item => {
                    itemsText += `• *${item.name}* (${item.size}) x ${item.quantity || 1}\n`;
                    if (item.addons && item.addons.length > 0) {
                        itemsText += `  _Addons: ${item.addons.map(a => a.name).join(", ")}_\n`;
                    }
                });
            }

            let adminMsg = "";
            if (type === 'NEW') {
                adminMsg = `🔔 *NEW ORDER RECEIVED!* 🔔\n`;
            } else if (type === 'DELIVERED') {
                adminMsg = `✅ *ORDER DELIVERED & PAID* ✅\n`;
            } else if (type === 'ABANDONED') {
                adminMsg = `🚨 *CHECKOUT CANCELLED* 🚨\n`;
                adminMsg += `🚫 _(Customer dropped off at Checkout)_ \n`;
                adminMsg += ``;
                adminMsg += `🔗 *FOLLOW UP:* https://wa.me/91${order.phone.replace(/\D/g, '').slice(-10)}\n`;
                adminMsg += ``;
            } else {
                adminMsg = `📢 *ORDER UPDATE* 📢\n`;
            }

            adminMsg += ``;
            adminMsg += `🏪 *Outlet:* ${outletId.toUpperCase()}\n`;
            const safeOrderId = String(order.orderId || orderId || "");
            adminMsg += `🆔 *Order ID:* #${safeOrderId && safeOrderId !== 'N/A' ? safeOrderId.slice(-5) : "Draft"}\n`;
            adminMsg += `👤 *Customer:* ${order.customerName || "Guest"}\n`;
            adminMsg += `📞 *Phone:* ${order.phone || "N/A"}\n`;
            
            if (type === 'NEW' || type === 'ABANDONED') {
                adminMsg += `📍 *Type:* ${order.type || "Online"}\n`;
                if (order.address && order.type !== 'Walk-in') {
                    adminMsg += `🏠 *Address:* ${order.address}\n`;
                }
            }

            adminMsg += ``;
            adminMsg += `📦 *ITEMS:*\n${itemsText || 'No items listed'}\n`;
            adminMsg += ``;
            const safeTotal = order.total !== undefined ? Number(order.total) : 0;
            adminMsg += `💰 *TOTAL:* ₹${!isNaN(safeTotal) ? safeTotal : "N/A"}\n`;
            
            if (type === 'DELIVERED') {
                adminMsg += `🤝 *Status:* Payment Received\n`;
                adminMsg += `💳 *Method:* ${order.paymentMethod || 'Cash/UPI'}\n`;
            } else {
                adminMsg += `💳 *Payment:* ${order.paymentMethod || 'COD'} (${order.paymentStatus || 'Pending'})\n`;
            }

            if (order.specialInstructions) {
                adminMsg += `📝 *Note:* ${order.specialInstructions}\n`;
            }
            adminMsg += ``;
            adminMsg += `_Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}_`;

            await sock.sendMessage(adminNumber, { text: adminMsg });
            console.log(`✅ Admin Notified (${type}): ${adminNumber}`);
        } catch (err) {
            console.error("Admin Notification Error:", err);
        }
    }

    async function handleOrderStatusUpdate(sock, id, order, isNew = false) {
        try {
            const number = formatJid(order.whatsappNumber || order.phone);
            if (!number) return;

            // 1. STATUS UPDATE LOGIC
            if (!processedStatus[id] || processedStatus[id].status !== order.status || isNew) {
                processedStatus[id] = { status: order.status, timestamp: Date.now() };
                
                // RIDER NOTIFICATION LOGIC
                if (order.assignedRider) {
                    const rider = await getRiderByEmail(order.assignedRider, order.outlet);
                    if (rider) {
                        const riderJid = formatJid(rider.phone);
                        if (!riderJid) return;
                        
                        if (order.status === "Cooked") {
                            const rMsg = `🍳 *ORDER READY: COOKED*\n` +
                                `` +
                                `📦 *Order:* #${id}\n` +
                                `👤 *Customer:* ${order.customerName}\n` +
                                `🏠 *Address:* ${order.address}\n\n` +
                                `_The order is cooked and ready for pickup! Please reach the outlet if you aren't already there._`;
                            await sock.sendMessage(riderJid, { text: rMsg });
                            await addInAppNotification(rider.uid, "🍳 Order Cooked", `Order #${id} is ready for pickup.`, 'warning', 'flame');
                        } else if (order.status === "Out for Delivery") {
                            const rMsg = `🚚 *NEW ASSIGNMENT: OUT FOR DELIVERY*\n` +
                                `` +
                                `📦 *Order:* #${id}\n` +
                                `👤 *Customer:* ${order.customerName}\n` +
                                `🏠 *Address:* ${order.address}\n\n` +
                                `_Please proceed for delivery immediately. Use the Rider App for navigation._`;
                            await sock.sendMessage(riderJid, { text: rMsg });
                            await addInAppNotification(rider.uid, "🚀 Out for Delivery", `Order #${id} is now on your active trip.`, 'success', 'truck');
                        } else if (order.status === "Delivered") {
                            const rMsg = `✅ *ORDER DELIVERED SUCCESSFULLY*\n` +
                                `` +
                                `Great job! Order *#${id}* for *${order.customerName}* has been marked as delivered.\n\n` +
                                `💰 *Estimated Earnings:* ₹${order.riderCommission || 40}\n` +
                                `_Your wallet balance has been updated._`;
                            await sock.sendMessage(riderJid, { text: rMsg });
                            await addInAppNotification(rider.uid, "✅ Delivered", `Order #${id} completed successfully.`, 'success', 'check-circle');
                        }
                    }
                } else if (order.status === "Cooked") {
                    // BROADCAST TO ALL ONLINE RIDERS if no rider is assigned yet
                    try {
                        const ridersSnap = await getData("riders"); // Riders are global
                        if (ridersSnap) {
                            for (const rid in ridersSnap) {
                                const rider = ridersSnap[rid];
                                if (rider.status === "Online") {
                                    const riderJid = formatJid(rider.phone);
                                    if (riderJid) {
                                        const broadcastMsg = `🔔 *NEW ORDER AVAILABLE*\n` +
                                            `` +
                                            `📦 *Order:* #${id}\n` +
                                            `🏪 *Outlet:* ${(order.outlet || 'pizza').toUpperCase()}\n` +
                                            `📍 *Destination:* ${order.address || '---'}\n\n` +
                                            `_This order is now COOKED and ready for pickup. Open your Rider App to accept!_`;
                                        await sock.sendMessage(riderJid, { text: broadcastMsg });
                                        await addInAppNotification(rid, "🔔 New Order Available", `Order #${id} is cooked and waiting for a rider.`, 'info', 'package');
                                    }
                                }
                            }
                        }
                    } catch (broadcastErr) {
                        console.error("Rider broadcast error:", broadcastErr);
                    }
                }

                let msg = "";
                let statusImg = null;
                const botSettingsSnap = await getData("settings/Bot", order.outlet || 'pizza');
                const botSettings = botSettingsSnap || {};

                if (order.status === "Confirmed") {
                    const invoice = formatOrderInvoice(id, order);
                    const progress = getFoodFunnyProgress("Confirmed", order.customerName);
                    msg = `Hello *${order.customerName || "Guest"}*! 👋\n\n${invoice}${progress}\n✅ *ORDER CONFIRMED*\n\nGreat news! Your order *#${id.slice(-5)}* has been confirmed. We're getting started! 🍕`;
                    statusImg = botSettings.imgConfirmed;
                }
                else if (order.status === "Preparing") {
                    const summary = formatCompactSummary(order);
                    const progress = getFoodFunnyProgress("Preparing", order.customerName);
                    msg = `Hello *${order.customerName || "Guest"}*! 👋\n\n👨‍🍳 *CHEF IS COOKING!*\n🆔 *Order:* #${id.slice(-5)}\n${summary}${progress}`;
                    statusImg = botSettings.imgPreparing;
                }
                else if (order.status === "Cooked") {
                    const summary = formatCompactSummary(order);
                    const progress = getFoodFunnyProgress("Cooked", order.customerName);
                    msg = `Hello *${order.customerName || "Guest"}*! 👋\n\n🍱 *READY & GETTING PACKED*\n🆔 *Order:* #${id.slice(-5)}\n${summary}${progress}`;
                    statusImg = botSettings.imgCooked;
                }
                else if (order.status === "Out for Delivery") {
                    const summary = formatCompactSummary(order);
                    const progress = getFoodFunnyProgress("Out for Delivery", order.customerName);
                    let addrText = "";
                    if (order.address && order.type !== 'Walk-in') {
                        addrText = `🏠 *To:* ${order.address}\n`;
                    }
                    msg = `Hello *${order.customerName || "Guest"}*! 👋\n\n🚀 *OUT FOR DELIVERY*\n🆔 *Order:* #${id.slice(-5)}\n${addrText}${summary}${progress}\n💵 *Payment:* ${order.paymentMethod || 'Cash/UPI'} (₹${order.total || 0})`;
                    statusImg = botSettings.imgOut;
                }
                else if (order.status === "Delivered") {
                    // Load Marketing & Feedback Info
                    const storeData = await getData("settings/Store", order.outlet || 'pizza');
                    const brands = storeData || {};

                    // 1. Send Invoice & Payment Confirmation
                    const invoice = formatOrderInvoice(id, order);
                    let deliveryMsg = `Hello *${order.customerName || "Guest"}*! 👋\n\n✅ *ORDER DELIVERED SUCCESSFULLY!* 🍕\n\n${invoice}\n🤝 *Payment done via:* ${order.paymentMethod || 'Cash/UPI'}\n`;
                    
                    await sock.sendMessage(number, { text: deliveryMsg });

                    // NOTIFY ADMIN OF DELIVERY & PAYMENT
                    await notifyAdmin(sock, id, order, 'DELIVERED').catch(e => console.error("Admin delivered notify error:", e));

                    // 2. Send Promotional Message + Funny Joke + Feedback Request
                    let promoMsg = `🌟 *WE HOPE YOU ENJOYED YOUR MEAL!* 🌟\n`;
                    promoMsg += ``;
                    promoMsg += `_${getFunnyFoodJoke()}_\n\n`;
                    promoMsg += `Your order from *${(brands.storeName || "Roshani Pizza & Cake").toUpperCase()}* is complete. We'd love to hear from you!\n\n`;

                    if (botSettings.socialInsta || botSettings.socialFb || botSettings.socialReview) {
                        promoMsg += `Stay connected:\n`;
                        if (botSettings.socialInsta) promoMsg += `📸 Instagram: ${botSettings.socialInsta}\n`;
                        if (botSettings.socialFb) promoMsg += `👥 Facebook: ${botSettings.socialFb}\n`;
                        if (botSettings.socialReview) promoMsg += `🏅 Rate us: ${botSettings.socialReview}\n\n`;
                    }

                    promoMsg += `Please rate your experience (1-5):`;

                    if (botSettings.imgDelivered) {
                        await sendImage(sock, number, botSettings.imgDelivered, promoMsg);
                    } else {
                        await sock.sendMessage(number, { text: promoMsg });
                    }

                    // 3. Start Feedback Flow
                    sessions[number] = {
                        step: "FEEDBACK_RATING",
                        orderId: id,
                        customerName: order.customerName,
                        phone: phone,
                        outlet: order.outlet || 'pizza',
                        lastActivity: Date.now()
                    };
                    return;
                }
                else if (order.status === "Cancelled") {
                    msg = `Hello *${order.customerName || "Guest"}*! 👋\n\n❌ *ORDER CANCELLED*\nWe're sorry, but your order *#${id.slice(-5)}* has been cancelled. If you have any questions, please contact our support team. We hope to serve you again soon! 🍕🎂`;
                    statusImg = botSettings.imgCancelled;
                }

                if (msg) await sendImage(sock, number, statusImg, msg);
            }

            // 2. OTP LOGIC
            if (order.deliveryOTP && processedOTP[id] !== order.deliveryOTP) {
                processedOTP[id] = order.deliveryOTP;
                const otpMsg = `🔐 *Delivery OTP*\n\n` +
                    `Your OTP is: *${order.deliveryOTP}*\n\n` +
                    `👉 Share this only after receiving your order.`;
                await sock.sendMessage(number, { text: otpMsg });
            }

            // Cleanup memory (Limit to 200 entries)
            const keys = Object.keys(processedStatus);
            if (keys.length > 200) delete processedStatus[keys[0]];
            const otpKeys = Object.keys(processedOTP);
            if (otpKeys.length > 200) delete processedOTP[otpKeys[0]];
        } catch (err) {
            console.error("Order update listener error:", err);
        }
    }

    const processedOTP = {};

    // =============================
    // MESSAGE HANDLER
    // =============================
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const sender = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();

            const pushName = msg.pushName || "";
            if (!sessions[sender]) {
                sessions[sender] = { step: "START", current: {}, cart: [], pushName: pushName };
            }
            sessions[sender].lastActivity = Date.now();
            const user = sessions[sender];
            if (pushName && !user.pushName) user.pushName = pushName;

            // Ensure cart array exists (for older sessions)
            if (!user.cart) user.cart = [];

            // GLOBAL UNIVERSAL GREETING - triggers on any message if session is starting
            if (user.step === "START") {
                return sendGreeting(sock, sender, user);
            }

            if (text.toLowerCase() === "cancel") {
                sessions[sender] = { step: "START", current: {}, cart: [] };
                return sock.sendMessage(sender, { text: "❌ Cancelled. Reply anything to start fresh." });
            }

            // CHECK SHOP HOURS (Only after outlet is selected)
            if (user.outlet && !user.step?.startsWith("FEEDBACK")) {
                const storeData = await getData("settings/Store", user.outlet) || {};
                if (!isShopOpen(storeData.shopOpenTime, storeData.shopCloseTime, storeData.shopStatus)) {
                    return sock.sendMessage(sender, {
                        text: `🌙 *WE ARE CURRENTLY CLOSED*\n\nThank you for reaching out! Our *${user.outlet.toUpperCase()}* shop is currently closed. We look forward to serving you during our opening hours:\n\n☀️ *Opening Time:* ${storeData.shopOpenTime || '10:00'}\n\nSee you soon! 🍕🎂`
                    });
                }
            }

            // FEEDBACK FLOW - RATING
            if (user.step === "FEEDBACK_RATING") {
                const rating = parseInt(text);
                if (isNaN(rating) || rating < 1 || rating > 5) {
                    return sock.sendMessage(sender, { text: "❌ *Invalid Rating.* Please reply with a number between 1 and 5." });
                }

                user.feedback = { rating };
                const storeData = await getData("settings/Store", user.outlet || 'pizza') || {};
                const botSettings = await getData("settings/Bot", user.outlet || 'pizza') || {};
                const name = user.customerName || user.pushName || "";

                let msg = name ? `Thanks *${name}*! 👋\n\n` : "";
                msg += `✨ *THANK YOU FOR YOUR RATING!* ✨\n`;
                msg += ``;
                msg += `What did you enjoy the most about your experience?\n\n`;
                msg += `1️⃣  ${storeData.feedbackReason1 || 'Delicious Taste'}\n`;
                msg += `2️⃣  ${storeData.feedbackReason2 || 'Lightning Fast Delivery'}\n`;
                msg += `3️⃣  ${storeData.feedbackReason3 || 'Premium Packaging'}\n`;
                msg += `4️⃣  *Other (Tell us more)*\n\n`;
                msg += `_Reply with a number_`;

                user.step = "FEEDBACK_REASON";
                return await sendImage(sock, sender, botSettings.imgFeedback, msg);
            }

            // FEEDBACK FLOW - REASON
            if (user.step === "FEEDBACK_REASON") {
                const storeData = await getData("settings/Store", user.outlet || 'pizza') || {};
                const reasons = [
                    storeData.feedbackReason1 || 'Delicious Taste',
                    storeData.feedbackReason2 || 'Lightning Fast Delivery',
                    storeData.feedbackReason3 || 'Premium Packaging'
                ];

                if (text === "4") {
                    user.step = "FEEDBACK_COMMENT";
                    return sock.sendMessage(sender, { text: "✍️ *WE VALUE YOUR INPUT*\n\nPlease write your feedback or suggestions for improvement below:" });
                }

                const reason = reasons[parseInt(text) - 1];
                if (!reason) return sock.sendMessage(sender, { text: "❌ *Invalid Selection.* Please reply with 1, 2, 3, or 4." });

                // Save Feedback and End
                await setData(`feedbacks/${Date.now()}`, {
                    orderId: user.orderId,
                    customerName: user.customerName,
                    phone: user.phone,
                    rating: user.feedback.rating,
                    reason: reason,
                    timestamp: new Date().toISOString()
                }, user.outlet || 'pizza');

                await sock.sendMessage(sender, { text: "✅ *FEEDBACK RECEIVED!*\n\nThank you for helping us improve. Have a wonderful day! 🙏✨" });
                user.step = "START";
                return;
            }

            // FEEDBACK FLOW - CUSTOM COMMENT
            if (user.step === "FEEDBACK_COMMENT") {
                // Save Feedback and End
                await setData(`feedbacks/${Date.now()}`, {
                    orderId: user.orderId,
                    customerName: user.customerName,
                    phone: user.phone,
                    rating: user.feedback.rating,
                    reason: "Other",
                    comment: text,
                    timestamp: new Date().toISOString()
                }, user.outlet || 'pizza');

                await sock.sendMessage(sender, { text: "✅ *THANK YOU SO MUCH!*\n\nYour detailed feedback has been recorded. Our team will review it shortly. 🙏✨" });
                user.step = "START";
                return;
            }

            // OUTLET
            if (user.step === "OUTLET") {
                if (text === "1") user.outlet = "pizza";
                else if (text === "2") user.outlet = "cake";
                else return sendGreeting(sock, sender, user);

                return sendCategories(sock, sender, user);
            }

            // CATEGORY
            if (user.step === "CATEGORY") {
                if (text === "0") return sendGreeting(sock, sender, user);

                const cat = user.categoryList[parseInt(text) - 1];
                if (!cat) return sendGreeting(sock, sender, user); // Invalid number or other message

                const dishes = await getData(`dishes`, user.outlet) || {};
                console.log(`[BOT] Fetching dishes for outlet: ${user.outlet}. Total dishes in DB for this outlet: ${Object.keys(dishes).length}`);

                // Filter by category NAME (Case-insensitive & Robust)
                user.dishList = Object.entries(dishes)
                    .filter(([id, d]) => {
                        const dishCat = String(d.category || "").toLowerCase().trim();
                        const selectedCat = String(cat.name || "").toLowerCase().trim();
                        return dishCat === selectedCat;
                    })
                    .map(([id, d]) => ({ id, ...d }));

                console.log(`[BOT] Category: ${cat.name}, Dishes found: ${user.dishList.length}`);

                if (user.dishList.length === 0) {
                    console.warn(`[BOT] No dishes found in category '${cat.name}' for outlet '${user.outlet}'`);
                    return sock.sendMessage(sender, { text: `❌ *No dishes available* in the *${cat.name}* category right now. \nPlease check back later or try another category! 🍕` });
                }

                let msgText = `🍽️  *SELECT DISH: ${cat.name.toUpperCase()}*\n`;
                msgText += `\n`;

                user.dishList.forEach((d, i) => {
                    msgText += `${i + 1}️⃣  ${d.name}\n`;
                });
                msgText += `\n0️⃣  *Go Back* ⬅️`;

                user.step = "DISH";
                
                const name = user.name || user.pushName || "";
                if (name) msgText = `Hi *${name}*! 👋\n\n` + msgText;

                // Fallback image handling
                const settings = await getData(`settings`);
                const displayImg = cat.image || settings?.bannerImage;

                return sendImage(sock, sender, displayImg, msgText);
            }

            // DISH
            if (user.step === "DISH") {
                if (text === "0") return sendCategories(sock, sender, user);

                const dish = user.dishList[parseInt(text) - 1];
                if (!dish) return sendGreeting(sock, sender, user);

                user.current = { dish }; // Reset current item scratchpad

                // Sizes are nested inside the dish object in Admin
                const sizes = dish.sizes || {};
                user.sizeList = Object.entries(sizes);

                if (user.sizeList.length === 0) {
                    return sock.sendMessage(sender, { text: "❌ No sizes available for this dish." });
                }

                let msgText = `📏  *SELECT SIZE: ${dish.name.toUpperCase()}*\n`;
                msgText += `\n`;

                user.sizeList.forEach(([s, p], i) => {
                    msgText += `${i + 1}️⃣  ${s} — ₹${p}\n`;
                });
                msgText += `\n0️⃣  *Go Back* ⬅️`;

                user.step = "SIZE";

                return sendImage(sock, sender, dish.image, msgText);
            }

            // SIZE → check for addons
            if (user.step === "SIZE") {
                if (text === "0") {
                    // Go back to dish list
                    user.step = "DISH";
                    let msgText = `🍽️  *SELECT DISH*\n`;
                    msgText += `\n`;
                    user.dishList.forEach((d, i) => {
                        msgText += `${i + 1}️⃣  ${d.name}\n`;
                    });
                    msgText += `\n0️⃣  *Go Back* ⬅️`;
                    return sock.sendMessage(sender, { text: msgText });
                }

                const [size, price] = user.sizeList[parseInt(text) - 1] || [];
                if (!size) return sendGreeting(sock, sender, user);

                user.current.size = size;
                user.current.unitPrice = price; // Base price for this size
                user.current.addons = [];

                // Check if this dish has add-ons
                const addons = user.current.dish.addons || {};
                user.addonList = Object.entries(addons);

                if (user.addonList.length > 0) {
                    // Show add-ons selection
                    let msgText = `🧀 *ADD-ONS / EXTRAS*\n`;
                    msgText += ``;
                    msgText += `🍽️ ${user.current.dish.name} (${size} — ₹${price})\n\n`;
                    msgText += `*Choose your extras:*\n\n`;

                    user.addonList.forEach(([name, addonPrice], i) => {
                        msgText += `${i + 1}️⃣  ${name} — +₹${addonPrice}\n`;
                    });
                    msgText += `\n0️⃣  *Skip / Done* ✅\n`;
                    msgText += `\n_Reply with a number to add. Send 0 when done._`;

                    user.step = "ADDONS";
                    return sock.sendMessage(sender, { text: msgText });
                } else {
                    // No addons → go directly to quantity
                    user.step = "QUANTITY";
                    return sock.sendMessage(sender, {
                        text: `🔢 *HOW MANY?*\n🍽️ ${user.current.dish.name} (${size} — ₹${price})\n\n*Enter quantity:*\n\n_Example: 1, 2, 3..._`
                    });
                }
            }

            // ADDONS (loop - user can pick multiple, send 0 to finish)
            if (user.step === "ADDONS") {
                if (text === "0") {
                    // Done selecting addons → go to quantity
                    const addonTotal = user.current.addons.reduce((sum, a) => sum + a.price, 0);
                    const totalPerUnit = user.current.unitPrice + addonTotal;

                    let selectedAddons = '';
                    if (user.current.addons.length > 0) {
                        selectedAddons = `\n✅ *Selected Add-ons:*\n`;
                        user.current.addons.forEach(a => {
                            selectedAddons += `  + ${a.name} (+₹${a.price})\n`;
                        });
                    }

                    user.step = "QUANTITY";
                    const name = user.name || user.pushName || "";
                    let qtyMsg = `🔢 *HOW MANY?*\n🍽️ ${user.current.dish.name} (${user.current.size} — ₹${user.current.unitPrice})${selectedAddons}\n💰 *Per unit: ₹${totalPerUnit}*\n\n*Enter quantity:*\n_Example: 1, 2, 3..._`;
                    if (name) qtyMsg = `Excellent choice, *${name}*! 👋\n\n` + qtyMsg;
                    return sock.sendMessage(sender, { text: qtyMsg });
                }

                const idx = parseInt(text) - 1;
                if (isNaN(idx) || idx < 0 || idx >= user.addonList.length) {
                    return sock.sendMessage(sender, { text: "⚠️ *Invalid choice.* Please pick a number from the list, or send *0* to skip." });
                }

                const [addonName, addonPrice] = user.addonList[idx];

                // Prevent duplicate addons
                if (user.current.addons.some(a => a.name === addonName)) {
                    return sock.sendMessage(sender, { text: `ℹ️ *${addonName}* is already added!\n\nPick another or send *0* to continue.` });
                }

                user.current.addons.push({ name: addonName, price: addonPrice });

                let confirmMsg = `✅ *Added: ${addonName} (+₹${addonPrice})*\n\n`;
                confirmMsg += `📝 *Your extras so far:*\n`;
                user.current.addons.forEach(a => {
                    confirmMsg += `  • ${a.name} (+₹${a.price})\n`;
                });
                
                let remainingAddons = [];
                user.addonList.forEach((a, i) => {
                    if (!user.current.addons.some(ad => ad.name === a[0])) {
                        remainingAddons.push(`${i + 1}️⃣  ${a[0]} (+₹${a[1]})`);
                    }
                });

                if (remainingAddons.length > 0) {
                    confirmMsg += `\n*Want more?* Pick another number:\n`;
                    confirmMsg += remainingAddons.join('\n') + `\n\n`;
                    confirmMsg += `0️⃣ *Done selecting* ✅`;
                } else {
                    confirmMsg += `\n*No more extras available.*\n`;
                    confirmMsg += `0️⃣ *Done selecting* ✅`;
                }

                return sock.sendMessage(sender, { text: confirmMsg });
            }

            // QUANTITY
            if (user.step === "QUANTITY") {
                const qty = parseInt(text);
                if (isNaN(qty) || qty < 1 || qty > 50) {
                    return sock.sendMessage(sender, { text: "⚠️ *Please enter a valid quantity* (1-50)." });
                }

                user.current.quantity = qty;

                // Calculate total for this item
                const addonTotal = (user.current.addons || []).reduce((sum, a) => sum + a.price, 0);
                user.current.total = user.current.unitPrice + addonTotal; // per unit price

                // Push to cart
                user.cart.push({
                    name: user.current.dish.name,
                    size: user.current.size,
                    unitPrice: user.current.unitPrice,
                    addons: user.current.addons || [],
                    quantity: user.current.quantity,
                    total: user.current.total, // per-unit total (size + addons)
                    outlet: user.outlet
                });

                // Instead of sendCartView, show ADDED_TO_CART prompt
                user.step = "ADDED_TO_CART";
                let itemName = user.current.dish.name;
                if (user.current.size && user.current.size !== 'Regular') itemName += ` (${user.current.size})`;
                
                let addedMsg = `✅ *${itemName}* added to cart!\n`;
                addedMsg += ``;
                addedMsg += `1️⃣ Add more items 🛒\n`;
                addedMsg += `2️⃣ View Cart & Checkout 🧾`;
                
                return sock.sendMessage(sender, { text: addedMsg });
            }

            // ADDED_TO_CART
            if (user.step === "ADDED_TO_CART") {
                if (text === "1") {
                    return sendCategories(sock, sender, user);
                } else if (text === "2") {
                    return sendCartView(sock, sender, user);
                } else {
                    return sock.sendMessage(sender, { text: "⚠️ Please reply *1* to add more items, or *2* to View Cart & Checkout." });
                }
            }

            // CART_VIEW
            if (user.step === "CART_VIEW") {
                if (text === "1") {
                    // Proceed to Checkout → collect customer details
                    user.step = "NAME";
                    return sock.sendMessage(sender, { text: "👤 *What is your full name?*\n\n_Example: Nilesh Shah_" });
                } else if (text === "2") {
                    // Cancel order
                    sessions[sender] = { step: "START", current: {}, cart: [] };
                    return sock.sendMessage(sender, { text: "❌ *Cart Cleared.* \nReply any message to start a new order." });
                }
                return sock.sendMessage(sender, { text: "⚠️ Please reply *1* to Proceed to Checkout, or *2* to Clear Cart." });
            }

            // NAME
            if (user.step === "NAME") {
                if (!text || text.length < 2) return sock.sendMessage(sender, { text: "⚠️ *Please enter a valid name.*" });
                user.name = text;
                user.step = "PHONE";
                return sock.sendMessage(sender, { text: `Nice to meet you, *${user.name}*! 👋\n\n📞 *Enter your 10-digit Mobile Number:*\n\n_Example: 9876543210_` });
            }

            // PHONE - validate and normalize
            if (user.step === "PHONE") {
                const cleaned = text.replace(/\D/g, '').slice(-10);
                if (cleaned.length < 10) {
                    return sock.sendMessage(sender, { text: "⚠️ *Invalid Number!* Please enter a valid 10-digit mobile number.\n\n_Example: 9876543210_" });
                }
                user.phone = cleaned;
                user.step = "ADDRESS_TEXT";
                return sock.sendMessage(sender, { text: `Got it, *${user.name}*! 👍\n\n🏠 *Please provide your full Delivery Address:*\n\n_Include House No, Building Name, and nearby Landmark._` });
            }

            // ADDRESS_TEXT
            if (user.step === "ADDRESS_TEXT") {
                if (!text || text.length < 5) {
                    return sock.sendMessage(sender, { text: "⚠️ *Address too short!* \nPlease provide a more detailed address." });
                }
                user.address = text;
                user.step = "LOCATION";
                return sock.sendMessage(sender, { text: `Almost there, *${user.name}*! 📍\n\n*FINAL STEP! Share your Current Location:*\n\nTo help our rider reach you faster, please share your *Current Location* on WhatsApp.\n\n_Tap 📎 → Location → Send Current Location_` });
            }

            // LOCATION
            if (user.step === "LOCATION") {
                const locationMsg = msg.message?.locationMessage || msg.message?.liveLocationMessage;
                if (!locationMsg) {
                    return sock.sendMessage(sender, { text: "📍 Please send your *Current Location* only.\n\nTap 📎 → Location → Send Current Location" });
                }
                const lat = locationMsg.degreesLatitude;
                const lng = locationMsg.degreesLongitude;
                user.location = { lat, lng };
                user.locationLink = `https://www.google.com/maps?q=${lat},${lng}`;

                // Calculate Distance & Delivery Charge
                const settings = await getData("settings/Delivery");
                
                // SHOP COORDINATES (User provided)
                const outletCoordsMap = {
                    'pizza': { lat: 25.887944, lng: 85.026194 },
                    'cake': { lat: 25.887472, lng: 85.026861 }
                };
                const primaryOutlet = user.outlet || 'pizza';
                const outletCoords = settings?.coords || outletCoordsMap[primaryOutlet] || outletCoordsMap['pizza'];
                
                const slabs = settings?.slabs || [
                    { km: 2, fee: 20 },
                    { km: 5, fee: 40 },
                    { km: 8, fee: 60 }
                ];

                const distance = calculateDistance(lat, lng, outletCoords.lat, outletCoords.lng);
                const deliveryFee = getFeeFromSlabs(distance, slabs);

                user.distance = distance.toFixed(2);
                user.deliveryFee = deliveryFee;

                // Calculate cart subtotal
                const { lines, subtotal } = formatCartSummary(user.cart);
                const grandTotal = subtotal + deliveryFee;

                user.step = "ORDER_CONFIRM_PRE_PAY";

                let summary = `🧾 *YOUR FULL INVOICE*\n`;
                summary += `\n`;
                summary += `📦 *ITEMS:*\n`;
                summary += lines;
                summary += `\n`;
                summary += `💰 *Subtotal:* ₹${subtotal}\n`;
                summary += `🚚 *Delivery:* ₹${deliveryFee} (${user.distance} km)\n`;
                summary += ``;
                summary += `💵 *GRAND TOTAL: ₹${grandTotal}*\n`;
                summary += `\n`;
                summary += `👤 *NAME:* ${user.name}\n`;
                summary += `🏠 *ADDRESS:* ${user.address}\n\n`;
                summary += `1️⃣  *Confirm Order* ✅\n`;
                summary += `2️⃣  *Cancel Order* ❌\n\n`;
                summary += `_Please review all details carefully!_`;

                return sock.sendMessage(sender, { text: summary });
            }

            // ORDER_CONFIRM_PRE_PAY
            if (user.step === "ORDER_CONFIRM_PRE_PAY") {
                if (text === "2") {
                    // NOTIFY ADMIN OF ABANDONED CART
                    const { subtotal } = formatCartSummary(user.cart);
                    const abandonedData = {
                        customerName: user.name,
                        phone: user.phone,
                        address: user.address,
                        total: subtotal + (user.deliveryFee || 0),
                        items: user.cart,
                        outlet: user.outlet || 'pizza',
                        type: "Online"
                    };
                    await notifyAdmin(sock, 'N/A', abandonedData, 'ABANDONED').catch(e => console.error("Admin abandoned notify error:", e));

                    // SAVE TO DATABASE
                    await pushData('lostSales', {
                        ...abandonedData,
                        cancelledAt: Date.now(),
                        sourceStep: "Review Invoice"
                    }, abandonedData.outlet);

                    sessions[sender] = { step: "START", current: {}, cart: [] };
                    return sock.sendMessage(sender, { text: "❌ *Order Cancelled.* \nReply any message to start a new order." });
                }
                if (text === "1") {
                    let payMsg = `💳 *SELECT PAYMENT METHOD*\n`;
                    payMsg += ``;
                    payMsg += `1️⃣  *Cash on Delivery*\n`;
                    payMsg += `2️⃣  *UPI / Online* (Pay on Delivery)\n`;
                    payMsg += `3️⃣  *Any / Flexible*\n\n`;
                    payMsg += `_Please reply with 1, 2 or 3_`;

                    user.step = "CHOOSE_PAYMENT";
                    return sock.sendMessage(sender, { text: payMsg });
                }
                return sock.sendMessage(sender, { text: "⚠️ Please reply with *1* to Confirm or *2* to Cancel." });
            }

            // CHOOSE_PAYMENT -> FINAL ORDER PLACEMENT
            if (user.step === "CHOOSE_PAYMENT") {
                let payMethod = "";
                if (text === "1") payMethod = "Cash";
                else if (text === "2") payMethod = "UPI";
                else if (text === "3") payMethod = "Cash/UPI";
                else {
                    return sock.sendMessage(sender, { text: "⚠️ *Invalid Selection.* Please select your payment method:\n\n1️⃣ Cash\n2️⃣ UPI\n3️⃣ Any/Flexible" });
                }

                user.paymentMethod = payMethod;
                user.step = "CONFIRM";
                // Fallthrough to CONFIRM logic below
            }

            // CONFIRM
            if (user.step === "CONFIRM") {
                // Determine primary outlet based on majority items
                const outletCounts = {};
                user.cart.forEach(i => {
                    const o = i.outlet || 'pizza';
                    outletCounts[o] = (outletCounts[o] || 0) + 1;
                });
                const primaryOutlet = Object.entries(outletCounts).length > 0
                    ? Object.entries(outletCounts).sort((a, b) => b[1] - a[1])[0][0]
                    : (user.outlet || 'pizza');

                const orderId = await generateOrderId(primaryOutlet);
                const { subtotal } = formatCartSummary(user.cart);
                const grandTotal = subtotal + user.deliveryFee;

                // Build items array for Firebase
                const orderItems = user.cart.map(item => ({
                    name: item.name,
                    size: item.size,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    addons: item.addons.length > 0 ? item.addons : null,
                    lineTotal: item.total * item.quantity
                }));

                // (outletCounts and primaryOutlet already calculated above)

                await setData(`orders/${orderId}`, {
                    orderId,
                    outlet: primaryOutlet,
                    customerName: user.name,
                    whatsappNumber: sender.split('@')[0],
                    phone: user.phone,
                    address: user.address,
                    locationLink: user.locationLink || null,
                    lat: user.location?.lat || null,
                    lng: user.location?.lng || null,
                    itemTotal: subtotal,
                    deliveryFee: user.deliveryFee || 0,
                    distance: user.distance || 0,
                    total: grandTotal,
                    status: "Placed",
                    paymentMethod: user.paymentMethod || "Cash",
                    createdAt: new Date().toISOString(),
                    items: orderItems
                }, primaryOutlet);

                // NOTIFY ADMIN
                const orderData = {
                    orderId,
                    outlet: primaryOutlet,
                    customerName: user.name,
                    phone: user.phone,
                    address: user.address,
                    total: grandTotal,
                    items: orderItems,
                    paymentMethod: user.paymentMethod,
                    type: "Online"
                };
                await notifyAdmin(sock, orderId, orderData, 'NEW').catch(e => console.error("Admin notification failed:", e));

                const storeData = await getData("settings/Store") || {};
                const delSettings = await getData("settings/Delivery") || {};
                const adminPhone = delSettings.notifyPhone || storeData.developerPhone || "999";
                const shopName = storeData.storeName || "Roshani Pizza & Cake";

                let successMsg = `🎉 *ORDER PLACED SUCCESSFULLY, ${user.name.toUpperCase()}!* 🎉\n`;
                successMsg += ``;
                successMsg += `🆔 *Order ID:* #${orderId.slice(-5)}\n`;
                successMsg += `🏪 *Shop:* ${shopName}\n`;
                successMsg += `📞 *Admin:* ${adminPhone}\n`;
                successMsg += `\n`;
                successMsg += `_${getFunnyFoodJoke()}_\n\n`;
                successMsg += `*Please wait for a while as the admin is confirming your order.* ⏳\n\n`;
                successMsg += `Thank you for choosing us! 🍕🎂`;

                await sock.sendMessage(sender, { text: successMsg });

                delete sessions[sender];
            }

            // UNIVERSAL FALLBACK - If we reached here without returning, the input was unrecognized for the current step
            return sendGreeting(sock, sender, user);
        } catch (error) {
            console.error("Message Handler Error:", error);
            await notifyDeveloper(sock, error.message);
        }
    });

}

// =============================
// CART VIEW HELPER
// =============================
async function sendCartView(sock, sender, user) {
    const { lines, subtotal } = formatCartSummary(user.cart);

    let msg = `🧾 *YOUR ORDER SUMMARY*\n`;
    msg += `\n`;
    msg += lines;
    msg += ``;
    msg += `💰 *Subtotal:* ₹${subtotal}\n`;
    msg += `🚚 _Shipping calculated at checkout_\n`;
    msg += `\n`;
    msg += `1️⃣  *Proceed to Checkout* 🚀\n`;
    msg += `2️⃣  *Clear Cart* 🗑️\n\n`;
    msg += `_Reply with a number_`;

    user.step = "CART_VIEW";
    return sock.sendMessage(sender, { text: msg });
}

startBot();

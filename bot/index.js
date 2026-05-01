/**
 * ROSHANI ERP | WHATSAPP BOT CORE v3.2
 * Integrated with Advanced Admin Analytics & Multi-Outlet Sequencing
 */

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { getData, setData, updateData, db, pushData } = require('./firebase');

// --- GLOBAL STATE ---
const sessions = {};
const processedStatus = {};
const processedOTP = {};
let reportInterval = null;
let dailyReportSent = false;
let weeklyReportSent = false;
let monthlyReportSent = false;

const SESSION_TTL = 30 * 60 * 1000;
const STATUS_TTL = 24 * 60 * 60 * 1000;

// =============================
// 1. HELPERS & UTILS
// =============================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatJid(phone) {
    if (!phone) return null;
    let clean = String(phone).replace(/\D/g, '');
    if (clean.length === 10) clean = '91' + clean;
    return (clean.length >= 10) ? (clean + "@s.whatsapp.net") : null;
}

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

function getFeeFromSlabs(distance, slabs) {
    if (!slabs || slabs.length === 0) return 0;
    for (const slab of slabs) {
        if (distance <= slab.km) return slab.fee;
    }
    return slabs[slabs.length - 1].fee;
}

function parseTime(timeStr) {
    if (!timeStr) return 0;
    const cleanStr = String(timeStr).trim().toUpperCase();
    const isPM = cleanStr.includes('PM');
    const isAM = cleanStr.includes('AM');
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
    if (!openTime || !closeTime) return true;

    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(now);
    const h = parseInt(parts.find(p => p.type === 'hour').value);
    const m = parseInt(parts.find(p => p.type === 'minute').value);
    const currentTime = h * 60 + m;

    const start = parseTime(openTime);
    const end = parseTime(closeTime);

    if (end < start) { // Overnight logic
        return currentTime >= start || currentTime <= end;
    }
    return currentTime >= start && currentTime <= end;
}

// =============================
// 2. ORDER & NOTIFICATION CORE
// =============================

async function generateOrderId(outlet = 'pizza') {
    const today = new Date();
    const y = today.getFullYear();
    const m = (today.getMonth() + 1).toString().padStart(2, '0');
    const d = today.getDate().toString().padStart(2, '0');
    const dateStr = `${y}${m}${d}`;

    const seqRef = db.ref(`${outlet}/metadata/orderSequence/${dateStr}`);
    const result = await seqRef.transaction((current) => (current || 0) + 1);

    const seqNum = result.snapshot.val() || 1;
    return `${dateStr}-${seqNum.toString().padStart(4, '0')}`;
}

async function sendImage(sock, to, image, text) {
    if (!image) {
        await sock.sendMessage(to, { text });
        return;
    }
    try {
        let payload;
        if (typeof image === 'string' && image.startsWith('data:image')) {
            const base64Data = image.split(',')[1];
            payload = { image: Buffer.from(base64Data, 'base64'), caption: text };
        } else {
            payload = { image: { url: image }, caption: text };
        }
        await sock.sendMessage(to, payload);
    } catch (err) {
        console.error("Image Send Error:", err);
        await sock.sendMessage(to, { text });
    }
}

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
    } catch (err) { console.error("Rider Lookup Error:", err); }
    return null;
}

async function addInAppNotification(uid, title, body, type = 'info', icon = 'bell', outlet = 'pizza') {
    if (!uid) return;
    try {
        const notifId = "NOTIF" + Date.now();
        await setData(`riders/${uid}/notifications/${notifId}`, {
            id: notifId, title, body, type, icon, timestamp: Date.now(), read: false
        }, outlet);
    } catch (err) { console.error("Notification Error:", err); }
}

function formatCartSummary(cart) {
    if (!cart || cart.length === 0) return { lines: '_Your cart is empty_', subtotal: 0 };
    let lines = '';
    let subtotal = 0;
    cart.forEach((item, i) => {
        const itemTotal = item.total; // total is already unit price * qty if pushed from QUANTITY step
        subtotal += itemTotal;
        lines += `${i + 1}. *${item.name}* (${item.size})\n`;
        if (item.addons && item.addons.length > 0) {
            lines += `   + ${item.addons.map(a => a.name).join(', ')}\n`;
        }
        lines += `   Qty: ${item.quantity} x ₹${item.unitPrice + (item.addons?.reduce((s,a)=>s+a.price,0)||0)} = ₹${itemTotal}\n\n`;
    });
    return { lines, subtotal };
}

function formatOrderInvoice(orderId, order) {
    let itemsText = "";
    (order.items || []).forEach((item) => {
        itemsText += `• *${item.name}* (${item.size}) x${item.quantity} - ₹${item.lineTotal || item.total}\n`;
        if (item.addons && item.addons.length > 0) {
            itemsText += `  _Addons: ${item.addons.map(a => a.name).join(", ")}_\n`;
        }
    });
    const displayId = orderId ? orderId.slice(-5) : "N/A";
    let msg = `🧾 *ORDER SUMMARY*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🆔 *Order ID:* #${displayId}\n`;
    msg += `👤 *Customer:* ${order.customerName || "Guest"}\n`;
    msg += `📍 *Type:* ${order.type || "Online"}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📦 *ITEMS:*\n${itemsText}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💰 *Subtotal:* ₹${order.subtotal || order.itemTotal || 0}\n`;
    if (order.deliveryFee) msg += `🚚 *Shipping:* ₹${order.deliveryFee}\n`;
    msg += `💵 *TOTAL AMOUNT: ₹${order.total || 0}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    return msg;
}

function getFunnyFoodJoke() {
    const jokes = [
        "Why did the pizza go to the doctor? It was feeling a bit 'cheesy'! 🍕",
        "What's a pizza's favorite movie? 'Slice of life'! 🎬",
        "What do you call a fake pizza? A 'pepper-phoney'! 🍕",
        "How do you fix a broken pizza? With tomato paste! 🍅",
        "Why did the baker go to jail? He was caught 'kneading' the dough too much! 🍞",
        "What's a pizza's favorite song? 'Slice, Slice, Baby'! 🎵",
        "Why did the pizza delivery guy get a promotion? He always 'delivered' on time! 🚲",
        "What do you call a sleepy pizza? A 'doze-za'! 😴",
        "Why did the tomato turn red? Because it saw the pizza dressing! 🍅",
        "What's the best way to eat pizza? With your mouth! 😋"
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
}

function getFoodFunnyProgress(status, name = "") {
    const bars = {
        "Confirmed": "✅⬜⬜⬜⬜",
        "Preparing": "✅👨‍🍳⬜⬜⬜",
        "Cooked": "✅👨‍🍳🔥⬜⬜",
        "Out for Delivery": "✅👨‍🍳🔥📦🚀",
        "Delivered": "✅👨‍🍳🔥📦🍕"
    };
    const bar = bars[status] || "⬜⬜⬜⬜⬜";
    return `\n*Progress:* [ ${bar} ]\n`;
}

// =============================
// 3. CORE BOT LOGIC (SOCKET WRAPPER)
// =============================

async function sendCategories(sock, sender, user) {
    const outlet = user.outlet || 'pizza';
    const categories = await getData('categories', outlet);
    if (!categories) return sock.sendMessage(sender, { text: "❌ No categories available right now." });

    user.categoryList = Object.entries(categories).map(([id, val]) => ({ id, ...val }));
    let msg = `🍽️ *SELECT CATEGORY - ${outlet.toUpperCase()}*\n\n`;
    user.categoryList.forEach((c, i) => { msg += `${i + 1}️⃣  ${c.name}\n`; });
    msg += `\n0️⃣  *Back to Main Menu*`;
    
    user.step = "CATEGORY";
    const banner = (await getData("settings/Store", outlet))?.bannerImage;
    await sendImage(sock, sender, banner, msg);
}

async function sendCartView(sock, sender, user) {
    const { lines, subtotal } = formatCartSummary(user.cart);
    let msg = `🛒 *YOUR CART SUMMARY*\n\n${lines}`;
    msg += `💰 *Subtotal: ₹${subtotal}*\n\n`;
    msg += `1️⃣  *Proceed to Checkout* 🚀\n`;
    msg += `2️⃣  *Clear Cart* 🗑️\n\n`;
    msg += `_Reply with 1 or 2_`;
    user.step = "CART_VIEW";
    return sock.sendMessage(sender, { text: msg });
}

async function notifyAdmin(sock, orderId, order, type = 'NEW') {
    try {
        const outlet = order.outlet || 'pizza';
        const settings = await getData("settings/Delivery", outlet) || {};
        const adminJid = formatJid(settings.notifyPhone || settings.developerPhone);
        if (!adminJid) return;

        let itemsText = (order.items || []).map(i => `• ${i.name} (${i.size}) x${i.quantity}`).join('\n');
        let adminMsg = type === 'NEW' ? `🔔 *NEW ORDER RECEIVED!* 🔔\n` : `📦 *ORDER UPDATE* 📦\n`;
        adminMsg += `\n🆔 ID: #${orderId.slice(-5)}\n👤 Customer: ${order.customerName}\n📞 Phone: ${order.phone}\n📍 Address: ${order.address}\n\n📦 Items:\n${itemsText}\n\n💰 Total: ₹${order.total}\n💳 Method: ${order.paymentMethod}`;
        
        await sock.sendMessage(adminJid, { text: adminMsg });
    } catch (err) { console.error("Admin Notify Error:", err); }
}

async function handleOrderStatusUpdate(sock, id, order, isNew = false) {
    try {
        const jid = formatJid(order.whatsappNumber || order.phone);
        if (!jid) return;

        if (!processedStatus[id] || processedStatus[id].status !== order.status || isNew) {
            processedStatus[id] = { status: order.status, timestamp: Date.now() };

            const botSettings = await getData("settings/Bot", order.outlet) || {};
            let msg = "";
            let img = null;

            if (order.status === "Confirmed") {
                msg = `✅ *ORDER CONFIRMED!* #${id.slice(-5)}\n\n${formatOrderInvoice(id, order)}\nYour order is being prepared with love! ❤️\n${getFoodFunnyProgress("Confirmed")}`;
                img = botSettings.imgConfirmed;
            } else if (order.status === "Preparing") {
                msg = `👨‍🍳 *ORDER UPDATED!* #${id.slice(-5)}\n━━━━━━━━━━━━━━━━━━━━\nYour order is now **Preparing** in our kitchen! 👨‍🍳\n\nIt won't be long now! 🍕\n${getFoodFunnyProgress("Preparing")}`;
                img = botSettings.imgPreparing;
            } else if (order.status === "Cooked" || order.status === "Ready") {
                msg = `🔥 *FOOD READY & PACKED!* #${id.slice(-5)}\n━━━━━━━━━━━━━━━━━━━━\nYour delicious order is ready! 🚀\n\nIt's waiting for the rider to pick it up. 🛵\n${getFoodFunnyProgress("Cooked")}`;
                img = botSettings.imgCooked;
                
                if (order.assignedRider) {
                    await notifyRiderPickup(sock, order, order.assignedRider);
                }
            } else if (order.status === "Out for Delivery") {
                let riderInfoText = "";
                if (order.assignedRider) {
                    const rider = await getRiderByEmail(order.assignedRider, order.outlet || 'pizza');
                    if (rider) {
                        riderInfoText = `\n📞 *Rider:* ${rider.phone || ""} (${rider.name || "Ramesh"})`;
                    }
                }
                msg = `🛵 *OUT FOR DELIVERY!* #${id.slice(-5)}\n━━━━━━━━━━━━━━━━━━━━\nOur rider is on the way to your location! 🚀\n\nPlease keep ₹${order.total} ready.${riderInfoText}\n${getFoodFunnyProgress("Out for Delivery")}`;
                img = botSettings.imgOut;
            } else if (order.status === "Delivered") {
                msg = `✅ *ORDER DELIVERED SUCCESSFULLY!* 🍕\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🆔 *Order ID:* #${id.slice(-5)}\n🤝 *Payment:* ${order.paymentMethod}\n💵 *Total Paid:* ₹${order.total}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n*Thank you for choosing Roshani!* ❤️\n\n${getFunnyFoodJoke()}`;
                img = botSettings.imgDelivered;
            }

if (msg) {
                await sendImage(sock, jid, img, msg);
                // Also send location to customer if out for delivery
                if (order.status === "Out for Delivery" && order.lat && order.lng) {
                    const locMsg = `📍 View delivery location: https://maps.google.com/?q=${order.lat},${order.lng}`;
                    await sock.sendMessage(jid, { text: locMsg });
                }
            }
        }
    } catch (err) { console.error("Status Update Error:", err); }
}

// =============================
// 4A. DAILY & MONTHLY REPORT FUNCTIONS
// =============================

async function sendDailyReport(sock) {
    try {
        const outlets = ['pizza', 'cake'];
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        
        let totalOrders = 0;
        let totalRevenue = 0;
        let reportDetails = "";
        
        for (const outlet of outlets) {
            const orders = await getData(`${outlet}/orders`);
            if (!orders) continue;
            
            let outletOrders = 0;
            let outletRevenue = 0;
            
            Object.values(orders).forEach(order => {
                const orderTime = order.createdAt ? new Date(order.createdAt).getTime() : 0;
                if (orderTime >= startOfDay) {
                    outletOrders++;
                    outletRevenue += parseFloat(order.total || 0);
                }
            });
            
            if (outletOrders > 0) {
                reportDetails += `\n🍕 *${outlet.toUpperCase()} OUTLET:*\n`;
                reportDetails += `   📦 Orders: ${outletOrders}\n`;
                reportDetails += `   💰 Revenue: ₹${outletRevenue.toLocaleString()}\n`;
            }
            
            totalOrders += outletOrders;
            totalRevenue += outletRevenue;
        }
        
        const adminJid = formatJid("919876543210"); // Configure in settings
        if (!adminJid) return;
        
        const msg = `📊 *DAILY SALES REPORT* 📊\n\n` +
            `📅 Date: ${now.toLocaleDateString('en-IN')}\n\n` +
            reportDetails + 
            `\n\n💵 *TOTAL:* ₹${totalRevenue.toLocaleString()}\n` +
            `📦 *TOTAL ORDERS:* ${totalOrders}\n\n` +
            `_Sent automatically by Roshani Bot_`;
        
        await sock.sendMessage(adminJid, { text: msg });
        console.log("📊 Daily report sent");
    } catch (err) { console.error("Daily Report Error:", err); }
}

async function sendMonthlyReport(sock) {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        
        let totalOrders = 0;
        let totalRevenue = 0;
        let reportDetails = "";
        
        const outlets = ['pizza', 'cake'];
        for (const outlet of outlets) {
            const orders = await getData(`${outlet}/orders`);
            if (!orders) continue;
            
            let outletOrders = 0;
            let outletRevenue = 0;
            
            Object.values(orders).forEach(order => {
                const orderTime = order.createdAt ? new Date(order.createdAt).getTime() : 0;
                if (orderTime >= startOfMonth) {
                    outletOrders++;
                    outletRevenue += parseFloat(order.total || 0);
                }
            });
            
            if (outletOrders > 0) {
                reportDetails += `\n🎂 *${outlet.toUpperCase()} OUTLET:*\n`;
                reportDetails += `   📦 Orders: ${outletOrders}\n`;
                reportDetails += `   💰 Revenue: ₹${outletRevenue.toLocaleString()}\n`;
            }
            
            totalOrders += outletOrders;
            totalRevenue += outletRevenue;
        }
        
        const devJid = formatJid("919876543210"); // Developer number
        if (!devJid) return;
        
        const msg = `📈 *MONTHLY SALES REPORT* 📈\n\n` +
            `📅 Month: ${now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}\n\n` +
            reportDetails + 
            `\n\n💵 *MONTHLY TOTAL:* ₹${totalRevenue.toLocaleString()}\n` +
            `📦 *TOTAL ORDERS:* ${totalOrders}\n\n` +
            `_Sent automatically by Roshani Bot_`;
        
        await sock.sendMessage(devJid, { text: msg });
        console.log("📈 Monthly report sent");
    } catch (err) { console.error("Monthly Report Error:", err); }
}

async function sendWeeklyReport(sock) {
    try {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - 7);
        const weekStartTime = startOfWeek.getTime();
        
        let totalOrders = 0;
        let totalRevenue = 0;
        let reportDetails = "";
        
        const outlets = ['pizza', 'cake'];
        for (const outlet of outlets) {
            const orders = await getData(`${outlet}/orders`);
            if (!orders) continue;
            
            let outletOrders = 0;
            let outletRevenue = 0;
            
            Object.values(orders).forEach(order => {
                const orderTime = order.createdAt ? new Date(order.createdAt).getTime() : 0;
                if (orderTime >= weekStartTime) {
                    outletOrders++;
                    outletRevenue += parseFloat(order.total || 0);
                }
            });
            
            if (outletOrders > 0) {
                reportDetails += `\n🍕 *${outlet.toUpperCase()} OUTLET:*\n`;
                reportDetails += `   📦 Orders: ${outletOrders}\n`;
                reportDetails += `   💰 Revenue: ₹${outletRevenue.toLocaleString()}\n`;
            }
            
            totalOrders += outletOrders;
            totalRevenue += outletRevenue;
        }
        
        // Send to both Admin and Developer
        const adminJid = formatJid("919876543210");
        const devJid = formatJid("919876543210"); // Same for now, can use different numbers
        
        const msg = `📊 *WEEKLY SALES REPORT* 📊\n\n` +
            `📅 Week: ${startOfWeek.toLocaleDateString('en-IN')} - ${now.toLocaleDateString('en-IN')}\n\n` +
            reportDetails + 
            `\n\n💵 *WEEKLY TOTAL:* ₹${totalRevenue.toLocaleString()}\n` +
            `📦 *TOTAL ORDERS:* ${totalOrders}\n\n` +
            `_Sent automatically by Roshani Bot_`;
        
        if (adminJid) await sock.sendMessage(adminJid, { text: msg });
        if (devJid && devJid !== adminJid) await sock.sendMessage(devJid, { text: msg });
        console.log("📊 Weekly report sent");
    } catch (err) { console.error("Weekly Report Error:", err); }
}

async function notifyRiderPickup(sock, order, riderEmail) {
    try {
        const rider = await getRiderByEmail(riderEmail, order.outlet || 'pizza');
        if (!rider || !rider.phone) return;
        
        const riderJid = formatJid(rider.phone);
        
        let itemsText = (order.items || []).map(i => `• ${i.name} (${i.size}) x${i.quantity}`).join('\n');
        
        const locationMsg = order.lat && order.lng ? 
            `\n📍 *Location:* https://maps.google.com/?q=${order.lat},${order.lng}` : 
            `\n📍 *Address:* ${order.address}`;
        
        const msg = `🍕 *NEW PICKUP ORDER* 🍕\n\n` +
            `🆔 Order: #${order.orderId?.slice(-5) || 'N/A'}\n` +
            `👤 Customer: ${order.customerName}\n` +
            `📞 Phone: ${order.phone}\n` +
            `${locationMsg}\n\n` +
            `📦 *ITEMS:*\n${itemsText}\n\n` +
            `💰 *Total to Collect:* ₹${order.total}\n` +
            `💳 *Payment:* ${order.paymentMethod}`;
        
        await sock.sendMessage(riderJid, { text: msg });
    } catch (err) { console.error("Rider Pickup Notify Error:", err); }
}

// =============================
// 4. MAIN START FUNCTION
// =============================

async function startBot() {
    console.log("🚀 Starting Roshani ERP WhatsApp Bot...");
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ['Roshani ERP', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    // Heartbeat & Cleanup & Report Scheduling
    if (reportInterval) clearInterval(reportInterval);
    reportInterval = setInterval(async () => {
        cleanupSessions();
        updateData('bot/status', { lastSeen: Date.now(), status: 'Online' }).catch(() => {});
        
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        
        // Daily Report at 8:00 PM (20:00) - Skip Sundays
        if (hour === 20 && minute === 0 && !dailyReportSent && now.getDay() !== 0) {
            await sendDailyReport(sock);
            dailyReportSent = true;
        }
        
        // Weekly Report every Sunday at 8:00 PM
        if (now.getDay() === 0 && hour === 20 && minute === 0 && !weeklyReportSent) {
            await sendWeeklyReport(sock);
            weeklyReportSent = true;
        }
        
        // Monthly Report on 1st of month at 8:00 AM
        if (now.getDate() === 1 && hour === 8 && minute === 0 && !monthlyReportSent) {
            await sendMonthlyReport(sock);
            monthlyReportSent = true;
        }
        
        // Reset flags at midnight
        if (hour === 0 && minute === 0) {
            dailyReportSent = false;
            weeklyReportSent = false;
            monthlyReportSent = false;
        }
    }, 60000);

    // Firebase Listeners
    const outlets = ['pizza', 'cake'];
    outlets.forEach(outlet => {
        const orderRef = db.ref(`${outlet}/orders`);
        orderRef.on("child_changed", (snap) => {
            const order = snap.val();
            if (order) handleOrderStatusUpdate(sock, snap.key, order);
        });
        orderRef.on("child_added", (snap) => {
            const order = snap.val();
            // Only handle "new" orders if bot has been running for a few seconds
            if (order && !processedStatus[snap.key]) {
                handleOrderStatusUpdate(sock, snap.key, order, true);
            }
        });
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'open') console.log("✅ BOT IS ONLINE");
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) setTimeout(startBot, 5000);
            else console.log("❌ Logged out. Delete session folder and restart.");
        }
    });

    // =============================
    // 5. MESSAGE HANDLER (INTERNAL)
    // =============================
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const sender = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
            const pushName = msg.pushName || "";

            if (!sessions[sender]) {
                sessions[sender] = { step: "START", current: {}, cart: [], pushName: pushName, msgCount: 0, lastReset: Date.now() };
            }
            const user = sessions[sender];
            user.lastActivity = Date.now();

            // --- RATE LIMITING ---
            const now = Date.now();
            if (now - user.lastReset > 60000) {
                user.msgCount = 0;
                user.lastReset = now;
            }
            user.msgCount++;
            if (user.msgCount > 10) {
                if (user.msgCount === 11) {
                    await sock.sendMessage(sender, { text: "⚠️ *Too many messages.* Please wait a minute before trying again." });
                }
                return;
            }

            if (text.toLowerCase() === "cancel" || text.toLowerCase() === "reset") {
                sessions[sender] = { step: "START", current: {}, cart: [] };
                return sock.sendMessage(sender, { text: "❌ *Order Reset.* Reply with any message to start again." });
            }

            // STATE MACHINE
            if (user.step === "START") {
                const settings = await getData("settings/Store", user.outlet || 'pizza');
                let welcome = `Hello *${pushName}*! 👋\n`;
                welcome += `✨ *WELCOME TO ROSHANI PIZZA & CAKE* 🍕🎂\n`;
                welcome += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                welcome += `Delicious food, delivered fast to your doorstep! 🚀\n\n`;
                welcome += `Please select an outlet:\n`;
                welcome += `1️⃣ *Pizza Outlet* 🍕\n`;
                welcome += `2️⃣ *Cake Outlet* 🎂\n\n`;
                welcome += `_Reply with 1 or 2 to start_`;
                
                user.step = "OUTLET";
                return await sendImage(sock, sender, settings?.bannerImage, welcome);
            }

            if (user.step === "OUTLET") {
                if (text === "1") user.outlet = "pizza";
                else if (text === "2") user.outlet = "cake";
                else return sock.sendMessage(sender, { text: "⚠️ Reply *1* for Pizza or *2* for Cake." });

                const store = await getData("settings/Store", user.outlet) || {};
                if (!isShopOpen(store.shopOpenTime, store.shopCloseTime, store.shopStatus)) {
                    return sock.sendMessage(sender, { text: `🌙 *SHOP CLOSED*\n\nHours: ${store.shopOpenTime} - ${store.shopCloseTime}\n\nSee you later! 👋` });
                }
                return sendCategories(sock, sender, user);
            }

            if (user.step === "CATEGORY") {
                if (text === "0") { user.step = "START"; return sock.sendMessage(sender, { text: "Back to menu..." }); }
                const cat = user.categoryList[parseInt(text) - 1];
                if (!cat) return sock.sendMessage(sender, { text: "⚠️ Invalid selection." });

                const dishes = await getData(`dishes`, user.outlet) || {};
                user.dishList = Object.entries(dishes)
                    .filter(([id, d]) => d.category === cat.name && d.available !== false)
                    .map(([id, d]) => ({ id, ...d }));

                if (user.dishList.length === 0) return sock.sendMessage(sender, { text: "❌ No items in this category." });

                let dMsg = `🍽️ *${cat.name.toUpperCase()}*\n\n`;
                user.dishList.forEach((d, i) => { dMsg += `${i + 1}️⃣  *${d.name}*\n💰 From ₹${d.price}\n\n`; });
                dMsg += `0️⃣  *Back*`;
                user.step = "DISH";
                return await sendImage(sock, sender, cat.image, dMsg);
            }

            if (user.step === "DISH") {
                if (text === "0") return sendCategories(sock, sender, user);
                const dish = user.dishList[parseInt(text) - 1];
                if (!dish) return sock.sendMessage(sender, { text: "⚠️ Invalid selection." });

                user.current = { dish };
                user.sizeList = Object.entries(dish.sizes || { "Regular": dish.price });
                let sMsg = `📏 *SELECT SIZE*\n\n`;
                user.sizeList.forEach(([s, p], i) => { sMsg += `${i + 1}️⃣  ${s} — ₹${p}\n`; });
                user.step = "SIZE";
                return await sendImage(sock, sender, dish.image, sMsg);
            }

            if (user.step === "SIZE") {
                const [size, price] = user.sizeList[parseInt(text) - 1] || [];
                if (!size) return sock.sendMessage(sender, { text: "⚠️ Invalid size." });

                user.current.size = size;
                user.current.unitPrice = price;
                user.current.addons = [];

                const addons = user.current.dish.addons || {};
                user.addonList = Object.entries(addons);

                if (user.addonList.length > 0) {
                    let aMsg = `🧀 *ADD-ONS*\n\n`;
                    user.addonList.forEach(([n, p], i) => { aMsg += `${i + 1}️⃣  ${n} (+₹${p})\n`; });
                    aMsg += `\n0️⃣  *Done*`;
                    user.step = "ADDONS";
                    return sock.sendMessage(sender, { text: aMsg });
                }
                user.step = "QUANTITY";
                return sock.sendMessage(sender, { text: "🔢 *HOW MANY?* (Enter 1-50):" });
            }

            if (user.step === "ADDONS") {
                if (text === "0") { user.step = "QUANTITY"; return sock.sendMessage(sender, { text: "🔢 *HOW MANY?* (Enter 1-50):" }); }
                const addon = user.addonList[parseInt(text) - 1];
                if (!addon) return sock.sendMessage(sender, { text: "⚠️ Invalid addon." });
                if (user.current.addons.some(a => a.name === addon[0])) return sock.sendMessage(sender, { text: "Already added." });
                user.current.addons.push({ name: addon[0], price: addon[1] });
                return sock.sendMessage(sender, { text: `✅ Added ${addon[0]}. Send more numbers or 0 to finish.` });
            }

            if (user.step === "QUANTITY") {
                const qty = parseInt(text);
                if (isNaN(qty) || qty < 1 || qty > 50) return sock.sendMessage(sender, { text: "⚠️ Enter 1-50." });

                const addonTotal = user.current.addons.reduce((s, a) => s + a.price, 0);
                user.cart.push({
                    name: user.current.dish.name,
                    size: user.current.size,
                    unitPrice: user.current.unitPrice,
                    addons: user.current.addons,
                    quantity: qty,
                    total: (user.current.unitPrice + addonTotal) * qty,
                    outlet: user.outlet
                });

                user.step = "ADDED_TO_CART";
                return sock.sendMessage(sender, { text: `✅ Added!\n\n1️⃣ Add more\n2️⃣ View Cart / Checkout` });
            }

            if (user.step === "ADDED_TO_CART") {
                if (text === "1") return sendCategories(sock, sender, user);
                if (text === "2") return sendCartView(sock, sender, user);
            }

            if (user.step === "CART_VIEW") {
                if (text === "1") { user.step = "NAME"; return sock.sendMessage(sender, { text: "👤 *Your Name?*" }); }
                if (text === "2") { sessions[sender] = { step: "START", current: {}, cart: [] }; return sock.sendMessage(sender, { text: "🗑️ Cart cleared." }); }
            }

            if (user.step === "NAME") {
                user.name = text; user.step = "PHONE";
                return sock.sendMessage(sender, { text: "📞 *Mobile Number?*" });
            }

            if (user.step === "PHONE") {
                user.phone = text.replace(/\D/g, '').slice(-10);
                user.step = "ADDRESS";
                return sock.sendMessage(sender, { text: "🏠 *Delivery Address?*" });
            }

            if (user.step === "ADDRESS") {
                user.address = text; user.step = "LOCATION";
                return sock.sendMessage(sender, { text: "📍 *Share your Location* (Paperclip -> Location)" });
            }

            if (user.step === "LOCATION") {
                const loc = msg.message?.locationMessage;
                if (!loc) return sock.sendMessage(sender, { text: "📍 Please share location." });

                user.location = { lat: loc.degreesLatitude, lng: loc.degreesLongitude };
                 const [delSettings, storeSettings] = await Promise.all([
                     getData("settings/Delivery", user.outlet) || {},
                     getData("settings/Store", user.outlet) || {}
                 ]);
                
                const outletCoords = {
                    lat: parseFloat(storeSettings?.lat || (user.outlet === 'cake' ? 25.887472 : 25.887944)),
                    lng: parseFloat(storeSettings?.lng || (user.outlet === 'cake' ? 85.026861 : 85.026194))
                };
                
                 const dist = calculateDistance(user.location.lat, user.location.lng, outletCoords.lat, outletCoords.lng);
                 const fee = getFeeFromSlabs(dist, delSettings.slabs || []);
                
                user.deliveryFee = fee;
                const { lines, subtotal } = formatCartSummary(user.cart);
                user.step = "CONFIRM_PAY";

                let sum = `🧾 *INVOICE*\n\n${lines}\n💰 Subtotal: ₹${subtotal}\n🚚 Delivery: ₹${fee}\n💵 *Total: ₹${subtotal + fee}*\n\n1️⃣ Confirm\n2️⃣ Cancel`;
                return sock.sendMessage(sender, { text: sum });
            }

            if (user.step === "CONFIRM_PAY") {
                if (text === "2") { delete sessions[sender]; return sock.sendMessage(sender, { text: "❌ Cancelled." }); }
                if (text === "1") {
                    user.step = "PLACE_ORDER";
                    return sock.sendMessage(sender, { text: "💳 *Payment Method?*\n\n1️⃣ Cash\n2️⃣ UPI" });
                }
            }

            if (user.step === "PLACE_ORDER") {
                const method = text === "2" ? "UPI" : "Cash";
                const orderId = await generateOrderId(user.outlet);
                const { subtotal } = formatCartSummary(user.cart);

                const finalOrder = {
                    orderId, outlet: user.outlet, 
                    customerName: escapeHtml(user.name),
                    phone: user.phone, 
                    address: escapeHtml(user.address),
                    lat: user.location.lat, lng: user.location.lng,
                    subtotal, deliveryFee: user.deliveryFee, total: subtotal + user.deliveryFee,
                    status: "Placed", paymentMethod: method, paymentStatus: "Pending",
                    createdAt: new Date().toISOString(),
                    items: user.cart
                };

                await setData(`orders/${orderId}`, finalOrder, user.outlet);
                await notifyAdmin(sock, orderId, finalOrder, 'NEW');

                let successMsg = `🎉 *ORDER PLACED SUCCESSFULLY!* 🎉\n`;
                successMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                successMsg += `🆔 *Order ID:* #${orderId.slice(-5)}\n`;
                successMsg += `🏪 *Shop:* Roshani ${user.outlet.toUpperCase()}\n`;
                successMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                successMsg += `*Please wait while the admin confirms your order!* ⏳\n\n`;
                successMsg += `Total: ₹${finalOrder.total}`;

                await sock.sendMessage(sender, { text: successMsg });
                delete sessions[sender];
            }

        } catch (err) { console.error("Message Handler Error:", err); }
    });
}

startBot();
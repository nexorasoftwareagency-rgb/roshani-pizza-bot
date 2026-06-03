/**
 * ROSHANI ERP | WHATSAPP BOT CORE v4.0
 * Single-Outlet Instance (Pizza-Bot / Cake-Bot)
 */

// =============================
// OUTLET CONFIGURATION (UNIFIED CORE)
// =============================
const OUTLET = process.env.OUTLET || 'pizza';
const OUTLET_NAME = OUTLET === 'pizza' ? 'Roshani Pizza' : 'Roshani Cake';
const OUTLET_EMOJI = OUTLET === 'pizza' ? '🍕' : '🎂';
const OTHER_OUTLET_NAME = OUTLET === 'pizza' ? 'Roshani Cake' : 'Roshani Pizza';
const OTHER_OUTLET_EMOJI = OUTLET === 'pizza' ? '🎂' : '🍕';
const OTHER_OUTLET_NUMBER = '';
// Fixed developer number (mirrors getReportRecipients). Used by promo opt-out
// filter to recognize admin senders and let them continue ordering.
const DEVELOPER_NUMBER_FALLBACK = "9724649971";

const redis = require('redis');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const qrcode = require('qrcode-terminal');
const pino = require('pino');
const admin = require('firebase-admin');
const { getData, setData, updateData, db, pushData, getUserProfile, saveUserProfile } = require('./firebase');
const discountEngine = require('./discount-engine');

let redisClient;

// Admin JIDs cache — refreshed every 5 minutes to avoid per-message Firebase calls
let cachedAdminJids = null;
let cachedAdminJidsExpiry = 0;
const ADMIN_CACHE_TTL = 300000;
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

if (redisUrl.includes('clustercfg')) {
    // AWS ElastiCache Cluster Mode
    redisClient = redis.createCluster({
        rootNodes: [{ url: redisUrl }],
        defaults: {
            socket: {
                tls: redisUrl.startsWith('rediss://'),
                rejectUnauthorized: false // Often needed for AWS self-signed certs
            }
        }
    });
    console.log('🚀 Redis initialized in CLUSTER mode');
} else {
    // Standard Redis / Localhost
    redisClient = redis.createClient({ url: redisUrl });
    console.log('🚀 Redis initialized in STANDALONE mode');
}

redisClient.on('error', (err) => console.log('Redis Client Error', err));

// Track Redis health for degraded-mode fallbacks
let redisReady = false;

redisClient.on('ready', () => { redisReady = true; });
redisClient.on('end', () => { redisReady = false; });

redisClient.connect().then(() => {
    redisReady = true;
    console.log('✅ Connected to Redis');
}).catch(console.error);

// --- GLOBAL STATE (Migrating to Redis) ---
// We keep local variables for temporary locks if needed, but primary state moves to Redis
let reportInterval = null;
let dailyReportSent = false;
let weeklyReportSent = false;
let monthlyReportSent = false;
const startupTime = Date.now();

// Crypto/session error monitoring (for auto-healing and visibility)
let cryptoErrorCount = 0;
let reconnectAttempts = 0;
const MAX_CRYPTO_ERRORS = 500; // Triggers session reset if exceeded rapidly

const SESSION_TTL = 30 * 60; // Redis TTL is in seconds (30 mins)
const STATUS_TTL = 24 * 60 * 60; // 24 hours

// In-memory dedup fallback used when Redis is offline
const localStatusCache = new Map();
const LOCAL_CACHE_TTL = 3600000; // 1 hour

// --- REDIS HELPERS ---
async function getSession(sender) {
    try {
        const data = await redisClient.get(`session:${sender}`);
        return data ? JSON.parse(data) : null;
    } catch (e) { return null; }
}
async function saveSession(sender, data) {
    try {
        if (data) await redisClient.setEx(`session:${sender}`, SESSION_TTL, JSON.stringify(data));
        else await redisClient.del(`session:${sender}`);
    } catch (e) { }
}

async function getProcessedStatus(id) {
    try {
        if (redisReady) {
            const data = await redisClient.get(`status:${id}`);
            if (data) return JSON.parse(data);
        }
    } catch (e) { }
    return localStatusCache.get(id) || null;
}
async function saveProcessedStatus(id, data) {
    try {
        if (data) {
            localStatusCache.set(id, data);
            if (redisReady) await redisClient.setEx(`status:${id}`, STATUS_TTL, JSON.stringify(data));
        }
    } catch (e) { }
}

async function getProcessedOTP(phone) {
    try {
        const data = await redisClient.get(`otp:${phone}`);
        return data ? JSON.parse(data) : null;
    } catch (e) { return null; }
}
async function saveProcessedOTP(phone, data) {
    try {
        if (data) await redisClient.setEx(`otp:${phone}`, 300, JSON.stringify(data)); // 5 mins
    } catch (e) { }
}

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
    // Remove leading zero if present (common in Indian formats like 098...)
    if (clean.startsWith('0')) clean = clean.substring(1);
    // If it's 10 digits, it's a standard Indian mobile number without CC
    if (clean.length === 10) clean = '91' + clean;
    return (clean.length >= 10) ? (clean + "@s.whatsapp.net") : null;
}

function maskJid(jid) {
    if (!jid || !jid.includes('@')) return jid;
    const [phone, domain] = jid.split('@');
    if (phone.length <= 4) return `****@${domain}`;
    // Keep country code (first 2) and last 4
    return `${phone.substring(0, 2)}****${phone.slice(-4)}@${domain}`;
}

function maskPhone(phone) {
    if (!phone) return "N/A";
    const s = String(phone).replace(/\D/g, '');
    if (s.length <= 4) return "****";
    return `${s.substring(0, 2)}****${s.slice(-4)}`;
}

function getISTDateInfo(customDate = null) {
    // Current UTC time
    const now = customDate ? new Date(customDate) : new Date();
    // IST is UTC + 5:30
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + IST_OFFSET);

    return {
        dateStr: istTime.toISOString().split('T')[0], // YYYY-MM-DD in IST
        hour: istTime.getUTCHours(),
        minute: istTime.getUTCMinutes(),
        istObject: istTime
    };
}

function getISTDateString(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(date.getTime() + IST_OFFSET);
    return istTime.toISOString().split('T')[0];
}

async function getReportRecipients() {
    const recipients = new Set();
    const DEVELOPER_NUMBER = "9724649971"; // Fixed Developer

    try {
        // Add Fixed Developer
        const devJid = formatJid(DEVELOPER_NUMBER);
        if (devJid) recipients.add(devJid);

        // Get THIS outlet's admin only
        const storeSettings = await getData("settings/Store", OUTLET) || {};
        const deliverySettings = await getData("settings/Delivery", OUTLET) || {};

        const adminNum = storeSettings.phone || deliverySettings.reportPhone;
        if (adminNum) {
            const adminJid = formatJid(adminNum);
            if (adminJid) recipients.add(adminJid);
        }

    } catch (e) {
        console.error("[Reports] Recipient Resolution Error:", e);
    }

    // Safety fallback
    if (recipients.size === 0) recipients.add(formatJid(DEVELOPER_NUMBER));
    return Array.from(recipients);
}

async function getCachedAdminJids() {
    if (cachedAdminJids && Date.now() < cachedAdminJidsExpiry) {
        return cachedAdminJids;
    }
    cachedAdminJids = await getReportRecipients();
    cachedAdminJidsExpiry = Date.now() + ADMIN_CACHE_TTL;
    return cachedAdminJids;
}

/**
 * COMMAND LISTENER
 * Monitors the 'bot/commands' node for real-time triggers from the Admin Dashboard.
 */
function initCommandListener(sock) {
    console.log(`[Bot] Command Listener Started: Listening on 'bot/${OUTLET}/commands'...`);
    const cmdRef = db.ref(`bot/${OUTLET}/commands`);
    cmdRef.off("child_added"); // Clear previous listeners to avoid duplicates on reconnection
    cmdRef.on("child_added", async (snap) => {
        const cmd = snap.val();
        if (!cmd) return;

        console.log(`[Bot] Command Received: ${cmd.action} (Target: ${cmd.targetDate || 'N/A'})`);

        try {
            if (cmd.action === "SEND_DAILY_REPORT") {
                await sendDailyReport(sock, cmd.targetDate);
                console.log(`[Bot] Daily Report sent successfully for ${cmd.targetDate}`);
            } else if (cmd.action === "SEND_WEEKLY_REPORT") {
                await sendWeeklyReport(sock);
                console.log(`[Bot] Weekly Report sent successfully`);
            } else if (cmd.action === "SEND_MONTHLY_REPORT") {
                await sendMonthlyReport(sock);
                console.log(`[Bot] Monthly Report sent successfully`);
            } else if (cmd.action === "SEND_PROMOTION") {
                // Fire-and-forget — long-running, runs to completion or until paused
                runPromotionCampaign(sock, cmd).catch(err => {
                    console.error("[Promo] Campaign error:", err);
                });
                console.log(`[Promo] Campaign ${cmd.campaignId} dispatched`);
            }
            // Remove the command after processing
            await snap.ref.remove();
        } catch (err) {
            console.error("[Bot] Command Execution Error:", err);
        }
    });
}

function cleanupSessions() {
    // Sessions and processed status are now automatically managed by Redis TTL
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

async function appendContactInfo(text, outlet = 'pizza') {
    if (!text) return '';
    try {
        const storeSettings = await getData("settings/Store", outlet) || {};
        const deliverySettings = await getData("settings/Delivery", outlet) || {};
        const DEVELOPER_NUMBER = "9724649971";
        const adminNum = storeSettings.phone || deliverySettings.reportPhone || DEVELOPER_NUMBER;
        return `${text}\n\n━━━━━━━━━━━━━━━━━━━━\nIf you have any Doubt Contact Admin: *${adminNum}*`;
    } catch (e) {
        return text;
    }
}

async function sendImage(sock, to, image, text, outlet = 'pizza') {
    const finalMsg = await appendContactInfo(text, outlet);
    if (!image) {
        await sock.sendMessage(to, { text: finalMsg });
        return;
    }
    try {
        let payload;
        if (typeof image === 'string' && image.startsWith('data:image')) {
            const base64Data = image.split(',')[1];
            payload = { image: Buffer.from(base64Data, 'base64'), caption: finalMsg };
        } else {
            payload = { image: { url: image }, caption: finalMsg };
        }
        await sock.sendMessage(to, payload);
    } catch (err) {
        console.error("Image Send Error:", err.message || err);
        // Fallback to text ONLY if it wasn't already a text message failure
        try {
            await sock.sendMessage(to, { text: finalMsg });
        } catch (textErr) {
            console.error("Critical Send Error:", textErr.message || textErr);
        }
    }
}

async function deductInventoryStock(sock, items, outlet = 'pizza') {
    if (!items || !Array.isArray(items) || items.length === 0) return;
    try {
        const inventoryRef = db.ref(`outlets/${outlet}/inventory`);
        const snapshot = await inventoryRef.once('value');
        const inventory = snapshot.val() || {};
        const deliverySettings = await getData("settings/Delivery", outlet) || {};
        const notifyPhone = deliverySettings.notifyPhone || deliverySettings.reportPhone;

        for (const item of items) {
            const itemName = (item.name || item.item).toLowerCase();
            const invEntry = Object.entries(inventory).find(([id, data]) => data.name.toLowerCase() === itemName);

            if (invEntry) {
                const [id, data] = invEntry;
                const qty = item.quantity || 1;
                const newStock = Math.max(0, (data.stock || 0) - qty);
                const threshold = data.threshold || 0;

                await inventoryRef.child(id).update({
                    stock: newStock,
                    updatedAt: new Date().toISOString()
                });

                if (newStock <= threshold && notifyPhone) {
                    const alertMsg = `⚠️ *LOW STOCK ALERT* ⚠️\n━━━━━━━━━━━━━━━━━━━━\n` +
                        `📦 Item: *${data.name}*\n` +
                        `📉 Current Stock: *${newStock}*\n` +
                        `🚩 Threshold: *${threshold}*\n\n` +
                        `_Please refill stock from Admin Panel immediately!_`;

                    const jid = formatJid(notifyPhone);
                    if (jid) sock.sendMessage(jid, { text: alertMsg }).catch(() => {});
                }
            }
        }
    } catch (e) {
        console.error("[INVENTORY] ❌ Stock Deduction Error:", e);
    }
}

async function cleanupStaleOrders(sock) {
    try {
        const ordersRef = db.ref(`${OUTLET}/orders`);
        const snap = await ordersRef.once('value');
        if (!snap.exists()) return;

        const now = Date.now();
        const FIVE_HOURS = 5 * 60 * 60 * 1000;
        const updates = {};
        const cancelMsg = "Sorry , Hame Maaf Kijiyega, ham aapka Order Deliver nahi kar payen, Please Order Again 🙏";

        snap.forEach(child => {
            const o = child.val();
            const status = (o.status || "").toLowerCase();
            if (status === "delivered" || status === "cancelled" || status === "archived") return;

            const orderTime = o.createdAt || o.timestamp || o.assignedAt || 0;
            if (orderTime > 0 && (now - orderTime) > FIVE_HOURS) {
                updates[`${child.key}/status`] = "Cancelled";
                updates[`${child.key}/cancellationReason`] = "System Auto-Cancel: Exceeded 5 hours";
                updates[`${child.key}/cancelledAt`] = now;

                const jid = formatJid(o.phone || o.whatsappNumber);
                if (jid && sock) {
                    sock.sendMessage(jid, { text: cancelMsg }).catch(e => console.error("Auto-cancel notification failed", e));
                }
                console.log(`[Garbage Collector] Auto-cancelled stale order #${child.key}`);
            }
        });

        if (Object.keys(updates).length > 0) {
            await ordersRef.update(updates);
        }
    } catch (e) {
        console.error("[Garbage Collector] Error:", e);
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
        lines += `   Qty: ${item.quantity} x ₹${item.unitPrice + (item.addons?.reduce((s, a) => s + a.price, 0) || 0)} = ₹${itemTotal}\n\n`;
    });
    return { lines, subtotal };
}

function formatOrderInvoice(orderId, order) {
    let itemsText = "";
    (order.items || []).forEach((item) => {
        const qty = item.quantity || item.qty || 1;
        const price = item.lineTotal || item.total || (item.price * qty) || 0;
        itemsText += `• *${item.name}* (${item.size || 'Regular'}) x${qty} - ₹${price}\n`;
        if (item.addons && item.addons.length > 0) {
            const addonNames = Array.isArray(item.addons)
                ? item.addons.map(a => a.name).join(", ")
                : Object.keys(item.addons).join(", ");
            itemsText += `  _Addons: ${addonNames}_\n`;
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
    if (order.discount) msg += `🎁 *Discount Allotted:* -₹${order.discount}\n`;
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
        "Ready": "✅👨‍🍳🔥📦",
        "Out for Delivery": "✅👨‍🍳🔥📦🚀",
        "Delivered": "✅👨‍🍳🔥📦🍕"
    };
    const bar = bars[status] || "⬜⬜⬜⬜⬜";
    return `\n*Progress:* [ ${bar} ]\n`;
}

async function sendInvalidInputHelp(sock, sender, user) {
    let helpMsg = "⚠️ *Invalid Selection.* ";
    switch (user.step) {
        case "CATEGORY":
            helpMsg += "Please reply with a *Category Number* from the list above.\n\n🛒 *9* View Cart\n🏠 *0* Main Menu";
            break;
        case "DISH":
            helpMsg += "Please reply with an *Item Number* from the list above.\n\n🛒 *9* View Cart\n🔙 *0* Back to Categories";
            break;
        case "SIZE":
            helpMsg += "Please select a *Size Number* (1, 2, etc.) from the options above.";
            break;
        case "ADDONS":
            helpMsg += "Reply with an *Add-on Number* to add it, or *0* (Zero) if you are *DONE*.";
            break;
        case "QUANTITY":
            helpMsg += "Please enter a quantity between *1* and *50*.";
            break;
        case "LOCATION":
            helpMsg += "To continue, please share your *Live/Current Location* using the 📎 (Paperclip) or + button in WhatsApp and selecting 'Location'.";
            break;
        case "CONFIRM_PAY":
            helpMsg += "Please reply with *1* to Confirm Order or *2* to Cancel.";
            break;
        case "PLACE_ORDER":
            helpMsg += "Please reply with *1* for Cash or *2* for UPI.";
            break;
        case "CART_VIEW":
            helpMsg += "Please reply with *1* to Proceed to Checkout or *2* to Clear Cart.";
            break;
        case "AWAIT_COUPON":
            helpMsg += "If you have a coupon code, reply with it. Otherwise reply *0* to skip and continue.";
            break;
        case "REUSE_PROFILE":
            helpMsg += "Please reply with *1* to use your saved details or *2* to enter new ones.";
            break;
        default:
            helpMsg += "Please follow the instructions in the message above or reply *RESET* to start over.";
    }
    return sock.sendMessage(sender, { text: helpMsg });
}

// =============================
// 3. CORE BOT LOGIC (SOCKET WRAPPER)
// =============================

async function sendCategories(sock, sender, user) {
    const outlet = user.outlet || 'pizza';
    const [categories, botSettings, storeSettings] = await Promise.all([
        getData('categories', outlet),
        getData("settings/Bot", outlet).catch(() => ({})),
        getData("settings/Store", outlet).catch(() => ({}))
    ]);
    if (!categories) return sock.sendMessage(sender, { text: "❌ No categories available right now." });

    user.categoryList = Object.entries(categories).map(([id, val]) => ({ id, ...val }));

    const storeName = storeSettings.storeName || (outlet === 'pizza' ? "Roshani Pizza" : "Roshani Cake");
    const emoji = outlet === 'pizza' ? "🍕" : "🎂";
    const headerEmoji = outlet === 'pizza' ? "🔥" : "✨";

    let msg = `✨ *${storeName.toUpperCase()}* ✨\n`;
    msg += `🍽️ *SELECT CATEGORY - ${outlet.toUpperCase()}*\n\n`;

    user.categoryList.forEach((c, i) => {
        msg += `${i + 1}️⃣  ${c.name}\n`;
    });

    msg += `\n🛒 *9* View Cart\n0️⃣ *Take one step Back* 🔙\n\n`;
    msg += `_Reply with a number to browse_`;

    user.step = "CATEGORY";
    const menuImg = botSettings.menuImage || storeSettings.bannerImage;
    await sendImage(sock, sender, menuImg, msg);
}

async function sendCartView(sock, sender, user, isAdded = false) {
    if (!user.cart || user.cart.length === 0) {
        let msg = `🛒 *YOUR CART IS EMPTY*\n\n`;
        msg += `You haven't added anything to your cart yet. 🍕\n\n`;
        msg += `1️⃣  *Browse Menu* 🍽️\n`;
        msg += `🏠 *0* Main Menu`;
        user.step = "EMPTY_CART_VIEW";
        return sock.sendMessage(sender, { text: msg });
    }
    const { lines, subtotal } = formatCartSummary(user.cart);
    let msg = isAdded ? `✅ *ADDED TO CART!* 🛒\n\n` : `🛒 *YOUR CART SUMMARY*\n\n`;
    msg += lines;
    msg += `💰 *Subtotal: ₹${subtotal}*\n\n`;
    msg += `1️⃣  *Add another item* 🍕\n`;
    msg += `2️⃣  *Proceed to Checkout* 🚀\n`;
    msg += `3️⃣  *Clear Cart* 🗑️\n`;
    msg += `0️⃣  *Back* 🔙\n\n`;
    msg += `_Reply with 1, 2, 3 or 0_`;
    user.step = "CART_VIEW";
    return sock.sendMessage(sender, { text: await appendContactInfo(msg, user.outlet) });
}

async function sendFCMToAdmins(orderId, order) {
    try {
        const outlet = order.outlet || 'pizza';
        const snap = await db.ref('admins').once('value');
        const admins = snap.val();
        if (!admins) return;
        const tokens = Object.values(admins).map(a => a.fcmToken).filter(Boolean);
        if (tokens.length === 0) return;
        const unique = [...new Set(tokens)];
        const payload = {
            notification: {
                title: `🆕 New Order #${orderId.slice(-5)}`,
                body: `${order.customerName || 'Customer'} · ₹${order.total || 0} · ${outlet.toUpperCase()}`
            },
            data: { orderId, outlet, type: 'new_order' }
        };
        const results = await admin.messaging().sendEachForMulticast({ tokens: unique, ...payload });
        const failed = results.responses.filter(r => !r.success).length;
        if (failed > 0) console.warn(`[FCM] ${failed}/${unique.length} admin notifications failed`);
    } catch (e) {
        console.error('[FCM] sendFCMToAdmins error:', e.message);
    }
}

async function notifyAdmin(sock, orderId, order, type = 'NEW') {
    try {
        const outlet = order.outlet || 'pizza';
        const jids = await getCachedAdminJids();
        if (!jids || jids.length === 0) return;

        let msg = "";
        if (type === 'CANCELLED') {
            msg = `⚠️ *LOST SALE / ABANDONED* ⚠️\n━━━━━━━━━━━━━━━━━━━━\n👤 *Customer:* ${order.customerName || 'Anonymous'}\n📞 *Phone:* ${order.phone || 'N/A'}\n💰 *Potential Total:* ₹${order.total || 0}\n🏪 *Outlet:* ${outlet.toUpperCase()}\n━━━━━━━━━━━━━━━━━━━━\n_User cancelled at final checkout step._`;
        } else {
            let itemsText = (order.items || []).map(i => `• ${i.name} (${i.size}) x${i.quantity}`).join('\n');
            let adminMsg = type === 'NEW' ? `🔔 *NEW ORDER RECEIVED!* 🔔\n` : `📦 *ORDER UPDATE* 📦\n`;
            adminMsg += `\n🆔 ID: #${orderId.slice(-5)}\n👤 Customer: ${order.customerName}\n📞 Phone: ${order.phone}\n📍 Address: ${order.address}\n\n📦 Items:\n${itemsText}\n\n💰 Total: ₹${order.total || 0}\n💳 Method: ${order.paymentMethod}`;
            msg = adminMsg;
        }

        for (const jid of jids) {
            await sock.sendMessage(jid, { text: msg });
        }
    } catch (err) { console.error("Admin Notify Error:", err); }
}

async function handleOrderStatusUpdate(sock, id, order, isNew = false) {
    try {
        // FIX: Robust JID resolution for both Online and POS orders.
        // POS orders usually store the phone in 'order.phone'. 
        // Online orders store the JID in 'order.whatsappNumber'.
        let jid = null;

        // PRIORITIZE: whatsappNumber if it's a standard JID. 
        // If it's a @lid (Linked ID), we prefer formatting the phone for a standard @s.whatsapp.net JID
        const storedJid = String(order.whatsappNumber || "");
        if (storedJid.includes('@') && !storedJid.endsWith('@lid')) {
            jid = storedJid;
        } else {
            // Fallback to phone field (POS orders, incomplete profiles, or @lid cases)
            const rawPhone = order.phone || order.whatsappNumber;
            if (rawPhone && rawPhone !== "Walk-in") {
                jid = formatJid(rawPhone);
            }
        }

        if (!jid) {
            const status = (order.status || "Unknown").toUpperCase();
            const type = (order.type || order.orderType || "Walk-in");
            if (order.phone !== "Walk-in") {
                console.warn(`[BOT] ⚠️ Skipping Notification for #${id.slice(-5)} (${type}): No valid phone. Value: "${order.phone}"`);
                updateData(`bot/logs/${id}`, { error: "No valid JID", phone: order.phone, type, timestamp: Date.now() }).catch(() => { });
            }
            return;
        }

        const currentStatus = (order.status || "").trim();
        const statusLower = currentStatus.toLowerCase();
        const orderType = (order.type || order.orderType || "Online").trim();
        const typeLower = orderType.toLowerCase();
        const isDineIn = typeLower.includes("dine") || typeLower.includes("walk") || orderType === "Dine-in";

        if (isDineIn) {
            console.log(`[BOT] 🍽️ Dine-in Order Detected: #${id.slice(-5)} | Status: ${currentStatus} | Target: ${maskJid(jid)}`);
        }

        const phoneDisplay = order.phone || order.whatsappNumber || "N/A";

        // Fetch current status from Redis Cache
        const currentProcessedStatus = await getProcessedStatus(id);

        // Track OTP changes to trigger resend notifications even if status is same
        const storedOTP = order.deliveryOTP || order.otp || order.otpCode;
        const isDeliveryOtpStatus = statusLower === "out for delivery" || statusLower === "reached drop location";

        const isOtpChanged = currentProcessedStatus &&
            isDeliveryOtpStatus &&
            currentProcessedStatus.lastOtp &&
            currentProcessedStatus.lastOtp !== storedOTP;

        // Also send if it's a delivery OTP status and we have a valid OTP but no cached lastOtp but no cached lastOtp (handles restart / first time)
        const shouldSendOtpMessage = isDeliveryOtpStatus && storedOTP && !currentProcessedStatus?.lastOtp && !currentProcessedStatus?.lastOtp;

        const maskedJid = maskJid(jid);
        console.log(`[Status Update] 🔍 Processing Order #${id.slice(-5)} | Status: ${currentStatus} | OTP Changed: ${isOtpChanged} | Target: ${maskedJid}`);

        if (!currentProcessedStatus || currentProcessedStatus.status !== currentStatus || isNew || isOtpChanged || shouldSendOtpMessage) {
            const currentRider = order.riderId || order.assignedRider || "";
            const lastRider = currentProcessedStatus?.riderId || "";
            const isRiderChanged = currentRider && currentRider !== lastRider;

            await saveProcessedStatus(id, {
                status: currentStatus,
                timestamp: Date.now(),
                lastOtp: storedOTP,
                riderId: currentRider
            });

            console.log(`[Status Update] 🔔 State Updated for #${id.slice(-5)}: Status=${currentStatus}, Rider=${currentRider || 'None'}`);

            // NEW: Notify Rider on Assignment
            if (isRiderChanged) {
                console.log(`[RIDER] 🔄 Rider Change Detected for #${id.slice(-5)}: ${lastRider} -> ${currentRider}`);
                await notifyRiderAssignment(sock, id, order);
            }

            const botSettings = await getData("settings/Bot", order.outlet) || {};
            let msg = "";
            let img = null;

            if (statusLower === "placed") {
                msg = `🎉 *ORDER PLACED!* 🍕\n━━━━━━━━━━━━━━━━━━━━\n🆔 *Order ID:* #${id.slice(-5)}\n\nThank you for your order! 🙏\nWe have received it and our team is reviewing it now. ⏳\n\nYou will receive an update as soon as it's confirmed! ❤️\n${getFoodFunnyProgress("Placed")}`;
                img = botSettings.imgPlaced || botSettings.imgConfirmed;
            } else if (statusLower === "confirmed") {
                if (isDineIn && isNew) {
                    msg = `🍕 *WELCOME TO ROSHANI ${order.outlet?.toUpperCase() || 'PIZZA'}!* ✨\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nYour counter order has been *CONFIRMED*! 🎊\n\n🆔 *Order ID:* #${id.slice(-5)}\n👤 *Customer:* ${order.customerName || 'Guest'}\n${order.tableNo ? `🪑 *Table No:* ${order.tableNo}\n` : ''}━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nYour delicious meal is being prepared right now! 👨‍🍳🔥\n\n_Thank you for dining with us!_ 🙏`;
                } else {
                    msg = `✅ *ORDER CONFIRMED!* 🎊\n━━━━━━━━━━━━━━━━━━━━\n${formatOrderInvoice(id, order)}\nYour order is being prepared with love! ❤️\n${getFoodFunnyProgress("Confirmed")}`;
                }
                img = botSettings.imgConfirmed;
            } else if (statusLower === "ready" || statusLower === "packed") {
                msg = `📦 *PACKED & READY!* 🚀\n━━━━━━━━━━━━━━━━━━━━\nYour delicious order #${id.slice(-5)} is ready and packed! 🍱\n\n${isDineIn ? "It's ready to be served! 🍽️" : "Waiting for the rider to pick it up. 🛵"}\n${getFoodFunnyProgress("Ready")}`;
                img = botSettings.imgReady;

                if (!isDineIn) {
                    if (order.riderPhone) {
                        await notifyRiderPickup(sock, order);
                    } else {
                        await broadcastPickupAvailable(sock, id, order);
                    }
                }
            } else if (statusLower === "picked up" || statusLower === "out for delivery") {
                let otp = storedOTP;
                if (!otp) {
                    otp = Math.floor(1000 + Math.random() * 9000).toString();
                    await updateData(`${order.outlet}/orders/${id}`, { otp: otp, deliveryOTP: otp });
                }

                let riderInfoText = "";
                const riderId = order.riderId || order.assignedRider;
                if (riderId) {
                    const rider = (riderId.includes('@')) ? await getRiderByEmail(riderId, order.outlet || 'pizza') : { name: order.riderName, phone: order.riderPhone };
                    if (rider) {
                        riderInfoText = `\n📞 *Rider:* ${rider.name || "Delivery Partner"} (${rider.phone || ""})`;
                    }
                }

                if (isOtpChanged) {
                    msg = `🔑 *NEW DELIVERY OTP!* 🔄\n━━━━━━━━━━━━━━━━━━━━\nYour previous code is now invalid. Please use the new one below for your delivery #${id.slice(-5)}:\n\n🔑 *NEW OTP:* ${otp}${riderInfoText}\n💰 *Total:* ₹${order.total || 0}\n\n_Share this code ONLY with the rider upon arrival._`;
                } else {
                    msg = `🛵 *OUT FOR DELIVERY!* 🚀\n━━━━━━━━━━━━━━━━━━━━\nOur rider is on the way to your location! 🛵💨\n\n🆔 Order: #${id.slice(-5)}\n🔑 *OTP:* ${otp} (Share with rider only)${riderInfoText}\n💰 *Total:* ₹${order.total || 0}\n${getFoodFunnyProgress("Out for Delivery")}`;
                }
                img = botSettings.imgOut;
            } else if (statusLower === "reached drop location") {
                let otp = storedOTP;
                if (!otp) {
                    otp = Math.floor(1000 + Math.random() * 9000).toString();
                    await updateData(`${order.outlet}/orders/${id}`, { otp: otp, deliveryOTP: otp });
                }
                msg = `📍 *RIDER HAS REACHED!* 🚨\n━━━━━━━━━━━━━━━━━━━━\nOur rider has arrived at your location for order #${id.slice(-5)}.\n\n🔑 *OTP:* ${otp} (Please share with rider)\n\nPlease be ready to receive your order. Thank you! 🙏`;
                img = botSettings.imgOut;
            } else if (statusLower === "delivered" || statusLower === "served") {
                msg = `✅ *${isDineIn ? 'SERVED' : 'DELIVERED'} SUCCESSFULLY!* 🍕❤️\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🆔 *Order ID:* #${id.slice(-5)}\n🤝 *Payment:* ${order.paymentMethod}\n💵 *Total Paid:* ₹${order.total || 0}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n*Enjoy your meal!* 😋\n\n${getFunnyFoodJoke()}`;
                img = botSettings.imgDelivered;
            } else if (statusLower === "cancelled") {
                msg = `❌ *ORDER CANCELLED* ❌\n━━━━━━━━━━━━━━━━━━━━\nWe're sorry, your order #${id.slice(-5)} has been cancelled.\n\nReason: ${order.cancelReason || "Store Busy / Technical Issue"}\n\nIf you have any questions, please contact us. 🙏`;
            }

            const prevStatus = currentProcessedStatus?.status || "None";
            console.log(`[BOT] 🔔 Status Change for #${id.slice(-5)}: ${prevStatus} -> ${currentStatus} (${jid ? 'Valid JID' : 'NO JID'})`);

            if (msg) {
                console.log(`[BOT] 📧 Sending ${currentStatus} notification to ${maskJid(jid)}...`);
                const sendResult = await sendImage(sock, jid, img, msg, order.outlet || 'pizza');

                // CRITICAL: Preserve ALL fields in processedStatus to avoid duplicate rider pings on next update
                await saveProcessedStatus(id, {
                    ...(currentProcessedStatus || {}),
                    status: currentStatus,
                    lastOtp: storedOTP,
                    timestamp: Date.now()
                });

                updateData(`bot/logs/${id}`, {
                    lastSent: currentStatus,
                    jid: maskJid(jid),
                    success: true,
                    timestamp: Date.now()
                }).catch(() => { });
            } else {
                // If no message defined for this status, still mark as processed
                await saveProcessedStatus(id, {
                    ...(currentProcessedStatus || {}),
                    status: currentStatus,
                    lastOtp: storedOTP,
                    timestamp: Date.now()
                });
            }
        } else {
            // Log skip reason if needed
            if (currentProcessedStatus && currentProcessedStatus.status === currentStatus) {
                // Already processed this status
            } else if (!jid) {
                // Already handled in the check above
            }
        }
    } catch (err) {
        console.error("Status Update Error:", err);
        updateData(`bot/logs/${id}`, { error: err.message, timestamp: Date.now() }).catch(() => { });
    }
}

// =============================
// 4A. DAILY & MONTHLY REPORT FUNCTIONS
// =============================

async function sendDailyReport(sock, targetDate = null) {
    try {
        const outlets = [OUTLET]; // Single outlet only
        const ist = getISTDateInfo();
        const dateStr = targetDate || ist.dateStr;

        console.log(`[Report] Generating Daily Report for: ${dateStr}`);

        let totalOrders = 0;
        let totalRevenue = 0;
        let reportDetails = "";

        for (const outlet of outlets) {
            const orders = await getData(`${outlet}/orders`);
            if (!orders) continue;

            let outletOrders = 0;
            let outletRevenue = 0;
            let statusBreakdown = {};

            Object.values(orders).forEach(order => {
                if (!order.createdAt) return;

                const oDateStr = getISTDateString(order.createdAt);

                if (oDateStr === dateStr) {
                    outletOrders++;
                    const s = order.status || "Unknown";
                    statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;

                    // Count 'Delivered', 'Confirmed' (POS), or 'Paid' orders as revenue
                    if (order.status === "Delivered" || order.status === "Confirmed" || order.paymentStatus === "Paid") {
                        outletRevenue += parseFloat(order.total || 0);
                    }
                }
            });

            if (outletOrders > 0) {
                reportDetails += `\n${outlet === 'pizza' ? '🍕' : '🎂'} *${outlet.toUpperCase()} OUTLET:*\n`;
                reportDetails += `   📦 Total Orders: ${outletOrders}\n`;
                reportDetails += `   💰 Real Sales: ₹${outletRevenue.toLocaleString()}\n`;

                // Add Breakdown
                const breakdownStr = Object.entries(statusBreakdown)
                    .map(([s, count]) => `      ▫️ ${s}: ${count}`)
                    .join('\n');
                reportDetails += `   📊 Breakdown:\n${breakdownStr}\n`;
            }

            totalOrders += outletOrders;
            totalRevenue += outletRevenue;
        }

        const jids = await getCachedAdminJids();
        const displayDate = new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        const nowIST = getISTDateInfo().istObject;

        const msg = `📊 *${OUTLET_NAME.toUpperCase()} — DAILY SALES REPORT* ${OUTLET_EMOJI}\n\n` +
            `📅 Sales Date: *${displayDate}*\n` +
            `⏰ Generated: ${nowIST.getUTCHours().toString().padStart(2, '0')}:${nowIST.getUTCMinutes().toString().padStart(2, '0')} IST\n\n` +
            (reportDetails || "_No sales recorded for this date._\n") +
            `\n💵 *TOTAL REVENUE:* ₹${totalRevenue.toLocaleString()}\n` +
            `📦 *TOTAL ORDERS:* ${totalOrders}\n\n` +
            `_Sent automatically by ${OUTLET_NAME} Bot_`;

        for (const jid of jids) {
            await sock.sendMessage(jid, { text: msg });
        }
        console.log(`📊 Daily report for ${dateStr} broadcast to ${jids.length} numbers`);
    } catch (err) { console.error("Daily Report Error:", err); }
}

async function sendMonthlyReport(sock) {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

        let totalOrders = 0;
        let totalRevenue = 0;
        let reportDetails = "";

        const outlets = [OUTLET]; // Single outlet only
        for (const outlet of outlets) {
            const orders = await getData(`${outlet}/orders`);
            if (!orders) continue;

            let outletOrders = 0;
            let outletRevenue = 0;

            Object.values(orders).forEach(order => {
                const orderTime = order.createdAt ? new Date(order.createdAt).getTime() : 0;
                if (orderTime >= startOfMonth) {
                    outletOrders++;
                    // Count 'Delivered', 'Confirmed' (POS), or 'Paid' orders as revenue
                    if (order.status === "Delivered" || order.status === "Confirmed" || order.paymentStatus === "Paid") {
                        outletRevenue += parseFloat(order.total || 0);
                    }
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

        const jids = await getCachedAdminJids();

        const msg = `📈 *${OUTLET_NAME.toUpperCase()} — MONTHLY SALES REPORT* ${OUTLET_EMOJI}\n\n` +
            `📅 Month: ${now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}\n\n` +
            reportDetails +
            `\n\n💵 *MONTHLY TOTAL:* ₹${totalRevenue.toLocaleString()}\n` +
            `📦 *TOTAL ORDERS:* ${totalOrders}\n\n` +
            `_Sent automatically by ${OUTLET_NAME} Bot_`;

        for (const jid of jids) {
            await sock.sendMessage(jid, { text: msg });
        }
        console.log(`📈 Monthly report broadcast to ${jids.length} numbers`);
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

        const outlets = [OUTLET]; // Single outlet only
        for (const outlet of outlets) {
            const orders = await getData(`${outlet}/orders`);
            if (!orders) continue;

            let outletOrders = 0;
            let outletRevenue = 0;

            Object.values(orders).forEach(order => {
                const orderTime = order.createdAt ? new Date(order.createdAt).getTime() : 0;
                if (orderTime >= weekStartTime) {
                    outletOrders++;
                    // Count 'Delivered', 'Confirmed' (POS), or 'Paid' orders as revenue
                    if (order.status === "Delivered" || order.status === "Confirmed" || order.paymentStatus === "Paid") {
                        outletRevenue += parseFloat(order.total || 0);
                    }
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

        const jids = await getCachedAdminJids();

        const msg = `📊 *${OUTLET_NAME.toUpperCase()} — WEEKLY SALES REPORT* ${OUTLET_EMOJI}\n\n` +
            `📅 Week: ${startOfWeek.toLocaleDateString('en-IN')} - ${now.toLocaleDateString('en-IN')}\n\n` +
            reportDetails +
            `\n\n💵 *WEEKLY TOTAL:* ₹${totalRevenue.toLocaleString()}\n` +
            `📦 *TOTAL ORDERS:* ${totalOrders}\n\n` +
            `_Sent automatically by ${OUTLET_NAME} Bot_`;

        for (const jid of jids) {
            await sock.sendMessage(jid, { text: msg });
        }
        console.log(`📊 Weekly report broadcast to ${jids.length} numbers`);
    } catch (err) { console.error("Weekly Report Error:", err); }
}

async function notifyRiderPickup(sock, order) {
    try {
        if (!sock) return;
        const riderPhone = order.riderPhone;
        const riderId = order.riderId || order.assignedRiderUid;
        if (!riderPhone) return;

        const riderJid = formatJid(riderPhone);
        if (!riderJid) {
            console.warn(`[RIDER] ⚠️ Cannot notify pickup: Invalid JID for phone ${riderPhone}`);
            return;
        }

        // Detailed Invoice Text
        let itemsText = "";
        const items = order.normalizedItems || order.items || [];
        items.forEach((item) => {
            const qty = item.quantity || item.qty || 1;
            const price = item.lineTotal || item.total || (item.price * qty) || 0;
            itemsText += `• *${item.name || item.item}* (${item.size || 'Reg'}) x${qty} - ₹${price}\n`;
            if (item.addons && item.addons.length > 0) {
                const addonNames = Array.isArray(item.addons)
                    ? item.addons.map(a => a.name || a).join(", ")
                    : Object.keys(item.addons).join(", ");
                itemsText += `  _Addons: ${addonNames}_\n`;
            }
        });

        const mapsLink = (order.lat && order.lng) ? `https://www.google.com/maps?q=${order.lat},${order.lng}` : (order.locationLink || "");

        const msg = `🛵 *READY FOR PICKUP* 🛵\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🆔 *Order ID:* #${order.orderId || 'N/A'}\n\n` +
            `🧾 *INVOICE DETAILS:*\n` +
            `${itemsText}` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `💰 *Subtotal:* ₹${order.subtotal || order.itemTotal || 0}\n` +
            (order.deliveryFee ? `🚚 *Delivery:* ₹${order.deliveryFee}\n` : "") +
            (order.discount ? `🎁 *Discount:* -₹${order.discount}\n` : "") +
            `💵 *TOTAL: ₹${order.total || 0}* (${order.paymentMethod || 'N/A'})\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `👤 *CUSTOMER INFO:*\n` +
            `*Name:* ${order.customerName || 'Customer'}\n` +
            `*Phone:* ${order.phone || 'N/A'}\n` +
            `*Address:* ${order.address || 'Address not provided'}\n\n` +
            (mapsLink ? `📍 *LIVE LOCATION:*\n${mapsLink}\n\n` : "") +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🔑 *DELIVERY OTP:* ${order.deliveryOTP || order.otp || 'N/A'}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `_The order is packed and waiting. Please arrive at the outlet immediately!_`;

        await sock.sendMessage(riderJid, { text: msg });
        console.log(`[RIDER] ✅ Pickup notification sent to ${riderPhone}`);

        // Also add in-app notification
        if (riderId) {
            await addInAppNotification(riderId, "Order Ready for Pickup!", `Order #${order.orderId || ''} is packed and waiting for you.`, 'warning', 'package', order.outlet);
        }
    } catch (err) {
        console.error("[RIDER] ❌ Rider Pickup Notify Error:", err);
    }
}

async function notifyRiderAssignment(sock, orderId, order) {
    try {
        if (!sock) return;
        const riderPhone = order.riderPhone;
        const riderId = order.riderId || order.assignedRiderUid;
        if (!riderPhone) {
            console.warn(`[RIDER] ⚠️ Cannot notify assignment: No phone number for order #${orderId.slice(-5)}`);
            return;
        }

        const riderJid = formatJid(riderPhone);
        if (!riderJid) {
            console.warn(`[RIDER] ⚠️ Cannot notify assignment: Invalid JID for phone ${riderPhone}`);
            return;
        }

        // Detailed Invoice Text
        let itemsText = "";
        const items = order.normalizedItems || order.items || [];
        items.forEach((item) => {
            const qty = item.quantity || item.qty || 1;
            const price = item.lineTotal || item.total || (item.price * qty) || 0;
            itemsText += `• *${item.name || item.item}* (${item.size || 'Reg'}) x${qty} - ₹${price}\n`;
            if (item.addons && item.addons.length > 0) {
                const addonNames = Array.isArray(item.addons)
                    ? item.addons.map(a => a.name || a).join(", ")
                    : Object.keys(item.addons).join(", ");
                itemsText += `  _Addons: ${addonNames}_\n`;
            }
        });

        const mapsLink = (order.lat && order.lng) ? `https://www.google.com/maps?q=${order.lat},${order.lng}` : (order.locationLink || "");

        let msg = `🔔 *NEW ORDER ASSIGNED* 🔔\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `🆔 *Order ID:* #${order.orderId || orderId.slice(-5)}\n\n`;
        msg += `🧾 *INVOICE DETAILS:*\n`;
        msg += `${itemsText}`;
        msg += `━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `💰 *Subtotal:* ₹${order.subtotal || order.itemTotal || 0}\n`;
        if (order.deliveryFee) msg += `🚚 *Delivery:* ₹${order.deliveryFee}\n`;
        if (order.discount) msg += `🎁 *Discount:* -₹${order.discount}\n`;
        msg += `💵 *TOTAL: ₹${order.total || 0}* (${order.paymentMethod || 'N/A'})\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        msg += `👤 *CUSTOMER INFO:*\n`;
        msg += `*Name:* ${order.customerName || 'Customer'}\n`;
        msg += `*Phone:* ${order.phone || 'N/A'}\n`;
        msg += `*Address:* ${order.address || 'Address not provided'}\n\n`;

        if (mapsLink) {
            msg += `📍 *LIVE LOCATION:*\n${mapsLink}\n\n`;
        } else {
            msg += `📍 *LOCATION:* _No map link provided by customer_\n\n`;
        }

        msg += `━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `🚀 *Please reach the outlet for pickup!*`;

        console.log(`[RIDER] 📤 Sending assignment message to rider: ${riderPhone} for #${orderId.slice(-5)}`);
        await sock.sendMessage(riderJid, { text: msg });
        console.log(`[RIDER] ✅ Assignment notification sent to ${riderPhone}`);

        // Also add in-app notification
        if (riderId) {
            await addInAppNotification(riderId, "New Order Assigned!", `You have been assigned to order #${order.orderId || orderId.slice(-5)}.`, 'info', 'truck', order.outlet);
        }
    } catch (err) {
        console.error("[RIDER] ❌ Rider Assignment Notify Error:", err);
    }
}

async function broadcastPickupAvailable(sock, orderId, order) {
    try {
        if (!sock) return;
        const outlet = order.outlet || 'pizza';
        const riders = await getData("riders", outlet) || {};

        // Filter for riders who are Online and have a phone number
        const onlineRiders = Object.entries(riders)
            .map(([uid, data]) => ({ uid, ...data }))
            .filter(r => r.status === "Online" && r.phone);

        console.log(`[RIDER] 📢 Broadcasting pickup for #${orderId.slice(-5)} to ${onlineRiders.length} online riders.`);

        if (onlineRiders.length === 0) {
            console.log(`[RIDER] ⚠️ No online riders available for broadcast of #${orderId.slice(-5)}`);
            return;
        }

        // Detailed Invoice Text
        let itemsText = "";
        const items = order.normalizedItems || order.items || [];
        items.forEach((item) => {
            const qty = item.quantity || item.qty || 1;
            const price = item.lineTotal || item.total || (item.price * qty) || 0;
            itemsText += `• *${item.name || item.item}* (${item.size || 'Reg'}) x${qty} - ₹${price}\n`;
            if (item.addons && item.addons.length > 0) {
                const addonNames = Array.isArray(item.addons)
                    ? item.addons.map(a => a.name || a).join(", ")
                    : Object.keys(item.addons).join(", ");
                itemsText += `  _Addons: ${addonNames}_\n`;
            }
        });

        const mapsLink = (order.lat && order.lng) ? `https://www.google.com/maps?q=${order.lat},${order.lng}` : (order.locationLink || "");

        const msg = `🔔 *PICKUP AVAILABLE* 🔔\n━━━━━━━━━━━━━━━━━━━━\n` +
            `🆔 *Order ID:* #${order.orderId || orderId.slice(-5)}\n` +
            `🏪 *Outlet:* ${(order.outlet || 'pizza').toUpperCase()}\n\n` +
            `🧾 *INVOICE DETAILS:*\n` +
            `${itemsText}` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `💰 *Subtotal:* ₹${order.subtotal || order.itemTotal || 0}\n` +
            (order.deliveryFee ? `🚚 *Delivery:* ₹${order.deliveryFee}\n` : "") +
            (order.discount ? `🎁 *Discount:* -₹${order.discount}\n` : "") +
            `💵 *TOTAL: ₹${order.total || 0}* (${order.paymentMethod || 'N/A'})\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `👤 *CUSTOMER INFO:*\n` +
            `*Name:* ${order.customerName || 'Customer'}\n` +
            `*Phone:* ${order.phone || 'N/A'}\n` +
            `*Address:* ${order.address || 'Address not provided'}\n\n` +
            (mapsLink ? `📍 *LIVE LOCATION:*\n${mapsLink}\n\n` : "") +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🚀 *Go to Rider Portal now to Accept!*`;

        for (const rider of onlineRiders) {
            const riderJid = formatJid(rider.phone);
            if (riderJid) {
                try {
                    await sock.sendMessage(riderJid, { text: msg });
                    // Also add in-app notification
                    await addInAppNotification(rider.uid, "New Pickup Available!", `Order #${orderId.slice(-5)} is ready for pickup.`, 'success', 'shopping-bag', order.outlet);
                } catch (sendErr) {
                    console.error(`[RIDER] ❌ Failed to send broadcast to ${rider.phone}:`, sendErr.message);
                }
            }
        }
    } catch (err) {
        console.error("[RIDER] ❌ Broadcast Error:", err);
    }
}

// =============================
// 4. MAIN START FUNCTION
// =============================

// =============================
// GLOBAL ERROR HANDLERS (prevent silent crashes)
// =============================
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err?.message || err);
});
process.on('unhandledRejection', (err) => {
    console.error('[FATAL] Unhandled Rejection:', err?.message || err);
});

async function startBot() {
    console.log(`🚀 Starting ${OUTLET_NAME} WhatsApp Bot (${OUTLET})...`);
    const { state, saveCreds } = await useMultiFileAuthState('session_data_' + OUTLET);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ['Roshani ERP', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);
    initCommandListener(sock);

    // Heartbeat & Cleanup & Report Scheduling
    if (reportInterval) clearInterval(reportInterval);
    reportInterval = setInterval(async () => {
        cleanupSessions();
        // Log crypto health summary (helpful to detect session degradation)
        if (cryptoErrorCount > 0) {
            console.log(`[CRYPTO] 📊 ${cryptoErrorCount} undecryptable messages since last connect (session ${cryptoErrorCount > 10 ? 'may need attention' : 'healthy'})`);
        }
        updateData(`bot/${OUTLET}/status`, { lastSeen: Date.now(), status: 'Online', outlet: OUTLET }).catch(() => { });

        // Refresh admin JID cache every heartbeat cycle
        cachedAdminJids = await getReportRecipients();
        cachedAdminJidsExpiry = Date.now() + ADMIN_CACHE_TTL;

        // Clean stale entries from local status cache
        const cutoff = Date.now() - LOCAL_CACHE_TTL;
        for (const [k, v] of localStatusCache) {
            const entryTime = v.ts || v.timestamp || 0;
            if (entryTime > 0 && entryTime < cutoff) localStatusCache.delete(k);
        }

        // Get Time in Asia/Kolkata accurately
        const ist = getISTDateInfo();
        const hour = ist.hour;
        const minute = ist.minute;

        // 1. Daily Report at 9:30 PM (21:30)
        if (hour === 21 && minute === 30 && !dailyReportSent) {
            await sendDailyReport(sock);
            dailyReportSent = true;
        }

        // 2. Late Night Catch-up (If bot was off at 21:30, send it at 1:30 AM for YESTERDAY)
        if (hour === 1 && minute === 30 && !dailyReportSent) {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const yDateStr = getISTDateString(yesterday.toISOString());
            await sendDailyReport(sock, yDateStr);
            dailyReportSent = true;
        }

        // Reset flags at 4 AM IST
        if (hour === 4 && minute === 0) {
            dailyReportSent = false;
            weeklyReportSent = false;
            monthlyReportSent = false;
        }

        // 4. Promotion heartbeat: pick up scheduled campaigns whose runAt is due.
        pickupScheduledPromotions(sock).catch(err => console.error("[Promo] Scheduled pickup error:", err));

        // 5. Expire promotion logs older than 30 days (best-effort, every 5 min)
        expireOldPromoLogs().catch(err => console.error("[Promo] Log expiry error:", err));
    }, 300000);

    // Firebase Listeners — Single Outlet Only
    const orderRef = db.ref(`${OUTLET}/orders`);
    orderRef.off("child_changed"); // Clear previous to avoid duplicates
    orderRef.off("child_added");

    orderRef.on("child_changed", (snap) => {
        const order = snap.val();
        if (order) handleOrderStatusUpdate(sock, snap.key, order);
    });
    orderRef.on("child_added", async (snap) => {
        const order = snap.val();
        if (!order) return;

        // Only handle "new" orders if they were created after the bot started
        const orderTime = order.createdAt ? new Date(order.createdAt).getTime() : 0;
        const type = (order.type || order.orderType || "").toLowerCase();
        const isDineIn = type.includes("dine") || type.includes("walk");

        // Be more lenient for Dine-in (30 mins) to ensure counter bookings are not missed
        const timeBuffer = isDineIn ? 1800000 : 10000;

        const currentProcessedStatus = await getProcessedStatus(snap.key);
        if (!currentProcessedStatus && orderTime > startupTime - timeBuffer) {
            handleOrderStatusUpdate(sock, snap.key, order, true);
        } else {
            // Just mark as processed without sending message
            await saveProcessedStatus(snap.key, { status: order.status, timestamp: Date.now() });
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'open') {
            console.log(`✅ ${OUTLET_NAME.toUpperCase()} BOT IS ONLINE`);
            reconnectAttempts = 0;
            cryptoErrorCount = 0;
        }
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                reconnectAttempts++;
                // Exponential backoff: 5s, 15s, 45s, 120s max
                const delay = Math.min(5000 * Math.pow(3, Math.min(reconnectAttempts - 1, 3)), 120000);
                console.log(`🔌 Disconnected (attempt ${reconnectAttempts}). Reconnecting in ${(delay / 1000).toFixed(0)}s...`);
                setTimeout(startBot, delay);
            } else {
                console.log("❌ Logged out. Delete session folder and restart.");
            }
        }
    });

    // Resume any campaigns that were running when the bot last lost connection.
    // Scans `bot/{outlet}/promotions/campaigns` for status==='running' and
    // rebuilds the command payload from the stored campaign doc.
    resumeStuckPromotions(sock).catch(err => console.error("[Promo] Resume sweep error:", err));

    // =============================
    // 5. MESSAGE HANDLER (INTERNAL)
    // =============================
    sock.ev.on('messages.upsert', async (m) => {
        try {
            if (m.type !== 'notify') return;
            const msg = m.messages[0];
            if (!msg.message) {
                // Crypto/session decryption failure (Baileys internal - Bad MAC etc.)
                cryptoErrorCount++;
                // Log only every 100th failure, or if a minute passed since last log
                const now = Date.now();
                if (cryptoErrorCount % 100 === 1) {
                    console.warn(`[CRYPTO] ⚠️ ${cryptoErrorCount} messages undecryptable so far. StubType: ${msg.messageStubType || 'N/A'}`);
                }
                // If crypto errors spike past threshold within 120s of startup, suggest session reset
                if (cryptoErrorCount === MAX_CRYPTO_ERRORS) {
                    console.error(`[CRYPTO] 🔴 ${MAX_CRYPTO_ERRORS}+ undecryptable messages. Session may be corrupt. Try deleting session_data_${OUTLET} folder and re-scanning QR.`);
                }
                return;
            }
            if (msg.key.fromMe) return;

            // Deduplication to prevent double responses
            const msgId = msg.key.id;
            if (await getProcessedStatus(msgId)) return;
            await saveProcessedStatus(msgId, { ts: Date.now() });

            // Mark as read
            await sock.readMessages([msg.key]);

            const sender = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
            const pushName = msg.pushName || "";

            // --- PROMOTIONAL OPT-OUT / OPT-IN HANDLER ---
            // Detect STOP / START from non-admin senders BEFORE the order-flow
            // state machine so it short-circuits the rest of the handler.
            // IMPORTANT: opt-out keys are stored as last-10-digits (matches
            // the customers/ keys) so the recipient filter can use a simple
            // set-membership check.
            try {
                const adminNumbers = await getCachedAdminJids();
                const isAuthorized = adminNumbers.includes(sender) || sender.startsWith(DEVELOPER_NUMBER_FALLBACK);
                if (!isAuthorized && text) {
                    const optOutKey = sender.replace(/[^0-9]/g, '').slice(-10);
                    if (/^(stop|unsubscribe|opt[\s-]?out)$/i.test(text)) {
                        await updateData(`bot/${OUTLET}/promotions/optout/${optOutKey}`, {
                            jid: sender, optedOutAt: Date.now()
                        });
                        await sock.sendMessage(sender, {
                            text: "✅ You've been unsubscribed from promotional messages. Reply START to opt back in anytime."
                        });
                        return;
                    }
                    if (/^start$/i.test(text)) {
                        const optoutSnap = await db.ref(`bot/${OUTLET}/promotions/optout/${optOutKey}`).once('value');
                        if (optoutSnap.exists()) {
                            await db.ref(`bot/${OUTLET}/promotions/optout/${optOutKey}`).update({ reOptInAt: Date.now() });
                            await sock.sendMessage(sender, { text: "🎉 Welcome back! You're re-subscribed to promotional messages." });
                            return;
                        }
                    }
                }
            } catch (optOutErr) {
                console.error("[Promo] Opt-out handler error:", optOutErr.message);
            }

            // Show typing status immediately for better perceived speed
            await sock.sendPresenceUpdate('composing', sender);

            let user = await getSession(sender);
            if (!user) {
                const profile = await getUserProfile(sender);
                user = {
                    step: "START",
                    current: {},
                    cart: [],
                    pushName: pushName,
                    msgCount: 0,
                    lastReset: Date.now(),
                    profile: profile || null,
                    name: profile?.name || null,
                    phone: profile?.phone || sender.split('@')[0].slice(-10),
                    address: profile?.address || null,
                    location: profile?.location || null
                };

                if (profile && profile.name) {
                    user.hasProfile = true;
                }
            }
            user.lastActivity = Date.now();

            // Run message logic in an IIFE to capture all early returns,
            // so we can safely save the user session to Redis at the end.
            await (async () => {

                // --- RATE LIMITING ---
                const now = Date.now();
                if (now - user.lastReset > 60000) {
                    user.msgCount = 0;
                    user.lastReset = now;
                }
                user.msgCount++;

                // --- ADMIN COMMANDS ---
                const DEVELOPER_NUMBER = "9724649971";
                const adminNumbers = await getCachedAdminJids();
                const isAuthorized = adminNumbers.includes(sender) || sender.startsWith(DEVELOPER_NUMBER);

                if (isAuthorized && text.startsWith('!')) {
                    const cmd = text.toLowerCase().slice(1);
                    console.log(`[ADMIN] Command: ${cmd} from ${sender}`);

                    if (cmd === 'report' || cmd === 'sales') {
                        await sock.sendMessage(sender, { text: "⏳ Generating latest sales report..." });
                        await sendDailyReport(sock);
                        return;
                    }
                    if (cmd === 'status') {
                        const uptime = Math.floor(process.uptime() / 60);
                        const processed = await getProcessedStatus('global') || {};
                        const count = Object.keys(processed || {}).length;
                        const statusMsg = `🤖 *BOT STATUS DASHBOARD*\n` +
                            `━━━━━━━━━━━━━━━━━━━━\n` +
                            `✅ Status: *Online*\n` +
                            `⏱️ Uptime: *${uptime} mins*\n` +
                            `📊 Orders in Memory: *${count}*\n` +
                            `🔗 Socket JID: *${sock.user?.id || 'Connected'}*\n` +
                            `━━━━━━━━━━━━━━━━━━━━`;
                        return await sock.sendMessage(sender, { text: statusMsg });
                    }
                    if (cmd === 'ping') {
                        return await sock.sendMessage(sender, { text: "🏓 *Pong!* Bot is active and listening." });
                    }
                }

                if (user.msgCount > 40) {
                    if (user.msgCount === 41) {
                        await sock.sendMessage(sender, { text: "⚠️ *Slow down!* You're sending messages too fast. Please wait a moment before trying again." });
                    }
                    return;
                }

                if (text.toLowerCase() === "cancel" || text.toLowerCase() === "reset") {
                    user.step = "START"; user.current = {}; user.cart = [];
                    return sock.sendMessage(sender, { text: "❌ *Order Reset.* Reply with any message to start again." });
                }

                // STATE MACHINE
                if (user.step === "START") {
                    user.outlet = OUTLET; // Hardcoded — no outlet selection needed
                    const [store, bot] = await Promise.all([
                        getData("settings/Store", OUTLET),
                        getData("settings/Bot", OUTLET)
                    ]);

                    // Check if shop is open before showing menu
                    if (store && !isShopOpen(store.shopOpenTime, store.shopCloseTime, store.shopStatus)) {
                        return sock.sendMessage(sender, { text: `🌙 *${OUTLET_NAME.toUpperCase()} IS CLOSED*\n\nHours: ${store.shopOpenTime || 'N/A'} - ${store.shopCloseTime || 'N/A'}\n\nSee you later! 👋` });
                    }

                    let welcome = "";
                    if (user.hasProfile && user.name) {
                        welcome += `Welcome back, *${user.name}*! 👋\n`;
                        welcome += `Your favorite items are ready for you. ${OUTLET_EMOJI}\n\n`;
                    } else {
                        welcome += `Hello *${pushName}*! 👋\n\n`;
                    }

                    welcome += `✨ *WELCOME TO ${OUTLET_NAME.toUpperCase()}* ${OUTLET_EMOJI}\n`;
                    welcome += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    welcome += `Delicious food, delivered fast to your doorstep! 🚀\n\n`;

                    // Cross-promotion for other outlet
                    if (OTHER_OUTLET_NUMBER) {
                        welcome += `${OTHER_OUTLET_EMOJI} Also try *${OTHER_OUTLET_NAME}*!\n`;
                        welcome += `📱 Order at: wa.me/${OTHER_OUTLET_NUMBER}\n\n`;
                    }

                    welcome += `_Loading menu... one moment_ ⏳`;

                    const greetingImg = bot?.greetingImage || store?.bannerImage;
                    await sendImage(sock, sender, greetingImg, welcome);
                    return sendCategories(sock, sender, user);
                }


                if (user.step === "CATEGORY") {
                    if (text === "0") {
                        // Go back to welcome/start
                        user.step = "START";
                        return sock.sendMessage(sender, { text: `🏠 *Main Menu* — Send any message to restart.` });
                    }
                    if (text === "9") return sendCartView(sock, sender, user);
                    const cat = user.categoryList[parseInt(text) - 1];
                    if (!cat) return sendInvalidInputHelp(sock, sender, user);

                    const dishes = await getData(`dishes`, user.outlet) || {};
                    user.dishList = Object.entries(dishes)
                        .filter(([id, d]) => d.category === cat.name && d.stock !== false)
                        .map(([id, d]) => ({ id, ...d }));

                    if (user.dishList.length === 0) return sock.sendMessage(sender, { text: "❌ No items in this category." });

                    let dMsg = `🍽️ *${cat.name.toUpperCase()}*\n\n`;
                    user.dishList.forEach((d, i) => { dMsg += `${i + 1}️⃣  *${d.name}*\n\n`; });
                    dMsg += `🛒 *9* View Cart\n0️⃣ *Take one step Back* 🔙`;
                    user.step = "DISH";
                    return await sendImage(sock, sender, cat.image, dMsg);
                }

                if (user.step === "DISH") {
                    if (text === "0") return sendCategories(sock, sender, user);
                    if (text === "9") return sendCartView(sock, sender, user);
                    const dish = user.dishList[parseInt(text) - 1];
                    if (!dish) return sendInvalidInputHelp(sock, sender, user);

                    user.current = { dish };
                    user.sizeList = Object.entries(dish.sizes || { "Regular": dish.price });
                    let sMsg = `📏 *SELECT SIZE*\n\n`;
                    user.sizeList.forEach(([s, p], i) => { sMsg += `${i + 1}️⃣  ${s} — ₹${p}\n`; });
                    sMsg += `\n0️⃣ *Take one step Back* 🔙`;
                    user.step = "SIZE";
                    return await sendImage(sock, sender, dish.image, sMsg);
                }

                if (user.step === "SIZE") {
                    if (text === "0") {
                        const dishList = user.dishList || [];
                        if (dishList.length === 0) return sendCategories(sock, sender, user);

                        let dMsg = `🍽️ *ITEM SELECTION*\n\n`;
                        dishList.forEach((d, i) => { dMsg += `${i + 1}️⃣  *${d.name}*\n\n`; });
                        dMsg += `🛒 *9* View Cart\n0️⃣ *Take one step Back* 🔙`;
                        user.step = "DISH";
                        return sock.sendMessage(sender, { text: dMsg });
                    }
                    const [size, price] = user.sizeList[parseInt(text) - 1] || [];
                    if (!size) return sendInvalidInputHelp(sock, sender, user);

                    user.current.size = size;
                    user.current.unitPrice = price;
                    user.current.addons = [];

                    user.step = "QUANTITY";
                    let qtyMsg = `🔢 *STEP 4: ENTER QUANTITY* 🍕\n\n`;
                    qtyMsg += `*How many of this item would you like to order?*\n\n`;
                    qtyMsg += `_Example: Reply with 1, 2, 5, etc._\n`;
                    qtyMsg += `0️⃣ *Take one step Back* 🔙`;
                    return sock.sendMessage(sender, { text: await appendContactInfo(qtyMsg, user.outlet) });
                }

                if (user.step === "QUANTITY") {
                    const qty = parseInt(text);
                    if (text === "0") {
                        const dish = user.current.dish;
                        user.sizeList = Object.entries(dish.sizes || { "Regular": dish.price });
                        let sMsg = `📏 *SELECT SIZE*\n\n`;
                        user.sizeList.forEach(([s, p], i) => { sMsg += `${i + 1}️⃣  ${s} — ₹${p}\n`; });
                        sMsg += `\n0️⃣ *Take one step Back* 🔙`;
                        user.step = "SIZE";
                        return sock.sendMessage(sender, { text: sMsg });
                    }
                    if (isNaN(qty) || qty < 1 || qty > 50) return sendInvalidInputHelp(sock, sender, user);

                    const addonTotal = user.current.addons.reduce((s, a) => s + a.price, 0);
                    user.cart.push({
                        name: user.current.dish.name,
                        size: user.current.size,
                        unitPrice: user.current.unitPrice,
                        addons: user.current.addons,
                        quantity: qty,
                        total: (user.current.unitPrice + addonTotal) * qty,
                        outlet: OUTLET
                    });

                    user.step = "ADDED_TO_CART";
                    return sendCartView(sock, sender, user, true);
                }

                if (user.step === "ADDED_TO_CART") {
                    if (text === "1") return sendCategories(sock, sender, user);
                    if (text === "2") return sendCartView(sock, sender, user);
                    if (text === "0") {
                        // Back to SIZE selection for the current dish
                        const dish = user.current.dish;
                        user.sizeList = Object.entries(dish.sizes || { "Regular": dish.price });
                        let sMsg = `📏 *SELECT SIZE*\n\n`;
                        user.sizeList.forEach(([s, p], i) => { sMsg += `${i + 1}️⃣  ${s} — ₹${p}\n`; });
                        sMsg += `\n0️⃣ *Take one step Back* 🔙`;
                        user.step = "SIZE";
                        return await sendImage(sock, sender, dish.image, sMsg);
                    }
                    return sock.sendMessage(sender, { text: "⚠️ Reply *1* to add more, *2* to view cart or *0* to go back." });
                }

                if (user.step === "EMPTY_CART_VIEW") {
                    if (text === "1") return sendCategories(sock, sender, user);
                    if (text === "0") { return sendCategories(sock, sender, user); }
                    return sock.sendMessage(sender, { text: "⚠️ Reply *1* to browse menu or *0* to go back." });
                }

                if (user.step === "CART_VIEW") {
                    if (text === "1") return sendCategories(sock, sender, user);
                    if (text === "2") {
                        // New: optional coupon step
                        user.step = "AWAIT_COUPON";
                        let couponMsg = `🎟️ *HAVE A COUPON CODE?* 🎟️\n\n`;
                        couponMsg += `If you have a discount code, reply with it now.\n`;
                        couponMsg += `Otherwise, reply *0* to skip and continue to checkout.\n\n`;
                        couponMsg += `0️⃣ *Skip — continue to checkout*`;
                        return sock.sendMessage(sender, { text: await appendContactInfo(couponMsg, user.outlet) });
                    }
                    if (text === "3") {
                        user.step = "START"; user.current = {}; user.cart = [];
                        return sock.sendMessage(sender, { text: await appendContactInfo("🗑️ Cart cleared. Reply with any message to start again.", user.outlet) });
                    }
                    if (text === "0") {
                        return sendCategories(sock, sender, user);
                    }
                    return sendInvalidInputHelp(sock, sender, user);
                }

                if (user.step === "AWAIT_COUPON") {
                    if (text === "0") {
                        // Skip coupon; go to REUSE_PROFILE or NAME
                        if (user.profile && user.profile.name) {
                            user.step = "REUSE_PROFILE";
                            let profileMsg = `👤 *REUSE YOUR SAVED DETAILS?*\n\n`;
                            profileMsg += `Name: ${user.profile.name}\n`;
                            profileMsg += `Phone: ${user.profile.phone}\n`;
                            profileMsg += `Address: ${user.profile.address || "N/A"}\n\n`;
                            profileMsg += `1️⃣ Yes, use these details\n`;
                            profileMsg += `2️⃣ No, enter new details\n`;
                            profileMsg += `0️⃣ *Take one step Back* 🔙`;
                            return sock.sendMessage(sender, { text: await appendContactInfo(profileMsg, user.outlet) });
                        }
                        user.step = "NAME";
                        let nameMsg = `👤 *STEP 1: ENTER YOUR FULL NAME* ✨\n\n`;
                        nameMsg += `Please provide your name so we can address you correctly and prepare your order.\n\n`;
                        nameMsg += `_Example: Rajesh Kumar_\n`;
                        nameMsg += `0️⃣ *Take one step Back* 🔙`;
                        return sock.sendMessage(sender, { text: await appendContactInfo(nameMsg, user.outlet) });
                    }
                    // Validate coupon
                    try {
                        const matched = await discountEngine.validateCouponCode(user.outlet, text.trim());
                        if (matched) {
                            user.couponCode = matched.couponCode;
                            await sock.sendMessage(sender, { text: `✅ Coupon *${matched.couponCode}* accepted! Continuing to checkout…` });
                        } else {
                            user.couponCode = null;
                            await sock.sendMessage(sender, { text: `❌ Invalid code *${text.trim()}*. Reply *0* to skip or try another code.` });
                            return; // stay on AWAIT_COUPON
                        }
                    } catch (e) {
                        console.error('[BOT] Coupon validation error:', e);
                        user.couponCode = null;
                    }
                    // Proceed to REUSE_PROFILE or NAME
                    if (user.profile && user.profile.name) {
                        user.step = "REUSE_PROFILE";
                        let profileMsg = `👤 *REUSE YOUR SAVED DETAILS?*\n\n`;
                        profileMsg += `Name: ${user.profile.name}\n`;
                        profileMsg += `Phone: ${user.profile.phone}\n`;
                        profileMsg += `Address: ${user.profile.address || "N/A"}\n\n`;
                        profileMsg += `1️⃣ Yes, use these details\n`;
                        profileMsg += `2️⃣ No, enter new details\n`;
                        profileMsg += `0️⃣ *Take one step Back* 🔙`;
                        return sock.sendMessage(sender, { text: await appendContactInfo(profileMsg, user.outlet) });
                    }
                    user.step = "NAME";
                    let nameMsg = `👤 *STEP 1: ENTER YOUR FULL NAME* ✨\n\n`;
                    nameMsg += `Please provide your name so we can address you correctly and prepare your order.\n\n`;
                    nameMsg += `_Example: Rajesh Kumar_\n`;
                    nameMsg += `0️⃣ *Take one step Back* 🔙`;
                    return sock.sendMessage(sender, { text: await appendContactInfo(nameMsg, user.outlet) });
                }

                if (user.step === "REUSE_PROFILE") {
                    if (text === "1") {
                        user.name = user.profile.name;
                        user.phone = user.profile.phone;
                        user.address = user.profile.address;
                        // Note: We intentionally DO NOT reuse user.location here as per request

                        user.step = "LOCATION";
                        let locMsg = `📍 *SHARE YOUR LOCATION* 🌍\n\n`;
                        locMsg += `Please share your *Live* or *Current* Location so we can calculate the delivery fee.\n\n`;
                        locMsg += `*How to share:*\n`;
                        locMsg += `1️⃣ Click the 📎 (Paperclip) or *+* button in WhatsApp\n`;
                        locMsg += `2️⃣ Select 'Location'\n`;
                        locMsg += `3️⃣ Choose 'Send Your Current Location'\n\n`;
                        locMsg += `_This step is mandatory for delivery calculation._`;
                        return sock.sendMessage(sender, { text: await appendContactInfo(locMsg, user.outlet) });
                    }
                    if (text === "2") {
                        user.step = "NAME";
                        let nameMsg = `👤 *STEP 1: ENTER YOUR FULL NAME* ✨\n\n`;
                        nameMsg += `Please provide your name so we can address you correctly and prepare your order.\n\n`;
                        nameMsg += `_Example: Rajesh Kumar_\n`;
                        nameMsg += `0️⃣ *Take one step Back* 🔙`;
                        return sock.sendMessage(sender, { text: await appendContactInfo(nameMsg, user.outlet) });
                    }
                    if (text === "0") {
                        user.step = "CART_VIEW";
                        return sendCartView(sock, sender, user);
                    }
                    return sendInvalidInputHelp(sock, sender, user);
                }
                if (user.step === "NAME") {
                    if (text === "0") {
                        user.step = "CART_VIEW";
                        return sendCartView(sock, sender, user);
                    }
                    user.name = text;
                    user.step = "PHONE";
                    if (user.name) {
                        await saveUserProfile(sender, { name: user.name, phone: user.phone || "" });
                    }
                    return sock.sendMessage(sender, { text: await appendContactInfo("📞 *STEP 2: ENTER YOUR 10 DIGIT MOBILE NUMBER*\n\n_Example: 9876543210. We will use this to contact you regarding your order._\n0️⃣ *Take one step Back* 🔙", user.outlet) });
                }

                if (user.step === "PHONE") {
                    if (text === "0") {
                        user.step = "NAME";
                        let nameMsg = `👤 *STEP 1: ENTER YOUR FULL NAME* ✨\n\n`;
                        nameMsg += `Please provide your name so we can address you correctly and prepare your order.\n\n`;
                        nameMsg += `_Example: Rajesh Kumar_\n`;
                        nameMsg += `0️⃣ *Take one step Back* 🔙`;
                        return sock.sendMessage(sender, { text: await appendContactInfo(nameMsg, user.outlet) });
                    }
                    user.phone = text;
                    user.step = "ADDRESS";
                    return sock.sendMessage(sender, { text: await appendContactInfo("🏠 *STEP 3: ENTER YOUR DELIVERY ADDRESS*\n\n_Please provide your complete address including landmark, house number, etc._\n0️⃣ *Take one step Back* 🔙", user.outlet) });
                }

                if (user.step === "ADDRESS") {
                    if (text === "0") {
                        user.step = "PHONE";
                        return sock.sendMessage(sender, { text: await appendContactInfo("📞 *STEP 2: ENTER YOUR 10 DIGIT MOBILE NUMBER*\n\n_Example: 9876543210. We will use this to contact you regarding your order._\n0️⃣ *Take one step Back* 🔙", user.outlet) });
                    }
                    user.address = text; user.step = "LOCATION";
                    let locMsg = `📍 *SHARE YOUR LOCATION* 🌍\n\n`;
                    locMsg += `Please share your *Live* or *Current* Location so we can calculate the delivery fee.\n\n`;
                    locMsg += `*How to share:*\n`;
                    locMsg += `1️⃣ Click the 📎 (Paperclip) or *+* button in WhatsApp\n`;
                    locMsg += `2️⃣ Select 'Location'\n`;
                    locMsg += `3️⃣ Choose 'Send Your Current Location'\n\n`;
                    locMsg += `_This step is mandatory for delivery calculation._\n`;
                    locMsg += `0️⃣ *Take one step Back* 🔙`;
                    return sock.sendMessage(sender, { text: await appendContactInfo(locMsg, user.outlet) });
                }

                if (user.step === "LOCATION") {
                    if (text === "0") {
                        user.step = "ADDRESS";
                        return sock.sendMessage(sender, { text: await appendContactInfo("🏠 *STEP 3: ENTER YOUR DELIVERY ADDRESS*\n\n_Please provide your complete address including landmark, house number, etc._\n0️⃣ *Take one step Back* 🔙", user.outlet) });
                    }
                    const loc = msg.message?.locationMessage;
                    if (!loc) return sendInvalidInputHelp(sock, sender, user);

                    user.location = { lat: loc.degreesLatitude, lng: loc.degreesLongitude };
                    return handleCheckoutFinal(sock, sender, user);
                }

                if (user.step === "CONFIRM_PAY") {
                    if (text === "0") {
                        user.step = "CART_VIEW";
                        return sendCartView(sock, sender, user);
                    }
                    if (text === "2") {
                        // Record Lost Sale
                        const lostId = "L-" + Date.now();
                        const { lines, subtotal } = formatCartSummary(user.cart);
                        const lostData = {
                            timestamp: new Date().toISOString(),
                            customer: user.name || "Anonymous",
                            phone: user.phone || "N/A",
                            total: subtotal, // Changed subtotal to total for report compatibility
                            subtotal: subtotal,
                            reason: "Cancelled at final invoice step",
                            outlet: user.outlet || "pizza"
                        };

                        await setData(`logs/lostSales/${lostId}`, lostData);

                        // Notify Admin
                        await notifyAdmin(sock, lostId, {
                            customerName: user.name || "Anonymous",
                            phone: user.phone || "N/A",
                            total: subtotal,
                            outlet: user.outlet || "pizza"
                        }, 'CANCELLED');

                        const outlet = user.outlet;
                        user = null; // Mark session for deletion in Redis 
                        return sock.sendMessage(sender, { text: await appendContactInfo("❌ Order Cancelled. We hope to serve you next time! 🙏", outlet) });
                    }
                    if (text === "1") {
                        user = await processOrderPlacement(sock, sender, user, "COD");
                        return;
                    }
                    return sendInvalidInputHelp(sock, sender, user);
                }

                async function processOrderPlacement(sock, sender, user, method) {
                    try {
                        const orderId = await generateOrderId(user.outlet);
                        const { subtotal } = formatCartSummary(user.cart);

                        const deliveryFee = user.deliveryFee || 0;
                        const finalOrder = {
                            orderId, outlet: user.outlet,
                            type: "Online", // Explicitly tag as Online order
                            customerName: escapeHtml(user.name),
                            phone: user.phone,
                            whatsappNumber: sender, // Save sender JID for status updates
                            address: escapeHtml(user.address),
                            lat: user.location.lat, lng: user.location.lng,
                            subtotal, deliveryFee, total: subtotal + deliveryFee - (user.discount || 0),
                            status: "Placed", paymentMethod: method, paymentStatus: "Pending",
                            createdAt: new Date().toISOString(),
                            assignedRider: "",
                            items: user.cart,
                            stockDeducted: true,
                            // New discount tracking fields
                            discount: user.discount || 0,
                            discountId: user.discountId || null,
                            discountLabel: user.discountLabel || null,
                            discountSource: user.discountSource || (user.discount ? 'manual' : 'none')
                        };

                        await setData(`orders/${orderId}`, finalOrder, user.outlet);
                        await notifyAdmin(sock, orderId, finalOrder, 'NEW');
                        sendFCMToAdmins(orderId, finalOrder);

                        // Save user profile for next time
                        await saveUserProfile(sender, {
                            name: user.name,
                            phone: user.phone,
                            address: user.address,
                            location: user.location,
                            lastOutlet: user.outlet
                        });

                        // Save complete profile to outlet's customers node for POS access
                        if (user.phone) {
                            const cleanPhone = String(user.phone).replace(/\D/g, '').slice(-10);
                            const custData = {
                                name: user.name,
                                phone: cleanPhone,
                                address: user.address || "",
                                location: user.location || null,
                                mapsLink: user.location ? `https://maps.google.com/?q=${user.location.lat},${user.location.lng}` : "",
                                lastOrderDate: new Date().toISOString(),
                                // Pre-Flight #10: explicit consent for promotional messages
                                promotionalConsent: true
                            };
                            // If first-order discount was used, mark it consumed
                            if (user.discountSource === 'firstOrder' && user.discountId) {
                                custData.firstOrderDiscountUsed = Date.now();
                                custData.firstOrderDiscountId = user.discountId;
                            }
                            await updateData(`customers/${cleanPhone}`, custData, user.outlet);
                        }

                        // Log discount usage (best-effort)
                        if (finalOrder.discount > 0 && finalOrder.discountId) {
                            try {
                                await discountEngine.recordDiscountUsage({
                                    OUTLET: user.outlet,
                                    discountId: finalOrder.discountId,
                                    orderId,
                                    customerPhone: finalOrder.phone,
                                    amountGiven: finalOrder.discount,
                                    channel: 'whatsapp',
                                    discountLabel: finalOrder.discountLabel,
                                    discountSource: finalOrder.discountSource
                                });
                            } catch (e) {
                                console.warn('[BOT] recordDiscountUsage failed:', e?.message || e);
                            }
                        }

                        let successMsg = `🎉 *ORDER PLACED SUCCESSFULLY!* 🎉\n`;
                        successMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                        successMsg += `🆔 *Order ID:* #${orderId.slice(-5)}\n`;
                        successMsg += `🏪 *Shop:* ${OUTLET_NAME}\n`;
                        successMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                        successMsg += `*Please wait while the admin confirms your order!* ⏳\n\n`;
                        successMsg += `Total: ₹${finalOrder.total}`;

                        await sock.sendMessage(sender, { text: await appendContactInfo(successMsg, user.outlet) });

                        // Fire-and-forget: deduct stock AFTER user gets reply (non-blocking)
                        deductInventoryStock(sock, finalOrder.items, user.outlet).catch(e =>
                            console.error("[BOT] Stock deduction failed:", e)
                        );

                        // Return null to signify session should be cleared
                        return null;
                    } catch (e) {
                        console.error("Order Placement Error:", e);
                        return sock.sendMessage(sender, { text: "❌ Error placing your order. Please try again." });
                    }
                }

            })(); // <-- End of Message Handler IIFE

            // Final Session Save
            await saveSession(sender, user);

        } catch (err) { console.error("Message Handler Error:", err); }
    });
}

async function handleCheckoutFinal(sock, sender, user) {
    try {
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

        // Auto-evaluate discount (best of: firstOrder / coupon / global / category)
        try {
            const cleanPhone = String(user.phone || '').replace(/\D/g, '').slice(-10);
            const customerSnap = cleanPhone ? await getData(`customers/${cleanPhone}`, user.outlet) : null;
            const discountEval = await discountEngine.evaluateDiscount({
                OUTLET: user.outlet,
                customer: customerSnap,
                subtotal,
                couponCode: user.couponCode || null,
                cart: user.cart
            });
            if (discountEval) {
                user.discount = discountEval.amount;
                user.discountId = discountEval.discount.id;
                user.discountLabel = discountEval.label;
                user.discountSource = discountEval.source;
            } else {
                user.discount = 0;
                user.discountId = null;
                user.discountLabel = null;
                user.discountSource = null;
            }
        } catch (e) {
            console.error('[BOT] Discount evaluation failed:', e?.message || e);
            user.discount = 0;
        }

        user.step = "CONFIRM_PAY";

        let sum = `🧾 *INVOICE*\n`;
        sum += `━━━━━━━━━━━━━━━━━━━━\n`;
        sum += `${lines}`;
        sum += `━━━━━━━━━━━━━━━━━━━━\n`;
        sum += `💰 Subtotal: ₹${subtotal}\n`;
        sum += `🚚 Delivery (${dist.toFixed(1)}km): ₹${fee}\n`;
        if (user.discount) sum += `🎁 Discount${user.discountLabel ? ` (${user.discountLabel})` : ''}: -₹${user.discount}\n`;
        sum += `💵 *TOTAL: ₹${subtotal + fee - (user.discount || 0)}*\n\n`;
        sum += `1️⃣ Confirm Order\n`;
        sum += `2️⃣ Cancel\n`;
        sum += `0️⃣ *Take one step Back* 🔙`;

        return sock.sendMessage(sender, { text: await appendContactInfo(sum, user.outlet) });
    } catch (e) {
        console.error("Checkout Final Error:", e);
        return sock.sendMessage(sender, { text: "❌ Error calculating delivery fee. Please try again." });
    }
}

// =============================
// 6. PROMOTIONAL CAMPAIGN ENGINE
// =============================
// Walks the recipient list with a configurable per-send delay. Honors a
// global kill-switch, quiet-hours guard, socket-health checks, crypto-error
// auto-pause, and per-customer opt-out. State is persisted to RTDB so a
// bot restart can resume from `currentIndex`.

const PROMO_LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days
const PROMO_HEARTBEAT_EVERY = 10;                    // persist progress every N sends
const PROMO_PAUSE_EVERY = 50;                        // human-pacing pause
const PROMO_PAUSE_MS = 30_000;
const PROMO_SOCKET_DEAD_GRACE_MS = 5_000;            // wait 5s before resuming after socket recovery
const PROMO_SCHEDULE_MISSED_GRACE_MS = 15 * 60 * 1000; // 15 min late = expire

/**
 * Send a promotional message. Bypasses appendContactInfo (no admin footer)
 * and adds a clean opt-out line if the message doesn't already contain STOP.
 */
async function sendPromotionalMessage(sock, jid, text, mediaUrl) {
    const optOut = /stop/i.test(text) ? '' : '\n\n_Reply STOP to unsubscribe._';
    const finalText = text + optOut;
    try {
        if (mediaUrl) {
            // Reuse the existing sendImage helper but pass the finalText;
            // it will skip the contact footer because we already pre-formatted.
            let payload;
            if (typeof mediaUrl === 'string' && mediaUrl.startsWith('data:image')) {
                const base64Data = mediaUrl.split(',')[1];
                payload = { image: Buffer.from(base64Data, 'base64'), caption: finalText };
            } else {
                payload = { image: { url: mediaUrl }, caption: finalText };
            }
            await sock.sendMessage(jid, payload);
        } else {
            await sock.sendMessage(jid, { text: finalText });
        }
    } catch (err) {
        console.error(`[Promo] sendMessage failed for ${jid}:`, err.message || err);
        throw err;
    }
}

/**
 * Replace personalization tokens in the template.
 * Source priority: botUsers/{jid}.name > customers/{phone}.name > "Customer"
 */
async function personalizeTemplate(tpl, phone, campaignId, couponCode) {
    if (!tpl) return '';
    let out = String(tpl);

    // 1. {storeName}
    try {
        const store = await getData("settings/Store", OUTLET);
        if (store && store.storeName) out = out.replaceAll('{storeName}', store.storeName);
    } catch (_) {}

    // 2. {phone}
    out = out.replaceAll('{phone}', phone);

    // 3. {couponCode} (if generated)
    if (couponCode) out = out.replaceAll('{couponCode}', couponCode);

    // 4. {name} / {lastOrderDate} from customers/{phone}
    try {
        const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
        const cust = await getData(`customers/${cleanPhone}`, OUTLET);
        if (cust) {
            out = out.replaceAll('{name}', cust.name || 'Customer');
            const lod = cust.lastOrderDate ? new Date(cust.lastOrderDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'first time';
            out = out.replaceAll('{lastOrderDate}', lod);
        } else {
            out = out.replaceAll('{name}', 'Customer');
            out = out.replaceAll('{lastOrderDate}', 'first time');
        }
    } catch (_) {
        out = out.replaceAll('{name}', 'Customer');
        out = out.replaceAll('{lastOrderDate}', 'first time');
    }

    return out;
}

/**
 * Check if the global kill-switch is engaged. Cached for 2s to avoid
 * hammering RTDB on every send.
 */
let _killSwitchCache = { value: false, ts: 0 };
async function isKillSwitchOn() {
    const now = Date.now();
    if (now - _killSwitchCache.ts < 2000) return _killSwitchCache.value;
    try {
        const snap = await db.ref(`bot/${OUTLET}/promotions/killSwitch`).once('value');
        _killSwitchCache = { value: snap.val() === true, ts: now };
        return _killSwitchCache.value;
    } catch (_) {
        return _killSwitchCache.value;
    }
}

/**
 * Master "promotions enabled" flag from the dashboard widget.
 * Cached for 2s. Defaults to TRUE (enabled) when unset, so existing
 * campaigns keep working.
 */
let _promoEnabledCache = { value: true, ts: 0 };
async function isPromoEnabled() {
    const now = Date.now();
    if (now - _promoEnabledCache.ts < 2000) return _promoEnabledCache.value;
    try {
        const snap = await db.ref(`bot/${OUTLET}/promotions/enabled`).once('value');
        _promoEnabledCache = { value: snap.val() !== false, ts: now };
        return _promoEnabledCache.value;
    } catch (_) {
        return _promoEnabledCache.value;
    }
}

/**
 * Returns true if the customer has explicitly opted out.
 */
async function isOptedOut(phone) {
    try {
        const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
        const snap = await db.ref(`bot/${OUTLET}/promotions/optout/${cleanPhone}`).once('value');
        return snap.exists();
    } catch (_) {
        return false;
    }
}

/**
 * Returns true if the customer has promotionalConsent === true.
 * Conservative: if the field is missing, we DON'T send (admin must opt-in).
 */
async function hasPromoConsent(phone) {
    try {
        const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
        const snap = await db.ref(`${OUTLET}/customers/${cleanPhone}/promotionalConsent`).once('value');
        return snap.val() === true;
    } catch (_) {
        return false;
    }
}

/**
 * Sleep through configured quiet hours. Returns silently when outside the
 * window. Window is interpreted in IST (matches getISTDateInfo convention).
 */
async function sleepThroughQuietHours(quietHours) {
    if (!quietHours || quietHours.start == null || quietHours.end == null) return;
    const ist = getISTDateInfo();
    const cur = ist.hour + ist.minute / 60;
    const s = Number(quietHours.start);
    const e = Number(quietHours.end);
    let inQuiet = false;
    let minutesToWait = 0;
    if (s < e) {
        inQuiet = cur >= s && cur < e;
        minutesToWait = inQuiet ? (e - cur) * 60 : 0;
    } else {
        // overnight window (e.g. 22 → 9)
        inQuiet = cur >= s || cur < e;
        if (cur >= s) minutesToWait = (24 - cur + e) * 60;
        else minutesToWait = (e - cur) * 60;
    }
    if (inQuiet && minutesToWait > 0) {
        console.log(`[Promo] Quiet hours active — sleeping ${minutesToWait.toFixed(0)} min`);
        // Cap the sleep at 5 min slices; loop checks kill-switch between slices.
        let remaining = minutesToWait * 60 * 1000;
        while (remaining > 0) {
            const slice = Math.min(remaining, 5 * 60 * 1000);
            await new Promise(r => setTimeout(r, slice));
            remaining -= slice;
            if (await isKillSwitchOn()) throw new Error('kill-switch');
        }
    }
}

/**
 * Generate a short alphanumeric coupon code.
 */
function generateCouponCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

/**
 * Send one message with up to `maxRetries` automatic retries.
 */
async function sendWithRetry(sock, jid, text, mediaUrl, maxRetries = 2) {
    let lastErr = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await sendPromotionalMessage(sock, jid, text, mediaUrl);
            return { ok: true, attempts: attempt };
        } catch (err) {
            lastErr = err;
            console.warn(`[Promo] Attempt ${attempt}/${maxRetries} failed for ${jid}: ${err.message || err}`);
            if (attempt < maxRetries) await new Promise(r => setTimeout(r, 5000));
        }
    }
    return { ok: false, error: lastErr?.message || 'unknown', attempts: maxRetries };
}

/**
 * Heuristic check for whether the Baileys socket is alive.
 */
function isSocketDead(sock) {
    try {
        if (!sock || !sock.user) return true;
        if (sock.ws && sock.ws.isClosed === true) return true;
        return false;
    } catch (_) {
        return true;
    }
}

/**
 * Acquire the per-outlet concurrency lock. Returns true if acquired.
 */
async function acquirePromoLock(campaignId) {
    try {
        const ref = db.ref(`bot/${OUTLET}/promotions/lock`);
        const tx = await ref.transaction(c => {
            if (c && c.campaignId && c.campaignId !== campaignId) return c; // someone else holds it
            return { campaignId, acquiredAt: Date.now() };
        });
        return tx.committed;
    } catch (_) {
        return false;
    }
}

async function releasePromoLock() {
    try { await db.ref(`bot/${OUTLET}/promotions/lock`).remove(); } catch (_) {}
}

/**
 * Write a per-recipient log entry.
 */
async function logPromoResult(campaignId, phone, jid, result, couponCode) {
    try {
        await db.ref(`bot/${OUTLET}/promotions/logs/${campaignId}/${phone}`).set({
            jid, status: result.ok ? 'sent' : 'failed', sentAt: Date.now(), error: result.error || null, couponCode: couponCode || null
        });
    } catch (e) {
        console.error(`[Promo] Failed to write log for ${phone}:`, e.message);
    }
}

async function logPromoSkip(campaignId, phone, reason) {
    try {
        await db.ref(`bot/${OUTLET}/promotions/logs/${campaignId}/${phone}`).set({
            status: 'skipped', sentAt: Date.now(), reason
        });
    } catch (_) {}
}

/**
 * The main campaign runner. Idempotent and re-entrant. Reads from RTDB
 * state so it can resume after a bot restart.
 */
async function runPromotionCampaign(sock, cmd) {
    const { campaignId, template, mediaUrl, recipients = [], delayMs = 2000, generateCoupons = false, quietHours, requestedBy, greeting = false, menuText = null, isTest = false } = cmd;
    if (!campaignId || !Array.isArray(recipients) || recipients.length === 0) {
        console.warn(`[Promo] Invalid campaign command: ${campaignId}`);
        return;
    }
    if (recipients.length > 500) {
        console.warn(`[Promo] Recipients cap exceeded (${recipients.length}); truncating to 500`);
    }
    const list = recipients.slice(0, 500);

    console.log(`[Promo] ▶️ Campaign ${campaignId} starting/resuming (${list.length} recipients, ${delayMs}ms delay${greeting ? ', greeting=on' : ''}${menuText ? ', menu=on' : ''})`);

    // Persist start audit
    try {
        await db.ref('logs/audit').push({
            action: 'PROMO_START',
            campaignId, by: requestedBy || 'admin', timestamp: Date.now()
        });
    } catch (_) {}

    // Mark as running
    await db.ref(`bot/${OUTLET}/promotions/campaigns/${campaignId}`).update({
        status: 'running', startedAt: Date.now(), totalSent: 0, totalFailed: 0
    });

    // Acquire lock
    if (!await acquirePromoLock(campaignId)) {
        console.warn(`[Promo] Lock not acquired — another campaign is running. Aborting ${campaignId}.`);
        await db.ref(`bot/${OUTLET}/promotions/campaigns/${campaignId}`).update({ status: 'aborted', reason: 'lock-conflict' });
        return;
    }

    // Read existing progress (for resume)
    let startIndex = 0;
    try {
        const snap = await db.ref(`bot/${OUTLET}/promotions/campaigns/${campaignId}/currentIndex`).once('value');
        startIndex = Number(snap.val() || 0);
    } catch (_) {}
    if (startIndex >= list.length) {
        console.log(`[Promo] Campaign ${campaignId} already complete.`);
        await releasePromoLock();
        return;
    }

    let sent = 0, failed = 0;

    try {
        for (let i = startIndex; i < list.length; i++) {
            // 0. Master dashboard toggle
            if (!await isPromoEnabled()) {
                console.warn(`[Promo] Promotional sending is OFF (dashboard toggle). Pausing ${campaignId}.`);
                await db.ref(`bot/${OUTLET}/promotions/campaigns/${campaignId}`).update({ status: 'paused', pauseReason: 'promo-disabled' });
                return;
            }

            // 1. Kill-switch
            if (await isKillSwitchOn()) {
                console.warn(`[Promo] Kill-switch engaged. Pausing ${campaignId}.`);
                await db.ref(`bot/${OUTLET}/promotions/campaigns/${campaignId}`).update({ status: 'paused', pauseReason: 'kill-switch' });
                return;
            }

            // 2. Quiet hours
            try { await sleepThroughQuietHours(quietHours); } catch (e) { if (e.message === 'kill-switch') return; }

            // 3. Socket + session health
            if (isSocketDead(sock) || cryptoErrorCount > 100) {
                console.warn(`[Promo] Socket/session degraded. Pausing ${campaignId} (will resume on reconnect).`);
                await db.ref(`bot/${OUTLET}/promotions/campaigns/${campaignId}`).update({ status: 'paused', pauseReason: 'session-degraded', currentIndex: i });
                return;
            }

            // 4. Re-acquire lock (in case it timed out)
            if (i % 25 === 0 && !await acquirePromoLock(campaignId)) {
                console.warn(`[Promo] Lock lost mid-campaign. Pausing.`);
                await db.ref(`bot/${OUTLET}/promotions/campaigns/${campaignId}`).update({ status: 'paused', pauseReason: 'lock-lost', currentIndex: i });
                return;
            }

            // 5. Skip-check: opt-out, consent, JID validity
            //    For a self-test the admin is sending to themselves, skip
            //    all consent/optout checks (the admin knows what they're
            //    doing) and send the raw template without personalization.
            const phone = list[i];
            const jid = formatJid(phone);
            if (!jid) { await logPromoSkip(campaignId, phone, 'invalid-jid'); failed++; continue; }
            if (!isTest && await isOptedOut(phone)) { await logPromoSkip(campaignId, phone, 'opted-out'); continue; }
            if (!isTest && !await hasPromoConsent(phone)) { await logPromoSkip(campaignId, phone, 'no-consent'); continue; }
            if (isTest) console.log(`[Promo] Test: bypassing consent/optout for ${phone}`);

            // 6. Personalize
            //    For test campaigns, skip personalization — send the raw
            //    template exactly as the admin typed it.
            const couponCode = (generateCoupons && !isTest) ? generateCouponCode() : null;
            let text = isTest ? template : await personalizeTemplate(template, phone, campaignId, couponCode);
            if (greeting && !isTest) {
                // Prepend a friendly greeting with the customer's name (if not already in the template)
                try {
                    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
                    const cust = await getData(`customers/${cleanPhone}`, OUTLET);
                    const name = cust?.name || 'there';
                    if (!/^hi\s+/i.test(text)) text = `Hi ${name},\n\n${text}`;
                } catch (_) {
                    if (!/^hi\s+/i.test(text)) text = `Hi there,\n\n${text}`;
                }
            }
            if (isTest) console.log(`[Promo] Test: sending raw template to ${jid}`);

            // 7. Send
            const result = await sendWithRetry(sock, jid, text, mediaUrl, 2);
            await logPromoResult(campaignId, phone, jid, result, couponCode);
            if (result.ok) {
                sent++;
                // 7a. Record coupon in /coupons/ for later redemption
                if (couponCode) {
                    try {
                        await db.ref(`bot/${OUTLET}/promotions/coupons/${couponCode}`).set({
                            campaignId, recipientPhone: phone, generatedAt: Date.now()
                        });
                    } catch (_) {}
                }
                // 7b. Send menu footer as a 2nd message (if requested)
                if (menuText && String(menuText).trim().length > 0) {
                    try {
                        await new Promise(r => setTimeout(r, Math.min(1500, delayMs)));
                        await sock.sendMessage(jid, { text: String(menuText) });
                    } catch (e) {
                        console.warn(`[Promo] Menu footer failed for ${jid}:`, e.message || e);
                    }
                }
            } else {
                failed++;
            }

            // 8. Heartbeat every N sends
            if ((i + 1) % PROMO_HEARTBEAT_EVERY === 0) {
                await db.ref(`bot/${OUTLET}/promotions/campaigns/${campaignId}`).update({
                    currentIndex: i + 1, totalSent: sent, totalFailed: failed, lastHeartbeat: Date.now()
                });
            }

            // 9. Human pacing (skip for test campaigns — no rate-limiting needed)
            if (!isTest) {
                if ((i + 1) % PROMO_PAUSE_EVERY === 0) {
                    console.log(`[Promo] Pacing pause (${PROMO_PAUSE_MS/1000}s) after ${i+1} sends`);
                    await new Promise(r => setTimeout(r, PROMO_PAUSE_MS));
                } else {
                    await new Promise(r => setTimeout(r, delayMs));
                }
            }
        }

        // 10. Mark complete
        await db.ref(`bot/${OUTLET}/promotions/campaigns/${campaignId}`).update({
            status: 'done', completedAt: Date.now(), currentIndex: list.length, totalSent: sent, totalFailed: failed
        });
        await db.ref('logs/audit').push({
            action: 'PROMO_DONE', campaignId, sent, failed, timestamp: Date.now()
        });
        console.log(`[Promo] ✅ Campaign ${campaignId} done. sent=${sent} failed=${failed}`);
    } catch (err) {
        console.error(`[Promo] Campaign ${campaignId} crashed:`, err);
        await db.ref(`bot/${OUTLET}/promotions/campaigns/${campaignId}`).update({ status: 'stopped', error: err.message });
    } finally {
        await releasePromoLock();
    }
}

/**
 * On every `startBot()`, scan for campaigns left in 'running' state and
 * re-dispatch them. The original command node is normally deleted by
 * `initCommandListener` after dispatch, so we rebuild the command payload
 * from the campaign doc itself (which stores recipients, template, etc.).
 */
async function resumeStuckPromotions(sock) {
    try {
        const snap = await db.ref(`bot/${OUTLET}/promotions/campaigns`).orderByChild('status').equalTo('running').once('value');
        if (!snap.exists()) return;
        const stuck = snap.val();
        for (const id of Object.keys(stuck)) {
            const c = stuck[id];
            const cmd = {
                campaignId: id,
                template: c.template,
                mediaUrl: c.mediaUrl || null,
                greeting: c.greeting === true,
                menuText: c.menuText || null,
                recipients: c.recipients || [],
                delayMs: c.delayMs || 2000,
                generateCoupons: !!c.generateCoupons,
                quietHours: c.quietHours || null,
                requestedBy: c.requestedBy || 'admin-resume',
            };
            if (!Array.isArray(cmd.recipients) || cmd.recipients.length === 0) {
                console.warn(`[Promo] Cannot resume ${id}: no recipients in campaign doc`);
                await db.ref(`bot/${OUTLET}/promotions/campaigns/${id}`).update({ status: 'stopped', reason: 'no-recipients-on-resume' });
                continue;
            }
            console.log(`[Promo] 🔄 Resuming campaign ${id} from index ${c.currentIndex || 0}`);
            runPromotionCampaign(sock, cmd).catch(err => console.error(`[Promo] Resume error for ${id}:`, err));
        }
    } catch (e) {
        console.error('[Promo] resumeStuckPromotions error:', e.message);
    }
}

/**
 * Heartbeat job: pick up scheduled campaigns whose `runAt` is due and
 * convert them to a runnable command. Auto-expire if more than the grace
 * window has passed.
 */
async function pickupScheduledPromotions(sock) {
    try {
        const snap = await db.ref(`bot/${OUTLET}/promotions/campaigns`).orderByChild('runAt').endAt(Date.now()).once('value');
        if (!snap.exists()) return;
        const due = snap.val();
        for (const id of Object.keys(due)) {
            const c = due[id];
            if (c.status !== 'scheduled') continue;
            const late = Date.now() - (c.runAt || 0);
            if (late > PROMO_SCHEDULE_MISSED_GRACE_MS) {
                await db.ref(`bot/${OUTLET}/promotions/campaigns/${id}`).update({ status: 'expired', reason: 'missed-window', lateBy: late });
                continue;
            }
            // Within grace — dispatch
            await db.ref(`bot/${OUTLET}/promotions/campaigns/${id}`).update({ status: 'running', startedAt: Date.now() });
            const cmdRef = db.ref(`bot/${OUTLET}/commands`).push();
            await cmdRef.set({
                action: 'SEND_PROMOTION',
                campaignId: id,
                template: c.template,
                mediaUrl: c.mediaUrl || null,
                greeting: c.greeting === true,
                menuText: c.menuText || null,
                recipients: c.recipients || [],
                delayMs: c.delayMs || 2000,
                generateCoupons: !!c.generateCoupons,
                quietHours: c.quietHours || null,
                requestedBy: c.requestedBy || 'admin'
            });
        }
    } catch (e) {
        console.error('[Promo] pickupScheduledPromotions error:', e.message);
    }
}

/**
 * Best-effort sweep: delete per-campaign logs older than 30 days.
 * Cheap because logs/{campaignId}/{phone} is small.
 */
async function expireOldPromoLogs() {
    try {
        const snap = await db.ref(`bot/${OUTLET}/promotions/logs`).once('value');
        if (!snap.exists()) return;
        const campaigns = snap.val();
        const cutoff = Date.now() - PROMO_LOG_TTL_MS;
        for (const cid of Object.keys(campaigns)) {
            const camp = campaigns[cid];
            const allOld = Object.values(camp).every(r => (r.sentAt || 0) < cutoff);
            if (allOld && Object.keys(camp).length > 0) {
                await db.ref(`bot/${OUTLET}/promotions/logs/${cid}`).remove();
            }
        }
    } catch (e) {
        console.error('[Promo] expireOldPromoLogs error:', e.message);
    }
}

startBot();
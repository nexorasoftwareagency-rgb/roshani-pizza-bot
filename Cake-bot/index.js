/**
 * ROSHANI ERP | WHATSAPP BOT CORE v4.0
 * Single-Outlet Instance (Pizza-Bot / Cake-Bot)
 */

// =============================
// OUTLET CONFIGURATION
// Change ONLY these values to switch between Pizza and Cake instances.
// =============================
const OUTLET = 'cake';                        // 'pizza' or 'cake'
const OUTLET_NAME = 'Roshani Cake';             // Display name
const OUTLET_EMOJI = '🎂';                     // Brand emoji
const OTHER_OUTLET_NAME = 'Roshani Pizza';       // Cross-promo name
const OTHER_OUTLET_EMOJI = '🍕';               // Cross-promo emoji
const OTHER_OUTLET_NUMBER = '';                 // Cross-promo WhatsApp number (set on deploy)

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { getData, setData, updateData, db, pushData, getUserProfile, saveUserProfile } = require('./firebase');

// --- GLOBAL STATE ---
const sessions = {};
const processedStatus = {};
const processedOTP = {};
let reportInterval = null;
let dailyReportSent = false;
let weeklyReportSent = false;
let monthlyReportSent = false;
const startupTime = Date.now();

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
            } else if (cmd.action === "SEND_GENERIC_MESSAGE") {
                const jid = formatJid(cmd.phone);
                if (jid) {
                    await sock.sendMessage(jid, { text: cmd.message });
                    console.log(`[Bot] Generic message sent to ${cmd.phone}`);
                }
            }
            // Remove the command after processing
            await snap.ref.remove();
        } catch (err) {
            console.error("[Bot] Command Execution Error:", err);
        }
    });
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

async function generateOrderId(outlet = OUTLET) {
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

async function appendContactInfo(text, outlet = OUTLET) {
    if (!text) return '';
    try {
        const storeSettings = await getData("settings/Store", outlet) || {};
        const deliverySettings = await getData("settings/Delivery", outlet) || {};
        const DEVELOPER_NUMBER = "919724649971";
        
        // Priority: Store phone -> Notify Phone -> Report Phone -> Developer
        let adminNum = storeSettings.phone || deliverySettings.notifyPhone || deliverySettings.reportPhone || DEVELOPER_NUMBER;
        
        // Clean number for wa.me link
        let cleanAdmin = String(adminNum).replace(/\D/g, '');
        if (cleanAdmin.length === 10) cleanAdmin = "91" + cleanAdmin;
        
        return `${text}\n\n━━━━━━━━━━━━━━━━━━━━\n💬 *NEED HELP?*\nContact Outlet Manager: *${adminNum}*\nClick to Message: https://wa.me/${cleanAdmin}`;
    } catch (e) {
        return text;
    }
}

async function sendImage(sock, to, image, text, outlet = OUTLET) {
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

async function deductInventoryStock(sock, items, outlet = OUTLET) {
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

                // Atomic update
                await inventoryRef.child(id).update({ 
                    stock: newStock,
                    updatedAt: new Date().toISOString()
                });

                // Threshold Alert
                if (newStock <= threshold && notifyPhone) {
                    const alertMsg = `⚠️ *LOW STOCK ALERT* ⚠️\n━━━━━━━━━━━━━━━━━━━━\n` +
                        `📦 Item: *${data.name}*\n` +
                        `📉 Current Stock: *${newStock}*\n` +
                        `🚩 Threshold: *${threshold}*\n\n` +
                        `_Please refill stock from Admin Panel immediately!_`;
                    
                    const jid = formatJid(notifyPhone);
                    if (jid) await sock.sendMessage(jid, { text: alertMsg });
                }
            }
        }
    } catch (e) {
        console.error("[INVENTORY] ❌ Stock Deduction Error:", e);
    }
}

async function getRiderByEmail(email, outlet = OUTLET) {
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

async function addInAppNotification(uid, title, body, type = 'info', icon = 'bell', outlet = OUTLET) {
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
        "Why did the cake go to the doctor? It was feeling a bit 'crumb-y'! 🎂",
        "What's a cake's favorite movie? 'Piece of cake'! 🎬",
        "What do you call a fake cake? A 'sham-rock'! 🎂",
        "How do you fix a broken cake? With some 'icing' on the cake! 🍰",
        "Why did the baker go to jail? He was caught 'kneading' the dough too much! 🍞",
        "What's a cake's favorite song? 'Sweet Caroline'! 🎵",
        "Why did the cake delivery guy get a promotion? He always 'delivered' on time! 🚲",
        "What do you call a sleepy cake? A 'doze-ert'! 😴",
        "Why did the strawberry turn red? Because it saw the cake dressing! 🍓",
        "What's the best way to eat cake? With your mouth! 😋"
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
}

function getFoodFunnyProgress(status, name = "") {
    const bars = {
        "Confirmed": "✅⬜⬜⬜⬜",
        "Preparing": "✅👨‍🍳⬜⬜⬜",
        "Cooked": "✅👨‍🍳🔥⬜⬜",
        "Out for Delivery": "✅👨‍🍳🔥📦🚀",
        "Delivered": `✅👨‍🍳🔥📦${OUTLET_EMOJI}`
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
        case "CART_VIEW":
            helpMsg += "Please reply with *1* to Proceed to Checkout or *2* to Clear Cart.";
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
    const outlet = user.outlet || OUTLET;
    const categories = await getData('categories', outlet);
    if (!categories) return sock.sendMessage(sender, { text: "❌ No categories available right now." });

    user.categoryList = Object.entries(categories)
        .map(([id, val]) => ({ id, ...val }))
        .sort((a, b) => (a.order || 999) - (b.order || 999));
    
    const botSettings = await getData("settings/Bot", outlet) || {};
    const storeSettings = await getData("settings/Store", outlet) || {};
    const storeName = storeSettings.storeName || `${OUTLET_NAME}`;
    
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
        msg += `You haven't added anything to your cart yet. ${OUTLET_EMOJI}\n\n`;
        msg += `1️⃣  *Browse Menu* 🍽️\n`;
        msg += `🏠 *0* Main Menu`;
        user.step = "EMPTY_CART_VIEW";
        return sock.sendMessage(sender, { text: msg });
    }
    const { lines, subtotal } = formatCartSummary(user.cart);
    let msg = isAdded ? `✅ *ADDED TO CART!* 🛒\n\n` : `🛒 *YOUR CART SUMMARY*\n\n`;
    msg += lines;
    msg += `💰 *Subtotal: ₹${subtotal}*\n\n`;
    msg += `1️⃣  *Add another item* ${OUTLET_EMOJI}\n`;
    msg += `2️⃣  *Proceed to Checkout* 🚀\n`;
    msg += `3️⃣  *Clear Cart* 🗑️\n`;
    msg += `0️⃣  *Back* 🔙\n\n`;
    msg += `_Reply with 1, 2, 3 or 0_`;
    user.step = "CART_VIEW";
    return sock.sendMessage(sender, { text: await appendContactInfo(msg, user.outlet) });
}


async function notifyAdmin(sock, orderId, order, type = 'NEW') {
    try {
        const outlet = order.outlet || OUTLET;
        const jids = await getReportRecipients();
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
                updateData(`bot/logs/${id}`, { error: "No valid JID", phone: order.phone, type, timestamp: Date.now() }).catch(()=>{});
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
        
        // Track OTP changes to trigger resend notifications even if status is same
        const storedOTP = order.deliveryOTP || order.otp || order.otpCode;
        const isOtpChanged = processedStatus[id] && 
                            processedStatus[id].lastOtp && 
                            storedOTP &&
                            processedStatus[id].lastOtp !== storedOTP;

        const maskedJid = maskJid(jid);
        console.log(`[Status Update] 🔍 Processing Order #${id.slice(-5)} | Status: ${currentStatus} | OTP Changed: ${isOtpChanged} | Target: ${maskedJid}`);

        if (!processedStatus[id] || processedStatus[id].status !== currentStatus || isNew || isOtpChanged) {
            console.log(`[Status Update] 📤 SENDING MESSAGE: #${id.slice(-5)} -> ${currentStatus}${isOtpChanged ? ' (New OTP)' : ''} to ${maskedJid}`);
            
            const currentRider = order.riderId || order.assignedRider || "";
            const lastRider = processedStatus[id]?.riderId || "";
            const isRiderChanged = currentRider && currentRider !== lastRider;

            processedStatus[id] = { 
                status: currentStatus, 
                timestamp: Date.now(),
                lastOtp: storedOTP,
                riderId: currentRider
            };

            console.log(`[Status Update] 🔔 State Updated for #${id.slice(-5)}: Status=${currentStatus}, Rider=${currentRider || 'None'}`);

            // NEW: Notify Rider on Assignment
            if (isRiderChanged) {
                console.log(`[RIDER] 🔄 Rider Change Detected for #${id.slice(-5)}: ${lastRider} -> ${currentRider}`);
                await notifyRiderAssignment(sock, id, order);
            }

            const botSettings = await getData("settings/Bot", order.outlet || OUTLET) || {};
            let msg = "";
            let img = null;

            if (statusLower === "placed") {
                msg = `🎉 *ORDER PLACED!* ${OUTLET_EMOJI}\n━━━━━━━━━━━━━━━━━━━━\n🆔 *Order ID:* #${id.slice(-5)}\n\nThank you for your order! 🙏\nWe have received it and our team is reviewing it now. ⏳\n\nYou will receive an update as soon as it's confirmed! ❤️\n${getFoodFunnyProgress("Placed")}`;
                img = botSettings.imgPlaced || botSettings.imgConfirmed;
            } else if (statusLower === "confirmed") {
                if (isDineIn && isNew) {
                    msg = `${OUTLET_EMOJI} *WELCOME TO ROSHANI ${OUTLET_NAME.toUpperCase()}!* ✨\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nYour counter order has been *CONFIRMED*! 🎊\n\n🆔 *Order ID:* #${id.slice(-5)}\n👤 *Customer:* ${order.customerName || 'Guest'}\n${order.tableNo ? `🪑 *Table No:* ${order.tableNo}\n` : ''}━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nYour delicious meal is being prepared right now! 👨‍🍳🔥\n\n_Thank you for dining with us!_ 🙏`;
                } else {
                    msg = `✅ *ORDER CONFIRMED!* 🎊\n━━━━━━━━━━━━━━━━━━━━\n${formatOrderInvoice(id, order)}\nYour order is being prepared with love! ❤️\n${getFoodFunnyProgress("Confirmed")}`;
                }
                img = botSettings.imgConfirmed;
            } else if (statusLower === "preparing") {
                msg = `👨‍🍳 *NOW PREPARING!* 🔥\n━━━━━━━━━━━━━━━━━━━━\nYour order #${id.slice(-5)} is now in the kitchen! 👨‍🍳\n\nIt won't be long now! ${OUTLET_EMOJI}\n${getFoodFunnyProgress("Preparing")}`;
                img = botSettings.imgPreparing;
            } else if (statusLower === "cooked") {
                msg = `🔥 *KITCHEN FINISHED!* 🔥\n━━━━━━━━━━━━━━━━━━━━\nChef has finished cooking your order #${id.slice(-5)}! ${OUTLET_EMOJI}\n\nMoving to packing station... ❤️\n${getFoodFunnyProgress("Cooked")}`;
                img = botSettings.imgCooked;
                
                if (!isDineIn) {
                    if (order.riderPhone) {
                        await notifyRiderPickup(sock, order);
                    } else {
                        await broadcastPickupAvailable(sock, id, order);
                    }
                }
            } else if (statusLower === "ready" || statusLower === "packed") {
                msg = `📦 *PACKED & READY!* 🚀\n━━━━━━━━━━━━━━━━━━━━\nYour delicious order #${id.slice(-5)} is ready and packed! 🍱\n\n${isDineIn ? "It's ready to be served! 🍽️" : "Waiting for the rider to pick it up. 🛵"}\n${getFoodFunnyProgress("Ready")}`;
                img = botSettings.imgReady || botSettings.imgCooked;
                
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
                    const rider = (riderId.includes('@')) ? await getRiderByEmail(riderId, order.outlet || OUTLET) : { name: order.riderName, phone: order.riderPhone };
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
                let otp = storedOTP || '---';
                if (isOtpChanged) {
                    msg = `🔑 *NEW DELIVERY OTP!* 🔄\n━━━━━━━━━━━━━━━━━━━━\nYour previous code is now invalid. Please use the new one below for your delivery #${id.slice(-5)}:\n\n🔑 *NEW OTP:* ${otp}\n💰 *Total:* ₹${order.total || 0}\n\n_Share this code ONLY with the rider upon arrival._`;
                } else {
                    msg = `📍 *RIDER ARRIVED!* 🛵\n━━━━━━━━━━━━━━━━━━━━\nOur rider has reached your drop location with your order #${id.slice(-5)}! ${OUTLET_EMOJI}\n\nPlease meet the rider and keep your OTP ready:\n\n🔑 *OTP:* ${otp}\n\n_Thank you for choosing ${OUTLET_NAME}!_`;
                }
                img = botSettings.imgOut;
            } else if (statusLower === "delivered" || statusLower === "served") {
                msg = `✅ *${isDineIn ? 'SERVED' : 'DELIVERED'} SUCCESSFULLY!* ${OUTLET_EMOJI}❤️\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🆔 *Order ID:* #${id.slice(-5)}\n🤝 *Payment:* ${order.paymentMethod}\n💵 *Total Paid:* ₹${order.total || 0}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n*Enjoy your meal!* 😋\n\n${getFunnyFoodJoke()}`;
                img = botSettings.imgDelivered;
            } else if (statusLower === "cancelled") {
                msg = `❌ *ORDER CANCELLED* ❌\n━━━━━━━━━━━━━━━━━━━━\nWe're sorry, your order #${id.slice(-5)} has been cancelled.\n\nReason: ${order.cancelReason || "Store Busy / Technical Issue"}\n\nIf you have any questions, please contact us. 🙏`;
            }

            const prevStatus = processedStatus[id]?.status || "None";
            console.log(`[BOT] 🔔 Status Change for #${id.slice(-5)}: ${prevStatus} -> ${currentStatus} (${jid ? 'Valid JID' : 'NO JID'})`);

            if (msg) {
                console.log(`[BOT] 📧 Sending ${currentStatus} notification to ${maskJid(jid)}...`);
                const sendResult = await sendImage(sock, jid, img, msg, order.outlet || OUTLET);
                
                processedStatus[id] = { 
                    ...processedStatus[id],
                    status: currentStatus, 
                    lastOtp: storedOTP, 
                    timestamp: Date.now() 
                };

                updateData(`bot/logs/${id}`, { 
                    lastSent: currentStatus, 
                    jid: maskJid(jid), 
                    success: true,
                    timestamp: Date.now() 
                }).catch(()=>{});
            } else {
                processedStatus[id] = { 
                    ...processedStatus[id],
                    status: currentStatus, 
                    lastOtp: storedOTP, 
                    timestamp: Date.now() 
                };
            }
        } else {
            if (processedStatus[id] && processedStatus[id].status === currentStatus) {
            } else if (!jid) {
            }
        }
    } catch (err) { 
        console.error("Status Update Error:", err);
        updateData(`bot/logs/${id}`, { error: err.message, timestamp: Date.now() }).catch(()=>{});
    }
}

// =============================
// 4A. DAILY & MONTHLY REPORT FUNCTIONS
// =============================

async function sendDailyReport(sock, targetDate = null) {
    try {
        const outlets = [OUTLET];
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

                    if (order.status === "Delivered" || order.status === "Confirmed" || order.paymentStatus === "Paid") {
                        outletRevenue += parseFloat(order.total || 0);
                    }
                }
            });
            
            if (outletOrders > 0) {
                reportDetails += `\n${OUTLET_EMOJI} *${outlet.toUpperCase()} OUTLET:*\n`;
                reportDetails += `   📦 Total Orders: ${outletOrders}\n`;
                reportDetails += `   💰 Real Sales: ₹${outletRevenue.toLocaleString()}\n`;
                
                const breakdownStr = Object.entries(statusBreakdown)
                    .map(([s, count]) => `      ▫️ ${s}: ${count}`)
                    .join('\n');
                reportDetails += `   📊 Breakdown:\n${breakdownStr}\n`;
            }
            
            totalOrders += outletOrders;
            totalRevenue += outletRevenue;
        }
        
        const jids = await getReportRecipients();
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
        
        const outlets = [OUTLET];
        for (const outlet of outlets) {
            const orders = await getData(`${outlet}/orders`);
            if (!orders) continue;
            
            let outletOrders = 0;
            let outletRevenue = 0;
            
            Object.values(orders).forEach(order => {
                const orderTime = order.createdAt ? new Date(order.createdAt).getTime() : 0;
                if (orderTime >= startOfMonth) {
                    outletOrders++;
                    if (order.status === "Delivered" || order.status === "Confirmed" || order.paymentStatus === "Paid") {
                        outletRevenue += parseFloat(order.total || 0);
                    }
                }
            });
            
            if (outletOrders > 0) {
                reportDetails += `\n${OUTLET_EMOJI} *${outlet.toUpperCase()} OUTLET:*\n`;
                reportDetails += `   📦 Orders: ${outletOrders}\n`;
                reportDetails += `   💰 Revenue: ₹${outletRevenue.toLocaleString()}\n`;
            }
            
            totalOrders += outletOrders;
            totalRevenue += outletRevenue;
        }
        
        const jids = await getReportRecipients();
        
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
        
        const outlets = [OUTLET];
        for (const outlet of outlets) {
            const orders = await getData(`${outlet}/orders`);
            if (!orders) continue;
            
            let outletOrders = 0;
            let outletRevenue = 0;
            
            Object.values(orders).forEach(order => {
                const orderTime = order.createdAt ? new Date(order.createdAt).getTime() : 0;
                if (orderTime >= weekStartTime) {
                    outletOrders++;
                    if (order.status === "Delivered" || order.status === "Confirmed" || order.paymentStatus === "Paid") {
                        outletRevenue += parseFloat(order.total || 0);
                    }
                }
            });
            
            if (outletOrders > 0) {
                reportDetails += `\n${OUTLET_EMOJI} *${outlet.toUpperCase()} OUTLET:*\n`;
                reportDetails += `   📦 Orders: ${outletOrders}\n`;
                reportDetails += `   💰 Revenue: ₹${outletRevenue.toLocaleString()}\n`;
            }
            
            totalOrders += outletOrders;
            totalRevenue += outletRevenue;
        }
        
        const jids = await getReportRecipients();
        
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
        const status = (order.status || "").toLowerCase();
        if (!["ready", "cooked", "packed"].includes(status)) {
            console.log(`[RIDER] ⏳ Skipping assignment notification for #${orderId.slice(-5)}: Status is ${order.status}. Rider will be notified once it is READY.`);
            return;
        }

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
        const outlet = order.outlet || OUTLET;
        const riders = await getData("riders", outlet) || {};
        
        const onlineRiders = Object.entries(riders)
            .map(([uid, data]) => ({ uid, ...data }))
            .filter(r => r.status === "Online" && r.phone);
        
        console.log(`[RIDER] 📢 Broadcasting pickup for #${orderId.slice(-5)} to ${onlineRiders.length} online riders.`);
        
        if (onlineRiders.length === 0) {
            console.log(`[RIDER] ⚠️ No online riders available for broadcast of #${orderId.slice(-5)}`);
            return;
        }

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
            `🏪 *Outlet:* ${(order.outlet || OUTLET).toUpperCase()}\n\n` +
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

async function startBot() {
    console.log(`🚀 Starting ${OUTLET_NAME} WhatsApp Bot (${OUTLET})...`);
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
    initCommandListener(sock);

    if (reportInterval) clearInterval(reportInterval);
    reportInterval = setInterval(async () => {
        cleanupSessions();
        cleanupStaleOrders(sock);
        updateData(`bot/${OUTLET}/status`, { lastSeen: Date.now(), status: 'Online', outlet: OUTLET }).catch(() => {});
        
        const ist = getISTDateInfo();
        const hour = ist.hour;
        const minute = ist.minute;
        
        if (hour === 21 && minute === 30 && !dailyReportSent) {
            await sendDailyReport(sock);
            dailyReportSent = true;
        }
        
        if (hour === 1 && minute === 30 && !dailyReportSent) {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const yDateStr = getISTDateString(yesterday.toISOString());
            await sendDailyReport(sock, yDateStr);
            dailyReportSent = true; 
        }

        if (hour === 4 && minute === 0) {
            dailyReportSent = false;
            weeklyReportSent = false;
            monthlyReportSent = false;
        }
    }, 60000);

    const orderRef = db.ref(`${OUTLET}/orders`);
    orderRef.off("child_changed");
    orderRef.off("child_added");
    
    orderRef.on("child_changed", (snap) => {
        const order = snap.val();
        if (order) handleOrderStatusUpdate(sock, snap.key, order);
    });
    orderRef.on("child_added", (snap) => {
        const order = snap.val();
        if (!order) return;
        
        const orderTime = order.createdAt ? new Date(order.createdAt).getTime() : 0;
        const type = (order.type || order.orderType || "").toLowerCase();
        const isDineIn = type.includes("dine") || type.includes("walk");
        
        const timeBuffer = isDineIn ? 1800000 : 10000; 

        if (!processedStatus[snap.key] && orderTime > startupTime - timeBuffer) {
            handleOrderStatusUpdate(sock, snap.key, order, true);
        } else {
            processedStatus[snap.key] = { status: order.status, timestamp: Date.now() };
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'open') console.log(`✅ ${OUTLET_NAME.toUpperCase()} BOT IS ONLINE`);
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) setTimeout(startBot, 5000);
            else console.log("❌ Logged out. Delete session folder and restart.");
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        try {
            if (m.type !== 'notify') return;
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const sender = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
            const pushName = msg.pushName || "";

            if (!sessions[sender]) {
                const profile = await getUserProfile(sender, OUTLET);
                sessions[sender] = { 
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
                    sessions[sender].hasProfile = true;
                }
            }
            const user = sessions[sender];
            user.lastActivity = Date.now();

            const now = Date.now();
            if (now - user.lastReset > 60000) {
                user.msgCount = 0;
                user.lastReset = now;
            }
            user.msgCount++;

            const DEVELOPER_NUMBER = "9724649971";
            const adminNumbers = await getReportRecipients();
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
                    const statusMsg = `🤖 *BOT STATUS DASHBOARD*\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `✅ Status: *Online*\n` +
                        `⏱️ Uptime: *${uptime} mins*\n` +
                        `📊 Orders in Memory: *${Object.keys(processedStatus).length}*\n` +
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
                sessions[sender] = { step: "START", current: {}, cart: [] };
                return sock.sendMessage(sender, { text: "❌ *Order Reset.* Reply with any message to start again." });
            }

            if (user.step === "START") {
                user.outlet = OUTLET; 
                const store = await getData("settings/Store", OUTLET);
                const bot = await getData("settings/Bot", OUTLET);
                
                if (store && !isShopOpen(store.shopOpenTime, store.shopCloseTime, store.shopStatus)) {
                    return sock.sendMessage(sender, { text: `🌙 *${OUTLET_NAME.toUpperCase()} IS CLOSED*\n\nHours: ${store.shopOpenTime || 'N/A'} - ${store.shopCloseTime || 'N/A'}\n\nSee you later! 👋` });
                }
                
                return sendCategories(sock, sender, user);
            }


            if (user.step === "CATEGORY") {
                if (text === "0") { 
                    user.step = "START";
                    return sock.sendMessage(sender, { text: `🏠 *Main Menu* — Send any message to restart.` });
                }
                if (text === "9") return sendCartView(sock, sender, user);
                const cat = user.categoryList[parseInt(text) - 1];
                if (!cat) return sendInvalidInputHelp(sock, sender, user);

                const dishes = await getData(`dishes`, user.outlet) || {};
                const inventory = await getData(`inventory`, user.outlet) || {};

                user.dishList = Object.entries(dishes)
                    .filter(([id, d]) => d.category === cat.name && d.available !== false)
                    .map(([id, d]) => {
                        const invItem = Object.values(inventory).find(inv => inv.name.toLowerCase() === d.name.toLowerCase());
                        const stockCount = invItem ? (invItem.stock || 0) : 999; 
                        return { id, ...d, inStock: stockCount > 0 };
                    })
                    .sort((a, b) => (a.order || 999) - (b.order || 999));

                if (user.dishList.length === 0) return sock.sendMessage(sender, { text: "❌ No items in this category." });

                let dMsg = `🍽️ *${cat.name.toUpperCase()}*\n\n`;
                user.dishList.forEach((d, i) => { 
                    dMsg += `${i + 1}️⃣  *${d.name}* ${d.inStock ? "" : "— _(Sold Out)_ 🚫"}\n\n`; 
                });
                dMsg += `🛒 *9* View Cart\n0️⃣ *Take one step Back* 🔙`;
                user.step = "DISH";
                return await sendImage(sock, sender, cat.image, dMsg);
            }

            if (user.step === "DISH") {
                if (text === "0") return sendCategories(sock, sender, user);
                if (text === "9") return sendCartView(sock, sender, user);
                const dish = user.dishList[parseInt(text) - 1];
                if (!dish) return sendInvalidInputHelp(sock, sender, user);
                
                if (!dish.inStock) {
                    const helpMsg = `🚫 *SORRY!* \n\n*${dish.name}* is currently out of stock. Please select another delicious item! 😋\n\n` +
                                   `💡 *Need help?* Contact our manager here: https://wa.me/919724649971?text=Hi, is ${dish.name} available soon?`;
                    
                    await notifyAdminOfStockOut(sock, dish.name, user.outlet, false);

                    return sock.sendMessage(sender, { text: await appendContactInfo(helpMsg, user.outlet) });
                }

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

                return sendCartView(sock, sender, user, true);
            }


            if (user.step === "EMPTY_CART_VIEW") {
                if (text === "1") return sendCategories(sock, sender, user);
                if (text === "0") { return sendCategories(sock, sender, user); }
                return sock.sendMessage(sender, { text: "⚠️ Reply *1* to browse menu or *0* to go back." });
            }

            if (user.step === "CART_VIEW") {
                if (text === "1") return sendCategories(sock, sender, user);
                if (text === "2") { 
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
                if (text === "3") { 
                    sessions[sender] = { step: "START", current: {}, cart: [], profile: user.profile }; 
                    return sock.sendMessage(sender, { text: await appendContactInfo("🗑️ Cart cleared. Reply with any message to start again.", user.outlet) }); 
                }
                if (text === "0") {
                    return sendCategories(sock, sender, user);
                }
                return sendInvalidInputHelp(sock, sender, user);
            }

            if (user.step === "REUSE_PROFILE") {
                if (text === "1") {
                    user.name = user.profile.name;
                    user.phone = user.profile.phone;
                    user.address = user.profile.address;
                    
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
                    await saveUserProfile(sender, { name: user.name, phone: user.phone || "" }, OUTLET);
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
                        total: subtotal,
                        subtotal: subtotal,
                        reason: "Cancelled at final invoice step",
                        outlet: user.outlet || OUTLET
                    };
                    
                    await setData(`logs/lostSales/${lostId}`, lostData);
                    
                    // Notify Admin
                    await notifyAdmin(sock, lostId, { 
                        customerName: user.name || "Anonymous", 
                        phone: user.phone || "N/A", 
                        total: subtotal,
                        outlet: user.outlet || OUTLET
                    }, 'CANCELLED');

                    delete sessions[sender]; 
                    return sock.sendMessage(sender, { text: await appendContactInfo("❌ Order Cancelled. We hope to serve you next time! 🙏", user.outlet) }); 
                }
                if (text === "1") {
                    // Directly Place Order as COD
                    const orderId = await generateOrderId(user.outlet);
                    const { subtotal } = formatCartSummary(user.cart);
                    const deliveryFee = user.deliveryFee || 0;

                    const finalOrder = {
                        orderId, outlet: user.outlet, 
                        type: "Online",
                        customerName: escapeHtml(user.name),
                        phone: user.phone, 
                        whatsappNumber: sender,
                        address: escapeHtml(user.address),
                        lat: user.location.lat, lng: user.location.lng,
                        subtotal, deliveryFee, total: subtotal + deliveryFee - (user.discount || 0),
                        status: "Placed", paymentMethod: "Cash", paymentStatus: "Pending",
                        createdAt: new Date().toISOString(),
                        assignedRider: "",
                        items: user.cart
                    };

                    await setData(`orders/${orderId}`, finalOrder, user.outlet);
                    await notifyAdmin(sock, orderId, finalOrder, 'NEW');

                    // Auto-Deduct Inventory Stock
                    await deductInventoryStock(sock, user.cart, user.outlet);

                    // Save user profile
                    await saveUserProfile(sender, {
                        name: user.name,
                        phone: user.phone,
                        address: user.address,
                        location: user.location,
                        lastOutlet: user.outlet
                    }, OUTLET);
                    
                    if (user.phone) {
                        const cleanPhone = String(user.phone).replace(/\D/g, '').slice(-10);
                        const custData = {
                            name: user.name,
                            phone: cleanPhone,
                            address: user.address || "",
                            location: user.location || null,
                            mapsLink: user.location ? `https://maps.google.com/?q=${user.location.lat},${user.location.lng}` : "",
                            lastOrderDate: new Date().toISOString()
                        };
                        await updateData(`customers/${cleanPhone}`, custData, user.outlet);
                    }

                    let successMsg = `🎉 *ORDER PLACED SUCCESSFULLY!* 🎉\n`;
                    successMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    successMsg += `🆔 *Order ID:* #${orderId.slice(-5)}\n`;
                    successMsg += `🏪 *Shop:* ${OUTLET_NAME}\n`;
                    successMsg += `💳 *Payment:* COD (Cash on Delivery)\n`;
                    successMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    successMsg += `*Please wait while the admin confirms your order!* ⏳\n\n`;
                    successMsg += `Total: ₹${finalOrder.total}`;

                    await sock.sendMessage(sender, { text: await appendContactInfo(successMsg, user.outlet) });
                    delete sessions[sender];
                    return;
                }
                return sendInvalidInputHelp(sock, sender, user);
            }

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
            lat: parseFloat(storeSettings?.lat || (OUTLET === 'cake' ? 25.887472 : 25.887944)),
            lng: parseFloat(storeSettings?.lng || (OUTLET === 'cake' ? 85.026861 : 85.026194))
        };

        const dist = calculateDistance(user.location.lat, user.location.lng, outletCoords.lat, outletCoords.lng);
        const fee = getFeeFromSlabs(dist, delSettings.slabs || []);

        user.deliveryFee = fee;
        const { lines, subtotal } = formatCartSummary(user.cart);
        user.step = "CONFIRM_PAY";

        let sum = `🧾 *INVOICE*\n`;
        sum += `━━━━━━━━━━━━━━━━━━━━\n`;
        sum += `${lines}`;
        sum += `━━━━━━━━━━━━━━━━━━━━\n`;
        sum += `💰 Subtotal: ₹${subtotal}\n`;
        sum += `🚚 Delivery (${dist.toFixed(1)}km): ₹${fee}\n`;
        if (user.discount) sum += `🎁 Discount Allotted: -₹${user.discount}\n`;
        sum += `💵 *TOTAL: ₹${subtotal + fee - (user.discount || 0)}*\n`;
        sum += `💳 *Payment:* COD (Cash on Delivery)\n`;
        sum += `━━━━━━━━━━━━━━━━━━━━\n`;
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
// INVENTORY & UTILS
// =============================

async function deductInventoryStock(sock, cart, outlet) {
    try {
        const inventory = await getData("inventory", outlet) || {};
        for (const item of cart) {
            const invItemEntry = Object.entries(inventory).find(([id, inv]) => 
                inv.name.toLowerCase() === item.name.toLowerCase()
            );
            
            if (invItemEntry) {
                const [invId, invItem] = invItemEntry;
                const newStock = Math.max(0, (invItem.stock || 0) - (item.quantity || 1));
                await updateData(`inventory/${invId}`, { stock: newStock }, outlet);
                
                if (newStock === 0) {
                    await notifyAdminOfStockOut(sock, item.name, outlet, true);
                }
            }
        }
    } catch (e) { console.error("Deduct Stock Error:", e); }
}

async function notifyAdminOfStockOut(sock, itemName, outlet, isSoldOut = false) {
    try {
        const jids = await getReportRecipients();
        const storeSettings = await getData("settings/Store", outlet) || {};
        const storeName = storeSettings.storeName || (outlet === 'pizza' ? "Roshani Pizza" : "Roshani Cake");
        
        let msg = isSoldOut 
            ? `🛑 *STOCK DEPLETED:* \n\n*${itemName}* is now *OUT OF STOCK* at *${storeName}*.\n\nPlease update inventory levels soon.`
            : `⚠️ *STOCK ALERT:* \n\nA customer tried to order *${itemName}*, but it was *OUT OF STOCK* at *${storeName}*.`;

        for (const jid of jids) {
            await sock.sendMessage(jid, { text: msg });
        }
    } catch (e) { console.error("Stock Out Notify Error:", e); }
}

async function appendContactInfo(msg, outlet) {
    try {
        const store = await getData("settings/Store", outlet) || {};
        const phone = store.phone || "9724649971";
        const name = store.storeName || "Roshani ERP";
        return `${msg}\n\n━━━━━━━━━━━━━━━━━━━━\n📞 *Contact ${name}:* wa.me/91${phone}`;
    } catch (e) { return msg; }
}

startBot();
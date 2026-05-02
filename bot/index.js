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

async function getReportRecipients() {
    const recipients = new Set();
    const fallback = "919876543210";
    
    try {
        // Try to get from pizza outlet settings (primary)
        const settings = await getData("settings/Delivery", "pizza") || {};
        const nums = [settings.reportPhone, settings.notifyPhone, settings.developerPhone];
        
        nums.forEach(n => {
            const jid = formatJid(n);
            if (jid) recipients.add(jid);
        });
        
        // Also check cake outlet for any additional numbers
        const cakeSettings = await getData("settings/Delivery", "cake") || {};
        const cakeNums = [cakeSettings.reportPhone, cakeSettings.notifyPhone];
        cakeNums.forEach(n => {
            const jid = formatJid(n);
            if (jid) recipients.add(jid);
        });
        
    } catch (e) {
        console.error("[Reports] Recipient Resolution Error:", e);
    }
    
    if (recipients.size === 0) recipients.add(formatJid(fallback));
    return Array.from(recipients);
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

async function appendContactInfo(text, outlet = 'pizza') {
    if (!text) return '';
    try {
        const storeSettings = await getData("settings/Store", outlet) || {};
        const deliverySettings = await getData("settings/Delivery", outlet) || {};
        const adminNum = storeSettings.phone || deliverySettings.reportPhone || "919876543210";
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
        console.error("Image Send Error:", err);
        await sock.sendMessage(to, { text: finalMsg });
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
        "Preparing": "✅👨‍🍳⬜⬜⬜",
        "Cooked": "✅👨‍🍳🔥⬜⬜",
        "Out for Delivery": "✅👨‍🍳🔥📦🚀",
        "Delivered": "✅👨‍🍳🔥📦🍕"
    };
    const bar = bars[status] || "⬜⬜⬜⬜⬜";
    return `\n*Progress:* [ ${bar} ]\n`;
}

async function sendInvalidInputHelp(sock, sender, user) {
    let helpMsg = "⚠️ *Invalid Selection.* ";
    switch (user.step) {
        case "OUTLET":
            helpMsg += "Please reply with *1* for Pizza Outlet or *2* for Cake Outlet.";
            break;
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
    const categories = await getData('categories', outlet);
    if (!categories) return sock.sendMessage(sender, { text: "❌ No categories available right now." });

    user.categoryList = Object.entries(categories).map(([id, val]) => ({ id, ...val }));
    
    const botSettings = await getData("settings/Bot", outlet) || {};
    const storeSettings = await getData("settings/Store", outlet) || {};
    const storeName = storeSettings.storeName || (outlet === 'pizza' ? "Roshani Pizza" : "Roshani Cake");
    const emoji = outlet === 'pizza' ? "🍕" : "🎂";
    const headerEmoji = outlet === 'pizza' ? "🔥" : "✨";
    
    let msg = `✨ *${storeName.toUpperCase()}* ✨\n`;
    msg += `🍽️ *SELECT CATEGORY - ${outlet.toUpperCase()}*\n\n`;
    
    user.categoryList.forEach((c, i) => { 
        msg += `${i + 1}️⃣  ${c.name}\n`; 
    });
    
    msg += `\n🛒 *9* View Cart\n🏠 *0* Main Menu\n\n`;
    msg += `_Reply with a number to browse_`;
    
    user.step = "CATEGORY";
    const menuImg = botSettings.menuImage || storeSettings.bannerImage;
    await sendImage(sock, sender, menuImg, msg);
}

async function sendCartView(sock, sender, user) {
    if (!user.cart || user.cart.length === 0) {
        let msg = `🛒 *YOUR CART IS EMPTY*\n\n`;
        msg += `You haven't added anything to your cart yet. 🍕\n\n`;
        msg += `1️⃣  *Browse Menu* 🍽️\n`;
        msg += `🏠 *0* Main Menu`;
        user.step = "EMPTY_CART_VIEW";
        return sock.sendMessage(sender, { text: msg });
    }
    const { lines, subtotal } = formatCartSummary(user.cart);
    let msg = `🛒 *YOUR CART SUMMARY*\n\n${lines}`;
    msg += `💰 *Subtotal: ₹${subtotal}*\n\n`;
    msg += `1️⃣  *Add another item* 🍕\n`;
    msg += `2️⃣  *Proceed to Checkout* 🚀\n`;
    msg += `3️⃣  *Clear Cart* 🗑️\n\n`;
    msg += `_Reply with 1, 2 or 3_`;
    user.step = "CART_VIEW";
    return sock.sendMessage(sender, { text: await appendContactInfo(msg, user.outlet) });
}

async function notifyAdmin(sock, orderId, order, type = 'NEW') {
    try {
        const outlet = order.outlet || 'pizza';
        const jids = await getReportRecipients();
        if (!jids || jids.length === 0) return;

        let msg = "";
        if (type === 'CANCELLED') {
            msg = `⚠️ *LOST SALE / ABANDONED* ⚠️\n━━━━━━━━━━━━━━━━━━━━\n👤 *Customer:* ${order.customerName || 'Anonymous'}\n📞 *Phone:* ${order.phone || 'N/A'}\n💰 *Potential Total:* ₹${order.total}\n🏪 *Outlet:* ${outlet.toUpperCase()}\n━━━━━━━━━━━━━━━━━━━━\n_User cancelled at final checkout step._`;
        } else {
            let itemsText = (order.items || []).map(i => `• ${i.name} (${i.size}) x${i.quantity}`).join('\n');
            let adminMsg = type === 'NEW' ? `🔔 *NEW ORDER RECEIVED!* 🔔\n` : `📦 *ORDER UPDATE* 📦\n`;
            adminMsg += `\n🆔 ID: #${orderId.slice(-5)}\n👤 Customer: ${order.customerName}\n📞 Phone: ${order.phone}\n📍 Address: ${order.address}\n\n📦 Items:\n${itemsText}\n\n💰 Total: ₹${order.total}\n💳 Method: ${order.paymentMethod}`;
            msg = adminMsg;
        }
        
        for (const jid of jids) {
            await sock.sendMessage(jid, { text: msg });
        }
    } catch (err) { console.error("Admin Notify Error:", err); }
}

async function handleOrderStatusUpdate(sock, id, order, isNew = false) {
    try {
        // FIX: Prefer the original sender JID (whatsappNumber) directly without formatting if it exists.
        // This avoids issues with prefixes like +91 or non-standard number lengths.
        let jid = order.whatsappNumber;
        if (!jid || !jid.includes('@')) {
            jid = formatJid(order.whatsappNumber || order.phone);
        }

        if (!jid) {
            console.error(`[Status Update] ❌ FAILED: No valid JID for order ${id}. Phone: ${order.phone}, whatsappNumber: ${order.whatsappNumber}`);
            return;
        }

        const currentStatus = (order.status || "").trim();
        const orderType = order.type || "Unknown";
        const phoneDisplay = order.phone || order.whatsappNumber || "N/A";
        
        // Track OTP changes to trigger resend notifications even if status is same
        const storedOTP = order.deliveryOTP || order.otp || order.otpCode;
        const isOtpChanged = processedStatus[id] && 
                            processedStatus[id].status === "Out for Delivery" && 
                            currentStatus === "Out for Delivery" && 
                            processedStatus[id].lastOtp && 
                            processedStatus[id].lastOtp !== storedOTP;

        console.log(`[Status Update] 🔍 Processing Order #${id.slice(-5)} | Status: ${currentStatus} | OTP Changed: ${isOtpChanged} | Target: ${jid}`);

        if (!processedStatus[id] || processedStatus[id].status !== currentStatus || isNew || isOtpChanged) {
            console.log(`[Status Update] 📤 SENDING MESSAGE: #${id.slice(-5)} -> ${currentStatus}${isOtpChanged ? ' (New OTP)' : ''} to ${jid}`);
            
            processedStatus[id] = { 
                status: currentStatus, 
                timestamp: Date.now(),
                lastOtp: storedOTP 
            };

            const botSettings = await getData("settings/Bot", order.outlet) || {};
            let msg = "";
            let img = null;

            if (order.status === "Placed") {
                msg = `🎉 *ORDER PLACED!* 🍕\n━━━━━━━━━━━━━━━━━━━━\n🆔 *Order ID:* #${id.slice(-5)}\n\nThank you for your order! 🙏\nWe have received it and our team is reviewing it now. ⏳\n\nYou will receive an update as soon as it's confirmed! ❤️\n${getFoodFunnyProgress("Placed")}`;
                img = botSettings.imgPlaced || botSettings.imgConfirmed;
            } else if (order.status === "Confirmed") {
                msg = `✅ *ORDER CONFIRMED!* 🎊\n━━━━━━━━━━━━━━━━━━━━\n${formatOrderInvoice(id, order)}\nYour order is being prepared with love! ❤️\n${getFoodFunnyProgress("Confirmed")}`;
                img = botSettings.imgConfirmed;
            } else if (order.status === "Preparing") {
                msg = `👨‍🍳 *NOW PREPARING!* 🔥\n━━━━━━━━━━━━━━━━━━━━\nYour order #${id.slice(-5)} is now in the kitchen! 👨‍🍳\n\nIt won't be long now! 🍕\n${getFoodFunnyProgress("Preparing")}`;
                img = botSettings.imgPreparing;
            } else if (order.status === "Cooked") {
                msg = `🔥 *KITCHEN FINISHED!* 🔥\n━━━━━━━━━━━━━━━━━━━━\nChef has finished cooking your order #${id.slice(-5)}! 🍕\n\nMoving to packing station... ❤️\n${getFoodFunnyProgress("Cooked")}`;
                img = botSettings.imgCooked;
            } else if (order.status === "Ready") {
                const isDineIn = orderType === 'Dine-in';
                msg = `📦 *PACKED & READY!* 🚀\n━━━━━━━━━━━━━━━━━━━━\nYour delicious order #${id.slice(-5)} is ready and packed! 🍱\n\n${isDineIn ? "It's ready to be served! 🍽️" : "Waiting for the rider to pick it up. 🛵"}\n${getFoodFunnyProgress("Ready")}`;
                img = botSettings.imgReady || botSettings.imgCooked;
                
                if (!isDineIn) {
                    if (order.riderPhone) {
                        await notifyRiderPickup(sock, order);
                    } else {
                        await broadcastPickupAvailable(sock, id, order);
                    }
                }
            } else if (order.status === "Picked Up" || order.status === "Out for Delivery") {
                if (orderType === 'Dine-in') return;
                
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
                    msg = `🔑 *NEW DELIVERY OTP!* 🔄\n━━━━━━━━━━━━━━━━━━━━\nYour previous code is now invalid. Please use the new one below for your delivery #${id.slice(-5)}:\n\n🔑 *NEW OTP:* ${otp}${riderInfoText}\n💰 *Total:* ₹${order.total}\n\n_Share this code ONLY with the rider upon arrival._`;
                } else {
                    msg = `🛵 *OUT FOR DELIVERY!* 🚀\n━━━━━━━━━━━━━━━━━━━━\nOur rider is on the way to your location! 🛵💨\n\n🆔 Order: #${id.slice(-5)}\n🔑 *OTP:* ${otp} (Share with rider only)${riderInfoText}\n💰 *Total:* ₹${order.total}\n${getFoodFunnyProgress("Out for Delivery")}`;
                }
                img = botSettings.imgOut;
            } else if (order.status === "Delivered") {
                const isDineIn = orderType === 'Dine-in';
                msg = `✅ *${isDineIn ? 'SERVED' : 'DELIVERED'} SUCCESSFULLY!* 🍕❤️\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🆔 *Order ID:* #${id.slice(-5)}\n🤝 *Payment:* ${order.paymentMethod}\n💵 *Total Paid:* ₹${order.total}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n*Enjoy your meal!* 😋\n\n${getFunnyFoodJoke()}`;
                img = botSettings.imgDelivered;
            } else if (currentStatus === "Cancelled") {
                msg = `❌ *ORDER CANCELLED* ❌\n━━━━━━━━━━━━━━━━━━━━\nWe're sorry, your order #${id.slice(-5)} has been cancelled.\n\nReason: ${order.cancelReason || "Store Busy / Technical Issue"}\n\nIf you have any questions, please contact us. 🙏`;
            }

            if (msg) {
                await sendImage(sock, jid, img, msg, order.outlet || 'pizza');
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
        
        const jids = await getReportRecipients();
        
        const msg = `📊 *DAILY SALES REPORT* 📊\n\n` +
            `📅 Date: ${now.toLocaleDateString('en-IN')}\n\n` +
            reportDetails + 
            `\n\n💵 *TOTAL:* ₹${totalRevenue.toLocaleString()}\n` +
            `📦 *TOTAL ORDERS:* ${totalOrders}\n\n` +
            `_Sent automatically by Roshani Bot_`;
        
        for (const jid of jids) {
            await sock.sendMessage(jid, { text: msg });
        }
        console.log(`📊 Daily report broadcast to ${jids.length} numbers`);
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
        
        const jids = await getReportRecipients();
        
        const msg = `📈 *MONTHLY SALES REPORT* 📈\n\n` +
            `📅 Month: ${now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}\n\n` +
            reportDetails + 
            `\n\n💵 *MONTHLY TOTAL:* ₹${totalRevenue.toLocaleString()}\n` +
            `📦 *TOTAL ORDERS:* ${totalOrders}\n\n` +
            `_Sent automatically by Roshani Bot_`;
        
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
        
        const jids = await getReportRecipients();
        
        const msg = `📊 *WEEKLY SALES REPORT* 📊\n\n` +
            `📅 Week: ${startOfWeek.toLocaleDateString('en-IN')} - ${now.toLocaleDateString('en-IN')}\n\n` +
            reportDetails + 
            `\n\n💵 *WEEKLY TOTAL:* ₹${totalRevenue.toLocaleString()}\n` +
            `📦 *TOTAL ORDERS:* ${totalOrders}\n\n` +
            `_Sent automatically by Roshani Bot_`;
        
        for (const jid of jids) {
            await sock.sendMessage(jid, { text: msg });
        }
        console.log(`📊 Weekly report broadcast to ${jids.length} numbers`);
    } catch (err) { console.error("Weekly Report Error:", err); }
}

async function notifyRiderPickup(sock, order) {
    try {
        if (!order.riderPhone) return;
        
        const riderJid = formatJid(order.riderPhone);
        
        let itemsText = (order.normalizedItems || order.items || []).map(i => `• ${i.name || i.item} (${i.size}) x${i.qty || i.quantity}`).join('\n');
        
        const msg = `🛵 *NEW PICKUP ASSIGNED* 🛵\n━━━━━━━━━━━━━━━━━━━━\n` +
            `🆔 *Order:* #${order.orderId?.slice(-5) || 'N/A'}\n` +
            `👤 *Customer:* ${order.customerName}\n` +
            `📞 *Phone:* ${order.phone}\n` +
            `📍 *Address:* ${order.address}\n\n` +
            `📝 *Note:* ${order.customerNote || 'None'}\n\n` +
            `📦 *INVOICE DETAILS:*\n${itemsText}\n\n` +
            `💰 *Total:* ₹${order.total} (${order.paymentMethod})\n` +
            `🔑 *OTP:* ${order.otp || 'N/A'} (Ask customer at delivery)\n` +
            `━━━━━━━━━━━━━━━━━━━━\n_Please confirm pickup on your portal!_`;
        
        await sock.sendMessage(riderJid, { text: msg });
    } catch (err) { console.error("Rider Pickup Notify Error:", err); }
}

async function addInAppNotification(riderUid, title, body, type = 'info', icon = 'bell', outlet = 'pizza') {
    try {
        const notifPath = `riders/${riderUid}/notifications/${Date.now()}`;
        await setData(notifPath, {
            title,
            body,
            type,
            icon,
            outlet,
            timestamp: Date.now(),
            read: false
        });
    } catch (err) { console.error("Add In-App Notification Error:", err); }
}

async function broadcastPickupAvailable(sock, orderId, order) {
    try {
        const riders = await getData("riders") || {};
        // Filter for riders who are Online and have a phone number
        const onlineRiders = Object.entries(riders)
            .map(([uid, data]) => ({ uid, ...data }))
            .filter(r => r.status === "Online" && r.phone);
        
        if (onlineRiders.length === 0) return;

        let itemsText = (order.normalizedItems || order.items || []).map(i => `• ${i.name || i.item} (${i.size}) x${i.qty || i.quantity}`).join('\n');
        
        const msg = `🔔 *PICKUP AVAILABLE* 🔔\n━━━━━━━━━━━━━━━━━━━━\n` +
            `🆔 *Order:* #${orderId.slice(-5)}\n` +
            `🏪 *Outlet:* ${(order.outlet || 'pizza').toUpperCase()}\n` +
            `👤 *Customer:* ${order.customerName || 'Guest'}\n` +
            `📞 *Phone:* ${order.phone || 'N/A'}\n` +
            `📍 *Address:* ${order.address || 'N/A'}\n\n` +
            `📦 *INVOICE:*\n${itemsText}\n\n` +
            `💰 *Earning:* ₹${order.deliveryFee || 0}\n` +
            `💵 *Total to Collect:* ₹${order.total || 0}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🚀 *Go to Rider Portal now to Accept!*`;

        for (const rider of onlineRiders) {
            const riderJid = formatJid(rider.phone);
            if (riderJid) {
                await sock.sendMessage(riderJid, { text: msg });
                // Also add in-app notification
                await addInAppNotification(rider.uid, "New Pickup Available!", `Order #${orderId.slice(-5)} is ready for pickup.`, 'success', 'shopping-bag', order.outlet);
            }
        }
    } catch (err) { console.error("Broadcast Error:", err); }
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
            // Only handle "new" orders if they were created after the bot started
            const orderTime = order.createdAt ? new Date(order.createdAt).getTime() : 0;
            if (order && !processedStatus[snap.key] && orderTime > startupTime - 10000) {
                handleOrderStatusUpdate(sock, snap.key, order, true);
            } else if (order) {
                // Just mark as processed without sending message
                processedStatus[snap.key] = { status: order.status, timestamp: Date.now() };
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
                const profile = await getUserProfile(sender);
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
                    // We will send the combined welcome message in the START step logic
                    sessions[sender].hasProfile = true;
                }
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
            if (user.msgCount > 40) {
                if (user.msgCount === 41) {
                    await sock.sendMessage(sender, { text: "⚠️ *System Busy.* Please wait a moment before sending more messages." });
                }
                return;
            }

            if (text.toLowerCase() === "cancel" || text.toLowerCase() === "reset") {
                sessions[sender] = { step: "START", current: {}, cart: [] };
                return sock.sendMessage(sender, { text: "❌ *Order Reset.* Reply with any message to start again." });
            }

            // STATE MACHINE
            if (user.step === "START") {
                const outlet = user.outlet || 'pizza';
                const store = await getData("settings/Store", outlet);
                const bot = await getData("settings/Bot", outlet);
                
                let welcome = "";
                if (user.hasProfile && user.name) {
                    welcome += `Welcome back, *${user.name}*! 👋\n`;
                    welcome += `Your favorite items are ready for you. 🍕\n\n`;
                } else {
                    welcome += `Hello *${pushName}*! 👋\n`;
                }
                
                welcome += `✨ *WELCOME TO ROSHANI PIZZA & CAKE* 🍕🎂\n`;
                welcome += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                welcome += `Delicious food, delivered fast to your doorstep! 🚀\n\n`;
                welcome += `Please select an outlet:\n`;
                welcome += `1️⃣ *Pizza Outlet* 🍕\n`;
                welcome += `2️⃣ *Cake Outlet* 🎂\n\n`;
                welcome += `_Reply with 1 or 2 to start_`;
                
                user.step = "OUTLET";
                const greetingImg = bot?.greetingImage || store?.bannerImage;
                return await sendImage(sock, sender, greetingImg, welcome);
            }

            if (user.step === "OUTLET") {
                if (text === "1") user.outlet = "pizza";
                else if (text === "2") user.outlet = "cake";
                else return sendInvalidInputHelp(sock, sender, user);

                const store = await getData("settings/Store", user.outlet) || {};
                if (!isShopOpen(store.shopOpenTime, store.shopCloseTime, store.shopStatus)) {
                    return sock.sendMessage(sender, { text: `🌙 *SHOP CLOSED*\n\nHours: ${store.shopOpenTime} - ${store.shopCloseTime}\n\nSee you later! 👋` });
                }
                return sendCategories(sock, sender, user);
            }


            if (user.step === "CATEGORY") {
                if (text === "0") { user.step = "START"; return sock.sendMessage(sender, { text: "🏠 Returning to Main Menu..." }); }
                if (text === "9") return sendCartView(sock, sender, user);
                const cat = user.categoryList[parseInt(text) - 1];
                if (!cat) return sendInvalidInputHelp(sock, sender, user);

                const dishes = await getData(`dishes`, user.outlet) || {};
                user.dishList = Object.entries(dishes)
                    .filter(([id, d]) => d.category === cat.name && d.available !== false)
                    .map(([id, d]) => ({ id, ...d }));

                if (user.dishList.length === 0) return sock.sendMessage(sender, { text: "❌ No items in this category." });

                let dMsg = `🍽️ *${cat.name.toUpperCase()}*\n\n`;
                user.dishList.forEach((d, i) => { dMsg += `${i + 1}️⃣  *${d.name}*\n💰 From ₹${d.price}\n\n`; });
                dMsg += `🛒 *9* View Cart\n🔙 *0* Back to Categories`;
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
                user.step = "SIZE";
                return await sendImage(sock, sender, dish.image, sMsg);
            }

            if (user.step === "SIZE") {
                const [size, price] = user.sizeList[parseInt(text) - 1] || [];
                if (!size) return sendInvalidInputHelp(sock, sender, user);

                user.current.size = size;
                user.current.unitPrice = price;
                user.current.addons = [];

                user.step = "QUANTITY";
                let qtyMsg = `🔢 *STEP 4: ENTER QUANTITY* 🍕\n\n`;
                qtyMsg += `*How many of this item would you like to order?*\n\n`;
                qtyMsg += `_Example: Reply with 1, 2, 5, etc._\n`;
                qtyMsg += `_Reply *0* if you want to cancel this item._`;
                return sock.sendMessage(sender, { text: await appendContactInfo(qtyMsg, user.outlet) }); 
            }

            if (user.step === "QUANTITY") {
                const qty = parseInt(text);
                if (qty === 0) {
                    user.step = "CATEGORY";
                    return sendCategories(sock, sender, user);
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
                    outlet: user.outlet
                });

                user.step = "ADDED_TO_CART";
                let addedMsg = `✅ *ADDED TO CART!* 🛒\n\n`;
                addedMsg += `1️⃣ *Add another item* 🍕\n`;
                addedMsg += `2️⃣ *View Cart & Checkout* 🛒`;
                return sock.sendMessage(sender, { text: await appendContactInfo(addedMsg, user.outlet) });
            }

            if (user.step === "ADDED_TO_CART") {
                if (text === "1") return sendCategories(sock, sender, user);
                if (text === "2") return sendCartView(sock, sender, user);
                return sock.sendMessage(sender, { text: "⚠️ Reply *1* to add more or *2* to view cart." });
            }

            if (user.step === "EMPTY_CART_VIEW") {
                if (text === "1") return sendCategories(sock, sender, user);
                if (text === "0") { user.step = "START"; return sock.sendMessage(sender, { text: "🏠 Returning to Main Menu..." }); }
                return sock.sendMessage(sender, { text: "⚠️ Reply *1* to browse menu or *0* for main menu." });
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
                        profileMsg += `2️⃣ No, enter new details`;
                        return sock.sendMessage(sender, { text: await appendContactInfo(profileMsg, user.outlet) });
                    }
                    user.step = "NAME"; 
                    let nameMsg = `👤 *STEP 1: ENTER YOUR FULL NAME* ✨\n\n`;
                    nameMsg += `Please provide your name so we can address you correctly and prepare your order.\n\n`;
                    nameMsg += `_Example: Rajesh Kumar_`;
                    return sock.sendMessage(sender, { text: await appendContactInfo(nameMsg, user.outlet) }); 
                }
                if (text === "3") { 
                    sessions[sender] = { step: "START", current: {}, cart: [], profile: user.profile }; 
                    return sock.sendMessage(sender, { text: await appendContactInfo("🗑️ Cart cleared. Reply with any message to start again.", user.outlet) }); 
                }
                return sendInvalidInputHelp(sock, sender, user);
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
                    return sock.sendMessage(sender, { text: await appendContactInfo("👤 *Enter your Name:*", user.outlet) });
                }
                return sendInvalidInputHelp(sock, sender, user);
            }
            if (user.step === "NAME") {
                user.name = text;
                user.step = "PHONE";
                if (user.name) {
                    await saveUserProfile(sender, { name: user.name, phone: user.phone || "" });
                }
                return sock.sendMessage(sender, { text: await appendContactInfo("📞 *STEP 2: ENTER YOUR 10 DIGIT MOBILE NUMBER*\n\n_Example: 9876543210. We will use this to contact you regarding your order._", user.outlet) });
            }

            if (user.step === "PHONE") {
                user.phone = text;
                user.step = "ADDRESS";
                return sock.sendMessage(sender, { text: await appendContactInfo("🏠 *STEP 3: ENTER YOUR DELIVERY ADDRESS*\n\n_Please provide your complete address including landmark, house number, etc._", user.outlet) });
            }

            if (user.step === "ADDRESS") {
                user.address = text; user.step = "LOCATION";
                let locMsg = `📍 *SHARE YOUR LOCATION* 🌍\n\n`;
                locMsg += `Please share your *Live* or *Current* Location so we can calculate the delivery fee.\n\n`;
                locMsg += `*How to share:*\n`;
                locMsg += `1️⃣ Click the 📎 (Paperclip) or *+* button in WhatsApp\n`;
                locMsg += `2️⃣ Select 'Location'\n`;
                locMsg += `3️⃣ Choose 'Send Your Current Location'\n\n`;
                locMsg += `_This step is mandatory for delivery calculation._`;
                return sock.sendMessage(sender, { text: await appendContactInfo(locMsg, user.outlet) });
            }

            if (user.step === "LOCATION") {
                const loc = msg.message?.locationMessage;
                if (!loc) return sendInvalidInputHelp(sock, sender, user);

                user.location = { lat: loc.degreesLatitude, lng: loc.degreesLongitude };
                return handleCheckoutFinal(sock, sender, user);
            }

            if (user.step === "CONFIRM_PAY") {
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

                    delete sessions[sender]; 
                    return sock.sendMessage(sender, { text: await appendContactInfo("❌ Order Cancelled. We hope to serve you next time! 🙏", user.outlet) }); 
                }
                if (text === "1") {
                    user.step = "PLACE_ORDER";
                    return sock.sendMessage(sender, { text: await appendContactInfo("💳 *Payment Method?*\n\n1️⃣ Cash\n2️⃣ UPI", user.outlet) });
                }
                return sendInvalidInputHelp(sock, sender, user);
            }

            if (user.step === "PLACE_ORDER") {
                if (text !== "1" && text !== "2") return sendInvalidInputHelp(sock, sender, user);
                
                const method = text === "2" ? "UPI" : "Cash";
                const orderId = await generateOrderId(user.outlet);
                const { subtotal } = formatCartSummary(user.cart);

                const finalOrder = {
                    orderId, outlet: user.outlet, 
                    type: "Online", // Explicitly tag as Online order
                    customerName: escapeHtml(user.name),
                    phone: user.phone, 
                    whatsappNumber: sender, // Save sender JID for status updates
                    address: escapeHtml(user.address),
                    lat: user.location.lat, lng: user.location.lng,
                    subtotal, deliveryFee: user.deliveryFee, total: subtotal + user.deliveryFee,
                    status: "Placed", paymentMethod: method, paymentStatus: "Pending",
                    createdAt: new Date().toISOString(),
                    items: user.cart
                };

                await setData(`orders/${orderId}`, finalOrder, user.outlet);
                await notifyAdmin(sock, orderId, finalOrder, 'NEW');

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
                        lastOrderDate: new Date().toISOString()
                    };
                    await updateData(`customers/${cleanPhone}`, custData, user.outlet);
                }

                let successMsg = `🎉 *ORDER PLACED SUCCESSFULLY!* 🎉\n`;
                successMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                successMsg += `🆔 *Order ID:* #${orderId.slice(-5)}\n`;
                successMsg += `🏪 *Shop:* Roshani ${user.outlet.toUpperCase()}\n`;
                successMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                successMsg += `*Please wait while the admin confirms your order!* ⏳\n\n`;
                successMsg += `Total: ₹${finalOrder.total}`;

                await sock.sendMessage(sender, { text: await appendContactInfo(successMsg, user.outlet) });
                delete sessions[sender];
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
            lat: parseFloat(storeSettings?.lat || (user.outlet === 'cake' ? 25.887472 : 25.887944)),
            lng: parseFloat(storeSettings?.lng || (user.outlet === 'cake' ? 85.026861 : 85.026194))
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
        sum += `💵 *TOTAL: ₹${subtotal + fee - (user.discount || 0)}*\n\n`;
        sum += `1️⃣ Confirm Order\n`;
        sum += `2️⃣ Cancel`;
        
        return sock.sendMessage(sender, { text: await appendContactInfo(sum, user.outlet) });
    } catch (e) {
        console.error("Checkout Final Error:", e);
        return sock.sendMessage(sender, { text: "❌ Error calculating delivery fee. Please try again." });
    }
}

startBot();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { getData, setData, updateData, db } = require('./firebase');

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
async function getRiderByEmail(email) {
    if (!email) return null;
    try {
        const riders = await getData("riders");
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

async function addInAppNotification(uid, title, message) {
    if (!uid) return;
    try {
        const notifId = "NOTIF" + Date.now();
        await setData(`riders/${uid}/notifications/${notifId}`, {
            id: notifId,
            title,
            message,
            timestamp: Date.now(),
            read: false
        });
    } catch (err) {
        console.error("Failed to add in-app notification:", err);
    }
}

// Graceful shutdown handling is now within startBot if needed, 
// but for simplicity we'll just allow process exit.

// =============================
// HELPERS
// =============================

// =============================
// GLOBAL STATE
// =============================
let reportInterval = null;

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

async function notifyDeveloper(sock, errorMsg) {
    try {
        const storeData = await getData("settings/Store");
        const devPhone = storeData?.developerPhone;
        if (!devPhone) return;

        const adminJid = devPhone.replace(/\D/g, '') + "@s.whatsapp.net";

        // Sanitize & Truncate to prevent leaking user data or long stack traces
        const safeError = String(errorMsg)
            .replace(/file:\/\/\/[^"'\s]+/g, '[PATH]')
            .replace(/[0-9]{10,}/g, '[PHONE]')
            .substring(0, 500);

        const alertMsg = `🛑 *CRITICAL BOT ALERT* 🛑\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `⚠️ *Error:* ${safeError}\n` +
            `⏰ *Time:* ${new Date().toLocaleString()}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
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

function isShopOpen(openTime, closeTime) {
    if (!openTime || !closeTime) return true; // Default to open if not set
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [openH, openM] = openTime.split(':').map(Number);
    const [closeH, closeM] = closeTime.split(':').map(Number);

    const start = openH * 60 + openM;
    const end = closeH * 60 + closeM;

    // Handle overnight hours (e.g. 10:00 to 02:00)
    if (end < start) {
        return currentTime >= start || currentTime <= end;
    }
    return currentTime >= start && currentTime <= end;
}

async function sendDailyReport(sock) {
    try {
        const storeData = await getData("settings/Store") || {};
        const recipients = [];
        if (storeData.reportPhone) recipients.push(storeData.reportPhone.replace(/\D/g, '') + "@s.whatsapp.net");
        if (storeData.developerPhone) recipients.push(storeData.developerPhone.replace(/\D/g, '') + "@s.whatsapp.net");

        if (recipients.length === 0) return;

        // Fetch Today's Orders
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const orders = await getData("orders") || {};
        const todayOrders = Object.values(orders).filter(o => {
            const ts = o.createdAt ? new Date(o.createdAt).getTime() : 0;
            return ts >= startOfDay;
        });

        if (todayOrders.length === 0) {
            const emptyMsg = `📊 *DAILY SALES SUMMARY* 📊\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📅 *Date:* ${new Date().toLocaleDateString()}\n` +
                `🚫 No orders were placed today.\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━`;
            for (const jid of recipients) await sock.sendMessage(jid, { text: emptyMsg });
            await updateData('settings/Bot', { lastReportDate: now.toISOString().split('T')[0] });
            return;
        }

        const totalRevenue = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const pizzaRevenue = todayOrders.filter(o => o.outlet?.includes('pizza')).reduce((sum, o) => sum + (o.total || 0), 0);
        const cakeRevenue = todayOrders.filter(o => o.outlet?.includes('cake')).reduce((sum, o) => sum + (o.total || 0), 0);

        let reportMsg = `📊 *DAILY SALES SUMMARY* 📊\n`;
        reportMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        reportMsg += `📅 *Date:* ${new Date().toLocaleDateString()}\n`;
        reportMsg += `🏪 *Store:* ${storeData.storeName || 'Roshani ERP'}\n`;
        reportMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        reportMsg += `💰 *TOTAL REVENUE:* ₹${totalRevenue.toLocaleString()}\n`;
        reportMsg += `📦 *TOTAL ORDERS:* ${todayOrders.length}\n\n`;
        reportMsg += `🍕 *Pizza Sales:* ₹${pizzaRevenue.toLocaleString()}\n`;
        reportMsg += `🎂 *Cake Sales:* ₹${cakeRevenue.toLocaleString()}\n`;
        reportMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        reportMsg += `_Generated automatically at closing time._`;

        for (const jid of recipients) {
            await sock.sendMessage(jid, { text: reportMsg });
        }

        // Mark as sent
        await updateData('settings/Bot', { lastReportDate: today });
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

// =============================
// GREETING
// =============================
async function sendGreeting(sock, sender, user) {
    const settings = await getData("settings");

    let msg = `✨ *WELCOME TO ROSHANI PIZZA & CAKE* 🍕🎂\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
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
// CATEGORY
// =============================
async function sendCategories(sock, sender, user) {
    const data = await getData(`Menu/Categories`);
    if (!data) {
        user.categoryList = [];
        user.step = "CATEGORY";
        return sock.sendMessage(sender, { text: "❌ *No categories available.* \nPlease try again later." });
    }

    // Filter by outlet (consistent with Admin)
    user.categoryList = Object.entries(data)
        .map(([id, val]) => ({ id, ...val }))
        .filter(cat => cat.outlet === user.outlet);

    if (user.categoryList.length === 0) {
        user.step = "CATEGORY";
        return sock.sendMessage(sender, { text: "❌ *Oops!* No categories found for this outlet." });
    }

    const outletName = user.outlet === 'pizza' ? 'Pizza' : 'Cake';
    const outletEmoji = user.outlet === 'pizza' ? '🍕' : '🎂';

    let msg = '';

    // Show mini cart if items exist
    if (user.cart && user.cart.length > 0) {
        msg += `🛒 *CART (${user.cart.length} item${user.cart.length > 1 ? 's' : ''}):*\n`;
        user.cart.forEach((item, i) => {
            msg += `  • ${item.name} (${item.size}) x${item.quantity}\n`;
        });
        msg += `\n`;
    }

    msg += `📂 *SELECT CATEGORY - ${outletName.toUpperCase()}* ${outletEmoji}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    user.categoryList.forEach((c, i) => {
        msg += `${i + 1}️⃣  ${c.name}\n`;
    });
    msg += `\n0️⃣  *Back to Menu* ⬅️`;
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
        logger: pino({ level: 'silent' }),
        browser: ['Roshani Pizza ERP', 'Safari', '3.0']
    });

    // =============================
    // HEARTBEAT & SCHEDULER (Atomic)
    // =============================
    if (reportInterval) clearInterval(reportInterval);
    reportInterval = setInterval(async () => {
        cleanupSessions();

        try {
            const storeSettings = await getData("settings/Store");
            const today = new Date().toISOString().split('T')[0];
            const botSettings = await getData("settings/Bot") || {};

            // Daily Report Trigger
            if (storeSettings?.shopCloseTime && botSettings.lastReportDate !== today) {
                const now = new Date();
                const [closeH, closeM] = storeSettings.shopCloseTime.split(':').map(Number);
                if (now.getHours() === closeH && now.getMinutes() >= closeM) {
                    await sendDailyReport(sock);
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
            const shouldReconnect = code !== 401 && code !== 515; // Logged out codes

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
    // EVENT LISTENERS (Real-time)
    // =============================
    db.ref("orders").on("child_changed", async (snap) => {
        try {
            const id = snap.key;
            const order = snap.val();
            if (!order) return;

            const phone = order.whatsappNumber || order.phone;
            if (!phone) return;
            const number = phone + "@s.whatsapp.net";

            // 1. STATUS UPDATE LOGIC
            if (!processedStatus[id]) {
                processedStatus[id] = { status: order.status, timestamp: Date.now() };
            } else if (processedStatus[id].status !== order.status) {
                processedStatus[id] = { status: order.status, timestamp: Date.now() };
                
                // RIDER NOTIFICATION LOGIC
                if (order.assignedRider) {
                    const rider = await getRiderByEmail(order.assignedRider);
                    if (rider) {
                        const riderJid = rider.phone.replace(/\D/g, '') + "@s.whatsapp.net";
                        
                        if (order.status === "Out for Delivery") {
                            const rMsg = `🚚 *NEW ASSIGNMENT: OUT FOR DELIVERY*\n` +
                                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                                `📦 *Order:* #${id}\n` +
                                `👤 *Customer:* ${order.customerName}\n` +
                                `🏠 *Address:* ${order.address}\n\n` +
                                `_Please proceed for delivery immediately. Use the Rider App for navigation._`;
                            await sock.sendMessage(riderJid, { text: rMsg });
                            await addInAppNotification(rider.uid, "🚀 Out for Delivery", `Order #${id} is now on your active trip.`);
                        } else if (order.status === "Delivered") {
                            const rMsg = `✅ *ORDER DELIVERED SUCCESSFULLY*\n` +
                                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                                `Great job! Order *#${id}* for *${order.customerName}* has been marked as delivered.\n\n` +
                                `💰 *Estimated Earnings:* ₹${order.riderCommission || 40}\n` +
                                `_Your wallet balance has been updated._`;
                            await sock.sendMessage(riderJid, { text: rMsg });
                            await addInAppNotification(rider.uid, "✅ Delivered", `Order #${id} completed successfully.`);
                        }
                    }
                }

                let msg = "";
                if (order.status === "Confirmed") msg = `✅ *ORDER CONFIRMED*\n\nGreat news! Your order *#${id}* is accepted and will be prepared soon. 🍕`;
                else if (order.status === "Preparing") msg = `👨‍🍳 *PREPARING ORDER*\n\nOur chef is currently crafting your delicious meal. Stay tuned!`;
                else if (order.status === "Cooked") msg = `🍕 *READY TO PACK*\n\nYour order is cooked and getting packed for delivery!`;
                else if (order.status === "Out for Delivery") msg = `🚀 *OUT FOR DELIVERY*\n\nYour order is on its way to you! Please be ready. 🚚`;
                else if (order.status === "Delivered") {
                    // Load Marketing & Feedback Info
                    const storeData = await getData("settings/Store");
                    const brands = storeData || {};

                    // 1. Send Premium Delivered & Promotion Message
                    let promoMsg = `🌟 *WE HOPE YOU ENJOYED YOUR MEAL!* 🌟\n`;
                    promoMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    promoMsg += `Your order *#${id}* from *${(brands.storeName || "Roshani Pizza & Cake").toUpperCase()}* has been delivered! 🍕🎂\n\n`;

                    if (brands.config?.showSocial) {
                        promoMsg += `We'd love to stay connected with you:\n`;
                        if (brands.instagram) promoMsg += `📸 *Instagram:* ${brands.instagram}\n`;
                        if (brands.facebook) promoMsg += `👥 *Facebook:* ${brands.facebook}\n`;
                        if (brands.reviewUrl) promoMsg += `🏅 *Rate us on Google:* ${brands.reviewUrl}\n\n`;
                    }

                    promoMsg += `Thank you for choosing us! ✨`;
                    await sock.sendMessage(number, { text: promoMsg });

                    // 2. Clear previous session and start Feedback Flow
                    sessions[number] = {
                        step: "FEEDBACK_RATING",
                        orderId: id,
                        customerName: order.customerName,
                        phone: phone,
                        lastActivity: Date.now()
                    };

                    let feedbackMsg = `🙏 *A QUICK FAVOR...*\n`;
                    feedbackMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    feedbackMsg += `How would you rate your overall experience with us today?\n\n`;
                    feedbackMsg += `*Reply with a number (1-5):*\n`;
                    feedbackMsg += `5️⃣  ⭐⭐⭐⭐⭐ (Excellent)\n`;
                    feedbackMsg += `4️⃣  ⭐⭐⭐⭐ (Very Good)\n`;
                    feedbackMsg += `3️⃣  ⭐⭐⭐ (Average)\n`;
                    feedbackMsg += `2️⃣  ⭐⭐ (Poor)\n`;
                    feedbackMsg += `1️⃣  ⭐ (Terrible)`;

                    setTimeout(async () => {
                        await sock.sendMessage(number, { text: feedbackMsg });
                    }, 2000);
                    return;
                }

                if (msg) await sock.sendMessage(number, { text: msg });
            }

            // 2. OTP LOGIC
            if (order.deliveryOTP && processedOTP[id] !== order.deliveryOTP) {
                processedOTP[id] = order.deliveryOTP;
                const otpMsg = `🔐 *Delivery OTP*\n\n` +
                    `Your OTP is: *${order.deliveryOTP}*\n\n` +
                    `👉 Share this only after receiving your order.`;
                await sock.sendMessage(number, { text: otpMsg });
                console.log("OTP sent to:", number);
            }

            // Cleanup memory (Limit to 200 entries)
            const keys = Object.keys(processedStatus);
            if (keys.length > 200) delete processedStatus[keys[0]];
            const otpKeys = Object.keys(processedOTP);
            if (otpKeys.length > 200) delete processedOTP[otpKeys[0]];
        } catch (err) {
            console.error("Order update listener error:", err);
        }
    });

    db.ref("orders").on("child_added", (snap) => {
        const id = snap.key;
        const order = snap.val();
        if (order) {
            processedStatus[id] = { status: order.status, timestamp: Date.now() };
            if (order.deliveryOTP) processedOTP[id] = order.deliveryOTP;
        }
    });

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

            if (!sessions[sender]) {
                sessions[sender] = { step: "START", current: {}, cart: [] };
            }
            sessions[sender].lastActivity = Date.now();
            const user = sessions[sender];

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

            // CHECK SHOP HOURS (Before starting/continuing an order)
            const storeData = await getData("settings/Store") || {};
            if (!isShopOpen(storeData.shopOpenTime, storeData.shopCloseTime)) {
                // Allow feedback even if shop is closed
                if (!user.step?.startsWith("FEEDBACK")) {
                    return sock.sendMessage(sender, {
                        text: `🌙 *WE ARE CURRENTLY CLOSED*\n\nThank you for reaching out! Our shop is currently closed. We look forward to serving you during our opening hours:\n\n☀️ *Opening Time:* ${storeData.shopOpenTime || '10:00'}\n\nSee you soon! 🍕🎂`
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
                const storeData = await getData("settings/Store") || {};

                let msg = `✨ *THANK YOU FOR YOUR RATING!* ✨\n`;
                msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                msg += `What did you enjoy the most about your experience?\n\n`;
                msg += `1️⃣  ${storeData.feedbackReason1 || 'Delicious Taste'}\n`;
                msg += `2️⃣  ${storeData.feedbackReason2 || 'Lightning Fast Delivery'}\n`;
                msg += `3️⃣  ${storeData.feedbackReason3 || 'Premium Packaging'}\n`;
                msg += `4️⃣  *Other (Tell us more)*\n\n`;
                msg += `_Reply with a number_`;

                user.step = "FEEDBACK_REASON";
                return sock.sendMessage(sender, { text: msg });
            }

            // FEEDBACK FLOW - REASON
            if (user.step === "FEEDBACK_REASON") {
                const storeData = await getData("settings/Store") || {};
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
                });

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
                });

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

                const dishes = await getData(`dishes/${user.outlet}`) || {};

                // Filter by category NAME (consistent with Admin)
                user.dishList = Object.entries(dishes)
                    .filter(([id, d]) => d.category === cat.name)
                    .map(([id, d]) => ({ id, ...d }));

                if (user.dishList.length === 0) {
                    return sock.sendMessage(sender, { text: "❌ No dishes available in this category." });
                }

                let msgText = `🍽️  *SELECT DISH: ${cat.name.toUpperCase()}*\n`;
                msgText += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

                user.dishList.forEach((d, i) => {
                    msgText += `${i + 1}️⃣  ${d.name}\n`;
                });
                msgText += `\n0️⃣  *Go Back* ⬅️`;

                user.step = "DISH";

                return sendImage(sock, sender, cat.image, msgText);
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
                msgText += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

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
                    msgText += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
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
                    msgText += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
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
                        text: `🔢 *HOW MANY?*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🍽️ ${user.current.dish.name} (${size} — ₹${price})\n\n*Enter quantity:*\n\n_Example: 1, 2, 3..._`
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
                    return sock.sendMessage(sender, {
                        text: `🔢 *HOW MANY?*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🍽️ ${user.current.dish.name} (${user.current.size} — ₹${user.current.unitPrice})${selectedAddons}\n💰 *Per unit: ₹${totalPerUnit}*\n\n*Enter quantity:*\n_Example: 1, 2, 3..._`
                    });
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
                confirmMsg += `\n*Want more?* Pick another number\n`;
                confirmMsg += `0️⃣ *Done selecting* ✅`;

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

                // Show CART_VIEW
                return sendCartView(sock, sender, user);
            }

            // CART_VIEW
            if (user.step === "CART_VIEW") {
                if (text === "1") {
                    // Add more items → go back to outlet selection
                    user.current = {};
                    user.step = "OUTLET";
                    let msg = `🛒 Cart: ${user.cart.length} item${user.cart.length > 1 ? 's' : ''}\n\n`;
                    msg += `*Select an outlet to add more:*\n\n`;
                    msg += `1️⃣ *Pizza Outlet* 🍕\n`;
                    msg += `2️⃣ *Cake Outlet* 🎂\n`;
                    return sock.sendMessage(sender, { text: msg });
                } else if (text === "2") {
                    // Checkout → collect customer details
                    user.step = "NAME";
                    return sock.sendMessage(sender, { text: "👤 *What is your full name?*\n\n_Example: Nilesh Shah_" });
                } else if (text === "3") {
                    // Cancel order
                    sessions[sender] = { step: "START", current: {}, cart: [] };
                    return sock.sendMessage(sender, { text: "❌ *Order Cancelled.* Cart cleared.\nReply any message to start a new order." });
                }
                return sock.sendMessage(sender, { text: "⚠️ Please reply *1*, *2*, or *3*." });
            }

            // NAME
            if (user.step === "NAME") {
                if (!text || text.length < 2) return sock.sendMessage(sender, { text: "⚠️ *Please enter a valid name.*" });
                user.name = text;
                user.step = "PHONE";
                return sock.sendMessage(sender, { text: "📞 *Enter your 10-digit Mobile Number:*\n\n_Example: 9876543210_" });
            }

            // PHONE - validate and normalize
            if (user.step === "PHONE") {
                const cleaned = text.replace(/\D/g, '').slice(-10);
                if (cleaned.length < 10) {
                    return sock.sendMessage(sender, { text: "⚠️ *Invalid Number!* Please enter a valid 10-digit mobile number.\n\n_Example: 9876543210_" });
                }
                user.phone = "+91" + cleaned;
                user.step = "ADDRESS_TEXT";
                return sock.sendMessage(sender, { text: "🏠 *Please provide your full Delivery Address:*\n\n_Include House No, Building Name, and nearby Landmark._" });
            }

            // ADDRESS_TEXT
            if (user.step === "ADDRESS_TEXT") {
                if (!text || text.length < 5) {
                    return sock.sendMessage(sender, { text: "⚠️ *Address too short!* \nPlease provide a more detailed address." });
                }
                user.address = text;
                user.step = "LOCATION";
                return sock.sendMessage(sender, { text: "📍 *FINAL STEP! Share your Current Location:*\n\nTo help our rider reach you faster, please share your *Current Location* on WhatsApp.\n\n_Tap 📎 → Location → Send Current Location_" });
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
                const outletCoords = settings?.coords || { lat: 25.887444, lng: 85.026889 };
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

                user.step = "CONFIRM";

                let summary = `🧾 *ORDER SUMMARY*\n`;
                summary += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                summary += `📦 *YOUR ITEMS:*\n`;
                summary += lines;
                summary += `\n━━━━━━━━━━━━━━━━━━━━\n`;
                summary += `💰 *Subtotal:* ₹${subtotal}\n`;
                summary += `🚚 *Delivery:* ₹${deliveryFee} (${user.distance} km)\n`;
                summary += `━━━━━━━━━━━━━━━━━━━━\n`;
                summary += `💵 *GRAND TOTAL: ₹${grandTotal}*\n`;
                summary += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                summary += `👤 *CUSTOMER:* ${user.name}\n`;
                summary += `📞 *PHONE:* ${user.phone}\n`;
                summary += `🏠 *ADDRESS:* ${user.address}\n`;
                summary += `📍 *LOCATION:* _Shared Successfully_ ✅\n\n`;
                summary += `1️⃣  *Confirm & Place Order* ✅\n`;
                summary += `2️⃣  *Cancel Order* ❌\n\n`;
                summary += `_Reply with number to finalize_`;

                return sock.sendMessage(sender, { text: summary });
            }

            // CONFIRM
            if (user.step === "CONFIRM") {
                if (text !== "1") {
                    sessions[sender] = { step: "START", current: {}, cart: [] };
                    return sock.sendMessage(sender, { text: "❌ *Order Cancelled.* \nReply any message to start a new order." });
                }

                const orderId = "ORD" + Date.now().toString(36).toUpperCase();
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

                // Determine primary outlet based on majority items
                const outletCounts = {};
                user.cart.forEach(i => {
                    const o = i.outlet || 'pizza';
                    outletCounts[o] = (outletCounts[o] || 0) + 1;
                });
                const primaryOutlet = Object.entries(outletCounts).sort((a,b) => b[1] - a[1])[0][0];

                await setData(`orders/${orderId}`, {
                    orderId,
                    outlet: primaryOutlet,
                    customerName: user.name,
                    whatsappNumber: sender.split('@')[0],
                    phone: user.phone,
                    address: user.address,
                    locationLink: user.locationLink || null,
                    itemTotal: subtotal,
                    deliveryFee: user.deliveryFee,
                    distance: user.distance,
                    total: grandTotal,
                    status: "Placed",
                    createdAt: new Date().toISOString(),
                    items: orderItems
                });

                await sock.sendMessage(sender, {
                    text: `🎉 *ORDER PLACED SUCCESSFULLY!*\n\n✅ *Order ID:* #${orderId}\n📦 *Items:* ${user.cart.length}\n💵 *Total:* ₹${grandTotal}\n\nThank you, *${user.name}*! Our team has received your order and will start preparing it shortly. We'll notify you here once it's out for delivery. 👨‍🍳🍕`
                });

                // Admin Notification
                try {
                    const adminSettings = await getData("settings/Delivery");
                    const adminPhone = adminSettings?.notifyPhone;
                    if (adminPhone) {
                        const adminJid = adminPhone.replace(/\D/g, '') + "@s.whatsapp.net";

                        let adminMsg = `🚨 *NEW ORDER ALERT* 🚨\n`;
                        adminMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                        adminMsg += `🆔 *Order ID:* #${orderId}\n`;
                        adminMsg += `🏬 *Outlet:* ${primaryOutlet.toUpperCase()}\n\n`;
                        adminMsg += `📋 *ORDER DETAILS:*\n`;

                        user.cart.forEach((item, i) => {
                            const lineTotal = item.total * item.quantity;
                            adminMsg += `  ${i + 1}. ${item.name} (${item.size}) ×${item.quantity} = ₹${lineTotal}\n`;
                            if (item.addons && item.addons.length > 0) {
                                adminMsg += `     + ${item.addons.map(a => `${a.name}(₹${a.price})`).join(', ')}\n`;
                            }
                        });

                        adminMsg += `\n💰 *Subtotal:* ₹${subtotal}\n`;
                        adminMsg += `🚚 *Delivery:* ₹${user.deliveryFee} (${user.distance} km)\n`;
                        adminMsg += `💵 *COLLECT: ₹${grandTotal}*\n\n`;
                        adminMsg += `👤 *CUSTOMER:*\n`;
                        adminMsg += `  Name: ${user.name}\n`;
                        adminMsg += `  Phone: ${user.phone}\n`;
                        adminMsg += `🏠 *ADDRESS:* ${user.address}\n`;
                        adminMsg += `📍 *LOCATION:* ${user.locationLink}\n`;
                        adminMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                        adminMsg += `_Check Admin Panel to confirm._`;

                        await sock.sendMessage(adminJid, { text: adminMsg });
                    }
                } catch (err) {
                    console.error("Admin Notification Failed:", err);
                }

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

    let msg = `🛒 *YOUR CART*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += lines;
    msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💰 *Subtotal: ₹${subtotal}*\n`;
    msg += `🚚 _Delivery charges calculated at checkout_\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `*What would you like to do?*\n\n`;
    msg += `1️⃣  ➕ *Add More Items*\n`;
    msg += `2️⃣  🛍️ *Checkout*\n`;
    msg += `3️⃣  ❌ *Cancel Order*\n\n`;
    msg += `_Reply with a number_`;

    user.step = "CART_VIEW";
    return sock.sendMessage(sender, { text: msg });
}

startBot();

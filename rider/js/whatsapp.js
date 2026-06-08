/**
 * RIDER WhatsApp alerts — sends messages via bot command node.
 */
import { db, ref, push, serverTimestamp } from './firebase.js';
import { cleanPhone } from '../../shared/format/phone.js';

export function initWhatsApp() {
    window.triggerWhatsAppAlert = (phone, orderId, actionType, extraData = {}, isManual = false) => {
        if (!phone) return;
        const cleaned = cleanPhone(phone);
        let message = "";
        const riderName = window.currentUser?.profile?.name || "Your Rider";
        const riderPhone = window.currentUser?.profile?.phone || "our support number";

        if (actionType === "ACCEPTED") {
            message = `Hello! I am ${riderName}, your delivery partner for Roshani Sudha order #${orderId}. I am on my way to pick up your order! 🛵`;
        } else if (actionType === "PICKED_UP") {
            message = `Great news! I have picked up your order #${orderId}. If you need anything, you can call me at ${riderPhone}. I am on my way! 🍕🎂`;
        } else if (actionType === "REACHED_DROP") {
            message = `I have arrived at your drop location with your order #${orderId}! Please have your 4-digit OTP ready. ✅`;
        } else if (actionType === "SEND_OTP") {
            message = `Your Roshani Sudha order #${orderId} has arrived! 📍 \n\nTo safely receive your order, please provide this 4-digit OTP to the rider: *${extraData.otp}* ✅`;
        } else if (actionType === "ARRIVED") {
            message = `I have arrived with your order #${orderId}! Please have your 4-digit OTP ready. ✅`;
        }

        if (isManual) {
            const url = `https://wa.me/91${cleaned}?text=${encodeURIComponent(message)}`;
            window.open(url, '_blank', 'noopener,noreferrer');
        } else {
            const outlet = window.activeOrderOutlet || 'pizza';
            const cmdRef = ref(db, `bot/${outlet}/commands`);
            push(cmdRef, {
                action: "SEND_GENERIC_MESSAGE",
                phone: cleaned,
                message: message,
                timestamp: serverTimestamp()
            });
            console.log(`[Alert] Pushed automated message to bot for ${cleaned}`);
        }
    };
}

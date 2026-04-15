import sys
import re

with open('bot/index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace LOCATION step
old_location_step = """        // LOCATION
        if (user.step === "LOCATION") {
            const location = msg.message?.locationMessage || msg.message?.liveLocationMessage;
            if (!location) {
                return sock.sendMessage(sender, { text: "📍 Please send your *LIVE LOCATION* only.\\n\\nTap 📎 → Location → Send Current Location" });
            }
            const lat = location.degreesLatitude;
            const lng = location.degreesLongitude;
            user.location = { lat, lng };
            user.locationLink = `https://www.google.com/maps?q=${lat},${lng}`;
            user.step = "CONFIRM";
            
            let summary = `🧾 Summary\\n\\n`;
            summary += `${user.current.dish.name}\\n`;
            summary += `${user.current.size}\\n`;
            summary += `₹${user.current.total}\\n\\n`;
            summary += `${user.name}\\n${user.phone}\\n${user.address}\\n`;
            summary += `${user.locationLink}\\n\\n`;
            summary += `1 Confirm\\n2 Cancel`;
            return sock.sendMessage(sender, { text: summary });
        }"""

new_location_step = """        // LOCATION
        if (user.step === "LOCATION") {
            const location = msg.message?.locationMessage || msg.message?.liveLocationMessage;
            if (!location) {
                return sock.sendMessage(sender, { text: "📍 Please send your *LIVE LOCATION* only.\\n\\nTap 📎 → Location → Send Current Location" });
            }
            const lat = location.degreesLatitude;
            const lng = location.degreesLongitude;
            user.location = { lat, lng };
            user.locationLink = `https://www.google.com/maps?q=${lat},${lng}`;
            user.step = "DISTANCE";
            return sock.sendMessage(sender, { text: "🛣️ What is the distance from the shop to your delivery location (in km)?\\nExample: 2.5" });
        }

        // DISTANCE
        if (user.step === "DISTANCE") {
            let val = parseFloat(text);
            if (isNaN(val) || val <= 0) {
                 return sock.sendMessage(sender, { text: "⚠️ Please enter a valid number for distance (e.g., 2.5)." });
            }
            user.distance = val;

            const settings = await getData(`settings/${user.outlet}`) || {};
            const ranges = settings.deliveryFees || [
                { min: 0, max: 1.99, price: 20 },
                { min: 2, max: 3, price: 30 },
                { min: 3.01, max: 4, price: 40 },
                { min: 4.01, max: 5, price: 50 },
            ];

            let dPrice = 0;
            let matched = false;
            for (let r of ranges) {
               if (val >= parseFloat(r.min) && val <= parseFloat(r.max)) {
                   dPrice = parseFloat(r.price);
                   matched = true;
                   break;
               }
            }
            
            if (!matched && ranges.length > 0) {
               dPrice = parseFloat(ranges[ranges.length - 1].price) || 50;
            }

            user.deliveryFee = dPrice;
            user.totalFood = user.current.total;
            user.current.total += dPrice;

            user.step = "CONFIRM";
            
            let summary = `🧾 Summary\\n\\n`;
            summary += `${user.current.dish?.name || user.current.dish}\\n`;
            summary += `Size: ${user.current.size}\\n`;
            summary += `Food: ₹${user.totalFood}\\n`;
            summary += `Delivery Fee (${val} km): ₹${user.deliveryFee}\\n`;
            summary += `Total: ₹${user.current.total}\\n\\n`;
            summary += `${user.name}\\n${user.phone}\\n${user.address}\\n`;
            summary += `${user.locationLink}\\n\\n`;
            summary += `1 Confirm\\n2 Cancel`;
            return sock.sendMessage(sender, { text: summary });
        }"""

# Normalise whitespace for regex matching to avoid CRLF issues
old_location_pattern = re.escape(old_location_step).replace(r'\ ', r'\s*').replace(r'\n', r'\s*')

content = re.sub(old_location_pattern, new_location_step, content)

old_save_order = """            await setData(`orders/${orderId}`, {
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
            });"""

new_save_order = """            await setData(`orders/${orderId}`, {
                orderId,
                outlet: user.outlet,
                customerName: user.name,
                whatsappNumber: sender.split('@')[0],
                phone: user.phone,
                address: user.address,
                distance: user.distance || 0,
                deliveryFee: user.deliveryFee || 0,
                locationLink: user.locationLink || null,
                total: user.current.total,
                status: "Placed",
                createdAt: new Date().toISOString(),
                items: [{
                    name: user.current.dish?.name || user.current.dish,
                    size: user.current.size,
                    quantity: user.current.quantity || 1
                }]
            });"""

old_save_pattern = re.escape(old_save_order).replace(r'\ ', r'\s*').replace(r'\n', r'\s*')
content = re.sub(old_save_pattern, new_save_order, content)

with open('bot/index.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated bot/index.js successfully!")

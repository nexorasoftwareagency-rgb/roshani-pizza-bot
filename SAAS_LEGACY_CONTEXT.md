# SAAS LEGACY CONTEXT: FULL SYSTEM BLUEPRINT (v2.1)

This document is a comprehensive technical mapping of the **Roshani ERP** ecosystem. It is designed to provide the "Memory" for the Foodhubbie SaaS platform, ensuring that 100% of the logic, user experience, and technical optimizations are carried forward into the new multi-tenant architecture.

---

## 1. THE BOT ENGINE (WHATSAPP CORE)

The WhatsApp Bot is the primary ordering channel. It uses a state-machine logic to guide users through the menu.

### A. State Machine Flow (Steps)
The `sessions[sender].step` variable controls the user's journey:
1.  **`START`**: Triggered by any message. Displays greeting and Outlet Menu.
2.  **`CATEGORY`**: Displays list of categories (e.g., Pizza, Burgers, Sides).
3.  **`DISH`**: Displays items within the selected category.
4.  **`SIZE`**: If the item has multiple sizes (Small/Medium/Large), it prompts the user to select one.
5.  **`ADDONS`**: Prompts for extra toppings/add-ons (e.g., Extra Cheese, Cold Drink).
6.  **`QUANTITY`**: Asks "How many?" (Validates 1-50).
7.  **`CART_VIEW`**: Summarizes the order. Options: "Add More", "Checkout", "Clear Cart".
8.  **`LOCATION`**: Requests WhatsApp Live/Current Location.
9.  **`REUSE_PROFILE`**: Asks to use saved details (Name/Phone) from `profiles/` node.
10. **`CONFIRM_PAY`**: Final invoice display with Delivery Fee (Distance-based).
11. **`PLACE_ORDER`**: Select Payment (Cash/UPI).

### B. Critical Bot Functions
*   **`formatJid(phone)`**: Sanitizes phone numbers to standard `91xxxxxxxxxx@s.whatsapp.net` format.
*   **`calculateDistance(lat1, lon1, lat2, lon2)`**: Haversine formula implementation for delivery fee calculation.
*   **`isShopOpen(open, close)`**: Time-based logic using `Intl.DateTimeFormat` for Asia/Kolkata timezone.
*   **`deductInventoryStock(items)`**: Atomic updates to the `inventory/` node with threshold-based WhatsApp alerts to managers.
*   **`cleanupStaleOrders()`**: A "Garbage Collector" that auto-cancels orders older than 5 hours to keep the kitchen queue clean.

---

## 2. THE ADMIN DASHBOARD (POS & MANAGEMENT)

The Admin panel is a real-time SPA (Single Page Application) built with Vanilla JS and Firebase SDK.

### A. Real-time Listeners
The dashboard "Lives" on Firebase listeners (`.on('value')`):
*   **Orders Table**: Automatically updates when a new order is placed via Bot.
*   **Stats Cards**: Revenue and Order count recalculate on every change.
*   **Bot Status**: Monitors if the Bot is online/offline.

### B. Command Center (Dashboard -> Bot)
The Admin panel "talks" to the Bot by writing to `bot/${OUTLET}/commands`:
*   **`SEND_DAILY_REPORT`**: Triggers the Bot to generate a PDF/Text sales summary.
*   **`SEND_GENERIC_MESSAGE`**: Allows Admin to chat with customers directly through the Bot.
*   **`UPDATE_STATUS`**: When status is changed to "Out for Delivery", the Bot automatically generates an OTP and sends it to the customer.

---

## 3. RIDER LOGIC & LOCATION SYNC

The Rider Portal is a specialized interface for delivery staff.

### A. Geolocation Heartbeat
*   The app sends a "Heartbeat" every 30 seconds to `riders/${uid}/location`.
*   **Logic:** Uses `navigator.geolocation.watchPosition` for maximum accuracy.

### B. Order Lifecycle (Rider side)
1.  **`ASSIGNED`**: Rider receives a WhatsApp notification and a push alert.
2.  **`PICKED UP`**: Rider clicks "Pick Up". Bot sends "Out for Delivery" message to customer.
3.  **`REACHED`**: Rider clicks "I have Reached". Bot sends "Meet the Rider" message.
4.  **`DELIVERED`**: Rider enters the 4-digit OTP provided by the customer. Logic validates against `orders/${id}/otp`.

---

## 4. DATABASE SCHEMA DICTIONARY (DETAILED)

### `/outlets/${outletId}/`
*   **`menu/`**: Hierarchical node for Categories -> Dishes -> Sizes -> Addons.
*   **`orders/`**: Complete history. Each order object includes `cart`, `customerLocation`, `paymentStatus`, and `timeline`.
*   **`inventory/`**: Tracks raw materials (e.g., Flour, Cheese). Contains `stock` and `threshold`.
*   **`settings/`**: Store hours, contact info, and delivery fee slabs (e.g., 0-2km = ₹20).

---

## 5. UI DESIGN SYSTEM (FOR THE NEW WEB APP)

### A. Aesthetics
*   **Glassmorphism**: All cards use `backdrop-filter: blur(10px)` and `rgba(255, 255, 255, 0.1)`.
*   **Animations**: Uses `Cubic-Bezier` transitions for all modal popups.
*   **Dark Mode First**: The system is designed for high-contrast visibility in busy kitchens.

---

## 6. SAAS TRANSFORMATION "MUST-HAVES"

1.  **Zero-Configuration Onboarding**: New shop owner fills a form -> System initializes `outlets/${newId}`.
2.  **Multi-Tenant Bot**: One WhatsApp process handles thousands of outlets via `phone -> outletId` lookup.
3.  **Central Marketplace**: A homepage that filters shops by user location (Foodhubbie UI).

---

## 7. INFRASTRUCTURE SPECS (NEW PROJECT)

*   **New Firebase Project**: `foodhubbie-saas` (Total isolation from legacy).
*   **New EC2 Instance**: Dedicated to the Master Bot cluster.
*   **Service Account**: New `service-account.json` required for EC2-Firebase connection.

---

## 8. CLEANING & REFACTORING PROTOCOL

When initializing the new workspace, the Agent must:
1.  **Delete** all references to `pizza` and `cake` from code logic.
2.  **Replace** old Firebase Config objects with the new project credentials.
3.  **Genericize** all path helpers to accept `outletId` as a parameter.
4.  **Purge** all legacy assets (images/favicons) that are not part of the core SaaS UI.

---

**FINAL NOTE:** This context ensures that the "Soul" of Roshani ERP—the high-speed ordering and the rider-customer sync—is preserved while we build the "Body" of a world-class SaaS platform.

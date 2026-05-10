# ROSHANI ERP | MASTER SaaS ARCHITECTURE

This document outlines the current architecture of the Roshani Pizza/Cake ERP and the strategic roadmap required to transform it into a scalable Multi-Tenant SaaS platform.

---

## 1. CURRENT STATE ANALYSIS

### 1.1 Multi-Outlet Strategy
Currently, the system operates on a **Duplicate-Folder Architecture**:
- `Pizza-bot/` and `Cake-bot/` are separate directory instances.
- Each instance has its own `index.js` with hardcoded `OUTLET = 'pizza'` or `'cake'`.
- Managed via `ecosystem.config.js` as independent PM2 processes.

### 1.2 Data Structure (Firebase)
The Realtime Database is structured with top-level nodes for specific outlets:
```json
{
  "pizza": { "orders": {...}, "dishes": {...} },
  "cake": { "orders": {...}, "dishes": {...} },
  "admins": { "uid1": { "outlet": "pizza", "email": "..." } },
  "riders": { "uid2": { "outlet": "cake", "email": "..." } }
}
```
**Limitation:** Adding a third outlet (e.g., "Burger-bot") currently requires creating a new folder, modifying `database.rules.json`, and updating `ecosystem.config.js`.

### 1.3 Authentication & Authorization
- **Admins:** Resolved via the `admins` node. Access is restricted to the specific `outlet` property.
- **Super-Admins:** Hardcoded in `database.rules.json` (nexorasoftware@gmail.com, roshanisudha@gmail.com).
- **Riders:** Linked to outlets, managed via a central `riders` node.

---

## 2. PROPOSED SaaS ARCHITECTURE (The "MASTER" Plan)

The goal is to transition to **Dynamic Tenancy**, where new outlets can be added via a UI without any manual code changes or server restarts.

### 2.1 Generalised Data Schema
All outlet-specific data will move under a unified `outlets` node:
```json
{
  "outlets": {
    "$outletId": {
      "settings": { "name": "...", "theme": "#f36b21", "logo": "..." },
      "orders": { ... },
      "inventory": { ... },
      "menu": { ... }
    }
  },
  "customers": {
    "$uid": { "profile": { ... }, "orderHistory": { ... } }
  }
}
```

### 2.2 Super Admin Platform (New Component)
A high-level dashboard for the platform owner to:
1.  **Onboard Outlets:** Form to enter Shop Name, Admin Email, and Tier.
2.  **Infrastructure Automation:** On submission, the system automatically:
    - Creates a Firebase Auth user for the Shop Admin.
    - Generates a unique `outletId`.
    - Populates default `settings` and `menu` structures.

### 2.3 Universal Marketplace (Customer Website/App)
A single, high-performance portal (Web/PWA) for all customers:
- **Discovery:** Fetches all shops from `outlets/`.
- **Geolocation:** Filters shops by distance to the user's current location.
- **Unified Profile:** Customers log in once and can order from any outlet.
- **Real-time Sync:** Status updates via Firebase listeners, not just WhatsApp.

### 2.4 Universal Notification Bot
Refactor the WhatsApp bot into a single **Notification Microservice**:
- **Pattern:** Instead of 1 bot per outlet, run 1-2 powerful bots that listen to the *entire* `outlets/` tree.
- **Logic:** When an order status changes in `outlets/{id}/orders/{oid}`, the service identifies the customer JID and sends the update.
- **On-Demand Chat:** Optionally, a dedicated bot process can be spawned dynamically for premium outlets.

---

## 3. REQUIRED TECHNICAL CHANGES

### Phase 1: Infrastructure Cleanup (Immediate)
1.  **Refactor `database.rules.json`:** Use `$outletId` wildcards to replace hardcoded `pizza`/`cake` logic.
2.  **Centralize Bot Logic:** Create a single `bot/core.js` that takes an `OUTLET_ID` as an environment variable, removing the need for duplicate folders.

### Phase 2: Dynamic Branding Engine
1.  **Frontend Update:** Modify `Admin/branding.js` to fetch colors and logos from `outlets/$outletId/settings` instead of hardcoded CSS variables.
2.  **PWA Manifests:** Use a single `manifest.json` that dynamically updates icons and names via JavaScript/Service Workers.

### Phase 3: Customer Portal & Geolocation
1.  **New Web Project:** Create a "Marketplace" frontend.
2.  **Location Services:** Integrate Leaflet.js or Google Maps to calculate distances and delivery eligibility automatically.

### Phase 4: App Deployment
1.  **Wrapper Implementation:** Wrap the Marketplace Website using **Capacitor** or **Cordova**.
2.  **Play Store Rollout:** Push the Android/iOS bundle with deep-linking enabled for order notifications.

---

## 4. CONCLUSION
The current system is highly functional but "stiff." By implementing **Dynamic Tenancy** and a **Super Admin Dashboard**, the Roshani ERP can become a global SaaS platform where you can sell "ERP-as-a-Service" to any shop owner instantly.

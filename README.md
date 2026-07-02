# Roshani ERP — WhatsApp-Based Food Ordering & Delivery Management System

A full-stack ERP system for **Roshani Pizza** and **Roshani Cake** outlets. Customers order via WhatsApp bot; admins manage orders, menu, riders, and reports from a web dashboard; riders receive, track, and complete deliveries from a mobile-optimized web app.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Firebase Database Schema](#firebase-database-schema)
- [WhatsApp Bot (Core Engine)](#whatsapp-bot-core-engine)
- [Admin Dashboard](#admin-dashboard)
- [Admin Sidebar Navigator](#admin-sidebar-navigator)
- [Admin Dashboard Tabs — Complete Reference](#admin-dashboard-tabs--complete-reference)
- [Admin Modals](#admin-modals)
- [Admin Drawers](#admin-drawers)
- [Admin User Flows](#admin-user-flows)
- [Rider Portal](#rider-portal)
- [Rider Screens](#rider-screens)
- [Rider Complete User Flows](#rider-complete-user-flows)
- [Deployment Guide](#deployment-guide)
- [Environment Variables](#environment-variables)
- [Local Development Setup](#local-development-setup)
- [Project Structure](#project-structure)

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| WhatsApp Bot | **Node.js** + **@whiskeysockets/baileys** v6.17 | Multi-device WhatsApp Web API — send & receive messages |
| Admin Dashboard | **Vanilla JS** SPA (ES Modules) | 19-screen management panel |
| Rider Portal | **Vanilla JS** SPA (ES Modules) | 6-screen mobile delivery app |
| Database | **Firebase Realtime Database** | Source of truth for orders, menu, users, settings |
| Cache / Sessions | **Redis** (standalone or AWS ElastiCache cluster) | User sessions, message dedup, OTP cache |
| Admin & Rider Hosting | **Firebase Hosting** | Static asset delivery + PWA service workers |
| Bot Hosting | **AWS EC2** (managed via **PM2**) | WhatsApp bot process (pizza-bot + cake-bot) |
| Maps | **Leaflet.js** + **OpenStreetMap** | Rider GPS tracking & live admin tracker |
| Charts | **Chart.js** v4.4 | Revenue trend graphs in analytics |
| Export | **SheetJS (xlsx)** + **jsPDF + AutoTable** | Download reports as Excel or PDF |
| Push Notifications | **Firebase Cloud Messaging (FCM)** | Rider in-app notifications + audio alerts |
| PWA | **Service Worker** + Web Manifest | Installable on mobile home screen |
| Geolocation | **navigator.geolocation.watchPosition()** | 30-second interval rider GPS streaming |
| Table Grid | **Tabulator** v6.3 | Interactive data tables (riders, inventory, feedback, customers) |
| CSS Icons | **Lucide** v0.344 | UI icon set |
| Tab Management | **Custom tab system** | 19-tab SPA with lazy module loading |

---

## Architecture Overview

```
┌──────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  Customer     │     │  Admin Dashboard     │     │  Rider App       │
│  (WhatsApp)   │     │  Firebase Hosting    │     │  Firebase Hosting│
│               │     │  roshani-sudha-admin │     │  roshani-sudha-  │
│               │     │                      │     │  rider           │
└──────┬───────┘     └─────────┬────────────┘     └────────┬─────────┘
       │                      │                           │
       │  WhatsApp Web        │  Firebase RTDB            │  Firebase RTDB
       │  (WebSocket)         │  (wss://*.firebaseio.com) │  (wss://*.firebaseio.com)
       ▼                      ▼                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Firebase Realtime Database                        │
│                                                                      │
│  Root nodes:                                                         │
│    pizza/  ─── orders, dishes, categories, settings, inventory       │
│    cake/   ─── orders, dishes, categories, settings, inventory       │
│    admins/ ─── admin user profiles (email, outlet assignment)        │
│    riders/ ─── rider profiles (status, location, fcmToken, notifs)  │
│    bot/    ─── commands (report triggers), logs, botUsers            │
│    customers/ ─── saved customer profiles (per outlet)               │
│    riderStats/ ─── delivery statistics & earnings                    │
│    settlements/ ─── cash settlement history                          │
│    otpAttempts/ ─── OTP rate-limiting                                │
│    logs/     ─── system error logs                                   │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   │  Firebase Admin SDK (service account)
                   ▼
┌──────────────────────────────────────┐     ┌──────────────────────────┐
│  WhatsApp Bot (EC2 - PM2)            │────▶│  Redis                   │
│                                      │     │                          │
│  ┌────────────┐  ┌────────────┐     │     │  session:{sender}=30m    │
│  │ pizza-bot  │  │ cake-bot   │     │     │  status:{id}=24h         │
│  │ OUTLET=    │  │ OUTLET=    │     │     │  otp:{phone}=5m          │
│  │ pizza      │  │ cake       │     │     │                          │
│  └────────────┘  └────────────┘     │     └──────────────────────────┘
│                                      │
│  Both run from bot/index.js          │
│  Differentiated by OUTLET env var    │
└──────────────────────────────────────┘
```

---

## Firebase Database Schema

### Root Nodes

| Path | Type | Purpose |
|---|---|---|
| `pizza/` | Object | Pizza outlet data partition |
| `cake/` | Object | Cake outlet data partition |
| `admins/{uid}` | Object | Admin profiles — `email`, `outlet`, `name` |
| `riders/{uid}` | Object | Rider profiles — `name`, `phone`, `email`, `status`, `location`, `fcmToken`, `notifications`, `isAdmin` |
| `bot/{outlet}/commands/` | List | Admin-triggered bot commands (reports) |
| `bot/{outlet}/status` | Object | Bot heartbeat — `lastSeen`, `status`, `outlet` |
| `bot/{outlet}/promotions/optout/` | List | Opt-out phone numbers for promotions |
| `botUsers/{cleanJid}` | Object | WhatsApp user profiles (saved after ordering) |
| `bot/logs/{orderId}` | Object | Bot notification delivery logs |
| `customers/{phone}` | Object | Customer data for POS lookup |
| `riderStats/{riderId}` | Object | Rider earnings, deliveries count, ratings |
| `settlements/{riderId}` | List | Cash settlement history |
| `otpAttempts/{orderId}` | Object | OTP verification rate-limiting |
| `logs/` | Object | System error logs |

### Per-Outlet Structure (`pizza/` or `cake/`)

| Path | Purpose |
|---|---|
| `orders/{orderId}` | Order document — status, items, customer, payment, timestamps |
| `dishes/{dishId}` | Menu items — name, price, category, image, sizes, add-ons |
| `categories/{catId}` | Menu categories — name, image, sortOrder |
| `settings/Store` | Store info — name, address, coords, hours, banner, shop status, feedback reasons |
| `settings/Delivery` | Delivery config — fee slabs, contact phones, backup delivery codes |
| `settings/Bot` | WhatsApp bot images per status, greeting image, menu image, social links |
| `settings/Display` | Visibility toggles for receipt items (store name, address, GSTIN, FSSAI, QR, WiFi, social, feedback QR) |
| `riders/` | Rider profiles (legacy/outlet-specific) |
| `inventory/{itemId}` | Stock tracking — name, stock, threshold, unit, supplier, cost price, SKU |
| `customers/{phone}` | Saved customer profiles with LTV tracking |
| `feedbacks/{orderId}` | Customer ratings and reviews |
| `metadata/orderSequence/{dateStr}` | Atomic order ID counter per day |
| `logs/` | Audit trail entries |
| `discounts/{id}` | Discount/coupon configuration |
| `discountsUsage/{id}` | Discount redemption tracking |
| `tableRequests/{id}` | Object | Dine-in table requests (waiter call, bill request) — `tableNumber`, `type`, `status`, `createdAt` |

### Order Document Structure

```json
{
  "orderId": "20260527-0001",
  "outlet": "pizza",
  "type": "Online",
  "status": "Placed",
  "customerName": "Rajesh Kumar",
  "phone": "9876543210",
  "whatsappNumber": "919876543210@s.whatsapp.net",
  "address": "123, Main Road, Patna",
  "lat": 25.887,
  "lng": 85.026,
  "items": [
    {
      "name": "Margherita Pizza",
      "size": "Large",
      "unitPrice": 299,
      "quantity": 2,
      "addons": [{ "name": "Extra Cheese", "price": 40 }],
      "total": 678
    }
  ],
  "subtotal": 678,
  "deliveryFee": 30,
  "total": 708,
  "paymentMethod": "COD",
  "paymentStatus": "Pending",
  "createdAt": "2026-05-27T18:30:00.000Z",
  "deliveryOTP": "4821",
  "riderId": "rider-uid-123",
  "riderPhone": "9876540000",
  "riderName": "Amit Singh",
  "deliveredAt": 1728392910000,
  "settled": false,
  "stockDeducted": true
}
```

---

## WhatsApp Bot (Core Engine)

**File:** `bot/index.js` (1676 lines)

The bot is a **Node.js process** that connects to WhatsApp Web via Baileys and listens to Firebase Realtime Database for order changes. A single codebase serves both outlets, differentiated by the `OUTLET` environment variable.

### Connection Lifecycle

1. **Session Init**: `useMultiFileAuthState('session_data_' + OUTLET)` reads/store WhatsApp auth credentials in `bot/session_data_pizza/` or `bot/session_data_cake/`
2. **QR Auth**: On first run (or after logout), QR code is printed in terminal — scan with WhatsApp to link
3. **Open**: Connection established — bot is online
4. **Message Ingest**: `messages.upsert` event receives incoming messages
5. **Disconnect**: Auto-reconnects with exponential backoff (5s → 15s → 45s → 120s max)
6. **Logged Out**: Manual intervention required — delete session folder and re-scan QR

### State Machine (Customer Chat Flow)

```
START
  │  Send welcome message + show categories
  ▼
CATEGORY
  │  User selects category number → show dishes
  ▼
DISH
  │  User selects dish number → show sizes
  ▼
SIZE
  │  User selects size → ask quantity
  ▼
QUANTITY
  │  User enters quantity (1-50) → add to cart → show cart
  ▼
ADDED_TO_CART / CART_VIEW
  │  User: 1=add more, 2=checkout, 3=clear
  ▼
AWAIT_COUPON
  │  User: 0=skip, or enter coupon code → validate
  ▼
[If no saved profile →] REUSE_PROFILE → NAME → PHONE → ADDRESS
  │
  ▼
LOCATION
  │  User shares live WhatsApp location → calculate delivery fee
  ▼
CONFIRM_PAY
  │  Show invoice (items + delivery fee + coupon discount + total)
  │  User: 1=Confirm, 2=Cancel
  ▼
ORDER PLACED → Saved to Firebase → Admin notified → Status tracking begins
```

**Special commands at any step:** `9` = View cart, `0` = Back, `RESET`/`CANCEL` = Clear everything

### Order Status Notification Engine

The bot listens to Firebase `child_changed` and `child_added` on `{outlet}/orders/`. When an order status changes, it sends a WhatsApp message to the customer with the appropriate template and image. Uses Redis dedup (key `status:{orderId}`) to avoid duplicate sends.

| Status | Customer Message | Image Key |
|---|---|---|
| **Placed** | "ORDER PLACED!" — thank you + funny progress | `imgPlaced` → fallback `imgConfirmed` |
| **Confirmed** | Dine-in: "WELCOME..." with table no. Delivery: "ORDER CONFIRMED!" + invoice | `imgConfirmed` |
| **Ready / Packed** | "PACKED & READY!" — funny progress, rider pickup note | `imgReady` |
| **Arriving at Restaurant** | "RIDER UPDATE" — rider on way | — |
| **Picked Up / Out for Delivery** | "OUT FOR DELIVERY!" — includes OTP, rider info | `imgOut` |
| **Reached Drop Location** | "RIDER HAS REACHED!" — OTP reminder | `imgOut` |
| **Delivered / Served** | "DELIVERED/SERVED SUCCESSFULLY!" — payment, total, food joke | `imgDelivered` |
| **Cancelled** | "ORDER CANCELLED" — reason | — |

**OTP change detection:** If OTP changes while status is `out for delivery` or `reached drop location`, bot sends a "NEW DELIVERY OTP" message.

### Rider Notification Engine

| Event | Action |
|---|---|
| **Rider Assignment** | When `order.riderId` changes → sends full invoice + customer location + Google Maps link to rider's WhatsApp |
| **Pickup Ready** | When status = `ready` and rider is assigned → sends pickup notification with OTP |
| **Broadcast** | When status = `ready` but no rider assigned → broadcasts to ALL online riders (status === "Online") |

### Admin Notifications

| Notification | Trigger |
|---|---|
| **New Order** | Full order details sent to all admin JIDs |
| **Cancelled Order** | Lost-sale notification with potential revenue |
| **Low Stock Alert** | When inventory falls below threshold |
| **Daily/Weekly/Monthly Reports** | Sent at scheduled times via heartbeat |

### Admin Command Listener

The bot watches `bot/{outlet}/commands/` for Firebase-triggered commands:

| Command | Action |
|---|---|
| `SEND_DAILY_REPORT` | Generate + send daily report (optional `targetDate`) |
| `SEND_WEEKLY_REPORT` | Generate + send weekly report |
| `SEND_MONTHLY_REPORT` | Generate + send monthly report |
| `SEND_PROMOTION` | Dispatches promo campaign (long-running broadcast) |
| `SEND_GENERIC_MESSAGE` | Sends arbitrary text to a single phone |

Commands are deleted after processing.

### WhatsApp Admin `!` Commands

| Command | Response |
|---|---|
| `!report` / `!sales` | Immediately generates and sends daily sales report |
| `!status` | Bot status dashboard: uptime, orders in memory, socket JID |
| `!ping` | "Pong! Bot is active." |

### Report Scheduling (Heartbeat — every 5 min)

| Time (IST) | Action |
|---|---|
| 21:30 | Daily sales report |
| 01:30 | Catch-up daily report (if bot was offline at 21:30) |
| 04:00 | Reset all report-sent flags |

Reports can also be triggered manually from the Admin Dashboard Analytics tab.

### Redis Caching Strategy

| Key Pattern | TTL | Purpose |
|---|---|---|
| `session:{sender}` | 30 min | User's current step, cart, profile data |
| `status:{orderId}` | 24 hr | Last processed order status (dedup + OTP change detection) |
| `status:{msgId}` | 24 hr | WhatsApp message deduplication |
| `otp:{phone}` | 5 min | OTP storage |

**Failure mode:** If Redis is offline, falls back to an in-memory Map cache (1-hr TTL). System continues to function with slightly degraded dedup.

### Error Resilience

- **Global error handlers**: `uncaughtException` + `unhandledRejection` are logged (prevents silent crashes)
- **Crypto error monitoring**: Counts undecryptable messages (Bad MAC errors). At 500+ failures, prunes all session files (except creds.json) to force re-negotiation
- **Stale session cleanup**: Auto-deletes session files older than 7 days on startup + every 24h
- **Reconnection backoff**: Exponential: 5s → 15s → 45s → 120s max
- **Rate limiting**: 40 messages/min per user
- **Firebase listener dedup**: `firebaseListenersInitialized` flag ensures listeners set once, reused across reconnects
- **Stale order cleanup**: Auto-cancels orders older than 5 hours (not delivered/cancelled/archived)
- **Empty recipient fallback**: Developer number always included as minimum recipient

### Inventory Management

When an order is placed, `deductInventoryStock()` matches item names against `{outlet}/inventory/` node, deducts quantities, and sends a WhatsApp alert to the admin if any item falls below its threshold.

---

## Admin Dashboard

**URL:** Firebase Hosting — `roshani-sudha-admin` target
**Tech:** Vanilla JS ES Modules + Firebase Realtime Database
**Auth:** Firebase Auth (email/password) — 3 tiers: Supreme, Super, Regular
**PWA:** Installable on desktop/mobile via service worker
**Entry Point:** `Admin/index.html`
**Module Loader:** Lazy dynamic imports via `useMod(name)`

### Admin Sidebar Navigator

The sidebar is organized into 5 groups with 20 navigation items:

#### Operations
| Menu Item | Tab Target | Icon | Description |
|---|---|---|---|
| Dashboard | `dashboard` | `layout-dashboard` | KPI overview, priority orders, recent activity |
| Orders | `orders` | `shopping-cart` | Full order history with filters |
| Live Ops | `live` | `activity` | Real-time kitchen display with live badge |
| POS Control | `walkin` | `monitor` | Walk-in / dine-in point-of-sale |
| Tables | `tables` | `grid-3x3` | Dine-in table management with floor grid, KDS, session billing |

#### Marketing
| Menu Item | Tab Target | Icon | Description |
|---|---|---|---|
| Promotions | `promotions` | `megaphone` | WhatsApp promo broadcast campaigns |
| Discounts | `discounts` | `percent` | Discount/coupon management |

#### Catalogue
| Menu Item | Tab Target | Icon | Description |
|---|---|---|---|
| Menu | `menu` | `utensils` | Dish CRUD with sizes, add-ons, visibility |
| Categories | `categories` | `folder-tree` | Menu category management with category-level add-ons |
| Inventory | `inventory` | `package` | Stock tracking with low-stock alerts |

#### People
| Menu Item | Tab Target | Icon | Description |
|---|---|---|---|
| Riders | `riders` | `bike` | Rider management with Tabulator grid |
| Customers | `customers` | `users` | Customer database with LTV tracking |

#### Insights
| Menu Item | Tab Target | Icon | Description |
|---|---|---|---|
| Lost Sales | `lostSales` | `shopping-bag` | Abandoned checkout tracking |
| Analytics | `reports` | `bar-chart-3` | Sales reports with Chart.js + Excel/PDF export |
| Rider Insights | `riderAnalytics` | `trending-up` | Per-rider performance analytics |
| Feedback | `feedback` | `star` | Customer ratings and reviews |
| Live Tracking | `liveTracker` | `map-pin` | Leaflet map with real-time rider positions |
| Notifications | `notifications` | `bell` | System alert history |
| Payments | `payments` | `wallet` | Payment transaction records |

#### System
| Menu Item | Action/Tab | Icon | Description |
|---|---|---|---|
| Download App | PWA install | `download-cloud` | Install dashboard as PWA |
| Settings | `settings` | `settings` | Store config, bot images, delivery fees |
| Nuclear Refresh | `completeSiteRefresh` | `refresh-cw` | Clear all caches and reload |
| Logout | `userLogout` | `log-out` | Sign out + idle cleanup |

### Bottom Navigation (Mobile)
- **Dashboard** | **Orders** | **Live Ops** | **Walk-in** (with live badge) | **More** (opens sidebar)

---

## Admin Dashboard Tabs — Complete Reference

### 1. Dashboard (`tab-dashboard`)

**Data loaded on switch:** riders, orders (real-time listener)

**Components:**
- **Promo Kill-Switch Widget** (`#promoKillWidget`) — checkbox to emergency-stop all running promo campaigns, shows bot status
- **KPI Cards** — Active Orders (`#statOrders`), In Progress (`#statPending`), Total Revenue (`#statRevenue`), Riders Online (`#statRidersActive`)
- **Priority Orders** (`#priorityOrderList`) — Top 8 orders needing attention (placed/confirmed/ready), sorted by urgency weight
- **Top Spenders** (`#topCustomersList`) — Top 5 customers by lifetime spend
- **Top Selling Items** (`#topItemsList`) — Top 5 items by order count
- **Rider Status** (`#riderStatusList`) — Online/offline rider cards with toggle (`#showAllRidersToggle`) and online count (`#onlineRiderCount`)
- **Recent Orders** — Minimal orders table with ID, customer, total, status, actions

**Functions called:** `loadRiders()`, `renderOrders()`, `updateDashboardStats()`, `renderPriorityOrders()`, `renderTopItems()`, `renderTopCustomers()`

---

### 2. Orders (`tab-orders`)

**Data loaded on switch:** riders, orders with date-range pagination

**Components:**
- **Date Filters** — `#orderFrom` (from date), `#orderTo` (to date)
- **Search** — `#orderSearch` (text filter on table rows)
- **Full Orders Table** (`#ordersTableFull`) — Columns: Order ID, Customer, Address, Total, Payment, Status, Action buttons
- **Load More** — Paginated loading (50 per page) with `#loadMoreOrdersBtn`

**Functions:** `loadRiders()`, `renderOrders()`, `filterOrders()`, `loadOrdersPage(reset)`, `loadMoreOrders()`

**Interactions per row:** Click order → opens Order Drawer. Status change dropdown. Rider assignment dropdown. WhatsApp chat link.

---

### 3. Live Ops (`tab-live`)

**Data loaded on switch:** riders, live orders (last 100)

**Components:**
- **Live Indicator** — `.live-dot` + `.live-text` pulsing
- **Live Orders Table** (`#liveOrdersTable`) — Columns: Order ID, Customer, Items, Total, Status, Assign Rider dropdown, Action buttons
- **Mobile Badge** — `#badge-live` shows unacknowledged order count

**Functions:** `loadRiders()`, `renderOrders()` (from `state.liveOrdersMap`)

**Key behavior:** Plays continuous alert sound for new unacknowledged orders. Stops when order is clicked/acknowledged.

---

### 4. POS Control — Walk-in (`tab-walkin`)

**Data loaded on switch:** dishes + categories for POS

**Components (left side):**
- **Back Button** — Exit POS
- **Search** — `#walkinDishSearch`
- **Category Tabs** — `#walkinCategoryTabs` (All + dynamic categories)
- **Dish Grid** — `#walkinDishGrid` (cards with image, name, price, out-of-stock overlay)
- **Add-ons Grid** — `#walkinAddonsGrid` (category-level add-ons)

**Components (right side — Cart):**
- **Clear All** — `#btnClearWalkinCart`
- **Cart Items** — `#walkinCartItems` with qty controls, edit addons, remove
- **Subtotal** — `#walkinSubtotal`
- **Discount Row** — `#walkinDiscountRow` + `#walkinDiscountVal`
- **Coupon Section** — `#walkinCouponCode` input, apply/clear buttons, hint message
- **Discount Presets** — `#discountPresets` chips (₹50, ₹100, 10%) + manual input
- **Total** — `#walkinTotal`
- **Customer Fields** — Name (`#walkinCustName`), Table No (`#walkinTableNo`), Phone (`#walkinCustPhone` — auto-lookup), Note (`#walkinCustNote`)
- **Payment Toggle** — Cash / UPI buttons
- **Submit** — `#walkinSubmitBtn`
- **Mobile Cart Bar** — `#mobileCartSummary` floating bar with count, total, "View Cart"

**Functions:** `loadWalkinMenu()`, `renderWalkinCategoryTabs()`, `filterWalkinByCategory()`, `openPOSSelectionModal()`, `selectPOSSize()`, `togglePOSAddon()`, `adjustPOSModalQty()`, `addToWalkinCartFromModal()`, `renderWalkinCart()`, `setDiscount()`, `setDiscountPct()`, `applyWalkinCoupon()`, `clearWalkinCoupon()`, `selectWalkinPayment()`, `submitWalkinSale()`, `checkWalkinCustomer()`

**Full POS Flow:**
1. Browse dishes by category or search
2. Click dish → size/addon/qty selector modal
3. Add to cart → cart updates in real-time
4. Optionally apply discount (flat or %) or coupon
5. Enter customer details (auto-lookup by phone)
6. Select payment method (Cash/UPI)
7. Submit → order saved as Confirmed/Dine-in/Paid
8. Receipt prints automatically
9. Stock deducted, customer LTV updated, discount usage recorded

---

### 5. Tables (`tab-tables`)

**Data loaded on switch:** tables, sessions, orders, tableRequests (3 real-time listeners)

**Components:**
- **KPI Row** — Active Tables (`#tblKpiActive`), Occupied (`#tblKpiOccupied`), Reserved (`#tblKpiReserved`), Avg Session Time (`#tblKpiAvgTime`), Pending Requests (`#tblKpiRequests`)
- **Requests Banner** (`#tableRequestsBanner`) — Dismissible chips for waiter call / bill request / other
- **Floor Grid** (`#tableManagementGrid`) — Visual grid of table cards with status, capacity, session info
- **Live Orders Sidebar** (`#liveOrdersSidebar`) — Real-time kitchen display of active dine-in orders
- **Order Drawer** — Right-slide panel showing order details, items, pricing, status progression
- **Table Drawer** — Right-slide panel: table info, session details, orders, action buttons

**Table Drawer Actions:**
- Print KOT (kitchen order ticket)
- Print Bill (customer bill with items, tax, total)
- Generate Bill / Request Bill
- Close Table (Paid) / Cancel Session
- Enable/Disable Table
- View QR
- Order action buttons: Accept Order, Mark Ready, Mark Served, Cancel

**Functions:** `loadTableManagement()`, `_attachListeners()`, `_renderAll()`, `_renderKpis()`, `_renderFloorGrid()`, `_renderLiveOrdersList()`, `_renderKDS()`, `_renderTableDrawer()`, `_renderRequestsBanner()`, `_resolveTableRequest()`, `_printTableKOT()`, `_printSessionBill()`, `_advanceOrder()`, `cleanupTables()`

**Lazy module:** Dynamically imported when tab is first accessed. Three-listener architecture (tables + sessions + orders) — never one-per-table.

---

### 6. Menu Management (`tab-menu`)

**Data loaded on switch:** dishes (real-time listener)

**Components:**
- **Search** — `#menuSearch`
- **Add Dish Button** — `.btn-show-dish-modal`
- **Dish Cards Grid** — `#menuGrid` with image, name, category, sizes, pricing, available toggles, edit/delete buttons

**Functions:** `loadMenu()`, `showDishModal()`, `saveDish()`, `editDish()`, `deleteDish()`, `filterMenu()`, `toggleDishAvailable()`, `cleanupCatalog()`

**Dish Card Actions:** Toggle availability switch, Edit (pencil), Delete (trash)

---

### 7. Categories (`tab-categories`)

**Data loaded on switch:** categories (real-time listener)

**Components (left — Create):**
- **Image Preview** — `#catPreview`
- **File Upload** — hidden `#catFile`, button `#btnChangeCatPhoto`
- **Fields** — Name (`#newCatName`), Sort Order (`#newCatOrder`)
- **Category Add-ons** — `#categoryAddonsList` with add field button `#btnAddCatAddonField`
- **Submit** — `#btnAddCategory`

**Components (right — Active Categories):**
- **Search** — `#categorySearch`
- **Category List** — `#categoryList` with edit/delete per row
- **Migration Button** — `#btnMigrateDishAddons` (moves dish-level addons to category)

**Functions:** `loadCategories()`, `addCategory()`, `editCategory()`, `deleteCategory()`, `filterCategories()`, `addCategoryAddonField()`, `migrateAddonsToCategories()`

---

### 8. Rider Management (`tab-riders`)

**Data loaded on switch:** riders + riderStats (real-time listeners)

**Components:**
- **KPI Row** — Online (`#rider-stat-online`), Busy (`#rider-stat-busy`), Offline (`#rider-stat-offline`), Total Earnings (`#rider-stat-earnings`)
- **Search** — `#riderSearchInput`
- **Tabulator Grid** — `#ridersTable` with columns: #, Rider (name/phone/img), Email, Status, Performance (orders/wallet), Rating (progress bar), Actions (Settle Wallet / Edit / Reset Password / Delete)
- **Pagination** — `#ridersPagination`
- **Add New Rider** — Button opens rider modal
- **Show All Toggle** — `#showAllRidersToggle`

**Functions:** `loadRiders()`, `renderRiders()`, `showRiderModal()`, `editRider()`, `saveRiderAccount()`, `deleteRider()`, `resetRiderPassword()`, `settleRiderWallet()`, `toggleRiderPass()`, `cleanupRiders()`

**Special:** Tabulator grid with built-in sorting, filtering, pagination. Rider photos, Aadhar uploads. Password auto-generated with secure copy-to-clipboard modal (auto-clears after 30s).

---

### 9. Customers (`tab-customers`)

**Data loaded on switch:** customers + orders

**Components:**
- **Search** — `#customerSearch`
- **Tabulator Grid** — `#customersTableBody` with columns: #, Customer (name + joined date), WhatsApp link, Address (with map link), Orders count, Lifetime Value

**Functions:** `loadCustomers()`, `filterCustomers()`

---

### 10. Lost Sales (`tab-lostSales`)

**Data loaded on switch:** orders filtered for lost sales

**Components:**
- **Outlet Filter** — `#lostSalesOutletFilter` (All Outlets, Pizza, Cake)
- **Revenue Badge** — `#lostSalesTotalRevenue` (potential lost revenue sum)
- **Count Badge** — `#lostSalesCount`
- **Clear Button** — `#btnClearLostSales`
- **Table** — `#lostSalesTableBody` (abandoned checkouts)

**Functions:** `loadLostSales()`, `clearLostSales()`

---

### 11. Analytics / Reports (`tab-reports`)

**Data loaded on switch:** date-range report data

**Components:**
- **Date Filters** — `#reportFrom`, `#reportTo`
- **Status Filter** — `#reportStatusFilter` (Delivered Only / All / Cancelled)
- **Generate Button** — `#btnGenerateReport`
- **WhatsApp Report Button** — `#btnWhatsappReport` (pushes command to bot)
- **KPI Row** — Revenue (`#reportRevenue`), Orders (`#reportOrders`), Avg Order Value (`#reportAvg`), Period (`#reportPeriod`)
- **Export Buttons** — Excel (`#btnDownloadExcel`), PDF (`#btnDownloadPDF`)
- **Detailed Table** — `#reportTableBody` (itemized sales data)
- **Revenue Trend Chart** — `#revenueChart` (Chart.js line graph)

**Functions:** `loadReports()`, `generateCustomReport()`, `setStatusFilter()`, `downloadExcel()`, `downloadPDF()`, `cleanupReports()`

---

### 12. Rider Insights (`tab-riderAnalytics`)

**Data loaded on switch:** riders + stats

**Components:**
- **Rider Select** — `#riderSelectAnalytics`
- **Date Filters** — `#riderReportFrom`, `#riderReportTo`
- **Generate Button** — `#btnGenerateRiderReport`
- **Settle Button** — `#btnSettleRiderAnalytics`
- **KPI Row** — Earnings (`#riderStatEarnings`), Pending Cash (`#riderStatPendingCash`), Deliveries (`#riderStatDeliveries`), Avg Time (`#riderStatAvgTime`), Rating (`#riderStatRating`)
- **Table** — `#riderAnalyticsTableBody`
- **Export** — Excel (`#btnRiderExportExcel`), PDF (`#btnRiderExportPDF`)
- **Earnings Trend** — `#riderEarningsChart` (Chart.js bar/line)
- **Rider Status Summary** — `#riderStatusSummary`

**Functions:** `initRiderAnalytics()`, `loadRiderAnalytics()`, `generateRiderReport()`, `settleRiderWallet()`, `cleanupReports()`

---

### 13. Feedback (`tab-feedback`)

**Data loaded on switch:** feedbacks (real-time listener)

**Components:**
- **Tabulator Grid** — `#feedbackTableBody` with columns: #, Date, Order ID, Customer, Rating (star display), Feedback (reason + comment)

**Functions:** `loadFeedbacks()`, `cleanupFeedbacks()`

---

### 14. Live Tracker (`tab-liveTracker`)

**Data loaded on switch:** riders location (real-time listener)

**Components:**
- **Stats Bar** — Online (`#trackerOnlineCount`), On Delivery (`#trackerDeliveryCount`), Offline (`#trackerOfflineCount`)
- **Last Updated** — `#trackerLastUpdated` + `#trackerLastUpdateTime` (updates every 5s)
- **Toggle Sidebar Button** — `#btnToggleTrackerSidebar`
- **Tracker Sidebar** (`#trackerSidebar`) — Online list (`#trackerOnlineList`), Offline section toggle (`#btnTrackerShowOffline`), Legend (Online/On Delivery/Offline)
- **Leaflet Map** — `#adminLiveMap` centered on Patna (25.887944, 85.026194), zoom 12, OpenStreetMap tiles
- **Mobile Chips** — `#trackerMobileChips`

**Rider Markers:** Custom pill-style `L.divIcon` with avatar initial, status color, online/offline indicator. Clickable popup with: avatar, name, status, phone, order link, WhatsApp link, Google Maps directions.

**Functions:** `initLiveRiderTracker()`, `startRiderLocationListener()`, `stopRiderLocationListener()`, `cleanupLiveRiderTracker()`, `window.trackerLocateRider(id)`

**Real-time behavior:** `onValue` on `riders/` — 5-second interval. Markers added/updated/removed dynamically. Map auto-fits to visible riders. Sidebar cards update with locate button.

---

### 15. Notifications (`tab-notifications`)

**Data loaded on switch:** notification state

**Components:**
- **Full Notification List** — `#fullNotificationList`
- **Clear All Button** — `#btnClearAllNotif`

**Functions:** `addNotification()`, `updateNotificationUI()`, `clearAllNotifications()`

**Global behavior:** Push notifications for new orders (browser Notification API). Continuous alert sound for unacknowledged orders (loops every 2s). Badge count on sidebar bell icon.

---

### 16. Inventory (`tab-inventory`)

**Data loaded on switch:** inventory items (real-time)

**Components:**
- **Export/Import Buttons** — Export CSV, Import (triggers `#inventoryImportInput`)
- **Feature Toggles** — `#toggleAvailability` (Menu Availability), `#toggleStockTracking` (Stock Tracking) with info panels
- **Menu Section** — `#inventoryMenuGrid` + `#inventoryMenuPagination` (shown when availability toggle on)
- **KPI Row** — Total Items (`#invTotalItems`), Low Stock (`#invLowStock`)
- **Search** — `#inventorySearch`
- **Tabulator Grid** — `#inventoryTableBody` with columns: #, Product Item (name with stock badges), Stock (+/- quick adjust buttons), Threshold, Actions (History/Edit/Delete)
- **Pagination** — `#inventoryPagination`
- **Add Item Button** — `#btnShowAddInventory`

**Functions:** `initInventory()`, `loadInventory()`, `renderInventoryTable()`, `saveInventoryItem()`, `editInventoryItem()`, `deleteInventoryItem()`, `adjustStock()`, `setInventorySearch()`, `cleanupInventory()`, `handleInventoryImportFile()`, `exportInventoryCSV()`

**Keyboard shortcuts (when inventory tab active):** `N` → new item, `?` → show help

---

### 17. Payments (`tab-payments`)

**Data loaded on switch:** orders (all)

**Components:**
- **Payments Table** — `#paymentsTable` with order + payment info

**Functions:** Same `renderOrders()` but filtered for payments view.

---

### 18. Promotions (`tab-promotions`)

**Data loaded on switch:** promotions module

**Components:**
- **Offline Banner** — `#promotionsOfflineBanner`
- **Help Button** — "How to use" (opens promotions guide modal)
- **Mode Tabs** — Send Now (`data-mode="now"`), Schedule (`data-mode="schedule"`), Active (`data-mode="active"`), History (`data-mode="history"`)

**Compose Pane (`#promoComposePane`):**
- Greeting checkbox (`#promoGreeting`), Attach Menu checkbox (`#promoAttachMenu`)
- Template textarea (`#promoTemplate`, 1500 char max) with character count (`#promoCharCount`)
- "Choose Template" button (opens template picker)
- Menu footer textarea (`#promoMenuText`)
- Media upload (`#promoMediaInput`) with preview (`#promoMediaPreview`)
- Recipient filter select (`#promoRecipientFilter`: All / Recent / Upload CSV)
- CSV upload with sample download (CSV/XLSX), recipient count (`#promoRecipientCount`), cap (`#promoRecipientCap`)
- Send delay (`#promoDelay`, 1-30s between messages)
- Coupon generation checkbox (`#promoGenerateCoupons`)
- Test phone input (`#promoTestPhone`)
- STOP message checkbox (`#promoSendStopMsg`)
- Closing message textarea (`#promoClosingMsg`)
- Menu image attach checkbox with preview
- Schedule datetime-local (`#promoRunAt`) + quiet hours (`#promoQuietStart`, `#promoQuietEnd`)
- Action buttons: Launch, Send Test, Preview

**Active Pane (`#promoActivePane`):**
- Emergency Kill Switch (`#btnPromoKillAll`)
- Campaign list (`#promoCampaignList`)

**History Pane (`#promoHistoryPane`):**
- Export button
- History list (`#promoHistoryList`)

**Functions:** `loadPromotions()`, `cleanupPromotions()`, `renderPromotionsGuide()`, `renderTemplatePicker()`

---

### 19. Discounts (`tab-discounts`)

**Data loaded on switch:** discounts module

**Components:**
- **Action Buttons** — Reports (`data-action="openDiscountsReports"`), New Discount (`data-action="newDiscount"`)
- **Sub-tabs** — Active (`#discountListActive`), Scheduled (`#discountListScheduled`), Expired (`#discountListExpired`)
- **Count Badges** — `#discountCountActive`, `#discountCountScheduled`, `#discountCountExpired`

**Discount Editor Modal fields:**
- Name (`#discName`), Type (`#discType`: percentage/flat), Mode (`#discMode`: auto/coupon)
- Value (`#discValue`), Max Cap (`#discMaxCap`)
- Category filter (`#discCategoryBox` with `#discCategoryList`)
- Coupon code (`#discCouponPrefix`, `#discCouponCode`, Generate button)
- Start/End datetime (`#discStartsAt`, `#discEndsAt`), No End checkbox (`#discNoEnd`)
- Min subtotal (`#discMinSubtotal`), Exclusive group (`#discExclusiveGroup`)
- Per-customer limit (`#discPerCustomerLimit`), Global limit (`#discGlobalLimit`)
- Enabled toggle (`#discEnabled`), Channel (`#discChannel`)

**Functions:** `loadDiscounts()`, `window.__discounts.openEditor()`, `window.__discounts.save()`, `window.__discounts.remove()`, `window.__discounts.closeEditor()`, `cleanupDiscounts()`

---

### 20. Settings (`tab-settings`)

**Data loaded on switch:** Store, Delivery, Bot, Display settings (fetched in parallel)

**Components — Receipt & Store Information:**
- **Business Details** — Entity Name (`#settingEntityName`), Store Name (`#settingStoreName`), Address (`#settingStoreAddress` textarea), GSTIN (`#settingGSTIN`), FSSAI (`#settingFSSAI`), Tagline (`#settingTagline`), Open/Close Time (`#settingOpenTime`, `#settingCloseTime`), Report Phone (`#settingReportPhone`)
- **Outlet Status Control** — Status pill (`#outletStatusPill`), Quick Toggle button (`#btnQuickToggleOutlet`), Status select (`#settingShopStatus`: AUTO / FORCE_OPEN / FORCE_CLOSED), Hint (`#outletStatusHint`)
- **Marketing & Connectivity** — WiFi Name/Pass with toggle, Instagram, Facebook, Review URL
- **Feedback Bot Options** — 3 feedback reasons
- **Developer Settings** — Powered By, Dev Phone

**Components — Visibility Controls (checkboxes):**
Store Name, Address, GSTIN, FSSAI, Tagline, Powered By, QR, WiFi Info, Social Links, Feedback QR

**Components — Payment QR:**
Upload with preview (`#qrPreview`, `#settingQRFile`, `#btnChangeQR`)

**Components — WhatsApp Marketing Images:**
Greeting image, Menu image — each with upload, preview

**Components — Store Location:**
Latitude (`#settingLat`), Longitude (`#settingLng`), Display Coords (`#displayCoords`)

**Components — Order Notifications:**
Admin Phone (`#settingAdminPhone`), Delivery Backup Code (`#settingDeliveryBackupCode`), Notification permission status + enable/test buttons

**Components — WhatsApp Bot Aesthetics & Promotions:**
Status images per stage (Confirmed, Ready, Out for Delivery, Delivered, Feedback) — each with upload + preview. Social links. Migration buttons (Addon Migration, Image Migration).

**Components — Delivery Fee Tiers:**
Add Fee Slab button (`#btnAddFeeSlab`), Fee Slabs Table (`#feeSlabsTable`: Up to KM, Charge, Action)

**Functions:** `loadStoreSettings()`, `saveStoreSettings()`, `addFeeSlab()`, `previewSettingsImage()`, `quickUpdateOutletStatus()`, `validateCoords()`, `validatePhone()`, `validateGSTIN()`, `validateFSSAI()`

**Save behavior:** All 4 settings nodes atomically updated via multi-path update. Validates all fields before save. Sets `settingsDirty` flag on any input change (warns before leaving tab).

---

## Admin Modals

| Modal ID | Purpose | Key Internal Elements |
|---|---|---|
| `#dishModal` | Add/Edit Dish | Title (`#dishModalTitle`), Image preview + upload, Category select, Name, Base Price, Sort Order, Sizes container, Add-ons container, Save button |
| `#riderModal` | Add/Edit Rider | Title, Profile photo upload + preview, Aadhar upload + preview, Name, Email, Phone, Password (with toggle), Father Name, Age, Aadhar No, Qualification, Address, Save button |
| `#posSelectionModal` | POS size/addon/qty picker | Dish name, Category, Size grid, Add-ons list, Qty controls (-/+/input), Total, Add to Cart button |
| `#reauthModal` | Security re-authentication | Password input, Verify button, Cancel |
| `#inventoryModal` | Add/Edit Inventory Item | Title, Name, Stock, Threshold, SKU, Unit (select), Supplier, Cost Price, Save |
| `#receiptPreviewModal` | Receipt preview/print | Iframe (`#receiptPreviewFrame`), Print button, Close |
| `#pageGuideModal` | Generic how-to guide | Title (`#pageGuideTitle`), Body (`#pageGuideBody`), Got it button |
| `#discountsReportsModal` | Discount performance reports | Range chips (7/30/90/All), KPIs (Redemptions, Savings, Active, Average), Export CSV, Breakdown panel, Channels panel, Recent redemptions, Code uses panel with back |
| `#promotionsGuideModal` | Promotions how-to guide | Body, Got it button |
| `#promoTemplatePickerModal` | Pick a promo template | Body list, Close |
| `#discountEditorModal` | Create/Edit discount | All discount fields (name, type, mode, value, cap, category, coupon, dates, limits, channel), Save/Cancel |
| `#activityLogModal` | System activity log | Filter (level/category), Entries list, Copy button, Clear button |

---

## Admin Drawers

| Drawer ID | Purpose | Internal Structure |
|---|---|---|
| `#orderDrawer` | Full-page order detail (right-side slide) | `#orderDrawerBody` — dynamically populated with customer info, items list, pricing, status selector, rider assigner, print receipt button, WhatsApp chat link, delivered button, mark-as-paid. Backed by `#orderDrawerOverlay`. |

---

## Admin User Flows

### Tab Navigation Flow
1. User clicks sidebar item → `data-tab` triggers `switchTab(tabId)`
2. Previous tab's module cleaned up (listeners detached)
3. New tab's module loaded with data fetch + render
4. URL hash updated for back-button support
5. Sidebar/mobile nav active state updated
6. Mobile bottom nav title + visibility updated
7. Lucide icons re-initialized

### Order Management Flow
1. View orders in Dashboard (priority section) or Orders tab (full table)
2. Click any order row → Order Drawer slides in from right
3. Drawer shows: customer details, items, pricing, timeline
4. Change status via dropdown (validated against business rules)
5. Assign rider via dropdown (auto-confirms if placing)
6. Print thermal receipt → receipt preview modal → browser print dialog
7. Chat on WhatsApp → opens `wa.me` link
8. Mark as Delivered with payment selection
9. Mark as Paid for COD orders
10. Close drawer → back to orders view

### POS (Walk-in) Full Flow
1. Enter POS tab → browse dishes by category or search
2. Click dish → size/addon/qty modal
3. Add to cart → cart updates in real-time
4. Apply optional discount (preset chips or manual)
5. Apply optional coupon code
6. Enter customer name, table number, phone (auto-lookup)
7. Select payment method (Cash/UPI)
8. Submit sale → order saved, receipt prints, stock deducted
9. Optional: Reprint last receipt

### Rider Management Flow
1. View all riders in Tabulator grid with sorting/filtering
2. Add new rider → fill form with photo + Aadhar upload
3. Edit rider → pre-filled modal
4. Delete rider → confirmation dialog
5. Reset password → send password reset email
6. Settle wallet → calculates pending cash, records settlement, notifies rider

### Inventory Management Flow
1. Toggle Menu Availability (on/off for entire outlet)
2. Toggle Stock Tracking (enable/disable inventory system)
3. Add item → name, stock, threshold, SKU, unit, supplier, cost
4. Quick adjust stock with +/- buttons
5. View stock history (timeline of changes)
6. Import inventory from CSV
7. Export inventory to CSV
8. Edit/delete items

### Settings Configuration Flow
1. Fill in store details (name, address, GSTIN, FSSAI, hours)
2. Toggle outlet status (Auto / Force Open / Force Closed)
3. Upload payment QR code
4. Upload WhatsApp bot images per status
5. Configure delivery fee tiers (distance-based slabs)
6. Set admin notification phone + backup delivery code
7. Toggle visibility of receipt elements
8. Configure social media links
9. Save → atomic multi-path Firebase update

### Promotions Campaign Flow
1. Compose message with template, media, menu image
2. Select recipients (all recent customers, or upload CSV)
3. Set send delay between messages (1-30s)
4. Optionally generate unique coupon codes
5. Optionally schedule for future delivery (with quiet hours)
6. Send test message to phone
7. Preview message
8. Launch campaign → runs in background via bot
9. Monitor active campaigns, kill-switch if needed
10. View campaign history

### Discounts Management Flow
1. View active/scheduled/expired discounts in sub-tabs
2. Create new discount (percentage or flat, auto or coupon)
3. Set validity period, min subtotal, category filter
4. Generate coupon code or use manual entry
5. Track redemptions via Reports modal
6. Delete expired discounts

### Live Tracker Flow
1. Map loads with all rider positions
2. Sidebar shows online list + offline section
3. Click rider marker or sidebar card → popup with details + directions link
4. Toggle between collapsed/expanded sidebar layout
5. Show/hide offline riders
6. Auto-refresh every 5 seconds
7. Mobile chips for easy tapping

### Login & Auth Flow
1. Email/password login via Firebase Auth
2. Three tiers: Supreme (all outlets), Super (pizza+cake), Regular (single outlet)
3. 30-minute idle timeout → auto-logout
4. New-order browser notifications (permission-gated)
5. Outlet switcher in top bar (multi-outlet admins)
6. Version banner for new deployment detection

---

## Rider Portal

**URL:** Firebase Hosting — `roshani-sudha-rider` target
**Tech:** Vanilla JS ES Modules + Firebase Realtime Database + Leaflet.js
**Auth:** Firebase Auth (email/password). Phone numbers (10 digits) are converted to `{number}@rider.com` for authentication.
**PWA:** Installable on mobile home screen with audio alerts
**Entry Point:** `rider/index.html` or `rider/login.html`

### Rider Login Screen (`login.html`)

**Components:**
- Logo (lightning bolt icon)
- "ROSHANI RIDER" heading + "Secured Access Portal" subtitle
- Email input (accepts 10-digit mobile or email)
- Password input
- "AUTHENTICATE & START" button
- Error message display (hidden by default)

**Flow:**
1. User enters mobile (10 digits) or email + password
2. Firebase auth via synthetic email `{phone}@rider.com`
3. On success → redirect to `index.html`
4. If already logged in → immediately redirected

---

## Rider Screens

### Home / Dashboard (`#sec-home`)

**Components:**
- Welcome header — `#r-name` ("Welcome, {Name}!"), today's date (`#currentDate`)
- **Stats Cards:**
  - Green: Delivered Today (`#stats-delivered`)
  - Blue: On-Time Rating (`#stats-ontime`)
  - Orange: Today's Earnings (`#stats-earnings`)
  - Gold: Average Rating (`#statsRiderRating`)
- "View Detailed Stats" button (switches to earnings section)
- **Active Delivery View** (`#dashboardActiveDeliveryView`) — Dynamic card showing current active order with action buttons
- Pull-to-refresh gesture

**Loaded data:** Rider profile from Firebase `riders/{uid}`, order cache, outlet coordinates

### Available Pickup (`#sec-available`)

**Components:**
- Section heading "Available Pickup"
- Count badge (`#pickupCount`)
- Order list (`#unassignedOrdersList`) — rendered as table (desktop) + card grid (mobile)

**Behavior:** Shows orders with status `ready`/`packed`/`cooked` that have no rider assigned. Each item has an "Accept" button.

### Active Trip / Live (`#sec-active`)

**Components:**
- **Leaflet Map** (`#activeTripMap`) — Glass panel style, shows rider position + customer drop location
- **Active Order View** (`#activeOrderView`) — Task card with step progress (Zomato-style) or "No active trip" empty state
- **Slide-to-Action** controls: Reached Outlet, Pick Up, Reached Customer (spring-back animation on failure)

**Step Progress (visual):**
1. ✅ / ⏳ Arrive at Restaurant
2. ✅ / ⏳ Pick Up
3. ✅ / ⏳ Reach Customer
4. ✅ / ⏳ Verify OTP
5. ✅ / ⏳ Collect Payment
6. ✅ / ⏳ Finalize

### Trip History (`#sec-completed`)

**Components:**
- Section heading "Trip History"
- Search box (`#historySearch`) — filter by Order ID
- Completed orders list (`#completedOrdersList`) — table (desktop) + card grid (mobile)

### Wallet / Earnings (`#sec-earnings`)

**Components:**
- Total Cash to Settle (`#e-total`) — large display amount
- "View Settlement History" button (`#btnViewSettlements`)
- Pizza Outlet Earnings: Lifetime (`#e-pizza`) + Today (`#e-pizza-today`)
- Cake Outlet Earnings: Lifetime (`#e-cake`) + Today (`#e-cake-today`)

### My Profile (`#sec-profile`)

**Components:**
- Profile Photo (`#r-profile-img`) with edit button
- Profile fields: Name, Phone (editable), Father's Name, Age, Aadhar No (last 4 digits visible), Qualification, Address (editable)
- Aadhar Card Image toggle (show/hide)
- File input for photo upload (hidden)

---

## Rider Modals & Overlays

### New Order Ping Modal (`#newOrderPingModal`)

**Trigger:** When a new unassigned order with status `ready` appears, and rider has no active order.

**Components:**
- Outlet name, "Incoming Order" title
- Order ID (`#pingOrderId`), Customer Address (`#pingCustomerAddress`), Order Total (`#pingOrderTotal`)
- Estimated Earning label
- **30-second countdown timer** (`#pingTimer`) — circular countdown
- "ACCEPT TASK" button (`#btnAcceptOrder`)
- "SKIP THIS TASK" button (`#btnIgnoreOrder`)
- Audio alert (`assets/sounds/alert.mp3`)

**Behavior:** Auto-ignores after 30s. Plays alert sound on arrival. Haptic feedback.

### OTP Panel (`#otpPanel`)

**Trigger:** After rider slides "Reached Customer".

**Components:**
- "TRIP COMPLETE" heading
- "Enter 4-digit verification code from customer" instruction
- OTP input (`#otpInput`) — 4 digits max, numeric keypad
- "REGENERATE & SEND OTP" button (`#btnResendOTP`) — rate-limited (once/60s)
- "VERIFY" button (`#btnConfirmOTP`)
- "LATER" button (`#btnCloseOTP`)
- Emergency Override button (`#emergencyBtn`) — visible only for admin riders

**Rate limiting:** 10 failed attempts → 60s block.

### Payment Panel (`#paymentPanel`)

**Trigger:** After OTP verified successfully.

**Components:**
- "COLLECT PAYMENT" heading
- Total to collect display (`#paymentTotalTxt`)
- **CASH** button (banknote icon)
- **UPI** button (smartphone icon)
- "CANCEL" button

### Success Overlay (`#successOverlay`)

**Trigger:** After payment recorded and delivery finalized.

**Components:**
- Check-circle icon
- "DELIVERED!" heading + "Order completed successfully"
- Payment method summary (`#summaryPayment`)
- Commission earnings (`#summaryCommission`)
- "BACK TO HOME" button
- **Confetti animation** 🎉
- Auto-closes after 4 seconds

### Notification Sheet (`#notificationSheet`)

**Trigger:** Bell icon tap.

**Components:**
- "Notifications" heading
- "Clear All" button
- Notification list (`#notifList`)
- Close button

### Settlement History Modal (`#settlementModal`)

**Trigger:** "View Settlement History" button tap.

**Components:**
- "Settlement History" heading
- Dynamic list of past settlements (`#settlementList`)
- Close button

---

## Rider Complete User Flows

### Flow A: Login → Dashboard
1. User opens `login.html` (or `index.html` if not authenticated)
2. Enters mobile (10 digits) or email + password
3. Firebase auth via synthetic email `{phone}@rider.com`
4. `onAuthStateChanged` fires → loads rider profile from `riders/{uid}`
5. Populates UI from cache first (instant), then live sync
6. Initializes: outlet coords, realtime listeners, geolocation tracking, push notifications, heartbeat, disconnect handlers, inactivity timer
7. Shows dashboard at `#sec-home`
8. Skeleton loader fades out

### Flow B: New Order Ping → Accept → Pickup → Deliver
1. Firebase listener detects unassigned order (status="ready")
2. `_doRenderAllOrders` finds a ping candidate (order < 2h old)
3. **Ping Modal** displays incoming order alert with 30s countdown + audio
4. Rider clicks **ACCEPT TASK** → `acceptOrder()`:
   - Validates GPS proximity to outlet (<500m)
   - Firebase transaction: assigns rider, generates 4-digit OTP, sets status "Arriving at Restaurant"
   - Sends WhatsApp "ACCEPTED" to customer
   - Switches to home section
5. Rider arrives at outlet → **SLIDE TO REACH OUTLET** → `reachedOutlet()`:
   - Validates GPS proximity (500m geofence)
   - Sets status "Arrived at Restaurant" with timestamp
6. Rider picks up items → **SLIDE TO PICK UP** → `confirmPickup()`:
   - Validates GPS proximity
   - Sets status "Picked Up" with timestamp
   - Switches to LIVE section with Leaflet map
   - Opens Google Maps navigation to customer
   - Sends WhatsApp "PICKED_UP" alert
7. En route → status auto-updates to "Out for Delivery"
8. Rider arrives at customer → **SLIDE TO REACH CUSTOMER** → `reachedDropLocation()`:
   - Sets status "Reached Drop Location"
   - Sends WhatsApp "ARRIVED" alert
   - Opens **OTP Panel**
9. Rider enters **4-digit OTP** from customer → **VERIFY**:
   - Rate-limited (10 attempts max, 60s block)
   - Checks against order OTP or fallback backup code
   - On success: opens **Payment Panel**
10. Rider selects payment method (**CASH** or **UPI**) → `recordPaymentAndComplete()`:
    - Sets status "Delivered" with timestamp
    - Records `verifiedBy` (OTP or ADMIN_FALLBACK)
    - Updates rider stats (totalOrders +1, totalEarnings + commission)
    - Shows **Success Overlay** with confetti 🎉
    - Auto-closes after 4 seconds
    - Returns to home

### Flow C: Emergency Override (Admin Rider Only)
1. Admin rider sees hidden `#emergencyBtn` in OTP panel
2. Clicks → "FORCE COMPLETE: Bypass customer OTP?" confirm dialog
3. On confirm → opens Payment Panel directly with `matchesFallback: true`
4. Proceeds to payment selection and delivery completion

### Flow D: OTP Regeneration
1. Customer can't read OTP
2. Rider clicks **REGENERATE & SEND OTP**
3. Rate-limited: once per 60s
4. Generates new 4-digit OTP, updates Firebase
5. WhatsApp bot detects field change → sends new OTP to customer
6. Rider cannot see the new OTP

### Flow E: Auto-Offline (Inactivity)
1. No user interaction for 30 minutes
2. Inactivity timer fires
3. Sets rider status to "Offline" in Firebase
4. Shows toast: "Auto-set Offline due to inactivity"

### Flow F: Profile Editing
1. Navigate to My Profile section
2. Edit phone → prompt for new number → updates Firebase
3. Edit address → prompt → updates Firebase
4. Upload profile photo → file picker → Firebase Storage → profile URL
5. Toggle Aadhar card image visibility

### Flow G: Settlement History
1. Tap "VIEW SETTLEMENT HISTORY" on wallet screen
2. Modal loads settlement data from Firebase
3. Displays list of past settlements
4. Close modal with × button

### Flow H: Notifications
1. New notification appears in Firebase `riders/{uid}/notifications`
2. Listener detects change → badge appears, haptic, sound
3. Tap bell icon → notification sheet slides up
4. Mark individual notifications as read or clear all

### Flow I: Pull-to-Refresh / Nuclear Refresh
1. Pull down at top of page (>80px) OR click refresh button
2. Clears all Firebase listeners, order cache, ignored pings
3. Reloads page

---

## Deployment Guide

### Firebase Hosting (Admin + Rider)

```bash
# Login to Firebase
firebase login

# Deploy admin dashboard
firebase deploy --only hosting:admin

# Deploy rider portal
firebase deploy --only hosting:rider

# Deploy QR menu app
firebase deploy --only hosting:menu

# Deploy all hosting targets
firebase deploy --only hosting
```

### WhatsApp Bot (EC2)

```bash
# SSH into EC2 instance
ssh -i your-key.pem ec2-user@your-instance-ip

# Clone / pull latest code
cd ~/Prasant-Pizza-ERP
git pull origin main

# Install bot dependencies
cd bot
npm install

# Ensure Redis is running
redis-cli ping   # Should return PONG

# Start bot via PM2 (from project root)
pm2 start ecosystem.config.js

# Or restart existing
pm2 restart pizza-bot
pm2 restart cake-bot

# Monitor logs
pm2 logs pizza-bot
pm2 monit
```

### First-Time Bot Setup (QR Scan)

```bash
pm2 stop pizza-bot
rm -rf bot/session_data_pizza   # Clear old session
pm2 start pizza-bot
pm2 logs pizza-bot
# Scan the QR code printed in logs with WhatsApp
```

### Useful PM2 Commands

```bash
pm2 status              # List all processes
pm2 logs pizza-bot      # Real-time logs
pm2 monit               # CPU/memory dashboard
pm2 stop pizza-bot      # Stop a process
pm2 restart pizza-bot   # Restart
pm2 delete pizza-bot    # Remove from PM2
pm2 startup             # Auto-start on EC2 reboot
pm2 save                # Save process list for startup
```

---

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OUTLET` | No | `pizza` | Outlet selection (`pizza` or `cake`) |
| `REDIS_URL` | No | `redis://127.0.0.1:6379` | Redis connection string. Use `rediss://` for TLS. For AWS ElastiCache Cluster Mode, use the cluster endpoint |
| `NODE_ENV` | No | `production` | Environment mode |

Set via PM2 ecosystem config or environment:

```bash
# Per-bot (via ecosystem.config.js)
OUTLET=pizza node bot/index.js
OUTLET=cake node bot/index.js
```

---

## Local Development Setup

### Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- **Redis** (local install or Docker)
- **Firebase project** with Realtime Database enabled
- **Service account key** (place at `bot/service-account.json`)

### Steps

```bash
# 1. Clone repository
git clone https://github.com/nexorasoftwareagency-rgb/roshani-pizza-bot.git
cd roshani-pizza-bot

# 2. Install bot dependencies
cd bot
npm install

# 3. Set up Firebase service account
# Download from Firebase Console → Project Settings → Service Accounts
# Save as bot/service-account.json

# 4. Start Redis (if using Docker)
docker run -d -p 6379:6379 redis:7

# 5. Start the bot
OUTLET=pizza node bot/index.js
# Scan QR code with WhatsApp

# 6. For admin/rider (use Firebase emulator or deploy)
cd ..
firebase serve --only hosting

# Admin at http://localhost:5000
# Rider at http://localhost:5001
```

### Running Without Redis

The bot automatically falls back to an in-memory cache if Redis is unavailable. Sessions and dedup will work but will not persist across bot restarts.

### Running Admin Locally (http-server)

```bash
# Serve admin with no cache
cd Admin
npx http-server -p 8080 -c-1

# Access at http://localhost:8080
```

---

## Project Structure

```
Prasant-Pizza-ERP/
├── Admin/                     # Admin Dashboard (Firebase Hosting: admin)
│   ├── index.html             # SPA shell with 20 tab sections
│   ├── init.js                # Firebase init + global helpers
│   ├── branding.js            # Multi-outlet CSS theming
│   ├── receipt-templates.js   # Thermal receipt HTML templates
│   ├── style.css              # Main styles (5500+ lines)
│   ├── mobile-overrides.css   # Mobile-specific styling
│   ├── sw.js                  # Service Worker
│   ├── firebase-messaging-sw.js
│   ├── manifest-pizza.json    # PWA manifest (Pizza)
│   ├── manifest-cake.json     # PWA manifest (Cake)
│   └── js/
│       ├── main.js            # Entry point (event delegation, module loader)
│       ├── auth.js            # Firebase Auth (login, logout, 3-tier, idle timeout)
│       ├── state.js           # Global reactive state object (40+ properties)
│       ├── firebase.js        # Firebase SDK exports
│       ├── utils.js           # Utility functions (dates, pagination, sounds, audit)
│       ├── ui-utils.js        # UI utilities (toasts, confirm dialogs, overlays)
│       ├── ui.js              # Tab switching, sidebar, theme toggle
│       ├── pwa.js             # PWA install, nuclear refresh
│       └── features/
│           ├── orders.js      # Order management (listeners, pagination, status, rider assign)
│           ├── tables.js      # Dine-in table management (floor grid, KDS, session billing, requests)
│           ├── catalog.js     # Dishes + Categories CRUD (listeners, modals, migrations)
│           ├── riders.js      # Rider management (Tabulator grid, CRUD, wallet settle)
│           ├── pos.js         # Walk-in POS (cart, discounts, coupons, checkout)
│           ├── settings.js    # Store settings (4 config nodes, validation)
│           ├── customers.js   # Customer database (Tabulator, LTV)
│           ├── notifications.js  # Alert system (toasts, badges, native notifications)
│           ├── tracker.js     # Live rider map (Leaflet, real-time markers)
│           ├── feedback.js    # Feedback display (Tabulator)
│           ├── inventory.js   # Stock tracking (Tabulator, import/export, toggles)
│           ├── rider-analytics.js  # Rider performance reports (Chart.js, Excel/PDF)
│           ├── printing.js    # Receipt printing
│           ├── promotions.js  # WhatsApp promo campaigns
│           ├── discounts.js   # Discount/coupon CRUD
│           └── discountsReports.js  # Discount performance analytics
│
├── rider/                     # Rider Portal (Firebase Hosting: rider)
│   ├── index.html             # SPA shell with 6 sections + modals
│   ├── login.html             # Standalone login page
│   ├── app.js                 # Full rider app logic (1764 lines)
│   ├── style.css              # Rider styles
│   ├── sw.js                  # Service Worker
│   ├── manifest.json
│   ├── firebase-messaging-sw.js
│   └── js/
│       ├── firebase.js        # Firebase SDK exports
│       ├── ui.js              # UI helpers (toasts, sidebar, sections)
│       ├── auth.js            # Login/logout
│       ├── geo.js             # Geolocation + Leaflet map
│       ├── pwa.js             # PWA install
│       ├── notifications.js   # Notifications management
│       ├── settlement.js      # Settlement history
│       ├── whatsapp.js        # WhatsApp link triggers
│       └── shared/
│           └── dom/
│               └── escape.js  # HTML escaping
│
├── bot/                       # WhatsApp Bot (EC2 - PM2)
│   ├── index.js               # Main bot logic (1676 lines — state machine, listeners)
│   ├── rider.js               # Rider notification engine
│   ├── reports.js             # Report generation (daily/weekly/monthly)
│   ├── reports2.js            # Alternative report module
│   ├── discounts.js           # Discount/coupon validation engine
│   ├── promos.js              # Promo campaign management
│   ├── firebase.js            # Firebase Admin SDK helpers
│   ├── package.json
│   ├── service-account.json   # Firebase service account key
│   ├── session_data_pizza/    # Auth session (auto-generated)
│   └── session_data_cake/     # Auth session (auto-generated)
│
├── shared/                    # Shared code across apps
│   └── dom/
│       └── escape.js          # HTML escaping utility
│
├── ecosystem.config.js        # PM2 process manager config
├── firebase.json              # Firebase Hosting config
├── .firebaserc                # Firebase project alias
├── database.rules.json        # Firebase RTDB security rules
├── storage.rules              # Firebase Storage rules
├── Cake-bot/                  # Cake outlet bot variant
├── capacitor-admin/           # Capacitor native wrapper for Admin
├── capacitor-rider/           # Capacitor native wrapper for Rider
├── QR Ordering Feature/       # QR Menu App (Firebase Hosting: menu)
│   └── Menu/
│       ├── index.html         # QR customer menu entry point
│       ├── css/app.css        # Menu app styles
│       └── js/
│           ├── app.js         # Menu app logic (boot, cart, order flow)
│           ├── ui.js          # Rendering helpers
│           ├── firebase.js    # Firebase SDK exports
│           ├── session.js     # Dine-in session management
│           ├── cart.js        # Cart state management
│           └── order.js       # Order placement
├── assets/                    # Static assets
```

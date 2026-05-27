# Roshani ERP — WhatsApp-Based Food Ordering & Delivery Management System

A full-stack ERP system for **Roshani Pizza** and **Roshani Cake** outlets. Customers order via WhatsApp bot; admins manage orders, menu, riders, and reports from a web dashboard; riders receive, track, and complete deliveries from a mobile-optimized web app.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Firebase Database Schema](#firebase-database-schema)
- [WhatsApp Bot (Core Engine)](#whatsapp-bot-core-engine)
- [Admin Dashboard](#admin-dashboard)
- [Rider Portal](#rider-portal)
- [Order Lifecycle (End-to-End Flow)](#order-lifecycle-end-to-end-flow)
- [Customer Flow](#customer-flow)
- [Admin Flow](#admin-flow)
- [Rider Flow](#rider-flow)
- [Deployment Guide](#deployment-guide)
- [Environment Variables](#environment-variables)
- [Local Development Setup](#local-development-setup)

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| WhatsApp Bot | **Node.js** + **@whiskeysockets/baileys** v6.17 | Multi-device WhatsApp Web API — send & receive messages |
| Admin Dashboard | **Vanilla JS** SPA (ES Modules) | 18-screen management panel |
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
| CSS Icons | **Lucide** v0.344 | UI icon set |

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
| `riders/{uid}` | Object | Rider profiles — `name`, `phone`, `email`, `status`, `location`, `fcmToken`, `notifications` |
| `bot/{outlet}/commands/` | List | Admin-triggered bot commands (reports) |
| `bot/{outlet}/status` | Object | Bot heartbeat — `lastSeen`, `status`, `outlet` |
| `botUsers/{cleanJid}` | Object | WhatsApp user profiles (saved after ordering) |
| `bot/logs/{orderId}` | Object | Bot notification delivery logs |
| `customers/{phone}` | Object | Customer data for POS lookup |
| `riderStats/{riderId}` | Object | Rider earnings, deliveries count, ratings |
| `settlements/{uid}` | List | Cash settlement history |
| `otpAttempts/{orderId}` | Object | OTP verification rate-limiting |
| `logs/` | Object | System error logs |

### Per-Outlet Structure (`pizza/` or `cake/`)

| Path | Purpose |
|---|---|
| `orders/{orderId}` | Order document — status, items, customer, payment, timestamps |
| `dishes/{dishId}` | Menu items — name, price, category, image, sizes, add-ons |
| `categories/{catId}` | Menu categories — name, image, sortOrder |
| `settings/Store` | Store info — name, address, coords, hours, banner |
| `settings/Delivery` | Delivery config — fee slabs, contact phones |
| `settings/Bot` | WhatsApp bot images per status, greeting image |
| `riders/` | Rider profiles (legacy/outlet-specific) |
| `inventory/{itemId}` | Stock tracking — name, stock, threshold |
| `customers/{phone}` | Saved customer profiles |
| `metadata/orderSequence/{dateStr}` | Atomic order ID counter per day |

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
  "deliveredAt": 1728392910000
}
```

---

## WhatsApp Bot (Core Engine)

**File:** `bot/index.js` (1929 lines)

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
[If no saved profile →] REUSE_PROFILE → NAME → PHONE → ADDRESS
  │
  ▼
LOCATION
  │  User shares live WhatsApp location → calculate delivery fee
  ▼
CONFIRM_PAY
  │  Show invoice (items + delivery fee + total)
  │  User: 1=Confirm, 2=Cancel
  ▼
ORDER PLACED → Saved to Firebase → Admin notified → Status tracking begins
```

**Special commands at any step:** `9` = View cart, `0` = Back, `RESET`/`CANCEL` = Clear everything

### Order Status Notification Engine

The bot listens to Firebase `child_changed` and `child_added` on `{outlet}/orders/`. When an order status changes, it sends a WhatsApp message to the customer with the appropriate template and image.

| Status | Customer Message | Image |
|---|---|---|
| **Placed** | "Thank you! We have received your order." | `imgPlaced` |
| **Confirmed** | Full invoice + confirmation message | `imgConfirmed` |
| **Preparing** | "Now in the kitchen!" | `imgPreparing` |
| **Cooked** | "Chef has finished cooking!" | `imgCooked` |
| **Ready / Packed** | "Packed and waiting for rider!" | `imgReady` |
| **Out for Delivery** | Rider info + 4-digit OTP for verification | `imgOut` |
| **Reached Drop Location** | "Rider has arrived!" + OTP | `imgOut` |
| **Delivered** | Success message + food joke | `imgDelivered` |
| **Cancelled** | Apology + reason | — |

### Rider Notification Engine

- **Rider Assignment**: When `order.riderId` changes → sends full invoice + customer location + Google Maps link to rider's WhatsApp
- **Pickup Ready**: When status = `ready` and rider is assigned → sends pickup notification with OTP
- **Broadcast**: When status = `ready` but no rider assigned → broadcasts to ALL online riders (status === "Online")

### Admin Notifications

- **New Order**: Full order details sent to all admin JIDs
- **Cancelled Order**: Lost-sale notification with potential revenue
- **Low Stock Alert**: When inventory falls below threshold
- **Daily/Weekly/Monthly Reports**: Sent at scheduled times via heartbeat

### Report Scheduling (Heartbeat — every 5 min)

| Time (IST) | Action |
|---|---|
| 21:30 | Daily sales report |
| 01:30 | Catch-up daily report (if bot was offline at 21:30) |
| 04:00 | Reset all report-sent flags |

Reports can also be triggered manually from the Admin Dashboard via `bot/{outlet}/commands` node.

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
- **Crypto error monitoring**: Counts undecryptable messages (Bad MAC errors). Logs warning at every 100th failure and an alert at 500+
- **Reconnection backoff**: Exponential: 5s → 15s → 45s → 120s max. Prevents rapid reconnect storms
- **Rate limiting**: 40 messages/min per user
- **Firebase listener cleanup**: `off()` before re-attaching to prevent duplicate listeners
- **Stale order cleanup**: Auto-cancels orders older than 5 hours (not delivered/cancelled/archived)

### Admin Command Listener

The bot watches `bot/{outlet}/commands/` for Firebase-triggered commands:

| Command | Action |
|---|---|
| `SEND_DAILY_REPORT` | Generate + send daily report (optional `targetDate`) |
| `SEND_WEEKLY_REPORT` | Generate + send weekly report |
| `SEND_MONTHLY_REPORT` | Generate + send monthly report |

Commands are deleted after processing.

### Inventory Management

When an order is placed, `deductInventoryStock()` matches item names against the `{outlet}/inventory/` node, deducts quantities, and sends a WhatsApp alert to the admin if any item falls below its threshold.

---

## Admin Dashboard

**URL:** Firebase Hosting — `roshani-sudha-admin` target  
**Tech:** Vanilla JS ES Modules + Firebase Realtime Database  
**Auth:** Firebase Auth (email/password)  
**PWA:** Installable on desktop/mobile via service worker  

### 18 Screens / Tabs

| # | Screen | Purpose |
|---|---|---|
| 1 | **Dashboard** | KPI cards (today's orders, revenue, active riders), priority orders table, recent orders, top spenders, top items, rider status |
| 2 | **Orders** | Full order history with date filters, search, status dropdown, rider assignment, print receipt |
| 3 | **Live Ops** | Real-time active order tracking for kitchen display |
| 4 | **POS Control** | Walk-in / dine-in point-of-sale: browse menu, add to cart, apply discount, print receipt |
| 5 | **Menu Mgmt** | CRUD for dishes: name, price, category, image, sizes, add-ons, visibility toggle, sort order |
| 6 | **Categories** | CRUD for menu categories: name, image, sort order, category-level add-ons |
| 7 | **Rider Mgmt** | CRUD for riders: name, email, phone, Aadhar, qualification, address, photos, status, stats |
| 8 | **Customers** | Customer database: search, order history, lifetime value |
| 9 | **Lost Sales** | Abandoned checkout tracking with potential revenue lost |
| 10 | **Analytics** | Date-range sales report, revenue trend chart (Chart.js), Excel/PDF export |
| 11 | **Rider Insights** | Per-rider performance: deliveries, earnings, delivery times, settle balance |
| 12 | **Feedback** | Customer ratings and reviews linked to orders |
| 13 | **Live Tracker** | Leaflet map showing all online rider positions in real-time (30s GPS updates) |
| 14 | **Notifications** | System alert history |
| 15 | **Inventory** | Stock tracking with low-stock thresholds and alerts |
| 16 | **Payments** | Payment transaction records |
| 17 | **Settings** | Store info, opening hours, delivery fee slabs (distance-based), WhatsApp bot images per status, outlet open/close toggle |
| 18 | **(Sidebar utilities)** | Theme toggle (light/dark), PWA install, Nuclear Refresh (clear all caches), Logout |

### Key Interactions

- **Order management**: Click any order → side drawer opens with full details, status change dropdown, rider assignment, print receipt button
- **Status progression**: Placed → Confirmed → Preparing → Cooked → Out for Delivery → Delivered
- **Receipt printing**: Thermal receipt format rendered in browser print dialog
- **Excel/PDF export**: Analytics tab supports downloading filtered date-range reports
- **Push commands to bot**: "Bot Report" button writes to `bot/{outlet}/commands` for the WhatsApp bot to pick up
- **Auto-logout**: After 30 minutes of inactivity
- **Reauthentication**: Required for sensitive actions (delete rider, delete catalog items)

---

## Rider Portal

**URL:** Firebase Hosting — `roshani-sudha-rider` target  
**Tech:** Vanilla JS ES Modules + Firebase Realtime Database + Leaflet.js  
**Auth:** Firebase Auth (email/password, dedicated login page at `/login.html`)  
**PWA:** Installable on mobile home screen with audio alerts  

### 6 Screens / Tabs

| # | Screen | Purpose |
|---|---|---|
| 1 | **Home** | Performance dashboard: total deliveries, earnings today, ratings, active delivery card with status |
| 2 | **Available** | List of unassigned orders ready for pickup (status = cooked/ready/packed). Pings rider with 30s timer + audio alert |
| 3 | **Active Trip** | Current delivery: Leaflet map (rider position + customer drop), task cards, action buttons |
| 4 | **Completed** | Delivery history with dates, earnings, order details |
| 5 | **Earnings / Wallet** | Total earnings, cash to settle with admin, settlement history |
| 6 | **Profile** | Personal details, Aadhar card photo, status toggle (Online/Offline) |

### Rider Delivery Flow (Step-by-Step)

1. **Go Online** → GPS tracking starts via `navigator.geolocation.watchPosition()` (30s write interval to Firebase)
2. **Available Pickups** → Orders in "cooked/ready/packed" status appear
3. **Accept Ping** → 30-second countdown modal with audio alert. Must be within **500m of store** (geofence check)
4. **Navigate to Store** → Google Maps opens automatically
5. **Arrive at Restaurant** → Slide "SLIDE TO REACH OUTLET" → status: `Arrived at Restaurant` (geofence check: 500m)
6. **Pick Up Order** → Slide "SLIDE TO PICK UP" → status: `Picked Up` (geofence check: 500m)
7. **Navigate to Customer** → Google Maps opens to customer address → status: `Out for Delivery`
8. **Arrive at Customer** → Slide "SLIDE TO REACH CUSTOMER" → status: `Reached Drop Location`
9. **OTP Verification** → Customer provides 4-digit OTP. 10 failed attempts = 60s block. Admin fallback code available
10. **Payment** → Rider selects Cash or UPI
11. **Finalize Delivery** → Status: `Delivered`, timestamp recorded. Confetti animation. Stats updated

---

## Order Lifecycle (End-to-End Flow)

```
CUSTOMER SIDE (WhatsApp)
══════════════════════════
  1. Customer messages the bot number
  2. Bot responds with welcome + category menu
  3. Customer browses categories → dishes → selects size → quantity
  4. Customer shares location → bot calculates delivery fee
  5. Customer confirms order with payment method (COD/UPI)
  6. Order saved to Firebase → status: Placed
  7. Customer receives: "Thank you, order placed!"
  8. Admin receives: New order notification on WhatsApp + sees in Dashboard

ADMIN SIDE
══════════
  9. Admin sees order in Dashboard "Priority Orders" section
  10. Admin clicks order → reviews details in side drawer
  11. Admin updates status:
      Placed → Confirmed (order accepted)
      Customer receives: Full invoice + "Order Confirmed!"
  12. Kitchen starts preparing
      Admin updates: Confirmed → Preparing → Cooked
      Customer receives: Status update notifications with progress
  13. When Cooked → order appears in Rider's Available Pickups
      If rider assigned → rider gets WhatsApp notification + in-app ping
      If no rider → broadcast to all online riders

RIDER SIDE
══════════
  14. Rider accepts order (geofence verified: 500m from store)
  15. Rider arrives at store → confirms arrival → picks up
  16. Rider navigates to customer → arrives → verifies OTP
  17. Rider collects payment → finalizes delivery
  18. Status: Delivered → Customer receives "Enjoy your meal!" + food joke
  19. Rider stats updated (earnings + deliveries count)
  20. Cash payments added to rider's pending settlement balance

ADMIN SIDE (Completion)
═══════════════════════
  21. Admin sees order as "Delivered" in Dashboard
  22. Daily report at 9:30 PM IST summarizes all orders + revenue
  23. Admin can settle rider's pending cash balance in Rider Insights
```

---

## Customer Flow

```
                    ┌───────────────┐
                    │ Send msg to   │
                    │ WhatsApp Bot  │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │ Welcome +     │
                    │ Category Menu │
                    └───────┬───────┘
                            │ Reply with number
                    ┌───────▼───────┐
                    │ Dish List     │
                    └───────┬───────┘
                            │ Reply with number
                    ┌───────▼───────┐
                    │ Size Select   │
                    └───────┬───────┘
                            │ Reply with number
                    ┌───────▼───────┐
                    │ Quantity      │
                    └───────┬───────┘
                            │ Enter 1-50
                    ┌───────▼───────┐
                    │ Cart View     │
                    │ 1=Add more    │
                    │ 2=Checkout    │
                    │ 3=Clear cart  │
                    └───────┬───────┘
                            │ 2 (Checkout)
                    ┌───────▼───────────┐
                    │ Name → Phone →    │
                    │ Address → Location│
                    └───────┬───────────┘
                            │ Share live location
                    ┌───────▼───────────┐
                    │ Invoice +         │
                    │ Delivery Fee      │
                    │ 1=Confirm         │
                    │ 2=Cancel          │
                    └───────┬───────────┘
                            │ 1 (Confirm)
                    ┌───────▼───────────┐
                    │ ORDER PLACED ✅   │
                    │                   │
                    │ Receive updates:  │
                    │ • Confirmed       │
                    │ • Preparing       │
                    │ • Out for Delivery│
                    │ • Delivered       │
                    └───────────────────┘
```

---

## Admin Flow

```
                    ┌───────────────┐
                    │ Login:        │
                    │ Email/Password│
                    └───────┬───────┘
                            │
                    ┌───────▼───────────────┐
                    │    DASHBOARD          │
                    │ ┌───────────────────┐ │
                    │ │ Today's KPIs      │ │
                    │ │ Priority Orders   │ │
                    │ │ Recent Orders     │ │
                    │ │ Rider Status      │ │
                    │ └───────────────────┘ │
                    └───────┬───────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
   ┌────────────┐   ┌──────────────┐   ┌───────────┐
   │ ORDERS     │   │ LIVE OPS     │   │ POS       │
   │            │   │              │   │           │
   │ • Filter   │   │ Real-time    │   │ Walk-in   │
   │ • Search   │   │ kitchen view │   │ orders    │
   │ • Status   │   │              │   │ with cart │
   │   change   │   │              │   │ checkout  │
   │ • Assign   │   │              │   │ & print   │
   │   rider    │   │              │   │           │
   │ • Print    │   │              │   │           │
   │ • View     │   │              │   │           │
   └─────┬──────┘   └──────────────┘   └───────────┘
         │
         │  Click order
         ▼
   ┌────────────────┐
   │ ORDER DRAWER   │
   │                │
   │ Customer info  │
   │ Items list     │
   │ Status: ▾      │
   │ Rider: ▾       │
   │ Print Receipt  │
   │ Chat (link)    │
   └────────────────┘

   Other tabs available in sidebar:
   ┌──────────┬──────────┬───────────┬──────────┐
   │ Menu     │ Riders   │ Customers│ Reports  │
   │ (CRUD)   │ (CRUD)   │ (Search)  │(Charts)  │
   ├──────────┼──────────┼───────────┼──────────┤
   │ Rider    │ Live     │ Inventory│ Settings │
   │Analytics │ Tracker  │ (Stock)   │(Config)  │
   ├──────────┼──────────┼───────────┼──────────┤
   │ Lost     │ Feedback │ Notifs   │ Payments │
   │ Sales    │          │          │          │
   └──────────┴──────────┴───────────┴──────────┘
```

---

## Rider Flow

```
                    ┌───────────────┐
                    │ Login + Go    │
                    │ Online        │
                    └───────┬───────┘
                            │ GPS tracking starts
                    ┌───────▼───────────┐
                    │  HOME SCREEN      │
                    │ ┌───────────────┐ │
                    │ │ Today's Stats │ │
                    │ │ Active Order  │ │
                    │ └───────────────┘ │
                    └───────┬───────────┘
                            │
                    ┌───────▼───────────┐
                    │  AVAILABLE        │
                    │  PICKUPS          │
                    │                   │
                    │ [Ping Modal]      │
                    │ Order #-0001      │
                    │ 🕐 00:30          │
                    │ [ACCEPT] [IGNORE] │
                    │ (Audio Alert)     │
                    └───────┬───────────┘
                            │ ACCEPT (must be ≤500m from store)
                    ┌───────▼───────────┐
                    │  ACTIVE TRIP      │
                    │ ┌───────────────┐ │
                    │ │ 🗺️ Map        │ │
                    │ │ (rider + dest)│ │
                    │ └───────────────┘ │
                    │                   │
                    │ [1] ARRIVE AT     │
                    │     RESTAURANT    │
                    │     (500m geofence)│
                    │ [2] PICK UP       │
                    │     (500m geofence)│
                    │ [3] REACH CUSTOMER│
                    │ [4] VERIFY OTP   │
                    │ [5] COLLECT      │
                    │     PAYMENT      │
                    │ [6] FINALIZE     │
                    └───────┬───────────┘
                            │ Step 6 complete
                    ┌───────▼───────────┐
                    │ DELIVERED ✅      │
                    │                   │
                    │ 🎉 Confetti!      │
                    │ Stats Updated     │
                    │ Earning Added     │
                    └───────────────────┘
```

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

# Deploy both
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

---

## Project Structure

```
Prasant-Pizza-ERP/
├── Admin/                     # Admin Dashboard (Firebase Hosting: admin)
│   ├── index.html             # SPA shell with all tab sections
│   ├── init.js                # Firebase init + global helpers
│   ├── branding.js            # Multi-outlet CSS theming
│   ├── receipt-templates.js   # Thermal receipt HTML templates
│   ├── style.css              # Main styles
│   ├── sw.js                  # Service Worker
│   ├── firebase-messaging-sw.js
│   ├── manifest-pizza.json    # PWA manifest (Pizza)
│   ├── manifest-cake.json     # PWA manifest (Cake)
│   └── js/
│       ├── main.js            # Entry point (imports all feature modules)
│       ├── auth.js            # Firebase Auth (login, logout, session, idle timeout)
│       ├── state.js           # Global state object
│       ├── firebase.js        # Firebase SDK exports
│       ├── utils.js           # Utility functions
│       ├── ui.js              # Tab switching, sidebar, theme
│       ├── pwa.js             # PWA install, nuclear refresh
│       └── features/
│           ├── orders.js      # Order management
│           ├── catalog.js     # Dishes + Categories CRUD
│           ├── riders.js      # Rider management
│           ├── pos.js         # Walk-in POS
│           ├── settings.js    # Store settings
│           ├── customers.js   # Customer reports
│           ├── notifications.js
│           ├── tracker.js     # Live rider map
│           ├── feedback.js    # Feedback display
│           ├── inventory.js   # Stock tracking
│           ├── rider-analytics.js
│           └── printing.js    # Print receipt
│
├── rider/                     # Rider Portal (Firebase Hosting: rider)
│   ├── index.html             # SPA shell
│   ├── login.html             # Standalone login page
│   ├── app.js                 # Full rider app logic
│   ├── style.css              # Rider styles
│   ├── sw.js                  # Service Worker
│   ├── manifest.json
│   ├── firebase-messaging-sw.js
│   └── assets/
│       ├── sounds/alert.mp3   # New order ping
│       └── images/
│
├── bot/                       # WhatsApp Bot (EC2 - PM2)
│   ├── index.js               # Main bot logic (1929 lines)
│   ├── firebase.js            # Firebase Admin SDK helpers (cached reads/writes)
│   ├── package.json
│   ├── service-account.json   # Firebase service account key
│   └── session_data_pizza/    # Auth session (auto-generated)
│   └── session_data_cake/     # Auth session (auto-generated)
│
├── Pizza-bot/                 # Legacy pizza bot (deprecated)
├── Cake-bot/                  # Legacy cake bot (deprecated)
├── rider_old/                 # Legacy rider app (deprecated)
│
├── ecosystem.config.js        # PM2 process manager config
├── firebase.json              # Firebase Hosting config
├── .firebaserc                # Firebase project alias
├── database.rules.json        # Firebase RTDB security rules
├── storage.rules              # Firebase Storage rules
├── service-account.json       # Firebase Admin SDK (root)
└── *.md                       # Architecture docs, fix summaries
```

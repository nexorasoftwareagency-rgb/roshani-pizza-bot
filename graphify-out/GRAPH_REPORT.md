# Graph Report - .  (2026-04-24)

## Corpus Check
- 48 files · ~300,697 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 138 nodes · 164 edges · 32 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Bot Core|Bot Core]]
- [[_COMMUNITY_Admin Core|Admin Core]]
- [[_COMMUNITY_Order Management|Order Management]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Order Management|Order Management]]
- [[_COMMUNITY_Order Display|Order Display]]
- [[_COMMUNITY_Notifications|Notifications]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Order Management|Order Management]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Menu & Categories|Menu & Categories]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Order Management|Order Management]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Menu & Categories|Menu & Categories]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Rider App|Rider App]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Rider App|Rider App]]
- [[_COMMUNITY_Rider App|Rider App]]
- [[_COMMUNITY_Utility Functions|Utility Functions]]
- [[_COMMUNITY_Rider App|Rider App]]

## God Nodes (most connected - your core abstractions)
1. `getData()` - 9 edges
2. `escapeHtml()` - 6 edges
3. `resolvePath()` - 6 edges
4. `addNotification()` - 4 edges
5. `renderOrders()` - 4 edges
6. `renderWalkinCart()` - 4 edges
7. `setData()` - 4 edges
8. `updateData()` - 4 edges
9. `sendDailyReport()` - 4 edges
10. `showAlert()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `getRiderByEmail()` --calls--> `getData()`  [INFERRED]
  bot\index.js → rider\firebase.js
- `startBot()` --calls--> `getData()`  [INFERRED]
  bot\index.js → rider\firebase.js
- `renderNotifItem()` --calls--> `escapeHtml()`  [EXTRACTED]
  Admin\app.js → rider\app.js
- `clearLostSales()` --calls--> `showToast()`  [INFERRED]
  Admin\app.js → rider\app.js
- `printOrderReceipt()` --calls--> `showToast()`  [INFERRED]
  Admin\app.js → rider\app.js

## Communities

### Community 0 - "Bot Core"
Cohesion: 0.11
Nodes (19): deleteData(), getData(), pushData(), resolvePath(), setData(), updateData(), addInAppNotification(), formatCartSummary() (+11 more)

### Community 1 - "Admin Core"
Cohesion: 0.08
Nodes (0): 

### Community 2 - "Order Management"
Cohesion: 0.12
Nodes (12): checkWalkinCustomer(), createActiveDeliveryPanel(), createOrderCard(), escapeHtml(), initLocationTracking(), initNotificationListener(), initRealtimeListeners(), renderNotifItem() (+4 more)

### Community 3 - "Utility Functions"
Cohesion: 0.4
Nodes (0): 

### Community 4 - "Utility Functions"
Cohesion: 0.4
Nodes (5): clearLostSales(), loadLostSales(), printOrderReceipt(), showToast(), standardizeOrderData()

### Community 5 - "Order Management"
Cohesion: 0.5
Nodes (4): addToWalkinCart(), removeFromWalkinCart(), renderWalkinCart(), updateMobileCartSummaryState()

### Community 6 - "Order Display"
Cohesion: 0.5
Nodes (4): calculateTopSpenders(), renderOrders(), renderPriorityTable(), renderTopItems()

### Community 7 - "Notifications"
Cohesion: 0.5
Nodes (4): addNotification(), playSound(), showNativeNotification(), updateNotificationUI()

### Community 8 - "Utility Functions"
Cohesion: 0.67
Nodes (0): 

### Community 9 - "Order Management"
Cohesion: 0.67
Nodes (3): applyWalkinFilters(), filterWalkinByCategory(), renderWalkinDishGrid()

### Community 10 - "Utility Functions"
Cohesion: 1.0
Nodes (2): migrate(), updateStats()

### Community 11 - "Menu & Categories"
Cohesion: 1.0
Nodes (2): addCategory(), uploadImage()

### Community 12 - "Utility Functions"
Cohesion: 1.0
Nodes (2): selectPOSSize(), updatePOSModalTotal()

### Community 13 - "Order Management"
Cohesion: 1.0
Nodes (2): loadWalkinMenu(), renderWalkinCategoryTabs()

### Community 14 - "Utility Functions"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Utility Functions"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Menu & Categories"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Utility Functions"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Utility Functions"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Utility Functions"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Utility Functions"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Utility Functions"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Utility Functions"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Utility Functions"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Utility Functions"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Rider App"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Utility Functions"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Utility Functions"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Rider App"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Rider App"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Utility Functions"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Rider App"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Menu & Categories`** (2 nodes): `addCategory()`, `uploadImage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utility Functions`** (2 nodes): `selectPOSSize()`, `updatePOSModalTotal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Order Management`** (2 nodes): `loadWalkinMenu()`, `renderWalkinCategoryTabs()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utility Functions`** (2 nodes): `check_data.js`, `check()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utility Functions`** (2 nodes): `migrate_data.js`, `migrate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Menu & Categories`** (2 nodes): `repair_menu.js`, `repair()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utility Functions`** (2 nodes): `registerUsers()`, `register_users.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utility Functions`** (2 nodes): `resetAdmins()`, `reset_admins.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utility Functions`** (2 nodes): `test_bot_funny.js`, `getFoodFunnyProgress()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utility Functions`** (1 nodes): `branding.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utility Functions`** (1 nodes): `firebase-config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utility Functions`** (1 nodes): `receipt-templates.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utility Functions`** (1 nodes): `sw.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utility Functions`** (1 nodes): `ecosystem.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rider App`** (1 nodes): `sw.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utility Functions`** (1 nodes): `fix_corrupted_function.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utility Functions`** (1 nodes): `fix_remaining.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rider App`** (1 nodes): `fix_rider_app.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rider App`** (1 nodes): `fix_rider_ui_sync.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utility Functions`** (1 nodes): `seed_admins.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rider App`** (1 nodes): `seed_riders.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `escapeHtml()` connect `Order Management` to `Admin Core`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `initRealtimeListeners()` connect `Order Management` to `Admin Core`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `getData()` (e.g. with `getRiderByEmail()` and `notifyDeveloper()`) actually correct?**
  _`getData()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Should `Bot Core` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Admin Core` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Order Management` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
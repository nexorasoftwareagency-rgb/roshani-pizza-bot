# Graph Report - .  (2026-04-20)

## Corpus Check
- 16 files · ~280,337 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 115 nodes · 125 edges · 27 communities detected
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]

## God Nodes (most connected - your core abstractions)
1. `escapeHtml()` - 5 edges
2. `addNotification()` - 4 edges
3. `renderWalkinCart()` - 4 edges
4. `showAlert()` - 3 edges
5. `renderOrders()` - 3 edges
6. `filterWalkinByCategory()` - 3 edges
7. `applyWalkinFilters()` - 3 edges
8. `renderWalkinDishGrid()` - 3 edges
9. `sendImage()` - 3 edges
10. `updateStatusUI()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `renderNotifItem()` --calls--> `escapeHtml()`  [EXTRACTED]
  Admin\app.js → rider\app.js
- `showAlert()` --calls--> `escapeHtml()`  [EXTRACTED]
  Admin\app.js → rider\app.js
- `Pizza Category Icon` --conceptually_related_to--> `Prashant Pizza Printed Menu`  [INFERRED]
  assets/images/category_icon.png → assets/images/Menu.jpeg
- `Cheese Pizza Dish Photo` --conceptually_related_to--> `Veg Tropia Category`  [INFERRED]
  assets/images/Cheese Pizza.jpg → assets/images/Menu.jpeg

## Communities

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (0): 

### Community 1 - "Community 1"
Cohesion: 0.14
Nodes (9): checkWalkinCustomer(), createOrderCard(), escapeHtml(), initLocationTracking(), initRealtimeListeners(), renderNotifItem(), showAlert(), stopLocationTracking() (+1 more)

### Community 2 - "Community 2"
Cohesion: 0.15
Nodes (5): formatCartSummary(), sendCartView(), sendCategories(), sendGreeting(), sendImage()

### Community 3 - "Community 3"
Cohesion: 0.43
Nodes (4): deleteData(), getData(), setData(), updateData()

### Community 4 - "Community 4"
Cohesion: 0.4
Nodes (0): 

### Community 5 - "Community 5"
Cohesion: 0.4
Nodes (5): Pizza Category Icon, Cheese Pizza Dish Photo, Veg Exotica Category, Veg Tropia Category, Prashant Pizza Printed Menu

### Community 6 - "Community 6"
Cohesion: 0.5
Nodes (4): addNotification(), playSound(), showNativeNotification(), updateNotificationUI()

### Community 7 - "Community 7"
Cohesion: 0.5
Nodes (4): addToWalkinCart(), removeFromWalkinCart(), renderWalkinCart(), updateMobileCartSummaryState()

### Community 8 - "Community 8"
Cohesion: 0.67
Nodes (0): 

### Community 9 - "Community 9"
Cohesion: 0.67
Nodes (3): calculateTopSpenders(), renderOrders(), renderTopItems()

### Community 10 - "Community 10"
Cohesion: 1.0
Nodes (3): applyWalkinFilters(), filterWalkinByCategory(), renderWalkinDishGrid()

### Community 11 - "Community 11"
Cohesion: 1.0
Nodes (2): selectPOSSize(), updatePOSModalTotal()

### Community 12 - "Community 12"
Cohesion: 1.0
Nodes (2): printOrderReceipt(), standardizeOrderData()

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (2): addCategory(), uploadImage()

### Community 14 - "Community 14"
Cohesion: 1.0
Nodes (2): loadWalkinMenu(), renderWalkinCategoryTabs()

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (1): Pepperoni Pizza Placeholder

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (1): Pizza Mania Veg Category

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (1): Core Pizza Non-Veg Category

## Knowledge Gaps
- **6 isolated node(s):** `Pizza Category Icon`, `Cheese Pizza Dish Photo`, `Pepperoni Pizza Placeholder`, `Veg Exotica Category`, `Pizza Mania Veg Category` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 11`** (2 nodes): `selectPOSSize()`, `updatePOSModalTotal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (2 nodes): `printOrderReceipt()`, `standardizeOrderData()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (2 nodes): `addCategory()`, `uploadImage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (2 nodes): `loadWalkinMenu()`, `renderWalkinCategoryTabs()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (2 nodes): `registerUsers()`, `register_users.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (2 nodes): `resetAdmins()`, `reset_admins.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (1 nodes): `branding.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (1 nodes): `firebase-config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (1 nodes): `sw.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (1 nodes): `ecosystem.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (1 nodes): `sw.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `seed_admins.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `seed_riders.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `Pepperoni Pizza Placeholder`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `Pizza Mania Veg Category`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `Core Pizza Non-Veg Category`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `escapeHtml()` connect `Community 1` to `Community 0`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `initRealtimeListeners()` connect `Community 1` to `Community 0`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **What connects `Pizza Category Icon`, `Cheese Pizza Dish Photo`, `Pepperoni Pizza Placeholder` to the rest of the system?**
  _6 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._
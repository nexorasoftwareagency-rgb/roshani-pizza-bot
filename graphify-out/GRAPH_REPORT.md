# Graph Report - .  (2026-04-26)

## Corpus Check
- 42 files · ~274,590 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 196 nodes · 210 edges · 52 communities detected
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]

## God Nodes (most connected - your core abstractions)
1. `resolvePath()` - 6 edges
2. `handleOrderStatusUpdate()` - 6 edges
3. `getData()` - 5 edges
4. `addNotification()` - 4 edges
5. `escapeHtml()` - 4 edges
6. `renderOrders()` - 4 edges
7. `addNotification()` - 4 edges
8. `renderOrders()` - 4 edges
9. `renderWalkinCart()` - 4 edges
10. `initRealtimeListeners()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `getData()` --calls--> `getRiderByEmail()`  [INFERRED]
  bot\firebase.js → bot\index.js
- `getData()` --calls--> `startBot()`  [INFERRED]
  bot\firebase.js → bot\index.js
- `getData()` --calls--> `sendCategories()`  [INFERRED]
  bot\firebase.js → bot\index.js
- `setData()` --calls--> `addInAppNotification()`  [INFERRED]
  bot\firebase.js → bot\index.js
- `renderNotifItem()` --calls--> `escapeHtml()`  [EXTRACTED]
  Admin\app.js → rider\app.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (13): addNotification(), calculateTopSpenders(), escapeHtml(), initRealtimeListeners(), playSound(), renderNotifItem(), renderOrders(), renderPriorityTable() (+5 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (0): 

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (10): formatCartSummary(), formatJid(), isShopOpen(), notifyDeveloper(), parseTime(), sendCartView(), sendCategories(), sendDailyReport() (+2 more)

### Community 3 - "Community 3"
Cohesion: 0.16
Nodes (15): getData(), formatCartSummary(), formatJid(), formatOrderInvoice(), getFoodFunnyProgress(), getFunnyFoodJoke(), getRiderByEmail(), handleOrderStatusUpdate() (+7 more)

### Community 4 - "Community 4"
Cohesion: 0.48
Nodes (6): deleteData(), pushData(), resolvePath(), setData(), updateData(), addInAppNotification()

### Community 5 - "Community 5"
Cohesion: 0.4
Nodes (2): logError(), setupPushNotifications()

### Community 6 - "Community 6"
Cohesion: 0.4
Nodes (0): 

### Community 7 - "Community 7"
Cohesion: 0.5
Nodes (4): addNotification(), playSound(), showNativeNotification(), updateNotificationUI()

### Community 8 - "Community 8"
Cohesion: 0.5
Nodes (4): calculateTopSpenders(), renderOrders(), renderPriorityTable(), renderTopItems()

### Community 9 - "Community 9"
Cohesion: 0.5
Nodes (4): addToWalkinCart(), removeFromWalkinCart(), renderWalkinCart(), updateMobileCartSummaryState()

### Community 10 - "Community 10"
Cohesion: 0.5
Nodes (4): checkWalkinCustomer(), escapeHtml(), renderNotifItem(), showAlert()

### Community 11 - "Community 11"
Cohesion: 0.67
Nodes (0): 

### Community 12 - "Community 12"
Cohesion: 0.67
Nodes (3): applyWalkinFilters(), filterWalkinByCategory(), renderWalkinDishGrid()

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (2): migrate(), updateStats()

### Community 14 - "Community 14"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (2): clearLostSales(), loadLostSales()

### Community 16 - "Community 16"
Cohesion: 1.0
Nodes (2): loadWalkinMenu(), renderWalkinCategoryTabs()

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (2): addCategory(), uploadImage()

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (2): selectPOSSize(), updatePOSModalTotal()

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (2): printOrderReceipt(), standardizeOrderData()

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
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 14`** (2 nodes): `add_nilesh.js`, `run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (2 nodes): `clearLostSales()`, `loadLostSales()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (2 nodes): `loadWalkinMenu()`, `renderWalkinCategoryTabs()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (2 nodes): `addCategory()`, `uploadImage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (2 nodes): `selectPOSSize()`, `updatePOSModalTotal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (2 nodes): `printOrderReceipt()`, `standardizeOrderData()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (2 nodes): `branding.js`, `updateHeadElements()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (2 nodes): `check_data.js`, `check()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (2 nodes): `migrate_data.js`, `migrate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (2 nodes): `registerUsers()`, `register_users.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (2 nodes): `resetAdmins()`, `reset_admins.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (2 nodes): `test_bot_funny.js`, `getFoodFunnyProgress()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (2 nodes): `convertAll()`, `convert-icons.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `app_backup.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `firebase-config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `init.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `receipt-templates.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `sw.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `replace_symbols.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `replace_symbols_css.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `replace_symbols_html.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `ecosystem.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `index_old.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (1 nodes): `repair_menu.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (1 nodes): `check_html_symbols.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `check_html_symbols_v2.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `fix_encoding.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `firebase-messaging-sw.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `sw.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `add_admin.ps1`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `fix_app.ps1`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `fix_corrupted_function.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `fix_remaining.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `fix_rider_app.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `fix_rider_ui_sync.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `seed_admins.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `seed_riders.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `test_login.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `escapeHtml()` connect `Community 0` to `Community 5`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `initRealtimeListeners()` connect `Community 0` to `Community 5`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `getData()` connect `Community 3` to `Community 4`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `getData()` (e.g. with `getRiderByEmail()` and `sendCategories()`) actually correct?**
  _`getData()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
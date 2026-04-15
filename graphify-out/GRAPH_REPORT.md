# Graph Report - .  (2026-04-14)

## Corpus Check
- 14 files · ~66,394 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 55 nodes · 55 edges · 15 communities detected
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.75)
- Token cost: 1,000 input · 500 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Admin Dashboard Logic|Admin Dashboard Logic]]
- [[_COMMUNITY_Firebase Data Utilities|Firebase Data Utilities]]
- [[_COMMUNITY_Rider Dashboard Logic|Rider Dashboard Logic]]
- [[_COMMUNITY_WhatsApp Bot Core|WhatsApp Bot Core]]
- [[_COMMUNITY_Menu & Product Assets|Menu & Product Assets]]
- [[_COMMUNITY_SalesMetrics Reporting|Sales/Metrics Reporting]]
- [[_COMMUNITY_Report Generation logic|Report Generation logic]]
- [[_COMMUNITY_Category Management|Category Management]]
- [[_COMMUNITY_Registration Seed Scripts|Registration Seed Scripts]]
- [[_COMMUNITY_Admin Management Scripts|Admin Management Scripts]]
- [[_COMMUNITY_Seed Admin Data|Seed Admin Data]]
- [[_COMMUNITY_Seed Rider Data|Seed Rider Data]]
- [[_COMMUNITY_Product Placeholders|Product Placeholders]]
- [[_COMMUNITY_Pizza Mania Categories|Pizza Mania Categories]]
- [[_COMMUNITY_Non-Veg Categories|Non-Veg Categories]]

## God Nodes (most connected - your core abstractions)
1. `escapeHtml()` - 3 edges
2. `renderOrders()` - 3 edges
3. `sendImage()` - 3 edges
4. `Prashant Pizza Printed Menu` - 3 edges
5. `uploadImage()` - 2 edges
6. `initRealtimeListeners()` - 2 edges
7. `calculateTopSpenders()` - 2 edges
8. `renderTopItems()` - 2 edges
9. `addCategory()` - 2 edges
10. `loadReports()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Pizza Category Icon` --conceptually_related_to--> `Prashant Pizza Printed Menu`  [INFERRED]
  assets/images/category_icon.png → assets/images/Menu.jpeg
- `Cheese Pizza Dish Photo` --conceptually_related_to--> `Veg Tropia Category`  [INFERRED]
  assets/images/Cheese Pizza.jpg → assets/images/Menu.jpeg

## Communities

### Community 0 - "Admin Dashboard Logic"
Cohesion: 0.12
Nodes (0): 

### Community 1 - "Firebase Data Utilities"
Cohesion: 0.43
Nodes (4): deleteData(), getData(), setData(), updateData()

### Community 2 - "Rider Dashboard Logic"
Cohesion: 0.4
Nodes (3): createOrderCard(), escapeHtml(), initRealtimeListeners()

### Community 3 - "WhatsApp Bot Core"
Cohesion: 0.6
Nodes (3): sendCategories(), sendGreeting(), sendImage()

### Community 4 - "Menu & Product Assets"
Cohesion: 0.4
Nodes (5): Pizza Category Icon, Cheese Pizza Dish Photo, Veg Exotica Category, Veg Tropia Category, Prashant Pizza Printed Menu

### Community 5 - "Sales/Metrics Reporting"
Cohesion: 0.67
Nodes (3): calculateTopSpenders(), renderOrders(), renderTopItems()

### Community 6 - "Report Generation logic"
Cohesion: 1.0
Nodes (2): generateCustomReport(), loadReports()

### Community 7 - "Category Management"
Cohesion: 1.0
Nodes (2): addCategory(), uploadImage()

### Community 8 - "Registration Seed Scripts"
Cohesion: 1.0
Nodes (0): 

### Community 9 - "Admin Management Scripts"
Cohesion: 1.0
Nodes (0): 

### Community 10 - "Seed Admin Data"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Seed Rider Data"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Product Placeholders"
Cohesion: 1.0
Nodes (1): Pepperoni Pizza Placeholder

### Community 13 - "Pizza Mania Categories"
Cohesion: 1.0
Nodes (1): Pizza Mania Veg Category

### Community 14 - "Non-Veg Categories"
Cohesion: 1.0
Nodes (1): Core Pizza Non-Veg Category

## Knowledge Gaps
- **6 isolated node(s):** `Pizza Category Icon`, `Cheese Pizza Dish Photo`, `Pepperoni Pizza Placeholder`, `Veg Exotica Category`, `Pizza Mania Veg Category` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Report Generation logic`** (2 nodes): `generateCustomReport()`, `loadReports()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Category Management`** (2 nodes): `addCategory()`, `uploadImage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Registration Seed Scripts`** (2 nodes): `registerUsers()`, `register_users.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Admin Management Scripts`** (2 nodes): `resetAdmins()`, `reset_admins.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Seed Admin Data`** (1 nodes): `seed_admins.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Seed Rider Data`** (1 nodes): `seed_riders.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Product Placeholders`** (1 nodes): `Pepperoni Pizza Placeholder`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pizza Mania Categories`** (1 nodes): `Pizza Mania Veg Category`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Non-Veg Categories`** (1 nodes): `Core Pizza Non-Veg Category`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `escapeHtml()` connect `Rider Dashboard Logic` to `Admin Dashboard Logic`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `initRealtimeListeners()` connect `Rider Dashboard Logic` to `Admin Dashboard Logic`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `Pizza Category Icon`, `Cheese Pizza Dish Photo`, `Pepperoni Pizza Placeholder` to the rest of the system?**
  _6 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Dashboard Logic` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
/**
 * ROSHANI ERP | GLOBAL STATE
 * Reactive state management for the application.
 */

export const state = {
    adminData: null,
    currentOutlet: 'pizza',
    categories: [],
    allWalkinDishes: [],
    activeWalkinCategory: 'All',
    walkinCart: {},
    walkinPayMethod: 'Cash',
    isEditRiderMode: false,
    currentEditingRiderId: null,
    editingDishId: null,
    lastOrdersSnap: null,
    lastDishesSnap: null,
    ordersMap: new Map(),
    liveOrdersMap: new Map(), // Dedicated map for ongoing/recent orders
    notifications: [],
    isNotificationPending: false,
    deferredPrompt: null,
    ridersList: [],
    riderStatsData: {},
    _ordersValueCb: null,
    _ordersChildCb: null,
    _ordersChangedCb: null,
    walkinDiscount: 0,
    walkinDiscountPct: 0,
    currentPOSModalDish: null,
    currentPOSModalQty: 1,
    currentPOSModalSize: null,
    currentPOSModalAddons: {},
    currentActiveTab: 'dashboard',
    editingCartKey: null
};


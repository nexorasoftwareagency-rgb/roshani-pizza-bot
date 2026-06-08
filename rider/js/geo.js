/**
 * RIDER Geo utilities — location tracking, outlet coords, distance checks.
 * Uses shared/geo/geo.js for the Haversine formula.
 */
import { calculateDistance } from '../shared/geo/geo.js';
import { db, ref, get, update, serverTimestamp } from './firebase.js';

const DEFAULT_COORDS = {
    pizza: { lat: 25.887944, lng: 85.026194 },
    cake: { lat: 25.887472, lng: 85.026861 }
};

let _locationInterval = null;

export function initGeo() {
    window.outletCoords = { ...DEFAULT_COORDS };
    window.PICKUP_RADIUS_KM = 0.5;
    window.getDistance = calculateDistance;
}

export async function loadOutletCoords() {
    try {
        const pizzaStore = await get(ref(db, 'pizza/settings/Store'));
        const cakeStore = await get(ref(db, 'cake/settings/Store'));
        if (pizzaStore.val()) {
            window.outletCoords.pizza.lat = parseFloat(pizzaStore.val().lat) || DEFAULT_COORDS.pizza.lat;
            window.outletCoords.pizza.lng = parseFloat(pizzaStore.val().lng) || DEFAULT_COORDS.pizza.lng;
        }
        if (cakeStore.val()) {
            window.outletCoords.cake.lat = parseFloat(cakeStore.val().lat) || DEFAULT_COORDS.cake.lat;
            window.outletCoords.cake.lng = parseFloat(cakeStore.val().lng) || DEFAULT_COORDS.cake.lng;
        }
        console.log("[Outlet] Coordinates loaded:", window.outletCoords);
    } catch (e) {
        console.warn("[Outlet] Using default coordinates");
    }
}

export function initLocationTracking() {
    if (!navigator.geolocation) return;
    // Clear any existing interval first to prevent stacking
    stopLocationTracking();
    _locationInterval = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                window.riderLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                // Upload location to Firebase for admin tracking
                _uploadLocation(pos.coords.latitude, pos.coords.longitude);
            },
            (err) => {
                console.warn("[Geo] Location error:", err.message);
                if (err.code === 1) { // PERMISSION_DENIED
                    window.showToast?.("GPS permission denied. Enable location in settings.", "error");
                }
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }, 30000);
    // Immediate first read
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            window.riderLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            _uploadLocation(pos.coords.latitude, pos.coords.longitude);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

async function _uploadLocation(lat, lng) {
    try {
        const uid = window.currentUser?.uid || window.currentUser?.profile?.id;
        if (!uid) return;
        await update(ref(db, `riders/${uid}/location`), {
            lat, lng, ts: Date.now()
        });
    } catch (_) { /* silent — GPS still works locally */ }
}

export function stopLocationTracking() {
    if (_locationInterval) { clearInterval(_locationInterval); _locationInterval = null; }
}

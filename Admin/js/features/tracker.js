/**
 * ROSHANI ERP | LIVE RIDER TRACKER MODULE
 * Handles Leaflet map initialization and live rider location tracking.
 */

import { Outlet } from '../firebase.js';
import { escapeHtml } from '../utils.js';

let adminTrackerMap = null;
let riderMarkersMap = new Map(); // Store markers by rider ID
let riderLocationCb = null; // Track callback for cleanup

/**
 * INITIALIZE LIVE MAP
 */
export function initLiveRiderTracker() {
    const mapDiv = document.getElementById('adminLiveMap');
    if (!mapDiv) return;

    // Clean up existing map if it exists
    if (adminTrackerMap) {
        try {
            adminTrackerMap.remove();
        } catch (e) {
            console.warn("Map removal error:", e);
        }
        adminTrackerMap = null;
    }

    // Initialize Map at a default center (India)
    // Note: Leaflet (L) is assumed to be loaded globally via script tag in index.html
    if (typeof L === 'undefined') {
        console.error("Leaflet library not found. Map cannot be initialized.");
        mapDiv.innerHTML = '<div class="p-20 text-center">Leaflet Map Library Missing</div>';
        return;
    }

    adminTrackerMap = L.map('adminLiveMap').setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(adminTrackerMap);

    startRiderLocationListener();
}

/**
 * CLEANUP MAP & LISTENERS
 */
export function cleanupLiveRiderTracker() {
    console.log("[Performance] Cleaning up Live Rider Tracker...");
    if (riderLocationCb) {
        Outlet.ref('riders').off('value', riderLocationCb);
        riderLocationCb = null;
    }
    if (adminTrackerMap) {
        try {
            adminTrackerMap.remove();
        } catch (e) {
            console.warn("Map removal error:", e);
        }
        adminTrackerMap = null;
    }
    riderMarkersMap.clear();
}

/**
 * START REAL-TIME LOCATION LISTENER
 */
function startRiderLocationListener() {
    if (riderLocationCb) {
        Outlet.ref('riders').off('value', riderLocationCb);
    }

    riderLocationCb = snap => {
        let onlineCount = 0;
        let bounds = [];

        snap.forEach(child => {
            const r = child.val();
            const id = child.key;

            if (r.status === "Online" && r.location) {
                onlineCount++;
                const pos = [r.location.lat, r.location.lng];
                bounds.push(pos);

                if (riderMarkersMap.has(id)) {
                    // Update existing marker
                    const marker = riderMarkersMap.get(id);
                    marker.setLatLng(pos);
                    marker.getPopup().setContent(`
                        <div style="font-family: 'Outfit', sans-serif;">
                            <strong style="color:var(--primary)">${escapeHtml(r.name)}</strong><br>
                            <small>${escapeHtml(r.phone)}</small><br>
                            <div style="margin-top:5px; font-size:10px; font-weight:800; color:var(--success)">MOVED: ${new Date(r.location.ts).toLocaleTimeString()}</div>
                        </div>
                    `);
                } else {
                    // Create new marker
                    const marker = L.marker(pos, {
                        icon: L.icon({
                            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                            iconSize: [25, 41],
                            iconAnchor: [12, 41],
                            popupAnchor: [1, -34],
                            shadowSize: [41, 41]
                        })
                    }).addTo(adminTrackerMap).bindPopup(`
                        <div style="font-family: 'Outfit', sans-serif;">
                            <strong style="color:var(--primary)">${escapeHtml(r.name)}</strong><br>
                            <small>${escapeHtml(r.phone)}</small>
                        </div>
                    `);
                    riderMarkersMap.set(id, marker);
                }
            } else {
                // Remove marker if rider goes offline
                if (riderMarkersMap.has(id)) {
                    if (adminTrackerMap) adminTrackerMap.removeLayer(riderMarkersMap.get(id));
                    riderMarkersMap.delete(id);
                }
            }
        });

        // Update Stats UI
        const statsEl = document.getElementById('trackerStats');
        if (statsEl) statsEl.innerText = `${onlineCount} Riders Online`;

        // Fit map to show all riders
        if (bounds.length > 0 && adminTrackerMap) {
            const currentBounds = L.latLngBounds(bounds);
            adminTrackerMap.fitBounds(currentBounds, { padding: [50, 50], maxZoom: 15 });
        }
    };

    Outlet.ref('riders').on('value', riderLocationCb);
}

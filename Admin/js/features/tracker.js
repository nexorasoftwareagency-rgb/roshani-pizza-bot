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

                const popupContent = generateRiderPopup(r);

                if (riderMarkersMap.has(id)) {
                    // Update existing marker
                    const marker = riderMarkersMap.get(id);
                    marker.setLatLng(pos);
                    marker.getPopup().setContent(popupContent);
                } else {
                    // Create new marker
                    const marker = L.marker(pos, {
                        icon: L.icon({
                            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                            iconSize: [25, 41],
                            iconAnchor: [12, 41],
                            popupAnchor: [1, -34],
                            shadowSize: [41, 41]
                        })
                    }).addTo(adminTrackerMap).bindPopup(popupContent);
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

/**
 * GENERATE PREMIUM POPUP CONTENT
 */
function generateRiderPopup(r) {
    const lastSeen = r.location && r.location.ts ? 
        new Date(r.location.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
        'Recently';
    
    const profileImg = r.photoUrl || "https://ui-avatars.com/api/?name=" + encodeURIComponent(r.name || 'R') + "&background=random";
    const displayStatus = (r.status === "Online" && r.currentOrder) ? "On Delivery" : "Online";
    const statusClass = displayStatus.toLowerCase().replace(/\s+/g, '-');

    return `
        <div class="identity-info-v4 p-10" style="min-width: 180px;">
            <div class="identity-chip-v4 mb-10">
                <img src="${profileImg}" class="identity-avatar-v4" style="width:32px; height:32px;">
                <div class="identity-info-v4">
                    <span class="name color-primary" style="font-size:14px;">${escapeHtml(r.name || 'Rider')}</span>
                    <span class="sub" style="font-size:11px;"><i data-lucide="phone" style="width:10px;"></i> ${escapeHtml(r.phone || '')}</span>
                </div>
            </div>
            
            <div class="mt-8 pt-8 border-t-ghost">
                <div class="flex-between flex-center mb-8">
                    <span class="text-muted-small ls-sm text-upper" style="font-size:9px;">Activity</span>
                    <div class="rider-status-pill-v4 ${statusClass}" style="padding: 2px 8px; font-size: 9px;">
                        <span class="rider-dot-v4"></span>
                        <span>${displayStatus}</span>
                    </div>
                </div>
                <div class="flex-between flex-center">
                    <span class="text-muted-small ls-sm text-upper" style="font-size:9px;">Last Seen</span>
                    <span class="text-dark font-bold" style="font-size:10px;">${lastSeen}</span>
                </div>
            </div>
        </div>
    `;
}

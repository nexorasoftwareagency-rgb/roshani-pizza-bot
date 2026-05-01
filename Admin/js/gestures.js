/**
 * ROSHANI ERP | GESTURE MANAGEMENT
 * Handles mobile-specific gestures like swipe-to-close for drawers.
 */

import { haptic } from './utils.js';

export function initGestures() {
    initSwipeToClose('orderDrawer', () => {
        // Logic to close the drawer
        const drawer = document.getElementById('orderDrawer');
        if (drawer) drawer.classList.remove('active');
    });

    initSwipeToClose('notificationSheet', () => {
        const sheet = document.getElementById('notificationSheet');
        const overlay = document.getElementById('notificationOverlay');
        if (sheet) sheet.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
    });
}

/**
 * INIT SWIPE TO CLOSE
 * Adds touch listeners to a bottom-sheet element.
 */
function initSwipeToClose(elementId, closeCallback) {
    const el = document.getElementById(elementId);
    if (!el) return;

    let startY = 0;
    let currentY = 0;
    let isSwiping = false;

    el.addEventListener('touchstart', (e) => {
        // Only trigger if we are at the top of the scroll inside the drawer
        if (el.scrollTop > 0) return;
        
        startY = e.touches[0].pageY;
        currentY = startY; // Initialize currentY to avoid stale values
        isSwiping = true;
        el.style.transition = 'none'; // Disable transitions during swipe
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        
        currentY = e.touches[0].pageY;
        const diff = currentY - startY;
        
        if (diff > 0) {
            // Dragging down
            el.style.transform = `translateY(${diff}px)`;
            // Stop propagation to prevent body scroll
            if (e.cancelable) e.preventDefault();
        }
    }, { passive: false });

    el.addEventListener('touchend', () => {
        if (!isSwiping) return;
        isSwiping = false;
        
        const diff = currentY - startY;
        el.style.transition = ''; // Restore transitions
        
        if (diff > 120) {
            // Threshold met, close it
            haptic(10);
            el.style.transform = ''; // Reset transform for CSS class to handle
            closeCallback();
        } else {
            // Snap back
            el.style.transform = '';
        }
        
        startY = 0;
        currentY = 0;
    });

    el.addEventListener('touchcancel', () => {
        isSwiping = false;
        el.style.transition = '';
        el.style.transform = '';
        startY = 0;
        currentY = 0;
    });
}

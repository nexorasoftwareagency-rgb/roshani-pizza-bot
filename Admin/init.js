/**
 * PIZZA ERP | ADMIN INITIALIZATION
 * Extracted from index.html for CSP compliance.
 */

// Initialize Firebase
if (typeof firebase !== 'undefined' && typeof window.firebaseConfig !== 'undefined') {
    if (!firebase.apps.length) {
        firebase.initializeApp(window.firebaseConfig);
    }
}

// Global Helpers
window.haptic = (pattern = 10) => {
    if (navigator.vibrate) navigator.vibrate(pattern);
};

// Lucide Icons
document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

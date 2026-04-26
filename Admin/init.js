/**
 * PIZZA ERP | ADMIN INITIALIZATION
 * Extracted from index.html for CSP compliance.
 */

// Initialize Firebase
if (typeof window.firebaseConfig !== 'undefined') {
    if (!firebase.apps.length) {
        firebase.initializeApp(window.firebaseConfig);
    }
}

// Global Helpers
window.haptic = (pattern = 10) => {
    if (navigator.vibrate) navigator.vibrate(pattern);
};

window.previewImage = (input, previewId) => {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById(previewId);
            if (preview) preview.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
};

// Lucide Icons
document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

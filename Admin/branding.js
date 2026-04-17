/**
 * PIZZA ERP | DYNAMIC BRANDING ENGINE
 * Handles multi-brand PWA manifests and theme switching.
 */
(function() {
    // 1. Determine Brand (URL Param > LocalStorage > Default)
    const urlParams = new URLSearchParams(window.location.search);
    let brand = urlParams.get('brand');
    
    if (brand) {
        localStorage.setItem('admin_brand', brand);
    } else {
        brand = localStorage.getItem('admin_brand') || 'pizza';
    }

    // 2. Branding Config
    const config = {
        pizza: {
            manifest: 'manifest-pizza.json',
            icon: 'icon-pizza.png',
            theme: '#FF6B00',
            title: 'Roshani Pizza | Admin'
        },
        cake: {
            manifest: 'manifest-cake.json',
            icon: 'icon-cake.png',
            theme: '#fbcfe8',
            title: 'Roshani Cake Boutique | Admin'
        }
    };

    const active = config[brand] || config.pizza;

    // 3. Apply Branding to DOM
    document.addEventListener('DOMContentLoaded', () => {
        // Update Title
        document.title = active.title;

        // Update Manifest
        let manifest = document.querySelector('link[rel="manifest"]');
        if (manifest) manifest.setAttribute('href', active.manifest);

        // Update Apple Icon
        let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
        if (appleIcon) appleIcon.setAttribute('href', active.icon);

        // Update Theme Color
        let themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) themeColor.setAttribute('content', active.theme);
        
        console.log(`[Branding] Switched to ${brand.toUpperCase()} mode.`);
    });
})();

/**
 * Global helper to switch brands
 */
window.switchBrand = function(newBrand) {
    if (newBrand === localStorage.getItem('admin_brand')) return;
    localStorage.setItem('admin_brand', newBrand);
    window.location.reload(); // Reload to apply manifest changes
};

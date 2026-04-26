/**
 * PIZZA ERP | DYNAMIC BRANDING ENGINE
 * Handles multi-brand PWA manifests and theme switching.
 */
(function() {
    // 1. Determine Brand (URL Param > SessionStorage > Default)
    const urlParams = new URLSearchParams(window.location.search);
    let brand = urlParams.get('brand');
    
    // Circuit Breaker: Strip brand from URL to prevent loop if it conflicts with DB
    if (brand) {
        sessionStorage.setItem('admin_brand', brand);
        const url = new URL(window.location.href);
        url.searchParams.delete('brand');
        window.history.replaceState({}, '', url.toString());
    } else {
        brand = sessionStorage.getItem('admin_brand') || 'pizza';
    }

    // 2. Branding Config
    const config = {
        pizza: {
            manifest: 'manifest-pizza.json',
            icon: 'icon-pizza.webp',
            theme: '#FF6B00',
            title: 'Roshani Pizza | Admin'
        },
        cake: {
            manifest: 'manifest-cake.json',
            icon: 'icon-cake.webp',
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
        if (!themeColor) {
            themeColor = document.createElement('meta');
            themeColor.setAttribute('name', 'theme-color');
            document.head.appendChild(themeColor);
        }
        themeColor.setAttribute('content', active.theme);

        // Dynamic CSS Variable Injection for Global Themes
        const root = document.documentElement;
        if (brand === 'cake') {
            root.style.setProperty('--primary', '#EC4899'); // Pink-500
            root.style.setProperty('--primary-orange', '#EC4899'); // Alias for components using old name
            root.style.setProperty('--primary-dark', '#BE185D'); // Pink-700
        } else {
            root.style.setProperty('--primary', '#F97316'); // Orange-500
            root.style.setProperty('--primary-orange', '#F97316'); 
            root.style.setProperty('--primary-dark', '#EA580C'); // Orange-700
        }
        
        // Update Header Titles
        const sidebarBrand = document.getElementById('sidebarBrandText');
        const loginHeader = document.querySelector('.login-box h2');
        if (sidebarBrand) {
            sidebarBrand.innerText = brand === 'cake' ? 'ROSHANI CAKE' : 'ROSHANI PIZZA';
        }
        if (loginHeader) {
            loginHeader.innerText = 'ROSHANI ADMIN LOGIN';
        }

        console.log(`[Branding] Switched to ${brand.toUpperCase()} mode. Theme: ${active.theme}`);
    });
})();

/**
 * Global helper to switch brands
 */
window.switchBrand = function(newBrand) {
    if (newBrand === sessionStorage.getItem('admin_brand')) return;
    sessionStorage.setItem('admin_brand', newBrand);
    window.location.reload(); // Reload to apply manifest changes
};

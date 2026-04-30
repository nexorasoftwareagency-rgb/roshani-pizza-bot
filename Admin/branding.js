/**
 * ROSHANI ERP | MULTI-TENANT BRANDING ENGINE
 * Handles dynamic CSS theming, PWA Manifest swapping, and Favicons.
 */

(function () {
    // 1. Determine Current Brand
    const savedOutlet = sessionStorage.getItem('adminSelectedOutlet') || 'pizza';
    const brand = savedOutlet.toLowerCase().includes('cake') ? 'cake' : 'pizza';

    const isPizza = brand === 'pizza';
    const primaryColor = isPizza ? '#FF5200' : '#E91E63'; // Pizza Orange vs Cake Pink
    const secondaryColor = isPizza ? '#FFF5F0' : '#FFF0F5';

    // 2. Apply Dynamic CSS Variables to Root
    const root = document.documentElement;
    root.style.setProperty('--primary', primaryColor);
    root.style.setProperty('--primary-rgb', isPizza ? '255, 82, 0' : '233, 30, 99');
    root.style.setProperty('--bg-secondary', secondaryColor);

    // 3. Update Browser UI Elements (Mobile Friendly)
    const updateHeadElements = () => {
        // Update Theme Color (Address Bar color on Mobile)
        let themeMeta = document.querySelector('meta[name="theme-color"]');
        if (!themeMeta) {
            themeMeta = document.createElement('meta');
            themeMeta.name = 'theme-color';
            document.head.appendChild(themeMeta);
        }
        themeMeta.setAttribute('content', primaryColor);

        // Update Favicon
        let favicon = document.querySelector('link[rel="icon"]');
        if (!favicon) {
            favicon = document.createElement('link');
            favicon.rel = 'icon';
            document.head.appendChild(favicon);
        }
        favicon.href = isPizza ? 'icon-pizza.webp' : 'icon-cake.webp';

        // Update Apple Touch Icon (PWA)
        let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
        if (!appleIcon) {
            appleIcon = document.createElement('link');
            appleIcon.rel = 'apple-touch-icon';
            document.head.appendChild(appleIcon);
        }
        appleIcon.href = isPizza ? 'icon-pizza.webp' : 'icon-cake.webp';

        // 4. CRITICAL: SWAP PWA MANIFEST
        // This ensures that when you "Add to Home Screen", you get the right app name/icon
        let manifest = document.querySelector('link[rel="manifest"]');
        const manifestFile = isPizza ? 'manifest-pizza.json' : 'manifest-cake.json';

        if (manifest) {
            manifest.setAttribute('href', manifestFile);
        } else {
            const newManifest = document.createElement('link');
            newManifest.rel = 'manifest';
            newManifest.href = manifestFile;
            document.head.appendChild(newManifest);
        }
    };

    // Run immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateHeadElements);
    } else {
        updateHeadElements();
    }

    // 5. Global Branding Helper for App.js
    window.getBrandDetails = () => {
        return {
            type: brand,
            primary: primaryColor,
            name: isPizza ? 'Roshani Pizza' : 'Roshani Cakes',
            tagline: isPizza ? 'The Taste of Happiness' : 'Sweetness in Every Bite'
        };
    };

    console.log(`[Branding Engine] Active Theme: ${brand.toUpperCase()}`);
})();
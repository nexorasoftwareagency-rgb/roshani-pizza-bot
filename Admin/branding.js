(function () {
    const primaryColor = '#f36b21';
    const root = document.documentElement;
    root.style.setProperty('--primary', primaryColor);
    root.style.setProperty('--primary-rgb', '243, 107, 33');

    const updateHeadElements = () => {
        let themeMeta = document.querySelector('meta[name="theme-color"]');
        if (!themeMeta) {
            themeMeta = document.createElement('meta');
            themeMeta.name = 'theme-color';
            document.head.appendChild(themeMeta);
        }
        themeMeta.setAttribute('content', primaryColor);

        let favicon = document.querySelector('link[rel="icon"]');
        if (!favicon) {
            favicon = document.createElement('link');
            favicon.rel = 'icon';
            document.head.appendChild(favicon);
        }
        favicon.href = 'icon-erp.webp';

        let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
        if (!appleIcon) {
            appleIcon = document.createElement('link');
            appleIcon.rel = 'apple-touch-icon';
            document.head.appendChild(appleIcon);
        }
        appleIcon.href = 'icon-erp.webp';

        let manifest = document.querySelector('link[rel="manifest"]');
        if (manifest) {
            manifest.setAttribute('href', 'manifest.json');
        } else {
            const newManifest = document.createElement('link');
            newManifest.rel = 'manifest';
            newManifest.href = 'manifest.json';
            document.head.appendChild(newManifest);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateHeadElements);
    } else {
        updateHeadElements();
    }

    window.getBrandDetails = () => {
        return {
            type: 'erp',
            primary: primaryColor,
            name: 'Roshani ERP',
            tagline: 'Enterprise Management System'
        };
    };

    console.log('[Branding Engine] Unified theme applied');
})();

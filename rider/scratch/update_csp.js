const fs = require('fs');
const configPath = 'c:/Prasant-Pizza-ERP/firebase.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Update CSP for both admin and rider targets
config.hosting.forEach(target => {
    target.headers.forEach(headerBlock => {
        headerBlock.headers.forEach(header => {
            if (header.key === 'Content-Security-Policy') {
                // Add cdnjs.cloudflare.com to script-src, style-src, img-src, font-src, and connect-src
                let csp = header.value;
                
                const sourcesToAdd = ['https://cdnjs.cloudflare.com', 'https://unpkg.com'];
                
                const directives = ['script-src', 'style-src', 'img-src', 'font-src', 'connect-src'];
                
                directives.forEach(dir => {
                    sourcesToAdd.forEach(source => {
                        if (csp.includes(dir) && !csp.includes(source)) {
                            // Find the directive and insert before the next semicolon
                            const regex = new RegExp(`(${dir}[^;]*)`);
                            csp = csp.replace(regex, `$1 ${source}`);
                        }
                    });
                });
                
                header.value = csp;
            }
        });
    });
});

fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
console.log('Updated firebase.json CSP successfully.');

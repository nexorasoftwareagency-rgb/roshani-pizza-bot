const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, '..', 'Admin');

const icons = [
  'icon-cake.png',
  'icon-pizza.png',
  'icon-512.png'
];

async function convertAll() {
  for (const icon of icons) {
    const inputPath = path.join(adminDir, icon);
    const webpPath = path.join(adminDir, icon.replace('.png', '.webp'));
    const pngPath = path.join(adminDir, icon.replace('.png', '-optimized.png'));

    if (!fs.existsSync(inputPath)) {
      console.log(`Skipping ${icon}: not found`);
      continue;
    }

    console.log(`Converting ${icon}...`);

    // Convert to WebP (high quality, 512x512)
    await sharp(inputPath)
      .resize(512, 512, { fit: 'inside' })
      .webp({ quality: 85 })
      .toFile(webpPath);

    // Also create optimized PNG (for fallback)
    await sharp(inputPath)
      .resize(512, 512, { fit: 'inside' })
      .png({ quality: 85, compressionLevel: 9 })
      .toFile(pngPath);

    const originalSize = fs.statSync(inputPath).size;
    const webpSize = fs.statSync(webpPath).size;
    const pngSize = fs.statSync(pngPath).size;

    console.log(`  Original: ${(originalSize / 1024).toFixed(1)} KB`);
    console.log(`  WebP:     ${(webpSize / 1024).toFixed(1)} KB`);
    console.log(`  PNG-opt:  ${(pngSize / 1024).toFixed(1)} KB`);
  }
  console.log('Done!');
}

convertAll().catch(console.error);

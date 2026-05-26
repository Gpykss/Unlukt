// compress_default.js
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcPath = 'C:\\Users\\ADMIN\\.gemini\\antigravity-ide\\brain\\62afc6d9-de97-4cea-8f24-00b5cadc4f85\\default_teaser_1779708391247.png';
const destDir = path.join(__dirname, 'public', 'ads', 'default');
const destPath = path.join(destDir, 'fallback-1.webp');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

sharp(srcPath)
  .resize({ width: 800 })
  .webp({ quality: 60 })
  .toFile(destPath)
  .then(info => {
    console.log('✅ Converted default fallback image successfully!');
    console.log('Size:', (info.size / 1024).toFixed(2), 'KB');
  })
  .catch(err => {
    console.error('❌ Conversion failed:', err);
  });

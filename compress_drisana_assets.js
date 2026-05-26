// compress_drisana_assets.js
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const drisanaDir = path.join(__dirname, 'public', 'ads', 'drisana');
const fallback1 = path.join(drisanaDir, 'fallback-1.webp');
const fallback2 = path.join(drisanaDir, 'fallback-2.webp');

async function compressFile(filePath, targetWidth, quality, maxPages) {
  if (!fs.existsSync(filePath)) {
    console.log(`File does not exist: ${filePath}`);
    return;
  }
  
  console.log(`Processing ${path.basename(filePath)} (${(fs.statSync(filePath).size / 1024).toFixed(2)} KB)...`);
  
  // Read file into memory buffer to prevent EBUSY locks on Windows
  const buffer = fs.readFileSync(filePath);
  
  // Create temporary filename in same directory
  const tempPath = filePath + '.tmp';
  
  try {
    await sharp(buffer, { animated: true, pages: maxPages })
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: quality, effort: 6 })
      .toFile(tempPath);
      
    // Overwrite the original file
    fs.copyFileSync(tempPath, filePath);
    fs.unlinkSync(tempPath);
    
    console.log(`✅ Optimized size of ${path.basename(filePath)}: ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB`);
  } catch (err) {
    console.error(`❌ Failed to compress ${path.basename(filePath)}:`, err);
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
  }
}

async function run() {
  // Let's compress fallback-1.webp with width 540 (for clean retina sharp quality on mobile), quality 55, max 20 pages
  await compressFile(fallback1, 540, 55, 20);
  
  // Let's compress fallback-2.webp with width 360 (for clear grid look), quality 45, max 15 pages
  await compressFile(fallback2, 360, 45, 15);
}

run().catch(console.error);

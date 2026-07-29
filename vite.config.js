// vite.config.js - OPTIMIZED FOR PRODUCTION
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import fs from 'fs'
import path from 'path'
import Busboy from 'busboy'
import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'

// Set path for ffmpeg static binary
ffmpeg.setFfmpegPath(ffmpegStatic);

// Automated Dev-Server Asset Processing Middleware
function adAssetPipelinePlugin() {
  return {
    name: 'ad-asset-pipeline',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Intercept ad asset uploads
        if (req.url === '/api/admin/upload-ad-assets' && req.method === 'POST') {
          try {
            const busboy = Busboy({ headers: req.headers });
            let username = '';
            const files = {};
            const filePromises = [];

            busboy.on('field', (name, val) => {
              if (name === 'username') {
                username = val.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase().trim();
              }
            });

            busboy.on('file', (name, fileStream, info) => {
              const chunks = [];
              const filePromise = new Promise((resolve) => {
                fileStream.on('data', (chunk) => chunks.push(chunk));
                fileStream.on('end', () => {
                  files[name] = {
                    buffer: Buffer.concat(chunks),
                    filename: info.filename,
                    mimeType: info.mimeType
                  };
                  resolve();
                });
              });
              filePromises.push(filePromise);
            });

            busboy.on('finish', async () => {
              // Wait for all file buffers to be fully read
              await Promise.all(filePromises);

              if (!username) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Username is required.' }));
              }
              if (!files.video1 || !files.video2 || !files.image1 || !files.image2 || !files.image3) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'All 5 raw assets (video1, video2, image1, image2, image3) are required.' }));
              }

              // Establish destination directories
              const targetDir = path.join(process.cwd(), 'public', 'ads', username);
              const tempDir = path.join(process.cwd(), 'public', 'ads', 'temp');

              if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
              }
              if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
              }

              // Disable sharp file caching to prevent EBUSY locks on Windows
              sharp.cache(false);

              // Write temp files to disk only for videos
              const writeTemp = (name, buffer) => {
                const tempPath = path.join(tempDir, `${Date.now()}_${name}`);
                fs.writeFileSync(tempPath, buffer);
                return tempPath;
              };

              const tempVideo1 = writeTemp('v1.mp4', files.video1.buffer);
              const tempVideo2 = writeTemp('v2.mp4', files.video2.buffer);

              try {
                // Video Clip 1 -> fallback-1.webp (<150KB, animated WebP, no audio)
                const outV1 = path.join(targetDir, 'fallback-1.webp');
                await processVideo(tempVideo1, outV1);

                // Video Clip 2 -> fallback-2.webp (<150KB, animated WebP, no audio)
                const outV2 = path.join(targetDir, 'fallback-2.webp');
                await processVideo(tempVideo2, outV2);

                // Image 1 -> image-1.webp (<50KB, WebP)
                const outI1 = path.join(targetDir, 'image-1.webp');
                await processImage(files.image1.buffer, outI1);

                // Image 2 -> image-2.webp (<50KB, WebP)
                const outI2 = path.join(targetDir, 'image-2.webp');
                await processImage(files.image2.buffer, outI2);

                // Image 3 -> image-3.webp (<50KB, WebP)
                const outI3 = path.join(targetDir, 'image-3.webp');
                await processImage(files.image3.buffer, outI3);

                // Delete temp files
                fs.unlinkSync(tempVideo1);
                fs.unlinkSync(tempVideo2);

                // Build file size metadata statistics
                const getStats = (filename, limitKb) => {
                  const p = path.join(targetDir, filename);
                  const size = fs.statSync(p).size;
                  return {
                    name: filename,
                    sizeBytes: size,
                    limitBytes: limitKb * 1024,
                    limitKb
                  };
                };

                const fileStats = [
                  getStats('fallback-1.webp', 150),
                  getStats('fallback-2.webp', 150),
                  getStats('image-1.webp', 50),
                  getStats('image-2.webp', 50),
                  getStats('image-3.webp', 50)
                ];

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, files: fileStats }));

              } catch (processingErr) {
                // Cleanup temp files if they exist
                [tempVideo1, tempVideo2].forEach(p => {
                  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch(_) {}
                });
                throw processingErr;
              }
            });

            req.pipe(busboy);

          } catch (err) {
            console.error('❌ Pipeline handling error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message || 'Internal server error in pipeline.' }));
          }
        } else {
          next();
        }
      });
    }
  };
}

// Transcode video to animated webp, strip audio, scale & compress
function processVideo(input, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .output(output)
      .outputOptions([
        '-vcodec libwebp',
        '-t 3', // Limit duration to 3 seconds to keep file sizes very small
        '-filter:v scale=480:-1,fps=fps=10', // Scale to 480px for high-quality sharpness on retina mobile displays
        '-lossless 0',
        '-compression_level 4',
        '-q:v 45', // High quality (45) to ensure crisp details without compression artifacts
        '-loop 0',
        '-an' // Strip audio completely
      ])
      .on('end', () => resolve())
      .on('error', (err) => {
        console.error('ffmpeg processVideo error:', err);
        reject(err);
      })
      .run();
  });
}

// Convert image to WebP, resize & compress
async function processImage(input, output) {
  await sharp(input)
    .resize({ width: 640, withoutEnlargement: true })
    .webp({ quality: 50 })
    .toFile(output);
}

export default defineConfig({
  plugins: [react(), adAssetPipelinePlugin()],
  
  server: {
    host: true,
    port: 5173,
  },
  
  build: {
    // ✅ Increase chunk size warning limit
    chunkSizeWarningLimit: 1600, // 1000 KB instead of default 500 KB
    
    // ✅ Split chunks for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks (third-party libraries)
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          'ui-vendor': ['framer-motion', 'lucide-react'],
        },
      },
    },
    
    // ✅ Optimize output
    minify: 'esbuild',
    sourcemap: false, // Disable source maps in production
  },
  
  // ✅ Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
})
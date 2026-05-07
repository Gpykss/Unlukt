// src/utils/videoCompression.js
// Client-side video compression using ffmpeg.wasm
// Loaded lazily so it doesn't block initial page load

let ffmpegInstance = null;
let ffmpegLoaded = false;
let loadPromise = null;

/**
 * Load and cache the ffmpeg instance (only loads WASM once)
 */
async function getFFmpeg() {
  if (ffmpegLoaded && ffmpegInstance) return ffmpegInstance;

  // Only one load at a time
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');

    const ffmpeg = new FFmpeg();

    // Load from CDN — avoids WASM bundle size in main chunk
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    ffmpegInstance = ffmpeg;
    ffmpegLoaded = true;
    loadPromise = null;
    return ffmpeg;
  })();

  return loadPromise;
}

/**
 * Compress a video file before upload.
 * Returns a compressed Blob, or the original file if compression fails / file is small.
 *
 * @param {File} file - The video file to compress
 * @param {Function} [onProgress] - Optional progress callback (0-100)
 * @returns {Promise<Blob>}
 */
export async function compressVideo(file, onProgress) {
  // Skip compression for files < 20MB — not worth the time cost
  const SKIP_THRESHOLD = 20 * 1024 * 1024;
  if (file.size < SKIP_THRESHOLD) {
    onProgress?.(100);
    return file;
  }

  try {
    onProgress?.(5);
    const ffmpeg = await getFFmpeg();
    onProgress?.(15);

    const { fetchFile } = await import('@ffmpeg/util');
    const inputName = 'input' + getExtension(file.name);
    const outputName = 'output.mp4';

    await ffmpeg.writeFile(inputName, await fetchFile(file));
    onProgress?.(25);

    ffmpeg.on('progress', ({ progress }) => {
      // ffmpeg progress 0-1 maps to our 25-90% range
      const pct = Math.round(25 + progress * 65);
      onProgress?.(Math.min(pct, 90));
    });

    await ffmpeg.exec([
      '-i', inputName,
      '-vcodec', 'libx264',
      '-crf', '28',       // 28 = good quality / smaller size
      '-preset', 'fast',
      '-movflags', '+faststart',
      '-y',               // overwrite output
      outputName,
    ]);

    onProgress?.(92);

    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data.buffer], { type: 'video/mp4' });

    // Clean up ffmpeg virtual FS
    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (_) { /* ignore cleanup errors */ }

    onProgress?.(100);

    // If compression made it bigger (rare), return original
    return blob.size < file.size ? blob : file;
  } catch (err) {
    console.warn('Video compression failed, uploading original:', err);
    onProgress?.(100);
    return file; // graceful fallback — never block the upload
  }
}

function getExtension(filename) {
  const parts = filename.split('.');
  return parts.length > 1 ? '.' + parts[parts.length - 1] : '.mp4';
}

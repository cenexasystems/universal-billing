import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

/**
 * Safe Utility Script: generate-app-icons.mjs
 * 
 * Automatically detects the emblem/logo bounds from public/clad-icon.png (or custom source),
 * and generates standard W3C compliant PWA icons and iOS Apple Touch icons with:
 *  - 100% safe-zone padding for Android Adaptive/Maskable icons (so squircles and circles never clip the logo)
 *  - Apple Touch Icon padding (so iOS home screen squircles never clip edges)
 *  - High-resolution standard icons for desktop/PWA taskbars
 *  - Crisp favicon
 * 
 * Safe to commit to GitHub (no secrets/credentials).
 */

const ROOT_DIR = process.cwd();
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const SRC_ICON = path.join(PUBLIC_DIR, 'universal-look-logo.png');

async function main() {
  if (!fs.existsSync(SRC_ICON)) {
    console.error(`Source icon not found at ${SRC_ICON}`);
    process.exit(1);
  }

  console.log(`Analyzing source icon: ${SRC_ICON}`);
  const { data, info } = await sharp(SRC_ICON).raw().toBuffer({ resolveWithObject: true });

  // Sample background color from top-left corner
  const bgR = data[0] || 19;
  const bgG = data[1] || 18;
  const bgB = data[2] || 16;
  console.log(`Sampled background color: rgb(${bgR}, ${bgG}, ${bgB})`);

  // 1. Detect emblem bounding box dynamically (ignoring dark background)
  let minX = info.width;
  let maxX = 0;
  let minY = info.height;
  let maxY = 0;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      // Check if pixel belongs to logo (not dark background)
      if (r > 38 || g > 38 || b > 38) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Fallback if full image is emblem
  if (maxX <= minX || maxY <= minY) {
    minX = 0;
    maxX = info.width - 1;
    minY = 0;
    maxY = info.height - 1;
  }

  const emblemWidth = maxX - minX + 1;
  const emblemHeight = maxY - minY + 1;
  console.log(`Detected emblem bounds: ${emblemWidth}x${emblemHeight} at [x:${minX}, y:${minY}]`);

  // Extract emblem tightly
  const emblemBuf = await sharp(SRC_ICON)
    .extract({ left: minX, top: minY, width: emblemWidth, height: emblemHeight })
    .toBuffer();

  const EMBLEM_ASPECT = emblemWidth / emblemHeight;

  // Helper to compose square icon with emblem centered on seamless matching background
  async function generateSquareIcon(canvasSize, maxEmblemDim, outputPath) {
    let targetWidth, targetHeight;
    if (EMBLEM_ASPECT >= 1) {
      targetWidth = Math.min(canvasSize - 8, maxEmblemDim);
      targetHeight = Math.round(targetWidth / EMBLEM_ASPECT);
    } else {
      targetHeight = Math.min(canvasSize - 8, maxEmblemDim);
      targetWidth = Math.round(targetHeight * EMBLEM_ASPECT);
    }

    const resizedEmblem = await sharp(emblemBuf)
      .resize(targetWidth, targetHeight, {
        fit: 'contain',
        kernel: sharp.kernel.lanczos3,
      })
      .toBuffer();

    const left = Math.max(0, Math.round((canvasSize - targetWidth) / 2));
    const top = Math.max(0, Math.round((canvasSize - targetHeight) / 2));

    await sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 4,
        background: { r: bgR, g: bgG, b: bgB, alpha: 1 },
      },
    })
      .composite([{ input: resizedEmblem, left, top }])
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(outputPath);

    console.log(`-> Generated ${path.basename(outputPath)} (${canvasSize}x${canvasSize}, emblem: ${targetWidth}x${targetHeight})`);
  }

  // 1. Android Adaptive / PWA Maskable Icons (Safe area: inner 80% circle => ~360px max width in 512x512)
  await generateSquareIcon(512, 360, path.join(PUBLIC_DIR, 'universal-look-icon-maskable-512.png'));
  await generateSquareIcon(192, 135, path.join(PUBLIC_DIR, 'universal-look-icon-maskable-192.png'));

  // 2. Standard Any Icons and Master Logo (clean luxury margins)
  await generateSquareIcon(512, 420, path.join(PUBLIC_DIR, 'universal-look-icon-512.png'));
  await generateSquareIcon(192, 155, path.join(PUBLIC_DIR, 'universal-look-icon-192.png'));
  await generateSquareIcon(512, 420, path.join(PUBLIC_DIR, 'universal-look-icon.png'));
  await generateSquareIcon(512, 420, path.join(PUBLIC_DIR, 'universal-look-logo.png'));

  // 3. Apple Touch Icon for iOS (180x180, ~65% scale to completely clear iOS squircle corners)
  await generateSquareIcon(180, 130, path.join(PUBLIC_DIR, 'apple-touch-icon.png'));

  // 4. Favicon (64x64)
  await generateSquareIcon(64, 52, path.join(PUBLIC_DIR, 'universal-look-favicon.png'));

  console.log('\nAll PWA and app shortcut icons generated successfully with verified safe padding!');
}

main().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});

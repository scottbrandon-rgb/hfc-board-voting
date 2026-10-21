// Draws the HF monogram app icons. The letters are drawn as rectangles, so
// the icons look the same on every machine (no font needed).
// Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const BRAND = '#1f4fbf';

/** "HF" letterforms on a 100-unit grid, centred at (50, 50), cap height 36. */
function letters(fill) {
  const t = 7.5; // stroke
  const top = 32;
  const h = 36;
  const mid = top + h / 2 - t / 2 + 0.5;
  // H: x 22..46 · F: x 54..76
  return [
    [22, top, t, h],
    [46 - t, top, t, h],
    [22, mid, 24, t],
    [54, top, t, h],
    [54, top, 23, t],
    [54, mid, 19, t],
  ]
    .map(([x, y, w, hh]) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${fill}"/>`)
    .join('');
}

/** shape: 'circle' (favicon), 'square' (full-bleed: home screens add their own mask). */
function svg({ shape, scale = 1 }) {
  const bg =
    shape === 'circle'
      ? `<circle cx="50" cy="50" r="50" fill="${BRAND}"/>`
      : `<rect width="100" height="100" fill="${BRAND}"/>`;
  const s = scale;
  const g = `<g transform="translate(${50 - 50 * s} ${50 - 50 * s}) scale(${s})">${letters('#fff')}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg}${g}</svg>`;
}

const favicon = svg({ shape: 'circle' });
writeFileSync('src/app/icon.svg', favicon + '\n');

async function png(markup, size, path) {
  await sharp(Buffer.from(markup), { density: 600 }).resize(size, size).png().toFile(path);
}

// Apple draws its own rounded corners; a full-bleed square is correct.
await png(svg({ shape: 'square', scale: 1.15 }), 180, 'src/app/apple-icon.png');
await png(svg({ shape: 'square', scale: 1.15 }), 192, 'public/icon-192.png');
await png(svg({ shape: 'square', scale: 1.15 }), 512, 'public/icon-512.png');
// Maskable: letters inside the central safe zone (80%).
await png(svg({ shape: 'square', scale: 0.95 }), 512, 'public/icon-maskable-512.png');
console.log('icons written');

// Renders the app icon SVGs to PNGs that @capacitor/assets can consume.
// Edit the SVG strings below to tweak the design, then re-run via:
//   npm run generate-icon
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const OUT = 'assets';
mkdirSync(OUT, { recursive: true });

// 1024x1024 — full icon (used for legacy launchers)
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#0d2a40"/>
      <stop offset="60%" stop-color="#071523"/>
      <stop offset="100%" stop-color="#04090f"/>
    </radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="14" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <mask id="crescent">
      <rect width="1024" height="1024" fill="black"/>
      <circle cx="512" cy="512" r="220" fill="white"/>
      <circle cx="600" cy="450" r="200" fill="black"/>
    </mask>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <g filter="url(#glow)">
    <rect width="1024" height="1024" fill="#7cf7c7" mask="url(#crescent)"/>
    <circle cx="720" cy="330" r="14" fill="#7cf7c7"/>
    <circle cx="300" cy="700" r="9" fill="#7cf7c7" opacity="0.75"/>
    <circle cx="780" cy="600" r="6" fill="#7cf7c7" opacity="0.55"/>
  </g>
</svg>`;

// Foreground only — transparent background, used for adaptive icons.
const foregroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="14" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <mask id="crescent">
      <rect width="1024" height="1024" fill="black"/>
      <circle cx="512" cy="512" r="220" fill="white"/>
      <circle cx="600" cy="450" r="200" fill="black"/>
    </mask>
  </defs>
  <g filter="url(#glow)">
    <rect width="1024" height="1024" fill="#7cf7c7" mask="url(#crescent)"/>
    <circle cx="720" cy="330" r="14" fill="#7cf7c7"/>
    <circle cx="300" cy="700" r="9" fill="#7cf7c7" opacity="0.75"/>
    <circle cx="780" cy="600" r="6" fill="#7cf7c7" opacity="0.55"/>
  </g>
</svg>`;

// Background only — full bleed, used as adaptive icon backdrop.
const backgroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#0d2a40"/>
      <stop offset="60%" stop-color="#071523"/>
      <stop offset="100%" stop-color="#04090f"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
</svg>`;

async function rasterize(svg, name, size = 1024) {
  const out = `${OUT}/${name}`;
  const buf = await sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(out, buf);
  console.log(`wrote ${out} (${buf.length.toLocaleString()} bytes)`);
}

await rasterize(iconSvg, 'icon-only.png');
await rasterize(foregroundSvg, 'icon-foreground.png');
await rasterize(backgroundSvg, 'icon-background.png');

// Splash 2732x2732 — uses the same dark gradient with a smaller centered crescent.
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#0d2a40"/>
      <stop offset="60%" stop-color="#071523"/>
      <stop offset="100%" stop-color="#04090f"/>
    </radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="22" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <mask id="crescent">
      <rect width="2732" height="2732" fill="black"/>
      <circle cx="1366" cy="1366" r="280" fill="white"/>
      <circle cx="1480" cy="1290" r="260" fill="black"/>
    </mask>
  </defs>
  <rect width="2732" height="2732" fill="url(#bg)"/>
  <g filter="url(#glow)">
    <rect width="2732" height="2732" fill="#7cf7c7" mask="url(#crescent)"/>
  </g>
</svg>`;

await rasterize(splashSvg, 'splash.png', 2732);
await rasterize(splashSvg, 'splash-dark.png', 2732);

console.log('icon assets ready in ./assets — now run: npx capacitor-assets generate --android');

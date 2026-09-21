// The home-screen icon, drawn rather than pasted in as a blob.
//
// iOS will not take an SVG for apple-touch-icon, so this has to be a real PNG.
// Committing the GENERATOR rather than just the base64 means the icon can be
// changed later by editing a line here instead of being replaced wholesale.
//
//   node tools/make-icon.mjs          # writes assets/icon-180.png and icon-512.png
// Playwright here is CommonJS, so it comes in through the default export.
import playwright from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = playwright;
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// A quarter section under crop: black soil, the section lines of the survey,
// and a strip of standing wheat. Same idea as the map screen, at 1/40th scale.
const SVG = (s) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#2f2a22"/>
  <rect x="48" y="48" width="416" height="416" rx="40" fill="#b8892f"/>
  <g fill="#8a6a25">
    <rect x="48" y="150" width="416" height="14"/>
    <rect x="48" y="348" width="416" height="14"/>
    <rect x="150" y="48" width="14" height="416"/>
    <rect x="348" y="48" width="14" height="416"/>
  </g>
  <rect x="164" y="164" width="184" height="184" fill="#3f5d33"/>
  <g stroke="#d8c46a" stroke-width="9" stroke-linecap="round">
    <path d="M186 330 L186 200"/><path d="M218 330 L218 186"/>
    <path d="M250 330 L250 178"/><path d="M282 330 L282 186"/>
    <path d="M314 330 L314 200"/>
  </g>
  <circle cx="256" cy="256" r="0" fill="none"/>
</svg>`;

async function main() {
  const browser = await chromium.launch();
  await mkdir(join(ROOT, 'assets'), { recursive: true });
  for (const size of [180, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:transparent}</style>${SVG(size)}`
    );
    const buf = await page.screenshot({ omitBackground: true });
    await writeFile(join(ROOT, 'assets', `icon-${size}.png`), buf);
    console.log(`assets/icon-${size}.png  ${(buf.length / 1024).toFixed(1)} KB`);
    await page.close();
  }
  await browser.close();
}
main();

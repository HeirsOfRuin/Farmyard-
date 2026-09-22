// Does the single-file build actually work when opened from disk?
//
// A bundler that emits a file is not a bundler that emits a WORKING file, and
// file:// has its own rules — this is the only way to find out that the thing
// people will actually double-click is broken.

const PW = process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.js';
const pw = await import(PW);
const chromium = pw.chromium || pw.default?.chromium;

import { resolve } from 'node:path';

const file = 'file://' + resolve(process.cwd(), 'dist/centennial-farm.html');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(file, { waitUntil: 'load' });
await page.waitForTimeout(250);

const started = await page.locator('[data-act="start"]').count();
console.log('setup screen renders from file://  ', started ? 'yes' : 'NO');

if (started) {
  await page.click('[data-act="start"]');
  await page.waitForSelector('svg.township', { timeout: 5000 });
  const quarters = await page.locator('g.qtr').count();
  console.log(`township drew                      ${quarters} quarters`);

  let worked = 0;
  for (let i = 0; i < 8; i++) {
    await page.click('[data-act="work"]');
    await page.waitForTimeout(80);
    for (let g = 0; g < 4; g++) {
      if (await page.locator('.scrim [data-act], .scrim [data-choice], .scrim [data-life]').count()) {
        await page.locator('.scrim [data-act], .scrim [data-choice], .scrim [data-life]').first().click().catch(() => {});
        await page.waitForTimeout(60);
      } else break;
    }
    if (await page.locator('[data-act="newgame"]').count()) break;
    worked++;
  }
  console.log(`worked                             ${worked} years`);
  await page.screenshot({ path: (process.env.SHOTS || '/tmp') + '/bundle.png' });
}

await browser.close();
if (errors.length) {
  console.log(`\n!! ${errors.length} error(s) in the bundled file:`);
  for (const e of [...new Set(errors)].slice(0, 6)) console.log('   ' + e);
  process.exit(1);
}
console.log('no console errors — the single file works standalone');

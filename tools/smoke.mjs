// Drive the real page in a real browser.
//
// The automated suite in test/ cannot see any of what this checks: whether the
// page throws on load, whether a click does nothing, whether the map actually
// draws, whether a year can be worked at all. Every one of those is invisible
// to an engine test and obvious within seconds of opening the thing.

// Playwright is installed globally in this environment, and NODE_PATH does not
// apply to ES modules, so resolve it by path with an override for other setups.
const PW = process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.js';
const pw = await import(PW);
// playwright is CommonJS, so its exports arrive under .default here.
const chromium = pw.chromium || pw.default?.chromium;
if (!chromium) throw new Error(`Could not load chromium from ${PW}`);
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = process.cwd();
const SHOTS = process.env.SHOTS || '/tmp/shots';
const PORT = 8731;

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const path = join(ROOT, rel === '/' ? 'index.html' : rel);
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

function report(step) {
  if (errors.length) {
    console.log(`\n!! ${errors.length} error(s) by "${step}":`);
    for (const e of [...new Set(errors)].slice(0, 8)) console.log('   ' + e);
    errors.length = 0;
    return false;
  }
  return true;
}

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${SHOTS}/1-setup.png` });
console.log('loaded setup screen        ', report('load') ? 'clean' : 'ERRORS');

// Start a game.
await page.click('[data-diff="settler"]');
await page.click('[data-bg="ontario"]');
await page.click('[data-act="start"]');
await page.waitForSelector('svg.township', { timeout: 5000 });
await page.screenshot({ path: `${SHOTS}/2-year1.png` });
console.log('started a game             ', report('start') ? 'clean' : 'ERRORS');

// Does the map actually have quarters in it?
const quarters = await page.locator('g.qtr').count();
const mine = await page.locator('g.qtr.mine').count();
console.log(`map drew ${quarters} quarters, ${mine} owned`);
if (quarters !== 32) console.log('!! expected 32 quarters');

// Work years. This is the "did progress actually happen" check, in the UI.
const YEARS = Number(process.env.YEARS || 12);
let worked = 0;
for (let i = 0; i < YEARS; i++) {
  const before = await page.locator('.brand .year').textContent();
  await page.click('[data-act="work"]');
  await page.waitForTimeout(90);
  // Dismiss whatever modal came up (year report, or a dated decision).
  for (let guard = 0; guard < 4; guard++) {
    if (await page.locator('[data-act="close"]').count()) {
      await page.locator('[data-act="close"]').first().click();
    } else if (await page.locator('[data-choice]').count()) {
      await page.locator('[data-choice]').first().click();
    } else if (await page.locator('[data-life]').count()) {
      // A marriage or coming-of-age decision — dynamic, so it can come up in
      // year one if the founder started unmarried. Same handling as a dated
      // decision: take the first option offered.
      await page.locator('[data-life]').first().click();
    } else if (await page.locator('[data-act="showend"]').count()) {
      await page.locator('[data-act="showend"]').first().click();
      break;
    } else break;
    await page.waitForTimeout(70);
  }
  if (await page.locator('[data-act="newgame"]').count()) {
    console.log(`run ended after ${worked} years (a legitimate outcome)`);
    break;
  }
  const after = await page.locator('.brand .year').textContent();
  if (after === before) { console.log(`!! year did not advance from ${before}`); break; }
  worked++;
}
console.log(`worked ${worked} years in the browser`, report('working years') ? 'clean' : 'ERRORS');
await page.screenshot({ path: `${SHOTS}/3-worked.png` });

// If anything is still over the page — an end screen, an undismissed report —
// clear it before testing the tabs. A modal silently eating every click is
// exactly the kind of thing that makes a suite time out rather than fail
// usefully, so say so out loud.
async function clearOverlays(label) {
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator('.scrim').count())) return true;
    const btn = page.locator('.scrim [data-act], .scrim [data-choice], .scrim [data-life]').first();
    if (!(await btn.count())) break;
    await btn.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(80);
  }
  const stuck = await page.locator('.scrim').count();
  if (stuck) console.log(`!! a modal is still covering the page at "${label}"`);
  return !stuck;
}

const ended = await page.locator('[data-act="newgame"]').count() > 0;
if (ended) {
  await page.screenshot({ path: `${SHOTS}/7-ending.png` });
  console.log('captured the end-of-run screen');
  // Start a fresh game so the tab checks have a live farm to render.
  await page.click('[data-act="newgame"]');
  await page.waitForTimeout(120);
  await page.click('[data-act="start"]');
  await page.waitForSelector('svg.township', { timeout: 5000 });
  for (let i = 0; i < 6; i++) {
    await page.click('[data-act="work"]');
    await page.waitForTimeout(80);
    await clearOverlays('rebuild');
  }
}
await clearOverlays('before tabs');

// Each tab must render something, and never silently nothing.
for (const t of ['market', 'books', 'family', 'plan']) {
  if (!(await page.locator(`[data-tab="${t}"]`).count())) continue;
  await page.click(`[data-tab="${t}"]`, { timeout: 4000 });
  await page.waitForTimeout(80);
  const text = (await page.locator('.panel').innerText()).trim();
  console.log(`tab "${t}"`.padEnd(26), text.length > 40 ? `${text.length} chars` : `!! nearly empty (${text.length})`);
  await page.screenshot({ path: `${SHOTS}/tab-${t}.png` });
}
report('tabs');

// Roads and distance view — the geography layer has to be legible, not just
// present, and the only way to know is to render it and look.
if (await page.locator('[data-map="roads"]').count()) {
  await page.click('[data-map="roads"]');
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${SHOTS}/8-roads.png` });
  const roadLines = await page.locator('svg.township line').count();
  console.log(`roads view drew                    ${roadLines} road segments`);
}

// Soil view, and a quarter click.
await page.click('[data-map="soil"]');
await page.waitForTimeout(80);
await page.screenshot({ path: `${SHOTS}/4-soil.png` });
await page.locator('g.qtr.mine').first().click();
await page.waitForTimeout(80);
await page.screenshot({ path: `${SHOTS}/5-selected.png` });
console.log('soil view + quarter select ', report('map modes') ? 'clean' : 'ERRORS');

// Phone width — the layout has to survive it.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(120);
const overflow = await page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
await page.screenshot({ path: `${SHOTS}/6-phone.png`, fullPage: false });
console.log(`phone width horizontal overflow: ${overflow}px`, overflow > 2 ? '!! should be 0' : 'ok');

await browser.close();
server.close();
console.log(`\nscreenshots in ${SHOTS}`);

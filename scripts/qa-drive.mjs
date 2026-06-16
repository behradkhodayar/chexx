// Drives the real Chexx UI in a headless browser: menu -> start -> play moves,
// capturing screenshots (incl. a morph moment) and console/page errors.
import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const URL = process.env.QA_URL || 'http://127.0.0.1:5188';
const OUT = 'artifacts/qa';

async function run(label, contextOpts) {
  const browser = await chromium.launch({ executablePath: chromium.executablePath() });
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, `${label}-01-menu.png`) });

  // Start a local match through the real menu button.
  await page.locator('.menu-overlay .btn-primary').click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(OUT, `${label}-02-start.png`) });

  // Drive moves; grab a morph frame and a mid-game frame.
  let morphShot = false;
  let lastState = null;
  for (let i = 0; i < 22; i++) {
    const res = await page.evaluate(() => window.__chexx?.auto());
    await page.waitForTimeout(620);
    lastState = await page.evaluate(() => window.__chexx?.state());
    if (res?.morph && !morphShot) {
      await page.waitForTimeout(360);
      await page.screenshot({ path: path.join(OUT, `${label}-03-morph.png`) });
      morphShot = true;
    }
    if (res?.gameOver) break;
    if (i === 9) await page.screenshot({ path: path.join(OUT, `${label}-04-midgame.png`) });
  }
  await page.screenshot({ path: path.join(OUT, `${label}-05-final.png`) });

  // Hero close-up for visual review.
  await page.evaluate(() => window.__chexx?.cam(9.2, 1.12, -0.5));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${label}-06-hero.png`) });

  // Selection highlights (fresh game) + game-over overlay — desktop only.
  if (label === 'desktop') {
    await page.evaluate(() => window.__chexx?.start({ mode: 'local' }));
    await page.waitForTimeout(700);
    await page.evaluate(() => window.__chexx?.select(11)); // d2 pawn
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${label}-07-select.png`) });
    await page.evaluate(() => window.__chexx?.over());
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `${label}-08-gameover.png`) });
  }

  const diagnostics = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ ?? null);
  await browser.close();
  return { label, consoleErrors, pageErrors, diagnostics, lastState, morphShot };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const desktop = await run('desktop', {
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
  });
  const mobile = await run('mobile', { ...devices['iPhone 13'], userAgent: undefined });
  const report = { url: URL, desktop, mobile };
  console.log(JSON.stringify(report, null, 2));
  const errs =
    desktop.consoleErrors.length +
    desktop.pageErrors.length +
    mobile.consoleErrors.length +
    mobile.pageErrors.length;
  if (errs > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

async function canvasNonblank(page: import('@playwright/test').Page): Promise<boolean> {
  const canvas = page.locator('#game-canvas');
  const box = await canvas.boundingBox();
  if (!box || box.width < 32 || box.height < 32) return false;
  const png = PNG.sync.read(await canvas.screenshot());
  let min = 255;
  let max = 0;
  let alpha = 0;
  const buckets = new Set<string>();
  const stride = Math.max(1, Math.floor((png.width * png.height) / 4096));
  for (let p = 0; p < png.width * png.height; p += stride) {
    const o = p * 4;
    const r = png.data[o];
    const g = png.data[o + 1];
    const b = png.data[o + 2];
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    if (png.data[o + 3] > 0) alpha += 1;
    buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
  }
  return alpha > 256 && (max - min > 8 || buckets.size > 3);
}

test('Chexx renders, plays, morphs and respects the cap', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.fps ?? 0) > 0);

  // The renderer is actually drawing (board is in the scene behind the menu).
  const menuDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!);
  expect(menuDiag.drawCalls, 'renderer issues draw calls').toBeGreaterThan(10);

  // Pixel-level non-blank check (desktop only — the emulated-mobile software GL
  // can abort on a WebGL canvas readback; diagnostics cover mobile).
  if (testInfo.project.name === 'desktop-chrome') {
    expect(await canvasNonblank(page)).toBe(true);
  }

  // Start a local match (this builds all 32 pieces) and drive a few moves.
  await page.evaluate(() => window.__chexx?.start({ mode: 'local', cap: 54 }));
  // Wait until the renderer's diagnostics reflect the full piece set.
  await page.waitForFunction(
    () => (window.__THREE_GAME_DIAGNOSTICS__?.triangles ?? 0) > 5000,
    undefined,
    { timeout: 10_000 },
  );
  const playDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__!);
  expect(playDiag.drawCalls, 'full scene draws many objects').toBeGreaterThan(50);

  // Drive moves via the logic-only stepper (decoupled from render timing so the
  // headless software GL can't stall the test). The animated path is covered by
  // the standalone qa-drive screenshots.
  let sawMorph = false;
  for (let i = 0; i < 30; i++) {
    const res = await page.evaluate(() => window.__chexx?.step());
    if (res?.morph) sawMorph = true;
    if (res?.gameOver) break;
  }
  await page.waitForTimeout(200);

  const state = await page.evaluate(() => window.__chexx?.state());
  expect(state, 'game state present').toBeTruthy();
  expect(state!.ply, 'moves were played').toBeGreaterThan(4);
  // The shared cap is never exceeded by either army.
  expect(state!.materialW).toBeLessThanOrEqual(54);
  expect(state!.materialB).toBeLessThanOrEqual(54);
  expect(sawMorph, 'at least one transmutation occurred').toBe(true);

  await testInfo.attach(`${testInfo.project.name}-chexx`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// Regression guard: a real pointer click on the board must select and move a
// piece. (A full-screen HUD overlay once captured all pointer events, and
// piece-mesh picking once mis-resolved occluded pieces — both broke tap-to-move.)
test('a real click selects and moves a piece', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.fps ?? 0) > 0);

  // Start via the real menu button (also verifies the menu is clickable).
  await page.locator('.menu-overlay .btn-primary').click();
  await page.waitForFunction(
    () => (window.__THREE_GAME_DIAGNOSTICS__?.triangles ?? 0) > 5000,
    undefined,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(400);

  const clickSquare = async (sq: number) => {
    const pt = await page.evaluate((s) => window.__chexx!.project(s), sq);
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    await page.mouse.up();
  };

  // e2 (index 12) pawn -> e4 (index 28). White moves first by default.
  await clickSquare(12);
  const sel = await page.evaluate(() => window.__chexx!.sel());
  expect(sel.selected, 'clicking the e2 pawn selects it (square 12)').toBe(12);
  expect(sel.moves, 'the pawn has legal moves highlighted').toBeGreaterThan(0);

  await clickSquare(28);
  await page.waitForFunction(() => (window.__chexx?.state()?.ply ?? 0) >= 1, undefined, {
    timeout: 5_000,
  });
  const state = await page.evaluate(() => window.__chexx!.state());
  expect(state!.ply, 'the move was applied').toBeGreaterThanOrEqual(1);

  expect(pageErrors).toEqual([]);
});

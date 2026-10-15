import { expect, test, type Page } from '@playwright/test';
import { BRIDE, Run } from '../src/shared/level';
import type { Replay } from '../src/shared/replay';

async function completeRun(page: Page, won = true): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: "I'm coming!" }).click();
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    window.__scene = game.scene.getScene('wedding');
  })()`);
  await page.waitForFunction(() => Number(document.querySelector<HTMLElement>('#game')?.dataset.x) > 300);
  if (won) {
    await page.evaluate(`window.__scene.player.body.reset(${BRIDE.x - 50}, 570)`);
  } else {
    await page.evaluate(`(() => {
      const scene = window.__scene;
      scene.run.hitHurdle(0); scene.run.hitHurdle(1); scene.run.hitHurdle(2);
      scene.end();
    })()`);
  }
  await expect(page.locator('#result')).toBeVisible({ timeout: 10_000 });
}

for (const width of [1280, 390]) {
  test(`rewatches the latest run and its public score without gameplay side effects at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let posts = 0;
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/scores') posts++;
    });
    await completeRun(page);
    const stats = await page.locator('#result-detail').textContent();
    const achievements = await page.evaluate(() => localStorage.getItem('wedding-rush-challenges'));
    const recorded = await page.evaluate<Replay>('window.__scene.recordedReplay()');
    expect(recorded.frames.length).toBeGreaterThan(2);
    expect(recorded.frames[0][0]).toBe(0);
    await page.getByRole('button', { name: 'Rewatch run', exact: true }).click();
    const replay = page.getByRole('dialog', { name: 'Rewatch your run' });
    await expect(replay).toBeVisible();
    await expect(page.locator('#replay-status')).toContainText('0:00');
    await expect(page.locator('#replay-play')).toHaveText('Play replay');
    await page.locator('#replay-play').click();
    await expect(page.locator('#replay-play')).toHaveText('Pause replay');
    await page.waitForTimeout(150);
    await page.locator('#replay-play').click();
    const seek = page.locator('#replay-seek');
    await seek.focus();
    await page.keyboard.press('End');
    await expect(page.locator('#replay-status')).toContainText('Made it to Becky!');
    await page.locator('#replay-restart').click();
    await expect(seek).toHaveValue('0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#result-rewatch')).toBeFocused();
    await expect(page.locator('#result-detail')).toHaveText(stats ?? '');
    expect(await page.evaluate(() => localStorage.getItem('wedding-rush-challenges'))).toBe(achievements);
    expect(posts).toBe(0);
    await page.locator('#player-name').fill(`Replay ${width}`);
    await expect(page.locator('.replay-notice').first()).toContainText('publishes its gameplay replay');
    await page.locator('#submit-score').click();
    await expect(page.locator('#top-list')).toBeVisible();
    await page.getByRole('button', { name: `Watch Replay ${width}'s run`, exact: true }).click();
    await expect(page.locator('#replay-play')).toBeEnabled();
    await expect(page.locator('#replay-title')).toContainText(`Replay ${width}'s run`);
    await page.locator('#replay-seek').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#replay-status')).toContainText('Made it to Becky!');
    await page.locator('#replay-close').click();
    expect(posts).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('wedding-rush-challenges'))).toBe(achievements);
  });
}

test('records losses and keeps them available when returning from the top list', async ({ page }) => {
  await completeRun(page, false);
  await page.locator('#result-rewatch').click();
  await page.locator('#replay-seek').focus();
  await page.keyboard.press('End');
  await expect(page.locator('#replay-status')).toContainText('Out of chances');
  await expect(page.locator('#replay-status')).toContainText('0/3 lives');
  await page.locator('#replay-close').click();
  await page.locator('#result-top-list').click();
  await page.locator('#top-list-back').click();
  await expect(page.locator('#result-rewatch')).toBeEnabled();
});

test('public replay failures are explicit and legacy scores have no watch button', async ({ page }) => {
  await page.route('**/api/scores*', route => route.fulfill({ json: { scores: [
    { id: 'aaaaaaaaaaaa', name: 'Old Guest', score: 10, squashed: 0, won: true, at: '2026-10-15T12:00:00Z' },
    { id: 'bbbbbbbbbbbb', name: 'New Guest', score: 5, squashed: 0, won: false, at: '2026-10-15T12:00:00Z', hasReplay: true },
  ] } }));
  await page.route('**/api/replays/*', route => route.fulfill({ status: 404, json: { error: 'Missing' } }));
  await page.goto('/top');
  await expect(page.getByRole('button', { name: "Watch Old Guest's run" })).toHaveCount(0);
  await page.getByRole('button', { name: "Watch New Guest's run" }).click();
  await expect(page.locator('#replay-status')).toHaveText('No replay is available for that score.');
  await expect(page.locator('#replay-play')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: "Watch New Guest's run" })).toBeFocused();
});

test('unsupported public replay versions cannot play', async ({ page }) => {
  await page.route('**/api/scores*', route => route.fulfill({ json: { scores: [
    { id: 'bbbbbbbbbbbb', name: 'Guest', score: 0, squashed: 0, won: true, at: '2026-10-15T12:00:00Z', hasReplay: true },
  ] } }));
  await page.route('**/api/replays/*', route => route.fulfill({ json: { replay: { version: 2, dice: new Run().sweetValues, frames: [] } } }));
  await page.goto('/top');
  await page.getByRole('button', { name: "Watch Guest's run" }).click();
  await expect(page.locator('#replay-status')).toContainText('unsupported game version');
  await expect(page.locator('#replay-play')).toBeDisabled();
});

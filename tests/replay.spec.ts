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
  test(`five friend clicks reveal the perfect run without replacing your replay at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let posts = 0;
    let demoRequests = 0;
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/scores') posts++;
      if (request.resourceType() === 'fetch' && request.url().includes('perfect-run.json')) demoRequests++;
    });
    await completeRun(page);
    const stats = await page.locator('#result-detail').textContent();
    const storage = await page.evaluate(() => JSON.stringify(localStorage));
    await page.locator('#result-menu').click();
    await page.locator('#how-to-play').click();
    const friend = page.getByRole('button', { name: 'Still not sure? Ask a friend.', exact: true });
    await expect(page.locator('#play-instructions p').last()).toHaveText('Still not sure? Ask a friend.');
    for (let i = 0; i < 4; i++) await friend.click();
    await expect(page.locator('#replay-dialog')).not.toBeVisible();
    expect(demoRequests).toBe(0);
    await friend.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'A perfect run · 707 points' })).toBeVisible();
    await expect(page.locator('#replay-play')).toHaveText('Play replay');
    await page.locator('#replay-play').click();
    await expect(page.locator('#replay-play')).toHaveText('Pause replay');
    await page.locator('#replay-seek').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#replay-status')).toContainText('707 points · 3/3 lives · ×3 combo · Made it to Becky!');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(friend).toBeFocused();
    await expect(page.locator('#play-instructions')).toBeVisible();
    for (let i = 0; i < 5; i++) await page.keyboard.press('Enter');
    await expect(page.locator('#replay-dialog')).toBeVisible();
    await page.locator('#replay-close').click();
    await page.locator('#menu-results').click();
    await expect(page.locator('#result-detail')).toHaveText(stats ?? '');
    await page.locator('#result-rewatch').click();
    await expect(page.locator('#replay-title')).toHaveText('Rewatch your run');
    await page.locator('#replay-seek').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#replay-status')).not.toContainText('707 points');
    expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(storage);
    expect(posts).toBe(0);
  });

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
    const watch = page.getByRole('button', { name: `Watch replay of Replay ${width}'s run`, exact: true });
    await expect(watch).toHaveText('Watch');
    await expect(watch.locator('..')).toHaveJSProperty('cellIndex', 4);
    await expect(watch.locator('../..').locator('td').nth(1)).toHaveText(`Replay ${width}`);
    await expect(page.locator('#top-list').getByRole('columnheader', { name: 'Replay', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await watch.click();
    await expect(page.locator('#replay-play')).toBeEnabled();
    await expect(page.locator('#replay-title')).toContainText(`Replay ${width}'s run`);
    await page.locator('#replay-seek').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#replay-status')).toContainText('Made it to Becky!');
    await page.locator('#replay-close').click();
    await page.locator('#full-results-open').click();
    const fullWatch = page.locator('#full-results').getByRole('button', { name: `Watch replay of Replay ${width}'s run`, exact: true });
    await expect(fullWatch).toHaveText('Watch');
    await expect(fullWatch.locator('..')).toHaveJSProperty('cellIndex', 4);
    await expect(page.locator('#full-results').getByRole('columnheader', { name: 'Replay', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(posts).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('wedding-rush-challenges'))).toBe(achievements);
  });

}

test('perfect replay failure is explicit and can be retried', async ({ page }) => {
  await page.route('**/perfect-run.json*', route => route.request().resourceType() === 'fetch'
    ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue());
  await page.goto('/');
  await page.locator('#how-to-play').click();
  for (let i = 0; i < 5; i++) await page.locator('#perfect-replay').click();
  await expect(page.locator('#error-message')).toContainText('The perfect run could not be loaded');
  await page.locator('#error-dialog button').click();
  await page.unroute('**/perfect-run.json*');
  for (let i = 0; i < 5; i++) await page.locator('#perfect-replay').click();
  await expect(page.locator('#replay-play')).toBeEnabled();
});

test('watching the perfect run from pause keeps the current game paused and unchanged', async ({ page }) => {
  await page.goto('/');
  await page.locator('#play').click();
  await page.waitForFunction(() => Number(document.querySelector<HTMLElement>('#game')?.dataset.x) > 300);
  await page.keyboard.press('Escape');
  await page.locator('#how-to-play').click();
  const before = await page.locator('#game').evaluate(element => ({ ...((element as HTMLElement).dataset) }));
  for (let i = 0; i < 5; i++) await page.locator('#perfect-replay').click();
  await expect(page.locator('#replay-play')).toBeEnabled();
  await page.locator('#replay-seek').focus();
  await page.keyboard.press('End');
  await page.locator('#replay-close').click();
  const after = await page.locator('#game').evaluate(element => ({ ...((element as HTMLElement).dataset) }));
  expect(after).toEqual(before);
  await page.locator('#play').click();
  await page.waitForFunction(x => Number(document.querySelector<HTMLElement>('#game')?.dataset.x) > Number(x), before.x);
});

test('live leaderboard puts Watch links in the Replay column', async ({ page }) => {
    await page.route('**/api/scores*', route => route.fulfill({ json: { scores: [
      { id: 'bbbbbbbbbbbb', name: 'Guest', score: 5, squashed: 0, won: true, at: '2026-10-15T12:00:00Z', hasReplay: true },
    ] } }));
    await page.goto('/live');
    await expect(page.getByRole('columnheader', { name: 'Replay', exact: true })).toBeVisible();
    const watch = page.getByRole('link', { name: "Watch replay of Guest's run", exact: true });
    await expect(watch).toHaveText('Watch');
    await expect(watch).toHaveAttribute('href', '/top?you=bbbbbbbbbbbb');
    await expect(watch.locator('..')).toHaveJSProperty('cellIndex', 4);
    await expect(page.locator('#live-rows tr td').nth(1)).toHaveText('Guest');
  });
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
  await expect(page.getByRole('button', { name: "Watch replay of Old Guest's run" })).toHaveCount(0);
  await expect(page.locator('#full-results-rows')).not.toContainText('💍');
  await page.getByRole('button', { name: "Watch replay of New Guest's run" }).click();
  await expect(page.locator('#replay-status')).toHaveText('No replay is available for that score.');
  await expect(page.locator('#replay-play')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: "Watch replay of New Guest's run" })).toBeFocused();
});

test('unsupported public replay versions cannot play', async ({ page }) => {
  await page.route('**/api/scores*', route => route.fulfill({ json: { scores: [
    { id: 'bbbbbbbbbbbb', name: 'Guest', score: 0, squashed: 0, won: true, at: '2026-10-15T12:00:00Z', hasReplay: true },
  ] } }));
  await page.route('**/api/replays/*', route => route.fulfill({ json: { replay: { version: 2, dice: new Run().sweetValues, frames: [] } } }));
  await page.goto('/top');
  await page.getByRole('button', { name: "Watch replay of Guest's run" }).click();
  await expect(page.locator('#replay-status')).toContainText('unsupported game version');
  await expect(page.locator('#replay-play')).toBeDisabled();
});

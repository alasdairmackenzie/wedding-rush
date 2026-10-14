import { expect, test, type Page } from '@playwright/test';
import type { AnalyticsEvent, AnalyticsReport } from '../src/shared/analytics';
import { BRIDE } from '../src/shared/level';

async function scene(page: Page): Promise<void> {
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    window.__scene = game.scene.getScene('wedding');
  })()`);
}
test('tracks starts, pauses, resumes, restarts, loss, replay, finish and a server-confirmed score', async ({ page, request }) => {
  const events: AnalyticsEvent[] = [];
  page.on('request', req => {
    if (req.url().endsWith('/api/analytics')) events.push(...req.postDataJSON().events);
  });
  await page.goto('/');
  await page.locator('#play').click();
  await scene(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeVisible();
  await page.locator('#play').click();
  await page.keyboard.press('Escape');
  await page.locator('#restart').click();
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'playing');
  await page.evaluate(`(() => {
    const s = window.__scene;
    s.run.lives = 1;
    s.invulnerableUntil = 0;
    s.bump('Test hit');
  })()`);
  await expect(page.locator('#result')).toBeVisible();
  await page.locator('#again').click();
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'playing');
  await page.evaluate(`(() => {
    const s = window.__scene;
    s.player.body.reset(${BRIDE.x - 40}, 570);
    s.player.setVelocityY(0);
  })()`);
  await expect(page.locator('#result-title')).toHaveText('Sean, you may kiss Becky.', { timeout: 10_000 });
  await page.locator('#player-name').fill('Analytics Guest');
  await page.locator('#submit-score').click();
  await expect(page.locator('#top-list')).toBeVisible();
  await expect.poll(() => events.filter(e => e.name === 'game_start').length).toBe(3);
  await expect.poll(() => events.some(e => e.name === 'game_won')).toBe(true);
  await expect.poll(() => events.some(e => e.name === 'score_attempt')).toBe(true);
  expect(events.filter(e => e.name === 'game_resume')).toHaveLength(1);
  expect(events.filter(e => e.name === 'game_restart')).toHaveLength(1);
  expect(events.filter(e => e.name === 'game_replay')).toHaveLength(1);
  expect(events.filter(e => e.name === 'game_lost')).toHaveLength(1);
  expect(events.some(e => e.name === 'screen_view' && e.target === 'pause')).toBe(true);
  expect(events.some(e => e.name === 'screen_view' && e.target === 'result_lost')).toBe(true);
  expect(events.some(e => e.name === 'screen_view' && e.target === 'result_won')).toBe(true);
  expect(new Set(events.map(e => e.visitor)).size).toBe(1);
  expect(JSON.stringify(events)).not.toContain('Analytics Guest');
  expect(events.some(e => e.name === 'score_saved')).toBe(false);
  const report = await (await request.get('/api/admin/analytics?days=7', { headers: { Authorization: 'Bearer test-admin-token' } })).json() as AnalyticsReport;
  expect(report.funnel).toMatchObject({ started: 3, won: 1, lost: 1, submitted: 1, wonSubmitted: 1, unfinished: 1 });
});

test('retains anonymous identity across visits, records share success and attributes incoming links', async ({ page }) => {
  const events: AnalyticsEvent[] = [];
  page.on('request', req => { if (req.url().endsWith('/api/analytics')) events.push(...req.postDataJSON().events); });
  await page.goto('/?from=share');
  await page.locator('#menu-share').click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => undefined } });
  });
  await page.locator('#share-modal-copy').click();
  await expect.poll(() => events.some(e => e.name === 'share_success' && e.target === 'copy')).toBe(true);
  expect(events.find(e => e.name === 'page_view')?.source).toBe('shared_link');
  const visitor = events[0].visitor;
  await page.goto('/live');
  await expect.poll(() => events.some(e => e.name === 'page_view' && e.page === 'live')).toBe(true);
  expect(events.find(e => e.page === 'live')?.visitor).toBe(visitor);
  expect(events.filter(e => e.name === 'page_view' && e.page === 'live')).toHaveLength(1);
  await page.goto('/top?you=aaaaaaaaaaaa');
  await expect.poll(() => events.some(e => e.source === 'shared_score')).toBe(true);
});

test('opt-out persists and privacy signals prevent analytics requests', async ({ page }) => {
  let requests = 0;
  page.on('request', req => { if (req.url().endsWith('/api/analytics')) requests++; });
  await page.goto('/?analytics=off');
  await page.reload();
  await page.locator('#play').click();
  await page.waitForTimeout(2300);
  expect(requests).toBe(0);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: '1' });
  });
  await page.goto('/?analytics=on');
  await page.waitForTimeout(2300);
  expect(requests).toBe(0);
  await expect(page.locator('#play')).toBeVisible();
});

test('admin renders analytics with filters and explicitly reports collection failures', async ({ page, request }) => {
  await request.post('/api/analytics', { data: { events: [{
    id: crypto.randomUUID(), visitor: crypto.randomUUID(), session: crypto.randomUUID(),
    name: 'screen_view', target: 'result_won', page: 'game', device: 'desktop', source: 'direct',
  }] } });
  await page.goto('/admin');
  await page.getByLabel('Admin password').fill('test-admin-token');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#analytics-status')).toContainText('LOCAL MEMORY ONLY');
  await expect(page.locator('#analytics-metrics')).toContainText('Games played');
  await expect(page.locator('#analytics-screens')).toContainText('result won');
  await page.getByLabel('Period').selectOption('30');
  await expect(page.locator('#analytics-status')).toContainText('Updated');
  await page.route('**/api/admin/analytics?*', route => route.fulfill({ status: 503, json: { error: 'Analytics are unavailable.' } }));
  await page.getByRole('button', { name: 'Refresh analytics' }).click();
  await expect(page.locator('#analytics-status')).toHaveText('Analytics are unavailable.');
  await expect(page.locator('#analytics-metrics')).toBeEmpty();
});

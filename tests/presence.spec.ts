import { expect, test } from '@playwright/test';

test('only visible game pages send anonymous heartbeats, with the same browser ID across visits', async ({ page }) => {
  const visitors: string[] = [];
  await page.route('**/api/presence', route => {
    if (route.request().method() === 'POST') visitors.push(route.request().postDataJSON().visitor);
    return route.fulfill(route.request().method() === 'POST'
      ? { status: 202, json: { ok: true } }
      : { json: { activeUsers: 1, windowMinutes: 15 } });
  });
  await page.clock.install();
  await page.goto('/');
  await expect.poll(() => visitors.length).toBe(1);
  await page.clock.fastForward(60_000);
  await expect.poll(() => visitors.length).toBe(2);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(60_000);
  expect(visitors).toHaveLength(2);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => visitors.length).toBe(3);
  await page.goto('/');
  await expect.poll(() => visitors.length).toBe(4);
  expect(new Set(visitors).size).toBe(1);
  await page.goto('/live');
  await page.clock.fastForward(60_000);
  expect(visitors).toHaveLength(4);
});

for (const privacy of ['opt-out', 'do-not-track', 'global-privacy-control']) {
  test(`presence respects ${privacy}`, async ({ page }) => {
    let heartbeats = 0;
    page.on('request', request => {
      if (request.url().endsWith('/api/presence') && request.method() === 'POST') heartbeats++;
    });
    await page.addInitScript(mode => {
      if (mode === 'do-not-track') Object.defineProperty(navigator, 'doNotTrack', { value: '1' });
      if (mode === 'global-privacy-control') Object.defineProperty(navigator, 'globalPrivacyControl', { value: true });
    }, privacy);
    await page.clock.install();
    await page.goto(privacy === 'opt-out' ? '/?analytics=off' : '/');
    await expect(page.locator('#menu')).toBeVisible();
    await page.clock.fastForward(60_000);
    expect(heartbeats).toBe(0);
  });
}

test('live scores shows a public count, refreshes it, and isolates presence failures from scores', async ({ page }) => {
  let activeUsers = 42;
  let fail = false;
  await page.route('**/api/presence', route => route.fulfill(fail
    ? { status: 503, json: { error: 'Unavailable' } }
    : { json: { activeUsers, windowMinutes: 15 } }));
  await page.clock.install();
  await page.goto('/live');
  await expect(page.locator('#live-active-count')).toHaveText('42');
  await expect(page.getByText('Active in the last 15 minutes', { exact: true })).toBeVisible();
  expect(await page.locator('#live-active-count').evaluate(element => getComputedStyle(element).backgroundColor))
    .not.toBe(await page.locator('#live-url').evaluate(element => getComputedStyle(element).backgroundColor));
  activeUsers = 43;
  await page.clock.fastForward(15_000);
  await expect(page.locator('#live-active-count')).toHaveText('43');
  fail = true;
  await page.clock.fastForward(15_000);
  await expect(page.locator('#live-active-count')).toHaveText('—');
  await expect(page.locator('#live-active-status')).toContainText('unavailable');
  await expect(page.locator('#live-status')).toContainText('Updated');
  fail = false;
  activeUsers = 0;
  await page.clock.fastForward(15_000);
  await expect(page.locator('#live-active-count')).toHaveText('0');
  await expect(page.locator('#live-active-status')).not.toContainText('unavailable');
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('#live-active-count')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('#live-active-count')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

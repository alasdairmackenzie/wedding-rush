import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { MAX_SCORE } from '../src/shared/level';
import { FACE_LABELS } from '../src/shared/faces';

const TOKEN = 'test-admin-token';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC',
  'base64',
);

async function seed(request: APIRequestContext, name: string, score: number): Promise<string> {
  const response = await request.post('/api/scores', {
    data: { name, score, squashed: 3, won: true },
    headers: { 'X-Forwarded-For': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).entry.id;
}
async function signIn(page: Page): Promise<void> {
  await page.goto('/admin');
  await page.getByLabel('Admin password').fill(TOKEN);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#dashboard')).toBeVisible();
}

test('live screen shows scores, where to play and a return link', async ({ page, request }) => {
  const name = `Live ${Date.now() % 1000000}`;
  await seed(request, name, MAX_SCORE);
  await page.goto('/live?url=seanandbeckywedding.run');
  await expect(page.locator('#live-url')).toHaveText('seanandbeckywedding.run');
  await expect(page.locator('#live-rows tr').first()).toContainText(name);
  await expect(page.locator('#live-rows tr').first()).toContainText('💍');
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to game' })).toHaveAttribute('href', '/');

  await page.goto('/live');
  await expect(page.locator('#live-url')).toHaveText('127.0.0.1:5300');
  await page.getByRole('link', { name: 'Back to game' }).click();
  await expect(page.locator('#menu')).toBeVisible();
});

test('admin needs the password, then renames and deletes scores', async ({ page, request }) => {
  const stamp = String(Date.now() % 100000);
  await seed(request, `Rn ${stamp}`, 7);
  await seed(request, `Del ${stamp}`, 6);

  await page.goto('/admin');
  await page.getByLabel('Admin password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#login-status')).toContainText(/password/i);
  await expect(page.locator('#dashboard')).toBeHidden();

  await signIn(page);
  await page.getByLabel(`Name for Rn ${stamp}`).fill(`Auntie ${stamp}`);
  await page.getByRole('button', { name: `Rename Rn ${stamp}` }).click();
  await expect(page.locator('#scores-status')).toContainText(`Auntie ${stamp}`);
  await expect(page.getByLabel(`Name for Auntie ${stamp}`)).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: `Delete Del ${stamp}` }).click();
  await expect(page.locator('#scores-status')).toContainText(`Deleted Del ${stamp}`);
  await expect(page.getByRole('button', { name: `Delete Del ${stamp}` })).toHaveCount(0);

  const scores = (await (await request.get('/api/scores')).json()).scores as { name: string }[];
  expect(scores.map(entry => entry.name)).toContain(`Auntie ${stamp}`);
  expect(scores.map(entry => entry.name)).not.toContain(`Del ${stamp}`);

  await page.reload();
  await expect(page.locator('#dashboard')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByLabel('Admin password')).toBeVisible();
});

test('an uploaded face shows up in the game and can be removed', async ({ page, request }) => {
  await signIn(page);
  await page.getByLabel('Upload a face for Becky').setInputFiles({ name: 'becky.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('img', { name: 'Uploaded face for Becky' })).toBeVisible();
  expect(Object.keys((await (await request.get('/api/faces')).json()).faces)).toEqual(['bride']);

  await page.goto('/');
  await expect(page.getByRole('button', { name: "I'm coming!" })).toBeVisible();
  await expect.poll(() => page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    return game.textures.exists('bride-face');
  })()`)).toBe(true);

  await page.goto('/admin');
  await expect(page.locator('#dashboard')).toBeVisible();
  await page.getByRole('button', { name: 'Use the default face for Becky' }).click();
  await expect(page.getByRole('img', { name: 'Uploaded face for Becky' })).toHaveCount(0);
  expect((await (await request.get('/api/faces')).json()).faces).toEqual({});
});

test('admin previews bundled default photos and restores the hat photo after reset', async ({ page }) => {
  await signIn(page);
  for (const kind of ['bride', 'deal', 'pingpong', 'hat', 'karaoke', 'kebab', 'pub', 'football'] as const) {
    const preview = page.getByRole('img', { name: `Default face for ${FACE_LABELS[kind]}` });
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate(image =>
      image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
    )).toBe(true);
  }
  const defaultHat = page.getByRole('img', { name: `Default face for ${FACE_LABELS.hat}` });
  const defaultUrl = await defaultHat.getAttribute('src');
  if (!defaultUrl) throw new Error('Default hat preview has no image URL.');
  await page.getByLabel(`Upload a face for ${FACE_LABELS.hat}`).setInputFiles({
    name: 'hat.png', mimeType: 'image/png', buffer: PNG,
  });
  await expect(page.getByRole('img', { name: `Uploaded face for ${FACE_LABELS.hat}` })).toBeVisible();
  await expect(defaultHat).toHaveCount(0);
  await page.getByRole('button', { name: `Use the default face for ${FACE_LABELS.hat}` }).click();
  await expect(defaultHat).toBeVisible();
  await expect(defaultHat).toHaveAttribute('src', defaultUrl);
});

test('admin dashboard scrolls on mobile viewports', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await signIn(page);
  const scrollable = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    overflowY: getComputedStyle(document.body).overflowY,
    htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
  }));
  expect(scrollable.scrollHeight).toBeGreaterThan(scrollable.clientHeight);
  expect(scrollable.overflowY).not.toBe('hidden');
  expect(scrollable.htmlOverflowY).not.toBe('hidden');

  await page.evaluate(() => window.scrollTo(0, 300));
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(0);
});

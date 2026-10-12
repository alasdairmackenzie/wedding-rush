import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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

test('live screen shows the top list and where to play, with nothing to press', async ({ page, request }) => {
  const name = `Live ${Date.now().toString(36).slice(-6)}`;
  await seed(request, name, 9999);
  await page.goto('/live?url=seanandbeckywedding.run');
  await expect(page.locator('#live-url')).toHaveText('seanandbeckywedding.run');
  await expect(page.locator('#live-rows tr').first()).toContainText(name);
  await expect(page.locator('#live-rows tr').first()).toContainText('💍');
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('link')).toHaveCount(0);

  await page.goto('/live');
  await expect(page.locator('#live-url')).toHaveText('127.0.0.1:5300');
});

test('admin needs the password, then renames and deletes scores', async ({ page, request }) => {
  const stamp = Date.now().toString(36).slice(-5);
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

import { expect, test, type Page } from '@playwright/test';
import { BRIDE, BUCKET_HAT, concentrates, CONCENTRATE_DURATION, corks, GROOM, hurdles, movers, people, rings, RING_VALUE, RUN_OBJECTIVE, runnerSpeed, START, sweets } from '../src/shared/level';

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: "I'm coming!" }).click();
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'playing');
}
async function exposeScene(page: Page): Promise<void> {
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    window.__scene = game.scene.getScene('wedding');
  })()`);
}
async function teleport(page: Page, x: number, y = 570): Promise<void> {
  await page.evaluate(`(() => {
    const scene = window.__scene;
    scene.player.body.reset(${x}, ${y});
    scene.player.setVelocityY(0);
  })()`);
}
async function state(page: Page): Promise<{ x: number; y: number; grounded: boolean }> {
  return page.evaluate(() => {
    const game = document.getElementById('game');
    return { x: Number(game?.dataset.x), y: Number(game?.dataset.y), grounded: game?.dataset.grounded === 'true' };
  });
}

test('runs automatically, collects exact sweet values, pauses and resets', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('#timer')).toHaveCount(0);
  await page.getByRole('button', { name: "I'm coming!" }).click();
  await expect(page.locator('#notice')).toHaveText(RUN_OBJECTIVE);
  await page.waitForFunction(() => Number(document.getElementById('game')?.dataset.x) >= 280);
  await expect(page.locator('#score')).toHaveText('3 points');
  await expect(page.locator('#game')).toHaveAttribute('data-collected', '2');
  await page.keyboard.press('Escape');
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'paused');
  const paused = await state(page);
  await page.waitForTimeout(250);
  expect(await state(page)).toEqual(paused);
  await page.getByRole('button', { name: 'Back to Becky' }).click();
  await page.waitForFunction(x => Number(document.getElementById('game')?.dataset.x) > x + 30, paused.x);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start a fresh run' }).click();
  await expect(page.locator('#score')).toHaveText('0 points');
  await expect(page.locator('#lives')).toHaveText('3 / 3');
  await expect(page.locator('#cleared')).toHaveText(`0 / ${hurdles.length}`);
  expect(errors).toEqual([]);
});

test('uses the Sean and Becky title and character names throughout the UI', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('WeddingRush featuring Sean and Becky');
  await expect(page.getByRole('heading', { name: 'WeddingRush featuring Sean and Becky' })).toBeVisible();
  await expect(page.locator('.audio-controls > #music-toggle + #effects-toggle')).toHaveCount(1);
  await expect(page.locator('.audio-controls + #menu-share')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Share WeddingRush with friends', exact: true })).toHaveClass('link');
  await expect(page.locator('#objective')).toContainText('get Sean to Becky');
  await expect(page.locator('#notice')).toContainText('Becky is ready. Sean');
  await page.getByRole('button', { name: "I'm coming!" }).click();
  await expect(page.locator('#notice')).toHaveText(RUN_OBJECTIVE);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Back to Becky' })).toBeVisible();
});

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`reveals detailed instructions only through How to play at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const howToPlay = page.getByRole('button', { name: 'How to play', exact: true });
    const instructions = page.locator('#play-instructions');
    await expect(page.locator('#play + #how-to-play')).toBeVisible();
    await expect(instructions).toBeHidden();
    await expect(page.locator('#controls')).toBeHidden();
    await expect(howToPlay).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#controls')).not.toContainText('One press, one full jump');
    await howToPlay.click();
    await expect(howToPlay).toHaveAttribute('aria-expanded', 'true');
    await expect(instructions).toContainText("One press, one full jump; press again in the air to double jump. Jump hurdles and beer barrels, and duck the pigeons. Champagne gives a super jump for the wedding rings. Land on your mates to squash them for +5; running into them costs a chance. Clear things in a row for up to a ×3 combo. Three hits and you're out.");
    await expect(instructions).toBeVisible();
    await expect(page.locator('#controls')).toBeVisible();
    await expect(page.locator('#controls')).toHaveText('Space / W / ↑ jump · S / ↓ duck · Esc pause · on mobile, tap to jump and hold DUCK');
    await howToPlay.focus();
    await page.keyboard.press('Enter');
    await expect(instructions).toBeHidden();
    await expect(page.locator('#controls')).toBeHidden();
    await expect(howToPlay).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: "I'm coming!" }).click();
    await expect(page.locator('#game')).toHaveAttribute('data-phase', 'playing');
    await page.keyboard.press('Escape');
    await expect(page.locator('#game')).toHaveAttribute('data-phase', 'paused');
    await howToPlay.click();
    await expect(instructions).toBeVisible();
    await page.getByRole('button', { name: 'Back to Becky' }).click();
    await expect(page.locator('#game')).toHaveAttribute('data-phase', 'playing');
  });
}

test('high sweets can be collected with a timed hurdle jump and a squash-bounce', async ({ page }) => {
  await start(page);
  await page.waitForFunction(() => document.getElementById('game')?.dataset.grounded === 'true');
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    scene.player.body.reset(${hurdles[0].x - runnerSpeed(hurdles[0].x) * .4}, 570);
    scene.player.setVelocityY(0);
  })()`);
  await page.waitForFunction(() => document.getElementById('game')?.dataset.grounded === 'true');
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    return game.scene.getScene('wedding').run.collected.has(2);
  })()`)).toBe(true);
  await expect(page.locator('#lives')).toHaveText('3 / 3');
  await page.waitForFunction(() => document.getElementById('game')?.dataset.grounded === 'true');
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    scene.player.body.reset(${people[0].x - runnerSpeed(people[0].x) * .65}, 570);
    scene.player.setVelocityY(0);
  })()`);
  await page.waitForFunction(() => document.getElementById('game')?.dataset.grounded === 'true');
  await page.keyboard.press('Space');
  await expect(page.locator('#game')).toHaveAttribute('data-squashed', '1');
  await expect(page.locator('#game')).toHaveAttribute('data-bonus', '5');
  await expect.poll(() => page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    return game.scene.getScene('wedding').run.collected.has(4);
  })()`)).toBe(true);
  await expect(page.locator('#lives')).toHaveText('3 / 3');
  expect(sweets[4].y).toBe(420);
});

test('a quick press gives a full jump; holding cannot repeatedly jump; arrows do not steer', async ({ page }) => {
  await start(page);
  await page.waitForFunction(() => document.getElementById('game')?.dataset.grounded === 'true');
  const initial = await state(page);
  await page.keyboard.press('Space');
  await page.waitForTimeout(350);
  expect((await state(page)).y).toBeLessThan(initial.y - 115);
  await page.waitForFunction(() => document.getElementById('game')?.dataset.grounded === 'true');
  await page.keyboard.down('ArrowLeft');
  const before = (await state(page)).x;
  await page.waitForTimeout(100);
  expect((await state(page)).x).toBeGreaterThan(before + 20);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => Number(document.getElementById('game')?.dataset.y) < 500);
  await page.waitForFunction(() => document.getElementById('game')?.dataset.grounded === 'true');
  await page.waitForTimeout(150);
  expect((await state(page)).grounded).toBe(true);
  await page.keyboard.up('Space');
});

test('hits keep running on browsers without vibration support, like Safari', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, writable: true, value: undefined });
  });
  await start(page);
  await exposeScene(page);
  await teleport(page, hurdles[0].x - 60);
  await expect(page.locator('#lives')).toHaveText('2 / 3');
  await page.waitForTimeout(300);
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'playing');
  expect(errors).toEqual([]);
});

test('hurdle contact costs one chance per hurdle and the third hit ends the run', async ({ page }) => {
  await start(page);
  for (let id = 0; id < 3; id++) {
    await page.evaluate(`(async () => {
      const { game } = await import('/src/client/main.ts');
      const scene = game.scene.getScene('wedding');
      scene.player.body.reset(${hurdles[id].x - 60}, 570);
      scene.player.setVelocityY(0);
    })()`);
    await expect(page.locator('#game')).toHaveAttribute('data-distractions', String(id + 1));
    await expect(page.locator('#lives')).toHaveText(`${2 - id} / 3`);
    if (id < 2) {
      await page.waitForTimeout(250);
      await expect(page.locator('#game')).toHaveAttribute('data-distractions', String(id + 1));
    }
  }
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'late');
  await expect(page.locator('#result-kicker')).toHaveText('THE BIG DAY / OUT OF CHANCES');
  await expect(page.locator('#result-title')).toHaveText('Too many distractions!');
  await expect(page.locator('#result-summary')).toContainText('Three distractions');
  await expect(page.locator('#notice')).toContainText('No chances left');
  await page.getByRole('button', { name: 'One more big day' }).click();
  await expect(page.locator('#lives')).toHaveText('3 / 3');
  await expect(page.locator('#game')).toHaveAttribute('data-distractions', '0');
});

test('retains photo artwork and the distraction cast without platformer controls', async ({ page }) => {
  await start(page);
  const artwork = await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    return {
      key: scene.playerArt.texture.key, height: scene.playerArt.displayHeight,
      hitbox: [scene.player.body.width, scene.player.body.height],
      heads: ['bride-head', 'deal-head', 'pingpong-head', 'hat-head', 'karaoke-head', 'kebab-head', 'pub-head', 'football-head'].every(key => scene.textures.exists(key)),
      obstacles: scene.obstacles.length
    };
  })()`);
  expect(artwork).toEqual({ key: 'groom-photo', height: 135, hitbox: [34, 56], heads: true, obstacles: hurdles.length });
  const cutouts = await page.evaluate<{ transparent: number; opaque: number; cornerAlpha: number[] }[]>(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    return ['groom-photo', 'groom-photo-alt', 'bride-head', 'hat-head', 'karaoke-head', 'kebab-head', 'pub-head', 'football-head', 'bucket-hat'].map(key => {
      const image = scene.textures.get(key).getSourceImage();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let transparent = 0, opaque = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] === 0) transparent++;
        if (pixels[i] === 255) opaque++;
      }
      return {
        transparent: transparent / (image.width * image.height),
        opaque: opaque / (image.width * image.height),
        cornerAlpha: [pixels[3], pixels[image.width * 4 - 1]],
      };
    });
  })()`);
  for (const cutout of cutouts) {
    expect(cutout.transparent).toBeGreaterThan(.15);
    expect(cutout.opaque).toBeGreaterThan(.35);
    expect(cutout.cornerAlpha).toEqual([0, 0]);
  }
  const characters = await page.evaluate<string[]>(`(async () => {
    const { game } = await import('/src/client/main.ts');
    return game.scene.getScene('wedding').characters.map(character => character.art.texture.key);
  })()`);
  expect(characters).toEqual(['football', 'deal', 'pingpong', 'hat', 'pub', 'karaoke', 'kebab']);
  await page.keyboard.press('Escape');
  await expect(page.locator('.cast')).toHaveCount(0);
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#play-instructions')).toContainText('One press, one full jump');
  await expect(page.getByRole('button', { name: 'Move right', exact: true })).toHaveCount(0);
});

test('bucket-hat character uses the bundled cutout by default and accepts an uploaded face', async ({ page }) => {
  await page.route('**/api/faces', route => route.fulfill({ json: { faces: {} } }));
  await page.goto('/');
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'ready');
  const sizes = await page.evaluate<{ kind: string; width: number; height: number }[]>(`(async () => {
    const { game } = await import('/src/client/main.ts');
    return game.scene.getScene('wedding').characters.map(character => ({
      kind: character.art.texture.key, width: character.art.width, height: character.art.height,
    }));
  })()`);
  for (const size of sizes) {
    expect(size).toEqual({
      kind: size.kind, width: size.kind === 'hat' ? 148 : 96, height: size.kind === 'hat' ? 162 : 112,
    });
  }
  const headPixels = `(async () => {
    const { game } = await import('/src/client/main.ts');
    const image = game.textures.get('hat').getSourceImage();
    return Array.from(image.getContext('2d').getImageData(0, 2, 96, 40).data);
  })()`;
  const defaultHead = await page.evaluate<number[]>(headPixels);
  expect(defaultHead.slice(0, 96 * 20 * 4).filter((_, index) => index % 4 === 3).every(alpha => alpha === 0)).toBe(true);
  expect(defaultHead.filter((_, index) => index % 4 === 3).some(alpha => alpha > 0)).toBe(true);
  expect(await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    return game.textures.exists('hat-head') && !game.textures.exists('hat-face');
  })()`)).toBe(true);
  await page.route('**/api/faces', route => route.fulfill({ json: { faces: { hat: 1 } } }));
  await page.route('**/api/faces/hat?*', route => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64'),
  }));
  await page.reload();
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'ready');
  expect(await page.evaluate<number[]>(headPixels)).not.toEqual(defaultHead);
  expect(await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    return game.textures.exists('hat-face');
  })()`)).toBe(true);
});

test('Sean changes photo on jump, restores it on landing and does not cycle with time', async ({ page }) => {
  await start(page);
  await exposeScene(page);
  const photo = () => page.evaluate<string>('window.__scene.playerArt.texture.key');
  await page.waitForFunction(() => document.getElementById('game')?.dataset.grounded === 'true');
  expect(await photo()).toBe('groom-photo');
  await page.keyboard.press('Space');
  await expect.poll(photo).toBe('groom-photo-alt');
  await page.keyboard.press('Space');
  await expect.poll(photo).toBe('groom-photo-alt');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(await photo()).toBe('groom-photo-alt');
  await page.getByRole('button', { name: 'Back to Becky' }).click();
  await expect.poll(photo).toBe('groom-photo');
  await page.keyboard.press('Escape');
  for (const elapsed of [4999, 5000, 9999, 10000, 15000]) {
    const artwork = await page.evaluate(`(() => {
      const scene = window.__scene;
      scene.run.elapsed = ${elapsed};
      scene.update(0, 0);
      return {
        key: scene.playerArt.texture.key, height: scene.playerArt.displayHeight,
        hitbox: [scene.player.body.width, scene.player.body.height],
      };
    })()`);
    expect(artwork).toEqual({ key: 'groom-photo', height: 135, hitbox: [34, 56] });
  }
  await page.getByRole('button', { name: 'Back to Becky' }).click();
  await page.locator('#game').tap();
  await expect.poll(photo).toBe('groom-photo-alt');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start a fresh run' }).click();
  await expect.poll(photo).toBe('groom-photo');
});

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`orange squash protects against all obstacles, pauses and resets at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await start(page);
    await exposeScene(page);
    await teleport(page, concentrates[0].x);
    await expect(page.locator('#game')).toHaveAttribute('data-concentrates', '1');
    await expect(page.locator('#concentrate-power')).toBeVisible();
    await expect(page.locator('#concentrate-power')).toContainText('4× ORANGE SQUASH');
    if (viewport.width === 390) {
      const badge = await page.locator('#concentrate-power').boundingBox();
      const controls = await page.locator('.touch-controls').boundingBox();
      if (!badge || !controls) throw new Error('Missing mobile concentrate badge or touch controls.');
      expect(badge.y + badge.height).toBeLessThanOrEqual(controls.y);
    }
    expect(await page.evaluate(`window.__scene.concentrateGlow.visible`)).toBe(true);
    await page.keyboard.press('Escape');
    const remaining = await page.locator('#game').getAttribute('data-concentrate-remaining');
    if (remaining === null) throw new Error('Missing concentrate countdown.');
    await page.waitForTimeout(250);
    await expect(page.locator('#game')).toHaveAttribute('data-concentrate-remaining', remaining);
    await page.getByRole('button', { name: 'Back to Becky' }).click();
    await teleport(page, hurdles[3].x);
    await expect.poll(() => page.evaluate<boolean>('window.__scene.run.cleared.has(3)')).toBe(true);
    await teleport(page, people[3].x);
    await expect.poll(() => page.evaluate<boolean>('window.__scene.run.passedPeople.has(3)')).toBe(true);
    for (const id of [0, 1]) {
      await page.evaluate(`(() => {
        const scene = window.__scene;
        scene.run.dodged.delete(${id});
        scene.player.body.reset(scene.moving[${id}].x, 570);
        scene.player.setVelocityY(0);
      })()`);
      await expect.poll(() => page.evaluate<boolean>(`window.__scene.run.dodged.has(${id})`)).toBe(true);
    }
    await expect(page.locator('#lives')).toHaveText('3 / 3');
    await expect(page.locator('#game')).toHaveAttribute('data-distractions', '0');
    await expect(page.locator('#game')).toHaveAttribute('data-bonus', '0');
    await teleport(page, 600);
    await page.evaluate(`window.__scene.run.tick(${CONCENTRATE_DURATION})`);
    await expect(page.locator('#concentrate-power')).toBeHidden();
    expect(await page.evaluate(`window.__scene.concentrateGlow.visible`)).toBe(false);
    await teleport(page, hurdles[4].x);
    await expect(page.locator('#lives')).toHaveText('2 / 3');
    await teleport(page, concentrates[1].x);
    await expect(page.locator('#game')).toHaveAttribute('data-concentrates', '2');
    await expect(page.locator('#concentrate-power')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Start a fresh run' }).click();
    await expect(page.locator('#game')).toHaveAttribute('data-concentrates', '0');
    await expect(page.locator('#concentrate-power')).toBeHidden();
    expect(await page.evaluate(`window.__scene.concentrateArt.every(art => art.visible)`)).toBe(true);
    await expect(page.locator('#lives')).toHaveText('3 / 3');
  });
}

for (const width of [1280, 390]) {
  test(`final bucket hat is a normal-jump +50 pickup and restores on replay at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await start(page);
    await exposeScene(page);
    await teleport(page, BUCKET_HAT.x - 155);
    expect(await page.evaluate<number[]>('[window.__scene.bucketHatArt.displayWidth, window.__scene.bucketHatArt.displayHeight]'))
      .toEqual([72, 80]);
    await expect(page.locator('#game')).toHaveAttribute('data-grounded', 'true');
    const before = await page.evaluate<number>('window.__scene.run.score');
    await page.keyboard.press('Space');
    await expect(page.locator('#game')).toHaveAttribute('data-hat-collected', 'true');
    expect(await page.evaluate<boolean>('window.__scene.wornHat.visible')).toBe(true);
    expect(await page.evaluate<number>('window.__scene.run.score')).toBe(before + 50);
    expect(await page.evaluate<boolean>('window.__scene.bucketHatArt.visible || window.__scene.bucketHatLabel.visible')).toBe(false);
    await teleport(page, BUCKET_HAT.x, BUCKET_HAT.y - 12);
    await page.waitForTimeout(100);
    expect(await page.evaluate<number>('window.__scene.run.hatScore')).toBe(50);
    await teleport(page, BRIDE.x - 50);
    await expect(page.locator('#result-detail')).toContainText('Bucket hat found! +50 points');
    expect(await page.evaluate<boolean>('window.__scene.wornHat.visible')).toBe(true);
    await page.getByRole('button', { name: 'One more big day' }).click();
    await expect(page.locator('#game')).toHaveAttribute('data-hat-collected', 'false');
    expect(await page.evaluate<boolean>('window.__scene.wornHat.visible')).toBe(false);
    expect(await page.evaluate<boolean>('window.__scene.bucketHatArt.visible && window.__scene.bucketHatLabel.visible')).toBe(true);
    await teleport(page, BUCKET_HAT.x - 100);
    await page.waitForTimeout(400);
    await expect(page.locator('#game')).toHaveAttribute('data-hat-collected', 'false');
    await teleport(page, BRIDE.x - 50);
    await expect(page.locator('#result-detail')).toContainText('Bucket hat not collected');
  });
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`worn bucket hat follows both Sean poses, ducking and pause with ${reducedMotion} motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await start(page);
    await exposeScene(page);
    await teleport(page, BUCKET_HAT.x, BUCKET_HAT.y - 12);
    await expect(page.locator('#game')).toHaveAttribute('data-hat-collected', 'true');
    await teleport(page, 900);
    await expect(page.locator('#game')).toHaveAttribute('data-grounded', 'true');
    const hatState = `(() => {
      const scene = window.__scene, photo = scene.playerArt, hat = scene.wornHat;
      return { key: photo.texture.key, visible: hat.visible,
        dx: (hat.x - photo.x) / photo.displayWidth,
        dy: (photo.y - hat.y) / photo.displayHeight,
        height: hat.displayHeight, alpha: hat.alpha, photoAlpha: photo.alpha,
        x: hat.x, y: hat.y };
    })()`;
    type HatState = { key: string; visible: boolean; dx: number; dy: number; height: number;
      alpha: number; photoAlpha: number; x: number; y: number };
    const grounded = await page.evaluate<HatState>(hatState);
    expect(grounded.visible).toBe(true);
    expect(grounded.dx).toBeCloseTo(-.025);
    expect(grounded.dy).toBeCloseTo(.945);
    expect(grounded.height).toBeCloseTo(32.4);
    await page.keyboard.press('Space');
    await expect.poll(() => page.evaluate<string>('window.__scene.playerArt.texture.key')).toBe('groom-photo-alt');
    const airborne = await page.evaluate<HatState>(hatState);
    expect(airborne.dx).toBeCloseTo(.036);
    expect(airborne.dy).toBeCloseTo(.945);
    expect(airborne.alpha).toBe(airborne.photoAlpha);
    await page.keyboard.press('Escape');
    const paused = await page.evaluate<HatState>(hatState);
    await page.waitForTimeout(150);
    expect(await page.evaluate<HatState>(hatState)).toEqual(paused);
    await page.getByRole('button', { name: 'Back to Becky' }).click();
    await teleport(page, 900);
    await expect(page.locator('#game')).toHaveAttribute('data-grounded', 'true');
    await page.keyboard.down('ArrowDown');
    await expect.poll(() => page.evaluate<number>('window.__scene.wornHat.displayHeight')).toBeCloseTo(32.4 * .55);
    expect((await page.evaluate<HatState>(hatState)).dy).toBeCloseTo(.945);
    await page.keyboard.up('ArrowDown');
  });
}

for (const width of [1280, 390]) {
  test(`close shaves reward tight barrel jumps and pigeon ducks once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await start(page);
    await exposeScene(page);
    for (const id of [0, 1]) {
      if (id === 1) {
        await page.keyboard.down('ArrowDown');
        await expect(page.locator('#game')).toHaveAttribute('data-ducking', 'true');
      }
      await page.evaluate(`(() => {
        const scene = window.__scene;
        scene.player.body.setAllowGravity(false);
        scene.player.body.reset(scene.moving[${id}].x, ${id === 0 ? 518 : 570});
        scene.player.setVelocityY(0);
      })()`);
      await expect.poll(() => page.evaluate<boolean>(`window.__scene.moving[${id}].close`)).toBe(true);
      await page.evaluate(`window.__scene.player.body.reset(window.__scene.moving[${id}].x + 90, ${id === 0 ? 518 : 570})`);
      await expect(page.locator('#game')).toHaveAttribute('data-near-misses', String(id + 1));
      if (id === 1) await page.keyboard.up('ArrowDown');
    }
    expect(await page.evaluate<number>('window.__scene.run.nearMissScore')).toBe(10);
    await expect(page.locator('#lives')).toHaveText('3 / 3');
    await teleport(page, BRIDE.x - 50);
    await expect(page.locator('#result-detail')).toContainText('2 close shaves +10 points');
    await page.getByRole('button', { name: 'One more big day' }).click();
    await expect(page.locator('#game')).toHaveAttribute('data-near-misses', '0');
    expect(await page.evaluate<boolean>('window.__scene.moving.every(m => !m.close && !m.poweredPass)')).toBe(true);
  });

  test(`challenge badges persist and winning results show compact lives at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await start(page);
    await exposeScene(page);
    await teleport(page, BUCKET_HAT.x, BUCKET_HAT.y - 12);
    await expect(page.locator('#game')).toHaveAttribute('data-hat-collected', 'true');
    await teleport(page, BRIDE.x - 50);
    const badges = page.locator('#result-challenges');
    const challengesDialog = page.locator('#challenges-dialog');
    await expect(page.getByRole('button', { name: 'Challenges' })).toBeVisible();
    await expect(challengesDialog).toBeHidden();
    await expect(page.locator('#result-summary')).toBeHidden();
    await expect(page.locator('#result-detail')).toContainText('3/3 lives left');
    if (width === 390) {
      await expect(page.locator('#player-name')).toBeInViewport();
      await expect(page.locator('#submit-score')).toBeInViewport();
    }
    await page.getByRole('button', { name: 'Challenges' }).click();
    await expect(page.locator('#result')).toBeHidden();
    await expect(challengesDialog).toBeVisible();
    await expect(badges.locator('li')).toHaveCount(4);
    await expect(badges.locator('[data-new]')).toHaveCount(2);
    await expect(badges.locator('[data-challenge="hat"]')).toContainText('NEW BADGE!');
    await expect(badges.locator('[data-challenge="mates"]')).toContainText('Not earned yet');
    const badgeBox = await badges.boundingBox();
    if (!badgeBox) throw new Error('Missing challenge badges.');
    expect(badgeBox.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(challengesDialog).toBeHidden();
    await expect(page.locator('#result')).toBeVisible();
    await page.getByRole('button', { name: 'Challenges' }).click();
    await page.getByRole('button', { name: 'Back to results' }).click();
    await expect(challengesDialog).toBeHidden();
    await expect(page.locator('#result')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: "I'm coming!" }).click();
    await expect(page.locator('#game')).toHaveAttribute('data-phase', 'playing');
    await exposeScene(page);
    await teleport(page, BRIDE.x - 50);
    await page.getByRole('button', { name: 'Challenges' }).click();
    await expect(badges.locator('[data-challenge="hat"]')).toContainText('Previously earned on this device');
    await expect(badges.locator('[data-challenge="flawless"]')).toContainText('Earned this run');
    await expect(badges.locator('[data-new]')).toHaveCount(0);
  });
}

test('challenge storage failure is visible without preventing results', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await start(page);
  await exposeScene(page);
  await teleport(page, BRIDE.x - 50);
  await page.getByRole('button', { name: 'Challenges' }).click();
  await expect(page.locator('#challenges-status')).toContainText('Badges could not be saved on this device');
  await expect(page.locator('#result-challenges [data-challenge="flawless"]')).toContainText('NEW BADGE!');
});

test('there is no countdown or time-up loss', async ({ page }) => {
  await start(page);
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    game.scene.getScene('wedding').run.elapsed = 10 * 60_000;
  })()`);
  await page.waitForTimeout(250);
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'playing');
  await expect(page.locator('#timer')).toHaveCount(0);
  await expect(page.locator('.hud')).not.toContainText('TIME');
  await expect(page.locator('#controls')).not.toContainText('seconds');
  await expect(page.locator('#controls')).not.toContainText('minutes');
});

test('the complete runner course is winnable with real timed jumps, ducks and barrel hops', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await exposeScene(page);
  type Encounter = { x: number; hurdleId?: number; mover?: number; kind?: 'barrel' | 'pigeon' };
  const encounters: Encounter[] = [...hurdles.map((hurdle, id) => ({ x: hurdle.x, hurdleId: id })),
    ...people.map(person => ({ x: person.x })),
    ...movers.map((mover, id) => ({ x: mover.x, mover: id, kind: mover.kind })),
    { x: BUCKET_HAT.x }].sort((a, b) => a.x - b.x);
  for (const encounter of encounters) {
    if (encounter.kind === 'pigeon') {
      await page.waitForFunction(id => {
        const scene = (window as any).__scene;
        return scene.moving[id].x - scene.player.x <= 220 && scene.player.body.blocked.down;
      }, encounter.mover as number);
      await page.keyboard.down('ArrowDown');
      await expect(page.locator('#game')).toHaveAttribute('data-dodged', String(encounter.mover! + 1));
      await page.keyboard.up('ArrowDown');
      continue;
    }
    if (encounter.kind === 'barrel') {
      await page.waitForFunction(({ id, speed }) => {
        const scene = (window as any).__scene;
        const closing = scene.player.body.velocity.x + speed;
        return scene.moving[id].x - scene.player.x <= closing * .36 && scene.player.body.blocked.down;
      }, { id: encounter.mover as number, speed: movers[encounter.mover as number].speed });
      await page.keyboard.press('Space');
      await expect(page.locator('#game')).toHaveAttribute('data-dodged', String(encounter.mover! + 1));
      continue;
    }
    await page.waitForFunction(({ x, speed, maxSpeed, finish }) => {
      const game = document.getElementById('game');
      const position = Number(game?.dataset.x);
      const pace = speed + (maxSpeed - speed) * Math.min(1, (position - 110) / (finish - 110));
      return x - position <= pace * .39 && game?.dataset.grounded === 'true';
    }, { x: encounter.x, speed: GROOM.speed, maxSpeed: GROOM.maxSpeed, finish: BRIDE.x });
    await page.keyboard.press('Space');
    if (encounter.hurdleId !== undefined) {
      await expect(page.locator('#game')).toHaveAttribute('data-cleared', String(encounter.hurdleId + 1));
    } else {
      await page.waitForFunction(x => Number(document.getElementById('game')?.dataset.x) > x + 60, encounter.x);
    }
  }
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'won', { timeout: 5000 });
  await expect(page.locator('#result-title')).toHaveText('Sean, you may kiss Becky.');
  await expect(page.locator('#game')).toHaveAttribute('data-hat-collected', 'true');
  await expect(page.locator('#lives')).toHaveText('3 / 3');
  await expect(page.locator('#game')).toHaveAttribute('data-dodged', String(movers.length));
  await expect(page.locator('#result-detail')).toContainText(`${hurdles.length} / ${hurdles.length} hurdles cleared`);
  expect(Number(await page.locator('#game').getAttribute('data-speed'))).toBeGreaterThan(runnerSpeed(9000));
  expect(errors).toEqual([]);
});

test('mobile supports both the jump button and tapping the game', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await page.waitForFunction(() => document.getElementById('game')?.dataset.grounded === 'true');
  await expect(page.getByRole('button', { name: 'Jump', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Jump', exact: true }).tap();
  await page.waitForTimeout(250);
  expect((await state(page)).y).toBeLessThan(490);
  await page.waitForFunction(() => document.getElementById('game')?.dataset.grounded === 'true');
  await page.locator('#game').tap();
  await page.waitForTimeout(250);
  expect((await state(page)).y).toBeLessThan(490);
  const layout = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(layout.content).toBe(layout.width);
});

test('backgrounding pauses the runner and the clock', async ({ page }) => {
  await start(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'paused');
  const paused = await state(page);
  await page.waitForTimeout(200);
  expect(await state(page)).toEqual(paused);
});

test('mobile gameplay fills the viewport with no title or scrolling and can pause', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 390, height: 650 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('.masthead')).toBeHidden();
    await expect(page.locator('footer')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Pause game', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jump', exact: true })).toBeVisible();
    await expect.poll(async () => {
      const bounds = await page.locator('#game canvas').boundingBox();
      return bounds && { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }).toEqual({ x: 0, y: 0, ...viewport });
    const overflow = await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth > innerWidth,
      vertical: document.documentElement.scrollHeight > innerHeight,
    }));
    expect(overflow).toEqual({ horizontal: false, vertical: false });
  }
  await page.getByRole('button', { name: 'Pause game', exact: true }).tap();
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'paused');
  await page.getByRole('button', { name: 'Back to Becky' }).click();
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'playing');
});

test('desktop retains the original page layout', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await start(page);
  await expect(page.locator('.masthead')).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause game', exact: true })).toBeHidden();
});

test('plays the recorded intro, stops on pause and sound-effects off, and repeats only on replay', async ({ page }) => {
  await start(page);
  const voiceState = `(async () => {
    const { game } = await import('/src/client/main.ts');
    const audio = game.scene.getScene('wedding').ui.audio;
    return { playing: Boolean(audio.voice), cached: audio.clips.has('intro') };
  })()`;
  await expect.poll(() => page.evaluate(voiceState)).toEqual({ playing: true, cached: true });
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(voiceState)).toEqual({ playing: false, cached: true });
  await page.getByRole('button', { name: 'Back to Becky' }).click();
  expect(await page.evaluate(voiceState)).toEqual({ playing: false, cached: true });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start a fresh run' }).click();
  await expect.poll(() => page.evaluate(voiceState)).toEqual({ playing: true, cached: true });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sound effects: On', exact: true }).click();
  await page.getByRole('button', { name: 'Start a fresh run' }).click();
  await page.waitForTimeout(150);
  expect(await page.evaluate(voiceState)).toEqual({ playing: false, cached: true });
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`first hurdle comes quickly and the first character waits for the intro at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await start(page);
    const voice = `(async () => {
      const { game } = await import('/src/client/main.ts');
      const audio = game.scene.getScene('wedding').ui.audio;
      return { clip: audio.voiceClip, queued: audio.queuedClip ?? null, playing: Boolean(audio.voice) };
    })()`;
    await expect.poll(() => page.evaluate(voice)).toEqual({ clip: 'intro', queued: null, playing: true });
    const started = Date.now();
    await page.waitForFunction(x => Number(document.getElementById('game')?.dataset.x) >= x, hurdles[0].x - 40);
    expect(Date.now() - started).toBeLessThan(5_000);
    await page.keyboard.press('Escape');
    await page.evaluate(`(async () => {
      const { game } = await import('/src/client/main.ts');
      const audio = game.scene.getScene('wedding').ui.audio;
      audio.unlock();
      audio.speak('intro');
    })()`);
    await expect.poll(() => page.evaluate(voice)).toEqual({ clip: 'intro', queued: null, playing: true });
    await page.evaluate(`(async () => {
      const { game } = await import('/src/client/main.ts');
      game.scene.getScene('wedding').ui.audio.speak('football');
    })()`);
    expect(await page.evaluate(voice)).toEqual({ clip: 'intro', queued: 'football', playing: true });
    await expect.poll(() => page.evaluate(voice), { timeout: 8_000 })
      .toEqual({ clip: 'football', queued: null, playing: true });
  });
}

test('every bundled character recording decodes and plays its matching clip', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await start(page);
  await page.keyboard.press('Escape');
  for (const clip of ['football', 'deal', 'pingpong', 'hat', 'pub', 'karaoke', 'kebab']) {
    await page.evaluate(`(async () => {
      const { game } = await import('/src/client/main.ts');
      game.scene.getScene('wedding').ui.audio.speak('${clip}');
    })()`);
    await expect.poll(() => page.evaluate(`(async () => {
      const { game } = await import('/src/client/main.ts');
      const audio = game.scene.getScene('wedding').ui.audio;
      const buffer = await audio.clips.get('${clip}');
      return Boolean(buffer && buffer.duration > 0 && audio.voice?.buffer === buffer
        && buffer.getChannelData(0).some(sample => Math.abs(sample) > .001));
    })()`)).toBe(true);
  }
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    game.scene.getScene('wedding').ui.audio.destroy();
  })()`);
  expect(errors).toEqual([]);
});

test('cancels pending voice playback and reports an invalid audio file', async ({ page }) => {
  await page.route('**/sounds/hat.mp3', async route => {
    await new Promise(resolve => setTimeout(resolve, 200));
    await route.continue();
  });
  await start(page);
  await page.keyboard.press('Escape');
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const audio = game.scene.getScene('wedding').ui.audio;
    audio.speak('hat');
    audio.stopSpeech();
    await audio.clips.get('hat');
  })()`);
  const playing = await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    return Boolean(game.scene.getScene('wedding').ui.audio.voice);
  })()`);
  expect(playing).toBe(false);
  await page.route('**/sounds/football.mp3', route => route.fulfill({
    status: 200, contentType: 'audio/mpeg', body: 'invalid audio',
  }));
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    game.scene.getScene('wedding').ui.audio.speak('football');
  })()`);
  await expect(page.locator('#notice')).toContainText('Could not play football voice');
});

test('bride artwork is clear of the wedding sign, caption and victory banner', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await start(page);
    await page.evaluate(`(async () => {
      const { game } = await import('/src/client/main.ts');
      game.scene.getScene('wedding').player.body.reset(${BRIDE.x - 50}, 570);
    })()`);
    await expect(page.locator('#game')).toHaveAttribute('data-phase', 'won');
    const positions = await page.evaluate(`(async () => {
      const { game } = await import('/src/client/main.ts');
      const scene = game.scene.getScene('wedding');
      const bride = scene.children.getByName('bride').getBounds();
      return ['wedding-sign', 'bride-caption', 'married-banner'].map(name => {
        const bounds = scene.children.getByName(name).getBounds();
        return { name, overlaps: bride.left < bounds.right && bride.right > bounds.left
          && bride.top < bounds.bottom && bride.bottom > bounds.top };
      });
    })()`);
    expect(positions).toEqual([
      { name: 'wedding-sign', overlaps: false },
      { name: 'bride-caption', overlaps: false },
      { name: 'married-banner', overlaps: false },
    ]);
  }
});

test('reunites the couple with hearts before the delayed victory result and resets on replay', async ({ page }) => {
  await start(page);
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    game.scene.getScene('wedding').player.body.reset(${BRIDE.x - 50}, 570);
  })()`);
  await expect(page.locator('#game')).toHaveAttribute('data-celebrating', 'true');
  const startTime = Date.now();
  await expect(page.locator('#result')).not.toBeVisible();
  await expect(page.locator('#notice')).toHaveText('Sean and Becky, together at last! The distractions can wait.');
  const reunion = `(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    const groom = scene.playerArt.getBounds(), bride = scene.brideArt.getBounds();
    return {
      hearts: scene.children.list.filter(child => child.name === 'reunion-heart').length,
      meeting: groom.left < bride.right && groom.right > bride.left,
      groomX: scene.player.x,
      brideX: scene.brideArt.x,
      voice: Boolean(scene.ui.audio.voice),
    };
  })()`;
  await page.waitForTimeout(900);
  const meeting = await page.evaluate<{ hearts: number; meeting: boolean; groomX: number; brideX: number; voice: boolean }>(reunion);
  expect(meeting).toEqual({ hearts: 12, meeting: true, groomX: BRIDE.x - 28, brideX: BRIDE.x + 12, voice: false });
  await expect(page.locator('#result')).not.toBeVisible();
  await expect(page.locator('#result')).toBeVisible();
  expect(Date.now() - startTime).toBeGreaterThanOrEqual(3000);
  await expect(page.locator('#result-title')).toHaveText('Sean, you may kiss Becky.');
  await page.getByRole('button', { name: 'One more big day' }).click();
  await expect(page.locator('#game')).toHaveAttribute('data-celebrating', 'false');
  const replay = await page.evaluate<{ hearts: number; brideX: number }>(reunion);
  expect(replay.hearts).toBe(0);
  expect(replay.brideX).toBe(BRIDE.x);
  await expect(page.locator('#lives')).toHaveText('3 / 3');
});

test('narration uses 70% gain, game music uses 50%, menu music uses 20%, and victory music uses 60%', async ({ page }) => {
  await page.addInitScript(() => {
    const gains: GainNode[] = [];
    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const gain = createGain.call(this);
      gains.push(gain);
      return gain;
    };
    Object.defineProperty(window, '__audioGains', { value: gains });
  });
  await start(page);
  const values = () => page.evaluate<number[]>('window.__audioGains.map(gain => gain.gain.value)');
  await expect.poll(values).toEqual(expect.arrayContaining([.5, expect.closeTo(.7, 5)]));
  await page.keyboard.press('Escape');
  await expect.poll(values).toEqual(expect.arrayContaining([expect.closeTo(.2, 5)]));
  await page.getByRole('button', { name: 'Back to Becky' }).click();
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    game.scene.getScene('wedding').player.body.reset(${BRIDE.x - 50}, 570);
  })()`);
  await expect(page.locator('#game')).toHaveAttribute('data-celebrating', 'true');
  await expect.poll(values).toEqual(expect.arrayContaining([expect.closeTo(.6, 5)]));
});

test('Classic plays on the main menu, DnB plays in game, and Music On/Off controls both', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  const menuPlaying = `(async () => {
    const { game } = await import('/src/client/main.ts');
    const audio = game.scene.getScene('wedding').ui.audio;
    return Boolean(audio.menuMusic && audio.menuMusic.buffer === await audio.clips.get('background')
      && audio.menuMusic.loop && !audio.background);
  })()`;
  await expect.poll(() => page.evaluate(menuPlaying)).toBe(true);
  await page.getByRole('button', { name: 'Music: On', exact: true }).click();
  await expect.poll(() => page.evaluate(menuPlaying)).toBe(false);
  await page.getByRole('button', { name: 'Music: Off', exact: true }).click();
  await expect.poll(() => page.evaluate(menuPlaying)).toBe(true);
  await page.getByRole('button', { name: "I'm coming!" }).click();
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'playing');
  const noMenu = `(async () => {
    const { game } = await import('/src/client/main.ts');
    return !game.scene.getScene('wedding').ui.audio.menuMusic;
  })()`;
  await expect.poll(() => page.evaluate(noMenu)).toBe(true);
  const musicState = `(async () => {
    const { game } = await import('/src/client/main.ts');
    const audio = game.scene.getScene('wedding').ui.audio;
    return { playing: Boolean(audio.background), looping: audio.background?.loop ?? false,
      offset: audio.backgroundOffset, wanted: audio.backgroundWanted };
  })()`;
  await expect.poll(async () => (await page.evaluate<{ looping: boolean }>(musicState)).looping).toBe(true);
  await expect.poll(() => page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const audio = game.scene.getScene('wedding').ui.audio;
    return Boolean(audio.background && audio.background.buffer === await audio.clips.get('dnb'));
  })()`)).toBe(true);
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  const paused = await page.evaluate<{ playing: boolean; offset: number; wanted: boolean }>(musicState);
  expect(paused.playing).toBe(false);
  expect(paused.wanted).toBe(false);
  expect(paused.offset).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(menuPlaying)).toBe(true);
  await page.getByRole('button', { name: 'Back to Becky' }).click();
  await page.waitForTimeout(100);
  expect((await page.evaluate<{ playing: boolean; offset: number }>(musicState)).playing).toBe(true);
  expect((await page.evaluate<{ offset: number }>(musicState)).offset).toBe(paused.offset);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Music: On', exact: true }).click();
  await expect.poll(() => page.evaluate(menuPlaying)).toBe(false);
  expect((await page.evaluate<{ playing: boolean }>(musicState)).playing).toBe(false);
  await page.getByRole('button', { name: 'Back to Becky' }).click();
  expect((await page.evaluate<{ playing: boolean }>(musicState)).playing).toBe(false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Music: Off', exact: true }).click();
  await expect.poll(() => page.evaluate(menuPlaying)).toBe(true);
  await page.getByRole('button', { name: 'Back to Becky' }).click();
  await expect.poll(async () => (await page.evaluate<{ looping: boolean }>(musicState)).looping).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start a fresh run' }).click();
  await expect.poll(async () => (await page.evaluate<{ playing: boolean }>(musicState)).playing).toBe(true);
  expect((await page.evaluate<{ offset: number }>(musicState)).offset).toBe(0);
});

test('sound effects can be turned off without affecting main music', async ({ page }) => {
  await start(page);
  const musicPlaying = `(async () => {
    const { game } = await import('/src/client/main.ts');
    return Boolean(game.scene.getScene('wedding').ui.audio.background);
  })()`;
  await expect.poll(() => page.evaluate<boolean>(musicPlaying)).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sound effects: On' }).click();
  await page.getByRole('button', { name: 'Back to Becky' }).click();
  await expect.poll(() => page.evaluate<boolean>(musicPlaying)).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sound effects: Off' }).click();
  await page.getByRole('button', { name: 'Back to Becky' }).click();
  await expect.poll(() => page.evaluate<boolean>(musicPlaying)).toBe(true);
});

test('menu buttons play the click sound unless sound effects are off', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__clicks = 0;
    HTMLMediaElement.prototype.play = function () {
      if (this.src.includes('click')) (window as any).__clicks++;
      return Promise.resolve();
    };
  });
  await page.goto('/');
  const clicks = () => page.evaluate(() => (window as any).__clicks as number);
  await page.getByRole('button', { name: /View the guest top list/ }).click();
  await expect.poll(clicks).toBe(1);
  await page.getByRole('button', { name: 'Back to menu' }).click();
  await expect.poll(clicks).toBe(2);
  await page.getByRole('button', { name: 'Sound effects: On' }).click();
  await page.getByRole('button', { name: /View the guest top list/ }).click();
  await page.getByRole('button', { name: 'Back to menu' }).click();
  expect(await clicks()).toBe(2);
  await page.getByRole('button', { name: 'Sound effects: Off' }).click();
  await expect.poll(clicks).toBe(3);
  await page.getByRole('button', { name: "I'm coming!" }).click();
  await expect.poll(clicks).toBe(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Jump', exact: true }).click();
  expect(await clicks()).toBe(4);
});
test('plays bash for collisions and gameover on the final hit, stopping the music', async ({ page }) => {
  await start(page);
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    scene.contact(0);
    const buffer = await scene.ui.audio.clips.get('bash');
    scene.registry.set('splatDuration', buffer.duration);
  })()`);
  await expect(page.locator('#game')).toHaveAttribute('data-distractions', '1');
  const splat = await page.evaluate<number>(`(async () => {
    const { game } = await import('/src/client/main.ts');
    return game.scene.getScene('wedding').registry.get('splatDuration');
  })()`);
  expect(splat).toBeGreaterThan(0);
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    scene.contact(1); scene.contact(2);
  })()`);
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'late');
  await expect.poll(() => page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const audio = game.scene.getScene('wedding').ui.audio;
    const buffer = await audio.clips.get('gameover');
    return Boolean(buffer && buffer.duration > 0 && !audio.background
      && [...audio.effects].some(effect => effect.buffer === buffer));
  })()`)).toBe(true);
  await page.getByRole('button', { name: 'Back to menu', exact: true }).click();
  const active = await page.evaluate<number>(`(async () => {
    const { game } = await import('/src/client/main.ts');
    return game.scene.getScene('wedding').ui.audio.effects.size;
  })()`);
  expect(active).toBe(0);
});

test('goal replaces background music with level_end during the reunion', async ({ page }) => {
  await start(page);
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    game.scene.getScene('wedding').ui.audio.setMusicMode('off');
    game.scene.getScene('wedding').player.body.reset(${BRIDE.x - 50}, 570);
  })()`);
  await expect(page.locator('#game')).toHaveAttribute('data-celebrating', 'true');
  await expect.poll(() => page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const audio = game.scene.getScene('wedding').ui.audio;
    const buffer = await audio.clips.get('level_end');
    const weddingMusic = await audio.clips.get('wedding');
    return Boolean(buffer && buffer.duration > 0 && !audio.background
      && audio.weddingMusic?.buffer === weddingMusic
      && [...audio.effects].some(effect => effect.buffer === buffer));
  })()`)).toBe(true);
  await expect(page.locator('#result')).not.toBeVisible();
});

test('city transitions from night through dawn to daylight and resets on replay', async ({ page }) => {
  await start(page);
  const lighting = `(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    return {
      night: scene.children.getByName('night-sky').alpha,
      cityTint: scene.children.getByName('city-0').tintTopLeft,
    };
  })()`;
  const night = await page.evaluate<{ night: number; cityTint: number }>(lighting);
  expect(night.night).toBeGreaterThan(.99);
  expect(night.cityTint).not.toBe(0xffffff);
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    scene.player.body.reset(${(START.x + BRIDE.x - 54) / 2}, 420);
    scene.update(0, 0);
    scene.pause();
  })()`);
  const dawn = await page.evaluate<{ night: number; cityTint: number }>(lighting);
  expect(dawn.night).toBeCloseTo(.5, 2);
  expect(dawn.cityTint).not.toBe(night.cityTint);
  expect(dawn.cityTint).not.toBe(0xffffff);
  await page.waitForTimeout(150);
  expect(await page.evaluate(lighting)).toEqual(dawn);
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    scene.start();
    scene.player.body.reset(${BRIDE.x - 54}, 570);
    scene.update(0, 0);
  })()`);
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'won');
  expect(await page.evaluate(lighting)).toEqual({ night: 0, cityTint: 0xffffff });
  await expect(page.getByRole('button', { name: 'One more big day' })).toBeVisible();
  await page.getByRole('button', { name: 'One more big day' }).click();
  await expect.poll(async () => (await page.evaluate<{ night: number }>(lighting)).night).toBeGreaterThan(.99);
});

test('landing on a person squashes once, bounces, plays splat and preserves chances', async ({ page }) => {
  await start(page);
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    scene.player.body.reset(${people[0].x - 35}, 455);
    scene.player.setVelocityY(350);
  })()`);
  await expect(page.locator('#game')).toHaveAttribute('data-squashed', '1');
  await expect(page.locator('#lives')).toHaveText('3 / 3');
  await expect(page.locator('#game')).toHaveAttribute('data-distractions', '0');
  const bounce = await page.evaluate<{ vy: number; lives: number; hit: number; enabled: boolean }>(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    return { vy: scene.player.body.velocity.y, lives: scene.run.lives,
      hit: scene.run.hit.size, enabled: scene.characters[0].body.body.enable };
  })()`);
  expect(bounce).toMatchObject({ lives: 3, hit: 0, enabled: false });
  expect(bounce.vy).toBeLessThan(0);
  await expect.poll(() => page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    return scene.characters[0].art.scaleY;
  })()`)).toBe(.25);
  const splat = await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    return (await scene.ui.audio.clips.get('splat')).duration > 0;
  })()`);
  expect(splat).toBe(true);
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    scene.player.body.reset(${people[0].x - 35}, 570);
    scene.player.setVelocityY(0);
  })()`);
  await page.waitForTimeout(250);
  await expect(page.locator('#lives')).toHaveText('3 / 3');
  await expect(page.locator('#game')).toHaveAttribute('data-squashed', '1');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start a fresh run' }).click();
  const reset = await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    return { scale: scene.characters[0].art.scaleY, enabled: scene.characters[0].body.body.enable };
  })()`);
  expect(reset).toEqual({ scale: 1.1, enabled: true });
  await expect(page.locator('#game')).toHaveAttribute('data-squashed', '0');
  await expect(page.locator('#game')).toHaveAttribute('data-bonus', '0');
});

test('dramatic event overlays fit mobile and desktop, replace old events and reset', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    scene.contact(0);
    scene.pause();
  })()`);
  const overlayState = `(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    const overlay = scene.children.getByName('event-overlay');
    const camera = scene.cameras.main;
    const x = camera.width / 2 + (overlay.x - camera.width / 2) * camera.zoom;
    const y = camera.height / 2 + (overlay.y - camera.height / 2) * camera.zoom;
    return { text: overlay.text, alpha: overlay.alpha, angle: overlay.angle,
      left: x - overlay.displayWidth * camera.zoom / 2,
      right: x + overlay.displayWidth * camera.zoom / 2,
      top: y - overlay.displayHeight * camera.zoom / 2,
      bottom: y + overlay.displayHeight * camera.zoom / 2,
      width: camera.width, height: camera.height,
      fixed: overlay.scrollFactorX === 0 && overlay.scrollFactorY === 0 };
  })()`;
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const overlay = await page.evaluate<{ text: string; alpha: number; angle: number; left: number; right: number; top: number; bottom: number; width: number; height: number; fixed: boolean }>(overlayState);
    expect(overlay.text).toBe('OUCH!\n-1 CHANCE');
    expect(overlay.fixed).toBe(true);
    expect(overlay.angle).toBe(0);
    expect(overlay.left).toBeGreaterThanOrEqual(0);
    expect(overlay.right).toBeLessThanOrEqual(overlay.width);
    expect(overlay.top).toBeGreaterThan(80);
    expect(overlay.bottom).toBeLessThan(overlay.height * .5);
    expect(overlay.alpha).toBe(1);
  }
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    scene.start();
    scene.contact(1);
    scene.pause();
    scene.registry.set('overlayCount', scene.children.list.filter(child => child.name === 'event-overlay').length);
  })()`);
  expect(await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    return game.scene.getScene('wedding').registry.get('overlayCount');
  })()`)).toBe(1);
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    game.scene.getScene('wedding').start(true);
  })()`);
  expect(await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    return Boolean(game.scene.getScene('wedding').children.getByName('event-overlay'));
  })()`)).toBe(false);
});

test('squash bonuses appear in the HUD and result without being counted as sweet points', async ({ page }) => {
  await start(page);
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    scene.player.body.reset(${people[0].x - 35}, 455);
    scene.player.setVelocityY(350);
  })()`);
  await expect(page.locator('#game')).toHaveAttribute('data-bonus', '5');
  const total = await page.evaluate<number>(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    if (scene.run.score !== scene.run.sweetScore + 5) throw new Error('Bonus not included in total');
    scene.player.body.reset(${BRIDE.x - 50}, 570);
    return scene.run.score;
  })()`);
  await expect(page.locator('#score')).toHaveText(`${total} points`);
  await expect(page.locator('#result-detail')).toContainText(`${total} total points`);
  await expect(page.locator('#result-detail')).toContainText('+ 5 squash bonus');
});

test('person side hits are independent of hurdles and rising contact is not a stomp', async ({ page }) => {
  await start(page);
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    scene.player.body.reset(${people[0].x - 45}, 570);
    scene.player.setVelocityY(0);
  })()`);
  await expect(page.locator('#lives')).toHaveText('2 / 3');
  await page.waitForTimeout(250);
  await expect(page.locator('#game')).toHaveAttribute('data-distractions', '1');
  await expect(page.locator('#game')).toHaveAttribute('data-squashed', '0');
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    scene.contact(0);
    scene.player.body.reset(${people[1].x - 30}, 555);
    scene.player.setVelocityY(-300);
  })()`);
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'late');
  await expect(page.locator('#game')).toHaveAttribute('data-distractions', '3');
  await expect(page.locator('#game')).toHaveAttribute('data-squashed', '0');
  await page.getByRole('button', { name: 'One more big day' }).click();
  const reset = await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    return { hits: scene.run.hitPeople.size,
      people: scene.characters.every(person => person.body.body.enable && person.art.alpha === 1) };
  })()`);
  expect(reset).toEqual({ hits: 0, people: true });
});

test('reduced-motion squashes are immediate and freeze on pause', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    scene.player.body.reset(${people[0].x - 35}, 455);
    scene.player.setVelocityY(350);
  })()`);
  await expect(page.locator('#game')).toHaveAttribute('data-squashed', '1');
  const squash = await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    return { scale: scene.characters[0].art.scaleY,
      tweens: scene.tweens.getTweensOf(scene.characters[0].art).length };
  })()`);
  expect(squash).toEqual({ scale: .25, tweens: 0 });
  await page.keyboard.press('Escape');
  const paused = await state(page);
  await page.waitForTimeout(150);
  expect(await state(page)).toEqual(paused);
});

test('a second press in the air double jumps higher than a single jump', async ({ page }) => {
  await start(page);
  await exposeScene(page);
  await teleport(page, 2000);
  await page.waitForFunction(() => document.getElementById('game')?.dataset.grounded === 'true');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (window as any).__scene.player.body.velocity.y > -250);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => Number(document.getElementById('game')?.dataset.y) < 566 - 150);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('game')?.dataset.grounded === 'true');
  await expect(page.locator('#game')).toHaveAttribute('data-distractions', '0');
});

test('a champagne cork super jump reaches a spinning wedding ring', async ({ page }) => {
  await start(page);
  await exposeScene(page);
  await teleport(page, corks[0].x - 60);
  await expect(page.locator('#game')).toHaveAttribute('data-rings', '1');
  await expect(page.locator('#game')).toHaveAttribute('data-score', String(RING_VALUE));
  expect(rings[0].y).toBeLessThan(566 - 200);
});

test('ducking under a swooping pigeon dodges it; running upright is a hit', async ({ page }) => {
  const pigeon = movers.findIndex(mover => mover.kind === 'pigeon');
  expect(people.some(person => person.x > movers[pigeon].x - 640 && person.x < movers[pigeon].x + 120)).toBe(false);
  for (const duck of [true, false]) {
    await start(page);
    await exposeScene(page);
    await teleport(page, movers[pigeon].x - 560);
    if (duck) await page.keyboard.down('ArrowDown');
    await expect(page.locator('#game')).toHaveAttribute('data-ducking', String(duck));
    await page.waitForFunction(x => Number(document.getElementById('game')?.dataset.x) > x + 80, movers[pigeon].x);
    if (duck) await page.keyboard.up('ArrowDown');
    expect(await page.evaluate(id => (window as any).__scene.run.dodged.has(id), pigeon)).toBe(duck);
    await expect(page.locator('#game')).toHaveAttribute('data-distractions', duck ? '0' : '1');
  }
});

test("Becky's texts arrive as the run goes on and get frantic", async ({ page }) => {
  await start(page);
  await expect(page.locator('#becky-message')).toHaveText('Where are you?? x', { timeout: 8000 });
  await expect(page.locator('#becky-text')).toBeVisible();
  await expect(page.locator('#becky-text')).not.toHaveAttribute('data-frantic');
  await exposeScene(page);
  await teleport(page, START.x + .59 * (BRIDE.x - START.x));
  await expect(page.locator('#becky-message')).toHaveText("I'm sending my bridesmaids to find you!!");
  await expect(page.locator('#becky-text')).toHaveAttribute('data-frantic', '');
  await expect(page.locator('#becky-text')).toBeHidden({ timeout: 4000 });
});

async function ringThenCrash(page: Page): Promise<void> {
  await exposeScene(page);
  await teleport(page, corks[0].x - 60);
  await expect(page.locator('#game')).toHaveAttribute('data-rings', '1');
  for (let id = 0; id < 3; id++) {
    await teleport(page, hurdles[id].x - 60);
    await expect(page.locator('#game')).toHaveAttribute('data-distractions', String(id + 1));
  }
  await expect(page.locator('#result')).toBeVisible();
}

test('best score, name filter and share link to a highlighted top list', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => { (window as any).__shared = data; },
    });
    (window as any).__tadas = 0;
    HTMLMediaElement.prototype.play = function () {
      if (this.src.includes('tada')) (window as any).__tadas++;
      return Promise.resolve();
    };
  });
  await start(page);
  await ringThenCrash(page);
  await expect(page.locator('#result-best')).toHaveText(`NEW RECORD! ${RING_VALUE} beats your old best of 0.`);

  await page.locator('#player-name').fill('');
  await page.getByRole('button', { name: /Post to the top list/ }).click();
  await expect(page.locator('#score-status')).toContainText('Add your name');
  await expect(page.locator('#player-name')).toBeFocused();

  await page.locator('#player-name').fill('Bell End');
  await page.getByRole('button', { name: /Post to the top list/ }).click();
  await expect(page.locator('#score-status')).toContainText('Keep it clean');

  const name = `Aunt ${Date.now().toString(36).slice(-6)}`;
  await page.locator('#player-name').fill(name);
  await page.getByRole('button', { name: /Post to the top list/ }).click();
  const posted = page.getByRole('dialog', { name: 'Wedding guest top list' });
  await expect(posted).toBeVisible();
  await expect(page.locator('#result')).not.toBeVisible();
  await expect(page).toHaveURL(/\/top\?you=[a-z0-9]{12}$/);
  expect(await page.evaluate(() => (window as any).__tadas)).toBe(1);
  await expect(posted.locator('tr[data-you]')).toContainText(name);
  await expect(page.locator('#top-list-intro')).toContainText("You're #");
  await page.getByRole('button', { name: /Share my place/ }).click();
  await expect(page.locator('#share-status')).toContainText('Shared!');
  const shared = await page.evaluate(() => (window as any).__shared as ShareData);
  expect(shared.url).toMatch(/\/top\?you=[a-z0-9]{12}$/);
  expect(shared.text).toContain(name);
  await expect(posted.getByRole('button', { name: 'One more big day ↗' })).toBeVisible();
  await posted.getByRole('button', { name: 'Back to menu' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#menu')).toBeVisible();

  await page.goto(new URL(shared.url!).pathname + new URL(shared.url!).search);
  const topList = page.getByRole('dialog', { name: 'Wedding guest top list' });
  await expect(topList).toBeVisible();
  await expect(page.locator('#menu')).not.toBeVisible();
  const you = topList.locator('tr[data-you]');
  await expect(you).toHaveCount(1);
  await expect(you).toContainText(name);
  await expect(you).toContainText(String(RING_VALUE));
  await expect(you).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#top-list-intro')).toContainText(`${name} is #`);
  const overflow = await topList.evaluate(dialog => dialog.scrollWidth - dialog.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: /Play WeddingRush/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#menu')).toBeVisible();

  await page.getByRole('button', { name: "I'm coming!" }).click();
  for (let id = 0; id < 3; id++) {
    await exposeScene(page);
    await teleport(page, hurdles[id].x - 60);
    await expect(page.locator('#game')).toHaveAttribute('data-distractions', String(id + 1));
  }
  await expect(page.locator('#result-best')).toHaveText(`Your best: ${RING_VALUE} points.`);
  await expect(page.locator('#player-name')).toHaveValue(name);
  await expect(page.locator('#player-name')).toBeVisible();
  await expect(page.getByRole('button', { name: /Post to the top list/ })).toBeEnabled();
  await expect(page.locator('#score-status')).toBeHidden();

  await page.getByRole('button', { name: 'See the top list' }).click();
  const list = page.getByRole('dialog', { name: 'Wedding guest top list' });
  await expect(list).toBeVisible();
  await expect(page.getByRole('button', { name: /Share my place/ })).toBeHidden();
  await list.getByRole('button', { name: 'One more big day ↗' }).click();
  await expect(list).not.toBeVisible();
  await expect(page.locator('#menu')).not.toBeVisible();
  await expect(page.locator('#game')).toHaveAttribute('data-distractions', '0');
});

test('the main menu opens the guest top list and returns or starts a run', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /View the guest top list/ }).click();
  const list = page.getByRole('dialog', { name: 'Wedding guest top list' });
  await expect(list).toBeVisible();
  await expect(page.locator('#top-list-intro')).not.toContainText('Loading');
  await expect(list.getByRole('button', { name: /Share my place/ })).toBeHidden();
  await list.getByRole('button', { name: 'Back to menu' }).click();
  await expect(list).not.toBeVisible();
  await expect(page.locator('#menu')).toBeVisible();

  await page.getByRole('button', { name: /View the guest top list/ }).click();
  await list.getByRole('button', { name: "I'm coming! ↗" }).click();
  await expect(list).not.toBeVisible();
  await expect(page.locator('#menu')).not.toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('plays recorded effects for corks, rings, pigeons, texts and hits', async ({ page }) => {
  await start(page);
  await exposeScene(page);
  await page.evaluate(`(() => {
    const audio = window.__scene.ui.audio;
    window.__effects = [];
    const effect = audio.effect.bind(audio);
    audio.effect = clip => { window.__effects.push(clip); effect(clip); };
  })()`);
  const effects = () => page.evaluate<string[]>('window.__effects');
  await teleport(page, corks[0].x - 60);
  await expect.poll(effects).toEqual(expect.arrayContaining(['cork', 'sparkle']));
  await teleport(page, movers[1].x - 300);
  await expect.poll(effects).toEqual(expect.arrayContaining(['flap', 'notify']));
  expect(await effects()).not.toContain('duck');
  await page.evaluate('window.__scene.contact(0)');
  await expect.poll(effects).toContain('bash');
  const loaded = await page.evaluate(`(async () => {
    const audio = window.__scene.ui.audio;
    const clips = await Promise.all(['cork', 'sparkle', 'flap', 'notify', 'bash'].map(clip => audio.clips.get(clip)));
    return clips.every(buffer => buffer && buffer.duration > 0 && buffer.duration < 3);
  })()`);
  expect(loaded).toBe(true);
});

test('an unknown top list link still shows the table and copies links without native share', async ({ page }) => {
  await page.goto('/top?you=zzzzzzzzzzzz');
  await expect(page.locator('#top-list-intro')).toContainText("couldn't find that score");
  await expect(page.locator('#top-list tr[data-you]')).toHaveCount(0);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 390, height: 650 }]) {
  test(`result top list fits without sideways scrolling at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await start(page);
    await ringThenCrash(page);
    const overflow = await page.locator('#result').evaluate(dialog => dialog.scrollWidth - dialog.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole('button', { name: /Post to the top list/ })).toBeVisible();
  });
}

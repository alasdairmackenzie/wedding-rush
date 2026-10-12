import { expect, test, type Page } from '@playwright/test';
import { BRIDE, corks, GROOM, hurdles, movers, people, rings, RING_VALUE, RUN_OBJECTIVE, runnerSpeed, START, sweets } from '../src/shared/level';

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
  await expect(page.locator('#objective')).toContainText('Get Sean to Becky');
  await expect(page.locator('#notice')).toContainText('Becky is ready. Sean');
  await page.getByRole('button', { name: "I'm coming!" }).click();
  await expect(page.locator('#notice')).toHaveText(RUN_OBJECTIVE);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Back to Becky' })).toBeVisible();
});

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
  await expect(page.locator('#result-detail')).toContainText('Three distractions');
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
      heads: ['bride-head', 'deal-head', 'pingpong-head'].every(key => scene.textures.exists(key)),
      obstacles: scene.obstacles.length
    };
  })()`);
  expect(artwork).toEqual({ key: 'groom-photo', height: 120, hitbox: [34, 56], heads: true, obstacles: hurdles.length });
  const characters = await page.evaluate<string[]>(`(async () => {
    const { game } = await import('/src/client/main.ts');
    return game.scene.getScene('wedding').characters.map(character => character.art.texture.key);
  })()`);
  expect(characters).toEqual(['football', 'deal', 'pingpong', 'hat', 'pub', 'karaoke', 'kebab']);
  await page.keyboard.press('Escape');
  await expect(page.locator('.cast')).toHaveCount(0);
  await expect(page.locator('#controls')).toContainText('One press, one full jump');
  await expect(page.getByRole('button', { name: 'Move right', exact: true })).toHaveCount(0);
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
    ...movers.map((mover, id) => ({ x: mover.x, mover: id, kind: mover.kind }))].sort((a, b) => a.x - b.x);
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

test('plays the recorded intro, stops on pause and mute, and repeats only on replay', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Sound: on', exact: true }).click();
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

test('background music loops only during play, preserves its position on pause, and respects mute', async ({ page }) => {
  await start(page);
  const musicState = `(async () => {
    const { game } = await import('/src/client/main.ts');
    const audio = game.scene.getScene('wedding').ui.audio;
    return { playing: Boolean(audio.background), looping: audio.background?.loop ?? false,
      offset: audio.backgroundOffset, wanted: audio.backgroundWanted };
  })()`;
  await expect.poll(async () => (await page.evaluate<{ looping: boolean }>(musicState)).looping).toBe(true);
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  const paused = await page.evaluate<{ playing: boolean; offset: number; wanted: boolean }>(musicState);
  expect(paused.playing).toBe(false);
  expect(paused.wanted).toBe(false);
  expect(paused.offset).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Sound: on', exact: true }).click();
  await page.getByRole('button', { name: 'Back to Becky' }).click();
  await page.waitForTimeout(100);
  expect((await page.evaluate<{ playing: boolean }>(musicState)).playing).toBe(false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sound: off', exact: true }).click();
  expect((await page.evaluate<{ playing: boolean }>(musicState)).playing).toBe(false);
  await page.getByRole('button', { name: 'Back to Becky' }).click();
  await expect.poll(async () => (await page.evaluate<{ looping: boolean }>(musicState)).looping).toBe(true);
  expect((await page.evaluate<{ offset: number }>(musicState)).offset).toBe(paused.offset);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start a fresh run' }).click();
  await expect.poll(async () => (await page.evaluate<{ playing: boolean }>(musicState)).playing).toBe(true);
  expect((await page.evaluate<{ offset: number }>(musicState)).offset).toBe(0);
});

test('plays splat for collisions and gameover on the final hit, stopping the music', async ({ page }) => {
  await start(page);
  await page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const scene = game.scene.getScene('wedding');
    scene.contact(0);
    const buffer = await scene.ui.audio.clips.get('splat');
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
    game.scene.getScene('wedding').player.body.reset(${BRIDE.x - 50}, 570);
  })()`);
  await expect(page.locator('#game')).toHaveAttribute('data-celebrating', 'true');
  await expect.poll(() => page.evaluate(`(async () => {
    const { game } = await import('/src/client/main.ts');
    const audio = game.scene.getScene('wedding').ui.audio;
    const buffer = await audio.clips.get('level_end');
    return Boolean(buffer && buffer.duration > 0 && !audio.background
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
  });
  await start(page);
  await ringThenCrash(page);
  await expect(page.locator('#result-best')).toHaveText(`NEW RECORD! ${RING_VALUE} beats your old best of 0.`);

  await page.locator('#player-name').fill('');
  await page.getByRole('button', { name: /Share my place/ }).click();
  await expect(page.locator('#score-status')).toContainText('Add your name');
  await expect(page.locator('#player-name')).toBeFocused();

  await page.locator('#player-name').fill('Bell End');
  await page.getByRole('button', { name: 'Post score' }).click();
  await expect(page.locator('#score-status')).toContainText('Keep it clean');

  const name = `Aunt ${Date.now().toString(36).slice(-6)}`;
  await page.locator('#player-name').fill(name);
  await page.getByRole('button', { name: /Share my place/ }).click();
  await expect(page.locator('#score-status')).toContainText('Shared!');
  const shared = await page.evaluate(() => (window as any).__shared as ShareData);
  expect(shared.url).toMatch(/\/top\?you=[a-z0-9]{12}$/);
  expect(shared.text).toContain(name);
  await expect(page.locator('#leaderboard tr[data-you]')).toContainText(name);
  await expect(page.locator('#player-name')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Post score' })).toBeHidden();
  await expect(page.locator('#score-status')).toBeVisible();

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
  await expect(page.getByRole('button', { name: 'Post score' })).toBeEnabled();
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
    await expect(page.getByRole('button', { name: /Share my place/ })).toBeVisible();
  });
}

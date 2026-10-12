import { describe, expect, it } from 'vitest';
import { BRIDE, daylightProgress, GROOM, hurdles, people, platforms, Run, runnerSpeed, START, sweets,
  temptations, TOTAL_SCORE, WORLD } from './level';

function playing(): Run { const run = new Run(); run.phase = 'playing'; return run; }

describe('dice sweets', () => {
  it('keeps two easy starters and places later sweets near achievable jump peaks', () => {
    expect(sweets.slice(0, 2).map(sweet => sweet.y)).toEqual([565, 565]);
    const highestBodyTop = 610 - GROOM.height - GROOM.jump ** 2 / (2 * GROOM.gravity);
    for (const sweet of sweets.slice(2)) {
      expect(sweet.y).toBeLessThanOrEqual(425);
      expect(sweet.y + 20).toBeGreaterThan(highestBodyTop);
    }
    hurdles.forEach((hurdle, id) => {
      expect(sweets[2 + id * 3]).toMatchObject({ x: hurdle.x, y: 420 });
      expect(sweets[4 + id * 3].x).toBe(people[id].x + 90);
    });
  });
  it('adds each exact face value once and resets on replay', () => {
    const run = playing();
    for (let id = 0; id < 6; id++) {
      expect(run.collect(id)).toBe(true);
      expect(run.collect(id)).toBe(false);
    }
    expect(run.score).toBe(21);
    for (let id = 6; id < sweets.length; id++) run.collect(id);
    expect(run.score).toBe(TOTAL_SCORE);
    expect(new Run().score).toBe(0);
  });
  it('rejects invalid pickups and collections outside play', () => {
    const run = playing();
    for (const id of [-1, .5, NaN, sweets.length]) expect(run.collect(id)).toBe(false);
    for (const phase of ['ready', 'paused', 'won', 'late'] as const) {
      run.phase = phase;
      expect(run.collect(0)).toBe(false);
    }
    expect(run.score).toBe(0);
    expect(new Set(sweets.map(sweet => sweet.value))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });
});

describe('hurdle runner rules', () => {
  it('counts each hit only once, costs only a chance, and loses on hit three', () => {
    const run = playing();
    run.collect(0);
    for (let id = 0; id < 3; id++) {
      expect(run.hitHurdle(id)).toBe(true);
      expect(run.hitHurdle(id)).toBe(false);
      expect(run.clearHurdle(id)).toBe(false);
      expect(run.lives).toBe(2 - id);
    }
    expect(run.phase).toBe('late');
    expect(run.distractions).toBe(3);
    expect(run.score).toBe(1);
    expect(run.hitHurdle(3)).toBe(false);
    expect(run.finish()).toBe(false);
    const fresh = new Run();
    expect(fresh.lives).toBe(3);
    expect(fresh.hit.size).toBe(0);
    expect(fresh.cleared.size).toBe(0);
  });
  it('counts clears once and never counts a cleared hurdle as a hit', () => {
    const run = playing();
    expect(run.clearHurdle(0)).toBe(true);
    expect(run.clearHurdle(0)).toBe(false);
    expect(run.hitHurdle(0)).toBe(false);
    expect(run.lives).toBe(3);
    for (const id of [-1, .5, NaN, hurdles.length]) {
      expect(run.clearHurdle(id)).toBe(false);
      expect(run.hitHurdle(id)).toBe(false);
    }
    run.phase = 'paused';
    expect(run.clearHurdle(1)).toBe(false);
    expect(run.hitHurdle(1)).toBe(false);
  });
  it('has no deadline: time pauses, never fails a run, and wins stay frozen', () => {
    const run = playing();
    run.tick(1000);
    run.phase = 'paused'; run.tick(9000);
    expect(run.elapsed).toBe(1000);
    run.phase = 'playing'; run.tick(10 * 60_000);
    expect(run.phase).toBe('playing');
    expect(run.finish()).toBe(true);
    run.tick(10_000);
    expect(run.elapsed).toBe(601_000);
    expect(run.hitHurdle(0)).toBe(false);
    expect(Object.keys(run)).not.toContain('delay');
    expect('remaining' in run).toBe(false);
  });
});

describe('runner course', () => {
  it('gives each character one independent position between hurdles', () => {
    expect(hurdles).toHaveLength(temptations.length);
    expect(new Set(people.map(person => person.temptation.kind)).size).toBe(temptations.length);
    expect(people.map(person => person.temptation)).toEqual(temptations);
    const airTime = 2 * GROOM.jump / GROOM.gravity;
    people.forEach((person, id) => {
      expect(person.x - hurdles[id].x).toBeGreaterThan(airTime * GROOM.maxSpeed + 100);
      expect((hurdles[id + 1]?.x ?? BRIDE.x) - person.x).toBeGreaterThan(airTime * GROOM.maxSpeed + 100);
    });
  });
  it('brightens smoothly from night at the start to full daylight at the finish', () => {
    expect(daylightProgress(START.x - 100)).toBe(0);
    expect(daylightProgress(START.x)).toBe(0);
    expect(daylightProgress((START.x + BRIDE.x - 54) / 2)).toBe(.5);
    expect(daylightProgress(BRIDE.x - 54)).toBe(1);
    expect(daylightProgress(BRIDE.x + 100)).toBe(1);
  });
  it('accelerates smoothly within bounds', () => {
    expect(runnerSpeed(START.x - 100)).toBe(GROOM.speed);
    expect(runnerSpeed(START.x)).toBe(GROOM.speed);
    expect(runnerSpeed((START.x + BRIDE.x) / 2)).toBe((GROOM.speed + GROOM.maxSpeed) / 2);
    expect(runnerSpeed(BRIDE.x + 100)).toBe(GROOM.maxSpeed);
  });
  it('has continuous ground, achievable jumps and enough time to land between hurdles', () => {
    expect(platforms).toEqual([{ x: 0, y: 610, width: WORLD.width, height: 110, kind: 'street' }]);
    const airTime = 2 * GROOM.jump / GROOM.gravity;
    for (const [id, hurdle] of hurdles.entries()) {
      const discriminant = GROOM.jump ** 2 - 2 * GROOM.gravity * hurdle.height;
      expect(discriminant).toBeGreaterThan(0);
      const clearanceTime = 2 * Math.sqrt(discriminant) / GROOM.gravity;
      expect(clearanceTime * GROOM.speed).toBeGreaterThan(hurdle.width + GROOM.width + 20);
      if (id) expect(hurdle.x - hurdles[id - 1].x).toBeGreaterThan(airTime * GROOM.maxSpeed + 100);
    }
    expect(BRIDE.x).toBeGreaterThan(hurdles.at(-1)!.x + 100);
    expect(BRIDE.x).toBeLessThan(WORLD.width);
    expect(hurdles[0].x - START.x).toBeLessThanOrEqual(GROOM.speed * 4);
    expect(people[0].x - 430 - START.x).toBeGreaterThan(hurdles[0].x - START.x);
  });
});

describe('independent people', () => {
  it('squashes once without penalties and leaves hurdle state untouched', () => {
    const run = playing();
    expect(run.squashPerson(0)).toBe(true);
    expect(run.squashPerson(0)).toBe(false);
    expect(run.hitPerson(0)).toBe(false);
    expect(run.lives).toBe(3);
    expect(run.distractions).toBe(0);
    expect(run.bonusScore).toBe(5);
    expect(run.score).toBe(5);
    expect(run.sweetScore).toBe(0);
    expect(run.hit.size).toBe(0);
    expect(run.cleared.size).toBe(0);
    expect(run.hitHurdle(0)).toBe(true);
  });
  it('adds five points for every unique squash, alongside exact sweet points', () => {
    const run = playing();
    run.collect(0);
    run.collect(1);
    people.forEach((_person, id) => {
      expect(run.squashPerson(id)).toBe(true);
      expect(run.squashPerson(id)).toBe(false);
      expect(run.bonusScore).toBe((id + 1) * 5);
      expect(run.score).toBe(3 + (id + 1) * 5);
    });
    expect(run.sweetScore).toBe(3);
    const fresh = new Run();
    expect(fresh.bonusScore).toBe(0);
    expect(fresh.score).toBe(0);
  });
  it('counts side hits once, shares the three-chance limit and resets', () => {
    const run = playing();
    expect(run.hitPerson(0)).toBe(true);
    expect(run.hitPerson(0)).toBe(false);
    expect(run.squashPerson(0)).toBe(false);
    expect(run.bonusScore).toBe(0);
    expect(run.hitHurdle(0)).toBe(true);
    expect(run.hitPerson(1)).toBe(true);
    expect(run.phase).toBe('late');
    expect(run.lives).toBe(0);
    expect(new Run().hitPeople.size).toBe(0);
    expect(new Run().squashed.size).toBe(0);
  });
  it('rejects invalid IDs and interactions outside gameplay', () => {
    const run = playing();
    for (const id of [-1, .5, NaN, people.length]) {
      expect(run.hitPerson(id)).toBe(false);
      expect(run.squashPerson(id)).toBe(false);
    }
    for (const phase of ['ready', 'paused', 'won', 'late'] as const) {
      run.phase = phase;
      expect(run.hitPerson(0)).toBe(false);
      expect(run.squashPerson(0)).toBe(false);
    }
  });
});

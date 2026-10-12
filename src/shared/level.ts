export const WORLD = { width: 11550, height: 720 };
export const GROOM = { speed: 300, maxSpeed: 430, jump: 650, gravity: 1600, width: 34, height: 56 };
export const START = { x: 110, y: 566 };
export const BRIDE = { x: 11250, y: 590 };
export const WEDDING_TIME = 120_000;
export const TEMPTATION_DELAY = 8_000;
export const SQUASH_BONUS = 5;
export const RUN_OBJECTIVE = 'Get Sean to Becky! Jump the hurdles, jump over or squash the distractions, collect sweets, and keep your three chances.';

export interface Platform { x: number; y: number; width: number; height: number; kind: 'street' | 'ledge' }
export type TemptationKind = 'football' | 'deal' | 'pingpong' | 'hat' | 'pub' | 'karaoke' | 'kebab';
export interface Temptation {
  kind: TemptationKind;
  name: string;
  line: string;
  x: number;
  y: number;
  left: number;
  right: number;
  speed: number;
}

export const platforms: Platform[] = [
  { x: 0, y: 610, width: WORLD.width, height: 110, kind: 'street' },
];

export const temptations: Temptation[] = [
  { kind: 'football', name: 'The football fan', line: 'Come watch the football', x: 630, y: 566, left: 530, right: 730, speed: 55 },
  { kind: 'deal', name: 'The dealer', line: "Let's play some deal", x: 1280, y: 566, left: 1200, right: 1380, speed: 65 },
  { kind: 'pingpong', name: 'The ping-pong pro', line: 'game of ping pong', x: 1700, y: 566, left: 1590, right: 1780, speed: 65 },
  { kind: 'hat', name: 'The bucket-hat detective', line: "I think you've lost your bucket hat, let's go find it", x: 2370, y: 566, left: 2240, right: 2420, speed: 60 },
  { kind: 'pub', name: 'The pub regular', line: 'Just one pint. What could go wrong?', x: 2890, y: 566, left: 2770, right: 2980, speed: 70 },
  { kind: 'karaoke', name: 'The karaoke king', line: 'One song! The crowd needs you!', x: 3510, y: 566, left: 3390, right: 3610, speed: 75 },
  { kind: 'kebab', name: 'The kebab enthusiast', line: 'Wedding can wait. Extra chilli sauce?', x: 3920, y: 566, left: 3810, right: 4000, speed: 65 },
];
export const hurdles = temptations.map((_temptation, id) => ({
  x: 2600 + id * 1250,
  width: 64,
  height: 68 + id % 3 * 10,
}));
export const people = temptations.map((temptation, id) => ({
  x: hurdles[id].x + 550,
  width: 38,
  height: 82,
  temptation,
}));

const sweetPositions = [
  ...[200, 260].map(x => ({ x, y: 565 })),
  ...hurdles.flatMap((hurdle, id) => [
    { x: hurdle.x, y: 420 },
    { x: people[id].x - 55, y: 425 },
    { x: people[id].x + 90, y: 420 },
  ]),
];
export const sweets = sweetPositions.map((position, index) => ({ ...position, value: index % 6 + 1 }));
export const TOTAL_SCORE = sweets.reduce((total, sweet) => total + sweet.value, 0);

export function runnerSpeed(x: number): number {
  const progress = Math.min(1, Math.max(0, (x - START.x) / (BRIDE.x - START.x)));
  return GROOM.speed + (GROOM.maxSpeed - GROOM.speed) * progress;
}
export function daylightProgress(x: number): number {
  return Math.min(1, Math.max(0, (x - START.x) / (BRIDE.x - 54 - START.x)));
}
export function formatTime(milliseconds: number): string {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export type RunPhase = 'ready' | 'playing' | 'paused' | 'won' | 'late';
export class Run {
  phase: RunPhase = 'ready';
  lives = 3;
  elapsed = 0;
  delay = 0;
  distractions = 0;
  readonly collected = new Set<number>();
  readonly cleared = new Set<number>();
  readonly hit = new Set<number>();
  readonly hitPeople = new Set<number>();
  readonly squashed = new Set<number>();

  get sweetScore(): number { return [...this.collected].reduce((sum, id) => sum + sweets[id].value, 0); }
  get bonusScore(): number { return this.squashed.size * SQUASH_BONUS; }
  get score(): number { return this.sweetScore + this.bonusScore; }
  get remaining(): number { return Math.max(0, WEDDING_TIME - this.elapsed - this.delay); }
  tick(milliseconds: number): void {
    if (this.phase !== 'playing') return;
    this.elapsed += Math.max(0, milliseconds);
    if (this.remaining === 0) this.phase = 'late';
  }
  collect(id: number): boolean {
    if (this.phase !== 'playing' || !Number.isInteger(id) || id < 0 || id >= sweets.length || this.collected.has(id)) return false;
    this.collected.add(id);
    return true;
  }
  hitHurdle(id: number): boolean {
    if (this.phase !== 'playing' || !Number.isInteger(id) || id < 0 || id >= hurdles.length || this.hit.has(id) || this.cleared.has(id)) return false;
    this.hit.add(id);
    this.distract();
    return true;
  }
  hitPerson(id: number): boolean {
    if (this.phase !== 'playing' || !Number.isInteger(id) || id < 0 || id >= people.length || this.hitPeople.has(id) || this.squashed.has(id)) return false;
    this.hitPeople.add(id);
    this.distract();
    return true;
  }
  squashPerson(id: number): boolean {
    if (this.phase !== 'playing' || !Number.isInteger(id) || id < 0 || id >= people.length || this.hitPeople.has(id) || this.squashed.has(id)) return false;
    this.squashed.add(id);
    return true;
  }
  private distract(): void {
    this.delay += TEMPTATION_DELAY;
    this.distractions++;
    if (--this.lives === 0 || this.remaining === 0) this.phase = 'late';
  }
  clearHurdle(id: number): boolean {
    if (this.phase !== 'playing' || !Number.isInteger(id) || id < 0 || id >= hurdles.length || this.hit.has(id) || this.cleared.has(id)) return false;
    this.cleared.add(id);
    return true;
  }
  finish(): boolean {
    if (this.phase !== 'playing' || this.remaining === 0) return false;
    this.phase = 'won';
    return true;
  }
}

export const WORLD = { width: 13300, height: 720 };
export const GROOM = { speed: 300, maxSpeed: 430, jump: 650, gravity: 1600, width: 34, height: 56 };
export const START = { x: 110, y: 566 };
export const BRIDE = { x: 13000, y: 590 };
export const SQUASH_BONUS = 5;
export const RING_VALUE = 25;
export const MAX_COMBO = 3;
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
  { kind: 'kebab', name: 'The tube mate', line: 'Missed the tube stop! Come with me!', x: 3920, y: 566, left: 3810, right: 4000, speed: 65 },
];
/** Characters after which a rolling barrel or swooping pigeon gets its own stretch of street. */
const MOVER_AFTER = [1, 3, 4, 5];
const MOVER_GAP = 650;
const CORK_AFTER = [2, 6];
const CORK_GAP = 450;
const extraGap = (after: number): number =>
  (MOVER_AFTER.includes(after) ? MOVER_GAP : 0) + (CORK_AFTER.includes(after) ? CORK_GAP : 0);
export const hurdles = temptations.map((_temptation, id) => ({
  x: 1300 + id * 1250 + temptations.slice(0, id).reduce((total, _t, after) => total + extraGap(after), 0),
  width: 64,
  height: 68 + id % 3 * 10,
}));
export const people = temptations.map((temptation, id) => ({
  x: hurdles[id].x + 550,
  width: 38,
  height: 82,
  temptation,
}));

export type MoverKind = 'barrel' | 'pigeon';
export const MOVER_TRIGGER = 700;
/** `x` is where Sean meets the obstacle; it starts further right and moves left once he is close. */
export const movers = MOVER_AFTER.map((after, id) => {
  const kind: MoverKind = id % 2 ? 'pigeon' : 'barrel';
  return kind === 'barrel'
    ? { kind, x: people[after].x + 700, speed: 160, width: 44, height: 44, y: 588 }
    : { kind, x: people[after].x + 700, speed: 120, width: 40, height: 30, y: 556 };
});
export function moverStart(mover: (typeof movers)[number]): number {
  return mover.x + mover.speed * MOVER_TRIGGER / (mover.speed + runnerSpeed(mover.x));
}

/** Champagne corks launch Sean into the sky, where the wedding rings spin out of normal reach. */
export const corks = [520, ...CORK_AFTER.map(after => people[after].x + 280)].map(x => ({ x, y: 585 }));
export const rings = corks.map(cork => ({ x: cork.x + 215, y: 285 }));

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

export type RunPhase = 'ready' | 'playing' | 'paused' | 'won' | 'late';
export class Run {
  phase: RunPhase = 'ready';
  lives = 3;
  elapsed = 0;
  distractions = 0;
  readonly collected = new Set<number>();
  readonly cleared = new Set<number>();
  readonly hit = new Set<number>();
  readonly hitPeople = new Set<number>();
  readonly squashed = new Set<number>();
  readonly rings = new Set<number>();
  readonly corks = new Set<number>();
  readonly dodged = new Set<number>();
  readonly hitMovers = new Set<number>();
  streak = 0;
  bestStreak = 0;
  comboScore = 0;

  get sweetScore(): number { return [...this.collected].reduce((sum, id) => sum + sweets[id].value, 0); }
  get bonusScore(): number { return this.squashed.size * SQUASH_BONUS; }
  get ringScore(): number { return this.rings.size * RING_VALUE; }
  get score(): number { return this.sweetScore + this.bonusScore + this.ringScore + this.comboScore; }
  get multiplier(): number { return Math.min(MAX_COMBO, 1 + Math.floor(this.streak / 3)); }
  private valid(id: number, length: number): boolean {
    return this.phase === 'playing' && Number.isInteger(id) && id >= 0 && id < length;
  }
  private earn(points: number): void { this.comboScore += points * (this.multiplier - 1); }
  private build(): void {
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
  }
  tick(milliseconds: number): void {
    if (this.phase !== 'playing') return;
    this.elapsed += Math.max(0, milliseconds);
  }
  collect(id: number): boolean {
    if (this.phase !== 'playing' || !Number.isInteger(id) || id < 0 || id >= sweets.length || this.collected.has(id)) return false;
    this.collected.add(id);
    this.earn(sweets[id].value);
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
    this.earn(SQUASH_BONUS);
    this.build();
    return true;
  }
  collectRing(id: number): boolean {
    if (!this.valid(id, rings.length) || this.rings.has(id)) return false;
    this.rings.add(id);
    this.earn(RING_VALUE);
    return true;
  }
  popCork(id: number): boolean {
    if (!this.valid(id, corks.length) || this.corks.has(id)) return false;
    this.corks.add(id);
    return true;
  }
  dodgeMover(id: number): boolean {
    if (!this.valid(id, movers.length) || this.dodged.has(id) || this.hitMovers.has(id)) return false;
    this.dodged.add(id);
    this.build();
    return true;
  }
  hitMover(id: number): boolean {
    if (!this.valid(id, movers.length) || this.dodged.has(id) || this.hitMovers.has(id)) return false;
    this.hitMovers.add(id);
    this.distract();
    return true;
  }
  private distract(): void {
    this.streak = 0;
    this.distractions++;
    if (--this.lives === 0) this.phase = 'late';
  }
  clearHurdle(id: number): boolean {
    if (this.phase !== 'playing' || !Number.isInteger(id) || id < 0 || id >= hurdles.length || this.hit.has(id) || this.cleared.has(id)) return false;
    this.cleared.add(id);
    this.build();
    return true;
  }
  finish(): boolean {
    if (this.phase !== 'playing') return false;
    this.phase = 'won';
    return true;
  }
}

export const MAX_SCORE = (TOTAL_SCORE + SQUASH_BONUS * people.length + RING_VALUE * rings.length) * MAX_COMBO;

export function runTitle(run: Pick<Run, 'phase' | 'squashed' | 'rings' | 'distractions' | 'bestStreak' | 'collected'>): string {
  if (run.squashed.size === people.length) return `Squashed all ${people.length} mates`;
  if (run.phase === 'won' && run.distractions === 0 && run.rings.size === rings.length) return 'Lord of the Rings';
  if (run.phase === 'won' && run.distractions === 0) return 'Flawless groom';
  if (run.rings.size === rings.length) return 'Put a ring on it (three times)';
  if (run.collected.size === sweets.length) return 'Sweet tooth of the year';
  if (run.bestStreak >= 9) return 'Unstoppable combo groom';
  if (run.phase === 'won' && run.squashed.size === 0) return 'Too polite to squash';
  if (run.phase === 'won') return 'Made it down the aisle';
  if (run.squashed.size >= 4) return 'Best man nightmare';
  return 'Still at the pub';
}

/** Becky's texts arrive at these fractions of the route and get steadily more frantic. */
export const beckyTexts = [
  { at: .08, text: 'Where are you?? x' },
  { at: .25, text: 'The photographer is asking where you are' },
  { at: .42, text: 'Sean. Why can I see you on the pub webcam' },
  { at: .58, text: "I'm sending my bridesmaids to find you!!" },
  { at: .74, text: 'WHERE ARE YOU?!?!' },
  { at: .88, text: 'The next service will start in 2mins! RUN! 💍💍💍' },
  { at: .96, text: 'I CAN SEE YOU. RUN FASTER 😭❤️' },
];

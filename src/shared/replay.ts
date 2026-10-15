import { MAX_SCORE, MAX_SWEET_SCORE, MIN_SWEET_SCORE, WORLD, sweets } from './level.ts';

export const REPLAY_VERSION = 1;
export const REPLAY_INTERVAL = 50;
export const MAX_REPLAY_DURATION = 180_000;
export const MAX_REPLAY_BYTES = 1_000_000;
// Time, position, HUD, flags, collection masks, and the four moving obstacle positions.
export type ReplayFrame = [
  number, number, number, number, number, number, number,
  number, number, number, number, number, number, number, number,
  number, number, number, number,
];
export interface Replay {
  version: 1;
  dice: number[];
  won: boolean;
  frames: ReplayFrame[];
}

export function replayMask(ids: ReadonlySet<number>): number {
  let mask = 0;
  for (const id of ids) mask |= 1 << id;
  return mask;
}

export function isReplay(value: unknown): value is Replay {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<Replay>;
  if (Object.keys(input).some(key => !['version', 'dice', 'won', 'frames'].includes(key)) ||
    input.version !== REPLAY_VERSION || typeof input.won !== 'boolean' ||
    !Array.isArray(input.dice) || input.dice.length !== sweets.length ||
    !input.dice.every(face => Number.isInteger(face) && face >= 1 && face <= 6)) return false;
  const total = input.dice.reduce((sum, face) => sum + face, 0);
  if (total < MIN_SWEET_SCORE || total > MAX_SWEET_SCORE || !Array.isArray(input.frames) ||
    input.frames.length < 2 || input.frames.length > MAX_REPLAY_DURATION / REPLAY_INTERVAL + 2) return false;
  let previousTime = -1;
  let previousScore = 0;
  for (const frame of input.frames) {
    if (!Array.isArray(frame) || frame.length !== 19 || !frame.every(Number.isFinite)) return false;
    const [time, x, y, score, lives, combo, flags] = frame;
    if (!Number.isInteger(time) || time <= previousTime || time > MAX_REPLAY_DURATION ||
      x < 0 || x > WORLD.width || y < -1000 || y > WORLD.height + 1000 ||
      !Number.isInteger(score) || score < previousScore || score > MAX_SCORE ||
      !Number.isInteger(lives) || lives < 0 || lives > 3 ||
      !Number.isInteger(combo) || combo < 1 || combo > 3 ||
      !Number.isInteger(flags) || flags < 0 || flags > 31) return false;
    const maskSizes = [sweets.length, 7, 7, 7, 7, 3, 3, 2];
    for (let i = 0; i < maskSizes.length; i++) {
      if (!Number.isInteger(frame[i + 7]) || frame[i + 7] < 0 || frame[i + 7] >= 2 ** maskSizes[i]) return false;
    }
    if (frame.slice(15).some(position => position < -WORLD.width || position > WORLD.width * 2)) return false;
    previousTime = time;
    previousScore = score;
  }
  return input.frames[0][0] === 0;
}

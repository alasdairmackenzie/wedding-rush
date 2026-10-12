import { temptations } from './level.ts';

export const FACE_KINDS = ['bride', ...temptations.map(temptation => temptation.kind)] as const;
export type FaceKind = typeof FACE_KINDS[number];
export const FACE_LABELS: Record<FaceKind, string> = {
  bride: 'Becky',
  ...Object.fromEntries(temptations.map(temptation => [temptation.kind, temptation.name])) as Record<Exclude<FaceKind, 'bride'>, string>,
};
export const MAX_FACE_BYTES = 400 * 1024;
export const isFaceKind = (kind: string): kind is FaceKind => (FACE_KINDS as readonly string[]).includes(kind);

/** Identifies an image from its first bytes so uploads can't claim the wrong type. */
export function imageType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | undefined {
  const ascii = (start: number, end: number): string => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length > 8 && bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return undefined;
}

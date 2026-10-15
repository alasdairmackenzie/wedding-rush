import { MAX_SCORE, people } from './level.ts';

export interface ScoreEntry {
  id: string;
  name: string;
  score: number;
  squashed: number;
  won: boolean;
  at: string;
}
export interface ScoreSubmission {
  name: string;
  score: number;
  squashed: number;
  won: boolean;
}
export interface RankedEntry extends ScoreEntry {
  rank: number;
}
export const NAME_MAX = 16;
export const ENTRY_ID = /^[a-z0-9]{12}$/;
export const TOP_LIST_PATH = '/top';
export function topListUrl(origin: string, id: string): string {
  return `${origin}${TOP_LIST_PATH}?you=${encodeURIComponent(id)}`;
}
export const LEADERBOARD_SIZE = 10;
export const FULL_RESULTS_SIZE = 50;

const BLOCKED = ['fuck', 'shit', 'cunt', 'bitch', 'wank', 'twat', 'nigg', 'retard', 'whore', 'slut', 'porn', 'jizz',
  'bellend', 'asshole', 'pussy', 'penis', 'vagina', 'hitler', 'dickhead', 'cockhead', 'motherf'];
const BLOCKED_WORDS = new Set(['dick', 'dicks', 'cock', 'cocks', 'fag', 'fags', 'paki', 'rape', 'sex', 'cum', 'arse', 'tit', 'tits',
  'boob', 'boobs', 'knob', 'prick', 'minge', 'shag', 'bastard', 'spastic', 'spaz', 'bollocks', 'nazi', 'poo', 'piss']);
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i' };
const squeeze = (text: string): string => text.replace(/(.)\1+/g, '$1');

export function isRude(name: string): boolean {
  const words = name.toLowerCase().replace(/[0-9@$!]/g, char => LEET[char] ?? char).split(/[^a-z]+/).filter(Boolean);
  const flat = words.join('');
  if (BLOCKED.some(word => flat.includes(word) || squeeze(flat).includes(squeeze(word)))) return true;
  return words.some(word => BLOCKED_WORDS.has(word) || BLOCKED_WORDS.has(squeeze(word)));
}

export function cleanName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > NAME_MAX) return undefined;
  if (!/^[\p{L}\p{N} '._!-]+$/u.test(name)) return undefined;
  return name;
}

export function validateSubmission(body: unknown): { ok: true; value: ScoreSubmission } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Send a name and a score.' };
  const input = body as Record<string, unknown>;
  const name = cleanName(input.name);
  if (!name) return { ok: false, error: `Names need 1 to ${NAME_MAX} letters, numbers or spaces.` };
  if (isRude(name)) return { ok: false, error: "Keep it clean, it's a wedding! Try another name." };
  const { score, squashed, won } = input;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    return { ok: false, error: 'That score does not look right.' };
  }
  if (typeof squashed !== 'number' || !Number.isInteger(squashed) || squashed < 0 || squashed > people.length) {
    return { ok: false, error: 'That squash count does not look right.' };
  }
  if (typeof won !== 'boolean') return { ok: false, error: 'Missing the run result.' };
  return { ok: true, value: { name, score, squashed, won } };
}

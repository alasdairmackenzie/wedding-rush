import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { LEADERBOARD_SIZE, type RankedEntry, type ScoreEntry, type ScoreSubmission } from '../shared/leaderboard.ts';

export interface ScoreStore {
  top(limit?: number): Promise<ScoreEntry[]>;
  add(entry: ScoreSubmission): Promise<RankedEntry>;
  find(id: string): Promise<RankedEntry | undefined>;
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function newEntryId(): string {
  return Array.from(randomBytes(12), byte => ALPHABET[byte % ALPHABET.length]).join('');
}

const rank = (a: ScoreEntry, b: ScoreEntry): number => b.score - a.score || b.squashed - a.squashed || a.at.localeCompare(b.at);

export function memoryStore(): ScoreStore {
  const entries: ScoreEntry[] = [];
  const ranked = (id: string): RankedEntry | undefined => {
    const index = entries.findIndex(entry => entry.id === id);
    return index < 0 ? undefined : { ...entries[index], rank: index + 1 };
  };
  return {
    async top(limit = LEADERBOARD_SIZE) {
      return entries.slice(0, limit);
    },
    async add(submission) {
      const entry = { id: newEntryId(), ...submission, at: new Date().toISOString() };
      entries.push(entry);
      entries.sort(rank);
      entries.length = Math.min(entries.length, 500);
      return ranked(entry.id) ?? { ...entry, rank: entries.length + 1 };
    },
    async find(id) {
      return ranked(id);
    },
  };
}

interface ScoreRow { public_id: string; name: string; score: number; squashed: number; won: boolean; created_at: Date; rank?: string }
const toEntry = (row: ScoreRow): ScoreEntry => ({
  id: row.public_id, name: row.name, score: row.score, squashed: row.squashed, won: row.won, at: row.created_at.toISOString(),
});
const COLUMNS = 'public_id, name, score, squashed, won, created_at';
const RANK = `(SELECT count(*) + 1 FROM scores better
  WHERE better.score > s.score
     OR (better.score = s.score AND better.squashed > s.squashed)
     OR (better.score = s.score AND better.squashed = s.squashed AND better.created_at < s.created_at)) AS rank`;

export async function postgresStore(connectionString: string): Promise<ScoreStore> {
  const { default: pg } = await import('pg');
  const internal = /localhost|127\.0\.0\.1|\.railway\.internal/.test(connectionString);
  const pool: Pool = new pg.Pool({ connectionString, max: 5, ssl: internal ? undefined : { rejectUnauthorized: false } });
  await pool.query(`CREATE TABLE IF NOT EXISTS scores (
    id SERIAL PRIMARY KEY,
    public_id VARCHAR(12) UNIQUE,
    name VARCHAR(16) NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0),
    squashed SMALLINT NOT NULL CHECK (squashed >= 0),
    won BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query('ALTER TABLE scores ADD COLUMN IF NOT EXISTS public_id VARCHAR(12) UNIQUE');
  await pool.query('CREATE INDEX IF NOT EXISTS scores_rank ON scores (score DESC, squashed DESC, created_at ASC)');
  const find = async (id: string): Promise<RankedEntry | undefined> => {
    const { rows } = await pool.query<ScoreRow>(`SELECT ${COLUMNS}, ${RANK} FROM scores s WHERE public_id = $1`, [id]);
    return rows[0] && { ...toEntry(rows[0]), rank: Number(rows[0].rank) };
  };
  return {
    async top(limit = LEADERBOARD_SIZE) {
      const { rows } = await pool.query<ScoreRow>(
        `SELECT ${COLUMNS} FROM scores WHERE public_id IS NOT NULL ORDER BY score DESC, squashed DESC, created_at ASC LIMIT $1`,
        [limit],
      );
      return rows.map(toEntry);
    },
    async add({ name, score, squashed, won }) {
      const id = newEntryId();
      await pool.query(
        'INSERT INTO scores (public_id, name, score, squashed, won) VALUES ($1, $2, $3, $4, $5)',
        [id, name, score, squashed, won],
      );
      const entry = await find(id);
      if (!entry) throw new Error('Saved score could not be read back.');
      return entry;
    },
    find,
  };
}

export async function createStore(): Promise<ScoreStore> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('DATABASE_URL is not set. Using an in-memory leaderboard that resets on restart.');
    return memoryStore();
  }
  return postgresStore(url);
}

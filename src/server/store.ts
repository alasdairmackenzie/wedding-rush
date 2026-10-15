import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { LEADERBOARD_SIZE, type RankedEntry, type ScoreEntry, type ScoreSubmission } from '../shared/leaderboard.ts';
import { ANALYTICS_RETENTION_DAYS, type AnalyticsEvent, type AnalyticsReport, type StoredEvent } from '../shared/analytics.ts';
import { summarize } from './analytics.ts';
import { ACTIVE_WINDOW_MS } from '../shared/presence.ts';

export interface Face { mime: string; data: Buffer; version: number }
export interface ScoreStore {
  top(limit?: number): Promise<ScoreEntry[]>;
  add(entry: ScoreSubmission, analytics?: AnalyticsEvent): Promise<RankedEntry>;
  track(events: AnalyticsEvent[]): Promise<void>;
  analytics(days: number): Promise<AnalyticsReport>;
  recordPresence(visitor: string): Promise<void>;
  activeUsers(): Promise<number>;
  find(id: string): Promise<RankedEntry | undefined>;
  rename(id: string, name: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  faces(): Promise<Record<string, number>>;
  face(kind: string): Promise<Face | undefined>;
  saveFace(kind: string, mime: string, data: Buffer): Promise<number>;
  removeFace(kind: string): Promise<boolean>;
}
export const ADMIN_LIST_SIZE = 500;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function newEntryId(): string {
  return Array.from(randomBytes(12), byte => ALPHABET[byte % ALPHABET.length]).join('');
}

const rank = (a: ScoreEntry, b: ScoreEntry): number => b.score - a.score || b.squashed - a.squashed || a.at.localeCompare(b.at);

export function memoryStore(): ScoreStore {
  const entries: ScoreEntry[] = [];
  const faces = new Map<string, Face>();
  const events = new Map<string, StoredEvent>();
  const presence = new Map<string, number>();
  const prunePresence = () => {
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    for (const [visitor, at] of presence) if (at <= cutoff) presence.delete(visitor);
  };
  const prune = () => {
    const cutoff = Date.now() - ANALYTICS_RETENTION_DAYS * 86400_000;
    for (const [id, event] of events) if (Date.parse(event.at) < cutoff) events.delete(id);
  };
  const ranked = (id: string): RankedEntry | undefined => {
    const index = entries.findIndex(entry => entry.id === id);
    return index < 0 ? undefined : { ...entries[index], rank: index + 1 };
  };
  return {
    async recordPresence(visitor) {
      prunePresence();
      presence.set(visitor, Date.now());
    },
    async activeUsers() {
      prunePresence();
      return presence.size;
    },
    async top(limit = LEADERBOARD_SIZE) {
      return entries.slice(0, limit);
    },
    async track(batch) {
      prune();
      for (const event of batch) if (!events.has(event.id)) events.set(event.id, { ...event, at: new Date().toISOString() });
    },
    async analytics(days) {
      prune();
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      return summarize([...events.values()].filter(e => e.at >= since), days, since);
    },
    async add(submission, analytics) {
      const entry = { id: newEntryId(), ...submission, at: new Date().toISOString() };
      entries.push(entry);
      entries.sort(rank);
      entries.length = Math.min(entries.length, 500);
      if (analytics) {
        prune();
        if (!events.has(analytics.id)) events.set(analytics.id, { ...analytics, at: new Date().toISOString() });
      }
      return ranked(entry.id) ?? { ...entry, rank: entries.length + 1 };
    },
    async find(id) {
      return ranked(id);
    },
    async rename(id, name) {
      const entry = entries.find(item => item.id === id);
      if (entry) entry.name = name;
      return Boolean(entry);
    },
    async remove(id) {
      const index = entries.findIndex(entry => entry.id === id);
      if (index >= 0) entries.splice(index, 1);
      return index >= 0;
    },
    async faces() {
      return Object.fromEntries([...faces].map(([kind, face]) => [kind, face.version]));
    },
    async face(kind) {
      return faces.get(kind);
    },
    async saveFace(kind, mime, data) {
      const version = Date.now();
      faces.set(kind, { mime, data, version });
      return version;
    },
    async removeFace(kind) {
      return faces.delete(kind);
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
  await pool.query(`CREATE TABLE IF NOT EXISTS faces (
    kind VARCHAR(16) PRIMARY KEY,
    mime VARCHAR(32) NOT NULL,
    data BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY,
    visitor UUID NOT NULL,
    session UUID NOT NULL,
    run UUID,
    name VARCHAR(32) NOT NULL,
    target VARCHAR(40) NOT NULL,
    page VARCHAR(8) NOT NULL,
    device VARCHAR(8) NOT NULL,
    source VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS analytics_events_time ON analytics_events (created_at)');
  await pool.query(`CREATE TABLE IF NOT EXISTS game_presence (
    visitor UUID PRIMARY KEY,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS game_presence_time ON game_presence (last_seen)');
  const insertEvents = async (batch: AnalyticsEvent[], query: Pool['query']) => {
    await query(`INSERT INTO analytics_events (id, visitor, session, run, name, target, page, device, source)
      SELECT id, visitor, session, run, name, target, page, device, source
      FROM jsonb_to_recordset($1::jsonb) AS e(id UUID, visitor UUID, session UUID, run UUID,
        name TEXT, target TEXT, page TEXT, device TEXT, source TEXT)
      ON CONFLICT (id) DO NOTHING`, [JSON.stringify(batch)]);
  };
  let lastPrune = 0;
  const prune = async () => {
    if (Date.now() - lastPrune < 3600_000) return;
    await pool.query("DELETE FROM analytics_events WHERE created_at < now() - interval '90 days'");
    await pool.query("DELETE FROM game_presence WHERE last_seen <= now() - $1::int * interval '1 millisecond'", [ACTIVE_WINDOW_MS]);
    lastPrune = Date.now();
  };
  await prune();
  const find = async (id: string): Promise<RankedEntry | undefined> => {
    const { rows } = await pool.query<ScoreRow>(`SELECT ${COLUMNS}, ${RANK} FROM scores s WHERE public_id = $1`, [id]);
    return rows[0] && { ...toEntry(rows[0]), rank: Number(rows[0].rank) };
  };
  return {
    async recordPresence(visitor) {
      await prune();
      await pool.query(`INSERT INTO game_presence (visitor, last_seen) VALUES ($1, now())
        ON CONFLICT (visitor) DO UPDATE SET last_seen = EXCLUDED.last_seen`, [visitor]);
    },
    async activeUsers() {
      await prune();
      const { rows } = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM game_presence WHERE last_seen > now() - $1::int * interval '1 millisecond'",
        [ACTIVE_WINDOW_MS],
      );
      return rows[0].count;
    },
    async track(batch) {
      await prune();
      await insertEvents(batch, pool.query.bind(pool));
    },
    async analytics(days) {
      await prune();
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { rows } = await pool.query<{ report: AnalyticsReport }>(`
        WITH filtered AS (
          SELECT *, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
          FROM analytics_events WHERE created_at >= $1::timestamptz
        ), grouped AS (
          SELECT name, target, day, device, source, grouping(name, day, device, source) AS kind,
            count(*)::int AS count, count(DISTINCT visitor)::int AS visitors,
            count(DISTINCT session)::int AS sessions,
            count(DISTINCT (visitor, run)) FILTER (WHERE run IS NOT NULL)::int AS runs
          FROM filtered GROUP BY GROUPING SETS ((), (name, target), (day), (device), (source))
        ), device_games AS (
          SELECT device,
            count(DISTINCT (visitor, run)) FILTER (WHERE name = 'game_start')::int AS games,
            count(DISTINCT visitor) FILTER (WHERE name = 'game_start')::int AS gamers
          FROM filtered GROUP BY device
        ), runs AS (
          SELECT visitor, run, bool_or(name = 'game_start') AS started,
            bool_or(name = 'game_won') AS won, bool_or(name = 'game_lost') AS lost,
            bool_or(name = 'score_saved') AS submitted,
            bool_or(name = 'screen_view' AND target = 'pause') AS menu,
            bool_or(name = 'game_resume') AS resumed,
            bool_or(name = 'score_attempt') AS attempted
          FROM filtered WHERE run IS NOT NULL GROUP BY visitor, run
        ), sessions AS (
          SELECT visitor, session,
            bool_or(name = 'page_view' AND page = 'game' AND target = 'game') AS opened,
            bool_or(name = 'game_start') AS played
          FROM filtered GROUP BY visitor, session
        ), hours AS (
          SELECT generate_series(
            date_trunc('hour', $3::timestamptz AT TIME ZONE 'UTC') - interval '11 hours',
            date_trunc('hour', $3::timestamptz AT TIME ZONE 'UTC'), interval '1 hour') AS hour
        ), hourly_players AS (
          SELECT hours.hour, count(DISTINCT filtered.visitor)::int AS devices
          FROM hours LEFT JOIN filtered ON filtered.name = 'game_start' AND filtered.page = 'game'
            AND filtered.created_at AT TIME ZONE 'UTC' >= hours.hour
            AND filtered.created_at AT TIME ZONE 'UTC' < hours.hour + interval '1 hour'
          GROUP BY hours.hour
        )
        SELECT jsonb_build_object(
          'days', $2::int, 'since', $1::text, 'storage', 'postgres',
          'totals', (SELECT jsonb_build_object('label', 'All activity', 'count', count, 'visitors', visitors, 'sessions', sessions) FROM grouped WHERE kind = 15),
          'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', target, 'name', name, 'target', target, 'count', count, 'visitors', visitors, 'sessions', sessions, 'runs', runs) ORDER BY name, target) FROM grouped WHERE kind = 7), '[]'::jsonb),
          'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', day, 'count', count, 'visitors', visitors, 'sessions', sessions) ORDER BY day) FROM grouped WHERE kind = 11), '[]'::jsonb),
          'hourlyPlayers', (SELECT jsonb_agg(jsonb_build_object(
            'hour', to_char(hour, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'devices', devices) ORDER BY hour) FROM hourly_players),
          'devices', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'label', grouped.device, 'count', grouped.count, 'visitors', grouped.visitors, 'sessions', grouped.sessions,
            'games', COALESCE(device_games.games, 0), 'gamers', COALESCE(device_games.gamers, 0),
            'averageGamesPerGamer', CASE WHEN COALESCE(device_games.gamers, 0) > 0
              THEN device_games.games::numeric / device_games.gamers ELSE 0 END
          ) ORDER BY grouped.count DESC)
            FROM grouped LEFT JOIN device_games ON device_games.device = grouped.device
            WHERE grouped.kind = 13), '[]'::jsonb),
          'sources', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', source, 'count', count, 'visitors', visitors, 'sessions', sessions) ORDER BY count DESC) FROM grouped WHERE kind = 14), '[]'::jsonb),
          'flow', jsonb_build_object(
            'openedSessions', (SELECT count(*) FROM sessions WHERE opened),
            'playedSessions', (SELECT count(*) FROM sessions WHERE opened AND played),
            'menuRuns', (SELECT count(*) FROM runs WHERE started AND menu),
            'resumedRuns', (SELECT count(*) FROM runs WHERE started AND menu AND resumed),
            'attemptedRuns', (SELECT count(*) FROM runs WHERE started AND attempted)),
          'funnel', (SELECT jsonb_build_object(
            'started', count(*) FILTER (WHERE started),
            'won', count(*) FILTER (WHERE started AND won),
            'lost', count(*) FILTER (WHERE started AND lost),
            'submitted', count(*) FILTER (WHERE started AND submitted),
            'wonSubmitted', count(*) FILTER (WHERE started AND won AND submitted),
            'lostSubmitted', count(*) FILTER (WHERE started AND lost AND submitted),
            'unfinished', count(*) FILTER (WHERE started AND NOT won AND NOT lost)) FROM runs)
        ) AS report`, [since, days, new Date().toISOString()]);
      return rows[0].report;
    },
    async top(limit = LEADERBOARD_SIZE) {
      const { rows } = await pool.query<ScoreRow>(
        `SELECT ${COLUMNS} FROM scores WHERE public_id IS NOT NULL ORDER BY score DESC, squashed DESC, created_at ASC LIMIT $1`,
        [limit],
      );
      return rows.map(toEntry);
    },
    async add({ name, score, squashed, won }, analytics) {
      const id = newEntryId();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'INSERT INTO scores (public_id, name, score, squashed, won) VALUES ($1, $2, $3, $4, $5)',
          [id, name, score, squashed, won],
        );
        if (analytics) await insertEvents([analytics], client.query.bind(client));
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      const entry = await find(id);
      if (!entry) throw new Error('Saved score could not be read back.');
      return entry;
    },
    find,
    async rename(id, name) {
      const { rowCount } = await pool.query('UPDATE scores SET name = $2 WHERE public_id = $1', [id, name]);
      return Boolean(rowCount);
    },
    async remove(id) {
      const { rowCount } = await pool.query('DELETE FROM scores WHERE public_id = $1', [id]);
      return Boolean(rowCount);
    },
    async faces() {
      const { rows } = await pool.query<{ kind: string; updated_at: Date }>('SELECT kind, updated_at FROM faces');
      return Object.fromEntries(rows.map(row => [row.kind, row.updated_at.getTime()]));
    },
    async face(kind) {
      const { rows } = await pool.query<{ mime: string; data: Buffer; updated_at: Date }>(
        'SELECT mime, data, updated_at FROM faces WHERE kind = $1', [kind]);
      return rows[0] && { mime: rows[0].mime, data: rows[0].data, version: rows[0].updated_at.getTime() };
    },
    async saveFace(kind, mime, data) {
      const { rows } = await pool.query<{ updated_at: Date }>(
        `INSERT INTO faces (kind, mime, data) VALUES ($1, $2, $3)
         ON CONFLICT (kind) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = now()
         RETURNING updated_at`, [kind, mime, data]);
      return rows[0].updated_at.getTime();
    },
    async removeFace(kind) {
      const { rowCount } = await pool.query('DELETE FROM faces WHERE kind = $1', [kind]);
      return Boolean(rowCount);
    },
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

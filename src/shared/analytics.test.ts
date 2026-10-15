import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { analyticsBatch, isAnalyticsEvent, type AnalyticsEvent, type AnalyticsReport } from './analytics';
import { memoryStore } from '../server/store';
import { createApi } from '../server/api';

const visitor = randomUUID();
const session = randomUUID();
const run = randomUUID();
const event = (name: AnalyticsEvent['name'], target: AnalyticsEvent['target'] = 'game', extras: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({
  id: randomUUID(), visitor, session, run, name, target, page: 'game', device: 'desktop', source: 'direct', ...extras,
});

describe('analytics validation and aggregation', () => {
  it('accepts a bounded allowlisted batch without arbitrary personal data', () => {
    expect(analyticsBatch({ events: [event('game_start')] })).toHaveLength(1);
    for (const invalid of [
      { events: [] }, { events: Array.from({ length: 26 }, () => event('page_view')) },
      { events: [{ ...event('action'), ip: '1.2.3.4' }] },
      { events: [{ ...event('action'), name: 'player name' }] },
      { events: [{ ...event('action'), target: 'free form text' }] },
      { events: [{ ...event('action'), visitor: 'not-a-uuid' }] },
      { events: [{ ...event('game_won'), run: undefined }] },
      { events: [event('score_saved', 'submit-score')] },
    ]) expect(analyticsBatch(invalid)).toBeUndefined();
    expect(isAnalyticsEvent(event('score_saved', 'submit-score'))).toBe(true);
  });

  it('deduplicates retries, correlates distinct runs, and counts unique browsers and sessions', async () => {
    const store = memoryStore();
    const start = event('game_start');
    const secondRun = randomUUID();
    const secondVisitor = randomUUID();
    await store.track([
      start, start, event('game_won'), event('screen_view', 'result_won'),
      event('game_start', 'game', { run: secondRun }), event('game_lost', 'result_lost', { run: secondRun }),
      event('game_start', 'game', { run: randomUUID(), visitor: secondVisitor, session: randomUUID() }),
    ]);
    await store.add({ name: 'Guest', score: 10, squashed: 0, won: true }, event('score_saved', 'submit-score'));
    const report = await store.analytics(7);
    expect(report.totals).toMatchObject({ count: 7, visitors: 2, sessions: 2 });
    expect(report.funnel).toEqual({ started: 3, won: 1, lost: 1, submitted: 1, wonSubmitted: 1, lostSubmitted: 0, unfinished: 1 });
    expect(report.events.find(e => e.name === 'game_start')).toMatchObject({ count: 3, visitors: 2, runs: 3 });
    expect(report.daily).toHaveLength(1);
    expect(report.devices[0].label).toBe('desktop');
    expect(report.sources[0].label).toBe('direct');
    expect(JSON.stringify(report)).not.toContain(visitor);
    expect(JSON.stringify(report)).not.toContain('Guest');
  });

  it('averages game starts per gamer browser for each input device', async () => {
    const store = memoryStore();
    const desktopRun = randomUUID();
    const otherDesktopRun = randomUUID();
    const touchVisitor = randomUUID();
    const touchRun = randomUUID();
    const touchEvent = (runId: string) => event('game_start', 'game', {
      visitor: touchVisitor, session: randomUUID(), run: runId, device: 'touch',
    });
    await store.track([
      event('game_start'),
      event('game_start', 'game', { run: desktopRun }),
      event('game_start', 'game', { run: otherDesktopRun, visitor: randomUUID(), session: randomUUID() }),
      touchEvent(touchRun),
    ]);

    const report = await store.analytics(7);
    expect(report.devices.find(device => device.label === 'desktop')).toMatchObject({
      games: 3, gamers: 2, averageGamesPerGamer: 1.5,
    });
    expect(report.devices.find(device => device.label === 'touch')).toMatchObject({
      games: 1, gamers: 1, averageGamesPerGamer: 1,
    });
  });

  it('correlates journey sessions and run stages without counting repeated menu visits or orphan outcomes', async () => {
    const store = memoryStore();
    const losingRun = randomUUID();
    const unfinishedRun = randomUUID();
    await store.track([
      event('page_view', 'game', { run: undefined }),
      event('page_view', 'game', { run: undefined }),
      event('game_start'),
      event('screen_view', 'pause'),
      event('screen_view', 'pause'),
      event('game_resume', 'play'),
      event('game_won'),
      event('score_attempt', 'submit-score'),
      event('score_attempt', 'submit-score'),
      event('game_start', 'game', { run: losingRun }),
      event('game_lost', 'result_lost', { run: losingRun }),
      event('game_start', 'game', { run: unfinishedRun }),
      event('screen_view', 'pause', { run: unfinishedRun }),
      event('page_view', 'game', { run: undefined, session: randomUUID() }),
      event('page_view', 'live', { run: undefined, session: randomUUID(), page: 'live' }),
      event('game_won', 'result_won', { run: randomUUID() }),
    ]);
    await store.add({ name: 'Guest', score: 10, squashed: 0, won: true }, event('score_saved', 'submit-score'));
    await store.add({ name: 'Guest', score: 5, squashed: 0, won: false },
      event('score_saved', 'submit-score', { run: losingRun }));
    const report = await store.analytics(7);
    expect(report.flow).toEqual({
      openedSessions: 2, playedSessions: 1, menuRuns: 2, resumedRuns: 1, attemptedRuns: 1,
    });
    expect(report.funnel).toMatchObject({
      started: 3, won: 1, lost: 1, unfinished: 1, wonSubmitted: 1, lostSubmitted: 1, submitted: 2,
    });
    expect((await memoryStore().analytics(7)).flow).toEqual({
      openedSessions: 0, playedSessions: 0, menuRuns: 0, resumedRuns: 0, attemptedRuns: 0,
    });
  });

  it('returns twelve UTC hourly browser counts, deduplicating plays and filling empty hours across midnight', async () => {
    vi.useFakeTimers();
    try {
      const store = memoryStore();
      vi.setSystemTime(new Date('2026-10-14T13:59:59Z'));
      await store.track([event('game_start')]);
      vi.setSystemTime(new Date('2026-10-14T14:00:00Z'));
      await store.track([event('game_start')]);
      vi.setSystemTime(new Date('2026-10-15T00:59:59Z'));
      await store.track([
        event('game_start'), event('game_start', 'game', { run: randomUUID(), session: randomUUID() }),
        event('game_start', 'game', { visitor: randomUUID() }),
        event('page_view', 'game', { visitor: randomUUID(), run: undefined }),
        event('page_view', 'live', { visitor: randomUUID(), run: undefined, page: 'live' }),
      ]);
      vi.setSystemTime(new Date('2026-10-15T01:00:00Z'));
      await store.track([event('game_start')]);
      vi.setSystemTime(new Date('2026-10-15T01:30:00Z'));
      const report = await store.analytics(1);
      expect(report.hourlyPlayers).toHaveLength(12);
      expect(report.hourlyPlayers[0]).toEqual({ hour: '2026-10-14T14:00:00.000Z', devices: 1 });
      expect(report.hourlyPlayers[1]).toEqual({ hour: '2026-10-14T15:00:00.000Z', devices: 0 });
      expect(report.hourlyPlayers[10]).toEqual({ hour: '2026-10-15T00:00:00.000Z', devices: 2 });
      expect(report.hourlyPlayers[11]).toEqual({ hour: '2026-10-15T01:00:00.000Z', devices: 1 });
      expect((await store.analytics(30)).hourlyPlayers).toEqual(report.hourlyPlayers);
      expect((await memoryStore().analytics(7)).hourlyPlayers).toHaveLength(12);
      expect((await memoryStore().analytics(7)).hourlyPlayers.every(row => row.devices === 0)).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('filters by server receipt time and removes events older than 90 days', async () => {
    vi.useFakeTimers();
    try {
      const store = memoryStore();
      vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
      await store.track([event('page_view')]);
      vi.setSystemTime(new Date('2026-01-10T12:00:00Z'));
      await store.track([event('page_view', 'live')]);
      expect((await store.analytics(7)).totals.count).toBe(1);
      expect((await store.analytics(30)).totals.count).toBe(2);
      vi.setSystemTime(new Date('2026-04-05T12:00:00Z'));
      expect((await store.analytics(90)).totals.count).toBe(1);
    } finally { vi.useRealTimers(); }
  });
});

describe('analytics API', () => {
  let server: Server;
  let base: string;
  const auth = { Authorization: 'Bearer analytics-test' };
  beforeAll(async () => {
    const store = memoryStore();
    const api = createApi(async () => store, { adminToken: 'analytics-test' });
    server = createServer(async (req, res) => { if (!await api(req, res)) res.writeHead(404).end(); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
  const post = (body: unknown, headers = {}) => fetch(`${base}/api/analytics`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });

  it('requires admin authentication and a bounded reporting period', async () => {
    expect((await fetch(`${base}/api/admin/analytics`)).status).toBe(401);
    expect((await fetch(`${base}/api/admin/analytics?days=365`, { headers: auth })).status).toBe(400);
    expect((await fetch(`${base}/api/admin/analytics?days=7`, { headers: auth })).status).toBe(200);
  });
  it('rejects malformed, cross-site, oversized and forged conversion events', async () => {
    expect((await post({ events: [event('action')] }, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await post({ events: [event('score_saved', 'submit-score')] })).status).toBe(400);
    expect((await post({ events: [{ ...event('action'), name: 'bad' }] })).status).toBe(400);
    expect((await post({ padding: 'x'.repeat(17_000) })).status).toBe(413);
    expect((await fetch(`${base}/api/analytics`)).status).toBe(405);
    expect((await fetch(`${base}/api/analytics`, { method: 'POST', body: '{}' })).status).toBe(415);
  });
  it('records score conversions only after a valid score is saved, and does not count retry batches twice', async () => {
    const start = event('game_start');
    const won = event('game_won', 'result_won');
    expect((await post({ events: [start, won] })).status).toBe(202);
    expect((await post({ events: [start, won] })).status).toBe(202);
    const analytics = event('score_saved', 'submit-score');
    const submission = { name: 'Guest', score: 20, squashed: 0, won: true, analytics };
    const scorePost = (body: unknown) => fetch(`${base}/api/scores`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    expect((await scorePost({ ...submission, score: -1 })).status).toBe(400);
    expect((await scorePost({ ...submission, analytics: { ...analytics, ip: '1.2.3.4' } })).status).toBe(400);
    expect((await scorePost(submission)).status).toBe(201);
    const report = await (await fetch(`${base}/api/admin/analytics?days=7`, { headers: auth })).json() as AnalyticsReport;
    expect(report.funnel).toMatchObject({ started: 1, won: 1, wonSubmitted: 1, submitted: 1 });
    expect(report.events.find(e => e.name === 'score_saved')?.count).toBe(1);
  });
  it('rate-limits ingestion separately from score posts', async () => {
    const headers = { 'X-Forwarded-For': 'analytics-rate-test' };
    for (let i = 0; i < 300; i++) expect((await post({ events: [event('page_view')] }, headers)).status).toBe(202);
    expect((await post({ events: [event('page_view')] }, headers)).status).toBe(429);
  });
});

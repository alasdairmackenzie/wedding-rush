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

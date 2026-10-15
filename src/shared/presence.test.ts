import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ACTIVE_WINDOW_MS } from './presence';
import { memoryStore } from '../server/store';
import { createApi } from '../server/api';

it('counts unique browsers and expires presence at exactly fifteen minutes since the latest heartbeat', async () => {
  vi.useFakeTimers();
  try {
    const start = Date.now();
    const store = memoryStore();
    const visitor = randomUUID();
    expect(ACTIVE_WINDOW_MS).toBe(15 * 60_000);
    expect(await store.activeUsers()).toBe(0);
    await store.recordPresence(visitor);
    await store.recordPresence(visitor);
    await store.recordPresence(randomUUID());
    expect(await store.activeUsers()).toBe(2);
    vi.setSystemTime(start + 60_000);
    await store.recordPresence(visitor);
    vi.setSystemTime(start + ACTIVE_WINDOW_MS - 1);
    expect(await store.activeUsers()).toBe(2);
    vi.setSystemTime(start + ACTIVE_WINDOW_MS);
    expect(await store.activeUsers()).toBe(1);
    vi.setSystemTime(start + ACTIVE_WINDOW_MS + 60_000);
    expect(await store.activeUsers()).toBe(0);
    expect((await store.analytics(1)).totals.count).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

describe('public presence API', () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const store = memoryStore();
    const api = createApi(async () => store);
    server = createServer(async (req, res) => { if (!await api(req, res)) res.writeHead(404).end(); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/presence`;
  });
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
  const post = (body: unknown, headers = {}) => fetch(base, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  it('accepts heartbeats but publicly returns only the count and window', async () => {
    const visitor = randomUUID();
    expect((await post({ visitor })).status).toBe(202);
    expect((await post({ visitor })).status).toBe(202);
    const response = await fetch(base);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ activeUsers: 1, windowMinutes: 15 });
  });
  it('rejects malformed, cross-site, oversized and unsupported requests', async () => {
    expect((await post({ visitor: 'invalid' })).status).toBe(400);
    expect((await post({ visitor: randomUUID(), name: 'Guest' })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
    expect((await post({ visitor: randomUUID() }, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await post({ visitor: 'x'.repeat(1025) })).status).toBe(413);
    expect((await fetch(base, { method: 'DELETE' })).status).toBe(405);
    expect((await fetch(base, { method: 'POST', body: '{}' })).status).toBe(415);
  });
});

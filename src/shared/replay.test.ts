import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi, lazyStore } from '../server/api';
import { memoryStore } from '../server/store';
import { Run } from './level';
import { isReplay, MAX_REPLAY_BYTES, MAX_REPLAY_DURATION, replayMask, type Replay, type ReplayFrame } from './replay';

const frame = (time: number): ReplayFrame => [time, 110 + time / 3, 570, 0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4200, 7800, 9700, 11600];
const recording = (): Replay => ({ version: 1, dice: [...new Run(() => 0).sweetValues], won: true, frames: [frame(0), frame(1000)] });

describe('replay format', () => {
  it('accepts bounded recordings and encodes pickup masks', () => {
    expect(isReplay(recording())).toBe(true);
    expect(replayMask(new Set([0, 2, 26]))).toBe(1 + 4 + 2 ** 26);
    const replay = recording();
    replay.frames[1][0] = MAX_REPLAY_DURATION;
    expect(isReplay(replay)).toBe(true);
  });
  it('rejects malformed frames, out-of-range dice, unsupported versions and excessive durations', () => {
    const bad: unknown[] = [
      null, {}, { ...recording(), version: 2 }, { ...recording(), extra: 'not recorded' },
      { ...recording(), dice: Array(27).fill(1) }, { ...recording(), dice: Array(27).fill(7) },
      { ...recording(), frames: [] }, { ...recording(), frames: [frame(0)] },
      { ...recording(), frames: [frame(0), frame(0)] },
      { ...recording(), frames: [frame(0), frame(MAX_REPLAY_DURATION + 1)] },
    ];
    for (const value of bad) expect(isReplay(value)).toBe(false);
    for (const [column, value] of [[1, -1], [2, Infinity], [3, 999999], [4, 4], [5, 0], [6, 32], [7, 2 ** 27], [8, .5], [18, NaN]]) {
      const replay = recording();
      replay.frames[1][column] = value;
      expect(isReplay(replay), `column ${column}`).toBe(false);
    }
  });
});

describe('public replay API', () => {
  let server: Server;
  let base: string;
  const store = memoryStore();
  beforeAll(async () => {
    const api = createApi(lazyStore(async () => store), { adminToken: 'replay-test' });
    server = createServer(async (req, res) => {
      if (!await api(req, res)) res.writeHead(404).end();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
  const post = (body: unknown) => fetch(`${base}/api/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('stores a score and replay together, advertises availability, and serves it without authentication', async () => {
    const replay = recording();
    const response = await post({ name: 'Replay Guest', score: 0, squashed: 0, won: true, replay });
    expect(response.status).toBe(201);
    const { entry } = await response.json();
    expect(entry.hasReplay).toBe(true);
    const read = await fetch(`${base}/api/replays/${entry.id}`);
    expect(read.status).toBe(200);
    expect(read.headers.get('cache-control')).toBe('no-store');
    expect(await read.json()).toEqual({ replay });
    const list = await (await fetch(`${base}/api/scores`)).json();
    expect(list.scores[0]).toMatchObject({ id: entry.id, hasReplay: true });
    expect(list.scores[0].replay).toBeUndefined();
    expect((await fetch(`${base}/api/replays/${entry.id}`, { method: 'POST' })).status).toBe(405);
    const deleted = await fetch(`${base}/api/admin/scores/${entry.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer replay-test' } });
    expect(deleted.status).toBe(200);
    expect((await fetch(`${base}/api/replays/${entry.id}`)).status).toBe(404);
  });
  it('keeps legacy scores watch-free and rejects mismatching, malformed or oversized uploads', async () => {
    const legacy = await store.add({ name: 'Old Guest', score: 1, squashed: 0, won: false });
    expect(legacy.hasReplay).toBe(false);
    expect((await fetch(`${base}/api/replays/${legacy.id}`)).status).toBe(404);
    expect((await fetch(`${base}/api/replays/bad`)).status).toBe(404);
    for (const body of [
      { name: 'Guest', score: 1, squashed: 0, won: true, replay: recording() },
      { name: 'Guest', score: 0, squashed: 1, won: true, replay: recording() },
      { name: 'Guest', score: 0, squashed: 0, won: false, replay: recording() },
      { name: 'Guest', score: 0, squashed: 0, won: true, replay: { ...recording(), version: 2 } },
    ]) expect((await post(body)).status).toBe(400);
    expect((await post({ name: 'Guest', score: 0, squashed: 0, won: true, padding: 'x'.repeat(MAX_REPLAY_BYTES) })).status).toBe(413);
  });
});

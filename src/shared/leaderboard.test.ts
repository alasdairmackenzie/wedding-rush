import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanName, ENTRY_ID, isRude, rankScores, topListUrl, validateSubmission } from './leaderboard';
import { MAX_SCORE } from './level';
import { createApi, lazyStore } from '../server/api';
import { memoryStore } from '../server/store';

describe('leaderboard names', () => {
  it('accepts friendly names and trims whitespace', () => {
    expect(cleanName('  Auntie   Jo ')).toBe('Auntie Jo');
    expect(cleanName("Seán O'Neill")).toBe("Seán O'Neill");
    expect(cleanName('')).toBeUndefined();
    expect(cleanName('x'.repeat(17))).toBeUndefined();
    expect(cleanName('<script>')).toBeUndefined();
    expect(cleanName(42)).toBeUndefined();
  });

  it('blocks rude names, including leetspeak and stretched letters', () => {
    for (const name of ['fuckface', 'Sh1t Head', 'FUUUCK', 'big dick', 'c0ck', 'b!tch', 'Bell End', 'n4zi']) {
      expect(isRude(name), name).toBe(true);
    }
  });

  it('does not block real names that happen to contain rude fragments', () => {
    for (const name of ['Peacock', 'Dickson', 'Sussex Sue', 'Cumberland', 'Grape', 'Hitchcock', 'Scarlett', 'Mitsuko']) {
      expect(isRude(name), name).toBe(false);
    }
  });

  it('validates submitted scores', () => {
    expect(validateSubmission({ name: 'Gran', score: 120, squashed: 7, won: true })).toEqual({
      ok: true, value: { name: 'Gran', score: 120, squashed: 7, won: true },
    });
    expect(validateSubmission({ name: 'Gran', score: MAX_SCORE + 1, squashed: 0, won: true }).ok).toBe(false);
    expect(validateSubmission({ name: 'Gran', score: MAX_SCORE, squashed: 7, won: true }).ok).toBe(true);
    expect(validateSubmission({ name: 'Gran', score: 1.5, squashed: 0, won: true }).ok).toBe(false);
    expect(validateSubmission({ name: 'Gran', score: 10, squashed: 8, won: true }).ok).toBe(false);
    expect(validateSubmission({ name: 'Gran', score: 10, squashed: 1 }).ok).toBe(false);
    expect(validateSubmission(null).ok).toBe(false);
  });
});

describe('leaderboard ranks', () => {
  it('shares ranks by score alone and skips occupied positions, including zero scores', () => {
    const scores = [100, 100, 90, 80, 80, 0, 0].map((score, index) => ({
      id: String(index), name: `Guest ${index}`, score, squashed: 7 - index,
      won: index === 0, at: `2026-10-15T12:00:0${index}Z`,
    }));
    expect(rankScores(scores).map(entry => entry.rank)).toEqual([1, 1, 3, 4, 4, 6, 6]);
    expect(rankScores([])).toEqual([]);
    expect(scores[0]).not.toHaveProperty('rank');
  });

  it('uses shared ranks for submissions, lookups and duplicate-name filtering', async () => {
    const store = memoryStore();
    const gran = await store.add({ name: 'Gran', score: 100, squashed: 0, won: false });
    const becky = await store.add({ name: 'Becky', score: 100, squashed: 7, won: true });
    const bestGran = await store.add({ name: 'GRAN', score: 100, squashed: 2, won: true });
    const guest = await store.add({ name: 'Guest', score: 90, squashed: 0, won: false });
    expect([gran.rank, becky.rank, bestGran.rank, guest.rank]).toEqual([1, 1, 1, 4]);
    expect(await store.find(gran.id)).toMatchObject({ id: gran.id, rank: 1 });
    expect(await store.find(gran.id, true)).toMatchObject({ id: bestGran.id, rank: 1 });
    expect(await store.find(becky.id, true)).toMatchObject({ rank: 1 });
    expect(await store.find(guest.id, true)).toMatchObject({ rank: 3 });
  });

  it('keeps shared ranks beyond the top ten and at the memory retention boundary', async () => {
    const store = memoryStore();
    for (let i = 0; i < 499; i++) {
      await store.add({ name: `Guest ${i}`, score: 200, squashed: 0, won: true });
    }
    const first = await store.add({ name: 'First', score: 100, squashed: 1, won: true });
    const tied = await store.add({ name: 'Tied', score: 100, squashed: 0, won: false });
    expect(first.rank).toBe(500);
    expect(tied.rank).toBe(500);
    expect(await store.find(first.id)).toMatchObject({ rank: 500 });
    expect(await store.find(first.id, true)).toMatchObject({ rank: 500 });
  });
});

describe('leaderboard API', () => {
  let server: Server;
  let base = '';
  beforeAll(async () => {
    const api = createApi(lazyStore(async () => memoryStore()));
    server = createServer(async (req, res) => {
      if (!await api(req, res)) res.writeHead(404).end();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

    it('serves the top 100 on request while keeping the default top 10 and rejecting invalid limits', async () => {
      const store = memoryStore();
      for (let i = 0; i < 105; i++) {
        await store.add({ name: `Guest ${i}`, score: i, squashed: 0, won: false });
      }
      const api = createApi(lazyStore(async () => store));
      const server = createServer(async (req, res) => {
        if (!await api(req, res)) res.writeHead(404).end();
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/scores`;
      try {
        expect((await (await fetch(base)).json()).scores).toHaveLength(10);
        const full = (await (await fetch(`${base}?limit=100`)).json()).scores;
        expect(full).toHaveLength(100);
        expect(full[0].score).toBe(104);
        expect(full[99].score).toBe(5);
        for (const limit of ['0', '50', '101', '-1', 'abc']) {
          expect((await fetch(`${base}?limit=${limit}`)).status).toBe(400);
        }
      } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
    });
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
  const post = (body: unknown) => fetch(`${base}/api/scores`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  it('filters case-insensitive duplicates before limiting and ranks the best entry for shared links', async () => {
    const store = memoryStore();
    const low = await store.add({ name: 'Gran', score: 1, squashed: 0, won: false });
    await store.add({ name: 'GRAN', score: 200, squashed: 1, won: true });
    const best = await store.add({ name: 'gran', score: 200, squashed: 2, won: true });
    for (let i = 0; i < 100; i++) {
      await store.add({ name: `Guest ${i}`, score: 100 - i, squashed: 0, won: false });
    }
    const api = createApi(lazyStore(async () => store));
    const server = createServer(async (req, res) => {
      if (!await api(req, res)) res.writeHead(404).end();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/scores`;
    try {
      const filtered = await (await fetch(`${url}?unique=1&limit=100&you=${low.id}`)).json();
      expect(filtered.scores).toHaveLength(100);
      expect(filtered.scores[0]).toMatchObject({ id: best.id, name: 'gran' });
      expect(filtered.scores[99].name).toBe('Guest 98');
      expect(filtered.you).toMatchObject({ id: best.id, rank: 1 });
      const top = await (await fetch(`${url}?unique=1`)).json();
      expect(top.scores).toHaveLength(10);
      expect(top.scores[9].name).toBe('Guest 8');
      expect(await store.find(low.id)).toMatchObject({ id: low.id, rank: 102 });
      expect(await store.find('zzzzzzzzzzzz', true)).toBeUndefined();
      const unfiltered = await (await fetch(`${url}?unique=0`)).json();
      expect(unfiltered.scores.slice(0, 2).map((entry: { name: string }) => entry.name)).toEqual(['gran', 'GRAN']);
      expect(await store.top(500)).toHaveLength(103);
      expect((await fetch(`${url}?unique=yes`)).status).toBe(400);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it('stores scores and returns them ranked', async () => {
    expect((await (await fetch(`${base}/api/scores`)).json()).scores).toEqual([]);
    expect((await post({ name: 'Uncle Bob', score: 40, squashed: 2, won: false })).status).toBe(201);
    const response = await post({ name: 'Gran', score: 90, squashed: 7, won: true });
    const data = await response.json();
    expect(data.entry.name).toBe('Gran');
    expect(data.entry.id).toMatch(ENTRY_ID);
    expect(data.entry.rank).toBe(1);
    expect(data.scores.map((entry: { name: string }) => entry.name)).toEqual(['Gran', 'Uncle Bob']);
  });

  it('returns shared ranks in submission responses and shared links', async () => {
    const store = memoryStore();
    const api = createApi(lazyStore(async () => store));
    const server = createServer(async (req, res) => {
      if (!await api(req, res)) res.writeHead(404).end();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/scores`;
    try {
      const entries = [];
      for (const [name, score, squashed] of [['Gran', 100, 0], ['Becky', 100, 7], ['Guest', 90, 0]] as const) {
        const response = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, score, squashed, won: true }),
        });
        expect(response.status).toBe(201);
        entries.push((await response.json()).entry);
      }
      expect(entries.map(entry => entry.rank)).toEqual([1, 1, 3]);
      for (const unique of [0, 1]) {
        const data = await (await fetch(`${url}?you=${entries[0].id}&unique=${unique}`)).json();
        expect(data.you).toMatchObject({ id: entries[0].id, rank: 1 });
        expect(rankScores(data.scores).map(entry => entry.rank)).toEqual([1, 1, 3]);
      }
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it('finds a shared top list entry by id and ignores unknown or malformed ids', async () => {
    const created = (await (await post({ name: 'Auntie Jo', score: 10, squashed: 1, won: false })).json()).entry;
    const found = await (await fetch(`${base}/api/scores?you=${created.id}`)).json();
    expect(found.you).toMatchObject({ id: created.id, name: 'Auntie Jo', rank: 3 });
    expect((await (await fetch(`${base}/api/scores?you=zzzzzzzzzzzz`)).json()).you).toBeUndefined();
    expect((await (await fetch(`${base}/api/scores?you=../../x`)).json()).you).toBeUndefined();
    expect(topListUrl('https://example.com', created.id)).toBe(`https://example.com/top?you=${created.id}`);
  });

  it('rejects bad input, unknown methods and floods', async () => {
    expect((await post({ name: 'twat', score: 5, squashed: 0, won: false })).status).toBe(400);
    expect((await fetch(`${base}/api/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status).toBe(400);
    expect((await fetch(`${base}/api/scores`, { method: 'POST', body: 'x' })).status).toBe(415);
    expect((await fetch(`${base}/api/scores`, { method: 'DELETE' })).status).toBe(405);
    expect((await post({ name: 'Big', score: 1, squashed: 0, won: false, pad: 'x'.repeat(2000) })).status).toBe(413);
    const statuses: number[] = [];
    for (let id = 0; id < 5; id++) statuses.push((await post({ name: `Guest ${id}`, score: id, squashed: 0, won: false })).status);
    expect(statuses).toContain(429);
  });
});

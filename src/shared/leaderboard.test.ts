import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanName, ENTRY_ID, isRude, topListUrl, validateSubmission } from './leaderboard';
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
    expect(validateSubmission({ name: 'Gran', score: 1.5, squashed: 0, won: true }).ok).toBe(false);
    expect(validateSubmission({ name: 'Gran', score: 10, squashed: 8, won: true }).ok).toBe(false);
    expect(validateSubmission({ name: 'Gran', score: 10, squashed: 1 }).ok).toBe(false);
    expect(validateSubmission(null).ok).toBe(false);
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

    it('serves the top 50 on request while keeping the default top 10 and rejecting invalid limits', async () => {
      const store = memoryStore();
      for (let i = 0; i < 55; i++) {
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
        const full = (await (await fetch(`${base}?limit=50`)).json()).scores;
        expect(full).toHaveLength(50);
        expect(full[0].score).toBe(54);
        expect(full[49].score).toBe(5);
        for (const limit of ['0', '51', '-1', 'abc']) {
          expect((await fetch(`${base}?limit=${limit}`)).status).toBe(400);
        }
      } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
  const post = (body: unknown) => fetch(`${base}/api/scores`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
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

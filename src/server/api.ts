import type { IncomingMessage, ServerResponse } from 'node:http';
import { ENTRY_ID, validateSubmission } from '../shared/leaderboard.ts';
import type { ScoreStore } from './store.ts';

const MAX_BODY = 1024;
const WINDOW_MS = 60_000;
const MAX_POSTS = 5;

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

class TooLarge extends Error {}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () => size > MAX_BODY ? reject(new TooLarge()) : resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createApi(getStore: () => Promise<ScoreStore>) {
  const posts = new Map<string, number[]>();
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/api/scores') return false;
    try {
      const store = await getStore();
      if (req.method === 'GET') {
        const id = url.searchParams.get('you');
        const you = id && ENTRY_ID.test(id) ? await store.find(id) : undefined;
        send(res, 200, { scores: await store.top(), you });
        return true;
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        send(res, 405, { error: 'Method not allowed.' });
        return true;
      }
      if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
        send(res, 415, { error: 'Send JSON.' });
        return true;
      }
      const now = Date.now();
      const ip = clientIp(req);
      const recent = (posts.get(ip) ?? []).filter(time => now - time < WINDOW_MS);
      if (recent.length >= MAX_POSTS) {
        send(res, 429, { error: 'Slow down! Try posting again in a minute.' });
        return true;
      }
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch (error) {
        send(res, error instanceof TooLarge ? 413 : 400, { error: 'That request could not be read.' });
        return true;
      }
      const result = validateSubmission(body);
      if (!result.ok) {
        send(res, 400, { error: result.error });
        return true;
      }
      recent.push(now);
      posts.set(ip, recent);
      if (posts.size > 5000) posts.clear();
      const entry = await store.add(result.value);
      send(res, 201, { entry, scores: await store.top() });
    } catch (error) {
      console.error('Leaderboard error', error);
      if (!res.headersSent) send(res, 503, { error: 'The leaderboard is having a lie-down. Try again soon.' });
    }
    return true;
  };
}

export function lazyStore(create: () => Promise<ScoreStore>): () => Promise<ScoreStore> {
  let pending: Promise<ScoreStore> | undefined;
  return () => {
    pending ??= create().catch(error => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}

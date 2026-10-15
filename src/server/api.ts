import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { imageType, isFaceKind, MAX_FACE_BYTES } from '../shared/faces.ts';
import { cleanName, ENTRY_ID, FULL_RESULTS_SIZE, isRude, LEADERBOARD_SIZE, NAME_MAX, validateSubmission } from '../shared/leaderboard.ts';
import { ADMIN_LIST_SIZE, type ScoreStore } from './store.ts';
import { ANALYTICS_ID, analyticsBatch, isAnalyticsEvent, type AnalyticsEvent } from '../shared/analytics.ts';
import { ACTIVE_WINDOW_MS } from '../shared/presence.ts';
import { isReplay, MAX_REPLAY_BYTES, type Replay } from '../shared/replay.ts';

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

function readBytes(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    req.on('end', () => size > limit ? reject(new TooLarge()) : resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const readBody = async (req: IncomingMessage): Promise<string> => (await readBytes(req, MAX_BODY)).toString('utf8');

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();
function authorised(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  return given.length > 0 && timingSafeEqual(digest(given), digest(token));
}

function notAllowed(res: ServerResponse, allow: string): true {
  res.setHeader('Allow', allow);
  send(res, 405, { error: 'Method not allowed.' });
  return true;
}

async function faces(req: IncomingMessage, res: ServerResponse, store: ScoreStore, path: string): Promise<boolean> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return notAllowed(res, 'GET, HEAD');
  if (path === '/api/faces') {
    send(res, 200, { faces: await store.faces() });
    return true;
  }
  const kind = path.slice('/api/faces/'.length);
  const face = isFaceKind(kind) ? await store.face(kind) : undefined;
  if (!face) {
    send(res, 404, { error: 'No face uploaded.' });
    return true;
  }
  res.writeHead(200, {
    'Content-Type': face.mime,
    'Content-Length': face.data.length,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(req.method === 'HEAD' ? undefined : face.data);
  return true;
}

async function admin(req: IncomingMessage, res: ServerResponse, store: ScoreStore, path: string, token?: string): Promise<boolean> {
  if (!token) {
    send(res, 503, { error: 'The admin page is switched off. Set ADMIN_TOKEN on the server to turn it on.' });
    return true;
  }
  if (!authorised(req, token)) {
    send(res, 401, { error: 'That admin password is not right.' });
    return true;
  }
  const [, , , section, key = ''] = path.split('/');
  if (section === 'analytics' && !key) {
    if (req.method !== 'GET') return notAllowed(res, 'GET');
    const days = Number(new URL(req.url ?? '/', 'http://localhost').searchParams.get('days') ?? 7);
    if (![1, 7, 30, 90].includes(days)) {
      send(res, 400, { error: 'Choose 1, 7, 30 or 90 days.' });
      return true;
    }
    send(res, 200, await store.analytics(days));
    return true;
  }
  if (section === 'check' && !key) {
    send(res, 200, { ok: true });
    return true;
  }
  if (section === 'scores' && !key) {
    if (req.method !== 'GET') return notAllowed(res, 'GET');
    send(res, 200, { scores: await store.top(ADMIN_LIST_SIZE) });
    return true;
  }
  if (section === 'scores' && ENTRY_ID.test(key)) {
    if (req.method === 'DELETE') {
      const removed = await store.remove(key);
      send(res, removed ? 200 : 404, removed ? { ok: true } : { error: 'That score has already gone.' });
      return true;
    }
    if (req.method !== 'PATCH') return notAllowed(res, 'PATCH, DELETE');
    let body: { name?: unknown };
    try {
      body = JSON.parse(await readBody(req)) as { name?: unknown };
    } catch {
      send(res, 400, { error: 'That request could not be read.' });
      return true;
    }
    const name = cleanName(body?.name);
    if (!name) {
      send(res, 400, { error: `Names need 1 to ${NAME_MAX} letters, numbers or spaces.` });
      return true;
    }
    if (isRude(name)) {
      send(res, 400, { error: "Keep it clean, it's a wedding!" });
      return true;
    }
    const renamed = await store.rename(key, name);
    send(res, renamed ? 200 : 404, renamed ? { ok: true, name } : { error: 'That score has already gone.' });
    return true;
  }
  if (section === 'faces' && isFaceKind(key)) {
    if (req.method === 'DELETE') {
      await store.removeFace(key);
      send(res, 200, { ok: true });
      return true;
    }
    if (req.method !== 'PUT') return notAllowed(res, 'PUT, DELETE');
    let data: Buffer;
    try {
      data = await readBytes(req, MAX_FACE_BYTES);
    } catch (error) {
      send(res, error instanceof TooLarge ? 413 : 400, { error: error instanceof TooLarge ? 'That picture is too big.' : 'Upload failed.' });
      return true;
    }
    const mime = imageType(data);
    if (!mime) {
      send(res, 415, { error: 'Upload a PNG, JPEG or WebP picture.' });
      return true;
    }
    send(res, 200, { ok: true, version: await store.saveFace(key, mime, data) });
    return true;
  }
  send(res, 404, { error: 'Not found.' });
  return true;
}

export function createApi(getStore: () => Promise<ScoreStore>, options: { adminToken?: string } = {}) {
  const posts = new Map<string, number[]>();
  const analyticsPosts = new Map<string, { count: number; until: number }>();
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const isFaces = path === '/api/faces' || path.startsWith('/api/faces/');
    const isAdmin = path.startsWith('/api/admin/');
    const isReplayPath = path.startsWith('/api/replays/');
    if (path !== '/api/scores' && path !== '/api/analytics' && path !== '/api/presence' && !isFaces && !isAdmin && !isReplayPath) return false;
    try {
      if (isReplayPath) {
        if (req.method !== 'GET') return notAllowed(res, 'GET');
        const id = path.slice('/api/replays/'.length);
        const replay = ENTRY_ID.test(id) ? await (await getStore()).replay(id) : undefined;
        send(res, replay ? 200 : 404, replay ? { replay } : { error: 'No replay is available for that score.' });
        return true;
      }
      if (path === '/api/presence' && req.method === 'GET') {
        send(res, 200, { activeUsers: await (await getStore()).activeUsers(), windowMinutes: ACTIVE_WINDOW_MS / 60_000 });
        return true;
      }
      if (path === '/api/analytics' || path === '/api/presence') {
        const isPresence = path === '/api/presence';
        if (req.method !== 'POST') return notAllowed(res, isPresence ? 'GET, POST' : 'POST');
        if (req.headers['sec-fetch-site'] === 'cross-site') {
          send(res, 403, { error: isPresence ? 'Presence must be sent from this site.' : 'Analytics must be sent from this site.' });
          return true;
        }
        if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
          send(res, 415, { error: 'Send JSON.' });
          return true;
        }
        const now = Date.now();
        for (const [key, value] of analyticsPosts) if (value.until <= now) analyticsPosts.delete(key);
        const ip = clientIp(req);
        const rate = analyticsPosts.get(ip) ?? { count: 0, until: now + WINDOW_MS };
        if (rate.count >= 300 || analyticsPosts.size >= 5000 && !analyticsPosts.has(ip)) {
          send(res, 429, { error: isPresence ? 'Too many presence requests. Try again shortly.' : 'Too many analytics requests. Try again shortly.' });
          return true;
        }
        rate.count++;
        analyticsPosts.set(ip, rate);
        let body: unknown;
        try { body = JSON.parse((await readBytes(req, isPresence ? MAX_BODY : 16_384)).toString('utf8')); }
        catch (error) {
          send(res, error instanceof TooLarge ? 413 : 400, { error: isPresence ? 'Presence request could not be read.' : 'Analytics request could not be read.' });
          return true;
        }
        if (isPresence) {
          if (typeof body !== 'object' || body === null || Array.isArray(body)
            || Object.keys(body).length !== 1 || !('visitor' in body)
            || typeof body.visitor !== 'string' || !ANALYTICS_ID.test(body.visitor)) {
            send(res, 400, { error: 'Invalid presence.' });
            return true;
          }
          await (await getStore()).recordPresence(body.visitor);
          send(res, 202, { ok: true });
          return true;
        }
        const events = analyticsBatch(body);
        if (!events) { send(res, 400, { error: 'Invalid analytics events.' }); return true; }
        await (await getStore()).track(events);
        send(res, 202, { ok: true });
        return true;
      }
      const store = await getStore();
      if (isFaces) return await faces(req, res, store, path);
      if (isAdmin) return await admin(req, res, store, path, options.adminToken);
      if (req.method === 'GET') {
        const limit = url.searchParams.get('limit');
        if (limit !== null && limit !== String(LEADERBOARD_SIZE) && limit !== String(FULL_RESULTS_SIZE)) {
          send(res, 400, { error: `Score limit must be ${LEADERBOARD_SIZE} or ${FULL_RESULTS_SIZE}.` });
          return true;
        }
        const id = url.searchParams.get('you');
        const unique = url.searchParams.get('unique');
        if (unique !== null && unique !== '1' && unique !== '0') {
          send(res, 400, { error: 'Unique names must be 1 or 0.' });
          return true;
        }
        const uniqueNames = unique === '1';
        const you = id && ENTRY_ID.test(id) ? await store.find(id, uniqueNames) : undefined;
        send(res, 200, { scores: await store.top(limit === String(FULL_RESULTS_SIZE) ? FULL_RESULTS_SIZE : LEADERBOARD_SIZE, uniqueNames), you });
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
        body = JSON.parse((await readBytes(req, MAX_REPLAY_BYTES)).toString('utf8'));
      } catch (error) {
        send(res, error instanceof TooLarge ? 413 : 400, { error: 'That request could not be read.' });
        return true;
      }
      const result = validateSubmission(body);
      if (!result.ok) {
        send(res, 400, { error: result.error });
        return true;
      }
      let replay: Replay | undefined;
      if (typeof body === 'object' && body !== null && 'replay' in body) {
        if (!isReplay(body.replay)) {
          send(res, 400, { error: 'That replay is invalid or uses an unsupported game version.' });
          return true;
        }
        replay = body.replay;
        const final = replay.frames.at(-1)!;
        if (final[3] !== result.value.score || replay.won !== result.value.won ||
          final[8].toString(2).replaceAll('0', '').length !== result.value.squashed) {
          send(res, 400, { error: 'The replay does not match that score.' });
          return true;
        }
      } else if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY) {
        send(res, 413, { error: 'That request is too big.' });
        return true;
      }
      recent.push(now);
      posts.set(ip, recent);
      if (posts.size > 5000) posts.clear();
      let analytics: AnalyticsEvent | undefined;
      if (typeof body === 'object' && body !== null && 'analytics' in body && body.analytics !== undefined) {
        if (!isAnalyticsEvent(body.analytics) || body.analytics.name !== 'score_saved' || body.analytics.target !== 'submit-score') {
          send(res, 400, { error: 'Invalid score analytics context.' });
          return true;
        }
        analytics = body.analytics;
      }
      const entry = await store.add(result.value, analytics, replay);
      send(res, 201, { entry, scores: await store.top() });
    } catch (error) {
      console.error('WeddingRush API error', error);
      if (!res.headersSent) send(res, 503, { error: path.includes('analytics') ? 'Analytics are unavailable. Try again soon.' : 'The leaderboard is having a lie-down. Try again soon.' });
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

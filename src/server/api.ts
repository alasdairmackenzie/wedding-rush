import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { imageType, isFaceKind, MAX_FACE_BYTES } from '../shared/faces.ts';
import { cleanName, ENTRY_ID, isRude, NAME_MAX, validateSubmission } from '../shared/leaderboard.ts';
import { ADMIN_LIST_SIZE, type ScoreStore } from './store.ts';

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
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const isFaces = path === '/api/faces' || path.startsWith('/api/faces/');
    const isAdmin = path.startsWith('/api/admin/');
    if (path !== '/api/scores' && !isFaces && !isAdmin) return false;
    try {
      const store = await getStore();
      if (isFaces) return await faces(req, res, store, path);
      if (isAdmin) return await admin(req, res, store, path, options.adminToken);
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

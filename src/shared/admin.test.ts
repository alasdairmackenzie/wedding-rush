import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FACE_KINDS, imageType, isFaceKind, MAX_FACE_BYTES } from './faces';
import { createApi, lazyStore } from '../server/api';
import { memoryStore } from '../server/store';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');

async function serve(adminToken?: string): Promise<{ server: Server; base: string }> {
  const api = createApi(lazyStore(async () => memoryStore()), { adminToken });
  const server = createServer(async (req, res) => {
    if (!await api(req, res)) res.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}
const close = (server: Server) => new Promise<void>(resolve => server.close(() => resolve()));

describe('faces', () => {
  it('knows which characters can have faces', () => {
    expect(FACE_KINDS).toContain('bride');
    expect(isFaceKind('bride')).toBe(true);
    expect(isFaceKind('groom')).toBe(false);
    expect(isFaceKind('../etc')).toBe(false);
  });

  it('identifies pictures from their bytes', () => {
    expect(imageType(PNG)).toBe('image/png');
    expect(imageType(JPEG)).toBe('image/jpeg');
    expect(imageType(WEBP)).toBe('image/webp');
    expect(imageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeUndefined();
  });
});

describe('admin API', () => {
  let server: Server;
  let base = '';
  const auth = { Authorization: 'Bearer let-me-in' };
  beforeAll(async () => ({ server, base } = await serve('let-me-in')));
  afterAll(() => close(server));
  const post = (name: string, score: number) => fetch(`${base}/api/scores`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, score, squashed: 0, won: false }),
  }).then(response => response.json()).then(data => data.entry as { id: string });
  const rename = (id: string, name: string) => fetch(`${base}/api/admin/scores/${id}`, {
    method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });

  it('turns itself off when no admin password is set', async () => {
    const off = await serve();
    expect((await fetch(`${off.base}/api/admin/check`, { headers: auth })).status).toBe(503);
    await close(off.server);
  });

  it('needs the right password', async () => {
    expect((await fetch(`${base}/api/admin/check`)).status).toBe(401);
    expect((await fetch(`${base}/api/admin/check`, { headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
    expect((await fetch(`${base}/api/admin/check`, { headers: auth })).status).toBe(200);
    expect((await fetch(`${base}/api/admin/scores`)).status).toBe(401);
  });

  it('lists, renames and deletes scores', async () => {
    const gran = await post('Gran', 50);
    const bob = await post('Bob', 20);
    const list = await (await fetch(`${base}/api/admin/scores`, { headers: auth })).json();
    expect(list.scores.map((entry: { name: string }) => entry.name)).toEqual(['Gran', 'Bob']);

    const renamed = await rename(gran.id, '  Granny  Smith ');
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).name).toBe('Granny Smith');
    expect((await rename(gran.id, 'twat')).status).toBe(400);
    expect((await rename(gran.id, '')).status).toBe(400);
    expect((await rename('zzzzzzzzzzzz', 'Ghost')).status).toBe(404);

    expect((await fetch(`${base}/api/admin/scores/${bob.id}`, { method: 'DELETE', headers: auth })).status).toBe(200);
    expect((await fetch(`${base}/api/admin/scores/${bob.id}`, { method: 'DELETE', headers: auth })).status).toBe(404);
    const after = await (await fetch(`${base}/api/scores`)).json();
    expect(after.scores.map((entry: { name: string }) => entry.name)).toEqual(['Granny Smith']);
  });

  it('uploads, serves and removes faces', async () => {
    const put = (body: Uint8Array, headers = auth) => fetch(`${base}/api/admin/faces/bride`, { method: 'PUT', headers, body });
    expect(await (await fetch(`${base}/api/faces`)).json()).toEqual({ faces: {} });
    expect((await fetch(`${base}/api/faces/bride`)).status).toBe(404);
    expect((await put(PNG, {} as typeof auth)).status).toBe(401);
    expect((await put(new TextEncoder().encode('<svg/>'))).status).toBe(415);
    expect((await put(new Uint8Array(MAX_FACE_BYTES + 1))).status).toBe(413);
    expect((await fetch(`${base}/api/admin/faces/groom`, { method: 'PUT', headers: auth, body: PNG })).status).toBe(404);

    const saved = await put(PNG);
    expect(saved.status).toBe(200);
    const { version } = await saved.json();
    expect((await (await fetch(`${base}/api/faces`)).json()).faces).toEqual({ bride: version });
    const image = await fetch(`${base}/api/faces/bride?v=${version}`);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);

    expect((await fetch(`${base}/api/admin/faces/bride`, { method: 'DELETE', headers: auth })).status).toBe(200);
    expect((await fetch(`${base}/api/faces/bride`)).status).toBe(404);
  });
});

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi, lazyStore } from './api.ts';
import { createStore } from './store.ts';

const root = resolve(fileURLToPath(new URL('../../dist', import.meta.url)));
const port = Number(process.env.PORT) || 3000;
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const getStore = lazyStore(createStore);
getStore().catch(error => console.error('Leaderboard store failed to start; will retry on the next request.', error));
const api = createApi(getStore, { adminToken: process.env.ADMIN_TOKEN || undefined });

async function file(path: string): Promise<string | undefined> {
  try {
    const info = await stat(path);
    if (info.isFile()) return path;
    if (info.isDirectory()) return file(join(path, 'index.html'));
  } catch {
    return undefined;
  }
  return undefined;
}

const server = createServer(async (req, res) => {
  if (await api(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const target = normalize(join(root, pathname));
  if (target !== root && !target.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  const clean = target.replace(/[\\/]+$/, '');
  const page = async (): Promise<string | undefined> =>
    extname(pathname) || clean === root ? undefined : file(`${clean}.html`);
  const found = await file(target) ?? await page() ?? (extname(pathname) ? undefined : await file(join(root, 'index.html')));
  if (!found) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  const hashed = found.includes(`${sep}assets${sep}`) && /-[\w-]{8,}\.\w+$/.test(found);
  res.writeHead(200, {
    'Content-Type': types[extname(found).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(found).on('error', () => res.destroy()).pipe(res);
});

server.listen(port, '0.0.0.0', () => console.log(`WeddingRush listening on http://localhost:${port}`));
const shutdown = (): void => { server.close(() => process.exit(0)); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

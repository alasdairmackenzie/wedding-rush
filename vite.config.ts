import { defineConfig, loadEnv, type Plugin } from 'vite';
import { createApi, lazyStore } from './src/server/api.ts';
import { memoryStore } from './src/server/store.ts';

function leaderboard(adminToken?: string): Plugin {
  const api = createApi(lazyStore(async () => memoryStore()), { adminToken });
  const middleware = (req: Parameters<typeof api>[0], res: Parameters<typeof api>[1], next: () => void): void => {
    const adminPage = req.url?.match(/^\/admin\/(?:scores|photos|stats)\/?(\?.*)?$/);
    if (adminPage) req.url = `/admin.html${adminPage[1] ?? ''}`;
    const page = req.url?.match(/^\/(live|admin)\/?(\?.*)?$/);
    if (page) req.url = `/${page[1]}.html${page[2] ?? ''}`;
    api(req, res).then(handled => { if (!handled) next(); }, next);
  };
  return {
    name: 'wedding-rush-leaderboard',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const adminToken = process.env.ADMIN_TOKEN || env.ADMIN_TOKEN || undefined;
  return {
    plugins: [leaderboard(adminToken)],
    server: { port: 5200, strictPort: true },
    build: { rolldownOptions: { input: { main: 'index.html', live: 'live.html', admin: 'admin.html' } } },
  };
});

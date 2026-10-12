import { defineConfig, type Plugin } from 'vite';
import { createApi, lazyStore } from './src/server/api.ts';
import { memoryStore } from './src/server/store.ts';

function leaderboard(): Plugin {
  const api = createApi(lazyStore(async () => memoryStore()));
  const middleware = (req: Parameters<typeof api>[0], res: Parameters<typeof api>[1], next: () => void): void => {
    api(req, res).then(handled => { if (!handled) next(); }, next);
  };
  return {
    name: 'wedding-rush-leaderboard',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

export default defineConfig({
  plugins: [leaderboard()],
  server: { port: 5200, strictPort: true },
});

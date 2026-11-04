import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// This app is developed behind code-server, which proxies a local port at
//   https://<host>:8162/absproxy/<DEV_PORT>/
// code-server's /absproxy/ does NOT strip the prefix, so in development the app
// must be served under that same subpath (base = /absproxy/<port>/). In production
// (vite build) the base is the normal root "/", so deployments are unaffected.
//
// DEV_PORT must match the port in the proxy URL; it is pinned (strictPort) so the
// base prefix stays stable across restarts. Override via VITE_DEV_PORT if needed.
const DEV_PORT = Number(process.env.VITE_DEV_PORT ?? 5175);
const DEV_PREFIX = `/absproxy/${DEV_PORT}`;
const DEV_BASE = `${DEV_PREFIX}/`;
const PROXY_HOST = process.env.VITE_PROXY_HOST ?? '10.10.0.36';
const PROXY_PORT = Number(process.env.VITE_PROXY_PORT ?? 8162);

export default defineConfig(({ command }) => ({
  // dev (serve) runs under the code-server absproxy subpath; build uses root.
  base: command === 'serve' ? DEV_BASE : '/',
  plugins: [react()],
  server: {
    port: DEV_PORT,
    strictPort: true,
    // Allow the proxy's external host to reach the dev server (Vite host check).
    allowedHosts: [PROXY_HOST, 'localhost', '127.0.0.1'],
    proxy: {
      // Forward API calls to the backend. The regex matches whether or not the
      // proxy strips the "/absproxy/<port>" prefix before reaching Vite; the
      // rewrite removes the prefix so the backend always sees "/api/...".
      [`^(?:/absproxy/${DEV_PORT})?/api`]: {
        target: 'http://localhost:3100',
        changeOrigin: true,
        rewrite: (p) => p.replace(new RegExp(`^/absproxy/${DEV_PORT}`), ''),
      },
    },
    // HMR websocket travels through the same https proxy.
    hmr: {
      protocol: 'wss',
      host: PROXY_HOST,
      clientPort: PROXY_PORT,
    },
  },
}));

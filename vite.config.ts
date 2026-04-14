import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
// vitest/config re-exports defineConfig with the `test` key typed.
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const useHttpBackend = env.VITE_API_MODE === 'http';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // Proxying rather than pointing the client at http://localhost:5180
      // directly keeps `apiConfig.baseUrl` as the relative `/api` in both modes,
      // so there is no CORS preflight in development and no absolute URL baked
      // into the bundle. The backend still sets a CORS policy, for anyone who
      // does want to run the two on separate origins.
      proxy: useHttpBackend
        ? {
            '/api': {
              target: env.VITE_API_PROXY_TARGET ?? 'http://localhost:5180',
              changeOrigin: true,
            },
          }
        : undefined,
    },
    test: {
      // jsdom costs ~25s to boot; opt in per-file with `// @vitest-environment jsdom`.
      environment: 'node',
      // The route tests mount lazily-loaded pages, and on a cold transform cache
      // the dashboard chunk (Recharts, ~400 kB) can take longer than the 5s
      // default to resolve. Raised so a cold first run is not reported as a
      // failure; a genuine hang still fails, just later.
      testTimeout: 20_000,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  };
});

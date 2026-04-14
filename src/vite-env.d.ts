/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Which API the app talks to. `msw` (the default) intercepts requests with a
   * service worker and answers from IndexedDB, so the app works with no server.
   * `http` points the same code at the ASP.NET Core backend in `server/` —
   * nothing above `src/api/` knows which is in use.
   */
  readonly VITE_API_MODE?: 'msw' | 'http';

  /** Base URL for `http` mode. Defaults to `/api`, which Vite proxies in dev. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

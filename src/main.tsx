import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from '@/App';
import '@/index.css';

// In `msw` mode the mock server and database both need to be ready before the
// first query fires, so start-up is awaited rather than raced; in `http` mode
// neither exists, since the ASP.NET Core backend owns the data already.
//
// Checks `import.meta.env` directly rather than the `isHttpMode` helper —
// Vite can fold this into a constant at build time and drop the dynamic
// imports (MSW + Dexie, ~500kB) from an `http` build. Going through an
// imported constant would keep those chunks in the bundle.
async function bootstrap() {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element #root not found in index.html');
  }

  if (import.meta.env.VITE_API_MODE !== 'http') {
    const { worker } = await import('@/mocks/browser');
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
      quiet: true,
    });

    const { ensureSeeded } = await import('@/db/seed');
    await ensureSeeded();
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();

// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '@/components/ui/ToastProvider';
import { AppRoutes } from '@/routes';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { AuthProvider } from './AuthProvider';

/** Signs a user in the way a returning visitor would be: via the persisted session. */
function renderAt(path: string, userId?: string) {
  if (userId) localStorage.setItem('crewlink.session', userId);

  // A fresh client per render so no cached data leaks between tests. Retries are
  // off so a failing query surfaces immediately instead of stalling the test.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
});

// Feature pages are lazily loaded, so assertions use async `findBy*` queries —
// `getBy*` would only ever see the Suspense fallback.
describe('route protection', () => {
  it('sends an anonymous visitor to the login page', () => {
    renderAt('/dashboard');

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('lets a Fleet Manager reach the dashboard', async () => {
    renderAt('/dashboard', 'user-manager');

    expect(await screen.findByRole('heading', { name: 'Fleet dashboard' })).toBeInTheDocument();
  });

  it('shows a Crew Member a refusal rather than the dashboard', async () => {
    renderAt('/dashboard', 'user-crew');

    expect(await screen.findByRole('heading', { name: 'Not authorised' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fleet dashboard' })).not.toBeInTheDocument();
  });

  it('sends each role to a landing page its permissions allow', async () => {
    const { unmount } = renderAt('/', 'user-manager');
    expect(await screen.findByRole('heading', { name: 'Fleet dashboard' })).toBeInTheDocument();
    unmount();
    localStorage.clear();

    renderAt('/', 'user-crew');
    expect(await screen.findByRole('heading', { name: 'Ariel Santos' })).toBeInTheDocument();
  });

  it('hides fleet-wide navigation from a Crew Member', async () => {
    renderAt('/me', 'user-crew');

    expect(await screen.findByRole('link', { name: 'My Profile' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vessels' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  it('shows a Crewing Officer the vessel register but no dashboard-only gap', async () => {
    renderAt('/vessels', 'user-crewing');

    expect(await screen.findByRole('heading', { name: 'Vessels' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });
});

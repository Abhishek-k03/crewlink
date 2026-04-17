export type ApiMode = 'msw' | 'http';

/** Defaults to `msw` so the app runs with no backend unless VITE_API_MODE says otherwise. */
export const API_MODE: ApiMode = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'msw';

export const isHttpMode = API_MODE === 'http';

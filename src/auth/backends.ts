import { ApiError, apiClient, setAuthToken } from '@/api/client';
import { isHttpMode } from '@/api/mode';

import { decodeSessionToken } from './token';
import { findUserByCredentials, findUserById, type SessionUser, toSessionUser } from './users';

// Two ways to be signed in, behind one interface. `msw` mode compares
// credentials in the browser against constants (secures nothing); `http` mode
// delegates to the ASP.NET Core backend, which hashes and issues a real JWT.
// Same UI, either backend.
export interface AuthBackend {
  /** Synchronous, so a returning user never sees the login screen flash. */
  restore(): SessionUser | null;
  /** Resolves to an error message, or null on success. */
  login(email: string, password: string): Promise<string | null>;
  logout(): void;
}

const SESSION_KEY = 'crewlink.session';
const TOKEN_KEY = 'crewlink.token';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // A blocked localStorage costs persistence across reloads, not the session.
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

// Persists only the user id, never the user object — a stored object would
// outlive changes to its shape. The id is re-resolved against the user list on
// every load.
const simulatedAuth: AuthBackend = {
  restore() {
    const id = readStorage(SESSION_KEY);
    if (!id) return null;
    const user = findUserById(id);
    return user ? toSessionUser(user) : null;
  },

  async login(email, password) {
    // The real backend takes time to answer; without this the mock path would
    // make the pending state impossible to see or style.
    await new Promise((resolve) => setTimeout(resolve, 400));

    const match = findUserByCredentials(email, password);
    if (!match) return 'Incorrect email or password.';

    writeStorage(SESSION_KEY, match.id);
    return null;
  },

  logout() {
    writeStorage(SESSION_KEY, null);
  },
};

interface LoginResponse {
  token: string;
  expiresAt: string;
  user: SessionUser;
}

const httpAuth: AuthBackend = {
  restore() {
    const token = readStorage(TOKEN_KEY);
    if (!token) return null;

    const user = decodeSessionToken(token);
    if (!user) {
      // Expired or unreadable: clear it rather than sending it and collecting a
      // 401 on the first query of every page.
      writeStorage(TOKEN_KEY, null);
      setAuthToken(null);
      return null;
    }

    setAuthToken(token);
    return user;
  },

  async login(email, password) {
    try {
      const response = await apiClient.post<LoginResponse>('/auth/login', { email, password });
      writeStorage(TOKEN_KEY, response.token);
      setAuthToken(response.token);
      return null;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return 'Incorrect email or password.';
      }
      // A network or server failure is not a credentials problem, and saying so
      // sends the user off retyping a password that was never wrong.
      return error instanceof ApiError
        ? error.message
        : 'Could not reach the server. Please try again.';
    }
  },

  logout() {
    writeStorage(TOKEN_KEY, null);
    setAuthToken(null);
  },
};

export const authBackend: AuthBackend = isHttpMode ? httpAuth : simulatedAuth;

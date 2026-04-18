import { createContext, useContext } from 'react';

import type { SessionUser } from './users';

export interface AuthContextValue {
  user: SessionUser | null;
  /** Resolves to an error message on failure, or `null` on success. */
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}

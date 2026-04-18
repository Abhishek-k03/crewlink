import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { authBackend } from './backends';
import { AuthContext, type AuthContextValue } from './context';
import type { SessionUser } from './users';

/** Owns the session; how it's established and persisted per API mode lives in backends.ts. */
export function AuthProvider({ children }: { children: ReactNode }) {
  // Read synchronously during the first render so a returning user never sees
  // the login screen flash before their session is restored.
  const [user, setUser] = useState<SessionUser | null>(() => authBackend.restore());

  const login = useCallback<AuthContextValue['login']>(async (email, password) => {
    const error = await authBackend.login(email, password);
    if (error) return error;

    // Both backends persist first and are then read back the same way a reload
    // would read them, so there is one path that turns storage into a session
    // rather than two that can disagree.
    setUser(authBackend.restore());
    return null;
  }, []);

  const logout = useCallback(() => {
    authBackend.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

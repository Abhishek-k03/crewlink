import { ROLES, type Role } from '@/domain/types';

import type { SessionUser } from './users';

// Reads the session out of the JWT's claims rather than storing a separate user
// object, so decoding is synchronous and a returning user's session is restored
// on first render. This isn't a security check — the server verifies the
// signature and expiry on every request; the expiry check here just lets the UI
// sign someone out before their next request fails.

interface TokenClaims {
  sub?: string;
  name?: string;
  email?: string;
  role?: string;
  crewId?: string;
  exp?: number;
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    '=',
  );

  // `atob` yields a binary string; names can contain non-ASCII characters, so
  // the bytes have to be re-read as UTF-8 rather than used directly.
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isRole(value: string | undefined): value is Role {
  return value !== undefined && (ROLES as readonly string[]).includes(value);
}

export function decodeSessionToken(token: string): SessionUser | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;

    const claims = JSON.parse(decodeBase64Url(payload)) as TokenClaims;

    if (claims.exp !== undefined && claims.exp * 1000 <= Date.now()) return null;
    if (!claims.sub || !claims.email || !isRole(claims.role)) return null;

    return {
      id: claims.sub,
      name: claims.name ?? claims.email,
      email: claims.email,
      role: claims.role,
      ...(claims.crewId ? { crewId: claims.crewId } : {}),
    };
  } catch {
    // A corrupt or truncated token is simply not a session.
    return null;
  }
}

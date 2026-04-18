import type { CrewId, Role } from '@/domain/types';

export const ACTIONS = [
  'dashboard:view',
  'vessel:read',
  'vessel:write',
  'vessel:markReadyToSail',
  'crew:read',
  'crew:write',
  'assignment:read',
  'assignment:write',
  'certification:read',
  'certification:write',
  // Split from certification:write: uploading can only add information, but
  // deleting could hide an expired cert from the compliance view.
  'certification:delete',
] as const;
export type Action = (typeof ACTIONS)[number];

/** How much of an entity a role may touch — a plain boolean can't express "own records only". */
export type Scope = 'none' | 'own' | 'all';

const ROLE_PERMISSIONS: Record<Role, Record<Action, Scope>> = {
  'Fleet Manager': {
    'dashboard:view': 'all',
    'vessel:read': 'all',
    'vessel:write': 'all',
    'vessel:markReadyToSail': 'all',
    'crew:read': 'all',
    'crew:write': 'all',
    'assignment:read': 'all',
    'assignment:write': 'all',
    'certification:read': 'all',
    'certification:write': 'all',
    'certification:delete': 'all',
  },
  'Crewing Officer': {
    'dashboard:view': 'all',
    'vessel:read': 'all',
    'vessel:write': 'none',
    'vessel:markReadyToSail': 'none',
    'crew:read': 'all',
    'crew:write': 'all',
    'assignment:read': 'all',
    'assignment:write': 'all',
    'certification:read': 'all',
    'certification:write': 'all',
    'certification:delete': 'all',
  },
  'Crew Member': {
    'dashboard:view': 'none',
    'vessel:read': 'none',
    'vessel:write': 'none',
    'vessel:markReadyToSail': 'none',
    'crew:read': 'own',
    'crew:write': 'none',
    'assignment:read': 'own',
    'assignment:write': 'none',
    'certification:read': 'own',
    'certification:write': 'own',
    // Upload yes, delete no: a crew member removing their own expired
    // certificate is exactly how non-compliance would be hidden.
    'certification:delete': 'none',
  },
};

export function permissionScope(role: Role, action: Action): Scope {
  return ROLE_PERMISSIONS[role][action];
}

/** Where a role lands at `/` — Crew Members have no dashboard access. */
export function landingPathFor(role: Role): string {
  return permissionScope(role, 'dashboard:view') === 'none' ? '/me' : '/dashboard';
}

/** Whether `role` may perform `action` on a record owned by `ownerCrewId`. */
export function can(
  role: Role,
  action: Action,
  viewerCrewId?: CrewId,
  ownerCrewId?: CrewId,
): boolean {
  const scope = permissionScope(role, action);
  if (scope === 'all') return true;
  if (scope === 'none') return false;
  return viewerCrewId !== undefined && viewerCrewId === ownerCrewId;
}

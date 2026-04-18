import type { CrewId, Role } from '@/domain/types';

/** Demo accounts. Passwords are plaintext in the bundle — this simulates auth, it doesn't provide it. */
export interface DemoUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  /** Present only for Crew Member, linking the login to a seeded crew record. */
  crewId?: CrewId;
}

/** The crew record the demo Crew Member account maps to. The seed must create this id. */
export const DEMO_CREW_MEMBER_CREW_ID = 'crew-demo-0001';

export const DEMO_USERS: readonly DemoUser[] = [
  {
    id: 'user-manager',
    name: 'Priya Raghunathan',
    email: 'manager@crewlink.dev',
    password: 'manager123',
    role: 'Fleet Manager',
  },
  {
    id: 'user-crewing',
    name: 'Tomas Lindqvist',
    email: 'crewing@crewlink.dev',
    password: 'crewing123',
    role: 'Crewing Officer',
  },
  {
    id: 'user-crew',
    name: 'Ariel Santos',
    email: 'crew@crewlink.dev',
    password: 'crew123',
    role: 'Crew Member',
    crewId: DEMO_CREW_MEMBER_CREW_ID,
  },
];

/** A user without their password, safe to hold in React state and localStorage. */
export type SessionUser = Omit<DemoUser, 'password'>;

export function toSessionUser({ password: _password, ...user }: DemoUser): SessionUser {
  return user;
}

export function findUserById(id: string): DemoUser | undefined {
  return DEMO_USERS.find((user) => user.id === id);
}

export function findUserByCredentials(email: string, password: string): DemoUser | undefined {
  const normalised = email.trim().toLowerCase();
  return DEMO_USERS.find((user) => user.email === normalised && user.password === password);
}

import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  type LucideIcon,
  ShieldCheck,
  Ship,
  User,
  Users,
} from 'lucide-react';

import type { Action, Scope } from '@/auth/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  action: Action;
  /** The scope this destination needs — `all` for fleet-wide pages, `own` for the profile page. */
  scope: Scope;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    action: 'dashboard:view',
    scope: 'all',
  },
  { to: '/vessels', label: 'Vessels', icon: Ship, action: 'vessel:read', scope: 'all' },
  { to: '/crew', label: 'Crew', icon: Users, action: 'crew:read', scope: 'all' },
  {
    to: '/assignments',
    label: 'Rotations',
    icon: ClipboardList,
    action: 'assignment:read',
    scope: 'all',
  },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, action: 'assignment:read', scope: 'all' },
  {
    to: '/certifications',
    label: 'Certifications',
    icon: ShieldCheck,
    action: 'certification:read',
    scope: 'all',
  },
  { to: '/me', label: 'My Profile', icon: User, action: 'crew:read', scope: 'own' },
];

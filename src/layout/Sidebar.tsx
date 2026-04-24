import { Anchor, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useAuth } from '@/auth/context';
import { permissionScope } from '@/auth/permissions';

import { NAV_ITEMS } from './navigation';

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-primary text-on-primary' : 'text-muted hover:bg-elevated hover:text-ink',
  ].join(' ');

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => permissionScope(user.role, item.action) === item.scope);

  return (
    <div className="flex h-full flex-col gap-6 border-r border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Anchor className="size-5 text-accent" aria-hidden />
          CrewLink
        </span>
        {onNavigate && (
          <button
            type="button"
            onClick={onNavigate}
            className="rounded-md p-1 transition-colors hover:bg-elevated lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-5" aria-hidden />
          </button>
        )}
      </div>

      <nav className="flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClasses} onClick={onNavigate}>
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>

      <p className="mt-auto text-xs text-muted">Signed in as {user.role}</p>
    </div>
  );
}

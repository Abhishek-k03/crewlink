import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/context';
import { permissionScope } from '@/auth/permissions';
import { useTheme } from '@/theme/context';

import { NotificationBell } from './NotificationBell';

export function Header({ onOpenNav }: { onOpenNav: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // `relative z-30` is load-bearing: `backdrop-blur` creates a stacking context,
  // so the notification panel's z-index only applies within this header. An
  // unpositioned header paints below every positioned element in <main> —
  // search wrappers, chart containers — and the panel disappears behind them.
  return (
    <header className="relative z-30 flex items-center gap-3 border-b border-line bg-surface/85 px-4 py-3 backdrop-blur">
      <button
        type="button"
        onClick={onOpenNav}
        className="rounded-md p-2 transition-colors hover:bg-elevated lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      <div className="ml-auto flex items-center gap-2">
        {user && <span className="hidden text-sm text-muted sm:inline">{user.name}</span>}
        {/* Fleet-wide alerts are meaningless to a role that cannot see the fleet. */}
        {user && permissionScope(user.role, 'dashboard:view') === 'all' && <NotificationBell />}
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-md p-2 transition-colors hover:bg-elevated"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? (
            <Sun className="size-5" aria-hidden />
          ) : (
            <Moon className="size-5" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-elevated"
        >
          <LogOut className="size-4" aria-hidden />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}

import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { ForbiddenPage } from '@/components/StatusPages';

import { useAuth } from './context';
import { type Action, permissionScope } from './permissions';

interface ProtectedRouteProps {
  /** Omit to require only that someone is signed in. */
  action?: Action;
  children?: ReactNode;
}

export function ProtectedRoute({ action, children }: ProtectedRouteProps) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    // `state.from` lets the login page return the user to where they were headed.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (action && permissionScope(user.role, action) === 'none') {
    // Shown rather than redirected: a silent bounce reads as a broken link,
    // and unauthorised URLs are reachable by hand even when the nav hides them.
    return <ForbiddenPage />;
  }

  return children ? <>{children}</> : <Outlet />;
}

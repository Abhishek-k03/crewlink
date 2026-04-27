import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from '@/auth/context';
import { landingPathFor } from '@/auth/permissions';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { NotFoundPage } from '@/components/StatusPages';
import { Skeleton } from '@/components/ui/Skeleton';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppShell } from '@/layout/AppShell';

// Feature pages are code-split per route — Recharts alone is ~400 kB, and a
// Crew Member who only sees their own profile shouldn't download the dashboard.
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
);
const VesselsPage = lazy(() =>
  import('@/features/vessels/VesselsPage').then((module) => ({ default: module.VesselsPage })),
);
const VesselDetailPage = lazy(() =>
  import('@/features/vessels/VesselDetailPage').then((module) => ({
    default: module.VesselDetailPage,
  })),
);
const CrewPage = lazy(() =>
  import('@/features/crew/CrewPage').then((module) => ({ default: module.CrewPage })),
);
const CrewProfilePage = lazy(() =>
  import('@/features/crew/CrewProfilePage').then((module) => ({
    default: module.CrewProfilePage,
  })),
);
const AssignmentsPage = lazy(() =>
  import('@/features/assignments/AssignmentsPage').then((module) => ({
    default: module.AssignmentsPage,
  })),
);
const CalendarPage = lazy(() =>
  import('@/features/assignments/CalendarPage').then((module) => ({
    default: module.CalendarPage,
  })),
);
const CertificationsPage = lazy(() =>
  import('@/features/certifications/CertificationsPage').then((module) => ({
    default: module.CertificationsPage,
  })),
);

/** `/` has no page of its own; each role starts somewhere its permissions allow. */
function HomeRedirect() {
  const { user } = useAuth();
  return user ? (
    <Navigate to={landingPathFor(user.role)} replace />
  ) : (
    <Navigate to="/login" replace />
  );
}

function RouteFallback() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** Split from `App` so tests can mount the route tree inside a `MemoryRouter`. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route
          element={
            <Suspense fallback={<RouteFallback />}>
              <AppShell />
            </Suspense>
          }
        >
          <Route index element={<HomeRedirect />} />
          <Route
            path="dashboard"
            element={
              <ProtectedRoute action="dashboard:view">
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="vessels"
            element={
              <ProtectedRoute action="vessel:read">
                <VesselsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="vessels/:id"
            element={
              <ProtectedRoute action="vessel:read">
                <VesselDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="crew"
            element={
              <ProtectedRoute action="crew:read">
                <CrewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="crew/:id"
            element={
              <ProtectedRoute action="crew:read">
                <CrewProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="me"
            element={
              <ProtectedRoute action="crew:read">
                <CrewProfilePage ownProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="assignments"
            element={
              <ProtectedRoute action="assignment:read">
                <AssignmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="calendar"
            element={
              <ProtectedRoute action="assignment:read">
                <CalendarPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="certifications"
            element={
              <ProtectedRoute action="certification:read">
                <CertificationsPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

/**
 * Protects /admin routes: requires authenticated user with role === 'admin'.
 * Redirects to /login when signed out, and to /dashboard when the user is not an admin.
 * `/` is the public website, so a non-admin stays in the workspace.
 */
export function AdminGuard() {
  const { user, isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout';
import { useAuthStore } from '@/stores/authStore';
import { connectSocket } from '@/lib/socket';
import { NotificationSocketSubscriber } from '@/components/notifications/NotificationSocketSubscriber';
import { AdminGuard } from '@/admin/AdminGuard';
import { ReimbursementProvider } from '@/contexts/ReimbursementContext';
import { LoginPage } from '@/pages/LoginPage';
import { SignUpPage } from '@/pages/SignUpPage';
import { ForcePasswordChangePage } from '@/pages/ForcePasswordChangePage';

const AdminLayout = lazy(() => import('@/admin/layouts/AdminLayout').then(m => ({ default: m.AdminLayout })));
const AdminDashboard = lazy(() => import('@/admin/pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const EmployeeManagement = lazy(() => import('@/admin/pages/EmployeeManagement').then(m => ({ default: m.EmployeeManagement })));
const DepartmentManagement = lazy(() => import('@/admin/pages/DepartmentManagement').then(m => ({ default: m.DepartmentManagement })));
const RolePermissions = lazy(() => import('@/admin/pages/RolePermissions').then(m => ({ default: m.RolePermissions })));
const XPAchievements = lazy(() => import('@/admin/pages/XPAchievements').then(m => ({ default: m.XPAchievements })));
const Analytics = lazy(() => import('@/admin/pages/Analytics').then(m => ({ default: m.Analytics })));
const Settings = lazy(() => import('@/admin/pages/Settings').then(m => ({ default: m.Settings })));
const AuditLogs = lazy(() => import('@/admin/pages/AuditLogs').then(m => ({ default: m.AuditLogs })));
const BulkImport = lazy(() => import('@/admin/pages/BulkImport').then(m => ({ default: m.BulkImport })));
const EmployeeForm = lazy(() => import('@/admin/pages/EmployeeForm').then(m => ({ default: m.EmployeeForm })));
const ReimbursementAdmin = lazy(() => import('@/admin/pages/ReimbursementAdmin').then(m => ({ default: m.ReimbursementAdmin })));
const ReimbursementSettings = lazy(() => import('@/admin/pages/ReimbursementSettings').then(m => ({ default: m.ReimbursementSettings })));
const InvoicesAdmin = lazy(() => import('@/admin/pages/InvoicesAdmin').then(m => ({ default: m.InvoicesAdmin })));
const SecurityManagementPage = lazy(() => import('@/admin/pages/SecurityManagementPage').then(m => ({ default: m.SecurityManagementPage })));
const ProjectsAdminPage = lazy(() => import('@/admin/pages/ProjectsAdminPage').then(m => ({ default: m.ProjectsAdminPage })));
const KnowledgeDocumentsAdmin = lazy(() => import('@/admin/pages/knowledge/KnowledgeDocumentsAdmin').then(m => ({ default: m.KnowledgeDocumentsAdmin })));
const KnowledgeCategoriesAdmin = lazy(() => import('@/admin/pages/knowledge/KnowledgeCategoriesAdmin').then(m => ({ default: m.KnowledgeCategoriesAdmin })));
const KnowledgeCollectionsAdmin = lazy(() => import('@/admin/pages/knowledge/KnowledgeCollectionsAdmin').then(m => ({ default: m.KnowledgeCollectionsAdmin })));
const KnowledgeFlagsAdmin = lazy(() => import('@/admin/pages/knowledge/KnowledgeFlagsAdmin').then(m => ({ default: m.KnowledgeFlagsAdmin })));
const KnowledgeComplianceAdmin = lazy(() => import('@/admin/pages/knowledge/KnowledgeComplianceAdmin').then(m => ({ default: m.KnowledgeComplianceAdmin })));
const KnowledgeAdminDashboard = lazy(() => import('@/admin/pages/knowledge/KnowledgeAdminDashboard').then(m => ({ default: m.KnowledgeAdminDashboard })));
const AdminKnowledgeRolesPage = lazy(() => import('@/admin/pages/knowledge/AdminKnowledgeRolesPage').then(m => ({ default: m.AdminKnowledgeRolesPage })));
const AdminTeamsPage = lazy(() => import('@/admin/pages/knowledge/AdminTeamsPage').then(m => ({ default: m.AdminTeamsPage })));
const AdminPendingReviewsPage = lazy(() => import('@/admin/pages/knowledge/AdminPendingReviewsPage').then(m => ({ default: m.AdminPendingReviewsPage })));
const AdminAuditLogPage = lazy(() => import('@/admin/pages/knowledge/AdminAuditLogPage').then(m => ({ default: m.AdminAuditLogPage })));
const AISettingsPage = lazy(() => import('@/admin/pages/AISettingsPage').then(m => ({ default: m.AISettingsPage })));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, mustChangePassword } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (mustChangePassword && location.pathname !== '/force-password-change') {
    return <Navigate to="/force-password-change" replace />;
  }
  return <>{children}</>;
}

function MainApp() {
  const { user } = useAuthStore();

  if (!user) return null;

  return (
    <ReimbursementProvider>
      <AppShell />
    </ReimbursementProvider>
  );
}

function App() {
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (hasHydrated) return;
    const t = setTimeout(() => {
      useAuthStore.setState({ _hasHydrated: true });
    }, 150);
    return () => clearTimeout(t);
  }, [hasHydrated]);

  // Connect socket for any authenticated user (main app or admin) so presence (online/offline) works. Must be before any early return to satisfy Rules of Hooks.
  useEffect(() => {
    if (user?.id) connectSocket(user.id);
  }, [user?.id]);

  if (!hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app">
        <div className="text-app-muted">Loading…</div>
      </div>
    );
  }

  return (
    <>
      {user && <NotificationSocketSubscriber />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/force-password-change" element={<RequireAuth><ForcePasswordChangePage /></RequireAuth>} />
        <Route path="/approvals" element={<Navigate to="/admin/reimbursements" replace />} />
        <Route path="/admin" element={<AdminGuard />}>
          <Route element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-app"><div className="text-app-muted">Loading admin...</div></div>}><AdminLayout /></Suspense>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="security" element={<SecurityManagementPage />} />
            <Route path="employees" element={<EmployeeManagement />} />
            <Route path="employees/new" element={<EmployeeForm />} />
            <Route path="employees/:id" element={<EmployeeForm />} />
            <Route path="departments" element={<DepartmentManagement />} />
            <Route path="roles" element={<RolePermissions />} />
            <Route path="xp-achievements" element={<XPAchievements />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
            <Route path="reimbursements" element={<ReimbursementAdmin />} />
            <Route path="reimbursements/settings" element={<ReimbursementSettings />} />
            <Route path="invoices" element={<InvoicesAdmin />} />
            <Route path="audit" element={<AuditLogs />} />
            <Route path="import" element={<BulkImport />} />
            <Route path="projects" element={<ProjectsAdminPage />} />
            <Route path="talent-heatmap" element={<Navigate to="projects?tab=talent-heatmap" replace />} />
            <Route path="knowledge/documents" element={<KnowledgeDocumentsAdmin />} />
            <Route path="knowledge/categories" element={<KnowledgeCategoriesAdmin />} />
            <Route path="knowledge/collections" element={<KnowledgeCollectionsAdmin />} />
            <Route path="knowledge/flags" element={<KnowledgeFlagsAdmin />} />
            <Route path="knowledge/compliance" element={<KnowledgeComplianceAdmin />} />
            <Route path="knowledge/dashboard" element={<KnowledgeAdminDashboard />} />
            <Route path="knowledge/roles" element={<AdminKnowledgeRolesPage />} />
            <Route path="knowledge/teams" element={<AdminTeamsPage />} />
            <Route path="knowledge/reviews" element={<AdminPendingReviewsPage />} />
            <Route path="knowledge/audit" element={<AdminAuditLogPage />} />
            <Route path="ai-settings" element={<AISettingsPage />} />
          </Route>
        </Route>
        <Route path="/bounties" element={<AuthGuard><Navigate to="/projects" replace /></AuthGuard>} />
        <Route path="/*" element={
          <AuthGuard>
            <MainApp />
          </AuthGuard>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;

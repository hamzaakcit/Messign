import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout';
import { useAuthStore } from '@/stores/authStore';
import { connectSocket } from '@/lib/socket';
import { NotificationSocketSubscriber } from '@/components/notifications/NotificationSocketSubscriber';
import { AdminGuard } from '@/admin/AdminGuard';
import { AdminLayout } from '@/admin/layouts/AdminLayout';
import { AdminDashboard } from '@/admin/pages/AdminDashboard';
import { EmployeeManagement } from '@/admin/pages/EmployeeManagement';
import { DepartmentManagement } from '@/admin/pages/DepartmentManagement';
import { RolePermissions } from '@/admin/pages/RolePermissions';
import { XPAchievements } from '@/admin/pages/XPAchievements';
import { Analytics } from '@/admin/pages/Analytics';
import { Settings } from '@/admin/pages/Settings';
import { AuditLogs } from '@/admin/pages/AuditLogs';
import { BulkImport } from '@/admin/pages/BulkImport';
import { EmployeeForm } from '@/admin/pages/EmployeeForm';
import { ReimbursementAdmin } from '@/admin/pages/ReimbursementAdmin';
import { ReimbursementSettings } from '@/admin/pages/ReimbursementSettings';
import { InvoicesAdmin } from '@/admin/pages/InvoicesAdmin';
import { ReimbursementProvider } from '@/contexts/ReimbursementContext';
import { LoginPage } from '@/pages/LoginPage';
import { ForcePasswordChangePage } from '@/pages/ForcePasswordChangePage';
import { SecurityManagementPage } from '@/admin/pages/SecurityManagementPage';
import { ProjectsAdminPage } from '@/admin/pages/ProjectsAdminPage';
import { KnowledgeDocumentsAdmin } from '@/admin/pages/knowledge/KnowledgeDocumentsAdmin';
import { KnowledgeCategoriesAdmin } from '@/admin/pages/knowledge/KnowledgeCategoriesAdmin';
import { KnowledgeCollectionsAdmin } from '@/admin/pages/knowledge/KnowledgeCollectionsAdmin';
import { KnowledgeFlagsAdmin } from '@/admin/pages/knowledge/KnowledgeFlagsAdmin';
import { KnowledgeComplianceAdmin } from '@/admin/pages/knowledge/KnowledgeComplianceAdmin';
import { KnowledgeAdminDashboard } from '@/admin/pages/knowledge/KnowledgeAdminDashboard';
import { AdminKnowledgeRolesPage } from '@/admin/pages/knowledge/AdminKnowledgeRolesPage';
import { AdminTeamsPage } from '@/admin/pages/knowledge/AdminTeamsPage';
import { AdminPendingReviewsPage } from '@/admin/pages/knowledge/AdminPendingReviewsPage';
import { AdminAuditLogPage } from '@/admin/pages/knowledge/AdminAuditLogPage';
import { AISettingsPage } from '@/admin/pages/AISettingsPage';

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
        <Route path="/force-password-change" element={<RequireAuth><ForcePasswordChangePage /></RequireAuth>} />
        <Route path="/approvals" element={<Navigate to="/admin/reimbursements" replace />} />
        <Route path="/admin" element={<AdminGuard />}>
          <Route element={<AdminLayout />}>
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

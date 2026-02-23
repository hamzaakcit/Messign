import { Outlet } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';
import { NotificationPanel } from '@/components/notifications';

/**
 * Admin layout: fixed 280px sidebar + main content. Nested routes render in Outlet.
 */
export function AdminLayout() {
  return (
    <div className="flex h-screen bg-app text-app transition-colors duration-200">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-[300px] focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-500 focus:text-white focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary-500"
      >
        Skip to main content
      </a>
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-app-border flex items-center justify-end px-4 bg-app-sidebar transition-colors duration-200">
          <NotificationPanel />
        </header>
        <main id="admin-main" className="flex-1 overflow-auto" role="main" aria-label="Admin content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

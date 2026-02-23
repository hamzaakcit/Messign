import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUIStore } from '@/stores/uiStore';
import { Card } from '@/components/ui';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SettingsView() {
  const { user } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const { leftSidebarCollapsed, rightSidebarCollapsed, setLeftSidebarCollapsed, setRightSidebarCollapsed } = useUIStore();

  return (
    <div className="h-full overflow-auto bg-app transition-colors duration-200">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <h2 className="text-lg font-semibold text-app">Settings</h2>

        {/* Appearance / Theme */}
        <Card className="p-6">
          <h3 className="font-medium text-app mb-1">Appearance</h3>
          <p className="text-app-muted text-sm mb-4">
            Choose how Messign Workspace looks. Your preference is saved and applied across sessions.
          </p>
          <div className="flex items-center gap-3">
            <span className="text-sm text-app-muted">Theme</span>
            <div className="flex rounded-lg border border-app overflow-hidden bg-app-hover">
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors',
                    theme === t
                      ? 'bg-primary-500 text-white'
                      : 'text-app-muted hover:text-app hover:bg-app-hover'
                  )}
                  aria-pressed={theme === t}
                  aria-label={`Use ${t} theme`}
                >
                  {t === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  {t === 'dark' ? 'Dark' : 'Light'}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Layout */}
        <Card className="p-6">
          <h3 className="font-medium text-app mb-1">Layout</h3>
          <p className="text-app-muted text-sm mb-4">
            Control sidebar visibility across all pages (Dashboard, Chat, Knowledge Hub, Projects, etc.). When expanded, the left sidebar shows labels and the right sidebar shows full content. Your preference is saved and applied everywhere.
          </p>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="layout-left" className="text-sm text-app">
                Left sidebar expanded
              </label>
              <button
                id="layout-left"
                role="switch"
                aria-checked={!leftSidebarCollapsed}
                onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors duration-200',
                  leftSidebarCollapsed ? 'bg-app-hover' : 'bg-primary-500'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 ease-in-out',
                    leftSidebarCollapsed ? 'left-1' : 'left-6'
                  )}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <label htmlFor="layout-right" className="text-sm text-app">
                Right sidebar expanded
              </label>
              <button
                id="layout-right"
                role="switch"
                aria-checked={!rightSidebarCollapsed}
                onClick={() => setRightSidebarCollapsed(!rightSidebarCollapsed)}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors duration-200',
                  rightSidebarCollapsed ? 'bg-app-hover' : 'bg-primary-500'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 ease-in-out',
                    rightSidebarCollapsed ? 'left-1' : 'left-6'
                  )}
                />
              </button>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-app-muted text-sm">
            Profile, notifications, and preferences can be configured here. This page is a placeholder for future settings.
          </p>
          {user && (
            <p className="text-app-muted text-xs mt-2">
              Logged in as {user.email}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

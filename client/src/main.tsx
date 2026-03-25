import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { QueryProvider } from '@/providers/QueryProvider'
import { setOnUnauthorized } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
/** Apply persisted light/dark (`data-theme`) before any route; Settings is not mounted on /login. */
import '@/stores/themeStore'
import './styles/globals.css'

// Catch unhandled promise rejections globally — prevents silent failures
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
});

function AppWithAuthHandler() {
  useEffect(() => {
    setOnUnauthorized(() => {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    });
  }, []);
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryProvider>
        <BrowserRouter>
          <AppWithAuthHandler />
          <Toaster richColors position="top-right" visibleToasts={3} />
        </BrowserRouter>
      </QueryProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

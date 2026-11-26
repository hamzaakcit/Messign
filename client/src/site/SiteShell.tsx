import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { SiteFooter } from './SiteFooter';
import { SiteNav } from './SiteNav';
import './site.css';

/**
 * Chrome for the public website. It does not mount the workspace shell,
 * and it does not change the session.
 */
export function SiteShell(): JSX.Element {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    const previousBackground = document.body.style.background;
    const description = document.querySelector('meta[name="description"]');
    const created = !description;
    const meta = description ?? document.createElement('meta');
    const previousContent = meta.getAttribute('content');
    if (created) {
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      'content',
      'Messign Engage for customer engagement, and a separate line for wholesale business messaging.',
    );
    document.body.style.background = '#f3f5f8';
    return () => {
      document.body.style.background = previousBackground;
      if (created) meta.remove();
      else if (previousContent != null) meta.setAttribute('content', previousContent);
    };
  }, []);

  return (
    <div className="ms-site">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <SiteNav isAuthenticated={isAuthenticated} />
      <main id="content">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

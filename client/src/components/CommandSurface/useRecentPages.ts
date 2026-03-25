import { useState, useCallback } from 'react';

const STORAGE_KEY = 'messign-recent-pages';
const MAX_RECENT = 5;

export interface RecentPage {
  path: string;
  label: string;
}

function save(pages: RecentPage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  } catch {}
}

function load(): RecentPage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RecentPage[];
      const filtered = parsed.filter((p) => p.path !== '/notifications' && !p.path.startsWith('/notifications/'));
      if (filtered.length !== parsed.length) save(filtered);
      return filtered;
    }
  } catch {}
  return [];
}

export function useRecentPages() {
  const [recentPages, setRecentPages] = useState<RecentPage[]>(load);

  const trackPage = useCallback((path: string, label: string) => {
    if (path === '/notifications' || path.startsWith('/notifications/')) return;
    setRecentPages((prev) => {
      const filtered = prev.filter((p) => p.path !== path);
      const next = [{ path, label }, ...filtered].slice(0, MAX_RECENT);
      save(next);
      return next;
    });
  }, []);

  return { recentPages, trackPage };
}

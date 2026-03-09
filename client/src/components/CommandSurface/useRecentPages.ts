import { useState, useCallback } from 'react';

const STORAGE_KEY = 'messign-recent-pages';
const MAX_RECENT = 5;

export interface RecentPage {
  path: string;
  label: string;
}

function load(): RecentPage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as RecentPage[];
  } catch {}
  return [];
}

function save(pages: RecentPage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  } catch {}
}

export function useRecentPages() {
  const [recentPages, setRecentPages] = useState<RecentPage[]>(load);

  const trackPage = useCallback((path: string, label: string) => {
    setRecentPages((prev) => {
      const filtered = prev.filter((p) => p.path !== path);
      const next = [{ path, label }, ...filtered].slice(0, MAX_RECENT);
      save(next);
      return next;
    });
  }, []);

  return { recentPages, trackPage };
}

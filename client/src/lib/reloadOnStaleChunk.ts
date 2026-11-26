/**
 * After a deploy, a tab that was opened before it still points at the old page chunks (`ContentCalendarTab-FLKiUsD5.js`),
 * which the new deploy no longer has: "Failed to fetch dynamically imported module". Vite announces that as
 * `vite:preloadError`. The right response is to load the new version once. The guard keeps a real outage (a chunk that
 * is missing for good) from reloading forever: a second failure within the window is left to show its error.
 */

export const STALE_CHUNK_STORAGE_KEY = 'messign.staleChunkReloadAt';
export const STALE_CHUNK_WINDOW_MS = 30_000;

/** Reload unless one already happened in the last window. */
export function shouldReloadForStaleChunk(now: number, lastReloadAt: number | null): boolean {
  return lastReloadAt == null || now - lastReloadAt > STALE_CHUNK_WINDOW_MS;
}

interface Env {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  reload: () => void;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  now: () => number;
}

function readStamp(storage: Env['storage']): number | null {
  try {
    const raw = storage?.getItem(STALE_CHUNK_STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Starts listening. Returns true if the handler was installed. */
export function installStaleChunkReload(env: Env): void {
  env.addEventListener('vite:preloadError', (event) => {
    if (!shouldReloadForStaleChunk(env.now(), readStamp(env.storage))) return;
    event.preventDefault(); // we handle it: the page reloads instead of showing the error
    try {
      env.storage?.setItem(STALE_CHUNK_STORAGE_KEY, String(env.now()));
    } catch {
      /* storage blocked: reload anyway; a second failure will then reload once more, not forever, because the tab is new */
    }
    env.reload();
  });
}

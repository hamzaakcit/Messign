import { describe, expect, it, vi } from 'vitest';
import {
  installStaleChunkReload,
  shouldReloadForStaleChunk,
  STALE_CHUNK_STORAGE_KEY,
  STALE_CHUNK_WINDOW_MS,
} from '@/lib/reloadOnStaleChunk';

function setup(initialStamp?: number) {
  const listeners: Record<string, (e: Event) => void> = {};
  const store = new Map<string, string>(initialStamp != null ? [[STALE_CHUNK_STORAGE_KEY, String(initialStamp)]] : []);
  let now = 1_000_000;
  const reload = vi.fn();
  installStaleChunkReload({
    addEventListener: (type, listener) => { listeners[type] = listener; },
    reload,
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    now: () => now,
  });
  const fire = (): Event => {
    const event = new Event('vite:preloadError', { cancelable: true });
    listeners['vite:preloadError']?.(event);
    return event;
  };
  return { fire, reload, store, advance: (ms: number) => { now += ms; } };
}

describe('shouldReloadForStaleChunk', () => {
  it('reloads the first time, and not again inside the window', () => {
    expect(shouldReloadForStaleChunk(100_000, null)).toBe(true);
    expect(shouldReloadForStaleChunk(100_000 + STALE_CHUNK_WINDOW_MS, 100_000)).toBe(false);
    expect(shouldReloadForStaleChunk(100_001 + STALE_CHUNK_WINDOW_MS, 100_000)).toBe(true);
  });
});

describe('installStaleChunkReload', () => {
  it('loads the new version once when a page chunk is gone, and swallows that error', () => {
    const { fire, reload, store } = setup();
    const event = fire();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    expect(store.get(STALE_CHUNK_STORAGE_KEY)).toBe('1000000');
  });

  it('does not reload in a loop when the chunk is missing for good', () => {
    const { fire, reload, advance } = setup();
    fire();
    advance(5_000);
    const second = fire();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false); // the error is left to show
    advance(STALE_CHUNK_WINDOW_MS + 1);
    fire();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('respects a reload that happened just before this page loaded', () => {
    const { fire, reload } = setup(999_000);
    fire();
    expect(reload).not.toHaveBeenCalled();
  });
});

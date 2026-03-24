let accessToken: string | null = null;

/** Set once from authStore so getAccessToken() always matches Zustand (avoids stale module var vs rehydrate/login races). */
let readTokenFromStore: (() => string | null) | null = null;

/**
 * Wired from `authStore` after the store is created. Do not import the store here (circular graph).
 */
export function registerAccessTokenReader(fn: () => string | null): void {
  readTokenFromStore = fn;
}

export function getAccessToken(): string | null {
  // When the store reader is registered, it is the only source of truth — do not fall back to
  // the module cache, or a stale Bearer can be sent after logout or rehydrate (401 → login loop).
  if (readTokenFromStore != null) {
    return readTokenFromStore();
  }
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

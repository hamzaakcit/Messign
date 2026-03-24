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
  return readTokenFromStore?.() ?? accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

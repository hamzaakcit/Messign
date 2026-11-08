/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_ORIGIN?: string;
  /** When `1` or `true`, dev mode uses `VITE_API_URL` instead of same-origin `/api` (Vite proxy). */
  readonly VITE_FORCE_DIRECT_API?: string;
  /** Unlayer Developer Console → Project → Settings (integer project id). */
  readonly VITE_UNLAYER_PROJECT_ID?: string;
  /** `workspace` (default), `engage` or `all`. Pair with the server's PRODUCT_SURFACE. */
  readonly VITE_PRODUCT_SURFACE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

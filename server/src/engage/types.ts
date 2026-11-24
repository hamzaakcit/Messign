import type { ApiKeyScope } from './apiKeys.js';

export interface EngageUserContext {
  organizationId: string;
  userId: string;
  authUserId: string;
  role: string;
  orgSlug: string;
  /** The organization's product: `engage` for a tenant, `all` for the platform organization once enabled (ADR-016). */
  product: string;
}

export interface EngageApiKeyContext {
  organizationId: string;
  keyId: string;
  scopes: ApiKeyScope[];
}

declare global {
  namespace Express {
    interface Request {
      engageUser?: EngageUserContext;
      engageApiKey?: EngageApiKeyContext;
    }
  }
}

/**
 * Dora v2 context resolution — DB-backed, session-cached, tenant from auth (not client slug).
 */

import { query } from '../../../../db/index.js';
import { verifyAccess } from '../../../../utils/jwt.js';
import { buildDoraContext, toLegacyToolContext as mapRequestToTool } from '../../dora/context.js';
import type { ToolContext } from '../../types.js';
import { DoraPipelineError } from '../errors.js';
import type { AIMode, DoraContext } from '../types.js';
import type { ActiveViewStateV1 } from '../../agent/activeViewState.js';

const contextCache = new Map<string, { context: DoraContext; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

export function decodeJWT(token: string) {
  try {
    return verifyAccess(token);
  } catch {
    return null;
  }
}

export function invalidateContextCacheForUser(userId: string): void {
  for (const key of contextCache.keys()) {
    if (key.startsWith(`${userId}:`)) contextCache.delete(key);
  }
}

export function invalidateContextCacheForOrganization(organizationId: string): void {
  for (const key of contextCache.keys()) {
    if (key.includes(`:${organizationId}:`)) contextCache.delete(key);
  }
}

/**
 * Maps v2 DoraContext to the legacy ToolContext shape for executeTool.
 */
export function toLegacyToolContext(ctx: DoraContext): ToolContext {
  return mapRequestToTool(ctx.doraRequest);
}

export async function resolveContext(params: {
  userId: string;
  role?: string;
  organizationId: string;
  sessionId: string;
  pagePath: string;
  mode: AIMode;
  concise: boolean;
  timezone?: string;
  bearerToken?: string | null;
  activeViewState?: ActiveViewStateV1 | null;
  traceId?: string;
  idempotencyKey?: string;
}): Promise<DoraContext> {
  if (params.bearerToken) {
    const payload = decodeJWT(params.bearerToken);
    if (!payload || payload.sub !== params.userId) {
      throw new DoraPipelineError('unauthorized', 'Invalid or mismatched access token');
    }
    if (payload.organizationId && payload.organizationId !== params.organizationId) {
      throw new DoraPipelineError('unauthorized', 'Token organization does not match session');
    }
  }

  const viewKey =
    params.activeViewState != null ? JSON.stringify(params.activeViewState) : '';
  const cacheKey = `${params.userId}:${params.organizationId}:${params.sessionId}:${params.pagePath}:${viewKey}`;
  const now = Date.now();
  const hit = contextCache.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    return hit.context;
  }

  const doraRequest = await buildDoraContext(
    params.userId,
    params.role,
    params.pagePath,
    params.concise,
    params.organizationId,
    {
      activeViewState: params.activeViewState ?? null,
      requestMeta: {
        traceId: params.traceId,
        idempotencyKey: params.idempotencyKey,
      },
    },
  );

  if (!doraRequest.user.organizationId || doraRequest.user.organizationId !== params.organizationId) {
    throw new DoraPipelineError('context_resolution_failed', 'User organization context could not be resolved');
  }

  const slugResult = await query<{ slug: string }>(
    `SELECT slug FROM organizations WHERE id = $1::uuid LIMIT 1`,
    [params.organizationId],
  );
  const organizationSlug = slugResult.rows[0]?.slug ?? 'unknown';

  const ctx: DoraContext = {
    organizationId: params.organizationId,
    organizationSlug,
    userId: params.userId,
    userName: doraRequest.user.userName,
    userRole: doraRequest.user.userRole,
    knowledgeRole: doraRequest.user.knowledgeRole ?? undefined,
    teamId: doraRequest.user.teamId ?? undefined,
    department: doraRequest.user.department,
    sessionId: params.sessionId,
    pagePath: params.pagePath,
    mode: params.mode,
    concise: params.concise,
    today: doraRequest.timestamp.slice(0, 10),
    timezone: params.timezone ?? 'UTC',
    doraRequest,
  };

  contextCache.set(cacheKey, { context: ctx, expiresAt: now + TTL_MS });
  return ctx;
}

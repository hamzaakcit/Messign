export interface ResolveBody {
  installationId: string;
  environment: 'development' | 'staging' | 'production';
  mode: 'test' | 'live';
  audience: 'test' | 'live' | 'none';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Accepts a resolve JSON value only when the four published fields are present
 * and well typed. Extra properties, including any organization id, are dropped.
 * A cached or caller-supplied audience cannot arrive through this function
 * unless it was part of a body that already matched the schema.
 */
export function parseResolveBody(value: unknown): ResolveBody | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  if (typeof body.installationId !== 'string' || !UUID_RE.test(body.installationId)) return null;
  if (body.environment !== 'development' && body.environment !== 'staging' && body.environment !== 'production') return null;
  if (body.mode !== 'test' && body.mode !== 'live') return null;
  if (body.audience !== 'test' && body.audience !== 'live' && body.audience !== 'none') return null;
  return {
    installationId: body.installationId,
    environment: body.environment,
    mode: body.mode,
    audience: body.audience,
  };
}

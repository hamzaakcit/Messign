/**
 * Versioned, size-capped view state from the client (AgentContext / hydration).
 */
import { z } from 'zod';

const MAX_SERIALIZED_BYTES = 4096;

const stringMap = z.record(z.string(), z.string()).optional();

export const ActiveViewStateSchemaV1 = z
  .object({
    version: z.literal(1),
    currentPath: z.string().max(200).optional(),
    module: z.string().max(64).optional(),
    entityType: z.string().max(64).optional(),
    entityId: z.string().max(128).optional(),
    routeParams: stringMap,
    filters: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ActiveViewStateV1 = z.infer<typeof ActiveViewStateSchemaV1>;

function byteLengthUtf8(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/**
 * Parse client `viewState` or legacy `widgetContext` into v1 shape.
 * Unknown keys are rejected (.strict); missing version defaults to 1.
 */
export function parseActiveViewState(raw: unknown): { ok: true; value: ActiveViewStateV1 } | { ok: false; error: string } {
  if (raw == null) {
    return { ok: false, error: 'missing' };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'not_object' };
  }
  const o = raw as Record<string, unknown>;
  const withVersion = { ...o, version: o.version === 1 ? 1 : 1 };
  const parsed = ActiveViewStateSchemaV1.safeParse(withVersion);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.path.join('.') || i.message).join('; ');
    return { ok: false, error: msg };
  }
  const ser = JSON.stringify(parsed.data);
  if (byteLengthUtf8(ser) > MAX_SERIALIZED_BYTES) {
    return { ok: false, error: 'viewState too large' };
  }
  return { ok: true, value: parsed.data };
}

export function formatActiveViewHint(v: ActiveViewStateV1 | undefined): string {
  if (!v) return '';
  const parts: string[] = [];
  if (v.module) parts.push(`module=${v.module}`);
  if (v.entityType || v.entityId) parts.push(`entity=${v.entityType ?? '?'}/${v.entityId ?? '?'}`);
  if (v.currentPath) parts.push(`path=${v.currentPath}`);
  return parts.join(', ');
}

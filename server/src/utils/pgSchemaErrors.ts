/**
 * Postgres: undefined_table (42P01) or undefined_column (42703).
 * Used to degrade gracefully when optional migrations are not applied yet.
 */
export function isMissingSchemaObjectError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  const code = String((err as { code: unknown }).code);
  return code === '42P01' || code === '42703';
}

const ROLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Role the RLS check switches into. Defaults to `messign_app`.
 * Rejects anything that is not a plain identifier so the name can be
 * interpolated into `SET LOCAL ROLE`.
 */
export function rlsVerifyRoleName(raw: string | undefined): string {
  const name = (raw ?? 'messign_app').trim() || 'messign_app';
  if (!ROLE_NAME.test(name)) {
    throw new Error('RLS_VERIFY_ROLE must be a plain Postgres role name.');
  }
  return name;
}

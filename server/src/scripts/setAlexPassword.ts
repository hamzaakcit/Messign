/**
 * Sets `employee_auth.password_hash` for alex.chen@messign.com to bcrypt(SEED_DEFAULT_PASSWORD).
 * Use the same `SEED_DEFAULT_PASSWORD` everywhere (local `.env`, Railway, etc.) so login matches `db:seed`.
 *
 * Usage (from `server/`):
 *   npm run auth:set-alex
 * Or with an explicit password once:
 *   SEED_DEFAULT_PASSWORD=test123 npm run auth:set-alex
 *
 * Requires DATABASE_URL (and optional DATABASE_PUBLIC_URL) pointing at the DB to update.
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { clearLock, getByEmail, updatePassword } from '../db/employeeAuthDb.js';

const ALEX_EMAIL = 'alex.chen@messign.com';
const SALT_ROUNDS = 12;

function resolvePassword(): string {
  const fromEnv = process.env.SEED_DEFAULT_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  // Matches server/.env.example when env is not loaded (e.g. CI) — keep in sync with .env.example
  return 'test123';
}

async function main(): Promise<void> {
  const password = resolvePassword();
  const auth = await getByEmail(ALEX_EMAIL);
  if (!auth) {
    console.error(
      `[auth:set-alex] No employee_auth row for ${ALEX_EMAIL}. Run npm run db:seed (with SEED_DEFAULT_PASSWORD set) first.`
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const history = [passwordHash];

  await updatePassword({
    auth_user_id: auth.auth_user_id,
    password_hash: passwordHash,
    password_history: history,
    temporary_password: null,
    must_change_password: false,
    updated_by: 'setAlexPassword-script',
  });

  await clearLock(auth.auth_user_id);

  console.log(`[auth:set-alex] Password updated for ${ALEX_EMAIL} (length ${password.length}).`);
  console.log('[auth:set-alex] Set SEED_DEFAULT_PASSWORD to the same value on the API host (e.g. Railway) so seed-login fallback stays consistent.');
}

main().catch((e) => {
  console.error('[auth:set-alex]', e);
  process.exit(1);
});

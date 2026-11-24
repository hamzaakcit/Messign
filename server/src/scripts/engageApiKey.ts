/**
 * A tenant's API keys from an operator's terminal (WP-31): list them, and revoke one (the response to a leaked key). A revoked key
 * is refused on its next request. The audit log records the revocation as done by `operator:api-key`. Needs ENGAGE_DATABASE_URL.
 *
 *   npm run engage:api-key -- list   --org <uuid>
 *   npm run engage:api-key -- revoke --org <uuid> --id <key uuid>
 */
import 'dotenv/config';
import { setOperatorActor } from '../engage/actor.js';
import { listApiKeys, revokeApiKey } from '../engage/apiKeyAdmin.js';
import { closeEngagePool } from '../engage/db.js';
import { parseApiKeyArgs } from './engageApiKeyArgs.js';

async function main(): Promise<void> {
  setOperatorActor('api-key'); // the audit log names this script as the actor
  let cmd;
  try { cmd = parseApiKeyArgs(process.argv.slice(2)); } catch (err) { console.error(err instanceof Error ? err.message : err); process.exit(2); }
  if (cmd.action === 'list') {
    const keys = await listApiKeys(cmd.org);
    console.log(`[engage] ${keys.length} API key(s)`);
    for (const k of keys) console.log(`  ${k.id}  ${k.prefix}  ${k.revokedAt ? 'REVOKED' : 'active '}  scopes=${k.scopes.join(',')}  last used ${k.lastUsedAt ?? 'never'}  (${k.name})`);
  } else {
    const done = await revokeApiKey(cmd.org, cmd.id);
    console.log(done ? '[engage] revoked: the key is refused from its next request' : '[engage] no active key with that id for this organization (already revoked, or the id is wrong)');
    if (!done) process.exitCode = 1;
  }
  await closeEngagePool();
}

main().then(() => process.exit(process.exitCode ?? 0), (err) => { console.error('[engage] api-key failed:', err instanceof Error ? err.message : err); process.exit(1); });

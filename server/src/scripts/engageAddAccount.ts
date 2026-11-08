/**
 * Stores a messaging channel account (credentials encrypted under ENGAGE_MASTER_KEY) for one tenant, from your own
 * terminal. The secret values are typed at a hidden prompt: they never appear in arguments, shell history or chat.
 *
 *   npm run engage:add-account -- --org <org uuid> --channel email --provider ses --mode test --label "SES sandbox" \
 *     --config region=eu-central-1 --config from_address=hello@example.com --config sns_topic_arn=arn:aws:sns:... \
 *     --secret access_key_id --secret secret_access_key
 *
 * Needs ENGAGE_DATABASE_URL and the PRODUCTION ENGAGE_MASTER_KEY / ENGAGE_MASTER_KEY_ID (in the environment, or typed at
 * hidden prompts with --ask-master-key): a key encrypted with any other master key cannot be read by the server. Prints the account id and the non-secret fingerprint only.
 */
import 'dotenv/config';
import { createAccount, parseCreateInput } from '../engage/credentials.js';
import { closeEngagePool } from '../engage/db.js';
import { parseAddAccountArgs } from './engageAddAccountArgs.js';
import { promptHidden } from './hiddenPrompt.js';

async function main(): Promise<void> {
  // --ask-master-key: ask for the production master key at a hidden prompt instead of reading it from the environment
  // (useful when each command runs in a fresh shell, where an earlier `export` does not carry over).
  const argv = process.argv.slice(2);
  const askMaster = argv.includes('--ask-master-key');
  const a = parseAddAccountArgs(argv.filter((x) => x !== '--ask-master-key'));
  if (askMaster) {
    process.env.ENGAGE_MASTER_KEY = await promptHidden('ENGAGE_MASTER_KEY (hidden): ');
    process.env.ENGAGE_MASTER_KEY_ID = await promptHidden('ENGAGE_MASTER_KEY_ID (hidden): ');
  }
  const secrets: Record<string, string> = {};
  for (const name of a.secretNames) secrets[name] = await promptHidden(`${name} (hidden): `);
  const input = parseCreateInput({ channel: a.channel, provider: a.provider, mode: a.mode, label: a.label, config: a.config, secrets });
  const meta = await createAccount(a.org, a.createdBy, input);
  console.log(`[engage] stored ${meta.provider} ${meta.channel} account (${meta.mode}) "${meta.label}"`);
  console.log(`  account id:  ${meta.id}`);
  console.log(`  fingerprint: ${meta.fingerprint}`);
  console.log(`  webhook URL: /api/engage/webhooks/${meta.id}`);
  await closeEngagePool();
}

main().catch((err) => { console.error('[engage] add-account failed:', err instanceof Error ? err.message : err); process.exit(1); });

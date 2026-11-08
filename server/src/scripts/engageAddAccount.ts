/**
 * Stores a messaging channel account (credentials encrypted under ENGAGE_MASTER_KEY) for one tenant, from your own
 * terminal. The secret values are typed at a hidden prompt: they never appear in arguments, shell history or chat.
 *
 *   npm run engage:add-account -- --org <org uuid> --channel email --provider ses --mode test --label "SES sandbox" \
 *     --config region=eu-central-1 --config from_address=hello@example.com --config sns_topic_arn=arn:aws:sns:... \
 *     --secret access_key_id --secret secret_access_key
 *
 * Needs ENGAGE_DATABASE_URL and the PRODUCTION ENGAGE_MASTER_KEY / ENGAGE_MASTER_KEY_ID: a key encrypted with any other
 * master key cannot be read by the server. Prints the account id and the non-secret fingerprint only.
 */
import 'dotenv/config';
import { createInterface } from 'readline';
import { createAccount, parseCreateInput } from '../engage/credentials.js';
import { closeEngagePool } from '../engage/db.js';
import { parseAddAccountArgs } from './engageAddAccountArgs.js';

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) { reject(new Error('Secrets are only read from an interactive terminal.')); return; }
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WritableStream };
    let muted = false;
    out._writeToOutput = (s: string) => { if (!muted) out.output.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer.trim()); });
    muted = true;
  });
}

async function main(): Promise<void> {
  const a = parseAddAccountArgs(process.argv.slice(2));
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

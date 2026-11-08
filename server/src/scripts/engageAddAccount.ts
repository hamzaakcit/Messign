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
import { createAccount, parseCreateInput } from '../engage/credentials.js';
import { closeEngagePool } from '../engage/db.js';
import { parseAddAccountArgs } from './engageAddAccountArgs.js';

/**
 * Reads one secret from the terminal without echoing it. Raw mode, no readline: the prompt is written once and nothing
 * redraws it. Paste works (a whole chunk at once), Backspace edits, Ctrl+C cancels, terminal escape sequences are
 * dropped. After Enter it prints only how many characters were read, so an empty paste is obvious.
 */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') { reject(new Error('Secrets are only read from an interactive terminal.')); return; }
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    let inEscape = false;
    const finish = () => { stdin.removeListener('data', onData); stdin.setRawMode(false); stdin.pause(); };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (inEscape) { if (/[A-Za-z~]/.test(ch)) inEscape = false; continue; }
        if (ch === '\u001b') { inEscape = true; continue; }
        if (ch === '\r' || ch === '\n') {
          finish();
          process.stdout.write(`\n  (${buf.trim().length} characters read)\n`);
          resolve(buf.trim());
          return;
        }
        if (ch === '\u0003') { finish(); process.stdout.write('\n'); reject(new Error('Cancelled.')); return; }
        if (ch === '\u007f' || ch === '\b') { buf = buf.slice(0, -1); continue; }
        if (ch >= ' ') buf += ch;
      }
    };
    stdin.on('data', onData);
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

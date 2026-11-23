/** Argument parsing for `npm run engage:allowlist` (kept apart from the script so it can be tested without a database). */
export type AllowlistCommand =
  | { action: 'list'; org: string }
  | { action: 'add'; org: string; channel: 'email' | 'sms' | 'whatsapp'; values: string[]; label?: string }
  | { action: 'remove'; org: string; id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNELS = ['email', 'sms', 'whatsapp'] as const;

export const ALLOWLIST_USAGE = `Usage:
  npm run engage:allowlist -- list   --org <uuid>
  npm run engage:allowlist -- add    --org <uuid> --channel email|sms|whatsapp --value <address or number> [--value ...] [--label "staff"]
  npm run engage:allowlist -- remove --org <uuid> --id <entry uuid>`;

export function parseAllowlistArgs(argv: string[]): AllowlistCommand {
  const [action, ...rest] = argv;
  if (action !== 'list' && action !== 'add' && action !== 'remove') throw new Error(`The first argument must be list, add or remove.\n${ALLOWLIST_USAGE}`);
  const single = new Map<string, string>();
  const values: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (!a.startsWith('--')) throw new Error(`Unexpected argument "${a}"`);
    const v = rest[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
    i++;
    const name = a.slice(2);
    if (name === 'value') values.push(v);
    else if (['org', 'channel', 'label', 'id'].includes(name)) {
      if (single.has(name)) throw new Error(`${a} given twice`);
      single.set(name, v);
    } else throw new Error(`Unknown option ${a}`);
  }
  const org = single.get('org');
  if (!org || !UUID_RE.test(org)) throw new Error('--org must be an organization UUID');
  if (action === 'list') return { action, org };
  if (action === 'remove') {
    const id = single.get('id');
    if (!id || !UUID_RE.test(id)) throw new Error('--id must be an allow-list entry UUID (see list)');
    return { action, org, id };
  }
  const channel = single.get('channel');
  if (!channel || !(CHANNELS as readonly string[]).includes(channel)) throw new Error('--channel must be email, sms or whatsapp');
  if (values.length === 0) throw new Error('add needs at least one --value');
  if (values.length > 200) throw new Error('add takes at most 200 values at a time');
  return { action, org, channel: channel as 'email' | 'sms' | 'whatsapp', values, ...(single.has('label') ? { label: single.get('label')! } : {}) };
}

/** Argument parsing for `npm run engage:api-key` (kept apart from the script so it can be tested without a database or .env). */
export type ApiKeyCommand = { action: 'list'; org: string } | { action: 'revoke'; org: string; id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const API_KEY_USAGE = `Usage:
  npm run engage:api-key -- list   --org <uuid>
  npm run engage:api-key -- revoke --org <uuid> --id <key uuid>`;

export function parseApiKeyArgs(argv: string[]): ApiKeyCommand {
  const [action, ...rest] = argv;
  if (action !== 'list' && action !== 'revoke') throw new Error(`The first argument must be list or revoke.\n${API_KEY_USAGE}`);
  const got = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i];
    const v = rest[i + 1];
    if (!name?.startsWith('--') || !['--org', '--id'].includes(name)) throw new Error(`Unexpected argument "${name ?? ''}"\n${API_KEY_USAGE}`);
    if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a value`);
    if (got.has(name)) throw new Error(`${name} given twice`);
    got.set(name, v);
  }
  const org = got.get('--org');
  if (!org || !UUID_RE.test(org)) throw new Error('--org must be an organization UUID');
  if (action === 'list') {
    if (got.has('--id')) throw new Error('list does not take --id');
    return { action, org };
  }
  const id = got.get('--id');
  if (!id || !UUID_RE.test(id)) throw new Error('--id must be the UUID of the key (from list)');
  return { action, org, id };
}

/**
 * Argument parsing for `npm run engage:add-account`. Secrets are NEVER read from arguments: only their NAMES are
 * given (--secret access_key_id), and the script asks for each value with hidden input.
 */
export interface AddAccountArgs {
  org: string;
  channel: string;
  provider: string;
  mode: string;
  label: string;
  createdBy: string | null;
  config: Record<string, string | number | boolean>;
  secretNames: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAddAccountArgs(argv: string[]): AddAccountArgs {
  const single = new Map<string, string>();
  const config: AddAccountArgs['config'] = {};
  const secretNames: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) throw new Error(`Unexpected argument "${a}"`);
    const name = a.slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`);
    i++;
    if (name === 'config') {
      const eq = v.indexOf('=');
      if (eq < 1) throw new Error('--config must look like name=value');
      const k = v.slice(0, eq);
      const raw = v.slice(eq + 1);
      config[k] = raw === 'true' ? true : raw === 'false' ? false : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
    } else if (name === 'secret') {
      secretNames.push(v);
    } else if (['org', 'channel', 'provider', 'mode', 'label', 'created-by'].includes(name)) {
      if (single.has(name)) throw new Error(`--${name} given twice`);
      single.set(name, v);
    } else {
      throw new Error(`Unknown option --${name}`);
    }
  }
  const need = (n: string): string => {
    const v = single.get(n);
    if (!v) throw new Error(`Missing --${n}`);
    return v;
  };
  const org = need('org');
  if (!UUID_RE.test(org)) throw new Error('--org must be the organization UUID');
  const createdBy = single.get('created-by') ?? null;
  if (createdBy !== null && !UUID_RE.test(createdBy)) throw new Error('--created-by must be a user UUID');
  if (secretNames.length === 0) throw new Error('Give at least one --secret <name> (its value is asked for, hidden)');
  return { org, channel: need('channel'), provider: need('provider'), mode: need('mode'), label: need('label'), createdBy, config, secretNames };
}

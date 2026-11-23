/**
 * Argument parsing for `npm run engage:add-account`. Secrets are NEVER read from arguments: only their NAMES are
 * given (--secret access_key_id), and the script asks for each value with hidden input.
 *
 * `--whatsapp` (no value) is the WhatsApp Cloud API preset (WP-40c): channel whatsapp, provider whatsapp_cloud, and the three
 * secrets the adapter reads (access_token, app_secret, verify_token) unless --secret names others. A WhatsApp account without
 * `--config waba_id=` or `--config phone_number_id=` is still stored, with a warning: the template check and the template status
 * webhook need the WhatsApp Business Account id, and nothing can be sent without the phone number id.
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
  /** Things the account will lack (shown by the script, never fatal). */
  warnings: string[];
}

export const WHATSAPP_PRESET = { channel: 'whatsapp', provider: 'whatsapp_cloud', secrets: ['access_token', 'app_secret', 'verify_token'] } as const;

/**
 * A config value as typed: true/false and plain numbers become booleans and numbers, except ids. Meta's ids (waba_id,
 * phone_number_id) are 15 to 17 digits and would lose digits as a JavaScript number, so a key ending in `_id` stays text.
 */
export function configValue(key: string, raw: string): string | number | boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (key.endsWith('_id') || !/^-?\d+(\.\d+)?$/.test(raw)) return raw;
  const n = Number(raw);
  return Number.isSafeInteger(n) || !Number.isInteger(n) ? n : raw;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAddAccountArgs(argv: string[]): AddAccountArgs {
  const single = new Map<string, string>();
  const config: AddAccountArgs['config'] = {};
  const secretNames: string[] = [];
  let preset = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) throw new Error(`Unexpected argument "${a}"`);
    const name = a.slice(2);
    if (name === 'whatsapp') { preset = true; continue; }
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`);
    i++;
    if (name === 'config') {
      const eq = v.indexOf('=');
      if (eq < 1) throw new Error('--config must look like name=value');
      const k = v.slice(0, eq);
      const raw = v.slice(eq + 1);
      config[k] = configValue(k, raw);
    } else if (name === 'secret') {
      secretNames.push(v);
    } else if (['org', 'channel', 'provider', 'mode', 'label', 'created-by'].includes(name)) {
      if (single.has(name)) throw new Error(`--${name} given twice`);
      single.set(name, v);
    } else {
      throw new Error(`Unknown option --${name}`);
    }
  }
  if (preset) {
    for (const [k, v] of [['channel', WHATSAPP_PRESET.channel], ['provider', WHATSAPP_PRESET.provider]] as const) {
      if (single.has(k) && single.get(k) !== v) throw new Error(`--whatsapp sets --${k} ${v}; remove --${k} ${single.get(k)}`);
      single.set(k, v);
    }
    if (secretNames.length === 0) secretNames.push(...WHATSAPP_PRESET.secrets);
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
  const channel = need('channel');
  const provider = need('provider');
  const warnings: string[] = [];
  if (channel === 'whatsapp' && provider === WHATSAPP_PRESET.provider) {
    if (config.phone_number_id === undefined) warnings.push('No --config phone_number_id=<id>: nothing can be sent until the account is rotated with it (WhatsApp Manager > API Setup).');
    if (config.waba_id === undefined) warnings.push('No --config waba_id=<WhatsApp Business Account id>: the template check and Meta\'s template status webhook cannot run for this account until it is rotated with it.');
  }
  return { org, channel, provider, mode: need('mode'), label: need('label'), createdBy, config, secretNames, warnings };
}

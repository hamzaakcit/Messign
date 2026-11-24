/** Arguments of `npm run engage:whatsapp-check` (WP-27 live check, extended for the WP-40 live check). Pure, so it is tested. */
import { configValue } from './engageAddAccountArgs.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WhatsappCheckArgs {
  org: string; account: string;
  /** The number to message: the person running the check, in international form. */
  to: string;
  template: string; language: string;
  /** The values of the template's body variables, in order ({{1}}, {{2}} ...). */
  params: string[];
  purpose: 'marketing' | 'transactional';
  prepare: boolean; report: boolean; askMasterKey: boolean;
  /** Diagnose webhook delivery: is the app subscribed to this WhatsApp Business Account (Meta's subscribed_apps)? */
  webhooks: boolean;
  /** With --webhooks: subscribe the app to the account if it is not. */
  subscribe: boolean;
  /** The WhatsApp Business Account id (not secret), for --webhooks. */
  waba: string | null;
  /** WP-40: run the template check against Meta and print the mirror, its history and the Settings checklist. Sends nothing. */
  templates: boolean;
  /** WP-40: rotate the account (a new access token at a hidden prompt, Enter keeps it) with --config changes merged in. */
  rotate: boolean;
  config: Record<string, string | number | boolean>;
  /** WP-40: the text-header value and the URL-button value of the template sent. */
  headerParam: string | null;
  buttonParam: string | null;
}

export class ArgError extends Error {}

/** The sample template Meta gives a new test number in its dashboard (Order Confirmation), with the three values it takes. */
export const DEFAULT_TEMPLATE = 'jaspers_market_order_confirmation_v1';
export const defaultParams = (now: Date = new Date()): string[] => ['John Doe', '123456', now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })];

export function parseWhatsappCheckArgs(argv: string[]): WhatsappCheckArgs {
  const flags = new Set(['--prepare', '--report', '--ask-master-key', '--webhooks', '--subscribe', '--templates', '--rotate']);
  const config: WhatsappCheckArgs['config'] = {};
  const values = new Map<string, string>();
  const params: string[] = [];
  const on = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (flags.has(a)) { on.add(a); continue; }
    if (!a.startsWith('--')) throw new ArgError(`Unexpected argument "${a}"`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new ArgError(`Missing value for ${a}`);
    if (!['--org', '--account', '--to', '--template', '--language', '--purpose', '--param', '--waba', '--config', '--header-param', '--button-param'].includes(a)) throw new ArgError(`Unknown option ${a}`);
    if (a === '--param') params.push(v);
    else if (a === '--config') {
      const eq = v.indexOf('=');
      if (eq < 1) throw new ArgError('--config must look like name=value');
      config[v.slice(0, eq)] = configValue(v.slice(0, eq), v.slice(eq + 1));
    } else values.set(a, v);
    i++;
  }
  const need = (name: string): string => { const v = values.get(name); if (!v) throw new ArgError(`Missing ${name}`); return v; };
  const org = need('--org');
  const account = need('--account');
  if (!UUID_RE.test(org) || !UUID_RE.test(account)) throw new ArgError('--org and --account must be UUIDs');
  const webhooks = on.has('--webhooks');
  if (on.has('--subscribe') && !webhooks) throw new ArgError('--subscribe goes with --webhooks');
  const waba = values.get('--waba') ?? null;
  if (webhooks && (!waba || !/^\d{5,30}$/.test(waba))) throw new ArgError('--webhooks needs --waba <WhatsApp Business Account id, digits>');
  if (!webhooks && waba) throw new ArgError('--waba goes with --webhooks');
  const templates = on.has('--templates');
  const rotate = on.has('--rotate');
  if ([webhooks, templates, rotate, on.has('--report')].filter(Boolean).length > 1 || ((webhooks || templates || rotate) && on.has('--prepare'))) {
    throw new ArgError('Use one of --webhooks, --templates, --rotate and --report at a time, and --prepare only with a send or --report');
  }
  if (Object.keys(config).length && !rotate) throw new ArgError('--config goes with --rotate');
  if (config.waba_id !== undefined && !/^\d{5,30}$/.test(String(config.waba_id))) throw new ArgError('--config waba_id must be the WhatsApp Business Account id (digits)');
  // Only the diagnoses and the rotation can do without a number: they send nothing.
  const to = (webhooks || templates || rotate) && !values.get('--to') ? '' : need('--to').replace(/[\s()-]/g, '');
  if (to !== '' && !/^\+[1-9][0-9]{7,14}$/.test(to)) throw new ArgError('--to must be an international number with the plus sign, for example +905301234567');
  const template = values.get('--template') ?? DEFAULT_TEMPLATE;
  if (!/^[a-z0-9_]{1,512}$/.test(template)) throw new ArgError('--template must be lower-case letters, digits and underscores');
  const language = values.get('--language') ?? 'en_US';
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language)) throw new ArgError('--language must look like tr or en_US');
  const purpose = values.get('--purpose') ?? 'transactional';
  if (purpose !== 'marketing' && purpose !== 'transactional') throw new ArgError('--purpose must be marketing or transactional');
  if (params.length > 20 || params.some((p) => p === '' || p.length > 1024)) throw new ArgError('--param values must be 1 to 1024 characters, at most 20');
  const one = (name: string): string | null => {
    const v = values.get(name) ?? null;
    if (v !== null && (v === '' || v.length > 1024)) throw new ArgError(`${name} must be 1 to 1024 characters`);
    return v;
  };
  const headerParam = one('--header-param');
  const buttonParam = one('--button-param');
  // The sample template has three variables; any other template takes the values given, or none.
  const finalParams = params.length > 0 ? params : template === DEFAULT_TEMPLATE ? defaultParams() : [];
  return {
    org, account, to, template, language, params: finalParams, purpose, prepare: on.has('--prepare'), report: on.has('--report'), askMasterKey: on.has('--ask-master-key'),
    webhooks, subscribe: on.has('--subscribe'), waba, templates, rotate, config, headerParam, buttonParam,
  };
}

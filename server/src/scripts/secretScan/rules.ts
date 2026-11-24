import { createHash } from 'node:crypto';

/**
 * The secret scanner's rules (WP-31). Deliberately small and dependency-free: it looks for the shapes of real credentials
 * (provider tokens, private keys, connection strings with a password, long random values assigned to a key-like name) in
 * the files git tracks and, on request, in every line ever committed. It never prints a value: a finding is the rule, the
 * place and a short fingerprint (the first 12 hex characters of the value's SHA-256), which is also how an accepted
 * false positive is named in `.secretscan-allow.json`.
 */

export interface Rule { id: string; description: string; pattern: RegExp; /** Which capture group holds the secret (default: the whole match). */ group?: number; minEntropy?: number }

const PLACEHOLDER = /(your[-_ ]|example|placeholder|changeme|change-me|dummy|sample|fake|xxxx|\*\*\*\*|<[^>]*>|\$\{|%\(|process\.env|import\.meta|test-only|not-a-real|redacted|todo|os\.environ)/i;
const WORD_VALUE = /^(pass|password|passwd|secret|user|username|token|key|apikey)$/i;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal|postgres|db|redis|[a-z0-9-]+\.railway\.internal|[a-z0-9-]+\.test|[a-z0-9-]+\.localhost|example\.(com|org|net))$/i;

export const RULES: Rule[] = [
  { id: 'private-key', description: 'a private key block', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'aws-access-key-id', description: 'an AWS access key id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'aws-secret-key', description: 'an AWS secret access key', pattern: /aws_?secret_?access_?key["']?\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})\b/i, group: 1, minEntropy: 3.5 },
  { id: 'github-token', description: 'a GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { id: 'slack-token', description: 'a Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'stripe-live-key', description: 'a Stripe live key', pattern: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/ },
  { id: 'google-api-key', description: 'a Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'anthropic-key', description: 'an Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'openai-key', description: 'an OpenAI-style API key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/, minEntropy: 3.5 },
  { id: 'sendgrid-key', description: 'a SendGrid API key', pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/ },
  { id: 'twilio-key', description: 'a Twilio API key', pattern: /\bSK[0-9a-f]{32}\b/ },
  { id: 'jwt', description: 'a signed JSON web token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  {
    id: 'url-with-password', description: 'a connection string with a password',
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqps?):\/\/[^:@\s/'"]+:([^@\s'"]{4,})@([A-Za-z0-9.\-[\]]+)/,
    group: 1,
  },
  {
    id: 'secret-assignment', description: 'a long random value assigned to a name that looks like a secret',
    // The value has no dots or brackets (so a property access or call is not one), mixes letters and digits, and looks random.
    pattern: /\b[A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)[A-Za-z0-9_]*["']?\s*[:=]\s*["']?(?=[A-Za-z0-9/+=_-]*\d)(?=[A-Za-z0-9/+=_-]*[A-Za-z])([A-Za-z0-9/+=_-]{24,})["']?(?![A-Za-z0-9/+=_.(-])/i,
    group: 1, minEntropy: 3.8,
  },
];

export function shannonEntropy(s: string): number {
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
}

export const fingerprint = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 12);

export interface Finding { rule: string; line: number; fingerprint: string }

/** Findings in one piece of text. A placeholder, a local host or a low-entropy value is not a finding. */
export function scanText(text: string): Finding[] {
  const out: Finding[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.length > 4000 || line.includes('secretscan:ignore')) continue; // minified bundles and lines that say so
    for (const rule of RULES) {
      const m = rule.pattern.exec(line);
      if (!m) continue;
      const value = m[rule.group ?? 0] ?? m[0];
      if (PLACEHOLDER.test(line) || PLACEHOLDER.test(value) || WORD_VALUE.test(value)) continue;
      if (rule.id === 'url-with-password' && LOCAL_HOST.test(m[2] ?? '')) continue;
      if (rule.minEntropy !== undefined && shannonEntropy(value) < rule.minEntropy) continue;
      out.push({ rule: rule.id, line: i + 1, fingerprint: fingerprint(value) });
    }
  }
  return out;
}

export interface AllowEntry { fingerprint: string; rule: string; reason: string }
export const isAllowed = (f: Finding, allow: AllowEntry[]): boolean => allow.some((a) => a.fingerprint === f.fingerprint && a.rule === f.rule);

import { listAccounts, loadAccountSecrets } from '../credentials.js';
import { IysApiError, IysClient, IysNetworkError, IYS_BASE_URLS, type IysCredentials } from './client.js';

/**
 * A tenant's İYS connection (WP-26, ADR-022): its one active İYS account, turned into a client. The credentials are the
 * tenant's own, decrypted here and nowhere else, and the address the client talks to is fixed by the account's provider
 * and mode, never by anything a tenant can type: `iys` in mode test is İYS's sandbox, in mode live İYS's live service;
 * `mock` is the development mock server named by the operator in ENGAGE_IYS_MOCK_URL.
 */

export class IysConfigError extends Error {
  constructor(public readonly code: 'no_iys_account' | 'iys_account_ambiguous' | 'iys_config_invalid' | 'mock_url_missing', message: string) {
    super(message);
    this.name = 'IysConfigError';
  }
}

export interface IysConnection {
  accountId: string; provider: 'iys' | 'mock'; mode: 'test' | 'live'; iysCode: number; brandCode: number; baseUrl: string; credentials: IysCredentials;
}

/** Replaceable in tests (a fake clock, a fake transport); production uses the defaults. */
export const iysDeps: { makeClient: (c: IysConnection) => IysClient; now: () => Date } = {
  makeClient: (c) => new IysClient({ baseUrl: c.baseUrl, iysCode: c.iysCode, brandCode: c.brandCode, credentials: c.credentials }),
  now: () => new Date(),
};

export function baseUrlFor(provider: string, mode: string, env: NodeJS.ProcessEnv = process.env): string {
  if (provider === 'iys') return mode === 'live' ? IYS_BASE_URLS.live : IYS_BASE_URLS.test;
  if (provider === 'mock') {
    const url = env.ENGAGE_IYS_MOCK_URL?.trim();
    if (!url || !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(url)) throw new IysConfigError('mock_url_missing', 'ENGAGE_IYS_MOCK_URL must name a local mock server (http://127.0.0.1:<port>)');
    return url;
  }
  throw new IysConfigError('iys_config_invalid', 'The İYS account has an unknown provider');
}

export async function loadConnection(orgId: string): Promise<IysConnection> {
  const accounts = (await listAccounts(orgId)).filter((a) => a.channel === 'iys' && a.status === 'active');
  if (accounts.length === 0) throw new IysConfigError('no_iys_account', 'This tenant has no active İYS account');
  if (accounts.length > 1) throw new IysConfigError('iys_account_ambiguous', 'This tenant has more than one active İYS account');
  const { account, secrets } = await loadAccountSecrets(orgId, accounts[0]!.id);
  const iysCode = account.config.iys_code;
  const brandCode = account.config.brand_code;
  if (typeof iysCode !== 'number' || typeof brandCode !== 'number' || !secrets.username || !secrets.password || (account.provider !== 'iys' && account.provider !== 'mock')) {
    throw new IysConfigError('iys_config_invalid', 'The İYS account is missing its İYS number, brand number or API credentials');
  }
  return {
    accountId: account.id, provider: account.provider, mode: account.mode, iysCode, brandCode,
    baseUrl: baseUrlFor(account.provider, account.mode), credentials: { username: secrets.username, password: secrets.password },
  };
}

export interface ConnectionCheck { ok: boolean; code: string | null; message: string | null; brandFound: boolean }

/**
 * "Does this work?" for an admin: gets a token, lists the brands and looks for the configured brand number. It changes
 * nothing in İYS. The first thing to do with a tenant's real credentials at business start (docs/runbooks/iys-sync.md).
 */
export async function checkConnection(orgId: string): Promise<ConnectionCheck> {
  try {
    const conn = await loadConnection(orgId);
    const brands = await iysDeps.makeClient(conn).listBrands();
    const found = brands.some((b) => b.brandCode === conn.brandCode);
    return found ? { ok: true, code: null, message: null, brandFound: true } : { ok: false, code: 'brand_not_found', message: 'İYS does not list the configured brand number for this İYS number', brandFound: false };
  } catch (err) {
    if (err instanceof IysConfigError) return { ok: false, code: err.code, message: err.message, brandFound: false };
    if (err instanceof IysApiError) return { ok: false, code: err.code ?? `http_${err.status}`, message: err.message, brandFound: false };
    if (err instanceof IysNetworkError) return { ok: false, code: 'unreachable', message: err.message, brandFound: false };
    throw err;
  }
}

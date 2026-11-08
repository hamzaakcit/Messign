import { Router, type Response } from 'express';
import { requireEngageAdmin, requireEngageUser } from './middleware/auth.js';
import {
  CredentialConflictError, CredentialInputError, CredentialNotFoundError,
  createAccount, disableAccount, getAccount, listAccounts, parseConfig, parseCreateInput, parseSecrets, rotateAccount,
} from './credentials.js';
import { CredentialKeyError } from './crypto.js';
import { errorFields, logError, logInfo } from './log.js';
import './types.js';

/** Tenant admins manage their own channel accounts. Responses carry metadata only, never secrets. */
export const credentialRouter = Router();

function fail(res: Response, err: unknown): void {
  if (err instanceof CredentialInputError) return void res.status(400).json({ error: err.message });
  if (err instanceof CredentialNotFoundError) return void res.status(404).json({ error: err.message });
  if (err instanceof CredentialConflictError) return void res.status(409).json({ error: err.message });
  if (err instanceof CredentialKeyError) {
    logError('credential storage is not configured', errorFields(err));
    return void res.status(503).json({ error: 'Credential storage is not configured' });
  }
  logError('credential request failed', errorFields(err));
  res.status(500).json({ error: 'Request failed' });
}

credentialRouter.get('/', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    res.json({ accounts: await listAccounts(req.engageUser!.organizationId) });
  } catch (err) { fail(res, err); }
});

credentialRouter.get('/:id', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    res.json(await getAccount(req.engageUser!.organizationId, req.params.id ?? ''));
  } catch (err) { fail(res, err); }
});

credentialRouter.post('/', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    const u = req.engageUser!;
    const account = await createAccount(u.organizationId, u.userId, parseCreateInput(req.body));
    logInfo('channel account created', { organizationId: u.organizationId, accountId: account.id, channel: account.channel, mode: account.mode });
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(account);
  } catch (err) { fail(res, err); }
});

credentialRouter.post('/:id/rotate', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    const u = req.engageUser!;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const account = await rotateAccount(u.organizationId, u.userId, req.params.id ?? '', {
      secrets: parseSecrets(body.secrets, { required: true }),
      config: body.config === undefined ? undefined : parseConfig(body.config),
    });
    logInfo('channel account rotated', { organizationId: u.organizationId, accountId: account.id, supersedes: account.supersedesId });
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(account);
  } catch (err) { fail(res, err); }
});

credentialRouter.post('/:id/disable', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    const u = req.engageUser!;
    const account = await disableAccount(u.organizationId, req.params.id ?? '');
    logInfo('channel account disabled', { organizationId: u.organizationId, accountId: account.id });
    res.json(account);
  } catch (err) { fail(res, err); }
});

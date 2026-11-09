import { Router } from 'express';
import { generateApiKey, parseScopes } from './apiKeys.js';
import { withEngageTenant } from './db.js';
import { requireApiKey, requireEngageUser, requirePlatformAdmin } from './middleware/auth.js';
import {
  ProvisionConflictError,
  ProvisionValidationError,
  provisionWithAdminPool,
  validateProvisionInput,
} from './bootstrap/provisionOrganization.js';
import { credentialRouter } from './credentialRoutes.js';
import { profileRouter } from './profileRoutes.js';
import { v1Router } from './v1Routes.js';
import { importRouter } from './import/importRoutes.js';
import { webhookRouter } from './webhookRoutes.js';
import { unsubscribeRouter } from './unsubscribeRoutes.js';
import { templateRouter } from './templateRoutes.js';
import { journeyRouter } from './journeyRoutes.js';
import { errorFields, logError, logInfo } from './log.js';
import './types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const engageRouter = Router();
engageRouter.use('/channel-accounts', credentialRouter);
engageRouter.use('/profiles', profileRouter);
engageRouter.use('/v1', v1Router);
engageRouter.use('/imports', importRouter);
engageRouter.use('/webhooks', webhookRouter);
engageRouter.use('/unsubscribe', unsubscribeRouter);
engageRouter.use('/templates', templateRouter);
engageRouter.use('/journeys', journeyRouter);

engageRouter.get('/me', requireEngageUser, (req, res) => {
  const u = req.engageUser!;
  res.json({ organizationId: u.organizationId, userId: u.userId, role: u.role });
});

engageRouter.get('/key/me', requireApiKey, (req, res) => {
  const k = req.engageApiKey!;
  res.json({ organizationId: k.organizationId, keyId: k.keyId, scopes: k.scopes });
});

engageRouter.post('/admin/organizations', requirePlatformAdmin, async (req, res) => {
  try {
    const input = validateProvisionInput(req.body);
    const result = await provisionWithAdminPool(input);
    logInfo('organization provisioned', { organizationId: result.organization.id, slug: result.organization.slug });
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof ProvisionValidationError) return void res.status(400).json({ error: err.message });
    if (err instanceof ProvisionConflictError) return void res.status(409).json({ error: err.message });
    logError('provisioning failed', errorFields(err));
    res.status(500).json({ error: 'Provisioning failed' });
  }
});

engageRouter.post('/admin/organizations/:orgId/api-keys', requirePlatformAdmin, async (req, res) => {
  const orgId = req.params.orgId ?? '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const scopes = parseScopes(req.body?.scopes);
  if (!UUID_RE.test(orgId)) return void res.status(400).json({ error: 'orgId must be a UUID' });
  if (name.length < 1 || name.length > 100) return void res.status(400).json({ error: 'name must be 1-100 characters' });
  if (!scopes) return void res.status(400).json({ error: 'scopes must be a non-empty list of known scopes' });
  try {
    const key = generateApiKey();
    const row = await withEngageTenant(orgId, async (client) => {
      const settings = await client.query('SELECT 1 FROM engage.tenant_settings WHERE organization_id = $1', [orgId]);
      if (settings.rowCount === 0) return null;
      const r = await client.query<{ id: string }>(
        `INSERT INTO engage.api_keys (organization_id, name, key_prefix, key_hash, scopes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [orgId, name, key.prefix, key.hash, scopes, req.engageUser!.userId],
      );
      return r.rows[0]!;
    });
    if (!row) return void res.status(404).json({ error: 'Engage organization not found' });
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ id: row.id, name, scopes, prefix: key.prefix, apiKey: key.plaintext });
  } catch (err) {
    logError('api key creation failed', errorFields(err));
    res.status(500).json({ error: 'API key creation failed' });
  }
});

import { Router, type Response } from 'express';
import { requireEngageAdmin, requireEngageUser } from './middleware/auth.js';
import { errorFields, logError } from './log.js';
import {
  addRate, getTenantSettings, recordReadiness, setSendEnabled, SettingsInputError, SettingsNotFoundError, SettingsNotReadyError,
  updateBudgetCap, updateGate, type GateSettingsPatch,
} from './settings/settings.js';
import './types.js';

/**
 * Tenant settings (WP-22). Only a tenant admin reads or changes them: the settings show the channel accounts, the
 * readiness and the caps, and every write is one the send gate depends on. Writes answer with the whole settings view,
 * so the screen never shows a stale state. Turning sending on is refused with the reasons while readiness is missing.
 * Channel accounts are managed by /api/engage/channel-accounts (secrets never pass through the browser).
 */
export const settingsRouter = Router();

function fail(res: Response, err: unknown): void {
  if (err instanceof SettingsInputError) return void res.status(400).json({ error: err.message, issues: err.issues });
  if (err instanceof SettingsNotReadyError) return void res.status(409).json({ error: err.message, problems: err.problems });
  if (err instanceof SettingsNotFoundError) return void res.status(404).json({ error: err.message });
  logError('settings request failed', errorFields(err));
  res.status(500).json({ error: 'Request failed' });
}

const body = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {});

settingsRouter.get('/', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getTenantSettings(req.engageUser!.organizationId));
  } catch (err) { fail(res, err); }
});

settingsRouter.put('/send-enabled', requireEngageUser, requireEngageAdmin, async (req, res) => {
  const b = body(req.body);
  if (typeof b.enabled !== 'boolean') return void res.status(400).json({ error: 'enabled must be true or false' });
  try {
    const u = req.engageUser!;
    await setSendEnabled(u.organizationId, u.userId, b.enabled);
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getTenantSettings(u.organizationId));
  } catch (err) { fail(res, err); }
});

settingsRouter.put('/gate', requireEngageUser, requireEngageAdmin, async (req, res) => {
  const b = body(req.body);
  const patch: GateSettingsPatch = {};
  if (b.timezone !== undefined) patch.timezone = b.timezone as string;
  if (b.quietHours !== undefined) {
    if (b.quietHours === null) patch.quietHours = null;
    else {
      const q = body(b.quietHours);
      patch.quietHours = { start: q.start as string, end: q.end as string };
    }
  }
  if (b.frequencyCap !== undefined) {
    const f = body(b.frequencyCap);
    patch.frequencyCap = { max: f.max as number, windowHours: f.windowHours as number };
  }
  try {
    const u = req.engageUser!;
    await updateGate(u.organizationId, u.userId, patch);
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getTenantSettings(u.organizationId));
  } catch (err) { fail(res, err); }
});

settingsRouter.put('/budget-caps/:channel', requireEngageUser, requireEngageAdmin, async (req, res) => {
  const b = body(req.body);
  try {
    const u = req.engageUser!;
    await updateBudgetCap(u.organizationId, u.userId, req.params.channel, { monthlyCapMinor: b.monthlyCapMinor, currency: b.currency });
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getTenantSettings(u.organizationId));
  } catch (err) { fail(res, err); }
});

settingsRouter.post('/rate-cards', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    const u = req.engageUser!;
    await addRate(u.organizationId, u.userId, body(req.body));
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(await getTenantSettings(u.organizationId));
  } catch (err) { fail(res, err); }
});

settingsRouter.put('/readiness/:channel/:item', requireEngageUser, requireEngageAdmin, async (req, res) => {
  const b = body(req.body);
  try {
    const u = req.engageUser!;
    await recordReadiness(u.organizationId, u.userId, req.params.channel, req.params.item, { value: b.value, evidenceUrl: b.evidenceUrl });
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getTenantSettings(u.organizationId));
  } catch (err) { fail(res, err); }
});

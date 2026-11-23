import { Router } from 'express';
import { requireEngageAdmin, requireEngageUser } from './middleware/auth.js';
import { errorFields, logError } from './log.js';
import { withEngageTenant } from './db.js';
import { runTemplateCheck } from './whatsapp/templateCheck.js';
import { getTemplateCheckState, listTemplateStatuses } from './whatsapp/templateStatus.js';
import { getWhatsappSetup } from './whatsapp/operate.js';
import './types.js';

/**
 * WhatsApp in the platform (WP-40a): what Meta says about the tenant's templates, and running the template check now.
 *   GET  /templates        every template Meta lists for the tenant's WhatsApp Business Account, with its status, category and
 *                          quality, and which Messign template (if any) is registered for it; plus when the check last ran
 *   POST /templates/check  admins: read the templates from Meta now (the same check that runs hourly)
 *   GET  /setup            admins: the Settings card (WP-40c): the account, the webhook URL to give Meta, the check, the daily limit,
 *                          the templates in use with Meta's status, readiness and the setup checklist. Never a secret.
 * Codes, names and counts only; no customer data.
 */
export const whatsappRouter = Router();

whatsappRouter.get('/templates', requireEngageUser, async (req, res) => {
  const org = req.engageUser!.organizationId;
  try {
    const [statuses, check, registered] = await Promise.all([
      listTemplateStatuses(org),
      getTemplateCheckState(org),
      withEngageTenant(org, async (c) => (await c.query<{ id: string; key: string; meta_name: string; language: string }>(
        `SELECT DISTINCT ON (t.id) t.id, t.key, w.meta_name, w.language
           FROM engage.templates t JOIN engage.whatsapp_template_versions w ON w.organization_id = t.organization_id AND w.template_id = t.id
          WHERE t.organization_id = $1 AND t.channel = 'whatsapp' ORDER BY t.id, w.version DESC`, [org])).rows),
    ]);
    const byMeta = new Map<string, Array<{ id: string; key: string }>>();
    for (const r of registered) byMeta.set(`${r.meta_name}|${r.language}`, [...(byMeta.get(`${r.meta_name}|${r.language}`) ?? []), { id: r.id, key: r.key }]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      check,
      templates: statuses.map((s) => ({ ...s, registeredAs: byMeta.get(`${s.metaName}|${s.language}`) ?? [] })),
      // Registered in Messign but not (yet) seen at Meta: a typo in the name or language, or the check has not run.
      unmatched: registered.filter((r) => !statuses.some((s) => s.metaName === r.meta_name && s.language === r.language))
        .map((r) => ({ id: r.id, key: r.key, metaName: r.meta_name, language: r.language })),
    });
  } catch (err) {
    logError('whatsapp templates request failed', errorFields(err));
    res.status(500).json({ error: 'Request failed' });
  }
});

whatsappRouter.post('/templates/check', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    res.json(await runTemplateCheck(req.engageUser!.organizationId));
  } catch (err) {
    logError('whatsapp template check request failed', errorFields(err));
    res.status(500).json({ error: 'Request failed' });
  }
});

whatsappRouter.get('/setup', requireEngageUser, requireEngageAdmin, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getWhatsappSetup(req.engageUser!.organizationId));
  } catch (err) {
    logError('whatsapp setup request failed', errorFields(err));
    res.status(500).json({ error: 'Request failed' });
  }
});

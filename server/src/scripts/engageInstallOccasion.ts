/**
 * Installs the occasion-reminder journey on ONE tenant as a draft (WP-25, ADR-021):
 *
 *   npm run engage:install-occasion -- --org <org uuid> --attribute anniversary_date [--offset -7] [--time 09:30] [--holdout 10]
 *
 * It creates the template "occasion-reminder" (if the tenant has none) and the journey "occasion-<attribute>" as draft
 * version 1: a reminder email `offset` days from each customer's date (negative = before), at that local time of the
 * tenant. Installing never approves or activates; a tenant admin does. The customers' dates must be YYYY-MM-DD in an
 * attribute with that name (the CSV import stores any extra column as an attribute). Prints ids only.
 *
 * Needs ENGAGE_DATABASE_URL.
 */
import 'dotenv/config';
import { closeEngagePool } from '../engage/db.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const opt = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : undefined; // a single dash is fine: --offset -7
};
const fail = (msg: string): never => { console.error(msg); process.exit(2); };

async function main(): Promise<void> {
  const org = opt('org') ?? fail('Missing --org <organization uuid>');
  if (!UUID_RE.test(org)) fail('--org must be a UUID');
  const attribute = opt('attribute') ?? fail('Missing --attribute <name of the date attribute, for example anniversary_date>');
  const offsetDays = opt('offset') === undefined ? undefined : Number(opt('offset'));
  if (offsetDays !== undefined && (!Number.isInteger(offsetDays) || offsetDays < -365 || offsetDays > 365)) fail('--offset must be a whole number of days from -365 to 365');
  const atLocalTime = opt('time');
  if (atLocalTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(atLocalTime)) fail('--time must be HH:MM');
  const holdoutPercent = opt('holdout') === undefined ? undefined : Number(opt('holdout'));
  if (holdoutPercent !== undefined && (!Number.isInteger(holdoutPercent) || holdoutPercent < 0 || holdoutPercent > 50)) fail('--holdout must be 0 to 50');

  const { installOccasionReminder } = await import('../engage/journeys/occasionReminder.js');
  const out = await installOccasionReminder(org, null, { attribute, offsetDays, atLocalTime, holdoutPercent });
  console.log(`Installed journey ${out.journeyId} "${out.journeyKey}" (version ${out.version}, draft); template ${out.templateCreated ? 'created' : 'already there'}.`);
  console.log('A tenant admin must approve and activate version 1 before anything starts:');
  console.log(`  POST /api/engage/journeys/${out.journeyId}/versions/1/approve, then .../versions/1/activate`);
}

main().then(() => closeEngagePool(), async (err) => {
  console.error(err instanceof Error ? err.message : String(err));
  await closeEngagePool();
  process.exit(1);
});

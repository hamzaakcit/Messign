import 'dotenv/config';
import { query } from '../db/index.js';

const DEPARTMENTS = [
  { team_code: 'enterprise-sales', team_name: 'Enterprise Sales Team', description: 'Sales team with revenue, SMS, and email metrics', team_type: 'sales' },
  { team_code: 'wholesale-sms', team_name: 'Wholesale SMS Team', description: 'SMS-only team; no email metrics', team_type: 'operations' },
  { team_code: 'marketing', team_name: 'Marketing', description: 'Marketing and communications', team_type: 'sales' },
  { team_code: 'software', team_name: 'Software', description: 'Software engineering', team_type: 'product' },
  { team_code: 'support', team_name: 'Support', description: 'Customer and technical support', team_type: 'operations' },
  { team_code: 'product', team_name: 'Product', description: 'Product management and design', team_type: 'product' },
  { team_code: 'operations', team_name: 'Operations', description: 'Operations and logistics', team_type: 'operations' },
  { team_code: 'hr', team_name: 'HR', description: 'Human resources', team_type: 'operations' },
  { team_code: 'finance', team_name: 'Finance', description: 'Finance and accounting', team_type: 'operations' },
  { team_code: 'business-development', team_name: 'Business Development', description: 'Business development and partnerships', team_type: 'sales' },
];

const METRICS_CONFIG = JSON.stringify({ revenue: true, sms: true });

async function main(): Promise<void> {
  for (const d of DEPARTMENTS) {
    await query(
      `INSERT INTO performance_teams (team_code, team_name, description, team_type, metrics_config, is_active)
       VALUES ($1, $2, $3, $4, $5::jsonb, TRUE)
       ON CONFLICT (team_code) DO UPDATE SET team_name = EXCLUDED.team_name, description = EXCLUDED.description, metrics_config = EXCLUDED.metrics_config`,
      [d.team_code, d.team_name, d.description, d.team_type, METRICS_CONFIG]
    );
  }
  console.log(`Ensured ${DEPARTMENTS.length} departments exist.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

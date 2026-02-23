import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool } from './index.js';
import { DEFAULT_PASSWORD } from '../types/auth.js';

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_ORG_SLUG = 'messign';
const SALT_ROUNDS = 12;

interface SeedUser {
  auth_user_id: string;
  email: string;
  full_name: string;
  role: string;
  manager_auth_id: string | null;
}

const SEED_USERS: SeedUser[] = [
  { auth_user_id: 'user-1', email: 'alex.chen@messign.com', full_name: 'Alex Chen', role: 'admin', manager_auth_id: null },
  { auth_user_id: 'user-2', email: 'sarah.johnson@messign.com', full_name: 'Sarah Johnson', role: 'manager', manager_auth_id: 'user-1' },
  { auth_user_id: 'user-3', email: 'marcus.williams@messign.com', full_name: 'Marcus Williams', role: 'employee', manager_auth_id: 'user-2' },
  { auth_user_id: 'user-4', email: 'emily.davis@messign.com', full_name: 'Emily Davis', role: 'employee', manager_auth_id: 'user-2' },
  { auth_user_id: 'user-5', email: 'david.kim@messign.com', full_name: 'David Kim', role: 'employee', manager_auth_id: 'user-2' },
  { auth_user_id: 'user-6', email: 'jessica.martinez@messign.com', full_name: 'Jessica Martinez', role: 'manager', manager_auth_id: 'user-1' },
  { auth_user_id: 'user-7', email: 'michael.brown@messign.com', full_name: 'Michael Brown', role: 'employee', manager_auth_id: 'user-2' },
  { auth_user_id: 'user-8', email: 'amanda.taylor@messign.com', full_name: 'Amanda Taylor', role: 'employee', manager_auth_id: 'user-2' },
  { auth_user_id: 'user-9', email: 'chris.wilson@messign.com', full_name: 'Chris Wilson', role: 'employee', manager_auth_id: 'user-2' },
  { auth_user_id: 'user-10', email: 'rachel.lee@messign.com', full_name: 'Rachel Lee', role: 'employee', manager_auth_id: 'user-6' },
];

const CATEGORIES = [
  { name: 'Travel', icon: '✈️' },
  { name: 'Meals', icon: '🍽️' },
  { name: 'Office Supplies', icon: '📎' },
  { name: 'Subscriptions', icon: '📱' },
  { name: 'Utilities (Remote Work)', icon: '💡' },
  { name: 'Client Entertainment', icon: '🎭' },
  { name: 'Mileage', icon: '🚗' },
];

export async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orgResult = await client.query(
      `INSERT INTO organizations (id, name, slug, base_currency)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [DEFAULT_ORG_ID, 'Messign', DEFAULT_ORG_SLUG, 'USD']
    );
    const orgId = orgResult.rows[0]?.id ?? DEFAULT_ORG_ID;

    const userIdByAuthId: Record<string, string> = {};
    for (const u of SEED_USERS) {
      const r = await client.query(
        `INSERT INTO reimbursement_users (organization_id, auth_user_id, email, full_name, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organization_id, email) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, auth_user_id = EXCLUDED.auth_user_id
         RETURNING id`,
        [orgId, u.auth_user_id, u.email, u.full_name, u.role]
      );
      const id = r.rows[0]?.id;
      if (id) userIdByAuthId[u.auth_user_id] = id;
    }
    for (const u of SEED_USERS) {
      if (!u.manager_auth_id) continue;
      const managerId = userIdByAuthId[u.manager_auth_id];
      const myId = userIdByAuthId[u.auth_user_id];
      if (managerId && myId) {
        await client.query(
          `UPDATE reimbursement_users SET manager_id = $1 WHERE id = $2`,
          [managerId, myId]
        );
      }
    }

    // Employee auth: default password for all seed users so login works after db:seed
    const defaultPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
    for (const u of SEED_USERS) {
      const email = u.email.trim().toLowerCase();
      await client.query(
        `INSERT INTO employee_auth (auth_user_id, email, password_hash, must_change_password, temporary_password, account_status, created_by, updated_by)
         VALUES ($1, $2, $3, TRUE, $4, 'active', 'system', 'system')
         ON CONFLICT (auth_user_id) DO UPDATE SET
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           must_change_password = EXCLUDED.must_change_password,
           temporary_password = EXCLUDED.temporary_password,
           account_status = EXCLUDED.account_status,
           updated_at = NOW(),
           updated_by = EXCLUDED.updated_by`,
        [u.auth_user_id, email, defaultPasswordHash, DEFAULT_PASSWORD]
      );
    }

    for (const c of CATEGORIES) {
      await client.query(
        `INSERT INTO expense_categories (organization_id, name, icon, is_active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (organization_id, name) DO NOTHING`,
        [orgId, c.name, c.icon]
      );
    }

    await client.query(
      `INSERT INTO reimbursement_settings (organization_id, mileage_rate_per_km, mileage_currency, enable_ocr, enable_mileage, enable_currency_conversion)
       VALUES ($1, 0.67, 'USD', TRUE, TRUE, TRUE)
       ON CONFLICT (organization_id) DO NOTHING`,
      [orgId]
    );

    // Performance teams (enterprise-sales, wholesale-sms + departments for imported employees)
    const teamRows = await client.query(
      `INSERT INTO performance_teams (team_code, team_name, description, team_type, team_lead_id, metrics_config, is_active)
       VALUES
         ('enterprise-sales', 'Enterprise Sales Team', 'Sales team with revenue, SMS, and email metrics', 'sales', 'user-1', '{"revenue": true, "sms": true, "email": true}', TRUE),
         ('wholesale-sms', 'Wholesale SMS Team', 'SMS-only team; no email metrics', 'operations', 'user-1', '{"revenue": true, "sms": true, "email": false}', TRUE),
         ('marketing', 'Marketing', 'Marketing and communications', 'sales', NULL, '{"revenue": true, "sms": true}', TRUE),
         ('software', 'Software', 'Software engineering', 'product', NULL, '{"revenue": true, "sms": true}', TRUE),
         ('support', 'Support', 'Customer and technical support', 'operations', NULL, '{"revenue": true, "sms": true}', TRUE),
         ('product', 'Product', 'Product management and design', 'product', NULL, '{"revenue": true, "sms": true}', TRUE),
         ('operations', 'Operations', 'Operations and logistics', 'operations', NULL, '{"revenue": true, "sms": true}', TRUE),
         ('hr', 'HR', 'Human resources', 'operations', NULL, '{"revenue": true, "sms": true}', TRUE),
         ('finance', 'Finance', 'Finance and accounting', 'operations', NULL, '{"revenue": true, "sms": true}', TRUE),
         ('business-development', 'Business Development', 'Business development and partnerships', 'sales', NULL, '{"revenue": true, "sms": true}', TRUE)
       ON CONFLICT (team_code) DO UPDATE SET team_name = EXCLUDED.team_name, description = EXCLUDED.description, metrics_config = EXCLUDED.metrics_config
       RETURNING id, team_code`
    );
    const teamIdByCode: Record<string, string> = {};
    for (const row of teamRows.rows) {
      teamIdByCode[row.team_code] = row.id;
    }
    const enterpriseTeamId = teamIdByCode['enterprise-sales'];
    const wholesaleTeamId = teamIdByCode['wholesale-sms'];
    if (enterpriseTeamId) {
      const members = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5', 'user-6', 'user-7', 'user-8'];
      for (let i = 0; i < members.length; i++) {
        await client.query(
          `INSERT INTO performance_team_members (team_id, employee_id, role_in_team, start_date, is_active)
           VALUES ($1, $2, $3, CURRENT_DATE - INTERVAL '1 year', TRUE)
           ON CONFLICT (team_id, employee_id) DO UPDATE SET role_in_team = EXCLUDED.role_in_team`,
          [enterpriseTeamId, members[i], i === 0 ? 'lead' : i < 3 ? 'senior' : i < 6 ? 'member' : 'trainee']
        );
      }
    }
    if (wholesaleTeamId) {
      const members = ['user-1', 'user-3', 'user-5', 'user-7', 'user-9', 'user-10'];
      for (let i = 0; i < members.length; i++) {
        await client.query(
          `INSERT INTO performance_team_members (team_id, employee_id, role_in_team, start_date, is_active)
           VALUES ($1, $2, $3, CURRENT_DATE - INTERVAL '1 year', TRUE)
           ON CONFLICT (team_id, employee_id) DO UPDATE SET role_in_team = EXCLUDED.role_in_team`,
          [wholesaleTeamId, members[i], i === 0 ? 'lead' : i < 3 ? 'senior' : 'member']
        );
      }
    }

    // Assign each seed employee to a department team so Team Directory shows them under Marketing, Software, etc.
    const employeeToDept: [string, string][] = [
      ['user-1', 'operations'],
      ['user-2', 'marketing'],
      ['user-3', 'software'],
      ['user-4', 'support'],
      ['user-5', 'product'],
      ['user-6', 'hr'],
      ['user-7', 'finance'],
      ['user-8', 'business-development'],
      ['user-9', 'marketing'],
      ['user-10', 'software'],
    ];
    for (const [authId, teamCode] of employeeToDept) {
      const teamId = teamIdByCode[teamCode];
      if (teamId) {
        await client.query(
          `INSERT INTO performance_team_members (team_id, employee_id, role_in_team, start_date, is_active)
           VALUES ($1, $2, 'member', CURRENT_DATE - INTERVAL '1 year', TRUE)
           ON CONFLICT (team_id, employee_id) DO NOTHING`,
          [teamId, authId]
        );
      }
    }

    // Performance metrics: company (global), teams, members – last 12 months for demo
    for (let m = 0; m < 12; m++) {
      const metricDate = new Date();
      metricDate.setMonth(metricDate.getMonth() - (11 - m));
      metricDate.setDate(1);
      const d = metricDate.toISOString().slice(0, 10);
      const rev = 950000 + (m + 1) * 250000 + Math.floor(Math.random() * 50000);
      const sms = 50000000 + (m + 1) * 15000000 + Math.floor(Math.random() * 1000000);
      const email = 2800000 + (m + 1) * 800000 + Math.floor(Math.random() * 100000);
      const smsRate = 97.5 + (m % 3) * 0.3;
      const emailRate = 93 + (m % 4) * 0.4;
      const convRate = 2.1 + (m % 5) * 0.1;
      await client.query(
        `INSERT INTO performance_metrics (entity_type, entity_id, metric_date, revenue, sms_attempts, email_attempts, sms_delivery_rate, email_delivery_rate, conversion_rate, cost_per_sms)
         VALUES ('company', 'global', $1::date, $2, $3, $4, $5, $6, $7, 0.0045)
         ON CONFLICT (entity_type, entity_id, metric_date) DO UPDATE SET revenue = EXCLUDED.revenue, sms_attempts = EXCLUDED.sms_attempts, email_attempts = EXCLUDED.email_attempts`,
        [d, rev, sms, email, smsRate, emailRate, convRate]
      );
    }
    if (enterpriseTeamId) {
      for (let m = 0; m < 12; m++) {
        const metricDate = new Date();
        metricDate.setMonth(metricDate.getMonth() - (11 - m));
        metricDate.setDate(1);
        const d = metricDate.toISOString().slice(0, 10);
        const rev = 400000 + (m + 1) * 30000;
        const sms = 20000000 + (m + 1) * 1000000;
        await client.query(
          `INSERT INTO performance_metrics (entity_type, entity_id, metric_date, revenue, sms_attempts, email_attempts, sms_delivery_rate, email_delivery_rate, conversion_rate)
           VALUES ('team', $1, $2::date, $3, $4, $5, 96, 92, 2.2)
           ON CONFLICT (entity_type, entity_id, metric_date) DO NOTHING`,
          [enterpriseTeamId, d, rev, sms, Math.floor(sms * 0.05)]
        );
      }
      const entMembers = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5', 'user-6', 'user-7', 'user-8'];
      for (const empId of entMembers) {
        for (let m = 0; m < 12; m++) {
          const metricDate = new Date();
          metricDate.setMonth(metricDate.getMonth() - (11 - m));
          metricDate.setDate(1);
          const d = metricDate.toISOString().slice(0, 10);
          const rev = 40000 + (m + 1) * 3500 + Math.floor(Math.random() * 2000);
          const sms = 2000000 + (m + 1) * 120000;
          const email = 300000 + (m + 1) * 25000;
          await client.query(
            `INSERT INTO performance_metrics (entity_type, entity_id, metric_date, revenue, sms_attempts, email_attempts, sms_delivery_rate, email_delivery_rate, conversion_rate)
             VALUES ('member', $1, $2::date, $3, $4, $5, 96, 92, 2.1)
             ON CONFLICT (entity_type, entity_id, metric_date) DO NOTHING`,
            [empId, d, rev, sms, email]
          );
        }
      }
    }
    if (wholesaleTeamId) {
      for (let m = 0; m < 12; m++) {
        const metricDate = new Date();
        metricDate.setMonth(metricDate.getMonth() - (11 - m));
        metricDate.setDate(1);
        const d = metricDate.toISOString().slice(0, 10);
        const rev = 350000 + (m + 1) * 25000;
        const sms = 25000000 + (m + 1) * 1500000;
        await client.query(
          `INSERT INTO performance_metrics (entity_type, entity_id, metric_date, revenue, sms_attempts, sms_delivery_rate, cost_per_sms)
           VALUES ('team', $1, $2::date, $3, $4, 97.5, 0.0048)
           ON CONFLICT (entity_type, entity_id, metric_date) DO NOTHING`,
          [wholesaleTeamId, d, rev, sms]
        );
      }
      const wholesaleMembers = ['user-1', 'user-3', 'user-5', 'user-7', 'user-9', 'user-10'];
      for (const empId of wholesaleMembers) {
        for (let m = 0; m < 12; m++) {
          const metricDate = new Date();
          metricDate.setMonth(metricDate.getMonth() - (11 - m));
          metricDate.setDate(1);
          const d = metricDate.toISOString().slice(0, 10);
          const rev = 45000 + (m + 1) * 4000;
          const sms = 3500000 + (m + 1) * 200000;
          await client.query(
            `INSERT INTO performance_metrics (entity_type, entity_id, metric_date, revenue, sms_attempts, sms_delivery_rate, cost_per_sms)
             VALUES ('member', $1, $2::date, $3, $4, 98, 0.005)
             ON CONFLICT (entity_type, entity_id, metric_date) DO NOTHING`,
            [empId, d, rev, sms]
          );
        }
      }
    }

    // Chat: channels and channel_members (fixed IDs so "general" is stable for clients)
    const CHANNELS_SEED: Array<{ id: string; name: string; description: string; type: string }> = [
      { id: 'd789f76a-b015-4a75-aaa5-431cda85a184', name: 'general', description: 'General discussions and announcements', type: 'public' },
      { id: '550e8400-e29b-41d4-a716-446655440001', name: 'engineering', description: 'Engineering team discussions', type: 'public' },
      { id: '550e8400-e29b-41d4-a716-446655440002', name: 'design', description: 'Design team discussions and feedback', type: 'public' },
      { id: '550e8400-e29b-41d4-a716-446655440003', name: 'product', description: 'Product planning and roadmap', type: 'public' },
      { id: '550e8400-e29b-41d4-a716-446655440004', name: 'marketing', description: 'Marketing campaigns and content', type: 'public' },
      { id: '550e8400-e29b-41d4-a716-446655440005', name: 'random', description: 'Fun stuff and off-topic conversations', type: 'public' },
      { id: '550e8400-e29b-41d4-a716-446655440006', name: 'leadership', description: 'Leadership team private channel', type: 'private' },
      { id: '550e8400-e29b-41d4-a716-446655440007', name: 'project-alpha', description: 'Project Alpha team discussions', type: 'private' },
    ];
    const channelIdByName: Record<string, string> = {};
    for (const ch of CHANNELS_SEED) {
      const r = await client.query(
        `INSERT INTO channels (id, name, description, type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, type = EXCLUDED.type
         RETURNING id, name`,
        [ch.id, ch.name, ch.description, ch.type]
      );
      const row = r.rows[0];
      if (row) channelIdByName[row.name] = row.id;
    }
    const allUserIds = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5', 'user-6', 'user-7', 'user-8', 'user-9', 'user-10'];
    const channelMembers: Record<string, string[]> = {
      general: allUserIds,
      engineering: ['user-1', 'user-4', 'user-5', 'user-7', 'user-8'],
      design: ['user-3', 'user-2', 'user-6'],
      product: ['user-2', 'user-1', 'user-3', 'user-9'],
      marketing: ['user-6', 'user-10', 'user-2'],
      random: allUserIds,
      leadership: ['user-1', 'user-2', 'user-6'],
      'project-alpha': ['user-1', 'user-4', 'user-5', 'user-3'],
    };
    for (const [chName, userIds] of Object.entries(channelMembers)) {
      const chId = channelIdByName[chName];
      if (!chId) continue;
      for (const uid of userIds) {
        await client.query(
          `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT (channel_id, user_id) DO NOTHING`,
          [chId, uid]
        );
      }
    }

    // CRITICAL: Ensure 'general' and 'random' have user-1 through user-25 as members
    const generalId = channelIdByName['general'];
    const randomId = channelIdByName['random'];
    for (let i = 1; i <= 25; i++) {
      const uid = `user-${i}`;
      if (generalId) {
        await client.query(
          `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT (channel_id, user_id) DO NOTHING`,
          [generalId, uid]
        );
      }
      if (randomId) {
        await client.query(
          `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT (channel_id, user_id) DO NOTHING`,
          [randomId, uid]
        );
      }
    }

    // One initial message in 'general' from user-1 so chat isn't empty
    if (generalId) {
      await client.query(
        `INSERT INTO messages (channel_id, user_id, content, attachments, mentions, xp_gained)
         VALUES ($1, 'user-1', $2, '[]'::jsonb, '[]'::jsonb, 0)`,
        [generalId, 'Welcome to the general channel! 👋']
      );
    }

    // Badges (definitions + user_badges)
    const BADGES_SEED: Array<{ id: string; name: string; icon: string; type: string; description: string; rarity: string; criteria: string | null; holders: string[] }> = [
      { id: 'badge-first-task', name: 'First Steps', icon: 'rocket', type: 'achievement', description: 'Complete your first task', rarity: 'common', criteria: 'Complete 1 task', holders: ['user-1', 'user-2', 'user-3', 'user-4', 'user-5', 'user-6', 'user-7', 'user-8', 'user-9', 'user-10'] },
      { id: 'badge-task-master', name: 'Task Master', icon: 'check-circle', type: 'achievement', description: 'Complete 100 tasks', rarity: 'rare', criteria: 'Complete 100 tasks', holders: ['user-1', 'user-2', 'user-4', 'user-5', 'user-6'] },
      { id: 'badge-task-legend', name: 'Task Legend', icon: 'crown', type: 'achievement', description: 'Complete 500 tasks', rarity: 'legendary', criteria: 'Complete 500 tasks', holders: ['user-2'] },
      { id: 'badge-bug-squasher', name: 'Bug Squasher', icon: 'bug', type: 'achievement', description: 'Fix 50 bugs', rarity: 'rare', criteria: 'Fix 50 bugs', holders: ['user-1', 'user-4', 'user-5', 'user-8'] },
      { id: 'badge-speed-demon', name: 'Speed Demon', icon: 'zap', type: 'achievement', description: 'Complete 5 tasks in one day', rarity: 'rare', criteria: 'Complete 5 tasks in a single day', holders: ['user-1', 'user-4', 'user-5'] },
      { id: 'badge-early-bird', name: 'Early Bird', icon: 'sunrise', type: 'achievement', description: 'Log in before 7 AM for 30 days', rarity: 'epic', criteria: 'Log in before 7 AM for 30 consecutive days', holders: ['user-2', 'user-6'] },
      { id: 'badge-night-owl', name: 'Night Owl', icon: 'moon', type: 'achievement', description: 'Work late (after 9 PM) 20 times', rarity: 'rare', criteria: 'Log activity after 9 PM 20 times', holders: ['user-1', 'user-5', 'user-7'] },
      { id: 'badge-react-pro', name: 'React Pro', icon: 'code', type: 'skill', description: 'Complete 25 React-related tasks', rarity: 'rare', criteria: 'Complete 25 tasks tagged with React', holders: ['user-1', 'user-4'] },
      { id: 'badge-api-architect', name: 'API Architect', icon: 'server', type: 'skill', description: 'Design and implement 10 API endpoints', rarity: 'epic', criteria: 'Complete 10 API-related tasks', holders: ['user-5'] },
      { id: 'badge-design-guru', name: 'Design Guru', icon: 'palette', type: 'skill', description: 'Complete 30 design tasks', rarity: 'rare', criteria: 'Complete 30 design-related tasks', holders: ['user-3'] },
      { id: 'badge-wordsmith', name: 'Wordsmith', icon: 'pen-tool', type: 'skill', description: 'Create 20 documents in the knowledge base', rarity: 'rare', criteria: 'Create 20 documents', holders: ['user-2', 'user-6', 'user-10'] },
      { id: 'badge-data-detective', name: 'Data Detective', icon: 'bar-chart', type: 'skill', description: 'Complete 15 data analysis tasks', rarity: 'epic', criteria: 'Complete 15 data-related tasks', holders: ['user-9'] },
      { id: 'badge-level-10', name: 'Rising Star', icon: 'star', type: 'milestone', description: 'Reach Level 10', rarity: 'common', criteria: 'Reach Level 10', holders: ['user-1', 'user-2', 'user-3', 'user-4', 'user-5', 'user-6', 'user-7', 'user-8', 'user-9', 'user-10'] },
      { id: 'badge-level-20', name: 'Veteran', icon: 'award', type: 'milestone', description: 'Reach Level 20', rarity: 'rare', criteria: 'Reach Level 20', holders: ['user-1', 'user-2', 'user-4', 'user-5', 'user-6'] },
      { id: 'badge-level-30', name: 'Elite', icon: 'shield', type: 'milestone', description: 'Reach Level 30', rarity: 'legendary', criteria: 'Reach Level 30', holders: [] },
      { id: 'badge-1k-xp', name: 'XP Hunter', icon: 'target', type: 'milestone', description: 'Earn 1,000 XP', rarity: 'common', criteria: 'Earn 1,000 total XP', holders: ['user-1', 'user-2', 'user-3', 'user-4', 'user-5', 'user-6', 'user-7', 'user-8', 'user-9', 'user-10'] },
      { id: 'badge-10k-xp', name: 'XP Master', icon: 'trophy', type: 'milestone', description: 'Earn 10,000 XP', rarity: 'epic', criteria: 'Earn 10,000 total XP', holders: ['user-1', 'user-2', 'user-4', 'user-5', 'user-6'] },
      { id: 'badge-team-player', name: 'Team Player', icon: 'users', type: 'achievement', description: 'Collaborate on 10 different projects', rarity: 'rare', criteria: 'Contribute to 10 different projects', holders: ['user-1', 'user-2', 'user-5', 'user-6'] },
      { id: 'badge-mentor', name: 'Mentor', icon: 'heart', type: 'achievement', description: 'Help 20 colleagues with their tasks', rarity: 'epic', criteria: 'Assist 20 colleagues', holders: ['user-2', 'user-1'] },
      { id: 'badge-communicator', name: 'Communicator', icon: 'message-circle', type: 'achievement', description: 'Send 1,000 messages', rarity: 'rare', criteria: 'Send 1,000 chat messages', holders: ['user-2', 'user-6', 'user-1', 'user-4', 'user-3'] },
    ];
    for (const b of BADGES_SEED) {
      await client.query(
        `INSERT INTO badges (id, name, icon, type, description, rarity, criteria)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, type = EXCLUDED.type, description = EXCLUDED.description, rarity = EXCLUDED.rarity, criteria = EXCLUDED.criteria, updated_at = NOW()`,
        [b.id, b.name, b.icon, b.type, b.description, b.rarity, b.criteria]
      );
      for (const uid of b.holders) {
        await client.query(
          `INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT (user_id, badge_id) DO NOTHING`,
          [uid, b.id]
        );
      }
    }

    // Activities (feed) – initial demo entries
    const ACTIVITIES_SEED: Array<{ user_id: string; type: string; message: string; metadata?: Record<string, unknown>; xp_gained: number }> = [
      { user_id: 'user-4', type: 'task_completed', message: 'Emily completed "Design onboarding flow"', xp_gained: 50 },
      { user_id: 'user-1', type: 'badge_earned', message: 'Alex earned the "Speed Demon" badge', xp_gained: 100, metadata: { badgeId: 'badge-speed-demon' } },
      { user_id: 'user-5', type: 'task_completed', message: 'David completed "Database query optimization"', xp_gained: 70 },
      { user_id: 'user-2', type: 'document_created', message: 'Sarah created "Product Roadmap 2026"', xp_gained: 25 },
      { user_id: 'user-7', type: 'project_joined', message: 'Michael joined "API v3 Migration"', xp_gained: 10 },
      { user_id: 'user-3', type: 'milestone_reached', message: 'Marcus reached Level 19!', xp_gained: 50 },
      { user_id: 'user-6', type: 'task_completed', message: 'Jessica completed "Define target audience"', xp_gained: 35 },
      { user_id: 'user-8', type: 'badge_earned', message: 'Amanda earned the "Bug Squasher" badge', xp_gained: 100, metadata: { badgeId: 'badge-bug-squasher' } },
      { user_id: 'user-10', type: 'document_created', message: 'Rachel created a new marketing guide', xp_gained: 25 },
      { user_id: 'user-9', type: 'task_completed', message: 'Chris completed data analysis for Q4', xp_gained: 45 },
      { user_id: 'user-1', type: 'level_up', message: 'Alex reached Level 24!', xp_gained: 0 },
      { user_id: 'user-4', type: 'task_completed', message: 'Emily merged PR #340 - UI improvements', xp_gained: 40 },
    ];
    for (const a of ACTIVITIES_SEED) {
      await client.query(
        `INSERT INTO activities (user_id, type, message, metadata, xp_gained)
         VALUES ($1, $2, $3, $4, $5)`,
        [a.user_id, a.type, a.message, a.metadata ? JSON.stringify(a.metadata) : null, a.xp_gained]
      );
    }

    // Projects
    const PROJECTS_SEED = [
      { id: 'project-1', name: 'Messign Mobile App', description: 'Native mobile application for iOS and Android', type: 'product', progress: 68, team: ['user-1', 'user-4', 'user-5', 'user-3'], capacity: { current: 4, max: 5 }, status: 'active', due_date: '2026-03-31' },
      { id: 'project-2', name: 'API v3 Migration', description: 'Upgrade and migrate all services to API version 3', type: 'engineering', progress: 45, team: ['user-5', 'user-7', 'user-1'], capacity: { current: 3, max: 4 }, status: 'active', due_date: '2026-02-28' },
      { id: 'project-3', name: 'Brand Refresh 2026', description: 'Complete brand identity refresh including new design system', type: 'design', progress: 82, team: ['user-3', 'user-6', 'user-10'], capacity: { current: 3, max: 3 }, status: 'active', due_date: '2026-02-15' },
      { id: 'project-4', name: 'Q1 Marketing Campaign', description: 'Multi-channel marketing campaign for Q1 product launch', type: 'marketing', progress: 35, team: ['user-6', 'user-10', 'user-2'], capacity: { current: 3, max: 4 }, status: 'active', due_date: '2026-03-01' },
      { id: 'project-5', name: 'Performance Optimization', description: 'Backend performance improvements and database optimization', type: 'engineering', progress: 90, team: ['user-5', 'user-7'], capacity: { current: 2, max: 2 }, status: 'active', due_date: '2026-02-10' },
      { id: 'project-6', name: 'User Research Study', description: 'Comprehensive user research for next product iteration', type: 'product', progress: 100, team: ['user-2', 'user-9', 'user-3'], capacity: { current: 3, max: 3 }, status: 'completed', due_date: null },
    ];
    for (const p of PROJECTS_SEED) {
      await client.query(
        `INSERT INTO projects (id, name, description, type, progress, team, capacity, status, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, type = EXCLUDED.type, progress = EXCLUDED.progress, team = EXCLUDED.team, capacity = EXCLUDED.capacity, status = EXCLUDED.status, due_date = EXCLUDED.due_date, updated_at = NOW()`,
        [p.id, p.name, p.description, p.type, p.progress, JSON.stringify(p.team), JSON.stringify(p.capacity), p.status, p.due_date]
      );
    }

    // Set recruitment_status and recruitment_config for marketplace (project-1, project-2 as recruiting)
    await client.query(
      `UPDATE projects SET recruitment_status = 'recruiting', recruitment_config = $1::jsonb, xp_reward = 500 WHERE id = 'project-1'`,
      [JSON.stringify([{ dept: 'engineering', count: 2, filled: 1 }, { dept: 'design', count: 1, filled: 1 }, { dept: 'marketing', count: 1, filled: 0 }])]
    );
    await client.query(
      `UPDATE projects SET recruitment_status = 'recruiting', recruitment_config = $1::jsonb, xp_reward = 750 WHERE id = 'project-2'`,
      [JSON.stringify([{ dept: 'engineering', count: 3, filled: 1 }, { dept: 'product', count: 1, filled: 0 }])]
    );
    await client.query(
      `UPDATE projects SET recruitment_status = 'active' WHERE id IN ('project-3', 'project-4', 'project-5')`
    );

    // Tasks (project_id references projects.id)
    const TASKS_SEED: Array<{ id: string; project_id: string; title: string; description: string; status: string; assignees: string[]; tags: string[]; due_date: string | null; xp_reward: number; priority: string; completed_at: string | null }> = [
      { id: 'task-1', project_id: 'project-1', title: 'Implement push notifications', description: 'Add push notification support for iOS and Android', status: 'in_progress', assignees: ['user-4'], tags: ['mobile', 'ios', 'android'], due_date: '2026-02-05', xp_reward: 75, priority: 'high', completed_at: null },
      { id: 'task-2', project_id: 'project-1', title: 'Design onboarding flow', description: 'Create user onboarding screens and animations', status: 'done', assignees: ['user-3'], tags: ['design', 'ux'], due_date: null, xp_reward: 50, priority: 'medium', completed_at: '2026-01-25' },
      { id: 'task-3', project_id: 'project-1', title: 'Offline mode support', description: 'Implement offline data caching and sync', status: 'todo', assignees: ['user-5'], tags: ['mobile', 'sync'], due_date: '2026-02-20', xp_reward: 100, priority: 'high', completed_at: null },
      { id: 'task-4', project_id: 'project-1', title: 'Performance testing', description: 'Run performance benchmarks on both platforms', status: 'review', assignees: ['user-8'], tags: ['testing', 'performance'], due_date: '2026-02-01', xp_reward: 40, priority: 'medium', completed_at: null },
      { id: 'task-5', project_id: 'project-2', title: 'Migrate user endpoints', description: 'Update all user-related API endpoints to v3', status: 'done', assignees: ['user-5'], tags: ['api', 'backend'], due_date: null, xp_reward: 60, priority: 'high', completed_at: '2026-01-20' },
      { id: 'task-6', project_id: 'project-2', title: 'Update authentication flow', description: 'Implement new OAuth 2.0 flow for v3', status: 'in_progress', assignees: ['user-1', 'user-7'], tags: ['api', 'security', 'auth'], due_date: '2026-02-10', xp_reward: 80, priority: 'urgent', completed_at: null },
      { id: 'task-7', project_id: 'project-2', title: 'Write migration documentation', description: 'Document all breaking changes and migration steps', status: 'todo', assignees: ['user-5'], tags: ['docs', 'api'], due_date: '2026-02-25', xp_reward: 35, priority: 'medium', completed_at: null },
      { id: 'task-8', project_id: 'project-3', title: 'Finalize color palette', description: 'Complete the new brand color system', status: 'done', assignees: ['user-3'], tags: ['design', 'branding'], due_date: null, xp_reward: 45, priority: 'high', completed_at: '2026-01-15' },
      { id: 'task-9', project_id: 'project-3', title: 'Create icon library', description: 'Design new iconography for the brand', status: 'in_progress', assignees: ['user-3'], tags: ['design', 'icons'], due_date: '2026-02-05', xp_reward: 55, priority: 'medium', completed_at: null },
      { id: 'task-10', project_id: 'project-3', title: 'Brand guidelines document', description: 'Compile comprehensive brand guidelines', status: 'review', assignees: ['user-6', 'user-3'], tags: ['docs', 'branding'], due_date: '2026-02-12', xp_reward: 40, priority: 'medium', completed_at: null },
      { id: 'task-11', project_id: 'project-4', title: 'Define target audience', description: 'Research and define target audience segments', status: 'done', assignees: ['user-6'], tags: ['research', 'marketing'], due_date: null, xp_reward: 35, priority: 'high', completed_at: '2026-01-05' },
      { id: 'task-12', project_id: 'project-4', title: 'Create social media content', description: 'Design and schedule social media posts for Q1', status: 'in_progress', assignees: ['user-10'], tags: ['content', 'social'], due_date: '2026-02-15', xp_reward: 50, priority: 'medium', completed_at: null },
      { id: 'task-13', project_id: 'project-4', title: 'First Phase', description: 'Update landing page for the new campaign', status: 'todo', assignees: ['user-3', 'user-4'], tags: ['design', 'web'], due_date: '2026-02-20', xp_reward: 65, priority: 'high', completed_at: null },
      { id: 'task-14', project_id: 'project-5', title: 'Database query optimization', description: 'Optimize slow database queries', status: 'done', assignees: ['user-5'], tags: ['database', 'performance'], due_date: null, xp_reward: 70, priority: 'urgent', completed_at: '2026-01-10' },
      { id: 'task-15', project_id: 'project-5', title: 'Implement caching layer', description: 'Add Redis caching for frequently accessed data', status: 'review', assignees: ['user-7'], tags: ['caching', 'performance'], due_date: '2026-02-05', xp_reward: 60, priority: 'high', completed_at: null },
    ];
    for (const t of TASKS_SEED) {
      await client.query(
        `INSERT INTO tasks (id, project_id, title, description, status, assignees, tags, due_date, xp_reward, priority, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, status = EXCLUDED.status, assignees = EXCLUDED.assignees, tags = EXCLUDED.tags, due_date = EXCLUDED.due_date, xp_reward = EXCLUDED.xp_reward, priority = EXCLUDED.priority, completed_at = EXCLUDED.completed_at`,
        [t.id, t.project_id, t.title, t.description, t.status, JSON.stringify(t.assignees), JSON.stringify(t.tags), t.due_date, t.xp_reward, t.priority, t.completed_at]
      );
    }

    // Knowledge base documents
    const DOCS_SEED = [
      { id: 'doc-1', title: 'Getting Started Guide', content: '# Welcome to Messign Workspace\n\n## Introduction\nWelcome to the Messign gamified workspace! This guide will help you get started with all the features available to you.\n\n## Key Features\n- **Chat**: Communicate with your team in real-time\n- **Projects**: Track and manage your work\n- **XP & Leveling**: Earn XP for your contributions\n- **Badges**: Unlock achievements as you grow\n\n## Tips for Success\n1. Complete your daily tasks to earn XP\n2. Collaborate with teammates on projects\n3. Document your knowledge in the wiki\n4. Help colleagues to earn bonus XP\n', description: 'Your first steps in the Messign workspace', tags: ['onboarding', 'guide', 'getting-started'], author_id: 'user-2', type: 'wiki', is_pinned: true, views: 342 },
      { id: 'doc-2', title: 'API Documentation v3', content: '# API Documentation v3\n\n## Authentication\nAll API requests require a valid JWT token in the Authorization header.\n\n## Endpoints\n### Users\n- GET /api/users - List all users\n- GET /api/users/:id - Get user by ID\n\n### Projects\n- GET /api/projects - List all projects\n- POST /api/projects - Create project\n\n## Rate Limiting\nAPI requests are limited to 100 requests per minute per user.\n', description: 'Complete API reference for developers', tags: ['api', 'documentation', 'technical'], author_id: 'user-5', type: 'wiki', is_pinned: true, views: 567 },
      { id: 'doc-3', title: 'Design System Guidelines', content: '# Messign Design System\n\n## Colors\n### Primary Palette\n- Blue: #3b82f6\n- Purple: #8b5cf6\n- Background: #0a0a0a\n\n## Typography\n- Font Family: Inter\n- Headings: 600-800 weight\n', description: 'Brand and design guidelines for all products', tags: ['design', 'branding', 'guidelines'], author_id: 'user-3', type: 'wiki', is_pinned: true, views: 234 },
      { id: 'doc-4', title: 'Engineering Best Practices', content: '# Engineering Best Practices\n\n## Code Review\n- All PRs require at least one approval\n- Use conventional commits\n\n## Testing\n- Write unit tests for new features\n- Maintain >80% code coverage\n', description: 'Coding standards and best practices', tags: ['engineering', 'best-practices', 'coding'], author_id: 'user-1', type: 'wiki', is_pinned: false, views: 189 },
      { id: 'doc-5', title: 'Marketing Playbook Q1 2026', content: '# Q1 2026 Marketing Playbook\n\n## Campaign Goals\n- Increase brand awareness by 25%\n- Generate 1000 qualified leads\n\n## Target Audience\n- Tech professionals 25-45\n- B2B SaaS decision makers\n', description: 'Marketing strategy and execution plan', tags: ['marketing', 'strategy', 'Q1-2026'], author_id: 'user-6', type: 'wiki', is_pinned: false, views: 87 },
      { id: 'doc-6', title: 'Product Roadmap 2026', content: '# Product Roadmap 2026\n\n## Q1 Priorities\n- Mobile app launch\n- API v3 migration\n- Performance improvements\n\n## Q2 Plans\n- Advanced analytics\n- Team collaboration features\n', description: 'Product vision and roadmap for 2026', tags: ['product', 'roadmap', '2026'], author_id: 'user-2', type: 'wiki', is_pinned: false, views: 156 },
    ];
    for (const d of DOCS_SEED) {
      await client.query(
        `INSERT INTO kb_documents (id, title, content, description, tags, author_id, type, is_pinned, views)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, description = EXCLUDED.description, tags = EXCLUDED.tags, type = EXCLUDED.type, is_pinned = EXCLUDED.is_pinned, views = EXCLUDED.views, updated_at = NOW()`,
        [d.id, d.title, d.content, d.description, JSON.stringify(d.tags), d.author_id, d.type, d.is_pinned, d.views]
      );
    }

    // Roles (role_key maps to reimbursement_users.role for memberCount)
    const ROLES_SEED = [
      { id: 'role-admin', name: 'Admin', description: 'Full system access', role_key: 'admin', permissions: [{ module: 'employees', actions: ['view', 'create', 'edit', 'delete', 'approve'], scope: 'all' }, { module: 'departments', actions: ['view', 'create', 'edit', 'delete', 'approve'], scope: 'all' }, { module: 'roles', actions: ['view', 'create', 'edit', 'delete', 'approve'], scope: 'all' }, { module: 'settings', actions: ['view', 'create', 'edit', 'delete', 'approve'], scope: 'all' }, { module: 'audit', actions: ['view'], scope: 'all' }, { module: 'xp', actions: ['view', 'create', 'edit', 'approve'], scope: 'all' }], is_system: true },
      { id: 'role-manager', name: 'Manager', description: 'Team and project management', role_key: 'manager', permissions: [{ module: 'employees', actions: ['view', 'edit'], scope: 'department' }, { module: 'projects', actions: ['view', 'create', 'edit', 'approve'], scope: 'department' }, { module: 'xp', actions: ['view'], scope: 'department' }], is_system: true },
      { id: 'role-member', name: 'Member', description: 'Standard team member', role_key: 'employee', permissions: [{ module: 'projects', actions: ['view', 'edit'], scope: 'own' }, { module: 'xp', actions: ['view'], scope: 'own' }], is_system: true },
    ];
    for (const r of ROLES_SEED) {
      await client.query(
        `INSERT INTO roles (id, name, description, role_key, permissions, is_system)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, role_key = EXCLUDED.role_key, permissions = EXCLUDED.permissions, is_system = EXCLUDED.is_system, updated_at = NOW()`,
        [r.id, r.name, r.description, r.role_key, JSON.stringify(r.permissions), r.is_system]
      );
    }

    // App settings (single row)
    const APP_SETTINGS_DEFAULT = {
      general: { companyName: 'Messign', timezone: 'UTC', primaryColor: '#6366f1', accentColor: '#22c55e' },
      xp: { globalMultiplier: 1, leaderboardEnabled: true, dailyCap: null, levelUpNotifications: true, xpDecayEnabled: false, xpDecayAfterDays: 30 },
      notifications: { emailEnabled: true, inAppEnabled: true, digestFrequency: 'daily' },
      security: { requireMFA: false, sessionTimeoutMinutes: 60, ipWhitelist: [] },
    };
    await client.query(
      `INSERT INTO app_settings (key, value) VALUES ('default', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(APP_SETTINGS_DEFAULT)]
    );

    // Password policy (for auth)
    const PASSWORD_POLICY = {
      minLength: 8,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      specialCharsAllowed: '!@#$%^&*()_+-=[]{}|;:,.<>?',
      maxFailedAttempts: 5,
      lockoutDurationMinutes: 30,
      passwordHistoryCount: 5,
      sessionTimeoutMinutes: 480,
    };
    await client.query(
      `INSERT INTO app_settings (key, value) VALUES ('password_policy', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(PASSWORD_POLICY)]
    );

    await client.query('COMMIT');
    console.log('Seed completed.');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

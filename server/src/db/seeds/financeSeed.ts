import { query, getClient } from '../index.js';
import crypto from 'crypto';
import { CATEGORY_DEPARTMENT_MAP } from '../../services/finance/categoryDepartmentMap.js';

const DEFAULT_ORG_SLUG = 'messign';

function randomFloat(min: number, max: number, dec = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(dec));
}
function randomDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
  return d.toISOString().split('T')[0];
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function seedFinanceData() {
  const orgResult = await query<{ id: string }>('SELECT id FROM organizations WHERE slug = $1', [DEFAULT_ORG_SLUG]);
  const orgId = orgResult.rows[0]?.id;
  if (!orgId) { console.log('[seed] No org found, skipping.'); return; }

  // Idempotency: skip if finance data already exists (expenses are inserted without conflict clauses)
  const existing = await query<{ c: string }>('SELECT COUNT(*) as c FROM reimbursement_requests WHERE organization_id = $1', [orgId]);
  if (parseInt(existing.rows[0].c) > 5) {
    console.log('[seed] Finance data already seeded (' + existing.rows[0].c + ' expenses exist), skipping.');
    return;
  }

  const usersResult = await query<{ id: string; full_name: string; role: string; manager_id: string | null }>(
    'SELECT id, full_name, role, manager_id FROM reimbursement_users WHERE organization_id = $1 LIMIT 20',
    [orgId],
  );
  const users = usersResult.rows;
  if (users.length === 0) { console.log('[seed] No users found, skipping.'); return; }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Expense categories with GL codes
    const categories = [
      { slug: 'travel_flight', name: 'Travel - Flights', gl_code: '6100', icon: 'plane' },
      { slug: 'travel_hotel', name: 'Travel - Hotels', gl_code: '6110', icon: 'hotel' },
      { slug: 'travel_ground', name: 'Travel - Ground Transport', gl_code: '6120', icon: 'car' },
      { slug: 'meals_business', name: 'Meals - Business', gl_code: '6200', icon: 'utensils' },
      { slug: 'meals_team', name: 'Meals - Team', gl_code: '6210', icon: 'pizza' },
      { slug: 'meals_client', name: 'Meals - Client Entertainment', gl_code: '6220', icon: 'wine' },
      { slug: 'office_supplies', name: 'Office Supplies', gl_code: '6300', icon: 'paperclip' },
      { slug: 'office_equipment', name: 'Office Equipment', gl_code: '6310', icon: 'monitor' },
      { slug: 'software_subscription', name: 'Software - Subscription', gl_code: '6400', icon: 'disc' },
      { slug: 'software_license', name: 'Software - License', gl_code: '6410', icon: 'file' },
      { slug: 'marketing_ads', name: 'Marketing - Advertising', gl_code: '6500', icon: 'megaphone' },
      { slug: 'marketing_events', name: 'Marketing - Events', gl_code: '6510', icon: 'tent' },
      { slug: 'training_course', name: 'Training - Courses', gl_code: '6600', icon: 'book' },
      { slug: 'training_conference', name: 'Training - Conferences', gl_code: '6610', icon: 'mic' },
      { slug: 'professional_legal', name: 'Professional - Legal', gl_code: '6700', icon: 'scale' },
      { slug: 'professional_consulting', name: 'Professional - Consulting', gl_code: '6710', icon: 'briefcase' },
      { slug: 'utilities', name: 'Utilities', gl_code: '6800', icon: 'zap' },
      { slug: 'communication_phone', name: 'Communication - Phone', gl_code: '6900', icon: 'phone' },
      { slug: 'communication_internet', name: 'Communication - Internet', gl_code: '6910', icon: 'wifi' },
      { slug: 'healthcare', name: 'Healthcare', gl_code: '7000', icon: 'heart-pulse' },
      { slug: 'other', name: 'Other', gl_code: '6999', icon: 'package' },
    ];

    const categoryMap = new Map<string, string>();
    for (const cat of categories) {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM expense_categories WHERE organization_id = $1 AND name = $2`,
        [orgId, cat.name],
      );
      if (existing.rows[0]) {
        await client.query(
          `UPDATE expense_categories SET slug = $1, gl_code = $2, icon = $3 WHERE id = $4`,
          [cat.slug, cat.gl_code, cat.icon, existing.rows[0].id],
        );
        categoryMap.set(cat.slug, existing.rows[0].id);
      } else {
        const r = await client.query<{ id: string }>(
          `INSERT INTO expense_categories (organization_id, name, icon, slug, gl_code, is_active)
           VALUES ($1, $2, $3, $4, $5, TRUE)
           RETURNING id`,
          [orgId, cat.name, cat.icon, cat.slug, cat.gl_code],
        );
        if (r.rows[0]) categoryMap.set(cat.slug, r.rows[0].id);
      }
    }

    // 2. Vendors
    const vendors = [
      { name: 'Amazon Web Services', category: 'software_subscription' },
      { name: 'Google Workspace', category: 'software_subscription' },
      { name: 'Figma', category: 'software_subscription' },
      { name: 'Slack', category: 'software_subscription' },
      { name: 'WeWork', category: 'utilities' },
      { name: 'Delta Airlines', category: 'travel_flight' },
      { name: 'Marriott Hotels', category: 'travel_hotel' },
      { name: 'Uber', category: 'travel_ground' },
      { name: 'Staples', category: 'office_supplies' },
      { name: 'Meta Ads', category: 'marketing_ads' },
      { name: 'Google Ads', category: 'marketing_ads' },
      { name: 'Udemy Business', category: 'training_course' },
      { name: 'Verizon Business', category: 'communication_phone' },
      { name: 'Baker & McKenzie', category: 'professional_legal' },
      { name: 'Grubhub Corporate', category: 'meals_team' },
    ];

    const vendorIds: string[] = [];
    for (const v of vendors) {
      const r = await client.query<{ id: string }>(
        `INSERT INTO finance_vendors (organization_id, name, ai_category, is_active, is_verified)
         VALUES ($1, $2, $3, TRUE, TRUE)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [orgId, v.name, v.category],
      );
      if (r.rows[0]) vendorIds.push(r.rows[0].id);
    }

    // 3. GL Accounts
    const glAccounts = [
      { code: '1000', name: 'Cash and Equivalents', type: 'asset' },
      { code: '1100', name: 'Accounts Receivable', type: 'asset' },
      { code: '2000', name: 'Accounts Payable', type: 'liability' },
      { code: '4000', name: 'Revenue', type: 'revenue' },
      { code: '5000', name: 'Cost of Goods Sold', type: 'expense' },
      { code: '6000', name: 'Operating Expenses', type: 'expense' },
      { code: '6100', name: 'Travel Expenses', type: 'expense' },
      { code: '6200', name: 'Meals & Entertainment', type: 'expense' },
      { code: '6300', name: 'Office & Supplies', type: 'expense' },
      { code: '6400', name: 'Software & Technology', type: 'expense' },
      { code: '6500', name: 'Marketing', type: 'expense' },
      { code: '6600', name: 'Training & Development', type: 'expense' },
      { code: '6700', name: 'Professional Services', type: 'expense' },
      { code: '3000', name: 'Equity', type: 'equity' },
    ];

    for (const gl of glAccounts) {
      await client.query(
        `INSERT INTO finance_gl_accounts (organization_id, code, name, type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, code) DO NOTHING`,
        [orgId, gl.code, gl.name, gl.type],
      );
    }

    // 4. Approval Policies
    await client.query(
      `INSERT INTO finance_approval_policies
       (organization_id, name, applies_to, rules, ai_auto_approve_enabled, ai_auto_approve_max, ai_min_confidence, ai_max_risk)
       VALUES ($1, 'Standard Expense Policy', 'expense', $2, TRUE, 100.00, 0.95, 0.20)
       ON CONFLICT DO NOTHING`,
      [orgId, JSON.stringify([
        { condition: 'amount < 50', action: 'auto_approve', ai_confidence_min: 0.95 },
        { condition: 'amount < 500', action: 'manager_approval' },
        { condition: 'amount < 5000', action: 'manager_then_finance' },
        { condition: 'amount >= 5000', action: 'manager_finance_cfo' },
      ])],
    );

    // 5. Expense Policies
    await client.query(
      `INSERT INTO finance_expense_policies
       (organization_id, name, rules, violation_action, is_active, created_by)
       VALUES ($1, 'Standard Travel & Meals Policy', $2, 'flag', TRUE, $3)
       ON CONFLICT DO NOTHING`,
      [orgId, JSON.stringify({
        travel_flight: { max_amount: 1500, requires_pre_approval_above: 2000 },
        travel_hotel: { max_per_night: 250 },
        meals_business: { max_per_person: 75, requires_receipt_above: 25 },
        meals_client: { max_per_event: 500, requires_attendees_above: 50 },
      }), users[0].id],
    );

    // 6. Realistic expenses (70 expenses)
    const expenseTemplates = [
      { title: 'Airport taxi SFO', slug: 'travel_ground', min: 30, max: 80 },
      { title: 'Team lunch at Nobu', slug: 'meals_team', min: 150, max: 450 },
      { title: 'AWS monthly bill', slug: 'software_subscription', min: 1800, max: 2500 },
      { title: 'Client dinner', slug: 'meals_client', min: 200, max: 900 },
      { title: 'Figma annual license', slug: 'software_subscription', min: 144, max: 180 },
      { title: 'Conference registration', slug: 'training_conference', min: 500, max: 1500 },
      { title: 'Office supplies order', slug: 'office_supplies', min: 50, max: 300 },
      { title: 'Google Ads campaign', slug: 'marketing_ads', min: 2000, max: 8000 },
      { title: 'Flight to NYC', slug: 'travel_flight', min: 300, max: 1200 },
      { title: 'Marriott 2 nights', slug: 'travel_hotel', min: 350, max: 600 },
      { title: 'Uber rides (weekly)', slug: 'travel_ground', min: 20, max: 60 },
      { title: 'Team pizza Friday', slug: 'meals_team', min: 60, max: 120 },
      { title: 'Standing desk', slug: 'office_equipment', min: 400, max: 800 },
      { title: 'Legal consultation', slug: 'professional_legal', min: 1000, max: 5000 },
      { title: 'Slack annual plan', slug: 'software_subscription', min: 280, max: 350 },
      { title: 'Udemy course bundle', slug: 'training_course', min: 30, max: 200 },
      { title: 'Verizon monthly', slug: 'communication_phone', min: 50, max: 100 },
      { title: 'Meta ads spend', slug: 'marketing_ads', min: 3000, max: 6000 },
      { title: 'Office coffee supply', slug: 'office_supplies', min: 40, max: 80 },
      { title: 'Team building event', slug: 'marketing_events', min: 500, max: 2000 },
    ];

    const statuses = [
      'draft', 'draft', 'draft',
      'submitted', 'submitted',
      'ai_reviewing',
      'ai_approved', 'ai_approved', 'ai_approved', 'ai_approved',
      'ai_flagged',
      'manager_review', 'manager_review', 'manager_review',
      'approved', 'approved', 'approved', 'approved',
      'rejected',
      'paid', 'paid', 'paid', 'paid',
    ];

    const expenseIds: string[] = [];
    for (let i = 0; i < 70; i++) {
      const tmpl = pick(expenseTemplates);
      const user = pick(users);
      const amount = randomFloat(tmpl.min, tmpl.max);
      const status = pick(statuses);
      const confidence = status.startsWith('ai_') || status === 'approved' || status === 'paid'
        ? randomFloat(0.6, 1.0) : null;
      const risk = confidence != null ? randomFloat(0, 0.5) : null;
      const autoApproved = status === 'ai_approved' && (confidence ?? 0) >= 0.95 && (risk ?? 0) <= 0.2;
      const date = randomDate(90);

      const submittedAt = status !== 'draft' ? new Date(Date.now() - 5 * 86400000).toISOString() : null;
      const approvedAt = ['approved', 'paid', 'reimbursed'].includes(status) ? new Date(Date.now() - 2 * 86400000).toISOString() : null;
      const paidAt = status === 'paid' ? new Date(Date.now() - 86400000).toISOString() : null;
      const catId = categoryMap.get(tmpl.slug) || categoryMap.values().next().value;

      const r = await client.query<{ id: string }>(
        `INSERT INTO reimbursement_requests
         (organization_id, submitted_by, title, description, category_id, category_slug,
          original_amount, original_currency, converted_amount, expense_date, status,
          ai_confidence_score, ai_risk_score, ai_auto_approved, ai_category_suggestion,
          ai_review_notes, submitted_at, approved_at, paid_at, created_by, is_deleted)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'USD',$7,$8,$9,$10,$11,$12,$6,$13,
                 $14, $15, $16, $2, FALSE)
         RETURNING id`,
        [
          orgId, user.id, tmpl.title, `Expense for ${tmpl.title} on ${date}`,
          catId, tmpl.slug, amount, date, status,
          confidence, risk, autoApproved,
          confidence != null ? `Standard ${tmpl.slug} expense. Amount is within expected range.` : null,
          submittedAt, approvedAt, paidAt,
        ],
      );
      if (r.rows[0]) expenseIds.push(r.rows[0].id);
    }

    // 7. Budgets (per department)
    const departments = ['Engineering', 'Marketing', 'Operations', 'Sales', 'General'];
    const budgetAmounts = [50000, 30000, 20000, 25000, 15000];
    const budgetIds: string[] = [];
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    for (let i = 0; i < departments.length; i++) {
      const allocated = budgetAmounts[i];
      const spent = randomFloat(allocated * 0.3, allocated * 0.92);
      const owner = users.find((u) => u.role === 'admin' || u.role === 'manager') || users[0];
      const r = await client.query<{ id: string }>(
        `INSERT INTO finance_budgets
         (organization_id, name, department, allocated_amount, spent_amount, currency,
          period_start, period_end, status, owner_id,
          warning_threshold, critical_threshold, created_by,
          ai_health_score, ai_forecast_amount, is_active)
         VALUES ($1, $2, $3, $4, $5, 'USD', $6, $7, 'active', $8,
                 80.00, 95.00, $8, $9, $10, TRUE)
         RETURNING id`,
        [
          orgId, `${departments[i]} Q1 Budget`, departments[i],
          allocated, spent, periodStart, periodEnd, owner.id,
          randomFloat(0.4, 0.95), randomFloat(spent, allocated * 1.1),
        ],
      );
      if (r.rows[0]) budgetIds.push(r.rows[0].id);
    }

    // 7b. Invoices (20 realistic invoices)
    const invoiceStatuses = [
      'draft', 'draft', 'sent', 'sent', 'sent',
      'paid', 'paid', 'paid', 'paid',
      'overdue', 'overdue',
    ];
    const invoiceClients = [
      'Acme Corp', 'TechVentures Inc', 'Global Media LLC', 'Horizon Partners',
      'Blue Sky Solutions', 'NextGen Digital', 'Atlas Marketing',
    ];

    for (let i = 0; i < 20; i++) {
      const emp = pick(users);
      const status = pick(invoiceStatuses);
      const baseRetainer = randomFloat(3000, 8000);
      const totalExpenses = randomFloat(200, 2000);
      const grandTotal = parseFloat((baseRetainer + totalExpenses).toFixed(2));
      const issueDate = randomDate(60);
      const dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + 30);
      const clientName = pick(invoiceClients);

      await client.query(
        `INSERT INTO invoices
         (invoice_number, employee_id, period_year, period_month,
          base_retainer, total_expenses, grand_total, status,
          generated_date, due_date,
          organization_id, invoice_type, to_name, to_email,
          ai_generated, ai_confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 'standard', $12, $13, $14, $15)
         ON CONFLICT DO NOTHING`,
        [
          `INV-2026-${String(i + 1).padStart(4, '0')}`, emp.id,
          new Date(issueDate).getFullYear(), new Date(issueDate).getMonth() + 1,
          baseRetainer, totalExpenses, grandTotal, status,
          issueDate, dueDate.toISOString().split('T')[0],
          orgId, clientName,
          `billing@${clientName.toLowerCase().replace(/\s+/g, '')}.com`,
          Math.random() > 0.7, Math.random() > 0.7 ? randomFloat(0.8, 1.0) : null,
        ],
      );
    }

    // 7c. Payments (15 vendor payments)
    const paymentStatuses: Array<'pending' | 'processing' | 'completed' | 'failed'> =
      ['pending', 'processing', 'completed', 'completed', 'completed', 'failed'];
    const paymentMethods = ['bank_transfer', 'check', 'credit_card', 'ach'];
    const paymentTypes: Array<'vendor_payment' | 'expense_reimbursement' | 'invoice_payment'> =
      ['vendor_payment', 'expense_reimbursement', 'invoice_payment'];
    for (let i = 0; i < 15; i++) {
      const vid = vendorIds.length > 0 ? pick(vendorIds) : null;
      const amount = randomFloat(500, 10000);
      const payer = users.find((u) => u.role === 'admin') || users[0];
      const pStatus = pick(paymentStatuses);
      const completedAt = pStatus === 'completed' ? new Date().toISOString() : null;
      await client.query(
        `INSERT INTO finance_payments
         (organization_id, payment_number, payment_type, vendor_id,
          amount, currency, payment_method, status,
          scheduled_date, completed_at, ai_scheduled, created_by)
         VALUES ($1, $2, $3, $4, $5, 'USD', $6, $7, $8,
                 $9, $10, $11)
         ON CONFLICT DO NOTHING`,
        [
          orgId, `PAY-${String(i + 1).padStart(4, '0')}`, pick(paymentTypes), vid,
          amount, pick(paymentMethods), pStatus,
          new Date(Date.now() + (7 + i) * 86400000).toISOString().split('T')[0],
          completedAt, Math.random() > 0.6, payer.id,
        ],
      );
    }

    // 7d. Notifications (sample)
    for (let i = 0; i < 30; i++) {
      const u = pick(users);
      const types = [
        'expense_approved', 'expense_rejected', 'expense_flagged',
        'budget_warning', 'budget_critical', 'invoice_due',
        'payment_completed', 'ai_recommendation',
      ];
      const nType = pick(types);
      await client.query(
        `INSERT INTO finance_notifications
         (organization_id, recipient_id, type, title, message, priority, is_read)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [
          orgId, u.id, nType,
          `${nType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}`,
          `Notification for ${u.full_name}: ${nType.replace(/_/g, ' ')} event occurred.`,
          nType.includes('critical') || nType.includes('rejected') ? 'high' : 'normal',
          Math.random() > 0.5,
        ],
      );
    }

    // 7e. Approval steps for review/approved expenses
    for (const eid of expenseIds) {
      const exp = await client.query(
        'SELECT status, submitted_by FROM reimbursement_requests WHERE id = $1',
        [eid],
      );
      const s = exp.rows[0]?.status;
      if (['manager_review', 'approved', 'paid'].includes(s)) {
        const submitter = exp.rows[0]?.submitted_by;
        const approver = users.find((u) => u.role === 'manager' || u.role === 'admin');
        if (approver && approver.id !== submitter) {
          await client.query(
            `INSERT INTO approval_steps
             (reimbursement_id, step_order, step_type, assigned_to, status,
              entity_type, entity_id, step_name, decision_at, decision_notes)
             VALUES ($1, 1, 'manager_approval', $2,
                     CASE WHEN $3 IN ('approved','paid') THEN 'approved' ELSE 'pending' END,
                     'expense', $1, 'Manager Approval',
                     CASE WHEN $3 IN ('approved','paid') THEN NOW() ELSE NULL END,
                     CASE WHEN $3 IN ('approved','paid') THEN 'Looks good, approved.' ELSE NULL END)`,
            [eid, approver.id, s],
          );
        }
      }
    }

    // 8. Audit log entries
    let prevHash = '0'.repeat(64);
    const events = [
      'expense.created', 'expense.submitted', 'expense.ai_reviewed',
      'expense.approved', 'expense.rejected', 'budget.threshold_warning',
      'policy.checked', 'expense.paid',
    ];
    for (let i = 0; i < 100; i++) {
      const event = pick(events);
      const eId = pick(expenseIds) || crypto.randomUUID();
      const actor = pick(users);
      const data = JSON.stringify({
        event_type: event, entity_id: eId, previous_hash: prevHash,
        timestamp: new Date(Date.now() - (100 - i) * 3600000).toISOString(),
      });
      const hash = crypto.createHash('sha256').update(data).digest('hex');

      await client.query(
        `INSERT INTO finance_audit_log
         (organization_id, event_type, event_category, actor_type, actor_id, actor_name,
          entity_type, entity_id, event_hash, previous_hash, ai_involved)
         VALUES ($1, $2, 'expense', $3, $4, $5, 'expense', $6, $7, $8, $9)`,
        [
          orgId, event,
          event.startsWith('expense.ai') ? 'ai' : 'user',
          actor.id, actor.full_name, eId, hash, prevHash,
          event.includes('ai'),
        ],
      );
      prevHash = hash;
    }

    // 9. Link expenses to budgets by mapping category to department
    const budgetByDept = new Map<string, string>();
    for (const bid of budgetIds) {
      const br = await client.query<{ department: string }>('SELECT department FROM finance_budgets WHERE id = $1', [bid]);
      if (br.rows[0]) budgetByDept.set(br.rows[0].department, bid);
    }

    for (const eid of expenseIds) {
      const er = await client.query<{ category_slug: string }>('SELECT category_slug FROM reimbursement_requests WHERE id = $1', [eid]);
      const slug = er.rows[0]?.category_slug;
      if (slug) {
        const dept = CATEGORY_DEPARTMENT_MAP[slug] || 'General';
        const bid = budgetByDept.get(dept);
        if (bid) {
          await client.query('UPDATE reimbursement_requests SET budget_id = $1 WHERE id = $2', [bid, eid]);
        }
      }
    }

    // 9b. Insert current-month expenses so KPIs show data
    const currentMonthTemplates = [
      { title: 'Uber to airport', slug: 'travel_ground', min: 25, max: 65, status: 'approved' },
      { title: 'Team lunch downtown', slug: 'meals_team', min: 80, max: 200, status: 'approved' },
      { title: 'AWS February bill', slug: 'software_subscription', min: 1900, max: 2400, status: 'paid' },
      { title: 'Client meeting dinner', slug: 'meals_client', min: 150, max: 400, status: 'manager_review' },
      { title: 'Office printer paper', slug: 'office_supplies', min: 30, max: 60, status: 'ai_approved' },
      { title: 'Google Ads Feb campaign', slug: 'marketing_ads', min: 2500, max: 5000, status: 'submitted' },
      { title: 'Flight to LA meeting', slug: 'travel_flight', min: 280, max: 550, status: 'approved' },
      { title: 'Hilton 1 night LA', slug: 'travel_hotel', min: 180, max: 320, status: 'approved' },
      { title: 'Lyft rides week', slug: 'travel_ground', min: 35, max: 55, status: 'paid' },
      { title: 'Friday team pizza', slug: 'meals_team', min: 50, max: 100, status: 'ai_approved' },
      { title: 'Monitor arm', slug: 'office_equipment', min: 45, max: 90, status: 'draft' },
      { title: 'Legal review contract', slug: 'professional_legal', min: 800, max: 2000, status: 'manager_review' },
      { title: 'Slack monthly', slug: 'software_subscription', min: 25, max: 35, status: 'paid' },
      { title: 'Udemy course React', slug: 'training_course', min: 15, max: 50, status: 'ai_approved' },
      { title: 'Cell phone bill', slug: 'communication_phone', min: 55, max: 85, status: 'approved' },
      { title: 'Meta ads Feb', slug: 'marketing_ads', min: 1500, max: 3500, status: 'paid' },
      { title: 'Coffee supplies', slug: 'office_supplies', min: 25, max: 50, status: 'approved' },
      { title: 'Workshop venue', slug: 'marketing_events', min: 600, max: 1200, status: 'submitted' },
      { title: 'Parking garage', slug: 'travel_ground', min: 15, max: 30, status: 'ai_approved' },
      { title: 'Business cards print', slug: 'office_supplies', min: 35, max: 70, status: 'approved' },
      { title: 'Consulting fee Feb', slug: 'professional_consulting', min: 1500, max: 3000, status: 'paid' },
      { title: 'Internet bill Feb', slug: 'communication_internet', min: 60, max: 100, status: 'paid' },
      { title: 'Notion subscription', slug: 'software_subscription', min: 10, max: 15, status: 'ai_approved' },
      { title: 'Team offsite catering', slug: 'meals_team', min: 300, max: 600, status: 'manager_review' },
      { title: 'Conference ticket SaaStr', slug: 'training_conference', min: 700, max: 1200, status: 'submitted' },
    ];

    const today = new Date();
    for (const tmpl of currentMonthTemplates) {
      const user = pick(users);
      const amount = randomFloat(tmpl.min, tmpl.max);
      const dayOfMonth = Math.max(1, Math.min(today.getDate(), 28) - Math.floor(Math.random() * Math.min(today.getDate(), 20)));
      const expDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
      const confidence = tmpl.status !== 'draft' ? randomFloat(0.7, 1.0) : null;
      const risk = confidence != null ? randomFloat(0, 0.4) : null;
      const autoApproved = tmpl.status === 'ai_approved';
      const catId = categoryMap.get(tmpl.slug) || categoryMap.values().next().value;
      const dept = CATEGORY_DEPARTMENT_MAP[tmpl.slug] || 'General';
      const bid = budgetByDept.get(dept) || null;

      const isApproved = ['approved', 'paid', 'ai_approved'].includes(tmpl.status);
      const isPaid = tmpl.status === 'paid';
      const submittedAt = tmpl.status !== 'draft' ? new Date(today.getFullYear(), today.getMonth(), dayOfMonth, 9, 0).toISOString() : null;
      const approvedAt = isApproved ? new Date(today.getFullYear(), today.getMonth(), dayOfMonth + 1, 14, 0).toISOString() : null;
      const paidAt = isPaid ? new Date(today.getFullYear(), today.getMonth(), dayOfMonth + 2, 10, 0).toISOString() : null;

      const r = await client.query<{ id: string }>(
        `INSERT INTO reimbursement_requests
         (organization_id, submitted_by, title, description, category_id, category_slug,
          original_amount, original_currency, converted_amount, expense_date, status,
          ai_confidence_score, ai_risk_score, ai_auto_approved, ai_category_suggestion,
          ai_review_notes, submitted_at, approved_at, paid_at, budget_id, created_by, is_deleted)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'USD',$7,$8,$9,$10,$11,$12,$6,$13,$14,$15,$16,$17,$2,FALSE)
         RETURNING id`,
        [
          orgId, user.id, tmpl.title, `Current month expense: ${tmpl.title}`,
          catId, tmpl.slug, amount, expDate, tmpl.status,
          confidence, risk, autoApproved,
          confidence != null ? `AI reviewed. Category ${tmpl.slug} confirmed. Amount within normal range.` : null,
          submittedAt, approvedAt, paidAt, bid,
        ],
      );
      if (r.rows[0]) expenseIds.push(r.rows[0].id);
    }

    // 9c. Sync budget spent_amount from actual approved expenses
    await client.query(`
      UPDATE finance_budgets SET spent_amount = sub.total FROM (
        SELECT budget_id, COALESCE(SUM(original_amount), 0) as total
        FROM reimbursement_requests
        WHERE budget_id IS NOT NULL AND status IN ('approved','paid','ai_approved','reimbursed') AND is_deleted = FALSE
        GROUP BY budget_id
      ) sub WHERE finance_budgets.id = sub.budget_id
    `);

    // 9d. Budget snapshots (30 daily entries per budget)
    for (const bid of budgetIds) {
      const budgetRow = await client.query<{ allocated_amount: string; spent_amount: string }>(
        'SELECT allocated_amount, spent_amount FROM finance_budgets WHERE id = $1', [bid],
      );
      const allocated = parseFloat(budgetRow.rows[0]?.allocated_amount ?? '0');
      const finalSpent = parseFloat(budgetRow.rows[0]?.spent_amount ?? '0');
      for (let d = 29; d >= 0; d--) {
        const snapDate = new Date();
        snapDate.setDate(snapDate.getDate() - d);
        const pctDone = (30 - d) / 30;
        const dailySpent = finalSpent * pctDone * (0.85 + Math.random() * 0.3);
        const hs = Math.max(0.2, Math.min(1.0, 1 - (dailySpent / allocated)));
        await client.query(
          `INSERT INTO finance_budget_snapshots
           (budget_id, snapshot_date, total_amount, spent_amount, allocated_amount, forecast_amount, health_score)
           VALUES ($1, $2, $3, $4, $3, $5, $6)
           ON CONFLICT DO NOTHING`,
          [bid, snapDate.toISOString().split('T')[0], allocated, dailySpent.toFixed(2),
           (dailySpent * 1.15).toFixed(2), hs.toFixed(2)],
        );
      }
    }

    // 9e. Finance settings
    await client.query(
      `INSERT INTO finance_settings
       (organization_id, company_name, company_address, company_email, base_currency,
        dora_autonomy_level, dora_auto_approve_enabled, dora_auto_approve_max,
        dora_min_confidence, dora_max_risk)
       VALUES ($1, 'Messign Communications', 'Delaware, USA', 'finance@messign.com', 'USD',
               'copilot', TRUE, 100.00, 0.95, 0.20)
       ON CONFLICT (organization_id) DO NOTHING`,
      [orgId],
    );

    // 9f. Invoice line items for seeded invoices
    const invoiceRows = await client.query<{ id: string; base_retainer: string; total_expenses: string }>(
      `SELECT id, base_retainer, total_expenses FROM invoices WHERE organization_id = $1 ORDER BY created_at`,
      [orgId],
    );
    for (const inv of invoiceRows.rows) {
      const retainer = parseFloat(inv.base_retainer);
      const expenses = parseFloat(inv.total_expenses);
      await client.query(
        `INSERT INTO invoice_line_items (invoice_id, description, amount_eur, sort_order)
         VALUES ($1, 'Monthly Consulting Retainer', $2, 1)
         ON CONFLICT DO NOTHING`,
        [inv.id, retainer],
      );
      if (expenses > 0) {
        const numItems = Math.floor(Math.random() * 3) + 1;
        for (let li = 0; li < numItems; li++) {
          const liAmt = li === numItems - 1
            ? expenses - (expenses / numItems) * li
            : expenses / numItems;
          const descriptions = ['Travel reimbursement', 'Software licenses', 'Office supplies', 'Client entertainment'];
          await client.query(
            `INSERT INTO invoice_line_items (invoice_id, description, amount_eur, sort_order)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [inv.id, pick(descriptions), liAmt.toFixed(2), li + 2],
          );
        }
      }
    }

    // 10. Dora decisions
    for (let i = 0; i < 25; i++) {
      const eId = pick(expenseIds) || crypto.randomUUID();
      const decisionTypes = ['auto_categorize', 'policy_check', 'risk_assessment', 'auto_approve', 'flag_for_review'];
      const dt = pick(decisionTypes);
      const conf = randomFloat(0.5, 1.0);
      await client.query(
        `INSERT INTO finance_dora_decisions
         (organization_id, decision_type, entity_type, entity_id, action_taken,
          confidence_score, reasoning, processing_time_ms, model_used)
         VALUES ($1, $2, 'expense', $3, $4, $5, $6, $7, 'llama-3.3-70b-versatile')`,
        [
          orgId, dt, eId, dt,
          conf,
          `Analyzed expense with ${dt}. Confidence: ${(conf * 100).toFixed(0)}%. Amount within expected range for this category.`,
          Math.floor(Math.random() * 2000 + 200),
        ],
      );
    }

    // 11. Tax Rates
    const taxRates = [
      { name: 'Standard VAT', code: 'VAT-STD', rate: 20.0, type: 'vat' },
      { name: 'Reduced VAT', code: 'VAT-RED', rate: 5.0, type: 'vat' },
      { name: 'Zero-rated', code: 'VAT-ZERO', rate: 0.0, type: 'vat' },
      { name: 'Sales Tax', code: 'SALES-STD', rate: 8.25, type: 'sales' },
      { name: 'Withholding Tax', code: 'WHT-10', rate: 10.0, type: 'withholding' },
    ];
    for (const tr of taxRates) {
      await client.query(
        `INSERT INTO finance_tax_rates (organization_id, name, code, rate, type, is_default)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id, code) DO NOTHING`,
        [orgId, tr.name, tr.code, tr.rate, tr.type, tr.code === 'VAT-STD'],
      );
    }

    // 12. Current period close with default tasks
    const currentPeriod = new Date().toISOString().slice(0, 7);
    const pcResult = await client.query(
      `INSERT INTO finance_period_closes (organization_id, period, status)
       VALUES ($1, $2, 'open')
       ON CONFLICT (organization_id, period) DO NOTHING
       RETURNING id`,
      [orgId, currentPeriod],
    );
    if (pcResult.rows[0]) {
      const pcId = pcResult.rows[0].id;
      const defaultTasks = [
        { key: 'review_expenses', label: 'Review all pending expenses', order: 1 },
        { key: 'approve_invoices', label: 'Approve/finalize all draft invoices', order: 2 },
        { key: 'reconcile_payments', label: 'Verify all payments are recorded', order: 3 },
        { key: 'review_journal_entries', label: 'Review auto-generated journal entries', order: 4 },
        { key: 'verify_gl_balances', label: 'Verify GL account balances match', order: 5 },
        { key: 'run_pl_report', label: 'Generate and review P&L report', order: 6 },
        { key: 'review_tax', label: 'Review tax obligations', order: 7 },
        { key: 'manager_signoff', label: 'Manager sign-off', order: 8 },
      ];
      for (const t of defaultTasks) {
        await client.query(
          `INSERT INTO finance_period_close_tasks (period_close_id, task_key, label, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [pcId, t.key, t.label, t.order],
        );
      }
    }

    // 13. Seed journal entries for approved/paid expenses and sent invoices
    const glAccountMap = new Map<string, string>();
    const glRows = await client.query('SELECT id, code FROM finance_gl_accounts WHERE organization_id = $1', [orgId]);
    for (const r of glRows.rows) glAccountMap.set(r.code, r.id);

    const approvedExpenses = await client.query(
      `SELECT r.id, r.original_amount AS amount, r.title, r.approved_at, ec.gl_code
       FROM reimbursement_requests r
       LEFT JOIN expense_categories ec ON ec.id = r.category_id
       WHERE r.organization_id = $1 AND r.status IN ('approved', 'paid', 'reimbursed', 'ai_approved', 'manager_approved', 'finance_approved')
       LIMIT 15`,
      [orgId],
    );

    let jeCounter = 1;
    for (const exp of approvedExpenses.rows) {
      const entryNum = `JE-${String(jeCounter++).padStart(5, '0')}`;
      const amount = parseFloat(exp.amount);
      const glCode = exp.gl_code || '6000';
      const drAccountId = glAccountMap.get(glCode) || glAccountMap.get('6000');
      const crAccountId = glAccountMap.get('2000');
      if (!drAccountId || !crAccountId) continue;

      const je = await client.query(
        `INSERT INTO finance_journal_entries
         (organization_id, entry_number, entry_date, description, source_type, source_id,
          status, period, total_debit, total_credit, is_auto_generated, posted_at)
         VALUES ($1, $2, COALESCE($3::DATE, CURRENT_DATE), $4, 'expense_approved', $5,
                 'posted', $6, $7, $7, TRUE, NOW())
         ON CONFLICT (organization_id, entry_number) DO NOTHING
         RETURNING id`,
        [orgId, entryNum,
         exp.approved_at ? new Date(exp.approved_at).toISOString().split('T')[0] : null,
         `Expense approved: ${exp.title}`, exp.id,
         (exp.approved_at ? new Date(exp.approved_at).toISOString() : new Date().toISOString()).slice(0, 7), amount],
      );
      if (je.rows[0]) {
        await client.query(
          `INSERT INTO finance_journal_lines (journal_entry_id, gl_account_id, debit_amount, credit_amount, description, sort_order)
           VALUES ($1, $2, $3, 0, $4, 0), ($1, $5, 0, $3, $4, 1)`,
          [je.rows[0].id, drAccountId, amount, `Expense: ${exp.title}`, crAccountId],
        );
      }
    }

    const sentInvoices = await client.query(
      `SELECT id, invoice_number, to_name, grand_total, total_amount, sent_at
       FROM invoices
       WHERE organization_id = $1 AND status IN ('sent', 'paid', 'partially_paid')
       LIMIT 10`,
      [orgId],
    );

    for (const inv of sentInvoices.rows) {
      const entryNum = `JE-${String(jeCounter++).padStart(5, '0')}`;
      const amount = parseFloat(inv.grand_total || inv.total_amount);
      const drAccountId = glAccountMap.get('1100');
      const crAccountId = glAccountMap.get('4000');
      if (!drAccountId || !crAccountId || isNaN(amount)) continue;

      const je = await client.query(
        `INSERT INTO finance_journal_entries
         (organization_id, entry_number, entry_date, description, source_type, source_id,
          status, period, total_debit, total_credit, is_auto_generated, posted_at)
         VALUES ($1, $2, COALESCE($3::DATE, CURRENT_DATE), $4, 'invoice_sent', $5,
                 'posted', $6, $7, $7, TRUE, NOW())
         ON CONFLICT (organization_id, entry_number) DO NOTHING
         RETURNING id`,
        [orgId, entryNum,
         inv.sent_at ? new Date(inv.sent_at).toISOString().split('T')[0] : null,
         `Invoice sent: ${inv.invoice_number} to ${inv.to_name || 'Client'}`, inv.id,
         (inv.sent_at ? new Date(inv.sent_at).toISOString() : new Date().toISOString()).slice(0, 7), amount],
      );
      if (je.rows[0]) {
        await client.query(
          `INSERT INTO finance_journal_lines (journal_entry_id, gl_account_id, debit_amount, credit_amount, description, sort_order)
           VALUES ($1, $2, $3, 0, $4, 0), ($1, $5, 0, $3, $4, 1)`,
          [je.rows[0].id, drAccountId, amount, `Invoice: ${inv.invoice_number}`, crAccountId],
        );
      }
    }

    await client.query('COMMIT');
    console.log('[seed] Finance v2 seed complete: categories, vendors, GL, policies, expenses, budget snapshots, invoice line items, finance_settings, audit log, dora decisions, tax rates, period close, journal entries.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[seed] Failed:', e);
    throw e;
  } finally {
    client.release();
  }
}

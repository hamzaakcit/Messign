import { Worker, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from '../connection.js';
import { query } from '../../db/index.js';
import { createInvoice } from '../../dal/invoices.js';
import type { CreateInvoiceInput } from '../../dal/invoices.js';
import { createBudget } from '../../dal/budgets.js';
import type { CreateBudgetInput } from '../../dal/budgets.js';
import * as marketingLeads from '../../dal/marketing/leads.js';
import { createExpense } from '../../dal/expenses.js';
import type { CreateExpenseInput } from '../../dal/expenses.js';
import { eventBus } from '../../events/index.js';
import * as doraInsights from '../../dal/doraInsights.js';

const connection = redisConnection as unknown as ConnectionOptions;

// Handles cross-module side effects:
// - deal.won → generate invoice
// - expense.approved → update budget burn
// - task.completed → award XP
// - invoice.paid → update vendor payment timeline

interface CrossModuleJob {
  type: string;
  payload: Record<string, unknown>;
  sourceEvent: string;
}

interface DealRow {
  id: string;
  organization_id: string;
  owner_id: string;
  company_id: string | null;
  title: string;
  amount: number;
  currency: string;
}

interface CompanyRow {
  id: string;
  name: string;
  address: string | null;
}

async function generateInvoiceFromDeal(payload: Record<string, unknown>): Promise<void> {
  const dealId = payload.dealId as string;
  if (!dealId) {
    console.warn('[CrossModule] generate_invoice_from_deal: missing dealId');
    return;
  }

  const dealResult = await query<DealRow>(
    `SELECT id, organization_id, owner_id, company_id, title, amount, currency
     FROM crm_deals WHERE id = $1`,
    [dealId],
  );
  const deal = dealResult.rows[0];
  if (!deal) {
    console.warn('[CrossModule] generate_invoice_from_deal: deal not found', dealId);
    return;
  }

  if (!deal.organization_id || !deal.owner_id) {
    console.warn('[CrossModule] generate_invoice_from_deal: deal missing organization_id or owner_id');
    return;
  }

  let toName = 'Deal customer';
  let toEmail: string | undefined;
  let toAddress: string | undefined;
  let clientId: string | null = null;

  if (deal.company_id) {
    const companyResult = await query<CompanyRow>(
      `SELECT id, name, address FROM crm_companies WHERE id = $1 AND organization_id = $2`,
      [deal.company_id, deal.organization_id],
    );
    const company = companyResult.rows[0];
    if (company) {
      toName = company.name;
      toAddress = company.address ?? undefined;
      clientId = company.id;
    }
  }

  const amount = Number(deal.amount) || 0;
  const currency = (deal.currency || 'USD').toString().toUpperCase().slice(0, 3);

  const ctx = {
    userId: deal.owner_id,
    organizationId: deal.organization_id,
    role: 'employee' as const,
  };

  const invoiceData: CreateInvoiceInput = {
    from_name: 'Messign',
    to_name: toName,
    to_email: toEmail,
    to_address: toAddress,
    client_id: clientId ?? undefined,
    currency,
    line_items: [
      { description: deal.title || 'Deal closed', quantity: 1, unit_price: amount },
    ],
    payment_terms: 'Net 30',
    notes: `Auto-generated from won deal ${dealId}`,
  };

  await createInvoice(ctx, invoiceData);
  console.log(`[CrossModule] Created draft invoice from deal ${dealId} for ${amount} ${currency}`);
}

async function getMarketingRoutingUserId(
  organizationId?: string,
  preferredUserId?: string,
): Promise<string | null> {
  if (preferredUserId) {
    return preferredUserId;
  }
  if (!organizationId) {
    return null;
  }
  const result = await query<{ id: string }>(
    `SELECT id::text
     FROM reimbursement_users
     WHERE organization_id = $1::uuid
     ORDER BY created_at ASC
     LIMIT 1`,
    [organizationId],
  );
  return result.rows[0]?.id ?? null;
}

async function createExpenseFromMarketingSpend(payload: Record<string, unknown>): Promise<void> {
  const campaignId = payload.campaignId as string | undefined;
  const amount = Number(payload.amount);
  const currency = (payload.currency as string) ?? 'EUR';
  const category = (payload.category as string) ?? 'Marketing';
  const description = (payload.description as string) ?? null;
  const date = payload.date as string | undefined;

  if (!campaignId || !date || !Number.isFinite(amount) || amount <= 0) {
    console.warn('[CrossModule] create_expense_from_marketing_spend: missing or invalid campaignId, date, or amount');
    return;
  }

  const campaignResult = await query<{ name: string; organization_id: string; owner_id: string | null }>(
    `SELECT name, organization_id::text AS organization_id, owner_id::text AS owner_id
     FROM marketing_campaigns
     WHERE id = $1::uuid
     LIMIT 1`,
    [campaignId],
  );
  const campaign = campaignResult.rows[0];
  if (!campaign?.organization_id) {
    console.warn('[CrossModule] create_expense_from_marketing_spend: campaign not found', campaignId);
    return;
  }

  const userId = await getMarketingRoutingUserId(campaign.organization_id, campaign.owner_id ?? undefined);
  if (!userId) {
    console.warn('[CrossModule] create_expense_from_marketing_spend: no user found for organization', campaign.organization_id);
    return;
  }

  const ctx = {
    userId,
    organizationId: campaign.organization_id,
    role: 'employee' as const,
  };

  const expenseData: CreateExpenseInput = {
    title: `Marketing: ${campaign.name}`,
    description: description ?? undefined,
    category_slug: category,
    amount,
    currency: currency.toUpperCase().slice(0, 3),
    expense_date: date,
  };

  const expense = await createExpense(ctx, expenseData);

  const spendResult = await query<{ id: string }>(
    `SELECT id::text FROM marketing_campaign_spend
     WHERE campaign_id = $1::uuid AND amount = $2 AND date = $3::date
     ORDER BY created_at DESC
     LIMIT 1`,
    [campaignId, amount, date],
  );
  const spendRow = spendResult.rows[0];
  if (spendRow?.id) {
    await query(
      `UPDATE marketing_campaign_spend SET finance_expense_id = $1::uuid WHERE id = $2::uuid`,
      [expense.id, spendRow.id],
    );
  }

  console.log(`[CrossModule] Created finance expense ${expense.id} from marketing spend for campaign ${campaignId}`);
}

async function createBudgetFromContract(payload: Record<string, unknown>): Promise<void> {
  const contractId = payload.contractId as string | undefined;
  const organizationId = payload.organizationId as string | undefined;
  const value = Number(payload.value ?? 0);
  if (!contractId || !organizationId || !Number.isFinite(value) || value <= 0) {
    console.warn('[CrossModule] create_budget_from_contract: missing contractId, organizationId, or valid value');
    return;
  }

  const contractResult = await query<{ title: string; currency: string; owner_id: string | null; start_date: string | null; end_date: string | null }>(
    `SELECT title, currency, owner_id::text AS owner_id, start_date::text, end_date::text
     FROM contracts
     WHERE id = $1::uuid
     LIMIT 1`,
    [contractId],
  );
  const contract = contractResult.rows[0];
  if (!contract) {
    console.warn('[CrossModule] create_budget_from_contract: contract not found', contractId);
    return;
  }

  const ownerId = contract.owner_id ?? await getMarketingRoutingUserId(organizationId, undefined);
  if (!ownerId) {
    console.warn('[CrossModule] create_budget_from_contract: no owner user found');
    return;
  }

  const start = contract.start_date ?? new Date().toISOString().slice(0, 10);
  const end = contract.end_date ?? new Date(new Date(start).getTime() + 90 * 86400000).toISOString().slice(0, 10);
  const budgetInput: CreateBudgetInput = {
    name: `Contract Budget: ${contract.title}`,
    description: `Auto-created from fully signed contract ${contractId}`,
    department: 'Operations',
    budget_code: `CTR-${contractId.slice(0, 8).toUpperCase()}`,
    owner_id: ownerId,
    allocated_amount: value,
    currency: (contract.currency || 'EUR').toUpperCase().slice(0, 3),
    period_start: start,
    period_end: end,
    period_type: 'quarterly',
    warning_threshold: 80,
    critical_threshold: 95,
  };

  await createBudget(
    {
      userId: ownerId,
      role: 'system_admin',
      organizationId,
    },
    budgetInput,
  );
  console.log(`[CrossModule] Created budget from contract ${contractId}`);
}

async function createEmployeeFromHire(payload: Record<string, unknown>): Promise<void> {
  const candidateId = payload.candidateId as string | undefined;
  const organizationId = payload.organizationId as string | undefined;
  const jobId = payload.jobId as string | undefined;
  const departmentId = payload.departmentId as string | undefined;
  if (!candidateId || !organizationId || !jobId) {
    console.warn('[CrossModule] create_employee_from_hire: missing candidateId, organizationId, or jobId');
    return;
  }

  const candidateResult = await query<{
    email: string;
    first_name: string;
    last_name: string | null;
    phone: string | null;
    location: string | null;
    current_title: string | null;
  }>(
    `SELECT email, first_name, last_name, phone, location, current_title
     FROM recruitment_candidates
     WHERE id = $1::uuid
     LIMIT 1`,
    [candidateId],
  );
  const jobResult = await query<{ title: string; hiring_manager_id: string | null }>(
    `SELECT title, hiring_manager_id::text AS hiring_manager_id
     FROM recruitment_jobs
     WHERE id = $1::uuid
     LIMIT 1`,
    [jobId],
  );
  const candidate = candidateResult.rows[0];
  const job = jobResult.rows[0];
  if (!candidate || !job) {
    console.warn('[CrossModule] create_employee_from_hire: candidate or job not found');
    return;
  }

  const fullName = `${candidate.first_name} ${candidate.last_name ?? ''}`.trim();
  const existingUser = await query<{ id: string; auth_user_id: string | null }>(
    `SELECT id::text, auth_user_id FROM reimbursement_users
     WHERE organization_id = $1::uuid AND email = $2
     LIMIT 1`,
    [organizationId, candidate.email],
  );
  let userId = existingUser.rows[0]?.id;
  let teamMemberEmployeeId = existingUser.rows[0]?.auth_user_id ?? existingUser.rows[0]?.id;
  if (!userId) {
    const authUserId = `user-${Date.now()}`;
    const insert = await query<{ id: string }>(
      `INSERT INTO reimbursement_users (
         organization_id, auth_user_id, email, full_name, role, manager_id, xp, level, status, job_title, phone, location
       )
       VALUES ($1,$2,$3,$4,'employee',$5,0,1,'offline',$6,$7,$8)
       RETURNING id::text`,
      [
        organizationId,
        authUserId,
        candidate.email,
        fullName,
        job.hiring_manager_id ?? null,
        job.title || candidate.current_title || 'Employee',
        candidate.phone ?? null,
        candidate.location ?? null,
      ],
    );
    userId = insert.rows[0]?.id;
    teamMemberEmployeeId = authUserId;
  }
  if (!userId) return;

  if (departmentId && teamMemberEmployeeId) {
    await query(
      `INSERT INTO performance_team_members (team_id, employee_id, role_in_team, start_date, is_active)
       VALUES ($1::uuid, $2, 'member', COALESCE($3::date, CURRENT_DATE), TRUE)
       ON CONFLICT (team_id, employee_id) DO NOTHING`,
      [departmentId, teamMemberEmployeeId, (payload.startDate as string | undefined) ?? null],
    );
  }

  eventBus.emit('hr.employee.onboarded', {
    userId,
    departmentId: departmentId ?? '',
    managerId: job.hiring_manager_id ?? undefined,
    role: 'employee',
    organizationId,
    name: fullName,
  });
}

const worker = new Worker<CrossModuleJob>(
  'cross-module',
  async (job: Job<CrossModuleJob>) => {
    const { type, payload, sourceEvent } = job.data;
    console.log(`[CrossModule] Processing ${type} from ${sourceEvent}`, payload);

    switch (type) {
      case 'update_budget_burn':
        // TODO: Call budgets DAL to recalculate burn rate
        console.log(`[CrossModule] Would update budget burn for expense ${payload.expenseId}`);
        break;
      case 'award_xp':
        // TODO: Call gamification service
        console.log(`[CrossModule] Would award ${payload.amount} XP to ${payload.userId}`);
        break;
      case 'update_vendor_timeline':
        // TODO: Call vendor DAL
        console.log(`[CrossModule] Would update vendor timeline for payment ${payload.paymentId}`);
        break;
      case 'generate_invoice_from_deal':
        await generateInvoiceFromDeal(payload);
        break;
      case 'generate_invoice_from_time':
        console.log(`[CrossModule] Would create invoice from timesheet for client ${payload.clientId}`);
        break;
      case 'update_okr_progress':
        console.log(`[CrossModule] Would recalculate OKR auto-progress from ${payload.source}`);
        break;
      case 'route_marketing_lead_to_crm': {
        const leadId = payload.leadId as string | undefined;
        const organizationId = payload.organizationId as string | undefined;
        const userId = await getMarketingRoutingUserId(organizationId, payload.userId as string | undefined);
        if (!leadId || !organizationId || !userId) {
          console.warn('[CrossModule] route_marketing_lead_to_crm: missing leadId, organizationId, or userId');
          break;
        }
        await marketingLeads.convertLeadToCRM(
          {
            userId,
            role: 'manager',
            organizationId,
          },
          leadId,
        );
        break;
      }
      case 'create_expense_from_marketing_spend':
        await createExpenseFromMarketingSpend(payload);
        break;
      case 'create_employee_from_hire':
        await createEmployeeFromHire(payload);
        console.log(`[CrossModule] Created or linked employee from hired candidate ${payload.candidateId}`);
        break;
      case 'allocate_new_hire_assets':
        await doraInsights.createInsight({
          organizationId: payload.organizationId as string | undefined,
          module: 'recruitment',
          severity: 'info',
          title: 'Equipment allocation needed',
          message: `New hire ${String(payload.employeeName ?? 'Employee')} starting ${String(payload.startDate ?? 'soon')}. Equipment allocation needed.`,
          sourceEvent: 'recruitment.candidate.hired',
          sourceEntityType: 'candidate',
          sourceEntityId: payload.candidateId as string | undefined,
          metadata: payload,
        });
        console.log(`[CrossModule] Would allocate assets for new hire in ${payload.departmentId}`);
        break;
      case 'create_budget_from_contract':
        await createBudgetFromContract(payload);
        break;
      default:
        console.log(`[CrossModule] Unknown job type: ${type}`);
    }
  },
  { connection, concurrency: 5 }
);

worker.on('error', (err) => console.warn('[CrossModule] Worker error (Redis?):', err.message));
worker.on('completed', (job) => console.log(`[CrossModule] Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`[CrossModule] Job ${job?.id} failed:`, err.message));

export default worker;

/**
 * Cross-module finance hook for marketing budget allocations.
 * When called with a `PoolClient` (same transaction as `marketing_budget_allocations`),
 * inserts into `finance_marketing_journal_stub` so rollback keeps marketing + finance in sync.
 */
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
export interface CreateMarketingJournalInput {
  workspaceId: string;
  amount: number;
  currency: string;
  /** true: Debit Marketing Expense, Credit Cash. false: Debit Marketing Expense, Credit Accounts Payable */
  isPrepaid: boolean;
  description: string;
  campaignId: string;
  channel?: string;
}

/**
 * OS hook: persist a balanced journal line in the finance ledger stub.
 * @param client - When provided, INSERT runs in the caller's transaction (required for atomicity with budget allocation).
 */
export async function createFinanceJournalEntry(
  input: CreateMarketingJournalInput,
  client?: PoolClient,
): Promise<{ journalEntryId: string }> {
  const debit = 'Marketing Expense';
  const credit = input.isPrepaid ? 'Cash' : 'Accounts Payable';
  const id = randomUUID();
  const currency = input.currency.toUpperCase().slice(0, 3);

  if (process.env.FINANCE_JOURNAL_THROW === '1') {
    throw new Error('Simulated finance journal failure (FINANCE_JOURNAL_THROW=1)');
  }

  if (client) {
    await client.query(
      `INSERT INTO finance_marketing_journal_stub (
         id, workspace_id, amount, currency, debit_account, credit_account, description, campaign_id, channel
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        input.workspaceId,
        input.amount,
        currency,
        debit,
        credit,
        input.description.slice(0, 2000),
        input.campaignId,
        input.channel ?? null,
      ],
    );
    return { journalEntryId: id };
  }

  // Non-transactional callers: log only (no row — avoids desync with marketing writes)
  console.log('[finance:marketing_journal]', {
    journalEntryId: id,
    workspaceId: input.workspaceId,
    campaignId: input.campaignId,
    channel: input.channel ?? null,
    amount: input.amount,
    currency,
    isPrepaid: input.isPrepaid,
    debit,
    credit,
    description: input.description.slice(0, 500),
  });
  return { journalEntryId: id };
}

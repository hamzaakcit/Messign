import { Worker, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from '../connection.js';
import {
  onBudgetThresholdBreached,
  onExpenseCreated,
  onInvoiceOverdue,
} from './insightGenerators/financeInsights.js';
import {
  onPatternDetected,
  onSLABreached,
  onTicketCreated,
  onTicketVolumeSpike,
} from './insightGenerators/supportInsights.js';
import { onDealStale, onDealWon } from './insightGenerators/crmInsights.js';
import { analyzeSentiment } from '../../services/dora/heart/sentimentAnalyzer.js';

const connection = redisConnection as unknown as ConnectionOptions;

interface DoraInsightJob {
  type:
    | 'analyze_sentiment'
    | 'expense_created'
    | 'invoice_overdue'
    | 'budget_threshold_breached'
    | 'support_sla_breached'
    | 'support_pattern_detected'
    | 'support_volume_spike'
    | 'support_ticket_created'
    | 'crm_deal_won'
    | 'crm_deal_stale';
  payload: Record<string, unknown>;
}

const worker = new Worker<DoraInsightJob>(
  'dora-insights',
  async (job: Job<DoraInsightJob>) => {
    const { type, payload } = job.data;
    console.log(`[DoraInsights] Processing ${type}`, payload);

    switch (type) {
      case 'analyze_sentiment': {
        const { userId, text, source } = payload as { userId: string; text: string; source: 'chat' | 'checkin' | 'ticket_response' | 'review' };
        await analyzeSentiment({ userId, text, source });
        break;
      }

      case 'expense_created':
        await onExpenseCreated(payload as {
          expenseId: string;
          userId: string;
          amount: number;
          category: string;
          departmentId?: string;
        });
        break;

      case 'invoice_overdue':
        await onInvoiceOverdue(payload as {
          invoiceId: string;
          vendorId: string;
          daysOverdue: number;
          amount: number;
        });
        break;

      case 'budget_threshold_breached':
        await onBudgetThresholdBreached(payload as {
          budgetId: string;
          departmentId: string;
          currentPercent: number;
          threshold: number;
        });
        break;

      case 'support_sla_breached':
        await onSLABreached(payload as {
          ticketId: string;
          slaType: string;
          assigneeId?: string;
        });
        break;

      case 'support_pattern_detected':
        await onPatternDetected(payload as {
          pattern: string;
          ticketIds: string[];
          frequency: number;
          suggestedAction: string;
          organizationId?: string;
        });
        break;

      case 'support_volume_spike':
        await onTicketVolumeSpike(payload as {
          currentCount: number;
          averageCount: number;
          percentAboveAverage: number;
          organizationId?: string;
        });
        break;

      case 'support_ticket_created':
        await onTicketCreated(payload as {
          ticketId: string;
          subject: string;
          reporterEmail: string;
          category?: string;
          assigneeId?: string;
        });
        break;

      case 'crm_deal_won':
        await onDealWon(payload as {
          dealId: string;
          amount: number;
          ownerId: string;
        });
        break;

      case 'crm_deal_stale':
        await onDealStale(payload as {
          dealId: string;
          title: string;
          daysSinceActivity: number;
          ownerId: string;
        });
        break;

      default:
        console.log(`[DoraInsights] Unknown job type: ${type}`);
    }
  },
  { connection, concurrency: 3 }
);

worker.on('error', (err) => console.warn('[DoraInsights] Worker error (Redis?):', err.message));
worker.on('completed', (job) => console.log(`[DoraInsights] Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`[DoraInsights] Job ${job?.id} failed:`, err.message));

export default worker;

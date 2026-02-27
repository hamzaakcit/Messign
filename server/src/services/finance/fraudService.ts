import { query } from '../../db/index.js';
import { auditService } from './auditService.js';

interface FraudSignal {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  description: string;
}

interface FraudResult {
  risk_score: number;
  signals: FraudSignal[];
  recommendation: 'approve' | 'review' | 'flag' | 'block';
}

export const fraudService = {
  async analyzeExpense(
    expenseId: string,
    orgId: string,
    submitterId: string,
    amount: number,
    categorySlug: string | null,
    description: string | null,
  ): Promise<FraudResult> {
    const signals: FraudSignal[] = [];

    const [duplicateCheck, velocityCheck, amountHistory] = await Promise.all([
      query(
        `SELECT id, title, original_amount FROM reimbursement_requests
         WHERE organization_id = $1 AND submitted_by = $2
           AND original_amount = $3 AND id != $4
           AND submitted_at > NOW() - INTERVAL '7 days'`,
        [orgId, submitterId, amount, expenseId],
      ),
      query(
        `SELECT COUNT(*) as cnt, SUM(original_amount) as total
         FROM reimbursement_requests
         WHERE organization_id = $1 AND submitted_by = $2
           AND submitted_at > NOW() - INTERVAL '24 hours'`,
        [orgId, submitterId],
      ),
      query(
        `SELECT AVG(original_amount) as avg_amount, STDDEV(original_amount) as stddev_amount
         FROM reimbursement_requests
         WHERE organization_id = $1 AND submitted_by = $2
           AND category_slug = $3 AND submitted_at > NOW() - INTERVAL '90 days'`,
        [orgId, submitterId, categorySlug],
      ),
    ]);

    if (duplicateCheck.rows.length > 0) {
      signals.push({
        type: 'duplicate_amount',
        severity: 'high',
        score: 0.7,
        description: `Same amount ($${amount}) submitted ${duplicateCheck.rows.length} time(s) in last 7 days`,
      });
    }

    const dailyCount = parseInt(velocityCheck.rows[0]?.cnt ?? '0');
    const dailyTotal = parseFloat(velocityCheck.rows[0]?.total ?? '0');
    if (dailyCount > 5) {
      signals.push({
        type: 'velocity_count',
        severity: 'medium',
        score: 0.4,
        description: `${dailyCount} expenses submitted in last 24 hours (threshold: 5)`,
      });
    }
    if (dailyTotal > 5000) {
      signals.push({
        type: 'velocity_amount',
        severity: 'high',
        score: 0.6,
        description: `$${dailyTotal.toFixed(2)} total submitted in 24 hours (threshold: $5,000)`,
      });
    }

    const avgAmt = parseFloat(amountHistory.rows[0]?.avg_amount ?? '0');
    const stddev = parseFloat(amountHistory.rows[0]?.stddev_amount ?? '0');
    if (avgAmt > 0 && stddev > 0 && amount > avgAmt + 3 * stddev) {
      signals.push({
        type: 'statistical_anomaly',
        severity: 'high',
        score: 0.65,
        description: `Amount $${amount} is ${((amount - avgAmt) / stddev).toFixed(1)} standard deviations above mean ($${avgAmt.toFixed(2)})`,
      });
    }

    if (amount > 0 && amount === Math.round(amount) && amount >= 100) {
      signals.push({
        type: 'round_number',
        severity: 'low',
        score: 0.1,
        description: 'Exact round number amount',
      });
    }

    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    if (hour >= 22 || hour <= 5 || day === 0 || day === 6) {
      signals.push({
        type: 'off_hours',
        severity: 'low',
        score: 0.15,
        description: 'Submitted during off-hours or weekend',
      });
    }

    const riskScore = Math.min(
      1,
      signals.reduce((sum, s) => sum + s.score * (s.severity === 'critical' ? 1.5 : 1), 0),
    );

    let recommendation: FraudResult['recommendation'] = 'approve';
    if (riskScore > 0.8) recommendation = 'block';
    else if (riskScore > 0.5) recommendation = 'flag';
    else if (riskScore > 0.25) recommendation = 'review';

    if (signals.length > 0) {
      await auditService.log({
        organization_id: orgId,
        event_type: 'fraud.analysis',
        event_category: 'ai',
        actor_type: 'ai',
        actor_id: 'fraud-engine',
        entity_type: 'expense',
        entity_id: expenseId,
        changes: { risk_score: riskScore, signals: signals.length, recommendation },
        severity: riskScore > 0.5 ? 'warning' : 'info',
        is_flagged: riskScore > 0.5,
      });
    }

    return { risk_score: riskScore, signals, recommendation };
  },
};

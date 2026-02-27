import { query, getClient } from '../../db/index.js';
import { policyService } from './policyService.js';
import { fraudService } from './fraudService.js';
import { auditService } from './auditService.js';
import { notificationService } from './notificationService.js';
import { emitToUser } from '../../sockets/index.js';

interface PipelineResult {
  status: string;
  risk_score: number;
  confidence: number;
  decision: 'auto_approve' | 'manager_review' | 'flag';
  policy_result: { passed: boolean; violations: unknown[]; warnings: string[] };
  fraud_result: { risk_score: number; signals: unknown[]; recommendation: string };
  budget_impact: { budget_id: string | null; remaining_before: number; remaining_after: number; over_budget: boolean } | null;
}

export async function runAIReviewPipeline(
  expenseId: string,
  orgId: string,
  submitterId: string,
): Promise<PipelineResult> {
  const startTime = Date.now();

  const expRes = await query(
    `SELECT * FROM reimbursement_requests WHERE id = $1 AND organization_id = $2`,
    [expenseId, orgId],
  );
  const expense = expRes.rows[0];
  if (!expense) throw new Error('Expense not found');

  // Step 1: Set status to ai_reviewing
  await query(
    `UPDATE reimbursement_requests SET status = 'ai_reviewing', updated_at = NOW() WHERE id = $1`,
    [expenseId],
  );
  emitToUser(submitterId, 'finance:expense:status_changed', {
    expenseId, status: 'ai_reviewing', step: 'starting',
  });

  // Step 2: Policy check
  const policyResult = await policyService.checkExpense({
    amount: parseFloat(expense.original_amount),
    category_slug: expense.category_slug,
    expense_date: expense.expense_date,
    vendor_id: expense.vendor_id,
    submitted_by: submitterId,
  }, orgId);

  emitToUser(submitterId, 'finance:expense:ai_step', {
    expenseId, step: 'policy_check', result: { passed: policyResult.passed, violations: policyResult.violations.length },
  });

  // Step 3: Fraud/duplicate check
  const fraudResult = await fraudService.analyzeExpense(
    expenseId, orgId, submitterId,
    parseFloat(expense.original_amount),
    expense.category_slug,
    expense.description,
  );

  emitToUser(submitterId, 'finance:expense:ai_step', {
    expenseId, step: 'fraud_check', result: { risk_score: fraudResult.risk_score, signals: fraudResult.signals.length },
  });

  // Step 4: Compute combined risk score
  const policyRisk = policyResult.risk_score;
  const fraudRisk = fraudResult.risk_score;
  const amountRisk = parseFloat(expense.original_amount) > 5000 ? 0.3 : parseFloat(expense.original_amount) > 1000 ? 0.1 : 0;
  const riskScore = Math.min(1, policyRisk * 0.4 + fraudRisk * 0.4 + amountRisk * 0.2);
  const confidence = Math.max(0, 1 - riskScore * 0.8);

  // Step 5: Budget impact
  let budgetImpact: PipelineResult['budget_impact'] = null;
  if (expense.budget_id) {
    const budgetRes = await query(
      'SELECT allocated_amount, spent_amount FROM budgets WHERE id = $1',
      [expense.budget_id],
    );
    if (budgetRes.rows[0]) {
      const allocated = parseFloat(budgetRes.rows[0].allocated_amount);
      const spent = parseFloat(budgetRes.rows[0].spent_amount);
      const amt = parseFloat(expense.original_amount);
      budgetImpact = {
        budget_id: expense.budget_id,
        remaining_before: allocated - spent,
        remaining_after: allocated - spent - amt,
        over_budget: allocated - spent - amt < 0,
      };
    }
  }

  emitToUser(submitterId, 'finance:expense:ai_step', {
    expenseId, step: 'risk_scoring', result: { risk_score: riskScore, confidence, budget_impact: budgetImpact },
  });

  // Step 6: Load approval policy thresholds
  const settingsRes = await query(
    `SELECT dora_auto_approve_max, dora_min_confidence, dora_max_risk, dora_auto_approve_enabled
     FROM finance_settings WHERE organization_id = $1`,
    [orgId],
  );
  const settings = settingsRes.rows[0] || {
    dora_auto_approve_max: 100, dora_min_confidence: 0.95, dora_max_risk: 0.20, dora_auto_approve_enabled: true,
  };

  const maxAutoApprove = parseFloat(settings.dora_auto_approve_max);
  const minConfidence = parseFloat(settings.dora_min_confidence);
  const maxRisk = parseFloat(settings.dora_max_risk);
  const autoApproveEnabled = settings.dora_auto_approve_enabled;
  const amount = parseFloat(expense.original_amount);

  // Step 7: Decision
  let decision: PipelineResult['decision'];
  let newStatus: string;

  const hasCriticalViolation = policyResult.violations.some(
    (v) => v.violation_action === 'block',
  );

  if (
    autoApproveEnabled &&
    !hasCriticalViolation &&
    policyResult.passed &&
    riskScore <= maxRisk &&
    confidence >= minConfidence &&
    amount <= maxAutoApprove
  ) {
    decision = 'auto_approve';
    newStatus = 'ai_approved';
  } else if (riskScore > 0.5 || hasCriticalViolation) {
    decision = 'flag';
    newStatus = 'ai_flagged';
  } else {
    decision = 'manager_review';
    newStatus = 'manager_review';
  }

  // Step 8: Apply decision
  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE reimbursement_requests SET
         status = $1,
         ai_confidence_score = $2,
         ai_risk_score = $3,
         ai_auto_approved = $4,
         ai_policy_result = $5,
         ai_duplicate_refs = $6,
         ai_risk_flags = $7,
         ai_review_notes = $8,
         approved_at = CASE WHEN $1 = 'ai_approved' THEN NOW() ELSE approved_at END,
         updated_at = NOW()
       WHERE id = $9`,
      [
        newStatus,
        confidence,
        riskScore,
        decision === 'auto_approve',
        JSON.stringify({ passed: policyResult.passed, violations: policyResult.violations, warnings: policyResult.warnings }),
        JSON.stringify(fraudResult.signals.filter((s) => s.type === 'duplicate_amount').map((s) => s.description)),
        JSON.stringify(fraudResult.signals),
        `AI Review: risk=${riskScore.toFixed(2)}, confidence=${confidence.toFixed(2)}, decision=${decision}. Policy: ${policyResult.passed ? 'PASS' : 'FAIL'} (${policyResult.violations.length} violations). Fraud: ${fraudResult.recommendation} (${fraudResult.signals.length} signals).`,
        expenseId,
      ],
    );

    // Create approval step for non-auto-approved
    if (decision === 'manager_review') {
      const userRow = await client.query('SELECT manager_id FROM reimbursement_users WHERE id = $1', [submitterId]);
      const managerId = userRow.rows[0]?.manager_id;
      if (managerId) {
        await client.query(
          `INSERT INTO approval_steps
           (reimbursement_id, step_order, step_type, assigned_to, status, entity_type, entity_id, step_name,
            ai_recommendation, ai_confidence)
           VALUES ($1, 1, 'manager_approval', $2, 'pending', 'expense', $1, 'Manager Approval',
                   'approve', $3)
           ON CONFLICT DO NOTHING`,
          [expenseId, managerId, confidence],
        );
        await client.query(
          'UPDATE reimbursement_requests SET current_approver_id = $1 WHERE id = $2',
          [managerId, expenseId],
        );
      }
    } else if (decision === 'flag') {
      const financeUser = await client.query(
        `SELECT id FROM reimbursement_users WHERE organization_id = $1 AND role IN ('finance','admin') LIMIT 1`,
        [orgId],
      );
      const assignee = financeUser.rows[0]?.id;
      if (assignee) {
        await client.query(
          `INSERT INTO approval_steps
           (reimbursement_id, step_order, step_type, assigned_to, status, entity_type, entity_id, step_name,
            ai_recommendation, ai_confidence)
           VALUES ($1, 1, 'finance_review', $2, 'pending', 'expense', $1, 'Finance Review (AI Flagged)',
                   'review', $3)
           ON CONFLICT DO NOTHING`,
          [expenseId, assignee, confidence],
        );
      }
    }

    // Budget impact: if auto-approved, update budget spent
    if (decision === 'auto_approve' && expense.budget_id) {
      await client.query(
        'UPDATE budgets SET spent_amount = spent_amount + $1 WHERE id = $2',
        [amount, expense.budget_id],
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // Step 9: Log to dora decisions
  await query(
    `INSERT INTO finance_dora_decisions
     (organization_id, decision_type, entity_type, entity_id, action_taken,
      confidence_score, reasoning, processing_time_ms, model_used)
     VALUES ($1, 'expense_review', 'expense', $2, $3, $4, $5, $6, 'ai_pipeline')`,
    [
      orgId, expenseId, decision, confidence,
      `Risk: ${riskScore.toFixed(2)}. Policy: ${policyResult.passed ? 'PASS' : `FAIL (${policyResult.violations.length} violations)`}. Fraud: ${fraudResult.recommendation}. Decision: ${decision}.`,
      Date.now() - startTime,
    ],
  );

  // Step 10: Audit log
  await auditService.log({
    organization_id: orgId,
    event_type: 'expense.ai_reviewed',
    event_category: 'expense',
    actor_type: 'ai',
    actor_id: 'dora-ai',
    entity_type: 'expense',
    entity_id: expenseId,
    changes: { decision, risk_score: riskScore, confidence, status: newStatus },
  });

  // Step 11: Notifications
  if (decision === 'auto_approve') {
    await notificationService.create({
      organization_id: orgId,
      recipient_id: submitterId,
      type: 'expense.ai_approved',
      title: 'Expense Auto-Approved',
      message: `"${expense.title}" ($${amount}) was auto-approved by Dora AI.`,
      entity_type: 'expense',
      entity_id: expenseId,
      action_url: `/finance/expenses/${expenseId}`,
    });
  } else if (decision === 'flag') {
    await notificationService.create({
      organization_id: orgId,
      recipient_id: submitterId,
      type: 'expense.ai_flagged',
      title: 'Expense Flagged for Review',
      message: `"${expense.title}" was flagged by Dora AI for additional review.`,
      entity_type: 'expense',
      entity_id: expenseId,
      action_url: `/finance/expenses/${expenseId}`,
      priority: 'high',
    });
  }

  emitToUser(submitterId, 'finance:expense:status_changed', {
    expenseId, status: newStatus, decision, risk_score: riskScore, confidence,
  });

  return {
    status: newStatus,
    risk_score: riskScore,
    confidence,
    decision,
    policy_result: { passed: policyResult.passed, violations: policyResult.violations, warnings: policyResult.warnings },
    fraud_result: { risk_score: fraudResult.risk_score, signals: fraudResult.signals, recommendation: fraudResult.recommendation },
    budget_impact: budgetImpact,
  };
}

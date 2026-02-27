import { query } from '../../db/index.js';

export interface PolicyCheckResult {
  passed: boolean;
  violations: Array<{
    policy_name: string;
    rule: string;
    violation_action: string;
    message: string;
  }>;
  warnings: string[];
  auto_approve_eligible: boolean;
  risk_score: number;
}

export const policyService = {
  async checkExpense(
    expenseData: {
      amount: number;
      category_slug?: string;
      expense_date?: string;
      vendor_id?: string;
      submitted_by?: string;
    },
    orgId: string,
  ): Promise<PolicyCheckResult> {
    const violations: PolicyCheckResult['violations'] = [];
    const warnings: string[] = [];
    let riskScore = 0;

    const policies = await query(
      `SELECT * FROM finance_expense_policies
       WHERE organization_id = $1 AND is_active = TRUE
       ORDER BY priority DESC`,
      [orgId],
    );

    for (const policy of policies.rows) {
      const rules = typeof policy.rules === 'string' ? JSON.parse(policy.rules) : policy.rules;

      if (typeof rules === 'object' && !Array.isArray(rules)) {
        const categoryRules = rules[expenseData.category_slug ?? ''];
        if (categoryRules) {
          if (categoryRules.max_amount && expenseData.amount > categoryRules.max_amount) {
            violations.push({
              policy_name: policy.name,
              rule: `max_amount: ${categoryRules.max_amount}`,
              violation_action: policy.violation_action,
              message: `Amount $${expenseData.amount} exceeds category limit of $${categoryRules.max_amount}`,
            });
            riskScore += 0.3;
          }
          if (categoryRules.max_per_night && expenseData.amount > categoryRules.max_per_night) {
            violations.push({
              policy_name: policy.name,
              rule: `max_per_night: ${categoryRules.max_per_night}`,
              violation_action: policy.violation_action,
              message: `Amount $${expenseData.amount} exceeds per-night limit of $${categoryRules.max_per_night}`,
            });
            riskScore += 0.2;
          }
          if (categoryRules.requires_receipt_above && expenseData.amount > categoryRules.requires_receipt_above) {
            warnings.push(`Receipt required for ${expenseData.category_slug} expenses above $${categoryRules.requires_receipt_above}`);
          }
        }
      }
    }

    if (expenseData.expense_date) {
      const day = new Date(expenseData.expense_date).getDay();
      if ((day === 0 || day === 6) && expenseData.amount > 200) {
        warnings.push('Weekend expense over $200 — consider adding justification');
        riskScore += 0.1;
      }

      const daysOld = (Date.now() - new Date(expenseData.expense_date).getTime()) / 86400000;
      if (daysOld > 60) {
        warnings.push('Expense is over 60 days old');
        riskScore += 0.15;
      }
    }

    const blocked = violations.some((v) => v.violation_action === 'block' || v.violation_action === 'auto_reject');
    const autoApproveEligible = await this.getAutoApproveEligibility(expenseData.amount, riskScore, orgId);

    return {
      passed: !blocked,
      violations,
      warnings,
      auto_approve_eligible: autoApproveEligible && violations.length === 0,
      risk_score: Math.min(riskScore, 1.0),
    };
  },

  async getAutoApproveEligibility(amount: number, riskScore: number, orgId: string): Promise<boolean> {
    const policy = await query(
      `SELECT * FROM finance_approval_policies
       WHERE organization_id = $1 AND is_active = TRUE AND ai_auto_approve_enabled = TRUE
       ORDER BY priority DESC LIMIT 1`,
      [orgId],
    );
    if (!policy.rows[0]) return false;

    const p = policy.rows[0];
    const maxAmount = parseFloat(p.ai_auto_approve_max ?? '100');
    const maxRisk = parseFloat(p.ai_max_risk ?? '0.2');

    return amount <= maxAmount && riskScore <= maxRisk;
  },

  async evaluateRules(
    rules: Array<{ condition: string; action: string; ai_confidence_min?: number }>,
    context: { amount: number; confidence?: number },
  ): Promise<string> {
    for (const rule of rules) {
      let conditionMet = false;
      const expr = rule.condition.trim();

      if (expr.includes('amount')) {
        const numericMatch = expr.match(/amount\s*([<>=!]+)\s*(\d+)/);
        if (numericMatch) {
          const op = numericMatch[1];
          const val = parseFloat(numericMatch[2]);
          if (op === '<' && context.amount < val) conditionMet = true;
          else if (op === '<=' && context.amount <= val) conditionMet = true;
          else if (op === '>' && context.amount > val) conditionMet = true;
          else if (op === '>=' && context.amount >= val) conditionMet = true;
          else if (op === '==' && context.amount === val) conditionMet = true;
        }
      }

      if (conditionMet) {
        if (rule.action === 'auto_approve' && rule.ai_confidence_min) {
          if ((context.confidence ?? 0) >= rule.ai_confidence_min) {
            return 'auto_approve';
          }
          return 'manager_approval';
        }
        return rule.action;
      }
    }

    return 'manager_approval';
  },
};

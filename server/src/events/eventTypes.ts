export interface EventMap {
  // ── Finance ──
  'finance.expense.created': { expenseId: string; userId: string; amount: number; currency: string; category: string; departmentId?: string };
  'finance.expense.submitted': { expenseId: string; userId: string; amount: number };
  'finance.expense.approved': { expenseId: string; approverId: string; amount: number };
  'finance.expense.rejected': { expenseId: string; approverId: string; reason: string };
  'finance.invoice.created': { invoiceId: string; vendorId: string; amount: number; currency: string };
  'finance.invoice.sent': { invoiceId: string; vendorId: string };
  'finance.invoice.paid': { invoiceId: string; amount: number; paidAt: string };
  'finance.invoice.overdue': { invoiceId: string; vendorId: string; daysOverdue: number; amount: number };
  'finance.budget.threshold_breached': { budgetId: string; departmentId: string; currentPercent: number; threshold: number };
  'finance.payment.completed': { paymentId: string; amount: number; vendorId: string };
  'finance.journal_entry.created': { entryId: string; type: string; amount: number };

  // ── Projects ──
  'project.task.created': { taskId: string; projectId: string; assigneeId?: string; title: string };
  'project.task.completed': { taskId: string; projectId: string; completedBy: string; xpAwarded?: number };
  'project.task.assigned': { taskId: string; assigneeId: string; assignedBy: string };
  'project.sprint.started': { sprintId: string; projectId: string; taskCount: number };
  'project.sprint.completed': { sprintId: string; projectId: string; completedTasks: number; totalTasks: number };
  'project.status_changed': { projectId: string; oldStatus: string; newStatus: string };

  // ── Chat / Communication ──
  'chat.message.sent': { messageId: string; channelId: string; userId: string; hasAttachment: boolean };
  'chat.mention.created': { messageId: string; mentionedUserId: string; channelId: string };
  'chat.thread.resolved': { threadId: string; channelId: string; resolvedBy: string };

  // ── Knowledge ──
  'knowledge.document.published': { documentId: string; authorId: string; title: string; categoryId?: string };
  'knowledge.document.updated': { documentId: string; updatedBy: string };
  'knowledge.document.flagged': { documentId: string; flaggedBy: string; reason: string };
  'knowledge.search.executed': { query: string; userId: string; resultCount: number };

  // ── HR / People ──
  'hr.employee.onboarded': { userId: string; departmentId: string; managerId?: string; role: string };
  'hr.employee.offboarded': { userId: string; departmentId: string };
  'hr.performance_review.completed': { userId: string; reviewerId: string; score: number };
  'hr.team.changed': { userId: string; oldTeamId?: string; newTeamId: string };

  // ── Gamification ──
  'gamification.xp.awarded': { userId: string; amount: number; reason: string; source: string };
  'gamification.badge.earned': { userId: string; badgeId: string; badgeName: string };
  'gamification.level.up': { userId: string; newLevel: number };

  // ── Reimbursements ──
  'reimbursement.submitted': { requestId: string; userId: string; amount: number; currency: string };
  'reimbursement.approved': { requestId: string; approverId: string; amount: number };
  'reimbursement.rejected': { requestId: string; approverId: string; reason: string };

  // ── Sales CRM ──
  'crm.contact.created': { contactId: string; ownerId: string; email?: string; companyId?: string };
  'crm.contact.updated': { contactId: string; updatedBy: string };
  'crm.company.created': { companyId: string; name: string; createdBy: string };
  'crm.deal.created': { dealId: string; title: string; amount: number; currency: string; ownerId: string; companyId?: string; stageId: string };
  'crm.deal.stage_changed': { dealId: string; oldStage: string; newStage: string; amount: number; movedBy: string };
  'crm.deal.won': { dealId: string; amount: number; currency: string; companyId?: string; ownerId: string; closedAt: string };
  'crm.deal.lost': { dealId: string; amount: number; reason?: string; ownerId: string };
  'crm.deal.updated': { dealId: string; updatedBy: string; changes: string[] };
  'crm.activity.logged': { activityId: string; dealId?: string; contactId?: string; userId: string; type: 'call' | 'email' | 'meeting' | 'note' };
  'crm.forecast.updated': { pipelineId: string; totalValue: number; weightedValue: number; period: string };

  // ── OKRs ──
  'okr.goal.created': { goalId: string; title: string; ownerId: string; level: string };
  'okr.goal.updated': { goalId: string; progress: number; status: string };
  'okr.key_result.created': { keyResultId: string; goalId: string; title: string };
  'okr.key_result.updated': { keyResultId: string; goalId: string; progress: number };
  'okr.check_in.submitted': { checkInId: string; keyResultId: string; value: number; userId: string };

  // ── System ──
  'system.audit.logged': { action: string; actorId: string; entityType: string; entityId: string };
  'system.notification.created': { userId: string; type: string; title: string; link?: string };

  // ── Dora AI ──
  'dora.insight.generated': { insightId: string; module: string; severity: 'info' | 'warning' | 'critical'; message: string };
  'dora.action.executed': { actionId: string; policyId?: string; actionType: string; result: 'success' | 'failure' };
  'dora.query.completed': { queryId: string; userId: string; toolsUsed: string[]; responseTimeMs: number };
}

export type EventName = keyof EventMap;
export type EventPayload<T extends EventName> = EventMap[T];

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
  'project.task.effort_updated': { taskId: string; projectId: string; actualHours: number };
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

  // ── Marketing ──
  'marketing.campaign.created': { campaignId: string; name: string; channel: string; budget: number; currency: string; createdBy: string };
  'marketing.campaign.launched': { campaignId: string; name: string; channel: string; startDate: string };
  'marketing.campaign.completed': { campaignId: string; name: string; leads: number; spend: number; roi: number };
  'marketing.campaign.paused': { campaignId: string; pausedBy: string; reason?: string };
  'marketing.campaign.budget_exceeded': { campaignId: string; name: string; budget: number; actualSpend: number; percentOver: number };
  'marketing.lead.captured': { leadId: string; email: string; source: string; campaignId?: string; score?: number };
  'marketing.lead.scored': { leadId: string; oldScore: number; newScore: number; isHot: boolean };
  'marketing.lead.qualified': { leadId: string; qualifiedBy: string; crmDealId?: string };
  'marketing.lead.routed_to_crm': { leadId: string; crmContactId: string; crmDealId: string; pipelineId: string };
  'marketing.content.published': { contentId: string; title: string; type: string; channel: string; publishedBy: string };
  'marketing.content.scheduled': { contentId: string; title: string; scheduledFor: string };
  'marketing.email.sent': { emailCampaignId: string; recipientCount: number; subject: string };
  'marketing.email.metrics_updated': { emailCampaignId: string; opens: number; clicks: number; bounces: number; unsubscribes: number };
  'marketing.spend.recorded': { campaignId: string; amount: number; currency: string; category: string; date: string };

  // ── Recruitment ──
  'recruitment.job.posted': { jobId: string; title: string; departmentId: string; postedBy: string };
  'recruitment.job.closed': { jobId: string; title: string; reason: string; hiredCount: number };
  'recruitment.application.received': { applicationId: string; jobId: string; candidateId: string; source: string };
  'recruitment.candidate.stage_changed': { applicationId: string; candidateId: string; jobId: string; oldStage: string; newStage: string; movedBy: string };
  'recruitment.candidate.screened': { applicationId: string; candidateId: string; matchScore: number; screenedBy: string; method: 'ai' | 'manual' };
  'recruitment.candidate.rejected': { applicationId: string; candidateId: string; jobId: string; reason: string; stage: string };
  'recruitment.interview.scheduled': { interviewId: string; applicationId: string; candidateId: string; interviewerId: string; scheduledAt: string };
  'recruitment.interview.completed': { interviewId: string; applicationId: string; candidateId: string; rating: number; recommendation: string };
  'recruitment.offer.sent': { offerId: string; applicationId: string; candidateId: string; salary: number; currency: string };
  'recruitment.offer.accepted': { offerId: string; applicationId: string; candidateId: string; startDate: string };
  'recruitment.offer.rejected': { offerId: string; applicationId: string; candidateId: string; reason?: string };
  'recruitment.candidate.hired': { applicationId: string; candidateId: string; jobId: string; departmentId: string; startDate: string; salary: number };

  // ── Assets ──
  'asset.created': { assetId: string; name: string; type: string; purchaseCost: number; currency: string };
  'asset.assigned': { assetId: string; assigneeId: string; assignedBy: string; assetName: string };
  'asset.returned': { assetId: string; returnedBy: string; previousAssigneeId: string; condition: string };
  'asset.maintenance_scheduled': { assetId: string; maintenanceType: string; scheduledDate: string };
  'asset.retired': { assetId: string; reason: string; retiredBy: string; originalCost: number };
  'asset.warranty_expiring': { assetId: string; assetName: string; warrantyEnd: string; daysRemaining: number };
  'asset.license.expiring': { licenseId: string; softwareName: string; expiresAt: string; daysRemaining: number; seatsUsed: number; seatsPurchased: number };
  'asset.license.underutilized': { licenseId: string; softwareName: string; utilizationPercent: number; seatsUsed: number; seatsPurchased: number; monthlyCost: number };

  // ── Contracts ──
  'contract.created': { contractId: string; title: string; type: string; counterparty: string; value: number; currency: string };
  'contract.signed': { contractId: string; signedBy: string; signedAt: string; allPartiesSigned: boolean };
  'contract.activated': { contractId: string; startDate: string; endDate: string };
  'contract.expiring': { contractId: string; title: string; counterparty: string; expiresAt: string; daysRemaining: number; autoRenew: boolean };
  'contract.expired': { contractId: string; title: string; wasAutoRenewed: boolean };
  'contract.renewed': { contractId: string; newContractId: string; newEndDate: string; valueChange: number };
  'contract.terminated': { contractId: string; terminatedBy: string; reason: string; effectiveDate: string };
  'contract.compliance_due': { contractId: string; obligationId: string; description: string; dueDate: string; daysRemaining: number };

  // ── Customer Support ──
  'support.ticket.created': { ticketId: string; subject: string; reporterEmail: string; priority: 'critical' | 'high' | 'medium' | 'low'; category?: string; crmCompanyId?: string; crmContactId?: string; assigneeId?: string };
  'support.ticket.assigned': { ticketId: string; assigneeId: string; assignedBy: string; previousAssigneeId?: string };
  'support.ticket.status_changed': { ticketId: string; oldStatus: string; newStatus: string; changedBy: string };
  'support.ticket.escalated': { ticketId: string; escalatedTo: string; reason: string; slaBreached: boolean };
  'support.ticket.resolved': { ticketId: string; resolvedBy: string; resolutionTimeHours: number; firstResponseTimeHours: number };
  'support.ticket.closed': { ticketId: string; closedBy: string; autoClose: boolean };
  'support.ticket.reopened': { ticketId: string; reopenedBy: string; reason?: string };
  'support.sla.warning': { ticketId: string; slaType: 'first_response' | 'resolution'; percentElapsed: number; hoursRemaining: number };
  'support.sla.breached': { ticketId: string; slaType: 'first_response' | 'resolution'; breachedAt: string; assigneeId?: string };
  'support.csat.submitted': { ticketId: string; rating: number; comment?: string; crmCompanyId?: string };
  'support.volume.spike': { currentCount: number; averageCount: number; percentAboveAverage: number; timeWindow: string; organizationId?: string };
  'support.pattern.detected': { pattern: string; ticketIds: string[]; frequency: number; suggestedAction: string; organizationId?: string };

  // ── Time Tracking ──
  'time.entry.created': { entryId: string; userId: string; projectId?: string; taskId?: string; hours: number; billable: boolean; date: string };
  'time.entry.updated': { entryId: string; userId: string; oldHours: number; newHours: number };
  'time.entry.deleted': { entryId: string; userId: string; hours: number };
  'time.timer.started': { timerId: string; userId: string; projectId?: string; taskId?: string; startedAt: string };
  'time.timer.stopped': { timerId: string; userId: string; durationMinutes: number; autoCreatedEntryId?: string };
  'time.timesheet.submitted': { timesheetId: string; userId: string; weekStartDate: string; totalHours: number; billableHours: number };
  'time.timesheet.approved': { timesheetId: string; approvedBy: string; userId: string; totalHours: number; billableHours: number };
  'time.timesheet.rejected': { timesheetId: string; rejectedBy: string; userId: string; reason: string };
  'time.utilization.threshold': { userId: string; currentUtilization: number; targetUtilization: number; period: string; isBelow: boolean };
  'time.overtime.detected': { userId: string; weeklyHours: number; threshold: number; weekStartDate: string };

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

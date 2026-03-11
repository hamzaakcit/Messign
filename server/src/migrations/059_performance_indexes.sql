-- Performance indexes for commonly queried columns (Week 11 Part 2)
-- Run with: npm run db:migrate-runner

-- reimbursement_requests (expenses): status + created_at, submitted_by + status
CREATE INDEX IF NOT EXISTS idx_reimbursement_requests_status_created ON reimbursement_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_reimbursement_requests_submitted_status ON reimbursement_requests(submitted_by, status);

-- crm_deals: owner + stage for pipeline views
CREATE INDEX IF NOT EXISTS idx_crm_deals_owner_stage ON crm_deals(owner_id, stage_id);

-- support_tickets: assignee + status for agent workload
CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee_status ON support_tickets(assignee_id, status);

-- time_entries: user + date for time reports
CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON time_entries(user_id, date);

-- messages: channel + created_at for chat history
CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_id, created_at);

-- dora_insights: target_user + read/dismissed for unread counts
CREATE INDEX IF NOT EXISTS idx_dora_insights_user_read ON dora_insights(target_user_id, is_read, is_dismissed);

-- notifications: user + read for unread list
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);

-- marketing_leads: status + score for lead scoring queries
CREATE INDEX IF NOT EXISTS idx_marketing_leads_status_score ON marketing_leads(status, score);

-- recruitment_applications: job + stage for pipeline views
CREATE INDEX IF NOT EXISTS idx_recruitment_apps_job_stage ON recruitment_applications(job_id, stage);

-- heart_sentiment_scores: user + analyzed_at for trend queries
CREATE INDEX IF NOT EXISTS idx_heart_sentiment_user_date ON heart_sentiment_scores(user_id, analyzed_at);

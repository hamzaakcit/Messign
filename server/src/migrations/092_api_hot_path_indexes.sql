-- Hot-path indexes for routes that often exceed 500ms (notifications, tasks, activities, chat, dora).
-- Safe to run multiple times.

-- Task board: full list ordered by recency
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at DESC);

-- Activity feed
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities (created_at DESC);

-- Notifications: list + unread filters (user_id + read state + sort)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON notifications (user_id, is_read, created_at DESC);

-- Chat: membership lookup by user (JOIN in getChannelsForUser)
CREATE INDEX IF NOT EXISTS idx_channel_members_user_id ON channel_members (user_id);

-- Dora: unread counts by tenant + user + read state (common filter path)
CREATE INDEX IF NOT EXISTS idx_dora_insights_org_target_unread
  ON dora_insights (organization_id, target_user_id, is_read)
  WHERE is_dismissed = FALSE;

-- Dora insights router: team lookup for buildCtx (employee_id = auth user id in this query)
CREATE INDEX IF NOT EXISTS idx_ptm_employee_active
  ON performance_team_members (employee_id)
  WHERE is_active = TRUE;

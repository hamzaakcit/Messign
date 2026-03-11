CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  link VARCHAR(500),
  module VARCHAR(50),
  severity VARCHAR(20) DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  in_app BOOLEAN DEFAULT true,
  email BOOLEAN DEFAULT false,
  push BOOLEAN DEFAULT false,
  UNIQUE(user_id, event_type)
);

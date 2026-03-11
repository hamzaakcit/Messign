-- ════════════════════════════════════════
-- Recruitment ATS — Database Schema
-- ════════════════════════════════════════

CREATE TABLE IF NOT EXISTS recruitment_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  department VARCHAR(100),
  department_id UUID REFERENCES performance_teams(id) ON DELETE SET NULL,
  location VARCHAR(255),
  location_type VARCHAR(30) DEFAULT 'hybrid' CHECK (location_type IN ('remote', 'hybrid', 'onsite')),
  employment_type VARCHAR(30) DEFAULT 'full_time' CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'internship')),
  description TEXT,
  description_html TEXT,
  requirements JSONB DEFAULT '[]'::jsonb,
  nice_to_have JSONB DEFAULT '[]'::jsonb,
  salary_min DECIMAL(12,2),
  salary_max DECIMAL(12,2),
  salary_currency VARCHAR(3) DEFAULT 'EUR',
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'paused', 'closed', 'filled')),
  hiring_manager_id UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  recruiter_id UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  positions_count INTEGER DEFAULT 1,
  positions_filled INTEGER DEFAULT 0,
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  dora_description_generated BOOLEAN DEFAULT false,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recruit_jobs_status ON recruitment_jobs(status);
CREATE INDEX IF NOT EXISTS idx_recruit_jobs_dept ON recruitment_jobs(department);
CREATE INDEX IF NOT EXISTS idx_recruit_jobs_dept_id ON recruitment_jobs(department_id);
CREATE INDEX IF NOT EXISTS idx_recruit_jobs_manager ON recruitment_jobs(hiring_manager_id);

CREATE TABLE IF NOT EXISTS recruitment_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255),
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  linkedin_url TEXT,
  portfolio_url TEXT,
  current_company VARCHAR(255),
  current_title VARCHAR(255),
  location VARCHAR(255),
  resume_url TEXT,
  resume_file_name VARCHAR(255),
  resume_text TEXT,
  resume_parsed JSONB DEFAULT '{}'::jsonb,
  source VARCHAR(100),
  referrer_id UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  notes TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_recruit_candidates_email ON recruitment_candidates(email);
CREATE INDEX IF NOT EXISTS idx_recruit_candidates_source ON recruitment_candidates(source);

CREATE TABLE IF NOT EXISTS recruitment_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES recruitment_jobs(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES recruitment_candidates(id) ON DELETE CASCADE,
  stage VARCHAR(30) DEFAULT 'applied' CHECK (stage IN ('applied', 'screening', 'phone_screen', 'interview', 'assessment', 'final_interview', 'offer', 'hired', 'rejected', 'withdrawn')),
  match_score INTEGER,
  match_details JSONB DEFAULT '{}'::jsonb,
  screened_method VARCHAR(20) CHECK (screened_method IN ('ai', 'manual')),
  screened_at TIMESTAMPTZ,
  cover_letter TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'hired', 'rejected', 'withdrawn')),
  rejection_reason TEXT,
  rejection_stage VARCHAR(30),
  source VARCHAR(100),
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  last_stage_change_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_recruit_apps_job ON recruitment_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_recruit_apps_candidate ON recruitment_applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_recruit_apps_stage ON recruitment_applications(stage);
CREATE INDEX IF NOT EXISTS idx_recruit_apps_score ON recruitment_applications(match_score);

CREATE TABLE IF NOT EXISTS recruitment_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  interviewer_id UUID NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
  interview_type VARCHAR(30) DEFAULT 'video' CHECK (interview_type IN ('phone', 'video', 'onsite', 'technical', 'panel', 'culture_fit')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  location TEXT,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  notes TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  recommendation VARCHAR(30) CHECK (recommendation IN ('strong_yes', 'yes', 'neutral', 'no', 'strong_no')),
  feedback TEXT,
  skills_assessed JSONB DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recruit_interviews_app ON recruitment_interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_recruit_interviews_interviewer ON recruitment_interviews(interviewer_id);
CREATE INDEX IF NOT EXISTS idx_recruit_interviews_date ON recruitment_interviews(scheduled_at);

CREATE TABLE IF NOT EXISTS recruitment_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  salary DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  start_date DATE,
  offer_type VARCHAR(30) DEFAULT 'full_time',
  benefits TEXT,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'withdrawn')),
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_by UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recruit_offers_app ON recruitment_offers(application_id);

CREATE TABLE IF NOT EXISTS recruitment_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  from_stage VARCHAR(30),
  to_stage VARCHAR(30) NOT NULL,
  moved_by UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  notes TEXT,
  moved_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recruit_history_app ON recruitment_stage_history(application_id);

DROP MATERIALIZED VIEW IF EXISTS mv_recruitment_funnel;

CREATE MATERIALIZED VIEW mv_recruitment_funnel AS
SELECT
  j.id AS job_id,
  j.title AS job_title,
  j.department,
  j.status AS job_status,
  COUNT(a.id) AS total_applicants,
  COUNT(a.id) FILTER (WHERE a.stage = 'applied') AS applied,
  COUNT(a.id) FILTER (WHERE a.stage = 'screening') AS screening,
  COUNT(a.id) FILTER (WHERE a.stage IN ('phone_screen', 'interview', 'assessment', 'final_interview')) AS interviewing,
  COUNT(a.id) FILTER (WHERE a.stage = 'offer') AS offer,
  COUNT(a.id) FILTER (WHERE a.stage = 'hired') AS hired,
  COUNT(a.id) FILTER (WHERE a.status = 'rejected') AS rejected,
  COALESCE(AVG(a.match_score), 0) AS avg_match_score,
  j.positions_count,
  j.positions_filled
FROM recruitment_jobs j
LEFT JOIN recruitment_applications a ON a.job_id = j.id
GROUP BY j.id, j.title, j.department, j.status, j.positions_count, j.positions_filled;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_recruit_funnel_id ON mv_recruitment_funnel(job_id);

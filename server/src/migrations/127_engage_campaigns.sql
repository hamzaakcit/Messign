-- WP-38: one-off campaigns (ADR-018). A campaign sends ONE template to ONE segment, once, now. It is a one-step journey
-- (so it inherits the send gate, holdout, results and the customer trail) plus this record of what was asked for and how
-- far it got. The record exists for four reasons:
--   * who sent what to whom, and when: the template version and the segment version are pinned here, immutably;
--   * idempotency: one row per (organization, idempotency key), so a double click or a retry sends nothing twice;
--   * progress: the audience is enrolled in chunks with a keyset cursor, so an interrupted send resumes where it stopped
--     and the counts are exact (matched = enrolled + skipped);
--   * the journey list stays about journeys: a journey that belongs to a campaign is shown with its campaign.
CREATE TABLE IF NOT EXISTS engage.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  journey_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  template_key text NOT NULL CHECK (template_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  template_version integer NOT NULL CHECK (template_version >= 1),
  segment_key text NOT NULL CHECK (segment_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  segment_version integer NOT NULL CHECK (segment_version BETWEEN 1 AND 100000),
  holdout_percent integer NOT NULL DEFAULT 0 CHECK (holdout_percent BETWEEN 0 AND 50),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{8,128}$'),
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  matched integer NOT NULL DEFAULT 0 CHECK (matched >= 0),
  enrolled integer NOT NULL DEFAULT 0 CHECK (enrolled >= 0),
  skipped integer NOT NULL DEFAULT 0 CHECK (skipped >= 0),
  truncated boolean NOT NULL DEFAULT false,
  last_profile_id uuid,
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$'),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, journey_id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, journey_id) REFERENCES engage.journeys (organization_id, id),
  CHECK ((status = 'sending') = (finished_at IS NULL)),
  CHECK (matched = enrolled + skipped)
);
CREATE INDEX IF NOT EXISTS campaigns_org_created_idx ON engage.campaigns (organization_id, created_at DESC);

-- A finished campaign stays finished, and a campaign keeps what it was asked to do.
CREATE OR REPLACE FUNCTION engage.campaign_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'sending' THEN RAISE EXCEPTION 'a finished campaign cannot change' USING ERRCODE = '42501'; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.journey_id IS DISTINCT FROM OLD.journey_id
     OR NEW.name IS DISTINCT FROM OLD.name OR NEW.template_key IS DISTINCT FROM OLD.template_key
     OR NEW.template_version IS DISTINCT FROM OLD.template_version OR NEW.segment_key IS DISTINCT FROM OLD.segment_key
     OR NEW.segment_version IS DISTINCT FROM OLD.segment_version OR NEW.holdout_percent IS DISTINCT FROM OLD.holdout_percent
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'what a campaign was asked to do cannot change' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS campaign_guard ON engage.campaigns;
CREATE TRIGGER campaign_guard BEFORE UPDATE ON engage.campaigns FOR EACH ROW EXECUTE FUNCTION engage.campaign_guard();

ALTER TABLE engage.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE engage.campaigns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON engage.campaigns;
CREATE POLICY tenant_isolation ON engage.campaigns FOR ALL
  USING (organization_id = engage.current_org_id())
  WITH CHECK (organization_id = engage.current_org_id());

-- Progress only: the engage role cannot delete a campaign or edit what it was asked to do.
REVOKE UPDATE, DELETE ON engage.campaigns FROM messign_engage;
GRANT UPDATE (status, matched, enrolled, skipped, truncated, last_profile_id, error_code, finished_at) ON engage.campaigns TO messign_engage;

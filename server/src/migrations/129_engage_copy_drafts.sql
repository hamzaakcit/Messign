-- WP-24: AI copy drafts for journey message steps, held in an approval queue until a tenant admin decides.
--   * A draft proposes the next version of the template that one message step uses. The drafting service
--     (engage/copy/copyDraft.ts) writes a row only after its gatekeepers pass (brief screen, output parse, template
--     checks, personal-data scan). Approval creates the template version through the normal template path. A draft never
--     sends anything and never changes a message that already exists.
--   * The row holds the admin's brief and the proposed copy. It holds no profile, identifier, message or AI response
--     text beyond the copy itself; the AI call is recorded by WP-23 telemetry (no prompt text there either).
--   * Content columns are immutable after insert. Only the decision columns can change, once: pending -> approved|rejected.

CREATE TABLE IF NOT EXISTS engage.copy_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  journey_id uuid NOT NULL,
  step_id text NOT NULL CHECK (step_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  template_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('marketing', 'transactional')),
  language text NOT NULL CHECK (language IN ('tr', 'en')),
  brief text NOT NULL CHECK (char_length(brief) BETWEEN 10 AND 1000),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 998),
  html text CHECK (html IS NULL OR octet_length(html) <= 524288),
  text_body text CHECK (text_body IS NULL OR octet_length(text_body) <= 131072),
  -- Derived by the template parser when the draft was checked: [{name, source, default}].
  variables jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(variables) = 'array'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  template_version integer CHECK (template_version IS NULL OR template_version BETWEEN 1 AND 100000),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  CHECK (html IS NOT NULL OR text_body IS NOT NULL),
  CHECK ((status = 'pending') = (decided_at IS NULL)),
  CHECK ((status = 'approved') = (template_version IS NOT NULL)),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, journey_id) REFERENCES engage.journeys (organization_id, id),
  FOREIGN KEY (organization_id, template_id) REFERENCES engage.templates (organization_id, id)
);

CREATE INDEX IF NOT EXISTS copy_drafts_queue_idx ON engage.copy_drafts (organization_id, status, created_at DESC);

ALTER TABLE engage.copy_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE engage.copy_drafts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON engage.copy_drafts;
CREATE POLICY tenant_isolation ON engage.copy_drafts FOR ALL
  USING (organization_id = engage.current_org_id())
  WITH CHECK (organization_id = engage.current_org_id());

-- Content is fixed at insert. The application may move a pending draft to approved or rejected and record who decided;
-- nothing else can change, and rows cannot be deleted (the trail from a template version back to its draft stays).
REVOKE UPDATE, DELETE ON engage.copy_drafts FROM messign_engage;
GRANT UPDATE (status, template_version, decided_by, decided_at) ON engage.copy_drafts TO messign_engage;

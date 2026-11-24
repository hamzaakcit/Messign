-- WP-14: email templates (target-state D/E: send pipeline "render: template + profile attributes; no LLM").
--   * engage.templates names a template per tenant (key is what a journey step will reference).
--   * engage.template_versions holds the content. A version is immutable: a change is a new version, so a message can
--     always be traced to exactly what it was rendered from (the message stores template id and version).
--   * Content is HTML as exported by Unlayer, plus an optional plain-text part. Variables use a small safe subset
--     ({{name}}, {{payload.name}}, {{unsubscribe_url}}, optional | default: "..."), validated by the application before
--     a version is stored; the columns only bound sizes.

CREATE TABLE IF NOT EXISTS engage.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  channel text NOT NULL CHECK (channel IN ('email')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, key)
);

CREATE TABLE IF NOT EXISTS engage.template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  version integer NOT NULL CHECK (version BETWEEN 1 AND 100000),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 998),
  html text CHECK (html IS NULL OR octet_length(html) <= 524288),
  text_body text CHECK (text_body IS NULL OR octet_length(text_body) <= 131072),
  -- What the version uses, derived by the parser: [{name, source: attribute|payload|system, default}].
  variables jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(variables) = 'array'),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (html IS NOT NULL OR text_body IS NOT NULL),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, template_id, version),
  FOREIGN KEY (organization_id, template_id) REFERENCES engage.templates (organization_id, id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['templates', 'template_versions'] LOOP
    EXECUTE format('ALTER TABLE engage.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE engage.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON engage.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON engage.%I FOR ALL
      USING (organization_id = engage.current_org_id())
      WITH CHECK (organization_id = engage.current_org_id())', t);
  END LOOP;
END $$;

-- Versions are append-only; a template's key, name and channel do not change in place either (a rename is a later
-- feature with its own audit). Deleting would break the trail from a sent message to its template.
REVOKE UPDATE, DELETE ON engage.templates, engage.template_versions FROM messign_engage;

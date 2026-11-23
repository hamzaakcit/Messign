-- WP-40a: WhatsApp templates in the platform (ADR-025).
--   * A WhatsApp template is created and approved by Meta (WhatsApp Manager); Messign registers how to FILL it: the Meta name
--     and language, the approved body text, which customer field or trigger value goes into each variable, and how the customer
--     can stop. engage.templates keeps the key and name (a journey still refers to a template by key); the content of a version
--     lives in engage.whatsapp_template_versions, append-only like the email versions, so a message can always be traced to the
--     exact mapping it was built from.
--   * engage.whatsapp_template_status mirrors what Meta says about each template (approved, paused, category, quality). It is
--     the tenant's own copy of an external state, written by the template check and by Meta's status webhook, and read by the
--     send gate: a template that is not approved is never sent. engage.whatsapp_template_events keeps the history (append-only,
--     one row per change, idempotent on Meta's own event) and engage.whatsapp_template_checks records when the tenant's templates
--     were last read from Meta and how the last attempt ended.
--   * engage.whatsapp_sync_work lists the tenants the hourly template check has to look at: ids only, like the other work lists.
--   * Rows carry names, codes and counts. No customer data.

ALTER TABLE engage.templates DROP CONSTRAINT IF EXISTS templates_channel_check;
ALTER TABLE engage.templates ADD CONSTRAINT templates_channel_check CHECK (channel IN ('email', 'whatsapp'));

CREATE TABLE IF NOT EXISTS engage.whatsapp_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  version integer NOT NULL CHECK (version BETWEEN 1 AND 100000),
  -- How WhatsApp Manager names it (lower-case letters, digits, underscores) and its language (tr, en_US).
  meta_name text NOT NULL CHECK (meta_name ~ '^[a-z0-9_]+$' AND char_length(meta_name) <= 512),
  language text NOT NULL CHECK (language ~ '^[a-z]{2,3}(_[A-Z]{2})?$'),
  -- The author's statement of the category Meta approved it under. Meta's own answer (the status table) wins when it is known.
  declared_category text NOT NULL CHECK (declared_category IN ('marketing', 'utility')),
  -- The approved body text with {{1}}, {{2}} ... as Meta stores it: used for the preview and to check the variable count.
  body_text text NOT NULL CHECK (char_length(body_text) BETWEEN 1 AND 1024),
  -- One entry per body variable, in position order: {position, source: attribute|payload|system, name, defaultValue}.
  variables jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(variables) = 'array'),
  -- Optional text header with one variable: {text, variable}. Optional URL button with one variable appended to its base URL:
  -- {index, baseUrl, variable}. Both null when the template has none.
  header jsonb CHECK (header IS NULL OR jsonb_typeof(header) = 'object'),
  url_button jsonb CHECK (url_button IS NULL OR jsonb_typeof(url_button) = 'object'),
  -- How the customer can stop messages from this template, as declared by the author: a quick-reply button, text in the body,
  -- or nothing. Marketing needs one of the first two.
  opt_out text NOT NULL CHECK (opt_out IN ('quick_reply', 'text_in_body', 'none')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, template_id, version),
  FOREIGN KEY (organization_id, template_id) REFERENCES engage.templates (organization_id, id)
);

CREATE TABLE IF NOT EXISTS engage.whatsapp_template_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meta_name text NOT NULL CHECK (meta_name ~ '^[a-z0-9_]+$' AND char_length(meta_name) <= 512),
  language text NOT NULL CHECK (language ~ '^[a-z]{2,3}(_[A-Z]{2})?$'),
  meta_template_id text CHECK (meta_template_id IS NULL OR meta_template_id ~ '^[0-9]{1,30}$'),
  -- Meta's status (APPROVED, PENDING, REJECTED, PAUSED, DISABLED ...) and category (MARKETING, UTILITY, AUTHENTICATION), upper case as Meta writes them.
  status text NOT NULL CHECK (status ~ '^[A-Z_]{2,40}$'),
  category text CHECK (category IS NULL OR category ~ '^[A-Z_]{2,40}$'),
  correct_category text CHECK (correct_category IS NULL OR correct_category ~ '^[A-Z_]{2,40}$'),
  quality text CHECK (quality IS NULL OR quality ~ '^[A-Z_]{2,40}$'),
  rejected_reason text CHECK (rejected_reason IS NULL OR rejected_reason ~ '^[A-Z_]{2,60}$'),
  -- What Meta's components say about the shape: {bodyVariables, headerVariables, urlButtonVariables, buttons: ['QUICK_REPLY', ...], bodyText}.
  shape jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(shape) = 'object'),
  source text NOT NULL CHECK (source IN ('sync', 'webhook')),
  -- When Meta last changed it (a webhook's own time, or the listing's last_updated_time) and when we last saw it.
  changed_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, meta_name, language)
);

CREATE TABLE IF NOT EXISTS engage.whatsapp_template_events (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Meta's event repeated by a retried delivery is the same key and is stored once.
  event_key text NOT NULL CHECK (char_length(event_key) BETWEEN 3 AND 200),
  meta_name text NOT NULL CHECK (meta_name ~ '^[a-z0-9_]+$' AND char_length(meta_name) <= 512),
  language text NOT NULL CHECK (language ~ '^[a-z]{2,3}(_[A-Z]{2})?$'),
  event text NOT NULL CHECK (event ~ '^[A-Z_]{2,40}$'),
  status text CHECK (status IS NULL OR status ~ '^[A-Z_]{2,40}$'),
  category text CHECK (category IS NULL OR category ~ '^[A-Z_]{2,40}$'),
  reason text CHECK (reason IS NULL OR reason ~ '^[A-Z_]{2,60}$'),
  source text NOT NULL CHECK (source IN ('sync', 'webhook')),
  applied boolean NOT NULL,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, event_key)
);

CREATE TABLE IF NOT EXISTS engage.whatsapp_template_checks (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  last_attempt_at timestamptz,
  last_ok_at timestamptz,
  -- A short code (wa_190, http_503, waba_missing ...), never text from the provider.
  last_error text CHECK (last_error IS NULL OR last_error ~ '^[a-z0-9_]{1,64}$'),
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  templates_seen integer NOT NULL DEFAULT 0 CHECK (templates_seen >= 0)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['whatsapp_template_versions', 'whatsapp_template_status', 'whatsapp_template_events', 'whatsapp_template_checks'] LOOP
    EXECUTE format('ALTER TABLE engage.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE engage.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON engage.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON engage.%I FOR ALL
      USING (organization_id = engage.current_org_id())
      WITH CHECK (organization_id = engage.current_org_id())', t);
  END LOOP;
END $$;

-- Versions and the history are append-only. The status mirror and the check record change (they follow Meta), but never disappear.
REVOKE UPDATE, DELETE ON engage.whatsapp_template_versions, engage.whatsapp_template_events FROM messign_engage;
REVOKE DELETE ON engage.whatsapp_template_status, engage.whatsapp_template_checks FROM messign_engage;
GRANT SELECT, INSERT ON engage.whatsapp_template_versions, engage.whatsapp_template_events TO messign_engage;
GRANT SELECT, INSERT, UPDATE ON engage.whatsapp_template_status, engage.whatsapp_template_checks TO messign_engage;
GRANT USAGE ON SEQUENCE engage.whatsapp_template_events_id_seq TO messign_engage;

CREATE INDEX IF NOT EXISTS whatsapp_template_events_recent_idx ON engage.whatsapp_template_events (organization_id, recorded_at DESC);

-- The tenants the hourly template check looks at: an active WhatsApp account that names its WhatsApp Business Account (config
-- waba_id), and whose last attempt is older than p_stale. Ids only; the check itself runs in the tenant's own transaction.
CREATE OR REPLACE FUNCTION engage.whatsapp_sync_work(p_limit integer, p_stale interval, p_orgs uuid[] DEFAULT NULL)
RETURNS TABLE (organization_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT a.organization_id FROM engage.channel_accounts a
   WHERE a.channel = 'whatsapp' AND a.status = 'active' AND a.config ? 'waba_id'
     AND (p_orgs IS NULL OR a.organization_id = ANY (p_orgs))
     AND NOT EXISTS (SELECT 1 FROM engage.whatsapp_template_checks k
                      WHERE k.organization_id = a.organization_id AND k.last_attempt_at > now() - p_stale)
   GROUP BY a.organization_id
   ORDER BY a.organization_id
   LIMIT LEAST(GREATEST(p_limit, 1), 5000)
$$;

REVOKE ALL ON FUNCTION engage.whatsapp_sync_work(integer, interval, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engage.whatsapp_sync_work(integer, interval, uuid[]) TO messign_engage;

-- The pacing rule of the send gate reads a tenant's allowed WhatsApp messages of the last day, by recipient.
CREATE INDEX IF NOT EXISTS messages_allowed_recent_idx ON engage.messages (organization_id, channel_account_id, gate_allowed_at DESC) WHERE gate_allowed_at IS NOT NULL;

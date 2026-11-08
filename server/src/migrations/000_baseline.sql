-- 000_baseline.sql — the schema of the production database, captured 2026-11-08 (WP-03, ADR-010).
--
-- Replaces the 110 incremental migrations that used to live in this folder, so a fresh database matches live.
-- Produced with: pg_dump --schema-only --no-owner --no-privileges -N pgboss -T public.schema_migrations
-- (PostgreSQL 17.8). Edits to the raw dump, nothing else: removed the psql-only \restrict / \unrestrict lines
-- and `SET transaction_timeout` (PG17-only), and reset search_path at the end so later statements in the same
-- session resolve normally. Excluded on purpose: schema pgboss (pg-boss creates and migrates it itself),
-- schema_migrations (the runner owns it), ownership and grants (roles are set up by db/scripts/), and all data.
-- Needs the extensions pg_trgm and vector (pgvector) to be available.
-- New migrations go in this folder as NNN_name.sql with NNN greater than 000. Never edit this file.

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.8 (Debian 17.8-1.pgdg12+1)
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: DocumentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentStatus" AS ENUM (
    'DRAFT',
    'IN_REVIEW',
    'PUBLISHED',
    'ARCHIVED',
    'REJECTED'
);


--
-- Name: DocumentType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentType" AS ENUM (
    'GUIDE',
    'FAQ',
    'SPECIFICATION',
    'ROADMAP',
    'MEETING_NOTE',
    'MICRO_LEARN',
    'ANNOUNCEMENT',
    'TEMPLATE',
    'SOP'
);


--
-- Name: NotificationType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationType" AS ENUM (
    'REVIEW_REQUESTED',
    'DOCUMENT_APPROVED',
    'DOCUMENT_REJECTED',
    'COMMENT_ADDED',
    'MENTION',
    'CONTENT_STALE',
    'SYSTEM'
);


--
-- Name: ReviewType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ReviewType" AS ENUM (
    'APPROVED',
    'REJECTED',
    'REQUESTED_CHANGES'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'ADMIN',
    'CPO',
    'EDITOR',
    'REVIEWER',
    'VIEWER'
);


--
-- Name: document_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_status AS ENUM (
    'draft',
    'in_review',
    'published',
    'archived',
    'rejected'
);


--
-- Name: document_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_type AS ENUM (
    'guide',
    'faq',
    'specification',
    'roadmap',
    'meeting_note',
    'micro_learn',
    'announcement',
    'template',
    'sop',
    'policy'
);


--
-- Name: kh_notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.kh_notification_type AS ENUM (
    'review_requested',
    'document_approved',
    'document_rejected',
    'comment_added',
    'mention',
    'content_stale',
    'system'
);


--
-- Name: knowledge_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.knowledge_role AS ENUM (
    'admin',
    'cpo',
    'editor',
    'reviewer',
    'viewer'
);


--
-- Name: review_action_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.review_action_type AS ENUM (
    'approved',
    'rejected',
    'requested_changes'
);


--
-- Name: current_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::UUID;
$$;


--
-- Name: set_app_tenant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_app_tenant(tenant_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT set_config('app.current_tenant', tenant_id::text, true);
$$;


--
-- Name: sync_employee_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_employee_email() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE employee_auth
    SET email = NEW.email, updated_at = NOW()
    WHERE employee_id = NEW.id;
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(100) NOT NULL,
    type character varying(50) NOT NULL,
    message text NOT NULL,
    metadata jsonb,
    xp_gained integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id character varying(100) NOT NULL,
    action character varying(100) NOT NULL,
    entity_type character varying(50),
    entity_id character varying(255),
    description text DEFAULT ''::text NOT NULL,
    changes jsonb,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_claude_daily_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_claude_daily_usage (
    user_id text NOT NULL,
    usage_date date DEFAULT CURRENT_DATE NOT NULL,
    count integer DEFAULT 0 NOT NULL
);


--
-- Name: ai_query_telemetry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_query_telemetry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    user_id text NOT NULL,
    user_name text NOT NULL,
    user_role text NOT NULL,
    query text NOT NULL,
    query_length integer NOT NULL,
    current_page text,
    concise_mode boolean DEFAULT false,
    step_count integer DEFAULT 1 NOT NULL,
    tools_used text[] DEFAULT '{}'::text[],
    tool_call_count integer DEFAULT 0 NOT NULL,
    termination_reason text DEFAULT 'complete'::text NOT NULL,
    success boolean DEFAULT true NOT NULL,
    total_duration_ms integer NOT NULL,
    llm_duration_ms integer DEFAULT 0,
    tool_duration_ms integer DEFAULT 0,
    prompt_tokens integer DEFAULT 0,
    completion_tokens integer DEFAULT 0,
    total_tokens integer DEFAULT 0,
    feedback_score text,
    feedback_comment text,
    feedback_at timestamp with time zone,
    thought_trace text[] DEFAULT '{}'::text[],
    error_message text,
    model_used text DEFAULT 'llama-3.3-70b-versatile'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ai_query_telemetry_feedback_score_check CHECK ((feedback_score = ANY (ARRAY['up'::text, 'down'::text])))
);


--
-- Name: TABLE ai_query_telemetry; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_query_telemetry IS 'Logs every AI interaction for analytics, debugging, and quality improvement.';


--
-- Name: COLUMN ai_query_telemetry.session_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_query_telemetry.session_id IS 'Groups messages in the same chat session for multi-turn analysis.';


--
-- Name: COLUMN ai_query_telemetry.tools_used; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_query_telemetry.tools_used IS 'Unique tool names called across all reasoning steps.';


--
-- Name: COLUMN ai_query_telemetry.tool_call_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_query_telemetry.tool_call_count IS 'Total calls made (may exceed tools_used length if same tool called with different args).';


--
-- Name: COLUMN ai_query_telemetry.termination_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_query_telemetry.termination_reason IS 'Why the reasoning loop ended: complete, max_steps, token_budget, timeout, error, no_tools, cascade_failure.';


--
-- Name: COLUMN ai_query_telemetry.feedback_score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_query_telemetry.feedback_score IS 'User thumbs up/down. NULL means no feedback given.';


--
-- Name: COLUMN ai_query_telemetry.thought_trace; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_query_telemetry.thought_trace IS 'Array of LLM reasoning thoughts from each step. Invaluable for debugging bad answers.';


--
-- Name: ai_daily_stats; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.ai_daily_stats AS
 SELECT date(created_at) AS day,
    count(*) AS total_queries,
    count(DISTINCT user_id) AS unique_users,
    (avg(total_duration_ms))::integer AS avg_duration_ms,
    (avg(step_count))::numeric(3,1) AS avg_steps,
    (avg(total_tokens))::integer AS avg_tokens,
    count(*) FILTER (WHERE (success = true)) AS successful,
    count(*) FILTER (WHERE (success = false)) AS failed,
    count(*) FILTER (WHERE (feedback_score = 'up'::text)) AS thumbs_up,
    count(*) FILTER (WHERE (feedback_score = 'down'::text)) AS thumbs_down
   FROM public.ai_query_telemetry
  GROUP BY (date(created_at))
  ORDER BY (date(created_at)) DESC
  WITH NO DATA;


--
-- Name: ai_financial_action_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_financial_action_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action_type text NOT NULL,
    related_entity_type text NOT NULL,
    related_entity_id text NOT NULL,
    user_id uuid,
    reasoning text NOT NULL,
    confidence numeric(3,2),
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ai_hitl_idempotency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_hitl_idempotency (
    organization_id uuid NOT NULL,
    auth_user_id text NOT NULL,
    idempotency_key text NOT NULL,
    action_type text NOT NULL,
    success boolean NOT NULL,
    message text NOT NULL,
    result_json jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_request_telemetry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_request_telemetry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id text NOT NULL,
    query text NOT NULL,
    path text NOT NULL,
    specialist text,
    tool_calls_used integer DEFAULT 0,
    model_tier text,
    duration_ms integer NOT NULL,
    success boolean DEFAULT true,
    error_message text,
    tokens_input integer,
    tokens_output integer,
    created_at timestamp with time zone DEFAULT now(),
    cache_hit boolean DEFAULT false,
    estimated_cost_savings_usd numeric(10,6) DEFAULT 0
);


--
-- Name: TABLE ai_request_telemetry; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_request_telemetry IS 'Lightweight observability for AI request routing. Target: orchestrator >90%, P50 <5s, P95 <15s.';


--
-- Name: COLUMN ai_request_telemetry.cache_hit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_request_telemetry.cache_hit IS 'True when LiteLLM returned cached response (no inference cost)';


--
-- Name: COLUMN ai_request_telemetry.estimated_cost_savings_usd; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_request_telemetry.estimated_cost_savings_usd IS 'Estimated $ saved when cache_hit=true (based on tier input/output cost)';


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key character varying(100) DEFAULT 'default'::character varying NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: approval_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reimbursement_id uuid NOT NULL,
    step_order smallint NOT NULL,
    step_type character varying(30) NOT NULL,
    assigned_to uuid,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    decision_at timestamp with time zone,
    decision_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sla_deadline_hours integer DEFAULT 48,
    sla_reminder_sent boolean DEFAULT false,
    sla_escalated boolean DEFAULT false,
    escalated_at timestamp with time zone,
    entity_type character varying(50),
    entity_id uuid,
    step_name character varying(100)
);


--
-- Name: asset_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    assigned_to uuid NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now(),
    returned_at timestamp with time zone,
    return_condition character varying(20),
    return_notes text
);


--
-- Name: asset_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    name character varying(255) NOT NULL,
    description text,
    depreciation_method character varying(30) DEFAULT 'straight_line'::character varying,
    useful_life_months integer,
    parent_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT asset_categories_depreciation_method_check CHECK (((depreciation_method)::text = ANY ((ARRAY['straight_line'::character varying, 'declining_balance'::character varying, 'none'::character varying])::text[])))
);

ALTER TABLE ONLY public.asset_categories FORCE ROW LEVEL SECURITY;


--
-- Name: asset_maintenance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_maintenance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    type character varying(30),
    description text,
    cost numeric(10,2),
    performed_by character varying(255),
    scheduled_date date,
    completed_date date,
    status character varying(20) DEFAULT 'scheduled'::character varying,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT asset_maintenance_status_check CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT asset_maintenance_type_check CHECK (((type)::text = ANY ((ARRAY['preventive'::character varying, 'repair'::character varying, 'upgrade'::character varying, 'inspection'::character varying])::text[])))
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    category_id uuid,
    name character varying(255) NOT NULL,
    description text,
    asset_tag character varying(100),
    serial_number character varying(255),
    manufacturer character varying(255),
    model character varying(255),
    status character varying(30) DEFAULT 'available'::character varying,
    condition character varying(20) DEFAULT 'good'::character varying,
    purchase_cost numeric(12,2),
    purchase_currency character varying(3) DEFAULT 'EUR'::character varying,
    purchase_cost_eur numeric(12,2),
    purchase_date date,
    current_value numeric(12,2),
    salvage_value numeric(12,2) DEFAULT 0,
    assigned_to uuid,
    assigned_at timestamp with time zone,
    department character varying(100),
    location character varying(255),
    warranty_start date,
    warranty_end date,
    warranty_provider character varying(255),
    warranty_notes text,
    vendor_id uuid,
    purchase_invoice_id uuid,
    specifications jsonb DEFAULT '{}'::jsonb,
    tags jsonb DEFAULT '[]'::jsonb,
    notes text,
    image_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT assets_condition_check CHECK (((condition)::text = ANY ((ARRAY['new'::character varying, 'good'::character varying, 'fair'::character varying, 'poor'::character varying])::text[]))),
    CONSTRAINT assets_status_check CHECK (((status)::text = ANY ((ARRAY['available'::character varying, 'assigned'::character varying, 'in_maintenance'::character varying, 'retired'::character varying, 'lost'::character varying, 'disposed'::character varying])::text[])))
);

ALTER TABLE ONLY public.assets FORCE ROW LEVEL SECURITY;


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachments (
    id text NOT NULL,
    "documentId" text NOT NULL,
    "fileName" text NOT NULL,
    "fileType" text NOT NULL,
    "fileSize" integer NOT NULL,
    "storageUrl" text NOT NULL,
    "ocrText" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    "userId" text NOT NULL,
    action text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    details jsonb,
    "ipAddress" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: auth_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id character varying(100),
    target_auth_user_id character varying(100),
    action character varying(100) NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip_address character varying(45),
    user_agent text,
    status character varying(20) DEFAULT 'success'::character varying NOT NULL,
    failure_reason text,
    performed_by character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_audit_log_status_check CHECK (((status)::text = ANY ((ARRAY['success'::character varying, 'failure'::character varying])::text[])))
);


--
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id character varying(100) NOT NULL,
    refresh_token_hash character varying(255) NOT NULL,
    device_name character varying(255),
    device_type character varying(50),
    browser character varying(255),
    ip_address character varying(45),
    location character varying(255),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.badges (
    id character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    icon character varying(50) DEFAULT 'award'::character varying NOT NULL,
    type character varying(30) DEFAULT 'achievement'::character varying NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    rarity character varying(30) DEFAULT 'common'::character varying NOT NULL,
    criteria text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: bank_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    bank_name character varying(255),
    iban character varying(64),
    swift_bic character varying(16),
    account_holder character varying(255),
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid
);


--
-- Name: batch_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.batch_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    hero_content_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    channels text[] DEFAULT '{}'::text[] NOT NULL,
    total_channels integer DEFAULT 0 NOT NULL,
    completed_channels integer DEFAULT 0 NOT NULL,
    failed_channels integer DEFAULT 0 NOT NULL,
    results jsonb DEFAULT '[]'::jsonb NOT NULL,
    error_log jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    pgboss_job_id text,
    CONSTRAINT batch_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'partial'::text, 'cancelled'::text])))
);


--
-- Name: bookmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookmarks (
    id text NOT NULL,
    "userId" text NOT NULL,
    "documentId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: bounties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bounties (
    id character varying(100) DEFAULT (gen_random_uuid())::text NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    creator_id character varying(100) NOT NULL,
    category character varying(30) NOT NULL,
    department character varying(100),
    xp_reward integer DEFAULT 50 NOT NULL,
    estimated_minutes integer DEFAULT 60 NOT NULL,
    urgency character varying(20) DEFAULT 'NORMAL'::character varying NOT NULL,
    status character varying(20) DEFAULT 'OPEN'::character varying NOT NULL,
    claimed_by character varying(100),
    claimed_at timestamp with time zone,
    completed_at timestamp with time zone,
    reviewed_at timestamp with time zone,
    review_note text,
    rating integer,
    expires_at timestamp with time zone,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bounties_category_check CHECK (((category)::text = ANY ((ARRAY['DESIGN'::character varying, 'CONTENT'::character varying, 'DEVELOPMENT'::character varying, 'DATA'::character varying, 'RESEARCH'::character varying, 'ADMIN'::character varying, 'OTHER'::character varying])::text[]))),
    CONSTRAINT bounties_rating_check CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 5)))),
    CONSTRAINT bounties_status_check CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'CLAIMED'::character varying, 'SUBMITTED'::character varying, 'COMPLETED'::character varying, 'EXPIRED'::character varying, 'CANCELLED'::character varying])::text[]))),
    CONSTRAINT bounties_urgency_check CHECK (((urgency)::text = ANY ((ARRAY['LOW'::character varying, 'NORMAL'::character varying, 'HIGH'::character varying, 'CRITICAL'::character varying])::text[])))
);


--
-- Name: brand_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    brand_name text NOT NULL,
    brand_description text,
    logo_url text,
    tone_keywords text[] DEFAULT '{}'::text[] NOT NULL,
    forbidden_words text[] DEFAULT '{}'::text[] NOT NULL,
    required_disclaimers text[] DEFAULT '{}'::text[] NOT NULL,
    voice_examples text[] DEFAULT '{}'::text[] NOT NULL,
    style_guide_notes text,
    color_palette jsonb DEFAULT '{}'::jsonb,
    preferred_themes text[] DEFAULT '{}'::text[],
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    department text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    allocated_amount numeric(12,2) NOT NULL,
    currency character(3) DEFAULT 'EUR'::bpchar NOT NULL,
    alert_threshold numeric(3,2) DEFAULT 0.80 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    name character varying(255),
    description text,
    budget_code character varying(20),
    team_id uuid,
    project_id uuid,
    owner_id uuid,
    spent_amount numeric(14,2) DEFAULT 0,
    status character varying(20) DEFAULT 'active'::character varying,
    warning_threshold numeric(5,2) DEFAULT 80.00,
    critical_threshold numeric(5,2) DEFAULT 95.00,
    hard_limit boolean DEFAULT false,
    ai_forecast_amount numeric(14,2),
    ai_forecast_date date,
    ai_health_score numeric(3,2),
    ai_recommendations jsonb DEFAULT '[]'::jsonb,
    ai_anomaly_flags jsonb DEFAULT '[]'::jsonb,
    allow_rollover boolean DEFAULT false,
    rollover_amount numeric(14,2) DEFAULT 0,
    requires_approval boolean DEFAULT true,
    approval_threshold numeric(12,2),
    period_type character varying(20) DEFAULT 'monthly'::character varying,
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.budgets FORCE ROW LEVEL SECURITY;


--
-- Name: calibration_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calibration_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    snapshot_date timestamp with time zone DEFAULT now() NOT NULL,
    emails_sent integer DEFAULT 0 NOT NULL,
    avg_open_rate double precision,
    avg_click_rate double precision,
    avg_bounce_rate double precision,
    avg_complaint_rate double precision,
    top_subjects jsonb,
    top_ctas jsonb,
    top_sections jsonb,
    top_hooks jsonb,
    bottom_subjects jsonb,
    bottom_ctas jsonb,
    detected_patterns jsonb,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    icon text,
    color text,
    "parentId" text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: channel_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    user_id character varying(100) NOT NULL,
    joined_at timestamp with time zone DEFAULT now(),
    last_read_at timestamp with time zone DEFAULT now()
);


--
-- Name: channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    type character varying(20) DEFAULT 'public'::character varying NOT NULL,
    unread_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: chat_bookmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_bookmarks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    user_id character varying(100) NOT NULL,
    folder_name character varying(100) DEFAULT 'Saved'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chat_dora_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_dora_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    trigger_message_id uuid,
    suggestion_type character varying(50) NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id text NOT NULL,
    "documentId" text NOT NULL,
    "authorId" text NOT NULL,
    content text NOT NULL,
    "selectionStart" integer,
    "selectionEnd" integer,
    "selectedText" text,
    "parentId" text,
    "isResolved" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: competitor_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competitor_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    competitor_id uuid NOT NULL,
    event_type text NOT NULL,
    title text NOT NULL,
    summary text,
    body_text text,
    source_url text,
    image_url text,
    tags text[] DEFAULT '{}'::text[],
    sentiment text,
    significance text DEFAULT 'normal'::text,
    ai_analysis text,
    ai_analyzed_at timestamp with time zone,
    content_hash text,
    event_date date,
    discovered_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT competitor_events_event_type_check CHECK ((event_type = ANY (ARRAY['blog_post'::text, 'product_launch'::text, 'pricing_change'::text, 'email_campaign'::text, 'social_post'::text, 'press_release'::text, 'feature_update'::text, 'partnership'::text, 'funding'::text, 'other'::text]))),
    CONSTRAINT competitor_events_sentiment_check CHECK ((sentiment = ANY (ARRAY['positive'::text, 'negative'::text, 'neutral'::text]))),
    CONSTRAINT competitor_events_significance_check CHECK ((significance = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'critical'::text])))
);


--
-- Name: competitors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competitors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    website_url text,
    description text,
    logo_url text,
    monitor_urls text[] DEFAULT '{}'::text[] NOT NULL,
    monitor_email boolean DEFAULT false,
    monitor_social boolean DEFAULT false,
    industry text,
    tier text DEFAULT 'direct'::text,
    active boolean DEFAULT true NOT NULL,
    last_scraped_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_scrape_summary jsonb,
    CONSTRAINT competitors_tier_check CHECK ((tier = ANY (ARRAY['direct'::text, 'indirect'::text, 'aspirational'::text])))
);


--
-- Name: COLUMN competitors.last_scrape_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.competitors.last_scrape_summary IS 'Latest scrape result: urlsScraped, urlsFailed, eventsNew, errors[], finishedAt, durationMs, etc.';


--
-- Name: compliance_scans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_scans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    content_id uuid NOT NULL,
    brand_profile_id uuid,
    score integer NOT NULL,
    passed boolean GENERATED ALWAYS AS ((score >= 80)) STORED,
    flags jsonb DEFAULT '[]'::jsonb NOT NULL,
    rule_score integer,
    llm_score integer,
    rule_flags jsonb DEFAULT '[]'::jsonb,
    llm_flags jsonb DEFAULT '[]'::jsonb,
    scan_duration_ms integer,
    scanned_at timestamp with time zone DEFAULT now() NOT NULL,
    scanned_by text DEFAULT 'auto'::text,
    CONSTRAINT compliance_scans_score_check CHECK (((score >= 0) AND (score <= 100)))
);


--
-- Name: contract_obligations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_obligations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    description text NOT NULL,
    obligation_type character varying(30),
    responsible_party character varying(30),
    due_date date,
    recurring character varying(20),
    status character varying(20) DEFAULT 'pending'::character varying,
    completed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT contract_obligations_obligation_type_check CHECK (((obligation_type)::text = ANY ((ARRAY['deliverable'::character varying, 'payment'::character varying, 'sla'::character varying, 'compliance'::character varying, 'reporting'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT contract_obligations_recurring_check CHECK (((recurring)::text = ANY ((ARRAY['one_time'::character varying, 'weekly'::character varying, 'monthly'::character varying, 'quarterly'::character varying, 'annual'::character varying])::text[]))),
    CONSTRAINT contract_obligations_responsible_party_check CHECK (((responsible_party)::text = ANY ((ARRAY['us'::character varying, 'counterparty'::character varying, 'both'::character varying])::text[]))),
    CONSTRAINT contract_obligations_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'overdue'::character varying, 'waived'::character varying])::text[])))
);


--
-- Name: contract_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    reminder_days_before integer NOT NULL,
    reminder_date date NOT NULL,
    sent boolean DEFAULT false,
    sent_at timestamp with time zone,
    recipient_ids jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: contract_signatories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_signatories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    role character varying(100),
    signing_order integer DEFAULT 1,
    status character varying(20) DEFAULT 'pending'::character varying,
    signed_at timestamp with time zone,
    signature_data text,
    ip_address character varying(50),
    reminder_sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT contract_signatories_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'signed'::character varying, 'declined'::character varying])::text[])))
);


--
-- Name: contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    title character varying(500) NOT NULL,
    type character varying(50) NOT NULL,
    status character varying(30) DEFAULT 'draft'::character varying,
    counterparty_name character varying(255) NOT NULL,
    counterparty_email character varying(255),
    counterparty_type character varying(30),
    crm_company_id uuid,
    finance_vendor_id uuid,
    employee_id uuid,
    total_value numeric(15,2),
    currency character varying(3) DEFAULT 'EUR'::character varying,
    total_value_eur numeric(15,2),
    payment_terms text,
    start_date date,
    end_date date,
    signed_date date,
    effective_date date,
    auto_renew boolean DEFAULT false,
    renewal_period_months integer,
    renewal_notice_days integer DEFAULT 30,
    next_renewal_date date,
    document_url text,
    document_text text,
    dora_extracted_terms jsonb,
    dora_extraction_confidence numeric(3,2),
    description text,
    tags jsonb DEFAULT '[]'::jsonb,
    notes text,
    owner_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT contracts_counterparty_type_check CHECK (((counterparty_type)::text = ANY ((ARRAY['vendor'::character varying, 'client'::character varying, 'employee'::character varying, 'partner'::character varying])::text[]))),
    CONSTRAINT contracts_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'pending_signature'::character varying, 'active'::character varying, 'expiring'::character varying, 'expired'::character varying, 'terminated'::character varying, 'renewed'::character varying])::text[]))),
    CONSTRAINT contracts_type_check CHECK (((type)::text = ANY ((ARRAY['vendor'::character varying, 'client'::character varying, 'employee'::character varying, 'nda'::character varying, 'partnership'::character varying, 'lease'::character varying, 'service'::character varying, 'other'::character varying])::text[])))
);

ALTER TABLE ONLY public.contracts FORCE ROW LEVEL SECURITY;


--
-- Name: crm_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    deal_id uuid,
    contact_id uuid,
    user_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    subject character varying(255),
    description text,
    scheduled_at timestamp with time zone,
    completed_at timestamp with time zone,
    duration_minutes integer,
    outcome character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT crm_activities_type_check CHECK (((type)::text = ANY ((ARRAY['call'::character varying, 'email'::character varying, 'meeting'::character varying, 'note'::character varying, 'task'::character varying])::text[])))
);

ALTER TABLE ONLY public.crm_activities FORCE ROW LEVEL SECURITY;


--
-- Name: crm_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    name character varying(255) NOT NULL,
    domain character varying(255),
    industry character varying(255),
    size character varying(50),
    annual_revenue numeric(15,2),
    address text,
    city character varying(255),
    country character varying(100),
    notes text,
    vendor_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.crm_companies FORCE ROW LEVEL SECURITY;


--
-- Name: crm_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    company_id uuid,
    owner_id uuid,
    first_name character varying(255) NOT NULL,
    last_name character varying(255),
    email character varying(255),
    phone character varying(50),
    job_title character varying(255),
    source character varying(100),
    tags jsonb DEFAULT '[]'::jsonb,
    notes text,
    last_contacted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.crm_contacts FORCE ROW LEVEL SECURITY;


--
-- Name: crm_deal_stage_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_deal_stage_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    from_stage_id uuid,
    to_stage_id uuid NOT NULL,
    moved_by uuid,
    moved_at timestamp with time zone DEFAULT now(),
    time_in_previous_stage_hours numeric(10,1)
);


--
-- Name: crm_deal_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_deal_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pipeline_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    probability_default integer DEFAULT 0,
    is_won boolean DEFAULT false,
    is_lost boolean DEFAULT false,
    color character varying(7) DEFAULT '#3B82F6'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT crm_deal_stages_probability_default_check CHECK (((probability_default >= 0) AND (probability_default <= 100)))
);

ALTER TABLE ONLY public.crm_deal_stages FORCE ROW LEVEL SECURITY;


--
-- Name: crm_deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    pipeline_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    company_id uuid,
    contact_id uuid,
    owner_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    amount numeric(15,2) DEFAULT 0,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    amount_eur numeric(15,2) DEFAULT 0,
    probability integer DEFAULT 0,
    expected_close_date date,
    actual_close_date date,
    lost_reason text,
    competitor character varying(255),
    description text,
    tags jsonb DEFAULT '[]'::jsonb,
    dora_score integer,
    dora_next_action text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT crm_deals_probability_check CHECK (((probability >= 0) AND (probability <= 100)))
);

ALTER TABLE ONLY public.crm_deals FORCE ROW LEVEL SECURITY;


--
-- Name: crm_org_forecast_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_org_forecast_settings (
    organization_id uuid NOT NULL,
    sales_quota_eur numeric(14,2) DEFAULT 500000 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_pipelines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_pipelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    name character varying(255) NOT NULL,
    description text,
    team_id uuid,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.crm_pipelines FORCE ROW LEVEL SECURITY;


--
-- Name: daily_briefings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_briefings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    briefing_date date NOT NULL,
    payload jsonb NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dashboard_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    snapshot_date date NOT NULL,
    period_type text DEFAULT 'daily'::text NOT NULL,
    emails_created integer DEFAULT 0,
    emails_sent integer DEFAULT 0,
    va2_manifests_generated integer DEFAULT 0,
    top_theme text,
    avg_section_count numeric(4,1),
    batch_jobs_created integer DEFAULT 0,
    batch_jobs_completed integer DEFAULT 0,
    batch_jobs_failed integer DEFAULT 0,
    total_derivatives_generated integer DEFAULT 0,
    channel_success_rates jsonb DEFAULT '{}'::jsonb,
    avg_open_rate numeric(5,4),
    avg_click_through_rate numeric(5,4),
    avg_conversion_rate numeric(5,4),
    top_performing_content_id uuid,
    top_performing_open_rate numeric(5,4),
    campaigns_with_data integer DEFAULT 0,
    compliance_scans_total integer DEFAULT 0,
    compliance_pass_rate numeric(5,4),
    avg_compliance_score numeric(5,2),
    common_violations jsonb DEFAULT '[]'::jsonb,
    competitor_events_discovered integer DEFAULT 0,
    significant_competitor_moves integer DEFAULT 0,
    active_competitors_count integer DEFAULT 0,
    top_competitor_event_type text,
    content_in_draft integer DEFAULT 0,
    content_in_review integer DEFAULT 0,
    content_approved integer DEFAULT 0,
    content_published integer DEFAULT 0,
    active_team_members integer DEFAULT 0,
    content_per_member numeric(5,2),
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    generation_duration_ms integer,
    CONSTRAINT dashboard_snapshots_period_type_check CHECK ((period_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text])))
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id character varying(50) NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    metrics_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    icon character varying(50),
    head_id character varying(20),
    parent_id character varying(50),
    capacity integer DEFAULT 20 NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb,
    cost_center character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    heading text,
    token_count integer DEFAULT 0 NOT NULL,
    embedding public.vector(1536),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, content)) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_embeddings (
    id text NOT NULL,
    "documentId" text NOT NULL,
    "chunkIndex" integer NOT NULL,
    "chunkText" text NOT NULL,
    embedding public.vector(1536) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: document_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_links (
    id text NOT NULL,
    "sourceId" text NOT NULL,
    "targetId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: document_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_summaries (
    document_id uuid NOT NULL,
    summary text NOT NULL,
    key_topics jsonb DEFAULT '[]'::jsonb NOT NULL,
    audience text DEFAULT 'All employees'::text NOT NULL,
    complexity text DEFAULT 'basic'::text NOT NULL,
    content_hash text NOT NULL,
    last_summarized_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_tags (
    "documentId" text NOT NULL,
    "tagId" text NOT NULL
);


--
-- Name: document_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_versions (
    id text NOT NULL,
    "documentId" text NOT NULL,
    content jsonb NOT NULL,
    "plainText" text,
    version integer NOT NULL,
    "changeNote" text,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: document_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_views (
    id text NOT NULL,
    "documentId" text NOT NULL,
    "userId" text NOT NULL,
    "viewedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    duration integer
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id text NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    content jsonb NOT NULL,
    "plainText" text,
    excerpt text,
    "coverImage" text,
    status public."DocumentStatus" DEFAULT 'DRAFT'::public."DocumentStatus" NOT NULL,
    "documentType" public."DocumentType" DEFAULT 'GUIDE'::public."DocumentType" NOT NULL,
    metadata jsonb,
    "authorId" text NOT NULL,
    "categoryId" text,
    "isPublic" boolean DEFAULT false NOT NULL,
    "viewCount" integer DEFAULT 0 NOT NULL,
    "lastViewedAt" timestamp(3) without time zone,
    "publishedAt" timestamp(3) without time zone,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: dora_automation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dora_automation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    policy_id uuid NOT NULL,
    trigger_event character varying(100) NOT NULL,
    trigger_payload jsonb NOT NULL,
    conditions_evaluated jsonb NOT NULL,
    action_type character varying(100) NOT NULL,
    action_params jsonb NOT NULL,
    risk_level character varying(20) NOT NULL,
    execution_status character varying(20) NOT NULL,
    result jsonb,
    error_message text,
    executed_by character varying(50) DEFAULT 'dora'::character varying,
    confirmed_by uuid,
    confirmed_at timestamp with time zone,
    can_undo boolean DEFAULT true,
    undo_deadline timestamp with time zone,
    undone_at timestamp with time zone,
    undone_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT dora_automation_log_execution_status_check CHECK (((execution_status)::text = ANY ((ARRAY['auto_executed'::character varying, 'queued_for_approval'::character varying, 'executed_with_notification'::character varying, 'skipped'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: dora_automation_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dora_automation_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    created_by uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    trigger_event character varying(100) NOT NULL,
    conditions jsonb DEFAULT '[]'::jsonb NOT NULL,
    action_type character varying(100) NOT NULL,
    action_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    risk_level character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    scope character varying(20) DEFAULT 'team'::character varying NOT NULL,
    scope_department character varying(100),
    scope_team_id uuid,
    execution_count integer DEFAULT 0,
    last_executed_at timestamp with time zone,
    last_execution_result character varying(20),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT dora_automation_policies_risk_level_check CHECK (((risk_level)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT dora_automation_policies_scope_check CHECK (((scope)::text = ANY ((ARRAY['personal'::character varying, 'team'::character varying, 'department'::character varying, 'organization'::character varying])::text[])))
);

ALTER TABLE ONLY public.dora_automation_policies FORCE ROW LEVEL SECURITY;


--
-- Name: dora_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dora_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    module character varying(50) NOT NULL,
    severity character varying(20) DEFAULT 'info'::character varying NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    action_url character varying(500),
    action_label character varying(100),
    source_event character varying(100),
    source_entity_type character varying(50),
    source_entity_id character varying(100),
    target_user_id uuid,
    target_role character varying(50),
    target_department character varying(100),
    is_read boolean DEFAULT false,
    is_dismissed boolean DEFAULT false,
    dismissed_at timestamp with time zone,
    expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT dora_insights_severity_check CHECK (((severity)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'critical'::character varying, 'success'::character varying])::text[])))
);

ALTER TABLE ONLY public.dora_insights FORCE ROW LEVEL SECURITY;


--
-- Name: dora_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dora_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    role character varying(10) NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    CONSTRAINT dora_messages_role_check CHECK (((role)::text = ANY (ARRAY[('user'::character varying)::text, ('assistant'::character varying)::text])))
);

ALTER TABLE ONLY public.dora_messages FORCE ROW LEVEL SECURITY;


--
-- Name: dora_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dora_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title character varying(255) DEFAULT 'New conversation'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.dora_sessions FORCE ROW LEVEL SECURITY;


--
-- Name: employee_auth; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_auth (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    must_change_password boolean DEFAULT true NOT NULL,
    password_changed_at timestamp with time zone,
    password_history jsonb DEFAULT '[]'::jsonb NOT NULL,
    temporary_password character varying(255),
    account_status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    lock_reason character varying(255),
    last_login_at timestamp with time zone,
    last_login_ip character varying(45),
    last_login_device character varying(255),
    total_logins integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(100) DEFAULT 'system'::character varying NOT NULL,
    updated_by character varying(100) DEFAULT 'system'::character varying NOT NULL,
    CONSTRAINT employee_auth_account_status_check CHECK (((account_status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'locked'::character varying, 'pending'::character varying])::text[])))
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id character varying(20) NOT NULL,
    odoo_employee_id character varying(50),
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    full_name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    personal_email character varying(255),
    phone character varying(50),
    date_of_birth date,
    gender character varying(30),
    nationality character varying(100),
    avatar text,
    avatar_thumbnail text,
    department_id character varying(50) NOT NULL,
    role character varying(100) NOT NULL,
    role_level character varying(30) NOT NULL,
    employment_type character varying(30) DEFAULT 'full-time'::character varying NOT NULL,
    work_location character varying(30) DEFAULT 'hybrid'::character varying NOT NULL,
    office_location character varying(100),
    reports_to character varying(20),
    join_date date NOT NULL,
    probation_end_date date,
    contract_end_date date,
    username character varying(100) NOT NULL,
    password_hash character varying(255) DEFAULT ''::character varying NOT NULL,
    system_role character varying(30) DEFAULT 'employee'::character varying NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true NOT NULL,
    last_login timestamp with time zone,
    two_factor_enabled boolean DEFAULT false NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    xp integer DEFAULT 0 NOT NULL,
    performance_rating numeric(3,2),
    status character varying(20) DEFAULT 'offline'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(100) DEFAULT 'system'::character varying NOT NULL,
    updated_by character varying(100) DEFAULT 'system'::character varying NOT NULL,
    address jsonb,
    emergency_contact jsonb,
    direct_reports jsonb DEFAULT '[]'::jsonb,
    badges jsonb DEFAULT '[]'::jsonb,
    achievements jsonb DEFAULT '[]'::jsonb,
    metrics jsonb DEFAULT '{}'::jsonb,
    salary jsonb,
    bank_details jsonb
);


--
-- Name: entity_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    source_module text NOT NULL,
    source_type text NOT NULL,
    source_id uuid NOT NULL,
    content_text text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    embedding public.vector(1536) NOT NULL,
    access_roles text[] DEFAULT '{}'::text[],
    sensitivity text DEFAULT 'normal'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.entity_embeddings FORCE ROW LEVEL SECURITY;


--
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rates (
    id integer NOT NULL,
    base character varying(3) DEFAULT 'EUR'::character varying NOT NULL,
    currency character varying(3) NOT NULL,
    rate numeric(12,6) NOT NULL,
    rate_date date NOT NULL,
    fetched_at timestamp with time zone DEFAULT now()
);


--
-- Name: exchange_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exchange_rates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exchange_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exchange_rates_id_seq OWNED BY public.exchange_rates.id;


--
-- Name: expense_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    icon character varying(50),
    spending_limit numeric(12,2),
    requires_justification_above numeric(12,2),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    slug character varying(100),
    gl_code character varying(20)
);

ALTER TABLE ONLY public.expense_categories FORCE ROW LEVEL SECURITY;


--
-- Name: finance_approval_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_approval_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    applies_to character varying(50) NOT NULL,
    team_id uuid,
    rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    ai_auto_approve_enabled boolean DEFAULT true,
    ai_auto_approve_max numeric(12,2) DEFAULT 100.00,
    ai_min_confidence numeric(3,2) DEFAULT 0.95,
    ai_max_risk numeric(3,2) DEFAULT 0.20,
    is_active boolean DEFAULT true,
    priority integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.finance_approval_policies FORCE ROW LEVEL SECURITY;


--
-- Name: finance_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_audit_log (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    event_type character varying(100) NOT NULL,
    event_category character varying(50) NOT NULL,
    actor_type character varying(20) NOT NULL,
    actor_id character varying(50),
    actor_name character varying(255),
    entity_type character varying(50) NOT NULL,
    entity_id uuid NOT NULL,
    changes jsonb,
    metadata jsonb,
    ai_involved boolean DEFAULT false,
    ai_confidence numeric(3,2),
    ai_reasoning text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_hash character varying(64),
    previous_hash character varying(64),
    severity character varying(20) DEFAULT 'info'::character varying,
    tenant_id uuid
);

ALTER TABLE ONLY public.finance_audit_log FORCE ROW LEVEL SECURITY;


--
-- Name: finance_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.finance_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: finance_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.finance_audit_log_id_seq OWNED BY public.finance_audit_log.id;


--
-- Name: finance_budget_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_budget_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_id uuid NOT NULL,
    category_slug character varying(100) NOT NULL,
    allocated_amount numeric(14,2) NOT NULL,
    spent_amount numeric(14,2) DEFAULT 0,
    ai_suggested_amount numeric(14,2),
    ai_suggestion_reason text
);


--
-- Name: finance_budget_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_budget_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_id uuid NOT NULL,
    snapshot_date date NOT NULL,
    total_amount numeric(14,2),
    spent_amount numeric(14,2),
    allocated_amount numeric(14,2),
    forecast_amount numeric(14,2),
    health_score numeric(3,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: finance_budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    department text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    allocated_amount numeric(12,2) NOT NULL,
    currency character(3) DEFAULT 'EUR'::bpchar NOT NULL,
    alert_threshold numeric(3,2) DEFAULT 0.80 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    name character varying(255),
    description text,
    budget_code character varying(20),
    team_id uuid,
    project_id uuid,
    owner_id uuid,
    spent_amount numeric(14,2) DEFAULT 0,
    status character varying(20) DEFAULT 'active'::character varying,
    warning_threshold numeric(5,2) DEFAULT 80.00,
    critical_threshold numeric(5,2) DEFAULT 95.00,
    hard_limit boolean DEFAULT false,
    ai_forecast_amount numeric(14,2),
    ai_forecast_date date,
    ai_health_score numeric(3,2),
    ai_recommendations jsonb DEFAULT '[]'::jsonb,
    ai_anomaly_flags jsonb DEFAULT '[]'::jsonb,
    allow_rollover boolean DEFAULT false,
    rollover_amount numeric(14,2) DEFAULT 0,
    requires_approval boolean DEFAULT true,
    approval_threshold numeric(12,2),
    period_type character varying(20) DEFAULT 'monthly'::character varying,
    is_active boolean DEFAULT true,
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.finance_budgets FORCE ROW LEVEL SECURITY;


--
-- Name: finance_dora_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_dora_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    decision_type character varying(100) NOT NULL,
    entity_type character varying(50),
    entity_id uuid,
    action_taken character varying(100) NOT NULL,
    confidence_score numeric(3,2) NOT NULL,
    reasoning text NOT NULL,
    input_data jsonb,
    output_data jsonb,
    was_overridden boolean DEFAULT false,
    overridden_by uuid,
    override_reason text,
    feedback_rating integer,
    feedback_comment text,
    processing_time_ms integer,
    tokens_used integer,
    model_used character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    CONSTRAINT finance_dora_decisions_feedback_rating_check CHECK (((feedback_rating >= 1) AND (feedback_rating <= 5)))
);

ALTER TABLE ONLY public.finance_dora_decisions FORCE ROW LEVEL SECURITY;


--
-- Name: finance_dora_job_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_dora_job_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    job_name character varying(100) NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status character varying(20) DEFAULT 'running'::character varying,
    result jsonb,
    error_message text,
    tenant_id uuid NOT NULL,
    CONSTRAINT finance_dora_job_runs_status_check CHECK (((status)::text = ANY ((ARRAY['running'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);

ALTER TABLE ONLY public.finance_dora_job_runs FORCE ROW LEVEL SECURITY;


--
-- Name: finance_expense_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_expense_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expense_id uuid NOT NULL,
    description character varying(500) NOT NULL,
    quantity numeric(10,2) DEFAULT 1,
    unit_price numeric(12,2) NOT NULL,
    total_price numeric(12,2) NOT NULL,
    category_slug character varying(100),
    tax_amount numeric(12,2) DEFAULT 0,
    gl_code character varying(20),
    cost_center character varying(50),
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: finance_expense_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_expense_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    applies_to_teams uuid[] DEFAULT '{}'::uuid[],
    applies_to_roles text[] DEFAULT '{}'::text[],
    rules jsonb NOT NULL,
    violation_action character varying(20) DEFAULT 'flag'::character varying,
    violation_message text,
    priority integer DEFAULT 0,
    is_active boolean DEFAULT true,
    effective_from date,
    effective_until date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL,
    tenant_id uuid NOT NULL,
    CONSTRAINT finance_expense_policies_violation_action_check CHECK (((violation_action)::text = ANY ((ARRAY['flag'::character varying, 'block'::character varying, 'warn'::character varying, 'auto_reject'::character varying])::text[])))
);

ALTER TABLE ONLY public.finance_expense_policies FORCE ROW LEVEL SECURITY;


--
-- Name: finance_gl_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_gl_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(20),
    parent_id uuid,
    is_active boolean DEFAULT true,
    description text,
    normal_balance character varying(6),
    balance numeric(14,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT finance_gl_accounts_normal_balance_check CHECK (((normal_balance)::text = ANY ((ARRAY['debit'::character varying, 'credit'::character varying])::text[]))),
    CONSTRAINT finance_gl_accounts_type_check CHECK (((type)::text = ANY ((ARRAY['asset'::character varying, 'liability'::character varying, 'expense'::character varying, 'revenue'::character varying, 'equity'::character varying])::text[])))
);

ALTER TABLE ONLY public.finance_gl_accounts FORCE ROW LEVEL SECURITY;


--
-- Name: finance_invoice_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_invoice_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(50) NOT NULL,
    template_html text NOT NULL,
    default_brand jsonb DEFAULT '{}'::jsonb,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.finance_invoice_templates FORCE ROW LEVEL SECURITY;


--
-- Name: finance_journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    entry_number character varying(20) NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    description text NOT NULL,
    source_type character varying(30) NOT NULL,
    source_id uuid,
    status character varying(20) DEFAULT 'posted'::character varying NOT NULL,
    period character varying(7) NOT NULL,
    total_debit numeric(14,2) DEFAULT 0 NOT NULL,
    total_credit numeric(14,2) DEFAULT 0 NOT NULL,
    is_auto_generated boolean DEFAULT false,
    posted_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    tenant_id uuid NOT NULL,
    CONSTRAINT finance_journal_entries_source_type_check CHECK (((source_type)::text = ANY ((ARRAY['expense_approved'::character varying, 'expense_paid'::character varying, 'invoice_sent'::character varying, 'invoice_paid'::character varying, 'payment_completed'::character varying, 'manual'::character varying, 'period_close'::character varying, 'void_reversal'::character varying])::text[]))),
    CONSTRAINT finance_journal_entries_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'posted'::character varying, 'voided'::character varying])::text[])))
);

ALTER TABLE ONLY public.finance_journal_entries FORCE ROW LEVEL SECURITY;


--
-- Name: finance_journal_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_journal_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_entry_id uuid NOT NULL,
    gl_account_id uuid NOT NULL,
    debit_amount numeric(14,2) DEFAULT 0 NOT NULL,
    credit_amount numeric(14,2) DEFAULT 0 NOT NULL,
    description character varying(500),
    sort_order integer DEFAULT 0
);


--
-- Name: finance_marketing_journal_stub; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_marketing_journal_stub (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    currency character varying(3) NOT NULL,
    debit_account text NOT NULL,
    credit_account text NOT NULL,
    description text,
    campaign_id uuid,
    channel character varying(64),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE finance_marketing_journal_stub; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.finance_marketing_journal_stub IS 'Marketing expense journal lines (Debit Marketing Expense / Credit Cash or AP) — transactional with marketing_budget_allocations';


--
-- Name: finance_notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.finance_notification_preferences FORCE ROW LEVEL SECURITY;


--
-- Name: finance_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    type character varying(100) NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    entity_type character varying(50),
    entity_id uuid,
    action_url text,
    priority character varying(20) DEFAULT 'normal'::character varying,
    is_read boolean DEFAULT false,
    read_at timestamp with time zone,
    ai_generated boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    CONSTRAINT finance_notifications_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'urgent'::character varying])::text[])))
);

ALTER TABLE ONLY public.finance_notifications FORCE ROW LEVEL SECURITY;


--
-- Name: finance_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    payment_number character varying(50) NOT NULL,
    payment_type character varying(30) NOT NULL,
    expense_id uuid,
    invoice_id uuid,
    vendor_id uuid,
    amount numeric(12,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    recipient_id uuid,
    recipient_name character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    payment_method character varying(50),
    payment_reference character varying(255),
    scheduled_date date,
    processed_at timestamp with time zone,
    completed_at timestamp with time zone,
    batch_id uuid,
    ai_scheduled boolean DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL,
    tenant_id uuid NOT NULL,
    CONSTRAINT finance_payments_payment_type_check CHECK (((payment_type)::text = ANY ((ARRAY['expense_reimbursement'::character varying, 'invoice_payment'::character varying, 'vendor_payment'::character varying, 'refund'::character varying, 'adjustment'::character varying])::text[]))),
    CONSTRAINT finance_payments_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'refunded'::character varying, 'cancelled'::character varying])::text[])))
);

ALTER TABLE ONLY public.finance_payments FORCE ROW LEVEL SECURITY;


--
-- Name: finance_period_close_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_period_close_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_close_id uuid NOT NULL,
    task_key character varying(50) NOT NULL,
    label character varying(255) NOT NULL,
    is_completed boolean DEFAULT false,
    completed_at timestamp with time zone,
    completed_by uuid,
    sort_order integer DEFAULT 0
);


--
-- Name: finance_period_closes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_period_closes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    period character varying(7) NOT NULL,
    status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    closed_by uuid,
    locked_at timestamp with time zone,
    locked_by uuid,
    revenue_total numeric(14,2),
    expense_total numeric(14,2),
    net_income numeric(14,2),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    CONSTRAINT finance_period_closes_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'in_progress'::character varying, 'closed'::character varying, 'locked'::character varying])::text[])))
);

ALTER TABLE ONLY public.finance_period_closes FORCE ROW LEVEL SECURITY;


--
-- Name: finance_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    company_name character varying(255),
    company_address text,
    company_phone character varying(50),
    company_email character varying(255),
    company_website character varying(500),
    company_tax_id character varying(50),
    company_logo_url text,
    base_currency character varying(3) DEFAULT 'USD'::character varying,
    fiscal_year_start integer DEFAULT 1,
    receipt_required_above numeric(12,2) DEFAULT 25.00,
    dora_autonomy_level character varying(20) DEFAULT 'copilot'::character varying,
    dora_auto_approve_enabled boolean DEFAULT true,
    dora_auto_approve_max numeric(12,2) DEFAULT 100.00,
    dora_min_confidence numeric(3,2) DEFAULT 0.95,
    dora_max_risk numeric(3,2) DEFAULT 0.20,
    dora_features jsonb DEFAULT '{"ocr": true, "categorization": true, "budget_forecast": true, "close_checklist": true, "smart_reminders": true, "anomaly_detection": true, "payment_prediction": true, "duplicate_detection": true}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    approval_workflow_config jsonb DEFAULT '[]'::jsonb,
    notification_preferences jsonb DEFAULT '{}'::jsonb,
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.finance_settings FORCE ROW LEVEL SECURITY;


--
-- Name: finance_tax_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_tax_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(20) NOT NULL,
    rate numeric(7,4) NOT NULL,
    type character varying(20) NOT NULL,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    effective_from date,
    effective_until date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    CONSTRAINT finance_tax_rates_type_check CHECK (((type)::text = ANY ((ARRAY['sales'::character varying, 'purchase'::character varying, 'vat'::character varying, 'withholding'::character varying])::text[])))
);

ALTER TABLE ONLY public.finance_tax_rates FORCE ROW LEVEL SECURITY;


--
-- Name: finance_vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_vendors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    legal_name character varying(255),
    tax_id character varying(50),
    vendor_code character varying(20),
    email character varying(255),
    phone character varying(50),
    website character varying(500),
    address text,
    country character varying(3),
    default_currency character varying(3) DEFAULT 'USD'::character varying,
    payment_terms character varying(50),
    default_gl_code character varying(20),
    ai_risk_score numeric(3,2),
    ai_category character varying(100),
    ai_notes text,
    is_active boolean DEFAULT true,
    is_verified boolean DEFAULT false,
    total_invoiced numeric(14,2) DEFAULT 0,
    total_paid numeric(14,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.finance_vendors FORCE ROW LEVEL SECURITY;


--
-- Name: game_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    duration_ms integer DEFAULT 0 NOT NULL,
    played_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: heart_burnout_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.heart_burnout_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    risk_level character varying(20) NOT NULL,
    overall_score numeric(5,2) DEFAULT 0,
    signals jsonb DEFAULT '{}'::jsonb NOT NULL,
    hours_creep_score numeric(5,2) DEFAULT 0,
    after_hours_score numeric(5,2) DEFAULT 0,
    response_time_score numeric(5,2) DEFAULT 0,
    velocity_decline_score numeric(5,2) DEFAULT 0,
    sentiment_shift_score numeric(5,2) DEFAULT 0,
    pto_avoidance_score numeric(5,2) DEFAULT 0,
    weekly_hours_avg numeric(5,2),
    after_hours_percent numeric(5,2),
    response_time_change_percent numeric(5,2),
    velocity_change_percent numeric(5,2),
    days_since_pto integer,
    sentiment_trend character varying(20),
    private_nudge_sent boolean DEFAULT false,
    manager_alert_sent boolean DEFAULT false,
    assessed_at timestamp with time zone DEFAULT now(),
    previous_risk_level character varying(20),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT heart_burnout_assessments_overall_score_check CHECK (((overall_score >= (0)::numeric) AND (overall_score <= (100)::numeric))),
    CONSTRAINT heart_burnout_assessments_risk_level_check CHECK (((risk_level)::text = ANY ((ARRAY['none'::character varying, 'low'::character varying, 'medium'::character varying, 'high'::character varying])::text[])))
);


--
-- Name: heart_onboarding_journey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.heart_onboarding_journey (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    milestone character varying(30) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    triggered_at timestamp with time zone,
    completed_at timestamp with time zone,
    dora_message text,
    user_response text,
    manager_summary text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT heart_onboarding_journey_milestone_check CHECK (((milestone)::text = ANY ((ARRAY['day_1'::character varying, 'week_1'::character varying, 'day_30'::character varying, 'day_60'::character varying, 'day_90'::character varying])::text[]))),
    CONSTRAINT heart_onboarding_journey_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'triggered'::character varying, 'completed'::character varying, 'skipped'::character varying])::text[])))
);


--
-- Name: heart_pulse_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.heart_pulse_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    survey_id uuid NOT NULL,
    department character varying(100),
    answers jsonb NOT NULL,
    submitted_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.heart_pulse_responses FORCE ROW LEVEL SECURITY;


--
-- Name: heart_pulse_surveys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.heart_pulse_surveys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    title character varying(255),
    questions jsonb NOT NULL,
    target_scope character varying(20) DEFAULT 'organization'::character varying,
    target_scope_id character varying(100),
    status character varying(20) DEFAULT 'draft'::character varying,
    sent_at timestamp with time zone,
    closes_at timestamp with time zone,
    response_count integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT heart_pulse_surveys_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'closed'::character varying])::text[])))
);

ALTER TABLE ONLY public.heart_pulse_surveys FORCE ROW LEVEL SECURITY;


--
-- Name: heart_sentiment_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.heart_sentiment_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source character varying(30) NOT NULL,
    score numeric(4,2) NOT NULL,
    normalized_score integer GENERATED ALWAYS AS ((((score + (1)::numeric) * (50)::numeric))::integer) STORED,
    factors jsonb DEFAULT '{}'::jsonb,
    message_sample_hash character varying(64),
    analyzed_at timestamp with time zone DEFAULT now(),
    period_start date,
    period_end date,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT heart_sentiment_scores_score_check CHECK (((score >= ('-1'::integer)::numeric) AND (score <= (1)::numeric))),
    CONSTRAINT heart_sentiment_scores_source_check CHECK (((source)::text = ANY ((ARRAY['chat'::character varying, 'checkin'::character varying, 'ticket_response'::character varying, 'review'::character varying, 'pulse'::character varying, 'composite'::character varying])::text[])))
);


--
-- Name: heart_team_health; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.heart_team_health (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    scope_type character varying(20) NOT NULL,
    scope_id character varying(100),
    scope_name character varying(255),
    health_score integer DEFAULT 75,
    engagement_score integer DEFAULT 75,
    sentiment_score integer DEFAULT 75,
    velocity_score integer DEFAULT 75,
    hours_balance_score integer DEFAULT 75,
    collaboration_score integer DEFAULT 75,
    member_count integer DEFAULT 0,
    at_risk_count integer DEFAULT 0,
    high_engagement_count integer DEFAULT 0,
    health_trend character varying(20) DEFAULT 'stable'::character varying,
    previous_health_score integer,
    period_start date NOT NULL,
    period_end date NOT NULL,
    calculated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT heart_team_health_health_trend_check CHECK (((health_trend)::text = ANY ((ARRAY['improving'::character varying, 'stable'::character varying, 'declining'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT heart_team_health_scope_type_check CHECK (((scope_type)::text = ANY ((ARRAY['team'::character varying, 'department'::character varying, 'organization'::character varying])::text[])))
);

ALTER TABLE ONLY public.heart_team_health FORCE ROW LEVEL SECURITY;


--
-- Name: invoice_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    expense_id uuid,
    description text NOT NULL,
    amount_eur numeric(12,2) NOT NULL,
    original_amount numeric(12,2),
    original_currency character varying(3),
    sort_order integer DEFAULT 0 NOT NULL,
    quantity numeric(10,2) DEFAULT 1 NOT NULL,
    unit_price numeric(12,2) DEFAULT 0 NOT NULL,
    tax_rate numeric(5,2) DEFAULT 0,
    line_total numeric(12,2) DEFAULT 0 NOT NULL
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_number character varying(20) NOT NULL,
    employee_id uuid NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    base_retainer numeric(12,2) NOT NULL,
    total_expenses numeric(12,2) DEFAULT 0 NOT NULL,
    grand_total numeric(12,2) NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    generated_date date NOT NULL,
    due_date date NOT NULL,
    pdf_url text,
    rejection_note text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    signed_at timestamp with time zone,
    signature_snapshot text,
    subtotal_eur numeric(12,2) DEFAULT 0,
    tax_amount_eur numeric(12,2) DEFAULT 0,
    discount_amount_eur numeric(12,2) DEFAULT 0,
    grand_total_eur numeric(12,2) DEFAULT 0,
    total_amount_eur numeric(12,2) DEFAULT 0,
    organization_id uuid,
    invoice_type character varying(20) DEFAULT 'standard'::character varying,
    reference_number character varying(100),
    from_name character varying(255),
    from_email character varying(255),
    from_address text,
    from_tax_id character varying(50),
    to_name character varying(255),
    to_email character varying(255),
    to_address text,
    to_tax_id character varying(50),
    client_id uuid,
    vendor_id uuid,
    discount_amount numeric(12,2) DEFAULT 0,
    discount_pct numeric(5,2),
    amount_paid numeric(12,2) DEFAULT 0,
    sent_at timestamp with time zone,
    viewed_at timestamp with time zone,
    is_recurring boolean DEFAULT false,
    recurring_config jsonb,
    parent_recurring_id uuid,
    payment_terms character varying(100),
    payment_method character varying(50),
    payment_instructions text,
    ai_generated boolean DEFAULT false,
    ai_confidence numeric(3,2),
    ai_payment_prediction jsonb,
    ai_risk_assessment jsonb,
    ai_follow_up_date date,
    ai_notes text,
    template_id character varying(50) DEFAULT 'default'::character varying,
    brand_logo_url text,
    brand_color character varying(7),
    brand_footer text,
    internal_notes text,
    tags text[] DEFAULT '{}'::text[],
    custom_fields jsonb DEFAULT '{}'::jsonb,
    is_deleted boolean DEFAULT false,
    currency character varying(3) DEFAULT 'USD'::character varying,
    subtotal numeric(12,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    total_amount numeric(12,2) DEFAULT 0,
    notes text,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.invoices FORCE ROW LEVEL SECURITY;


--
-- Name: kb_acknowledgements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_acknowledgements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id character varying(100) NOT NULL,
    user_id character varying(100) NOT NULL,
    acknowledged_at timestamp with time zone DEFAULT now()
);


--
-- Name: kb_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action character varying(50) NOT NULL,
    document_id character varying(100),
    collection_id uuid,
    user_id character varying(100) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: kb_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    icon character varying(100),
    color character varying(20),
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: kb_collection_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_collection_documents (
    collection_id uuid NOT NULL,
    document_id character varying(100) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: kb_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(500) NOT NULL,
    slug character varying(500) NOT NULL,
    description text,
    cover_image text,
    share_token character varying(100) DEFAULT (gen_random_uuid())::text NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    created_by character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: kb_document_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_document_tags (
    document_id character varying(100) NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: kb_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_documents (
    id character varying(100) NOT NULL,
    title character varying(500) NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    author_id character varying(100) NOT NULL,
    type character varying(30) DEFAULT 'wiki'::character varying NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: kb_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id character varying(100) NOT NULL,
    flagged_by character varying(100) NOT NULL,
    reason text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    resolved_by character varying(100),
    resolved_at timestamp with time zone,
    resolved_note text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: kb_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: kb_user_pins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_user_pins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(100) NOT NULL,
    document_id character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: knowledge_ai_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_ai_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(100) NOT NULL,
    query text NOT NULL,
    answer text NOT NULL,
    source_document_ids uuid[] DEFAULT '{}'::uuid[],
    is_helpful boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_ai_query_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_ai_query_logs (
    id integer NOT NULL,
    user_id character varying(100) NOT NULL,
    query text NOT NULL,
    tools_used jsonb DEFAULT '[]'::jsonb,
    data_points_returned integer DEFAULT 0,
    response_time_ms integer DEFAULT 0,
    success boolean DEFAULT true,
    error_message text,
    used_fallback boolean DEFAULT false,
    tool_call_count integer DEFAULT 0,
    concise_mode boolean DEFAULT false,
    synthesis_provider character varying(50),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: knowledge_ai_query_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knowledge_ai_query_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knowledge_ai_query_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knowledge_ai_query_logs_id_seq OWNED BY public.knowledge_ai_query_logs.id;


--
-- Name: knowledge_ai_tool_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_ai_tool_logs (
    id integer NOT NULL,
    query_log_id integer,
    tool_name character varying(100) NOT NULL,
    execution_time_ms integer DEFAULT 0,
    success boolean DEFAULT true,
    record_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: knowledge_ai_tool_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knowledge_ai_tool_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knowledge_ai_tool_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knowledge_ai_tool_logs_id_seq OWNED BY public.knowledge_ai_tool_logs.id;


--
-- Name: knowledge_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    file_name character varying(500) NOT NULL,
    file_type character varying(100) NOT NULL,
    file_size integer NOT NULL,
    file_path character varying(500) NOT NULL,
    ocr_text text,
    uploaded_by character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(100) NOT NULL,
    action character varying(100) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id character varying(100) NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    ip_address character varying(45),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_bookmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_bookmarks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(100) NOT NULL,
    document_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(200) NOT NULL,
    slug character varying(200) NOT NULL,
    description text,
    icon character varying(50),
    color character varying(7),
    parent_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_collection_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_collection_documents (
    collection_id uuid NOT NULL,
    document_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    owner_id character varying(100) NOT NULL,
    is_shared boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    author_id character varying(100) NOT NULL,
    content text NOT NULL,
    selection_from integer,
    selection_to integer,
    selected_text character varying(500),
    parent_id uuid,
    is_resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_content_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_content_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    flagged_by character varying(100) NOT NULL,
    reason character varying(50) NOT NULL,
    description text,
    is_resolved boolean DEFAULT false NOT NULL,
    resolved_by character varying(100),
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_document_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_document_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid NOT NULL,
    target_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_document_links_check CHECK ((source_id <> target_id))
);


--
-- Name: knowledge_document_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_document_tags (
    document_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: knowledge_document_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_document_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    version_number integer NOT NULL,
    content jsonb NOT NULL,
    plain_text text,
    change_note character varying(500),
    created_by character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_document_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_document_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    user_id character varying(100) NOT NULL,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_seconds integer
);


--
-- Name: knowledge_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(500) NOT NULL,
    slug character varying(500) NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    plain_text text,
    excerpt character varying(500),
    cover_image character varying(500),
    status public.document_status DEFAULT 'draft'::public.document_status NOT NULL,
    document_type public.document_type DEFAULT 'guide'::public.document_type NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    author_id character varying(100) NOT NULL,
    category_id uuid,
    is_public boolean DEFAULT false NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    view_count integer DEFAULT 0 NOT NULL,
    last_viewed_at timestamp with time zone,
    published_at timestamp with time zone,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    chunk_text text NOT NULL,
    embedding public.vector(1024),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(100) NOT NULL,
    type public.kh_notification_type NOT NULL,
    title character varying(300) NOT NULL,
    message text NOT NULL,
    link character varying(500),
    is_read boolean DEFAULT false NOT NULL,
    related_document_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_review_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_review_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    reviewer_id character varying(100) NOT NULL,
    action public.review_action_type NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_search_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_search_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(100) NOT NULL,
    query text NOT NULL,
    result_count integer DEFAULT 0 NOT NULL,
    clicked_document_id uuid,
    search_type character varying(20) DEFAULT 'keyword'::character varying,
    response_time_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    color character varying(7),
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_team_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_team_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    team_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    user_id character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    color character varying(7),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(100) NOT NULL,
    role public.knowledge_role DEFAULT 'viewer'::public.knowledge_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: license_seats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.license_seats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    license_id uuid NOT NULL,
    user_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now(),
    last_active_at timestamp with time zone
);


--
-- Name: licenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.licenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    software_name character varying(255) NOT NULL,
    vendor character varying(255),
    vendor_id uuid,
    license_type character varying(30) DEFAULT 'subscription'::character varying,
    seats_purchased integer DEFAULT 0,
    seats_used integer DEFAULT 0,
    cost_per_seat numeric(10,2),
    total_monthly_cost numeric(10,2),
    currency character varying(3) DEFAULT 'EUR'::character varying,
    billing_cycle character varying(20) DEFAULT 'monthly'::character varying,
    start_date date,
    expiry_date date,
    auto_renew boolean DEFAULT false,
    renewal_cost numeric(12,2),
    admin_url text,
    notes text,
    tags jsonb DEFAULT '[]'::jsonb,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT licenses_billing_cycle_check CHECK (((billing_cycle)::text = ANY ((ARRAY['monthly'::character varying, 'quarterly'::character varying, 'annual'::character varying])::text[]))),
    CONSTRAINT licenses_license_type_check CHECK (((license_type)::text = ANY ((ARRAY['subscription'::character varying, 'perpetual'::character varying, 'per_seat'::character varying, 'site'::character varying, 'open_source'::character varying])::text[]))),
    CONSTRAINT licenses_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'expiring'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])))
);

ALTER TABLE ONLY public.licenses FORCE ROW LEVEL SECURITY;


--
-- Name: marketing_approval_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_approval_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    content_id uuid NOT NULL,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    truth_validation jsonb,
    brand_voice_check jsonb,
    compliance_scan jsonb,
    reviewer_feedback text,
    rejection_reason character varying(64),
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT marketing_approval_queue_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: TABLE marketing_approval_queue; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketing_approval_queue IS 'Pending human review for marketing content with Groq validator JSON payloads';


--
-- Name: marketing_approved_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_approved_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    claim text NOT NULL,
    proof_point text,
    context_tags text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketing_automation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_automation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    automation_id uuid NOT NULL,
    trigger_event jsonb,
    actions_executed jsonb,
    content_ids uuid[],
    status character varying(20) NOT NULL,
    error text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT marketing_automation_runs_status_check CHECK (((status)::text = ANY ((ARRAY['success'::character varying, 'partial'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[])))
);


--
-- Name: marketing_automation_triggers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_automation_triggers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    trigger_type character varying(32) NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    hitl_mode character varying(32) DEFAULT 'draft_and_wait'::character varying NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT marketing_automation_triggers_hitl_mode_check CHECK (((hitl_mode)::text = ANY ((ARRAY['autopilot'::character varying, 'draft_and_wait'::character varying, 'escalation'::character varying])::text[]))),
    CONSTRAINT marketing_automation_triggers_trigger_type_check CHECK (((trigger_type)::text = ANY ((ARRAY['schedule'::character varying, 'event'::character varying, 'threshold'::character varying, 'webhook'::character varying])::text[])))
);


--
-- Name: TABLE marketing_automation_triggers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketing_automation_triggers IS 'Marketing automation trigger definitions (schedule, event, threshold, webhook)';


--
-- Name: marketing_automations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_automations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    trigger_type character varying(30) NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    condition jsonb,
    actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    hitl_mode character varying(20) DEFAULT 'draft_and_wait'::character varying,
    enabled boolean DEFAULT true,
    last_fired_at timestamp with time zone,
    fire_count integer DEFAULT 0,
    last_error text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    CONSTRAINT marketing_automations_hitl_mode_check CHECK (((hitl_mode)::text = ANY ((ARRAY['autopilot'::character varying, 'draft_and_wait'::character varying, 'escalation'::character varying])::text[]))),
    CONSTRAINT marketing_automations_trigger_type_check CHECK (((trigger_type)::text = ANY ((ARRAY['schedule'::character varying, 'event'::character varying, 'threshold'::character varying, 'manual'::character varying])::text[])))
);


--
-- Name: marketing_blocked_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_blocked_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    blocked_claim text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketing_brand_examples; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_brand_examples (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    kind character varying(16) NOT NULL,
    title character varying(255),
    body text NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    format character varying(32),
    content text,
    CONSTRAINT marketing_brand_examples_format_check CHECK (((format IS NULL) OR ((format)::text = ANY ((ARRAY['blog'::character varying, 'email'::character varying, 'social'::character varying, 'other'::character varying])::text[])))),
    CONSTRAINT marketing_brand_examples_kind_check CHECK (((kind)::text = ANY ((ARRAY['golden'::character varying, 'anti'::character varying])::text[])))
);


--
-- Name: COLUMN marketing_brand_examples.content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_brand_examples.content IS 'Optional body override; if null, use body column';


--
-- Name: marketing_brand_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_brand_profile (
    organization_id uuid NOT NULL,
    profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketing_brand_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_brand_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    tone_description text,
    personality_traits text[] DEFAULT '{}'::text[],
    taboos text[] DEFAULT '{}'::text[],
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketing_brand_voice_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_brand_voice_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    rationale text NOT NULL,
    golden_example_additions jsonb DEFAULT '[]'::jsonb NOT NULL,
    tone_notes text[] DEFAULT '{}'::text[],
    status character varying(24) DEFAULT 'pending'::character varying NOT NULL,
    created_by_trace text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT marketing_brand_voice_proposals_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'superseded'::character varying])::text[])))
);


--
-- Name: TABLE marketing_brand_voice_proposals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketing_brand_voice_proposals IS 'Proposed golden examples / tone updates; merge to marketing_brand_examples after human approval';


--
-- Name: marketing_budget_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_budget_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    channel character varying(64) NOT NULL,
    allocated_amount numeric(14,2) DEFAULT 0 NOT NULL,
    spent_amount numeric(14,2) DEFAULT 0 NOT NULL,
    currency character varying(3) DEFAULT 'EUR'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT marketing_budget_allocations_allocated_amount_check CHECK ((allocated_amount >= (0)::numeric)),
    CONSTRAINT marketing_budget_allocations_spent_amount_check CHECK ((spent_amount >= (0)::numeric))
);


--
-- Name: TABLE marketing_budget_allocations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketing_budget_allocations IS 'Per-channel budget envelope; must stay in sync with finance journal (see campaign_budget_allocate transaction)';


--
-- Name: marketing_campaign_spend; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_campaign_spend (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    amount_eur numeric(12,2),
    category character varying(100),
    description text,
    date date NOT NULL,
    vendor character varying(255),
    finance_expense_id uuid,
    receipt_url text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketing_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    name character varying(255) NOT NULL,
    description text,
    channel character varying(50) NOT NULL,
    status character varying(30) DEFAULT 'draft'::character varying,
    budget numeric(12,2) DEFAULT 0,
    actual_spend numeric(12,2) DEFAULT 0,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    budget_eur numeric(12,2) DEFAULT 0,
    actual_spend_eur numeric(12,2) DEFAULT 0,
    start_date date,
    end_date date,
    target_audience text,
    goals text,
    owner_id uuid,
    impressions integer DEFAULT 0,
    clicks integer DEFAULT 0,
    conversions integer DEFAULT 0,
    leads_generated integer DEFAULT 0,
    cost_per_lead numeric(10,2),
    roi numeric(8,2),
    tags jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    objective text,
    brand_profile_id uuid,
    CONSTRAINT marketing_campaigns_channel_check CHECK (((channel)::text = ANY ((ARRAY['email'::character varying, 'social'::character varying, 'paid_search'::character varying, 'paid_social'::character varying, 'content'::character varying, 'event'::character varying, 'webinar'::character varying, 'referral'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT marketing_campaigns_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'scheduled'::character varying, 'active'::character varying, 'paused'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);

ALTER TABLE ONLY public.marketing_campaigns FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN marketing_campaigns.budget; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_campaigns.budget IS 'Total campaign budget (maps agent field total_budget)';


--
-- Name: COLUMN marketing_campaigns.objective; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_campaigns.objective IS 'High-level campaign objective (agent / planner)';


--
-- Name: marketing_competitor_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_competitor_map (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    competitor_name character varying(255) NOT NULL,
    approved_comparison_points jsonb DEFAULT '[]'::jsonb,
    strengths text,
    weaknesses text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketing_competitor_points; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_competitor_points (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    competitor_name character varying(255) NOT NULL,
    point_text text NOT NULL,
    approved boolean DEFAULT false,
    favors character varying(16),
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT marketing_competitor_points_favors_check CHECK (((favors IS NULL) OR ((favors)::text = ANY ((ARRAY['messign'::character varying, 'competitor'::character varying, 'neutral'::character varying])::text[]))))
);


--
-- Name: marketing_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    campaign_id uuid,
    title character varying(500) NOT NULL,
    content_type character varying(50) NOT NULL,
    channel character varying(50),
    status character varying(30) DEFAULT 'idea'::character varying,
    body text,
    body_html text,
    scheduled_date date,
    scheduled_time time without time zone,
    published_at timestamp with time zone,
    author_id uuid,
    reviewer_id uuid,
    tags jsonb DEFAULT '[]'::jsonb,
    views integer DEFAULT 0,
    engagement integer DEFAULT 0,
    click_throughs integer DEFAULT 0,
    leads_attributed integer DEFAULT 0,
    knowledge_doc_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    truth_validation jsonb,
    truth_validated_at timestamp with time zone,
    brand_voice_check jsonb,
    brand_voice_checked_at timestamp with time zone,
    user_brief text,
    revision_history jsonb DEFAULT '[]'::jsonb,
    image_prompt text,
    image_url text,
    visual_description text,
    image_generation_metadata jsonb,
    instagram_media_id text,
    parent_content_id uuid,
    body_design jsonb,
    batch_job_id uuid,
    is_hero_asset boolean DEFAULT false NOT NULL,
    brand_profile_id uuid,
    reference_image_url text,
    CONSTRAINT marketing_content_content_type_check CHECK (((content_type)::text = ANY ((ARRAY['blog'::character varying, 'social'::character varying, 'email'::character varying, 'video'::character varying, 'webinar'::character varying, 'case_study'::character varying, 'whitepaper'::character varying, 'infographic'::character varying, 'podcast'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT marketing_content_status_check CHECK (((status)::text = ANY ((ARRAY['idea'::character varying, 'draft'::character varying, 'in_review'::character varying, 'approved'::character varying, 'scheduled'::character varying, 'published'::character varying, 'archived'::character varying])::text[])))
);

ALTER TABLE ONLY public.marketing_content FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN marketing_content.truth_validation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content.truth_validation IS 'Last product truth validator JSON result (PASS/FAIL + checks)';


--
-- Name: COLUMN marketing_content.truth_validated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content.truth_validated_at IS 'When truth_validation was produced';


--
-- Name: COLUMN marketing_content.brand_voice_check; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content.brand_voice_check IS 'Last brand voice checker JSON (score, dimensions, strengths, improvements)';


--
-- Name: COLUMN marketing_content.brand_voice_checked_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content.brand_voice_checked_at IS 'When brand_voice_check was produced';


--
-- Name: COLUMN marketing_content.user_brief; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content.user_brief IS 'Original user/marketing brief for regeneration after human rejection';


--
-- Name: COLUMN marketing_content.revision_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content.revision_history IS 'JSON array of prior draft snapshots {version,label,savedAt,body,feedback?,rejection_reason?}';


--
-- Name: COLUMN marketing_content.image_prompt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content.image_prompt IS 'Structured prompt sent to the image generation model. Extracted from [IMAGE_PROMPT] block in agent output.';


--
-- Name: COLUMN marketing_content.image_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content.image_url IS 'Public URL of the generated or uploaded hero image (storage).';


--
-- Name: COLUMN marketing_content.visual_description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content.visual_description IS 'Plain-English visual brief for the image. Used for alt-text and designer handoff.';


--
-- Name: COLUMN marketing_content.image_generation_metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content.image_generation_metadata IS 'Generation metadata: { model, resolution, seed, retries, generated_at, duration_ms }';


--
-- Name: COLUMN marketing_content.instagram_media_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content.instagram_media_id IS 'Meta / Instagram media id after publish (Graph API) for reconciliation and edits.';


--
-- Name: COLUMN marketing_content.parent_content_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content.parent_content_id IS 'Links repurposed content back to its source. NULL = original content.';


--
-- Name: COLUMN marketing_content.body_design; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content.body_design IS 'Unlayer design JSON for email content_type; pairs with body_html';


--
-- Name: COLUMN marketing_content.reference_image_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content.reference_image_url IS 'Public HTTPS URL of user-uploaded real-world photo used as input for AI edits; output stored in image_url';


--
-- Name: marketing_content_calendar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_content_calendar (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    content_id uuid NOT NULL,
    campaign_id uuid,
    scheduled_at timestamp with time zone NOT NULL,
    channel character varying(64) NOT NULL,
    status character varying(24) DEFAULT 'planned'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    published_url text,
    last_error text,
    external_post_id character varying(512),
    CONSTRAINT marketing_content_calendar_status_check CHECK (((status)::text = ANY ((ARRAY['planned'::character varying, 'scheduled'::character varying, 'processing'::character varying, 'published'::character varying, 'failed'::character varying, 'paused'::character varying])::text[])))
);


--
-- Name: TABLE marketing_content_calendar; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketing_content_calendar IS 'Scheduled marketing content slots (workspace-scoped); mirrors approved content scheduling';


--
-- Name: COLUMN marketing_content_calendar.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content_calendar.status IS 'scheduled = ready to publish; paused = frozen with campaign; processing/published/failed per publisher';


--
-- Name: COLUMN marketing_content_calendar.published_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content_calendar.published_url IS 'Live URL after successful publish (adapter-dependent)';


--
-- Name: COLUMN marketing_content_calendar.last_error; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content_calendar.last_error IS 'Last adapter/API error message when status = failed';


--
-- Name: COLUMN marketing_content_calendar.external_post_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_content_calendar.external_post_id IS 'Opaque id from LinkedIn/X/email provider';


--
-- Name: marketing_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255),
    body_html text NOT NULL,
    body_design jsonb,
    status character varying(20) DEFAULT 'draft'::character varying,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT marketing_documents_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying])::text[])))
);


--
-- Name: marketing_email_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_email_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid,
    name character varying(255) NOT NULL,
    subject character varying(500) NOT NULL,
    body_html text NOT NULL,
    body_text text,
    from_name character varying(255),
    from_email character varying(255),
    status character varying(30) DEFAULT 'draft'::character varying,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    recipient_count integer DEFAULT 0,
    audience_filter jsonb DEFAULT '{}'::jsonb,
    delivered integer DEFAULT 0,
    opened integer DEFAULT 0,
    clicked integer DEFAULT 0,
    bounced integer DEFAULT 0,
    unsubscribed integer DEFAULT 0,
    open_rate numeric(5,2),
    click_rate numeric(5,2),
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    body_design jsonb,
    brand_profile_id uuid,
    CONSTRAINT marketing_email_campaigns_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'scheduled'::character varying, 'sending'::character varying, 'sent'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: marketing_email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    category character varying(60) DEFAULT 'custom'::character varying,
    description text,
    theme character varying(60) NOT NULL,
    section_types text[] DEFAULT '{}'::text[],
    manifest_json jsonb NOT NULL,
    usage_count integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketing_glossary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_glossary (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    term character varying(255) NOT NULL,
    definition text NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketing_golden_examples; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_golden_examples (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    content_id text NOT NULL,
    content_text text NOT NULL,
    performance_metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    success_markers text[] DEFAULT '{}'::text[],
    segment text,
    channel text,
    embedding_stored boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE marketing_golden_examples; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketing_golden_examples IS 'High-performing content examples for marketing memory (typically written by Learner job)';


--
-- Name: marketing_landing_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_landing_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255),
    body_html text NOT NULL,
    body_design jsonb,
    status character varying(20) DEFAULT 'draft'::character varying,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT marketing_landing_pages_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying])::text[])))
);


--
-- Name: marketing_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    email character varying(255) NOT NULL,
    first_name character varying(255),
    last_name character varying(255),
    company_name character varying(255),
    job_title character varying(255),
    phone character varying(50),
    source character varying(100) NOT NULL,
    campaign_id uuid,
    content_id uuid,
    score integer DEFAULT 0,
    score_factors jsonb DEFAULT '{}'::jsonb,
    status character varying(30) DEFAULT 'new'::character varying,
    crm_contact_id uuid,
    crm_deal_id uuid,
    converted_at timestamp with time zone,
    converted_by uuid,
    utm_source character varying(255),
    utm_medium character varying(255),
    utm_campaign character varying(255),
    landing_page_url text,
    ip_country character varying(100),
    tags jsonb DEFAULT '[]'::jsonb,
    notes text,
    last_activity_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT marketing_leads_score_check CHECK (((score >= 0) AND (score <= 100))),
    CONSTRAINT marketing_leads_status_check CHECK (((status)::text = ANY ((ARRAY['new'::character varying, 'contacted'::character varying, 'nurturing'::character varying, 'qualified'::character varying, 'converted'::character varying, 'disqualified'::character varying, 'unresponsive'::character varying])::text[])))
);

ALTER TABLE ONLY public.marketing_leads FORCE ROW LEVEL SECURITY;


--
-- Name: marketing_popups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_popups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255),
    body_html text NOT NULL,
    body_design jsonb,
    status character varying(20) DEFAULT 'draft'::character varying,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT marketing_popups_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying])::text[])))
);


--
-- Name: marketing_product_truth; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_product_truth (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    feature_name character varying(255) NOT NULL,
    description text,
    status character varying(32) NOT NULL,
    announced boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT marketing_product_truth_status_check CHECK (((status)::text = ANY ((ARRAY['shipped'::character varying, 'beta'::character varying, 'internal_only'::character varying, 'coming_soon'::character varying, 'deprecated'::character varying])::text[])))
);


--
-- Name: TABLE marketing_product_truth; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketing_product_truth IS 'Feature registry for marketing context compiler (workspace_id = organization)';


--
-- Name: marketing_scoring_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_scoring_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    name character varying(255) NOT NULL,
    description text,
    signal character varying(100) NOT NULL,
    points integer NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.marketing_scoring_rules FORCE ROW LEVEL SECURITY;


--
-- Name: marketing_truth_blocked; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_truth_blocked (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    pattern_or_text text NOT NULL,
    reason text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketing_truth_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_truth_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    claim_text text NOT NULL,
    category character varying(100),
    proof_reference text,
    approved boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketing_truth_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_truth_features (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    key character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    status character varying(32) NOT NULL,
    announced boolean DEFAULT false,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT marketing_truth_features_status_check CHECK (((status)::text = ANY ((ARRAY['shipped'::character varying, 'internal_only'::character varying, 'beta'::character varying, 'coming_soon'::character varying, 'deprecated'::character varying])::text[])))
);


--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    user_id character varying(100) NOT NULL,
    emoji character varying(32) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    user_id character varying(100) NOT NULL,
    content text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    mentions jsonb DEFAULT '[]'::jsonb NOT NULL,
    xp_gained integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mileage_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mileage_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reimbursement_id uuid NOT NULL,
    origin_address text NOT NULL,
    destination_address text NOT NULL,
    distance_km numeric(10,2) NOT NULL,
    rate_per_km numeric(8,4) DEFAULT 0.67 NOT NULL,
    calculated_amount numeric(12,2) NOT NULL,
    route_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mp_marketing_triggers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mp_marketing_triggers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    trigger_type text NOT NULL,
    content_id uuid,
    batch_job_id uuid,
    compliance_scan_id uuid,
    points_earned integer NOT NULL,
    multiplier numeric(3,2) DEFAULT 1.0,
    details jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'pending'::text,
    credited_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mp_marketing_triggers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'credited'::text, 'expired'::text, 'cancelled'::text]))),
    CONSTRAINT mp_marketing_triggers_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['high_open_rate'::text, 'high_ctr'::text, 'high_conversion'::text, 'perfect_compliance'::text, 'batch_completion'::text, 'top_performer'::text, 'competitor_insight'::text, 'streak_bonus'::text])))
);


--
-- Name: mv_asset_summary; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_asset_summary AS
 SELECT ac.name AS category_name,
    (count(a.id))::integer AS total_assets,
    (count(a.id) FILTER (WHERE ((a.status)::text = 'assigned'::text)))::integer AS assigned,
    (count(a.id) FILTER (WHERE ((a.status)::text = 'available'::text)))::integer AS available,
    (count(a.id) FILTER (WHERE ((a.status)::text = 'in_maintenance'::text)))::integer AS in_maintenance,
    COALESCE(sum(a.purchase_cost_eur), (0)::numeric) AS total_purchase_value,
    COALESCE(sum(a.current_value), (0)::numeric) AS total_current_value,
    (count(a.id) FILTER (WHERE ((a.warranty_end < (CURRENT_DATE + '30 days'::interval)) AND (a.warranty_end >= CURRENT_DATE))))::integer AS warranty_expiring_30d
   FROM (public.asset_categories ac
     LEFT JOIN public.assets a ON ((a.category_id = ac.id)))
  GROUP BY ac.name
  WITH NO DATA;


--
-- Name: mv_contract_renewals; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_contract_renewals AS
 SELECT id AS contract_id,
    title,
    type,
    counterparty_name,
    total_value_eur,
    end_date,
    auto_renew,
    status,
    (end_date - CURRENT_DATE) AS days_until_expiry,
        CASE
            WHEN (end_date < CURRENT_DATE) THEN 'expired'::text
            WHEN (end_date < (CURRENT_DATE + '30 days'::interval)) THEN 'expiring_30d'::text
            WHEN (end_date < (CURRENT_DATE + '60 days'::interval)) THEN 'expiring_60d'::text
            WHEN (end_date < (CURRENT_DATE + '90 days'::interval)) THEN 'expiring_90d'::text
            ELSE 'active'::text
        END AS renewal_status
   FROM public.contracts c
  WHERE ((status)::text = ANY ((ARRAY['active'::character varying, 'expiring'::character varying])::text[]))
  ORDER BY end_date
  WITH NO DATA;


--
-- Name: support_customer_health; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_customer_health (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    crm_company_id uuid NOT NULL,
    health_score integer DEFAULT 100,
    open_ticket_count integer DEFAULT 0,
    avg_resolution_hours numeric(10,2),
    avg_csat numeric(3,2),
    repeat_issue_count integer DEFAULT 0,
    last_ticket_at timestamp with time zone,
    trend character varying(20) DEFAULT 'stable'::character varying,
    calculated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT support_customer_health_health_score_check CHECK (((health_score >= 0) AND (health_score <= 100))),
    CONSTRAINT support_customer_health_trend_check CHECK (((trend)::text = ANY ((ARRAY['improving'::character varying, 'stable'::character varying, 'declining'::character varying, 'critical'::character varying])::text[])))
);


--
-- Name: mv_customer_health; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_customer_health AS
 SELECT ch.crm_company_id,
    c.name AS company_name,
    ch.health_score,
    ch.open_ticket_count,
    ch.avg_resolution_hours,
    ch.avg_csat,
    ch.trend,
    ch.calculated_at
   FROM (public.support_customer_health ch
     JOIN public.crm_companies c ON ((c.id = ch.crm_company_id)))
  ORDER BY ch.health_score
  WITH NO DATA;


--
-- Name: mv_license_utilization; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_license_utilization AS
 SELECT id AS license_id,
    software_name,
    vendor,
    seats_purchased,
    seats_used,
        CASE
            WHEN (seats_purchased > 0) THEN round((((seats_used)::numeric / (seats_purchased)::numeric) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS utilization_percent,
    total_monthly_cost,
    expiry_date,
    auto_renew,
    status,
        CASE
            WHEN (expiry_date < CURRENT_DATE) THEN 'expired'::text
            WHEN (expiry_date < (CURRENT_DATE + '30 days'::interval)) THEN 'expiring_soon'::text
            ELSE 'active'::text
        END AS expiry_status,
        CASE
            WHEN ((seats_purchased > 0) AND (((seats_used)::numeric / (seats_purchased)::numeric) < 0.5)) THEN true
            ELSE false
        END AS is_underutilized
   FROM public.licenses l
  WITH NO DATA;


--
-- Name: mv_marketing_roi; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_marketing_roi AS
 SELECT c.id AS campaign_id,
    c.name,
    c.channel,
    c.status,
    c.budget_eur AS budget,
    c.actual_spend_eur AS spend,
    c.leads_generated,
        CASE
            WHEN ((c.leads_generated > 0) AND (c.actual_spend_eur > (0)::numeric)) THEN round((c.actual_spend_eur / (c.leads_generated)::numeric), 2)
            ELSE (0)::numeric
        END AS cost_per_lead,
    COALESCE(deal_stats.deal_count, (0)::bigint) AS deals_created,
    COALESCE(deal_stats.deal_value, (0)::numeric) AS deal_value,
        CASE
            WHEN ((c.actual_spend_eur > (0)::numeric) AND (COALESCE(deal_stats.deal_value, (0)::numeric) > (0)::numeric)) THEN round((deal_stats.deal_value / c.actual_spend_eur), 2)
            ELSE (0)::numeric
        END AS roi_multiplier,
    c.start_date,
    c.end_date
   FROM (public.marketing_campaigns c
     LEFT JOIN ( SELECT l.campaign_id,
            count(DISTINCT l.crm_deal_id) AS deal_count,
            COALESCE(sum(d.amount_eur), (0)::numeric) AS deal_value
           FROM (public.marketing_leads l
             JOIN public.crm_deals d ON ((d.id = l.crm_deal_id)))
          GROUP BY l.campaign_id) deal_stats ON ((deal_stats.campaign_id = c.id)))
  WITH NO DATA;


--
-- Name: mv_pipeline_summary; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_pipeline_summary AS
 SELECT d.pipeline_id,
    s.name AS stage_name,
    s."position" AS stage_position,
    s.color AS stage_color,
    s.is_won,
    s.is_lost,
    count(d.id) AS deal_count,
    COALESCE(sum(d.amount_eur), (0)::numeric) AS total_value,
    COALESCE(sum(((d.amount_eur * (d.probability)::numeric) / 100.0)), (0)::numeric) AS weighted_value,
    COALESCE(avg(d.amount_eur), (0)::numeric) AS avg_deal_size
   FROM (public.crm_deals d
     JOIN public.crm_deal_stages s ON ((s.id = d.stage_id)))
  WHERE ((d.actual_close_date IS NULL) OR (d.actual_close_date >= date_trunc('quarter'::text, (CURRENT_DATE)::timestamp with time zone)))
  GROUP BY d.pipeline_id, s.name, s."position", s.color, s.is_won, s.is_lost
  ORDER BY s."position"
  WITH NO DATA;


--
-- Name: recruitment_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recruitment_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    candidate_id uuid NOT NULL,
    stage character varying(30) DEFAULT 'applied'::character varying,
    match_score integer,
    match_details jsonb DEFAULT '{}'::jsonb,
    screened_method character varying(20),
    screened_at timestamp with time zone,
    cover_letter text,
    status character varying(20) DEFAULT 'active'::character varying,
    rejection_reason text,
    rejection_stage character varying(30),
    source character varying(100),
    applied_at timestamp with time zone DEFAULT now(),
    last_stage_change_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT recruitment_applications_screened_method_check CHECK (((screened_method)::text = ANY ((ARRAY['ai'::character varying, 'manual'::character varying])::text[]))),
    CONSTRAINT recruitment_applications_stage_check CHECK (((stage)::text = ANY ((ARRAY['applied'::character varying, 'screening'::character varying, 'phone_screen'::character varying, 'interview'::character varying, 'assessment'::character varying, 'final_interview'::character varying, 'offer'::character varying, 'hired'::character varying, 'rejected'::character varying, 'withdrawn'::character varying])::text[]))),
    CONSTRAINT recruitment_applications_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'hired'::character varying, 'rejected'::character varying, 'withdrawn'::character varying])::text[])))
);

ALTER TABLE ONLY public.recruitment_applications FORCE ROW LEVEL SECURITY;


--
-- Name: recruitment_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recruitment_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    title character varying(255) NOT NULL,
    department character varying(100),
    department_id uuid,
    location character varying(255),
    location_type character varying(30) DEFAULT 'hybrid'::character varying,
    employment_type character varying(30) DEFAULT 'full_time'::character varying,
    description text,
    description_html text,
    requirements jsonb DEFAULT '[]'::jsonb,
    nice_to_have jsonb DEFAULT '[]'::jsonb,
    salary_min numeric(12,2),
    salary_max numeric(12,2),
    salary_currency character varying(3) DEFAULT 'EUR'::character varying,
    status character varying(20) DEFAULT 'draft'::character varying,
    hiring_manager_id uuid,
    recruiter_id uuid,
    positions_count integer DEFAULT 1,
    positions_filled integer DEFAULT 0,
    published_at timestamp with time zone,
    closed_at timestamp with time zone,
    dora_description_generated boolean DEFAULT false,
    tags jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT recruitment_jobs_employment_type_check CHECK (((employment_type)::text = ANY ((ARRAY['full_time'::character varying, 'part_time'::character varying, 'contract'::character varying, 'internship'::character varying])::text[]))),
    CONSTRAINT recruitment_jobs_location_type_check CHECK (((location_type)::text = ANY ((ARRAY['remote'::character varying, 'hybrid'::character varying, 'onsite'::character varying])::text[]))),
    CONSTRAINT recruitment_jobs_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'open'::character varying, 'paused'::character varying, 'closed'::character varying, 'filled'::character varying])::text[])))
);

ALTER TABLE ONLY public.recruitment_jobs FORCE ROW LEVEL SECURITY;


--
-- Name: mv_recruitment_funnel; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_recruitment_funnel AS
 SELECT j.id AS job_id,
    j.title AS job_title,
    j.department,
    j.status AS job_status,
    count(a.id) AS total_applicants,
    count(a.id) FILTER (WHERE ((a.stage)::text = 'applied'::text)) AS applied,
    count(a.id) FILTER (WHERE ((a.stage)::text = 'screening'::text)) AS screening,
    count(a.id) FILTER (WHERE ((a.stage)::text = ANY ((ARRAY['phone_screen'::character varying, 'interview'::character varying, 'assessment'::character varying, 'final_interview'::character varying])::text[]))) AS interviewing,
    count(a.id) FILTER (WHERE ((a.stage)::text = 'offer'::text)) AS offer,
    count(a.id) FILTER (WHERE ((a.stage)::text = 'hired'::text)) AS hired,
    count(a.id) FILTER (WHERE ((a.status)::text = 'rejected'::text)) AS rejected,
    COALESCE(avg(a.match_score), (0)::numeric) AS avg_match_score,
    j.positions_count,
    j.positions_filled
   FROM (public.recruitment_jobs j
     LEFT JOIN public.recruitment_applications a ON ((a.job_id = j.id)))
  GROUP BY j.id, j.title, j.department, j.status, j.positions_count, j.positions_filled
  WITH NO DATA;


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_type character varying(100) NOT NULL,
    in_app boolean DEFAULT true,
    email boolean DEFAULT false,
    push boolean DEFAULT false
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type character varying(100) NOT NULL,
    title character varying(255) NOT NULL,
    message text,
    link character varying(500),
    module character varying(50),
    severity character varying(20) DEFAULT 'info'::character varying,
    is_read boolean DEFAULT false,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: okr_check_ins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.okr_check_ins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key_result_id uuid NOT NULL,
    user_id uuid NOT NULL,
    value numeric(15,2) NOT NULL,
    note text,
    confidence character varying(20),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT okr_check_ins_confidence_check CHECK (((confidence)::text = ANY ((ARRAY['high'::character varying, 'medium'::character varying, 'low'::character varying])::text[])))
);


--
-- Name: okr_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.okr_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    period_id uuid NOT NULL,
    parent_goal_id uuid,
    owner_id uuid NOT NULL,
    level character varying(20) NOT NULL,
    department_id character varying(100),
    title character varying(500) NOT NULL,
    description text,
    progress numeric(5,2) DEFAULT 0,
    status character varying(20) DEFAULT 'on_track'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    is_archived boolean DEFAULT false,
    last_check_in_at timestamp with time zone,
    CONSTRAINT okr_goals_level_check CHECK (((level)::text = ANY ((ARRAY['company'::character varying, 'department'::character varying, 'team'::character varying, 'individual'::character varying])::text[]))),
    CONSTRAINT okr_goals_progress_check CHECK (((progress >= (0)::numeric) AND (progress <= (100)::numeric))),
    CONSTRAINT okr_goals_status_check CHECK (((status)::text = ANY ((ARRAY['on_track'::character varying, 'at_risk'::character varying, 'behind'::character varying, 'completed'::character varying])::text[])))
);

ALTER TABLE ONLY public.okr_goals FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN okr_goals.is_archived; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.okr_goals.is_archived IS 'When true, excluded from dashboard / briefing aggregates';


--
-- Name: okr_key_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.okr_key_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_id uuid NOT NULL,
    title character varying(500) NOT NULL,
    metric_type character varying(20) DEFAULT 'number'::character varying,
    target_value numeric(15,2) NOT NULL,
    current_value numeric(15,2) DEFAULT 0,
    start_value numeric(15,2) DEFAULT 0,
    unit character varying(50),
    auto_source character varying(100),
    progress numeric(5,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    owner_id uuid,
    last_check_in_at timestamp with time zone,
    CONSTRAINT okr_key_results_metric_type_check CHECK (((metric_type)::text = ANY ((ARRAY['number'::character varying, 'percentage'::character varying, 'currency'::character varying, 'boolean'::character varying])::text[])))
);


--
-- Name: COLUMN okr_key_results.owner_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.okr_key_results.owner_id IS 'Denormalized from parent goal owner for briefing queries';


--
-- Name: COLUMN okr_key_results.last_check_in_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.okr_key_results.last_check_in_at IS 'Last okr_check_ins timestamp for this KR (maintained by app or triggers)';


--
-- Name: okr_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.okr_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    name character varying(100) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.okr_periods FORCE ROW LEVEL SECURITY;


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(100) NOT NULL,
    base_currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: password_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_policy (
    id integer DEFAULT 1 NOT NULL,
    min_length integer DEFAULT 8 NOT NULL,
    max_length integer DEFAULT 128 NOT NULL,
    require_uppercase boolean DEFAULT true NOT NULL,
    require_lowercase boolean DEFAULT true NOT NULL,
    require_numbers boolean DEFAULT true NOT NULL,
    require_special_chars boolean DEFAULT true NOT NULL,
    special_chars_allowed character varying(100) DEFAULT '!@#$%^&*()_+-=[]{}|;:,.<>?'::character varying NOT NULL,
    password_expiry_days integer DEFAULT 90 NOT NULL,
    password_history_count integer DEFAULT 5 NOT NULL,
    max_failed_attempts integer DEFAULT 5 NOT NULL,
    lockout_duration_minutes integer DEFAULT 30 NOT NULL,
    session_timeout_minutes integer DEFAULT 480 NOT NULL,
    max_concurrent_sessions integer DEFAULT 5 NOT NULL,
    require_2fa_for_admins boolean DEFAULT true NOT NULL,
    require_2fa_for_managers boolean DEFAULT false NOT NULL,
    require_2fa_for_all boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(20),
    CONSTRAINT password_policy_id_check CHECK ((id = 1))
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id character varying(20) NOT NULL,
    token_hash character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_ip inet
);


--
-- Name: pending_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_actions (
    token uuid NOT NULL,
    action_type text NOT NULL,
    payload jsonb NOT NULL,
    description text NOT NULL,
    display_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    editable_fields text[] DEFAULT '{}'::text[] NOT NULL,
    user_id uuid NOT NULL,
    origin_query text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    confirmed_payload jsonb,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    confirmed_at timestamp with time zone,
    executed_at timestamp with time zone,
    organization_id uuid,
    idempotency_key text,
    CONSTRAINT pending_actions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'expired'::text, 'executed'::text])))
);


--
-- Name: performance_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(100) NOT NULL,
    action character varying(100) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id character varying(255),
    before_value jsonb,
    after_value jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: performance_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    content_id uuid NOT NULL,
    channel text NOT NULL,
    subject_line text,
    open_rate numeric(5,4),
    click_through_rate numeric(5,4),
    conversion_rate numeric(5,4),
    unsubscribe_rate numeric(5,4),
    bounce_rate numeric(5,4),
    engagement_rate numeric(5,4),
    reach integer,
    impressions integer,
    tone_tags text[] DEFAULT '{}'::text[],
    visual_style text,
    theme_used text,
    section_count integer,
    hero_image_used boolean DEFAULT false,
    cta_variant text,
    subject_length integer,
    send_count integer DEFAULT 0,
    brand_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    campaign_period_start date,
    campaign_period_end date
);


--
-- Name: performance_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying(30) NOT NULL,
    entity_id character varying(255) NOT NULL,
    metric_date date NOT NULL,
    revenue numeric(15,2),
    sms_attempts bigint,
    sms_delivered bigint,
    sms_delivery_rate numeric(5,2),
    email_attempts bigint,
    email_delivered bigint,
    email_delivery_rate numeric(5,2),
    conversion_rate numeric(5,2),
    cost_per_sms numeric(8,6),
    custom_metrics jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: performance_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying(30) NOT NULL,
    entity_id character varying(255),
    period_type character varying(30) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    revenue_target numeric(15,2),
    sms_target bigint,
    email_target bigint,
    custom_targets jsonb,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: performance_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    employee_id character varying(100) NOT NULL,
    role_in_team character varying(30) DEFAULT 'member'::character varying NOT NULL,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: performance_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_code character varying(50) NOT NULL,
    team_name character varying(100) NOT NULL,
    description text,
    team_type character varying(50) DEFAULT 'sales'::character varying NOT NULL,
    team_lead_id character varying(100),
    metrics_config jsonb DEFAULT '{"sms": true, "revenue": true}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: platform_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id text NOT NULL,
    action text NOT NULL,
    resource_type text,
    resource_id text,
    details jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.platform_audit_log FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE platform_audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.platform_audit_log IS 'SOC 2 audit trail: AI tool execution, HITL approvals, auth events, data writes';


--
-- Name: project_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id character varying(100) NOT NULL,
    user_id character varying(100) NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now(),
    review_note text
);


--
-- Name: project_showcase; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_showcase (
    id character varying(100) DEFAULT (gen_random_uuid())::text NOT NULL,
    project_id character varying(100) NOT NULL,
    impact_summary text NOT NULL,
    impact_metrics jsonb DEFAULT '[]'::jsonb,
    testimonial text,
    cover_image character varying(500),
    screenshots jsonb DEFAULT '[]'::jsonb,
    is_featured boolean DEFAULT false NOT NULL,
    featured_at timestamp with time zone,
    views integer DEFAULT 0 NOT NULL,
    likes integer DEFAULT 0 NOT NULL,
    liked_by jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    type character varying(50) DEFAULT 'product'::character varying NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    team jsonb DEFAULT '[]'::jsonb NOT NULL,
    capacity jsonb DEFAULT '{"max": 5, "current": 0}'::jsonb NOT NULL,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    due_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    recruitment_status character varying(50) DEFAULT 'closed'::character varying,
    recruitment_config jsonb DEFAULT '[]'::jsonb,
    xp_reward integer DEFAULT 0,
    is_featured boolean DEFAULT false,
    rejection_reason text,
    needs_help boolean DEFAULT false,
    impact_summary text,
    final_xp_awarded integer,
    tags text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: rag_outbox_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rag_outbox_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    op text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    CONSTRAINT rag_outbox_events_op_check CHECK ((op = ANY (ARRAY['upsert'::text, 'delete'::text])))
);


--
-- Name: recruitment_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recruitment_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    first_name character varying(255) NOT NULL,
    last_name character varying(255),
    email character varying(255) NOT NULL,
    phone character varying(50),
    linkedin_url text,
    portfolio_url text,
    current_company character varying(255),
    current_title character varying(255),
    location character varying(255),
    resume_url text,
    resume_file_name character varying(255),
    resume_text text,
    resume_parsed jsonb DEFAULT '{}'::jsonb,
    source character varying(100),
    referrer_id uuid,
    notes text,
    tags jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.recruitment_candidates FORCE ROW LEVEL SECURITY;


--
-- Name: recruitment_interviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recruitment_interviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    interviewer_id uuid NOT NULL,
    interview_type character varying(30) DEFAULT 'video'::character varying,
    scheduled_at timestamp with time zone NOT NULL,
    duration_minutes integer DEFAULT 60,
    location text,
    status character varying(20) DEFAULT 'scheduled'::character varying,
    notes text,
    rating integer,
    recommendation character varying(30),
    feedback text,
    skills_assessed jsonb DEFAULT '[]'::jsonb,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT recruitment_interviews_interview_type_check CHECK (((interview_type)::text = ANY ((ARRAY['phone'::character varying, 'video'::character varying, 'onsite'::character varying, 'technical'::character varying, 'panel'::character varying, 'culture_fit'::character varying])::text[]))),
    CONSTRAINT recruitment_interviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT recruitment_interviews_recommendation_check CHECK (((recommendation)::text = ANY ((ARRAY['strong_yes'::character varying, 'yes'::character varying, 'neutral'::character varying, 'no'::character varying, 'strong_no'::character varying])::text[]))),
    CONSTRAINT recruitment_interviews_status_check CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'completed'::character varying, 'cancelled'::character varying, 'no_show'::character varying])::text[])))
);

ALTER TABLE ONLY public.recruitment_interviews FORCE ROW LEVEL SECURITY;


--
-- Name: recruitment_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recruitment_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    salary numeric(12,2) NOT NULL,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    start_date date,
    offer_type character varying(30) DEFAULT 'full_time'::character varying,
    benefits text,
    notes text,
    status character varying(20) DEFAULT 'draft'::character varying,
    sent_at timestamp with time zone,
    responded_at timestamp with time zone,
    rejection_reason text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT recruitment_offers_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'sent'::character varying, 'accepted'::character varying, 'rejected'::character varying, 'expired'::character varying, 'withdrawn'::character varying])::text[])))
);


--
-- Name: recruitment_stage_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recruitment_stage_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    from_stage character varying(30),
    to_stage character varying(30) NOT NULL,
    moved_by uuid,
    notes text,
    moved_at timestamp with time zone DEFAULT now()
);


--
-- Name: reimbursement_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reimbursement_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reimbursement_id uuid NOT NULL,
    user_id uuid,
    action character varying(50) NOT NULL,
    action_details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reimbursement_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reimbursement_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reimbursement_id uuid NOT NULL,
    user_id uuid NOT NULL,
    comment_text text NOT NULL,
    is_internal boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reimbursement_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reimbursement_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reimbursement_id uuid NOT NULL,
    document_type character varying(30) NOT NULL,
    file_name character varying(255) NOT NULL,
    file_url text NOT NULL,
    file_size_bytes bigint,
    mime_type character varying(100),
    ocr_processed boolean DEFAULT false NOT NULL,
    ocr_vendor_name character varying(255),
    ocr_amount numeric(12,2),
    ocr_currency character(3),
    ocr_date date,
    ocr_confidence_score numeric(5,4),
    ocr_raw_response jsonb,
    signature_status character varying(30),
    verified_by uuid,
    verified_at timestamp with time zone,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reimbursement_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reimbursement_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    submitted_by uuid NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    category_id uuid NOT NULL,
    original_amount numeric(12,2) NOT NULL,
    original_currency character(3) NOT NULL,
    exchange_rate numeric(18,8),
    converted_amount numeric(12,2),
    status character varying(30) DEFAULT 'draft'::character varying NOT NULL,
    expense_date date NOT NULL,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    category_slug character varying(100),
    ai_confidence_score numeric(3,2),
    ai_risk_score numeric(3,2) DEFAULT 0,
    ai_auto_approved boolean DEFAULT false,
    ai_category_suggestion character varying(100),
    ai_review_notes text,
    approved_at timestamp with time zone,
    paid_at timestamp with time zone,
    budget_id uuid,
    created_by uuid,
    is_deleted boolean DEFAULT false,
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.reimbursement_requests FORCE ROW LEVEL SECURITY;


--
-- Name: reimbursement_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reimbursement_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    mileage_rate_per_km numeric(8,4) DEFAULT 0.67 NOT NULL,
    mileage_currency character(3) DEFAULT 'USD'::bpchar NOT NULL,
    meal_limit numeric(12,2),
    daily_limit numeric(12,2),
    monthly_limit numeric(12,2),
    require_signed_invoice_above numeric(12,2),
    auto_approve_below numeric(12,2),
    enable_ocr boolean DEFAULT true NOT NULL,
    enable_mileage boolean DEFAULT true NOT NULL,
    enable_currency_conversion boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.reimbursement_settings FORCE ROW LEVEL SECURITY;


--
-- Name: reimbursement_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reimbursement_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    auth_user_id character varying(100),
    email character varying(255) NOT NULL,
    full_name character varying(255) NOT NULL,
    role character varying(50) DEFAULT 'employee'::character varying NOT NULL,
    manager_id uuid,
    xp integer DEFAULT 0 NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'offline'::character varying NOT NULL,
    job_title character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    avatar text,
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.reimbursement_users FORCE ROW LEVEL SECURITY;


--
-- Name: review_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_actions (
    id text NOT NULL,
    "documentId" text NOT NULL,
    "reviewerId" text NOT NULL,
    action public."ReviewType" NOT NULL,
    comment text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id character varying(100) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    permissions jsonb DEFAULT '[]'::jsonb NOT NULL,
    role_key character varying(50),
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: search_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_logs (
    id text NOT NULL,
    "userId" text NOT NULL,
    query text NOT NULL,
    "resultCount" integer NOT NULL,
    "clickedDocId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id character varying(20) NOT NULL,
    token_hash character varying(255) NOT NULL,
    token_type character varying(20) DEFAULT 'access'::character varying NOT NULL,
    device_id character varying(255),
    device_name character varying(255),
    device_type character varying(20) DEFAULT 'unknown'::character varying NOT NULL,
    ip_address inet NOT NULL,
    location character varying(255),
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    revoked_at timestamp with time zone,
    revoked_reason text
);


--
-- Name: signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signatures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    signature_data text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_by uuid
);


--
-- Name: sprint_helpers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sprint_helpers (
    id character varying(100) DEFAULT (gen_random_uuid())::text NOT NULL,
    sprint_id character varying(100) NOT NULL,
    user_id character varying(100) NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    contribution text,
    xp_earned integer DEFAULT 0 NOT NULL
);


--
-- Name: sprint_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sprint_requests (
    id character varying(100) DEFAULT (gen_random_uuid())::text NOT NULL,
    project_id character varying(100) NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    skills_needed jsonb DEFAULT '[]'::jsonb NOT NULL,
    requester_id character varying(100) NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    xp_reward integer DEFAULT 100 NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    max_helpers integer DEFAULT 3 NOT NULL,
    resolved_at timestamp with time zone,
    resolution_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sprint_requests_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'IN_PROGRESS'::character varying, 'RESOLVED'::character varying, 'EXPIRED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: support_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    parent_id uuid,
    description text,
    auto_assign_to uuid,
    default_priority character varying(20) DEFAULT 'medium'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT support_categories_default_priority_check CHECK (((default_priority)::text = ANY ((ARRAY['critical'::character varying, 'high'::character varying, 'medium'::character varying, 'low'::character varying])::text[])))
);

ALTER TABLE ONLY public.support_categories FORCE ROW LEVEL SECURITY;


--
-- Name: support_csat_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_csat_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    rating integer NOT NULL,
    comment text,
    submitted_at timestamp with time zone DEFAULT now(),
    CONSTRAINT support_csat_ratings_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    author_id uuid,
    author_email character varying(255),
    author_name character varying(255),
    body text NOT NULL,
    body_html text,
    is_internal_note boolean DEFAULT false,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: support_sla_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_sla_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    priority character varying(20) NOT NULL,
    first_response_hours numeric(10,2) NOT NULL,
    resolution_hours numeric(10,2) NOT NULL,
    escalation_after_hours numeric(10,2),
    escalate_to_role character varying(50) DEFAULT 'manager'::character varying,
    business_hours_only boolean DEFAULT true,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT support_sla_policies_priority_check CHECK (((priority)::text = ANY ((ARRAY['critical'::character varying, 'high'::character varying, 'medium'::character varying, 'low'::character varying])::text[])))
);

ALTER TABLE ONLY public.support_sla_policies FORCE ROW LEVEL SECURITY;


--
-- Name: support_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    color character varying(7) DEFAULT '#6B7280'::character varying,
    usage_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.support_tags FORCE ROW LEVEL SECURITY;


--
-- Name: support_ticket_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    field_name character varying(50) NOT NULL,
    old_value text,
    new_value text,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now()
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    ticket_number bigint NOT NULL,
    subject character varying(500) NOT NULL,
    description text,
    status character varying(30) DEFAULT 'open'::character varying,
    priority character varying(20) DEFAULT 'medium'::character varying,
    category_id uuid,
    assignee_id uuid,
    reporter_email character varying(255) NOT NULL,
    reporter_name character varying(255),
    crm_contact_id uuid,
    crm_company_id uuid,
    sla_policy_id uuid,
    sla_first_response_due timestamp with time zone,
    sla_resolution_due timestamp with time zone,
    sla_first_response_at timestamp with time zone,
    sla_first_response_breached boolean DEFAULT false,
    sla_resolution_breached boolean DEFAULT false,
    first_response_time_hours numeric(10,2),
    resolution_time_hours numeric(10,2),
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    source character varying(50) DEFAULT 'web'::character varying,
    dora_category_suggestion character varying(255),
    dora_priority_suggestion character varying(20),
    dora_sentiment character varying(20),
    resolved_at timestamp with time zone,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT support_tickets_dora_priority_suggestion_check CHECK (((dora_priority_suggestion)::text = ANY ((ARRAY['critical'::character varying, 'high'::character varying, 'medium'::character varying, 'low'::character varying])::text[]))),
    CONSTRAINT support_tickets_dora_sentiment_check CHECK (((dora_sentiment)::text = ANY ((ARRAY['positive'::character varying, 'neutral'::character varying, 'negative'::character varying, 'urgent'::character varying])::text[]))),
    CONSTRAINT support_tickets_priority_check CHECK (((priority)::text = ANY ((ARRAY['critical'::character varying, 'high'::character varying, 'medium'::character varying, 'low'::character varying])::text[]))),
    CONSTRAINT support_tickets_source_check CHECK (((source)::text = ANY ((ARRAY['web'::character varying, 'email'::character varying, 'chat'::character varying, 'phone'::character varying, 'api'::character varying])::text[]))),
    CONSTRAINT support_tickets_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'awaiting_agent'::character varying, 'awaiting_customer'::character varying, 'in_progress'::character varying, 'on_hold'::character varying, 'resolved'::character varying, 'closed'::character varying])::text[])))
);

ALTER TABLE ONLY public.support_tickets FORCE ROW LEVEL SECURITY;


--
-- Name: support_tickets_ticket_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.support_tickets_ticket_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: support_tickets_ticket_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.support_tickets_ticket_number_seq OWNED BY public.support_tickets.ticket_number;


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    color text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id character varying(100) NOT NULL,
    project_id character varying(100) NOT NULL,
    title character varying(500) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status character varying(30) DEFAULT 'todo'::character varying NOT NULL,
    assignees jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    due_date timestamp with time zone,
    xp_reward integer DEFAULT 50 NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);


--
-- Name: team_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_access (
    id text NOT NULL,
    "teamId" text NOT NULL,
    "documentId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    color text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: time_billing_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_billing_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid,
    project_id character varying(100),
    client_id uuid,
    rate numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    effective_from date NOT NULL,
    effective_to date,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.time_billing_rates FORCE ROW LEVEL SECURITY;


--
-- Name: time_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    is_billable_default boolean DEFAULT false,
    hourly_rate numeric(10,2),
    color character varying(7) DEFAULT '#6B7280'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.time_categories FORCE ROW LEVEL SECURITY;


--
-- Name: time_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    project_id character varying(100),
    task_id character varying(100),
    category_id uuid,
    date date NOT NULL,
    hours numeric(5,2) NOT NULL,
    minutes integer GENERATED ALWAYS AS (((hours * (60)::numeric))::integer) STORED,
    description text,
    is_billable boolean DEFAULT false,
    billing_rate numeric(10,2),
    billable_amount numeric(12,2) GENERATED ALWAYS AS (
CASE
    WHEN is_billable THEN (hours * COALESCE(billing_rate, (0)::numeric))
    ELSE (0)::numeric
END) STORED,
    client_id uuid,
    source character varying(20) DEFAULT 'manual'::character varying,
    timer_id uuid,
    timesheet_id uuid,
    status character varying(20) DEFAULT 'draft'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT time_entries_hours_check CHECK (((hours > (0)::numeric) AND (hours <= (24)::numeric))),
    CONSTRAINT time_entries_source_check CHECK (((source)::text = ANY ((ARRAY['manual'::character varying, 'timer'::character varying, 'import'::character varying, 'suggestion'::character varying])::text[]))),
    CONSTRAINT time_entries_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);

ALTER TABLE ONLY public.time_entries FORCE ROW LEVEL SECURITY;


--
-- Name: time_timers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_timers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    project_id character varying(100),
    task_id character varying(100),
    category_id uuid,
    description text,
    is_billable boolean DEFAULT false,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    stopped_at timestamp with time zone,
    duration_seconds integer,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.time_timers FORCE ROW LEVEL SECURITY;


--
-- Name: time_timesheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_timesheets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    week_start_date date NOT NULL,
    week_end_date date NOT NULL,
    total_hours numeric(5,2) DEFAULT 0,
    billable_hours numeric(5,2) DEFAULT 0,
    non_billable_hours numeric(5,2) DEFAULT 0,
    billable_amount numeric(12,2) DEFAULT 0,
    status character varying(20) DEFAULT 'draft'::character varying,
    submitted_at timestamp with time zone,
    approved_at timestamp with time zone,
    approved_by uuid,
    rejected_at timestamp with time zone,
    rejected_by uuid,
    rejection_reason text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT time_timesheets_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);

ALTER TABLE ONLY public.time_timesheets FORCE ROW LEVEL SECURITY;


--
-- Name: user_badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_badges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(100) NOT NULL,
    badge_id character varying(100) NOT NULL,
    earned_at timestamp with time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    "fullName" text NOT NULL,
    "avatarUrl" text,
    role public."Role" DEFAULT 'VIEWER'::public."Role" NOT NULL,
    "teamId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webhook_id uuid NOT NULL,
    event character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    status_code integer,
    response_body text,
    response_time_ms integer,
    attempt integer DEFAULT 1,
    status character varying(20) DEFAULT 'pending'::character varying,
    error_message text,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT webhook_deliveries_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'success'::character varying, 'failed'::character varying, 'retrying'::character varying])::text[])))
);


--
-- Name: webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    name character varying(255) NOT NULL,
    url text NOT NULL,
    secret character varying(255) NOT NULL,
    events jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true,
    headers jsonb DEFAULT '{}'::jsonb,
    retry_count integer DEFAULT 3,
    last_triggered_at timestamp with time zone,
    last_status_code integer,
    failure_count integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.webhooks FORCE ROW LEVEL SECURITY;


--
-- Name: exchange_rates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates ALTER COLUMN id SET DEFAULT nextval('public.exchange_rates_id_seq'::regclass);


--
-- Name: finance_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_audit_log ALTER COLUMN id SET DEFAULT nextval('public.finance_audit_log_id_seq'::regclass);


--
-- Name: knowledge_ai_query_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_ai_query_logs ALTER COLUMN id SET DEFAULT nextval('public.knowledge_ai_query_logs_id_seq'::regclass);


--
-- Name: knowledge_ai_tool_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_ai_tool_logs ALTER COLUMN id SET DEFAULT nextval('public.knowledge_ai_tool_logs_id_seq'::regclass);


--
-- Name: support_tickets ticket_number; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets ALTER COLUMN ticket_number SET DEFAULT nextval('public.support_tickets_ticket_number_seq'::regclass);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: ai_claude_daily_usage ai_claude_daily_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_claude_daily_usage
    ADD CONSTRAINT ai_claude_daily_usage_pkey PRIMARY KEY (user_id, usage_date);


--
-- Name: ai_financial_action_log ai_financial_action_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_financial_action_log
    ADD CONSTRAINT ai_financial_action_log_pkey PRIMARY KEY (id);


--
-- Name: ai_hitl_idempotency ai_hitl_idempotency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_hitl_idempotency
    ADD CONSTRAINT ai_hitl_idempotency_pkey PRIMARY KEY (organization_id, auth_user_id, idempotency_key);


--
-- Name: ai_query_telemetry ai_query_telemetry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_query_telemetry
    ADD CONSTRAINT ai_query_telemetry_pkey PRIMARY KEY (id);


--
-- Name: ai_request_telemetry ai_request_telemetry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_request_telemetry
    ADD CONSTRAINT ai_request_telemetry_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: approval_steps approval_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_steps
    ADD CONSTRAINT approval_steps_pkey PRIMARY KEY (id);


--
-- Name: asset_assignments asset_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_assignments
    ADD CONSTRAINT asset_assignments_pkey PRIMARY KEY (id);


--
-- Name: asset_categories asset_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT asset_categories_pkey PRIMARY KEY (id);


--
-- Name: asset_maintenance asset_maintenance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_maintenance
    ADD CONSTRAINT asset_maintenance_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: auth_audit_log auth_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_audit_log
    ADD CONSTRAINT auth_audit_log_pkey PRIMARY KEY (id);


--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);


--
-- Name: badges badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_pkey PRIMARY KEY (id);


--
-- Name: bank_details bank_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_details
    ADD CONSTRAINT bank_details_pkey PRIMARY KEY (id);


--
-- Name: bank_details bank_details_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_details
    ADD CONSTRAINT bank_details_user_id_key UNIQUE (user_id);


--
-- Name: batch_jobs batch_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_jobs
    ADD CONSTRAINT batch_jobs_pkey PRIMARY KEY (id);


--
-- Name: bookmarks bookmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_pkey PRIMARY KEY (id);


--
-- Name: bounties bounties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounties
    ADD CONSTRAINT bounties_pkey PRIMARY KEY (id);


--
-- Name: brand_profiles brand_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_profiles
    ADD CONSTRAINT brand_profiles_pkey PRIMARY KEY (id);


--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);


--
-- Name: calibration_snapshots calibration_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_snapshots
    ADD CONSTRAINT calibration_snapshots_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: channel_members channel_members_channel_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_members
    ADD CONSTRAINT channel_members_channel_id_user_id_key UNIQUE (channel_id, user_id);


--
-- Name: channel_members channel_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_members
    ADD CONSTRAINT channel_members_pkey PRIMARY KEY (id);


--
-- Name: channels channels_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_name_key UNIQUE (name);


--
-- Name: channels channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_pkey PRIMARY KEY (id);


--
-- Name: chat_bookmarks chat_bookmarks_channel_id_user_id_folder_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_bookmarks
    ADD CONSTRAINT chat_bookmarks_channel_id_user_id_folder_name_key UNIQUE (channel_id, user_id, folder_name);


--
-- Name: chat_bookmarks chat_bookmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_bookmarks
    ADD CONSTRAINT chat_bookmarks_pkey PRIMARY KEY (id);


--
-- Name: chat_dora_suggestions chat_dora_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_dora_suggestions
    ADD CONSTRAINT chat_dora_suggestions_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: competitor_events competitor_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competitor_events
    ADD CONSTRAINT competitor_events_pkey PRIMARY KEY (id);


--
-- Name: competitors competitors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competitors
    ADD CONSTRAINT competitors_pkey PRIMARY KEY (id);


--
-- Name: compliance_scans compliance_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_scans
    ADD CONSTRAINT compliance_scans_pkey PRIMARY KEY (id);


--
-- Name: contract_obligations contract_obligations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_obligations
    ADD CONSTRAINT contract_obligations_pkey PRIMARY KEY (id);


--
-- Name: contract_reminders contract_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_reminders
    ADD CONSTRAINT contract_reminders_pkey PRIMARY KEY (id);


--
-- Name: contract_signatories contract_signatories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_signatories
    ADD CONSTRAINT contract_signatories_pkey PRIMARY KEY (id);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: crm_activities crm_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_pkey PRIMARY KEY (id);


--
-- Name: crm_companies crm_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_companies
    ADD CONSTRAINT crm_companies_pkey PRIMARY KEY (id);


--
-- Name: crm_contacts crm_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_pkey PRIMARY KEY (id);


--
-- Name: crm_deal_stage_history crm_deal_stage_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deal_stage_history
    ADD CONSTRAINT crm_deal_stage_history_pkey PRIMARY KEY (id);


--
-- Name: crm_deal_stages crm_deal_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deal_stages
    ADD CONSTRAINT crm_deal_stages_pkey PRIMARY KEY (id);


--
-- Name: crm_deals crm_deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_pkey PRIMARY KEY (id);


--
-- Name: crm_org_forecast_settings crm_org_forecast_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_org_forecast_settings
    ADD CONSTRAINT crm_org_forecast_settings_pkey PRIMARY KEY (organization_id);


--
-- Name: crm_pipelines crm_pipelines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_pipelines
    ADD CONSTRAINT crm_pipelines_pkey PRIMARY KEY (id);


--
-- Name: daily_briefings daily_briefings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_briefings
    ADD CONSTRAINT daily_briefings_pkey PRIMARY KEY (id);


--
-- Name: daily_briefings daily_briefings_user_id_briefing_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_briefings
    ADD CONSTRAINT daily_briefings_user_id_briefing_date_key UNIQUE (user_id, briefing_date);


--
-- Name: dashboard_snapshots dashboard_snapshots_organization_id_snapshot_date_period_ty_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_snapshots
    ADD CONSTRAINT dashboard_snapshots_organization_id_snapshot_date_period_ty_key UNIQUE (organization_id, snapshot_date, period_type);


--
-- Name: dashboard_snapshots dashboard_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_snapshots
    ADD CONSTRAINT dashboard_snapshots_pkey PRIMARY KEY (id);


--
-- Name: departments departments_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_code_key UNIQUE (code);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: document_chunks document_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (id);


--
-- Name: document_embeddings document_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_embeddings
    ADD CONSTRAINT document_embeddings_pkey PRIMARY KEY (id);


--
-- Name: document_links document_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_links
    ADD CONSTRAINT document_links_pkey PRIMARY KEY (id);


--
-- Name: document_summaries document_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_summaries
    ADD CONSTRAINT document_summaries_pkey PRIMARY KEY (document_id);


--
-- Name: document_tags document_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_tags
    ADD CONSTRAINT document_tags_pkey PRIMARY KEY ("documentId", "tagId");


--
-- Name: document_versions document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_pkey PRIMARY KEY (id);


--
-- Name: document_views document_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_views
    ADD CONSTRAINT document_views_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: dora_automation_log dora_automation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dora_automation_log
    ADD CONSTRAINT dora_automation_log_pkey PRIMARY KEY (id);


--
-- Name: dora_automation_policies dora_automation_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dora_automation_policies
    ADD CONSTRAINT dora_automation_policies_pkey PRIMARY KEY (id);


--
-- Name: dora_insights dora_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dora_insights
    ADD CONSTRAINT dora_insights_pkey PRIMARY KEY (id);


--
-- Name: dora_messages dora_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dora_messages
    ADD CONSTRAINT dora_messages_pkey PRIMARY KEY (id);


--
-- Name: dora_sessions dora_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dora_sessions
    ADD CONSTRAINT dora_sessions_pkey PRIMARY KEY (id);


--
-- Name: employee_auth employee_auth_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_auth
    ADD CONSTRAINT employee_auth_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: employee_auth employee_auth_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_auth
    ADD CONSTRAINT employee_auth_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: entity_embeddings entity_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_embeddings
    ADD CONSTRAINT entity_embeddings_pkey PRIMARY KEY (id);


--
-- Name: exchange_rates exchange_rates_currency_rate_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_currency_rate_date_key UNIQUE (currency, rate_date);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: expense_categories expense_categories_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: expense_categories expense_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_pkey PRIMARY KEY (id);


--
-- Name: finance_payments fin_payments_unique_num; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_payments
    ADD CONSTRAINT fin_payments_unique_num UNIQUE (organization_id, payment_number);


--
-- Name: finance_approval_policies finance_approval_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_approval_policies
    ADD CONSTRAINT finance_approval_policies_pkey PRIMARY KEY (id);


--
-- Name: finance_audit_log finance_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_audit_log
    ADD CONSTRAINT finance_audit_log_pkey PRIMARY KEY (id);


--
-- Name: finance_budget_allocations finance_budget_allocations_budget_id_category_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_budget_allocations
    ADD CONSTRAINT finance_budget_allocations_budget_id_category_slug_key UNIQUE (budget_id, category_slug);


--
-- Name: finance_budget_allocations finance_budget_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_budget_allocations
    ADD CONSTRAINT finance_budget_allocations_pkey PRIMARY KEY (id);


--
-- Name: finance_budget_snapshots finance_budget_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_budget_snapshots
    ADD CONSTRAINT finance_budget_snapshots_pkey PRIMARY KEY (id);


--
-- Name: finance_budgets finance_budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_budgets
    ADD CONSTRAINT finance_budgets_pkey PRIMARY KEY (id);


--
-- Name: finance_dora_decisions finance_dora_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_dora_decisions
    ADD CONSTRAINT finance_dora_decisions_pkey PRIMARY KEY (id);


--
-- Name: finance_dora_job_runs finance_dora_job_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_dora_job_runs
    ADD CONSTRAINT finance_dora_job_runs_pkey PRIMARY KEY (id);


--
-- Name: finance_expense_line_items finance_expense_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_expense_line_items
    ADD CONSTRAINT finance_expense_line_items_pkey PRIMARY KEY (id);


--
-- Name: finance_expense_policies finance_expense_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_expense_policies
    ADD CONSTRAINT finance_expense_policies_pkey PRIMARY KEY (id);


--
-- Name: finance_gl_accounts finance_gl_accounts_organization_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_gl_accounts
    ADD CONSTRAINT finance_gl_accounts_organization_id_code_key UNIQUE (organization_id, code);


--
-- Name: finance_gl_accounts finance_gl_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_gl_accounts
    ADD CONSTRAINT finance_gl_accounts_pkey PRIMARY KEY (id);


--
-- Name: finance_invoice_templates finance_invoice_templates_organization_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_invoice_templates
    ADD CONSTRAINT finance_invoice_templates_organization_id_slug_key UNIQUE (organization_id, slug);


--
-- Name: finance_invoice_templates finance_invoice_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_invoice_templates
    ADD CONSTRAINT finance_invoice_templates_pkey PRIMARY KEY (id);


--
-- Name: finance_journal_entries finance_journal_entries_organization_id_entry_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_journal_entries
    ADD CONSTRAINT finance_journal_entries_organization_id_entry_number_key UNIQUE (organization_id, entry_number);


--
-- Name: finance_journal_entries finance_journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_journal_entries
    ADD CONSTRAINT finance_journal_entries_pkey PRIMARY KEY (id);


--
-- Name: finance_journal_lines finance_journal_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_journal_lines
    ADD CONSTRAINT finance_journal_lines_pkey PRIMARY KEY (id);


--
-- Name: finance_marketing_journal_stub finance_marketing_journal_stub_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_marketing_journal_stub
    ADD CONSTRAINT finance_marketing_journal_stub_pkey PRIMARY KEY (id);


--
-- Name: finance_notification_preferences finance_notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_notification_preferences
    ADD CONSTRAINT finance_notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: finance_notification_preferences finance_notification_preferences_user_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_notification_preferences
    ADD CONSTRAINT finance_notification_preferences_user_id_organization_id_key UNIQUE (user_id, organization_id);


--
-- Name: finance_notifications finance_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_notifications
    ADD CONSTRAINT finance_notifications_pkey PRIMARY KEY (id);


--
-- Name: finance_payments finance_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_payments
    ADD CONSTRAINT finance_payments_pkey PRIMARY KEY (id);


--
-- Name: finance_period_close_tasks finance_period_close_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_period_close_tasks
    ADD CONSTRAINT finance_period_close_tasks_pkey PRIMARY KEY (id);


--
-- Name: finance_period_closes finance_period_closes_organization_id_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_period_closes
    ADD CONSTRAINT finance_period_closes_organization_id_period_key UNIQUE (organization_id, period);


--
-- Name: finance_period_closes finance_period_closes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_period_closes
    ADD CONSTRAINT finance_period_closes_pkey PRIMARY KEY (id);


--
-- Name: finance_settings finance_settings_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_settings
    ADD CONSTRAINT finance_settings_organization_id_key UNIQUE (organization_id);


--
-- Name: finance_settings finance_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_settings
    ADD CONSTRAINT finance_settings_pkey PRIMARY KEY (id);


--
-- Name: finance_tax_rates finance_tax_rates_organization_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_tax_rates
    ADD CONSTRAINT finance_tax_rates_organization_id_code_key UNIQUE (organization_id, code);


--
-- Name: finance_tax_rates finance_tax_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_tax_rates
    ADD CONSTRAINT finance_tax_rates_pkey PRIMARY KEY (id);


--
-- Name: finance_vendors finance_vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_vendors
    ADD CONSTRAINT finance_vendors_pkey PRIMARY KEY (id);


--
-- Name: game_scores game_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_scores
    ADD CONSTRAINT game_scores_pkey PRIMARY KEY (id);


--
-- Name: heart_burnout_assessments heart_burnout_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.heart_burnout_assessments
    ADD CONSTRAINT heart_burnout_assessments_pkey PRIMARY KEY (id);


--
-- Name: heart_onboarding_journey heart_onboarding_journey_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.heart_onboarding_journey
    ADD CONSTRAINT heart_onboarding_journey_pkey PRIMARY KEY (id);


--
-- Name: heart_onboarding_journey heart_onboarding_journey_user_id_milestone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.heart_onboarding_journey
    ADD CONSTRAINT heart_onboarding_journey_user_id_milestone_key UNIQUE (user_id, milestone);


--
-- Name: heart_pulse_responses heart_pulse_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.heart_pulse_responses
    ADD CONSTRAINT heart_pulse_responses_pkey PRIMARY KEY (id);


--
-- Name: heart_pulse_surveys heart_pulse_surveys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.heart_pulse_surveys
    ADD CONSTRAINT heart_pulse_surveys_pkey PRIMARY KEY (id);


--
-- Name: heart_sentiment_scores heart_sentiment_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.heart_sentiment_scores
    ADD CONSTRAINT heart_sentiment_scores_pkey PRIMARY KEY (id);


--
-- Name: heart_team_health heart_team_health_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.heart_team_health
    ADD CONSTRAINT heart_team_health_pkey PRIMARY KEY (id);


--
-- Name: heart_team_health heart_team_health_scope_type_scope_id_period_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.heart_team_health
    ADD CONSTRAINT heart_team_health_scope_type_scope_id_period_start_key UNIQUE (scope_type, scope_id, period_start);


--
-- Name: invoice_line_items invoice_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_employee_id_period_year_period_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_employee_id_period_year_period_month_key UNIQUE (employee_id, period_year, period_month);


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: kb_acknowledgements kb_acknowledgements_document_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_acknowledgements
    ADD CONSTRAINT kb_acknowledgements_document_id_user_id_key UNIQUE (document_id, user_id);


--
-- Name: kb_acknowledgements kb_acknowledgements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_acknowledgements
    ADD CONSTRAINT kb_acknowledgements_pkey PRIMARY KEY (id);


--
-- Name: kb_activities kb_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_activities
    ADD CONSTRAINT kb_activities_pkey PRIMARY KEY (id);


--
-- Name: kb_categories kb_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_categories
    ADD CONSTRAINT kb_categories_name_key UNIQUE (name);


--
-- Name: kb_categories kb_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_categories
    ADD CONSTRAINT kb_categories_pkey PRIMARY KEY (id);


--
-- Name: kb_categories kb_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_categories
    ADD CONSTRAINT kb_categories_slug_key UNIQUE (slug);


--
-- Name: kb_collection_documents kb_collection_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_collection_documents
    ADD CONSTRAINT kb_collection_documents_pkey PRIMARY KEY (collection_id, document_id);


--
-- Name: kb_collections kb_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_collections
    ADD CONSTRAINT kb_collections_pkey PRIMARY KEY (id);


--
-- Name: kb_collections kb_collections_share_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_collections
    ADD CONSTRAINT kb_collections_share_token_key UNIQUE (share_token);


--
-- Name: kb_collections kb_collections_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_collections
    ADD CONSTRAINT kb_collections_slug_key UNIQUE (slug);


--
-- Name: kb_document_tags kb_document_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_document_tags
    ADD CONSTRAINT kb_document_tags_pkey PRIMARY KEY (document_id, tag_id);


--
-- Name: kb_documents kb_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_documents
    ADD CONSTRAINT kb_documents_pkey PRIMARY KEY (id);


--
-- Name: kb_flags kb_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_flags
    ADD CONSTRAINT kb_flags_pkey PRIMARY KEY (id);


--
-- Name: kb_tags kb_tags_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_tags
    ADD CONSTRAINT kb_tags_name_key UNIQUE (name);


--
-- Name: kb_tags kb_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_tags
    ADD CONSTRAINT kb_tags_pkey PRIMARY KEY (id);


--
-- Name: kb_tags kb_tags_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_tags
    ADD CONSTRAINT kb_tags_slug_key UNIQUE (slug);


--
-- Name: kb_user_pins kb_user_pins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_user_pins
    ADD CONSTRAINT kb_user_pins_pkey PRIMARY KEY (id);


--
-- Name: kb_user_pins kb_user_pins_user_id_document_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_user_pins
    ADD CONSTRAINT kb_user_pins_user_id_document_id_key UNIQUE (user_id, document_id);


--
-- Name: knowledge_ai_feedback knowledge_ai_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_ai_feedback
    ADD CONSTRAINT knowledge_ai_feedback_pkey PRIMARY KEY (id);


--
-- Name: knowledge_ai_query_logs knowledge_ai_query_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_ai_query_logs
    ADD CONSTRAINT knowledge_ai_query_logs_pkey PRIMARY KEY (id);


--
-- Name: knowledge_ai_tool_logs knowledge_ai_tool_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_ai_tool_logs
    ADD CONSTRAINT knowledge_ai_tool_logs_pkey PRIMARY KEY (id);


--
-- Name: knowledge_attachments knowledge_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_attachments
    ADD CONSTRAINT knowledge_attachments_pkey PRIMARY KEY (id);


--
-- Name: knowledge_audit_log knowledge_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_audit_log
    ADD CONSTRAINT knowledge_audit_log_pkey PRIMARY KEY (id);


--
-- Name: knowledge_bookmarks knowledge_bookmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_bookmarks
    ADD CONSTRAINT knowledge_bookmarks_pkey PRIMARY KEY (id);


--
-- Name: knowledge_bookmarks knowledge_bookmarks_user_id_document_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_bookmarks
    ADD CONSTRAINT knowledge_bookmarks_user_id_document_id_key UNIQUE (user_id, document_id);


--
-- Name: knowledge_categories knowledge_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_categories
    ADD CONSTRAINT knowledge_categories_pkey PRIMARY KEY (id);


--
-- Name: knowledge_categories knowledge_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_categories
    ADD CONSTRAINT knowledge_categories_slug_key UNIQUE (slug);


--
-- Name: knowledge_collection_documents knowledge_collection_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_collection_documents
    ADD CONSTRAINT knowledge_collection_documents_pkey PRIMARY KEY (collection_id, document_id);


--
-- Name: knowledge_collections knowledge_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_collections
    ADD CONSTRAINT knowledge_collections_pkey PRIMARY KEY (id);


--
-- Name: knowledge_comments knowledge_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_comments
    ADD CONSTRAINT knowledge_comments_pkey PRIMARY KEY (id);


--
-- Name: knowledge_content_flags knowledge_content_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_content_flags
    ADD CONSTRAINT knowledge_content_flags_pkey PRIMARY KEY (id);


--
-- Name: knowledge_document_links knowledge_document_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_links
    ADD CONSTRAINT knowledge_document_links_pkey PRIMARY KEY (id);


--
-- Name: knowledge_document_links knowledge_document_links_source_id_target_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_links
    ADD CONSTRAINT knowledge_document_links_source_id_target_id_key UNIQUE (source_id, target_id);


--
-- Name: knowledge_document_tags knowledge_document_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_tags
    ADD CONSTRAINT knowledge_document_tags_pkey PRIMARY KEY (document_id, tag_id);


--
-- Name: knowledge_document_versions knowledge_document_versions_document_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_versions
    ADD CONSTRAINT knowledge_document_versions_document_id_version_number_key UNIQUE (document_id, version_number);


--
-- Name: knowledge_document_versions knowledge_document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_versions
    ADD CONSTRAINT knowledge_document_versions_pkey PRIMARY KEY (id);


--
-- Name: knowledge_document_views knowledge_document_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_views
    ADD CONSTRAINT knowledge_document_views_pkey PRIMARY KEY (id);


--
-- Name: knowledge_documents knowledge_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_pkey PRIMARY KEY (id);


--
-- Name: knowledge_documents knowledge_documents_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_slug_key UNIQUE (slug);


--
-- Name: knowledge_embeddings knowledge_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_embeddings
    ADD CONSTRAINT knowledge_embeddings_pkey PRIMARY KEY (id);


--
-- Name: knowledge_notifications knowledge_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_notifications
    ADD CONSTRAINT knowledge_notifications_pkey PRIMARY KEY (id);


--
-- Name: knowledge_review_actions knowledge_review_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_review_actions
    ADD CONSTRAINT knowledge_review_actions_pkey PRIMARY KEY (id);


--
-- Name: knowledge_search_logs knowledge_search_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_search_logs
    ADD CONSTRAINT knowledge_search_logs_pkey PRIMARY KEY (id);


--
-- Name: knowledge_tags knowledge_tags_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_tags
    ADD CONSTRAINT knowledge_tags_name_key UNIQUE (name);


--
-- Name: knowledge_tags knowledge_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_tags
    ADD CONSTRAINT knowledge_tags_pkey PRIMARY KEY (id);


--
-- Name: knowledge_tags knowledge_tags_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_tags
    ADD CONSTRAINT knowledge_tags_slug_key UNIQUE (slug);


--
-- Name: knowledge_team_access knowledge_team_access_document_id_team_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_team_access
    ADD CONSTRAINT knowledge_team_access_document_id_team_id_key UNIQUE (document_id, team_id);


--
-- Name: knowledge_team_access knowledge_team_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_team_access
    ADD CONSTRAINT knowledge_team_access_pkey PRIMARY KEY (id);


--
-- Name: knowledge_team_members knowledge_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_team_members
    ADD CONSTRAINT knowledge_team_members_pkey PRIMARY KEY (id);


--
-- Name: knowledge_team_members knowledge_team_members_team_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_team_members
    ADD CONSTRAINT knowledge_team_members_team_id_user_id_key UNIQUE (team_id, user_id);


--
-- Name: knowledge_teams knowledge_teams_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_teams
    ADD CONSTRAINT knowledge_teams_name_key UNIQUE (name);


--
-- Name: knowledge_teams knowledge_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_teams
    ADD CONSTRAINT knowledge_teams_pkey PRIMARY KEY (id);


--
-- Name: knowledge_user_roles knowledge_user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_user_roles
    ADD CONSTRAINT knowledge_user_roles_pkey PRIMARY KEY (id);


--
-- Name: knowledge_user_roles knowledge_user_roles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_user_roles
    ADD CONSTRAINT knowledge_user_roles_user_id_key UNIQUE (user_id);


--
-- Name: license_seats license_seats_license_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_seats
    ADD CONSTRAINT license_seats_license_id_user_id_key UNIQUE (license_id, user_id);


--
-- Name: license_seats license_seats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_seats
    ADD CONSTRAINT license_seats_pkey PRIMARY KEY (id);


--
-- Name: licenses licenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_pkey PRIMARY KEY (id);


--
-- Name: marketing_approval_queue marketing_approval_queue_organization_id_content_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_approval_queue
    ADD CONSTRAINT marketing_approval_queue_organization_id_content_id_key UNIQUE (organization_id, content_id);


--
-- Name: marketing_approval_queue marketing_approval_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_approval_queue
    ADD CONSTRAINT marketing_approval_queue_pkey PRIMARY KEY (id);


--
-- Name: marketing_approved_claims marketing_approved_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_approved_claims
    ADD CONSTRAINT marketing_approved_claims_pkey PRIMARY KEY (id);


--
-- Name: marketing_automation_runs marketing_automation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_automation_runs
    ADD CONSTRAINT marketing_automation_runs_pkey PRIMARY KEY (id);


--
-- Name: marketing_automation_triggers marketing_automation_triggers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_automation_triggers
    ADD CONSTRAINT marketing_automation_triggers_pkey PRIMARY KEY (id);


--
-- Name: marketing_automations marketing_automations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_automations
    ADD CONSTRAINT marketing_automations_pkey PRIMARY KEY (id);


--
-- Name: marketing_blocked_claims marketing_blocked_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_blocked_claims
    ADD CONSTRAINT marketing_blocked_claims_pkey PRIMARY KEY (id);


--
-- Name: marketing_brand_examples marketing_brand_examples_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_brand_examples
    ADD CONSTRAINT marketing_brand_examples_pkey PRIMARY KEY (id);


--
-- Name: marketing_brand_profile marketing_brand_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_brand_profile
    ADD CONSTRAINT marketing_brand_profile_pkey PRIMARY KEY (organization_id);


--
-- Name: marketing_brand_profiles marketing_brand_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_brand_profiles
    ADD CONSTRAINT marketing_brand_profiles_pkey PRIMARY KEY (id);


--
-- Name: marketing_brand_profiles marketing_brand_profiles_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_brand_profiles
    ADD CONSTRAINT marketing_brand_profiles_workspace_id_key UNIQUE (workspace_id);


--
-- Name: marketing_brand_voice_proposals marketing_brand_voice_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_brand_voice_proposals
    ADD CONSTRAINT marketing_brand_voice_proposals_pkey PRIMARY KEY (id);


--
-- Name: marketing_budget_allocations marketing_budget_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_budget_allocations
    ADD CONSTRAINT marketing_budget_allocations_pkey PRIMARY KEY (id);


--
-- Name: marketing_budget_allocations marketing_budget_allocations_workspace_id_campaign_id_chann_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_budget_allocations
    ADD CONSTRAINT marketing_budget_allocations_workspace_id_campaign_id_chann_key UNIQUE (workspace_id, campaign_id, channel);


--
-- Name: marketing_campaign_spend marketing_campaign_spend_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_campaign_spend
    ADD CONSTRAINT marketing_campaign_spend_pkey PRIMARY KEY (id);


--
-- Name: marketing_campaigns marketing_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_pkey PRIMARY KEY (id);


--
-- Name: marketing_competitor_map marketing_competitor_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_competitor_map
    ADD CONSTRAINT marketing_competitor_map_pkey PRIMARY KEY (id);


--
-- Name: marketing_competitor_points marketing_competitor_points_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_competitor_points
    ADD CONSTRAINT marketing_competitor_points_pkey PRIMARY KEY (id);


--
-- Name: marketing_content_calendar marketing_content_calendar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_content_calendar
    ADD CONSTRAINT marketing_content_calendar_pkey PRIMARY KEY (id);


--
-- Name: marketing_content_calendar marketing_content_calendar_workspace_id_content_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_content_calendar
    ADD CONSTRAINT marketing_content_calendar_workspace_id_content_id_key UNIQUE (workspace_id, content_id);


--
-- Name: marketing_content marketing_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_content
    ADD CONSTRAINT marketing_content_pkey PRIMARY KEY (id);


--
-- Name: marketing_documents marketing_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_documents
    ADD CONSTRAINT marketing_documents_pkey PRIMARY KEY (id);


--
-- Name: marketing_email_campaigns marketing_email_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_email_campaigns
    ADD CONSTRAINT marketing_email_campaigns_pkey PRIMARY KEY (id);


--
-- Name: marketing_email_templates marketing_email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_email_templates
    ADD CONSTRAINT marketing_email_templates_pkey PRIMARY KEY (id);


--
-- Name: marketing_glossary marketing_glossary_organization_id_term_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_glossary
    ADD CONSTRAINT marketing_glossary_organization_id_term_key UNIQUE (organization_id, term);


--
-- Name: marketing_glossary marketing_glossary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_glossary
    ADD CONSTRAINT marketing_glossary_pkey PRIMARY KEY (id);


--
-- Name: marketing_golden_examples marketing_golden_examples_organization_id_content_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_golden_examples
    ADD CONSTRAINT marketing_golden_examples_organization_id_content_id_key UNIQUE (organization_id, content_id);


--
-- Name: marketing_golden_examples marketing_golden_examples_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_golden_examples
    ADD CONSTRAINT marketing_golden_examples_pkey PRIMARY KEY (id);


--
-- Name: marketing_landing_pages marketing_landing_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_landing_pages
    ADD CONSTRAINT marketing_landing_pages_pkey PRIMARY KEY (id);


--
-- Name: marketing_leads marketing_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_leads
    ADD CONSTRAINT marketing_leads_pkey PRIMARY KEY (id);


--
-- Name: marketing_popups marketing_popups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_popups
    ADD CONSTRAINT marketing_popups_pkey PRIMARY KEY (id);


--
-- Name: marketing_product_truth marketing_product_truth_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_product_truth
    ADD CONSTRAINT marketing_product_truth_pkey PRIMARY KEY (id);


--
-- Name: marketing_scoring_rules marketing_scoring_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_scoring_rules
    ADD CONSTRAINT marketing_scoring_rules_pkey PRIMARY KEY (id);


--
-- Name: marketing_truth_blocked marketing_truth_blocked_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_truth_blocked
    ADD CONSTRAINT marketing_truth_blocked_pkey PRIMARY KEY (id);


--
-- Name: marketing_truth_claims marketing_truth_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_truth_claims
    ADD CONSTRAINT marketing_truth_claims_pkey PRIMARY KEY (id);


--
-- Name: marketing_truth_features marketing_truth_features_organization_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_truth_features
    ADD CONSTRAINT marketing_truth_features_organization_id_key_key UNIQUE (organization_id, key);


--
-- Name: marketing_truth_features marketing_truth_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_truth_features
    ADD CONSTRAINT marketing_truth_features_pkey PRIMARY KEY (id);


--
-- Name: message_reactions message_reactions_message_id_user_id_emoji_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (message_id, user_id, emoji);


--
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: mileage_claims mileage_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mileage_claims
    ADD CONSTRAINT mileage_claims_pkey PRIMARY KEY (id);


--
-- Name: mp_marketing_triggers mp_marketing_triggers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mp_marketing_triggers
    ADD CONSTRAINT mp_marketing_triggers_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_user_id_event_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_event_type_key UNIQUE (user_id, event_type);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: okr_check_ins okr_check_ins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.okr_check_ins
    ADD CONSTRAINT okr_check_ins_pkey PRIMARY KEY (id);


--
-- Name: okr_goals okr_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.okr_goals
    ADD CONSTRAINT okr_goals_pkey PRIMARY KEY (id);


--
-- Name: okr_key_results okr_key_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.okr_key_results
    ADD CONSTRAINT okr_key_results_pkey PRIMARY KEY (id);


--
-- Name: okr_periods okr_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.okr_periods
    ADD CONSTRAINT okr_periods_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: password_policy password_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_policy
    ADD CONSTRAINT password_policy_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: pending_actions pending_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_actions
    ADD CONSTRAINT pending_actions_pkey PRIMARY KEY (token);


--
-- Name: performance_audit_log performance_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_audit_log
    ADD CONSTRAINT performance_audit_log_pkey PRIMARY KEY (id);


--
-- Name: performance_feedback performance_feedback_organization_id_content_id_channel_rec_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_feedback
    ADD CONSTRAINT performance_feedback_organization_id_content_id_channel_rec_key UNIQUE (organization_id, content_id, channel, recorded_at);


--
-- Name: performance_feedback performance_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_feedback
    ADD CONSTRAINT performance_feedback_pkey PRIMARY KEY (id);


--
-- Name: performance_metrics performance_metrics_entity_type_entity_id_metric_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_metrics
    ADD CONSTRAINT performance_metrics_entity_type_entity_id_metric_date_key UNIQUE (entity_type, entity_id, metric_date);


--
-- Name: performance_metrics performance_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_metrics
    ADD CONSTRAINT performance_metrics_pkey PRIMARY KEY (id);


--
-- Name: performance_targets performance_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_targets
    ADD CONSTRAINT performance_targets_pkey PRIMARY KEY (id);


--
-- Name: performance_team_members performance_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_team_members
    ADD CONSTRAINT performance_team_members_pkey PRIMARY KEY (id);


--
-- Name: performance_team_members performance_team_members_team_id_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_team_members
    ADD CONSTRAINT performance_team_members_team_id_employee_id_key UNIQUE (team_id, employee_id);


--
-- Name: performance_teams performance_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_teams
    ADD CONSTRAINT performance_teams_pkey PRIMARY KEY (id);


--
-- Name: performance_teams performance_teams_team_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_teams
    ADD CONSTRAINT performance_teams_team_code_key UNIQUE (team_code);


--
-- Name: platform_audit_log platform_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_audit_log
    ADD CONSTRAINT platform_audit_log_pkey PRIMARY KEY (id);


--
-- Name: project_applications project_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_applications
    ADD CONSTRAINT project_applications_pkey PRIMARY KEY (id);


--
-- Name: project_applications project_applications_project_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_applications
    ADD CONSTRAINT project_applications_project_id_user_id_key UNIQUE (project_id, user_id);


--
-- Name: project_showcase project_showcase_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_showcase
    ADD CONSTRAINT project_showcase_pkey PRIMARY KEY (id);


--
-- Name: project_showcase project_showcase_project_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_showcase
    ADD CONSTRAINT project_showcase_project_id_key UNIQUE (project_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: rag_outbox_events rag_outbox_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rag_outbox_events
    ADD CONSTRAINT rag_outbox_events_pkey PRIMARY KEY (id);


--
-- Name: recruitment_applications recruitment_applications_job_id_candidate_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_applications
    ADD CONSTRAINT recruitment_applications_job_id_candidate_id_key UNIQUE (job_id, candidate_id);


--
-- Name: recruitment_applications recruitment_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_applications
    ADD CONSTRAINT recruitment_applications_pkey PRIMARY KEY (id);


--
-- Name: recruitment_candidates recruitment_candidates_organization_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_candidates
    ADD CONSTRAINT recruitment_candidates_organization_id_email_key UNIQUE (organization_id, email);


--
-- Name: recruitment_candidates recruitment_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_candidates
    ADD CONSTRAINT recruitment_candidates_pkey PRIMARY KEY (id);


--
-- Name: recruitment_interviews recruitment_interviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_interviews
    ADD CONSTRAINT recruitment_interviews_pkey PRIMARY KEY (id);


--
-- Name: recruitment_jobs recruitment_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_jobs
    ADD CONSTRAINT recruitment_jobs_pkey PRIMARY KEY (id);


--
-- Name: recruitment_offers recruitment_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_offers
    ADD CONSTRAINT recruitment_offers_pkey PRIMARY KEY (id);


--
-- Name: recruitment_stage_history recruitment_stage_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_stage_history
    ADD CONSTRAINT recruitment_stage_history_pkey PRIMARY KEY (id);


--
-- Name: reimbursement_activity_log reimbursement_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_activity_log
    ADD CONSTRAINT reimbursement_activity_log_pkey PRIMARY KEY (id);


--
-- Name: reimbursement_comments reimbursement_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_comments
    ADD CONSTRAINT reimbursement_comments_pkey PRIMARY KEY (id);


--
-- Name: reimbursement_documents reimbursement_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_documents
    ADD CONSTRAINT reimbursement_documents_pkey PRIMARY KEY (id);


--
-- Name: reimbursement_requests reimbursement_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_requests
    ADD CONSTRAINT reimbursement_requests_pkey PRIMARY KEY (id);


--
-- Name: reimbursement_settings reimbursement_settings_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_settings
    ADD CONSTRAINT reimbursement_settings_organization_id_key UNIQUE (organization_id);


--
-- Name: reimbursement_settings reimbursement_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_settings
    ADD CONSTRAINT reimbursement_settings_pkey PRIMARY KEY (id);


--
-- Name: reimbursement_users reimbursement_users_organization_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_users
    ADD CONSTRAINT reimbursement_users_organization_id_email_key UNIQUE (organization_id, email);


--
-- Name: reimbursement_users reimbursement_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_users
    ADD CONSTRAINT reimbursement_users_pkey PRIMARY KEY (id);


--
-- Name: review_actions review_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_actions
    ADD CONSTRAINT review_actions_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: search_logs search_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_logs
    ADD CONSTRAINT search_logs_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: signatures signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT signatures_pkey PRIMARY KEY (id);


--
-- Name: signatures signatures_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT signatures_user_id_key UNIQUE (user_id);


--
-- Name: sprint_helpers sprint_helpers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_helpers
    ADD CONSTRAINT sprint_helpers_pkey PRIMARY KEY (id);


--
-- Name: sprint_helpers sprint_helpers_sprint_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_helpers
    ADD CONSTRAINT sprint_helpers_sprint_id_user_id_key UNIQUE (sprint_id, user_id);


--
-- Name: sprint_requests sprint_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_requests
    ADD CONSTRAINT sprint_requests_pkey PRIMARY KEY (id);


--
-- Name: support_categories support_categories_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_categories
    ADD CONSTRAINT support_categories_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: support_categories support_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_categories
    ADD CONSTRAINT support_categories_pkey PRIMARY KEY (id);


--
-- Name: support_csat_ratings support_csat_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_csat_ratings
    ADD CONSTRAINT support_csat_ratings_pkey PRIMARY KEY (id);


--
-- Name: support_csat_ratings support_csat_ratings_ticket_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_csat_ratings
    ADD CONSTRAINT support_csat_ratings_ticket_id_key UNIQUE (ticket_id);


--
-- Name: support_customer_health support_customer_health_crm_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_customer_health
    ADD CONSTRAINT support_customer_health_crm_company_id_key UNIQUE (crm_company_id);


--
-- Name: support_customer_health support_customer_health_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_customer_health
    ADD CONSTRAINT support_customer_health_pkey PRIMARY KEY (id);


--
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- Name: support_sla_policies support_sla_policies_organization_id_priority_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_sla_policies
    ADD CONSTRAINT support_sla_policies_organization_id_priority_key UNIQUE (organization_id, priority);


--
-- Name: support_sla_policies support_sla_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_sla_policies
    ADD CONSTRAINT support_sla_policies_pkey PRIMARY KEY (id);


--
-- Name: support_tags support_tags_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tags
    ADD CONSTRAINT support_tags_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: support_tags support_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tags
    ADD CONSTRAINT support_tags_pkey PRIMARY KEY (id);


--
-- Name: support_ticket_history support_ticket_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_history
    ADD CONSTRAINT support_ticket_history_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: team_access team_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_access
    ADD CONSTRAINT team_access_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: time_billing_rates time_billing_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_billing_rates
    ADD CONSTRAINT time_billing_rates_pkey PRIMARY KEY (id);


--
-- Name: time_categories time_categories_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_categories
    ADD CONSTRAINT time_categories_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: time_categories time_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_categories
    ADD CONSTRAINT time_categories_pkey PRIMARY KEY (id);


--
-- Name: time_entries time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);


--
-- Name: time_timers time_timers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_timers
    ADD CONSTRAINT time_timers_pkey PRIMARY KEY (id);


--
-- Name: time_timesheets time_timesheets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_timesheets
    ADD CONSTRAINT time_timesheets_pkey PRIMARY KEY (id);


--
-- Name: time_timesheets time_timesheets_user_id_week_start_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_timesheets
    ADD CONSTRAINT time_timesheets_user_id_week_start_date_key UNIQUE (user_id, week_start_date);


--
-- Name: user_badges user_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_pkey PRIMARY KEY (id);


--
-- Name: user_badges user_badges_user_id_badge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_user_id_badge_id_key UNIQUE (user_id, badge_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webhook_deliveries webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);


--
-- Name: webhooks webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_entityType_entityId_idx" ON public.audit_logs USING btree ("entityType", "entityId");


--
-- Name: audit_logs_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_userId_createdAt_idx" ON public.audit_logs USING btree ("userId", "createdAt");


--
-- Name: bookmarks_userId_documentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "bookmarks_userId_documentId_key" ON public.bookmarks USING btree ("userId", "documentId");


--
-- Name: categories_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX categories_slug_key ON public.categories USING btree (slug);


--
-- Name: document_embeddings_documentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_embeddings_documentId_idx" ON public.document_embeddings USING btree ("documentId");


--
-- Name: document_links_sourceId_targetId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "document_links_sourceId_targetId_key" ON public.document_links USING btree ("sourceId", "targetId");


--
-- Name: document_versions_documentId_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "document_versions_documentId_version_key" ON public.document_versions USING btree ("documentId", version);


--
-- Name: document_views_documentId_viewedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_views_documentId_viewedAt_idx" ON public.document_views USING btree ("documentId", "viewedAt");


--
-- Name: documents_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX documents_slug_key ON public.documents USING btree (slug);


--
-- Name: idx_admin_audit_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_log_action ON public.admin_audit_log USING btree (action);


--
-- Name: idx_admin_audit_log_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_log_admin ON public.admin_audit_log USING btree (admin_id);


--
-- Name: idx_admin_audit_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_log_created ON public.admin_audit_log USING btree (created_at DESC);


--
-- Name: idx_ai_financial_log_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_financial_log_date ON public.ai_financial_action_log USING btree (created_at DESC);


--
-- Name: idx_ai_financial_log_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_financial_log_entity ON public.ai_financial_action_log USING btree (related_entity_type, related_entity_id);


--
-- Name: idx_ai_financial_log_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_financial_log_type ON public.ai_financial_action_log USING btree (action_type);


--
-- Name: idx_ai_query_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_query_logs_created ON public.knowledge_ai_query_logs USING btree (created_at DESC);


--
-- Name: idx_ai_query_logs_success; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_query_logs_success ON public.knowledge_ai_query_logs USING btree (success);


--
-- Name: idx_ai_query_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_query_logs_user ON public.knowledge_ai_query_logs USING btree (user_id);


--
-- Name: idx_ai_tool_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_tool_logs_created ON public.knowledge_ai_tool_logs USING btree (created_at DESC);


--
-- Name: idx_ai_tool_logs_query; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_tool_logs_query ON public.knowledge_ai_tool_logs USING btree (query_log_id);


--
-- Name: idx_ai_tool_logs_tool; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_tool_logs_tool ON public.knowledge_ai_tool_logs USING btree (tool_name);


--
-- Name: idx_approval_steps_assignee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_steps_assignee ON public.approval_steps USING btree (assigned_to, status);


--
-- Name: idx_approval_steps_reimbursement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_steps_reimbursement ON public.approval_steps USING btree (reimbursement_id);


--
-- Name: idx_approval_steps_unique_step; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_approval_steps_unique_step ON public.approval_steps USING btree (reimbursement_id, step_order);


--
-- Name: idx_asset_assign_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_assign_asset ON public.asset_assignments USING btree (asset_id);


--
-- Name: idx_asset_assign_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_assign_user ON public.asset_assignments USING btree (assigned_to);


--
-- Name: idx_asset_categories_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_categories_tenant ON public.asset_categories USING btree (tenant_id);


--
-- Name: idx_asset_maint_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_maint_asset ON public.asset_maintenance USING btree (asset_id);


--
-- Name: idx_assets_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_assigned ON public.assets USING btree (assigned_to);


--
-- Name: idx_assets_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_category ON public.assets USING btree (category_id);


--
-- Name: idx_assets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_status ON public.assets USING btree (status);


--
-- Name: idx_assets_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_tag ON public.assets USING btree (asset_tag);


--
-- Name: idx_assets_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_tenant ON public.assets USING btree (tenant_id);


--
-- Name: idx_assets_warranty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_warranty ON public.assets USING btree (warranty_end);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.platform_audit_log USING btree (action, created_at DESC);


--
-- Name: idx_audit_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_resource ON public.platform_audit_log USING btree (resource_type, resource_id);


--
-- Name: idx_audit_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_tenant_date ON public.platform_audit_log USING btree (tenant_id, created_at DESC);


--
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user ON public.platform_audit_log USING btree (user_id, created_at DESC);


--
-- Name: idx_automation_runs_automation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automation_runs_automation ON public.marketing_automation_runs USING btree (automation_id, created_at DESC);


--
-- Name: idx_batch_jobs_hero_content; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batch_jobs_hero_content ON public.batch_jobs USING btree (hero_content_id);


--
-- Name: idx_batch_jobs_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batch_jobs_org_created ON public.batch_jobs USING btree (organization_id, created_at DESC);


--
-- Name: idx_batch_jobs_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batch_jobs_org_status ON public.batch_jobs USING btree (organization_id, status) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: idx_bounties_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounties_category ON public.bounties USING btree (category);


--
-- Name: idx_bounties_claimed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounties_claimed_by ON public.bounties USING btree (claimed_by);


--
-- Name: idx_bounties_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounties_creator ON public.bounties USING btree (creator_id);


--
-- Name: idx_bounties_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounties_status ON public.bounties USING btree (status);


--
-- Name: idx_brand_profiles_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brand_profiles_org ON public.brand_profiles USING btree (organization_id, active, brand_name);


--
-- Name: idx_budgets_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budgets_department ON public.budgets USING btree (department);


--
-- Name: idx_budgets_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budgets_org ON public.budgets USING btree (organization_id);


--
-- Name: idx_budgets_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budgets_owner ON public.budgets USING btree (owner_id);


--
-- Name: idx_budgets_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budgets_period ON public.budgets USING btree (period_start, period_end);


--
-- Name: idx_budgets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budgets_status ON public.budgets USING btree (status);


--
-- Name: idx_budgets_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budgets_team ON public.budgets USING btree (team_id);


--
-- Name: idx_budgets_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budgets_tenant ON public.budgets USING btree (tenant_id);


--
-- Name: idx_calibration_snapshots_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calibration_snapshots_org_date ON public.calibration_snapshots USING btree (organization_id, snapshot_date DESC);


--
-- Name: idx_chat_bookmarks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_bookmarks_user ON public.chat_bookmarks USING btree (user_id);


--
-- Name: idx_chat_dora_suggestions_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_dora_suggestions_channel ON public.chat_dora_suggestions USING btree (channel_id, status);


--
-- Name: idx_competitor_events_comp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_competitor_events_comp ON public.competitor_events USING btree (competitor_id, discovered_at DESC);


--
-- Name: idx_competitor_events_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_competitor_events_hash ON public.competitor_events USING btree (organization_id, competitor_id, content_hash) WHERE (content_hash IS NOT NULL);


--
-- Name: idx_competitor_events_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_competitor_events_org ON public.competitor_events USING btree (organization_id, discovered_at DESC);


--
-- Name: idx_competitor_events_significant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_competitor_events_significant ON public.competitor_events USING btree (organization_id, significance) WHERE (significance = ANY (ARRAY['high'::text, 'critical'::text]));


--
-- Name: idx_competitor_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_competitor_events_type ON public.competitor_events USING btree (organization_id, event_type, discovered_at DESC);


--
-- Name: idx_competitors_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_competitors_org ON public.competitors USING btree (organization_id, active, name);


--
-- Name: idx_compliance_scans_content; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_scans_content ON public.compliance_scans USING btree (content_id, scanned_at DESC);


--
-- Name: idx_compliance_scans_failed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_scans_failed ON public.compliance_scans USING btree (organization_id, passed) WHERE (passed = false);


--
-- Name: idx_compliance_scans_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_scans_org ON public.compliance_scans USING btree (organization_id, scanned_at DESC);


--
-- Name: idx_contract_obligations_contract; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contract_obligations_contract ON public.contract_obligations USING btree (contract_id);


--
-- Name: idx_contract_obligations_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contract_obligations_due ON public.contract_obligations USING btree (due_date);


--
-- Name: idx_contract_reminders_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contract_reminders_date ON public.contract_reminders USING btree (reminder_date);


--
-- Name: idx_contract_reminders_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contract_reminders_sent ON public.contract_reminders USING btree (sent) WHERE (sent = false);


--
-- Name: idx_contract_sigs_contract; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contract_sigs_contract ON public.contract_signatories USING btree (contract_id);


--
-- Name: idx_contracts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_company ON public.contracts USING btree (crm_company_id);


--
-- Name: idx_contracts_counterparty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_counterparty ON public.contracts USING btree (counterparty_name);


--
-- Name: idx_contracts_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_end ON public.contracts USING btree (end_date);


--
-- Name: idx_contracts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_status ON public.contracts USING btree (status);


--
-- Name: idx_contracts_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_tenant ON public.contracts USING btree (tenant_id);


--
-- Name: idx_contracts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_type ON public.contracts USING btree (type);


--
-- Name: idx_contracts_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_vendor ON public.contracts USING btree (finance_vendor_id);


--
-- Name: idx_crm_activities_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_activities_contact ON public.crm_activities USING btree (contact_id);


--
-- Name: idx_crm_activities_deal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_activities_deal ON public.crm_activities USING btree (deal_id);


--
-- Name: idx_crm_activities_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_activities_tenant ON public.crm_activities USING btree (tenant_id);


--
-- Name: idx_crm_activities_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_activities_type ON public.crm_activities USING btree (type);


--
-- Name: idx_crm_activities_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_activities_user ON public.crm_activities USING btree (user_id);


--
-- Name: idx_crm_companies_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_companies_domain ON public.crm_companies USING btree (domain);


--
-- Name: idx_crm_companies_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_companies_name ON public.crm_companies USING btree (name);


--
-- Name: idx_crm_companies_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_companies_tenant ON public.crm_companies USING btree (tenant_id);


--
-- Name: idx_crm_contacts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_company ON public.crm_contacts USING btree (company_id);


--
-- Name: idx_crm_contacts_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_email ON public.crm_contacts USING btree (email);


--
-- Name: idx_crm_contacts_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_owner ON public.crm_contacts USING btree (owner_id);


--
-- Name: idx_crm_contacts_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_tenant ON public.crm_contacts USING btree (tenant_id);


--
-- Name: idx_crm_deal_stages_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_deal_stages_tenant ON public.crm_deal_stages USING btree (tenant_id);


--
-- Name: idx_crm_deals_close_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_deals_close_date ON public.crm_deals USING btree (expected_close_date);


--
-- Name: idx_crm_deals_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_deals_company ON public.crm_deals USING btree (company_id);


--
-- Name: idx_crm_deals_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_deals_owner ON public.crm_deals USING btree (owner_id);


--
-- Name: idx_crm_deals_owner_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_deals_owner_stage ON public.crm_deals USING btree (owner_id, stage_id);


--
-- Name: idx_crm_deals_pipeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_deals_pipeline ON public.crm_deals USING btree (pipeline_id);


--
-- Name: idx_crm_deals_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_deals_stage ON public.crm_deals USING btree (stage_id);


--
-- Name: idx_crm_deals_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_deals_tenant ON public.crm_deals USING btree (tenant_id);


--
-- Name: idx_crm_org_forecast_settings_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_org_forecast_settings_org ON public.crm_org_forecast_settings USING btree (organization_id);


--
-- Name: idx_crm_pipelines_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_pipelines_tenant ON public.crm_pipelines USING btree (tenant_id);


--
-- Name: idx_crm_stage_history_deal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_stage_history_deal ON public.crm_deal_stage_history USING btree (deal_id);


--
-- Name: idx_daily_briefings_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_briefings_user_date ON public.daily_briefings USING btree (user_id, briefing_date DESC);


--
-- Name: idx_daily_stats_day; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_daily_stats_day ON public.ai_daily_stats USING btree (day);


--
-- Name: idx_dashboard_snapshots_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dashboard_snapshots_org_date ON public.dashboard_snapshots USING btree (organization_id, snapshot_date DESC);


--
-- Name: idx_dc_content_tsv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_content_tsv ON public.document_chunks USING gin (content_tsv);


--
-- Name: idx_dc_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_document_id ON public.document_chunks USING btree (document_id);


--
-- Name: idx_dc_embedding_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_embedding_hnsw ON public.document_chunks USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_dc_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_metadata ON public.document_chunks USING gin (metadata);


--
-- Name: idx_departments_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departments_code ON public.departments USING btree (code);


--
-- Name: idx_dora_auto_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_auto_log_created ON public.dora_automation_log USING btree (created_at);


--
-- Name: idx_dora_auto_log_policy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_auto_log_policy ON public.dora_automation_log USING btree (policy_id);


--
-- Name: idx_dora_auto_log_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_auto_log_status ON public.dora_automation_log USING btree (execution_status);


--
-- Name: idx_dora_automation_policies_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_automation_policies_tenant ON public.dora_automation_policies USING btree (tenant_id);


--
-- Name: idx_dora_insights_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_insights_created ON public.dora_insights USING btree (created_at DESC);


--
-- Name: idx_dora_insights_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_insights_module ON public.dora_insights USING btree (module);


--
-- Name: idx_dora_insights_org_target_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_insights_org_target_unread ON public.dora_insights USING btree (organization_id, target_user_id, is_read) WHERE (is_dismissed = false);


--
-- Name: idx_dora_insights_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_insights_read ON public.dora_insights USING btree (is_read, is_dismissed);


--
-- Name: idx_dora_insights_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_insights_severity ON public.dora_insights USING btree (severity);


--
-- Name: idx_dora_insights_target_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_insights_target_user ON public.dora_insights USING btree (target_user_id);


--
-- Name: idx_dora_insights_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_insights_tenant ON public.dora_insights USING btree (tenant_id);


--
-- Name: idx_dora_insights_user_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_insights_user_read ON public.dora_insights USING btree (target_user_id, is_read, is_dismissed);


--
-- Name: idx_dora_job_runs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_job_runs_org ON public.finance_dora_job_runs USING btree (organization_id, job_name);


--
-- Name: idx_dora_messages_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_messages_session ON public.dora_messages USING btree (session_id, created_at);


--
-- Name: idx_dora_messages_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_messages_tenant ON public.dora_messages USING btree (tenant_id);


--
-- Name: idx_dora_policies_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_policies_active ON public.dora_automation_policies USING btree (is_active);


--
-- Name: idx_dora_policies_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_policies_creator ON public.dora_automation_policies USING btree (created_by);


--
-- Name: idx_dora_policies_trigger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_policies_trigger ON public.dora_automation_policies USING btree (trigger_event);


--
-- Name: idx_dora_sessions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_sessions_tenant ON public.dora_sessions USING btree (tenant_id);


--
-- Name: idx_dora_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dora_sessions_user ON public.dora_sessions USING btree (user_id, updated_at DESC);


--
-- Name: idx_employees_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_department ON public.employees USING btree (department_id);


--
-- Name: idx_employees_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_email ON public.employees USING btree (email);


--
-- Name: idx_employees_reports_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_reports_to ON public.employees USING btree (reports_to);


--
-- Name: idx_employees_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_username ON public.employees USING btree (username);


--
-- Name: idx_entity_embeddings_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_embeddings_hnsw ON public.entity_embeddings USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_entity_embeddings_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_embeddings_metadata ON public.entity_embeddings USING gin (metadata);


--
-- Name: idx_entity_embeddings_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_embeddings_source ON public.entity_embeddings USING btree (tenant_id, source_module, source_type);


--
-- Name: idx_exchange_rates_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exchange_rates_lookup ON public.exchange_rates USING btree (currency, rate_date);


--
-- Name: idx_expense_categories_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expense_categories_tenant ON public.expense_categories USING btree (tenant_id);


--
-- Name: idx_fin_approval_policies_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_approval_policies_org ON public.finance_approval_policies USING btree (organization_id);


--
-- Name: idx_fin_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_audit_entity ON public.finance_audit_log USING btree (entity_type, entity_id);


--
-- Name: idx_fin_audit_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_audit_org ON public.finance_audit_log USING btree (organization_id);


--
-- Name: idx_fin_audit_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_audit_time ON public.finance_audit_log USING btree (created_at DESC);


--
-- Name: idx_fin_budget_snap_budget; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_budget_snap_budget ON public.finance_budget_snapshots USING btree (budget_id);


--
-- Name: idx_fin_budget_snap_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_budget_snap_date ON public.finance_budget_snapshots USING btree (snapshot_date);


--
-- Name: idx_fin_dora_decisions_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_dora_decisions_entity ON public.finance_dora_decisions USING btree (entity_type, entity_id);


--
-- Name: idx_fin_dora_decisions_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_dora_decisions_org ON public.finance_dora_decisions USING btree (organization_id);


--
-- Name: idx_fin_dora_decisions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_dora_decisions_type ON public.finance_dora_decisions USING btree (decision_type);


--
-- Name: idx_fin_expense_policies_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_expense_policies_org ON public.finance_expense_policies USING btree (organization_id);


--
-- Name: idx_fin_line_items_expense; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_line_items_expense ON public.finance_expense_line_items USING btree (expense_id);


--
-- Name: idx_fin_mkt_journal_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_mkt_journal_campaign ON public.finance_marketing_journal_stub USING btree (campaign_id);


--
-- Name: idx_fin_mkt_journal_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_mkt_journal_ws ON public.finance_marketing_journal_stub USING btree (workspace_id);


--
-- Name: idx_fin_notif_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_notif_org ON public.finance_notifications USING btree (organization_id);


--
-- Name: idx_fin_notif_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_notif_recipient ON public.finance_notifications USING btree (recipient_id, is_read);


--
-- Name: idx_fin_notif_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_notif_tenant ON public.finance_notifications USING btree (tenant_id);


--
-- Name: idx_fin_payments_expense; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_payments_expense ON public.finance_payments USING btree (expense_id);


--
-- Name: idx_fin_payments_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_payments_invoice ON public.finance_payments USING btree (invoice_id);


--
-- Name: idx_fin_payments_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_payments_org ON public.finance_payments USING btree (organization_id);


--
-- Name: idx_fin_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_payments_status ON public.finance_payments USING btree (status);


--
-- Name: idx_fin_vendors_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_vendors_name ON public.finance_vendors USING btree (organization_id, name);


--
-- Name: idx_fin_vendors_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_vendors_org ON public.finance_vendors USING btree (organization_id);


--
-- Name: idx_finance_approval_policies_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_approval_policies_tenant ON public.finance_approval_policies USING btree (tenant_id);


--
-- Name: idx_finance_audit_log_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_audit_log_tenant ON public.finance_audit_log USING btree (tenant_id);


--
-- Name: idx_finance_budgets_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_budgets_department ON public.finance_budgets USING btree (department);


--
-- Name: idx_finance_budgets_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_budgets_org ON public.finance_budgets USING btree (organization_id);


--
-- Name: idx_finance_budgets_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_budgets_owner ON public.finance_budgets USING btree (owner_id);


--
-- Name: idx_finance_budgets_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_budgets_period ON public.finance_budgets USING btree (period_start, period_end);


--
-- Name: idx_finance_budgets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_budgets_status ON public.finance_budgets USING btree (status);


--
-- Name: idx_finance_budgets_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_budgets_team ON public.finance_budgets USING btree (team_id);


--
-- Name: idx_finance_budgets_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_budgets_tenant ON public.finance_budgets USING btree (tenant_id);


--
-- Name: idx_finance_dora_decisions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_dora_decisions_tenant ON public.finance_dora_decisions USING btree (tenant_id);


--
-- Name: idx_finance_dora_job_runs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_dora_job_runs_tenant ON public.finance_dora_job_runs USING btree (tenant_id);


--
-- Name: idx_finance_expense_policies_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_expense_policies_tenant ON public.finance_expense_policies USING btree (tenant_id);


--
-- Name: idx_finance_gl_accounts_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_gl_accounts_tenant ON public.finance_gl_accounts USING btree (tenant_id);


--
-- Name: idx_finance_invoice_templates_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_invoice_templates_tenant ON public.finance_invoice_templates USING btree (tenant_id);


--
-- Name: idx_finance_journal_entries_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_journal_entries_tenant ON public.finance_journal_entries USING btree (tenant_id);


--
-- Name: idx_finance_notification_preferences_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_notification_preferences_tenant ON public.finance_notification_preferences USING btree (tenant_id);


--
-- Name: idx_finance_notifications_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_notifications_tenant ON public.finance_notifications USING btree (tenant_id);


--
-- Name: idx_finance_payments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_payments_tenant ON public.finance_payments USING btree (tenant_id);


--
-- Name: idx_finance_period_closes_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_period_closes_tenant ON public.finance_period_closes USING btree (tenant_id);


--
-- Name: idx_finance_settings_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_settings_tenant ON public.finance_settings USING btree (tenant_id);


--
-- Name: idx_finance_tax_rates_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_tax_rates_tenant ON public.finance_tax_rates USING btree (tenant_id);


--
-- Name: idx_finance_vendors_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_vendors_tenant ON public.finance_vendors USING btree (tenant_id);


--
-- Name: idx_game_scores_top; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_scores_top ON public.game_scores USING btree (score DESC);


--
-- Name: idx_game_scores_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_scores_user ON public.game_scores USING btree (user_id);


--
-- Name: idx_heart_burnout_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_heart_burnout_date ON public.heart_burnout_assessments USING btree (assessed_at);


--
-- Name: idx_heart_burnout_risk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_heart_burnout_risk ON public.heart_burnout_assessments USING btree (risk_level);


--
-- Name: idx_heart_burnout_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_heart_burnout_user ON public.heart_burnout_assessments USING btree (user_id);


--
-- Name: idx_heart_onboarding_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_heart_onboarding_user ON public.heart_onboarding_journey USING btree (user_id);


--
-- Name: idx_heart_pulse_resp_survey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_heart_pulse_resp_survey ON public.heart_pulse_responses USING btree (survey_id);


--
-- Name: idx_heart_pulse_responses_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_heart_pulse_responses_tenant ON public.heart_pulse_responses USING btree (tenant_id);


--
-- Name: idx_heart_pulse_surveys_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_heart_pulse_surveys_tenant ON public.heart_pulse_surveys USING btree (tenant_id);


--
-- Name: idx_heart_sentiment_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_heart_sentiment_date ON public.heart_sentiment_scores USING btree (analyzed_at);


--
-- Name: idx_heart_sentiment_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_heart_sentiment_source ON public.heart_sentiment_scores USING btree (source);


--
-- Name: idx_heart_sentiment_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_heart_sentiment_user ON public.heart_sentiment_scores USING btree (user_id);


--
-- Name: idx_heart_sentiment_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_heart_sentiment_user_date ON public.heart_sentiment_scores USING btree (user_id, analyzed_at);


--
-- Name: idx_heart_team_health_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_heart_team_health_tenant ON public.heart_team_health USING btree (tenant_id);


--
-- Name: idx_heart_team_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_heart_team_period ON public.heart_team_health USING btree (period_start);


--
-- Name: idx_heart_team_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_heart_team_scope ON public.heart_team_health USING btree (scope_type, scope_id);


--
-- Name: idx_invoices_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_client ON public.invoices USING btree (client_id);


--
-- Name: idx_invoices_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_employee ON public.invoices USING btree (employee_id);


--
-- Name: idx_invoices_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_org ON public.invoices USING btree (organization_id);


--
-- Name: idx_invoices_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_period ON public.invoices USING btree (period_year, period_month);


--
-- Name: idx_invoices_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_tenant ON public.invoices USING btree (tenant_id);


--
-- Name: idx_invoices_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_vendor ON public.invoices USING btree (vendor_id);


--
-- Name: idx_journal_entries_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_org ON public.finance_journal_entries USING btree (organization_id);


--
-- Name: idx_journal_entries_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_period ON public.finance_journal_entries USING btree (period);


--
-- Name: idx_journal_entries_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_source ON public.finance_journal_entries USING btree (source_type, source_id);


--
-- Name: idx_journal_entries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_status ON public.finance_journal_entries USING btree (status);


--
-- Name: idx_journal_lines_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_lines_account ON public.finance_journal_lines USING btree (gl_account_id);


--
-- Name: idx_journal_lines_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_lines_entry ON public.finance_journal_lines USING btree (journal_entry_id);


--
-- Name: idx_kb_activities_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_activities_created ON public.kb_activities USING btree (created_at DESC);


--
-- Name: idx_kb_activities_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_activities_document ON public.kb_activities USING btree (document_id);


--
-- Name: idx_kb_flags_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_flags_document ON public.kb_flags USING btree (document_id);


--
-- Name: idx_kb_flags_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_flags_status ON public.kb_flags USING btree (status);


--
-- Name: idx_kh_attachments_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_attachments_doc ON public.knowledge_attachments USING btree (document_id);


--
-- Name: idx_kh_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_audit_entity ON public.knowledge_audit_log USING btree (entity_type, entity_id);


--
-- Name: idx_kh_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_audit_user ON public.knowledge_audit_log USING btree (user_id, created_at);


--
-- Name: idx_kh_categories_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_categories_parent ON public.knowledge_categories USING btree (parent_id);


--
-- Name: idx_kh_categories_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_categories_slug ON public.knowledge_categories USING btree (slug);


--
-- Name: idx_kh_comments_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_comments_doc ON public.knowledge_comments USING btree (document_id);


--
-- Name: idx_kh_comments_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_comments_parent ON public.knowledge_comments USING btree (parent_id);


--
-- Name: idx_kh_docs_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_docs_author ON public.knowledge_documents USING btree (author_id);


--
-- Name: idx_kh_docs_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_docs_category ON public.knowledge_documents USING btree (category_id);


--
-- Name: idx_kh_docs_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_docs_published ON public.knowledge_documents USING btree (published_at);


--
-- Name: idx_kh_docs_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_docs_search ON public.knowledge_documents USING gin (to_tsvector('english'::regconfig, COALESCE(plain_text, ''::text)));


--
-- Name: idx_kh_docs_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_docs_slug ON public.knowledge_documents USING btree (slug);


--
-- Name: idx_kh_docs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_docs_status ON public.knowledge_documents USING btree (status);


--
-- Name: idx_kh_docs_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_docs_title_trgm ON public.knowledge_documents USING gin (title public.gin_trgm_ops);


--
-- Name: idx_kh_docs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_docs_type ON public.knowledge_documents USING btree (document_type);


--
-- Name: idx_kh_docs_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_docs_updated ON public.knowledge_documents USING btree (updated_at);


--
-- Name: idx_kh_embeddings_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_embeddings_doc ON public.knowledge_embeddings USING btree (document_id);


--
-- Name: idx_kh_flags_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_flags_doc ON public.knowledge_content_flags USING btree (document_id);


--
-- Name: idx_kh_flags_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_flags_unresolved ON public.knowledge_content_flags USING btree (is_resolved) WHERE (is_resolved = false);


--
-- Name: idx_kh_links_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_links_source ON public.knowledge_document_links USING btree (source_id);


--
-- Name: idx_kh_links_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_links_target ON public.knowledge_document_links USING btree (target_id);


--
-- Name: idx_kh_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_notifications_user ON public.knowledge_notifications USING btree (user_id, is_read);


--
-- Name: idx_kh_reviews_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_reviews_doc ON public.knowledge_review_actions USING btree (document_id);


--
-- Name: idx_kh_search_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_search_date ON public.knowledge_search_logs USING btree (created_at);


--
-- Name: idx_kh_search_query; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_search_query ON public.knowledge_search_logs USING gin (query public.gin_trgm_ops);


--
-- Name: idx_kh_team_access_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_team_access_doc ON public.knowledge_team_access USING btree (document_id);


--
-- Name: idx_kh_team_access_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_team_access_team ON public.knowledge_team_access USING btree (team_id);


--
-- Name: idx_kh_versions_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_versions_doc ON public.knowledge_document_versions USING btree (document_id);


--
-- Name: idx_kh_views_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_views_date ON public.knowledge_document_views USING btree (viewed_at);


--
-- Name: idx_kh_views_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_views_doc ON public.knowledge_document_views USING btree (document_id);


--
-- Name: idx_kh_views_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kh_views_user ON public.knowledge_document_views USING btree (user_id);


--
-- Name: idx_knowledge_embeddings_chunk_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_embeddings_chunk_fts ON public.knowledge_embeddings USING gin (to_tsvector('english'::regconfig, COALESCE(chunk_text, ''::text)));


--
-- Name: idx_license_seats_license; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_license_seats_license ON public.license_seats USING btree (license_id);


--
-- Name: idx_license_seats_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_license_seats_user ON public.license_seats USING btree (user_id);


--
-- Name: idx_licenses_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_licenses_expiry ON public.licenses USING btree (expiry_date);


--
-- Name: idx_licenses_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_licenses_status ON public.licenses USING btree (status);


--
-- Name: idx_licenses_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_licenses_tenant ON public.licenses USING btree (tenant_id);


--
-- Name: idx_marketing_automations_org_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_automations_org_enabled ON public.marketing_automations USING btree (organization_id, enabled, trigger_type) WHERE (enabled = true);


--
-- Name: idx_marketing_campaigns_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_campaigns_brand ON public.marketing_campaigns USING btree (brand_profile_id) WHERE (brand_profile_id IS NOT NULL);


--
-- Name: idx_marketing_campaigns_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_campaigns_org_status ON public.marketing_campaigns USING btree (organization_id, status);


--
-- Name: idx_marketing_campaigns_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_campaigns_tenant ON public.marketing_campaigns USING btree (tenant_id);


--
-- Name: idx_marketing_content_batch_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_content_batch_job_id ON public.marketing_content USING btree (batch_job_id) WHERE (batch_job_id IS NOT NULL);


--
-- Name: idx_marketing_content_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_content_brand ON public.marketing_content USING btree (brand_profile_id) WHERE (brand_profile_id IS NOT NULL);


--
-- Name: idx_marketing_content_ig_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_content_ig_metadata ON public.marketing_content USING gin (image_generation_metadata);


--
-- Name: idx_marketing_content_org_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_content_org_status_created ON public.marketing_content USING btree (organization_id, status, created_at DESC);


--
-- Name: idx_marketing_content_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_content_parent ON public.marketing_content USING btree (parent_content_id) WHERE (parent_content_id IS NOT NULL);


--
-- Name: idx_marketing_content_pending_image; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_content_pending_image ON public.marketing_content USING btree (organization_id, channel) WHERE (((channel)::text = 'instagram'::text) AND (image_url IS NULL) AND ((status)::text <> 'archived'::text));


--
-- Name: idx_marketing_content_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_content_tenant ON public.marketing_content USING btree (tenant_id);


--
-- Name: idx_marketing_email_campaigns_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_email_campaigns_brand ON public.marketing_email_campaigns USING btree (brand_profile_id) WHERE (brand_profile_id IS NOT NULL);


--
-- Name: idx_marketing_leads_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_leads_org_created ON public.marketing_leads USING btree (organization_id, created_at DESC);


--
-- Name: idx_marketing_leads_status_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_leads_status_score ON public.marketing_leads USING btree (status, score);


--
-- Name: idx_marketing_leads_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_leads_tenant ON public.marketing_leads USING btree (tenant_id);


--
-- Name: idx_marketing_scoring_rules_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_scoring_rules_tenant ON public.marketing_scoring_rules USING btree (tenant_id);


--
-- Name: idx_message_reactions_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_reactions_message ON public.message_reactions USING btree (message_id);


--
-- Name: idx_mileage_claims_reimbursement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mileage_claims_reimbursement ON public.mileage_claims USING btree (reimbursement_id);


--
-- Name: idx_mkt_approval_content; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_approval_content ON public.marketing_approval_queue USING btree (content_id);


--
-- Name: idx_mkt_approval_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_approval_org_status ON public.marketing_approval_queue USING btree (organization_id, status);


--
-- Name: idx_mkt_approval_queue_org_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_approval_queue_org_status_created ON public.marketing_approval_queue USING btree (organization_id, status, created_at DESC);


--
-- Name: idx_mkt_approved_claims_claim_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_approved_claims_claim_trgm ON public.marketing_approved_claims USING gin (claim public.gin_trgm_ops);


--
-- Name: INDEX idx_mkt_approved_claims_claim_trgm; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_mkt_approved_claims_claim_trgm IS 'Trgm index for product_truth_lookup tool (claim)';


--
-- Name: idx_mkt_approved_claims_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_approved_claims_ws ON public.marketing_approved_claims USING btree (workspace_id);


--
-- Name: idx_mkt_auto_trig_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_auto_trig_enabled ON public.marketing_automation_triggers USING btree (organization_id, enabled);


--
-- Name: idx_mkt_auto_trig_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_auto_trig_org ON public.marketing_automation_triggers USING btree (organization_id);


--
-- Name: idx_mkt_blocked_claim_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_blocked_claim_trgm ON public.marketing_blocked_claims USING gin (blocked_claim public.gin_trgm_ops);


--
-- Name: idx_mkt_blocked_claims_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_blocked_claims_ws ON public.marketing_blocked_claims USING btree (workspace_id);


--
-- Name: idx_mkt_brand_examples_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_brand_examples_org ON public.marketing_brand_examples USING btree (organization_id);


--
-- Name: idx_mkt_brand_profiles_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_brand_profiles_ws ON public.marketing_brand_profiles USING btree (workspace_id);


--
-- Name: idx_mkt_brand_prop_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_brand_prop_org ON public.marketing_brand_voice_proposals USING btree (organization_id, status);


--
-- Name: idx_mkt_budget_alloc_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_budget_alloc_campaign ON public.marketing_budget_allocations USING btree (campaign_id);


--
-- Name: idx_mkt_budget_alloc_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_budget_alloc_ws ON public.marketing_budget_allocations USING btree (workspace_id);


--
-- Name: idx_mkt_campaigns_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_campaigns_channel ON public.marketing_campaigns USING btree (channel);


--
-- Name: idx_mkt_campaigns_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_campaigns_dates ON public.marketing_campaigns USING btree (start_date, end_date);


--
-- Name: idx_mkt_campaigns_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_campaigns_owner ON public.marketing_campaigns USING btree (owner_id);


--
-- Name: idx_mkt_campaigns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_campaigns_status ON public.marketing_campaigns USING btree (status);


--
-- Name: idx_mkt_comp_map_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_comp_map_ws ON public.marketing_competitor_map USING btree (workspace_id);


--
-- Name: idx_mkt_comp_points_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_comp_points_org ON public.marketing_competitor_points USING btree (organization_id);


--
-- Name: idx_mkt_competitor_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_competitor_name_trgm ON public.marketing_competitor_map USING gin (competitor_name public.gin_trgm_ops);


--
-- Name: idx_mkt_content_cal_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_content_cal_campaign ON public.marketing_content_calendar USING btree (campaign_id);


--
-- Name: idx_mkt_content_cal_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_content_cal_due ON public.marketing_content_calendar USING btree (status, scheduled_at) WHERE ((status)::text = ANY ((ARRAY['scheduled'::character varying, 'processing'::character varying])::text[]));


--
-- Name: idx_mkt_content_cal_sched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_content_cal_sched ON public.marketing_content_calendar USING btree (scheduled_at);


--
-- Name: idx_mkt_content_cal_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_content_cal_ws ON public.marketing_content_calendar USING btree (workspace_id);


--
-- Name: idx_mkt_content_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_content_campaign ON public.marketing_content USING btree (campaign_id);


--
-- Name: idx_mkt_content_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_content_date ON public.marketing_content USING btree (scheduled_date);


--
-- Name: idx_mkt_content_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_content_status ON public.marketing_content USING btree (status);


--
-- Name: idx_mkt_content_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_content_type ON public.marketing_content USING btree (content_type);


--
-- Name: idx_mkt_documents_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_documents_org ON public.marketing_documents USING btree (organization_id);


--
-- Name: idx_mkt_documents_org_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mkt_documents_org_slug ON public.marketing_documents USING btree (organization_id, slug) WHERE ((slug IS NOT NULL) AND (btrim((slug)::text) <> ''::text));


--
-- Name: idx_mkt_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_documents_status ON public.marketing_documents USING btree (status);


--
-- Name: idx_mkt_email_tpl_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_email_tpl_category ON public.marketing_email_templates USING btree (organization_id, category);


--
-- Name: idx_mkt_email_tpl_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_email_tpl_org ON public.marketing_email_templates USING btree (organization_id);


--
-- Name: idx_mkt_emails_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_emails_campaign ON public.marketing_email_campaigns USING btree (campaign_id);


--
-- Name: idx_mkt_emails_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_emails_status ON public.marketing_email_campaigns USING btree (status);


--
-- Name: idx_mkt_glossary_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_glossary_org ON public.marketing_glossary USING btree (organization_id);


--
-- Name: idx_mkt_golden_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_golden_created ON public.marketing_golden_examples USING btree (organization_id, created_at DESC);


--
-- Name: idx_mkt_golden_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_golden_org ON public.marketing_golden_examples USING btree (organization_id);


--
-- Name: idx_mkt_landing_pages_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_landing_pages_org ON public.marketing_landing_pages USING btree (organization_id);


--
-- Name: idx_mkt_landing_pages_org_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mkt_landing_pages_org_slug ON public.marketing_landing_pages USING btree (organization_id, slug) WHERE ((slug IS NOT NULL) AND (btrim((slug)::text) <> ''::text));


--
-- Name: idx_mkt_landing_pages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_landing_pages_status ON public.marketing_landing_pages USING btree (status);


--
-- Name: idx_mkt_leads_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_leads_campaign ON public.marketing_leads USING btree (campaign_id);


--
-- Name: idx_mkt_leads_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_leads_email ON public.marketing_leads USING btree (email);


--
-- Name: idx_mkt_leads_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_leads_score ON public.marketing_leads USING btree (score);


--
-- Name: idx_mkt_leads_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_leads_source ON public.marketing_leads USING btree (source);


--
-- Name: idx_mkt_leads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_leads_status ON public.marketing_leads USING btree (status);


--
-- Name: idx_mkt_popups_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_popups_org ON public.marketing_popups USING btree (organization_id);


--
-- Name: idx_mkt_popups_org_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mkt_popups_org_slug ON public.marketing_popups USING btree (organization_id, slug) WHERE ((slug IS NOT NULL) AND (btrim((slug)::text) <> ''::text));


--
-- Name: idx_mkt_popups_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_popups_status ON public.marketing_popups USING btree (status);


--
-- Name: idx_mkt_product_truth_desc_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_product_truth_desc_trgm ON public.marketing_product_truth USING gin (COALESCE(description, ''::text) public.gin_trgm_ops);


--
-- Name: idx_mkt_product_truth_feat_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_product_truth_feat_trgm ON public.marketing_product_truth USING gin (feature_name public.gin_trgm_ops);


--
-- Name: INDEX idx_mkt_product_truth_feat_trgm; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_mkt_product_truth_feat_trgm IS 'Trgm index for product_truth_lookup tool (feature_name)';


--
-- Name: idx_mkt_product_truth_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_product_truth_status ON public.marketing_product_truth USING btree (workspace_id, status);


--
-- Name: idx_mkt_product_truth_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_product_truth_ws ON public.marketing_product_truth USING btree (workspace_id);


--
-- Name: idx_mkt_scoring_signal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_scoring_signal ON public.marketing_scoring_rules USING btree (signal);


--
-- Name: idx_mkt_spend_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_spend_campaign ON public.marketing_campaign_spend USING btree (campaign_id);


--
-- Name: idx_mkt_truth_blocked_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_truth_blocked_org ON public.marketing_truth_blocked USING btree (organization_id);


--
-- Name: idx_mkt_truth_claims_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_truth_claims_org ON public.marketing_truth_claims USING btree (organization_id);


--
-- Name: idx_mkt_truth_features_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_truth_features_org ON public.marketing_truth_features USING btree (organization_id);


--
-- Name: idx_mkt_truth_features_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mkt_truth_features_status ON public.marketing_truth_features USING btree (organization_id, status);


--
-- Name: idx_mp_triggers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_triggers_status ON public.mp_marketing_triggers USING btree (organization_id, status) WHERE (status = 'pending'::text);


--
-- Name: idx_mp_triggers_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_triggers_type ON public.mp_marketing_triggers USING btree (organization_id, trigger_type, created_at DESC);


--
-- Name: idx_mp_triggers_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_triggers_user ON public.mp_marketing_triggers USING btree (organization_id, user_id, created_at DESC);


--
-- Name: idx_mv_asset_summary_cat; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_asset_summary_cat ON public.mv_asset_summary USING btree (category_name);


--
-- Name: idx_mv_contract_renewals_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_contract_renewals_id ON public.mv_contract_renewals USING btree (contract_id);


--
-- Name: idx_mv_customer_health_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_customer_health_id ON public.mv_customer_health USING btree (crm_company_id);


--
-- Name: idx_mv_license_util_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_license_util_id ON public.mv_license_utilization USING btree (license_id);


--
-- Name: idx_mv_mkt_roi_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_mkt_roi_id ON public.mv_marketing_roi USING btree (campaign_id);


--
-- Name: idx_mv_pipeline_summary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_pipeline_summary ON public.mv_pipeline_summary USING btree (pipeline_id, stage_name);


--
-- Name: idx_mv_recruit_funnel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_recruit_funnel_id ON public.mv_recruitment_funnel USING btree (job_id);


--
-- Name: idx_notifications_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created ON public.notifications USING btree (created_at);


--
-- Name: idx_notifications_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);


--
-- Name: idx_notifications_user_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_read ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_notifications_user_read_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_read_created ON public.notifications USING btree (user_id, is_read, created_at DESC);


--
-- Name: idx_okr_checkins_kr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_okr_checkins_kr ON public.okr_check_ins USING btree (key_result_id);


--
-- Name: idx_okr_goals_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_okr_goals_owner ON public.okr_goals USING btree (owner_id);


--
-- Name: idx_okr_goals_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_okr_goals_parent ON public.okr_goals USING btree (parent_goal_id);


--
-- Name: idx_okr_goals_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_okr_goals_period ON public.okr_goals USING btree (period_id);


--
-- Name: idx_okr_goals_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_okr_goals_tenant ON public.okr_goals USING btree (tenant_id);


--
-- Name: idx_okr_key_results_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_okr_key_results_owner ON public.okr_key_results USING btree (owner_id);


--
-- Name: idx_okr_kr_goal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_okr_kr_goal ON public.okr_key_results USING btree (goal_id);


--
-- Name: idx_okr_periods_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_okr_periods_tenant ON public.okr_periods USING btree (tenant_id);


--
-- Name: idx_pending_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pending_expiry ON public.pending_actions USING btree (expires_at) WHERE (status = 'pending'::text);


--
-- Name: idx_pending_idem_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pending_idem_pending ON public.pending_actions USING btree (organization_id, user_id, idempotency_key) WHERE ((idempotency_key IS NOT NULL) AND (status = 'pending'::text));


--
-- Name: idx_pending_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pending_user ON public.pending_actions USING btree (user_id, status);


--
-- Name: idx_perf_feedback_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_perf_feedback_brand ON public.performance_feedback USING btree (organization_id, brand_profile_id) WHERE (brand_profile_id IS NOT NULL);


--
-- Name: idx_perf_feedback_org_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_perf_feedback_org_channel ON public.performance_feedback USING btree (organization_id, channel, open_rate DESC);


--
-- Name: idx_perf_feedback_org_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_perf_feedback_org_open ON public.performance_feedback USING btree (organization_id, open_rate DESC) WHERE (send_count >= 500);


--
-- Name: idx_perf_feedback_org_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_perf_feedback_org_recorded ON public.performance_feedback USING btree (organization_id, recorded_at DESC);


--
-- Name: idx_performance_audit_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_performance_audit_log_action ON public.performance_audit_log USING btree (action);


--
-- Name: idx_performance_audit_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_performance_audit_log_created ON public.performance_audit_log USING btree (created_at DESC);


--
-- Name: idx_period_close_tasks_close; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_period_close_tasks_close ON public.finance_period_close_tasks USING btree (period_close_id);


--
-- Name: idx_period_closes_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_period_closes_org ON public.finance_period_closes USING btree (organization_id);


--
-- Name: idx_project_showcase_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_showcase_featured ON public.project_showcase USING btree (is_featured);


--
-- Name: idx_rag_outbox_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rag_outbox_pending ON public.rag_outbox_events USING btree (created_at) WHERE (processed_at IS NULL);


--
-- Name: idx_recruit_apps_candidate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruit_apps_candidate ON public.recruitment_applications USING btree (candidate_id);


--
-- Name: idx_recruit_apps_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruit_apps_job ON public.recruitment_applications USING btree (job_id);


--
-- Name: idx_recruit_apps_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruit_apps_score ON public.recruitment_applications USING btree (match_score);


--
-- Name: idx_recruit_apps_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruit_apps_stage ON public.recruitment_applications USING btree (stage);


--
-- Name: idx_recruit_candidates_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruit_candidates_email ON public.recruitment_candidates USING btree (email);


--
-- Name: idx_recruit_candidates_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruit_candidates_source ON public.recruitment_candidates USING btree (source);


--
-- Name: idx_recruit_history_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruit_history_app ON public.recruitment_stage_history USING btree (application_id);


--
-- Name: idx_recruit_interviews_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruit_interviews_app ON public.recruitment_interviews USING btree (application_id);


--
-- Name: idx_recruit_interviews_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruit_interviews_date ON public.recruitment_interviews USING btree (scheduled_at);


--
-- Name: idx_recruit_interviews_interviewer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruit_interviews_interviewer ON public.recruitment_interviews USING btree (interviewer_id);


--
-- Name: idx_recruit_jobs_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruit_jobs_dept ON public.recruitment_jobs USING btree (department);


--
-- Name: idx_recruit_jobs_dept_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruit_jobs_dept_id ON public.recruitment_jobs USING btree (department_id);


--
-- Name: idx_recruit_jobs_manager; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruit_jobs_manager ON public.recruitment_jobs USING btree (hiring_manager_id);


--
-- Name: idx_recruit_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruit_jobs_status ON public.recruitment_jobs USING btree (status);


--
-- Name: idx_recruit_offers_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruit_offers_app ON public.recruitment_offers USING btree (application_id);


--
-- Name: idx_recruitment_applications_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruitment_applications_tenant ON public.recruitment_applications USING btree (tenant_id);


--
-- Name: idx_recruitment_apps_job_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruitment_apps_job_stage ON public.recruitment_applications USING btree (job_id, stage);


--
-- Name: idx_recruitment_candidates_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruitment_candidates_tenant ON public.recruitment_candidates USING btree (tenant_id);


--
-- Name: idx_recruitment_interviews_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruitment_interviews_tenant ON public.recruitment_interviews USING btree (tenant_id);


--
-- Name: idx_recruitment_jobs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruitment_jobs_tenant ON public.recruitment_jobs USING btree (tenant_id);


--
-- Name: idx_reimbursement_activity_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reimbursement_activity_created ON public.reimbursement_activity_log USING btree (created_at DESC);


--
-- Name: idx_reimbursement_activity_reimbursement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reimbursement_activity_reimbursement ON public.reimbursement_activity_log USING btree (reimbursement_id);


--
-- Name: idx_reimbursement_comments_reimbursement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reimbursement_comments_reimbursement ON public.reimbursement_comments USING btree (reimbursement_id);


--
-- Name: idx_reimbursement_documents_reimbursement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reimbursement_documents_reimbursement ON public.reimbursement_documents USING btree (reimbursement_id);


--
-- Name: idx_reimbursement_documents_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reimbursement_documents_type ON public.reimbursement_documents USING btree (document_type);


--
-- Name: idx_reimbursement_requests_expense_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reimbursement_requests_expense_date ON public.reimbursement_requests USING btree (expense_date DESC);


--
-- Name: idx_reimbursement_requests_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reimbursement_requests_org ON public.reimbursement_requests USING btree (organization_id);


--
-- Name: idx_reimbursement_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reimbursement_requests_status ON public.reimbursement_requests USING btree (status);


--
-- Name: idx_reimbursement_requests_submitted_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reimbursement_requests_submitted_by ON public.reimbursement_requests USING btree (submitted_by);


--
-- Name: idx_reimbursement_requests_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reimbursement_requests_tenant ON public.reimbursement_requests USING btree (tenant_id);


--
-- Name: idx_reimbursement_settings_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reimbursement_settings_tenant ON public.reimbursement_settings USING btree (tenant_id);


--
-- Name: idx_reimbursement_users_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reimbursement_users_tenant ON public.reimbursement_users USING btree (tenant_id);


--
-- Name: idx_reset_tokens_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reset_tokens_employee ON public.password_reset_tokens USING btree (employee_id);


--
-- Name: idx_reset_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reset_tokens_token ON public.password_reset_tokens USING btree (token_hash);


--
-- Name: idx_sessions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_active ON public.sessions USING btree (is_active, expires_at);


--
-- Name: idx_sessions_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_employee ON public.sessions USING btree (employee_id);


--
-- Name: idx_sessions_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_token ON public.sessions USING btree (token_hash);


--
-- Name: idx_sprint_helpers_sprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sprint_helpers_sprint ON public.sprint_helpers USING btree (sprint_id);


--
-- Name: idx_sprint_requests_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sprint_requests_project ON public.sprint_requests USING btree (project_id);


--
-- Name: idx_sprint_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sprint_requests_status ON public.sprint_requests USING btree (status);


--
-- Name: idx_support_categories_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_categories_org ON public.support_categories USING btree (organization_id);


--
-- Name: idx_support_categories_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_categories_parent ON public.support_categories USING btree (parent_id);


--
-- Name: idx_support_categories_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_categories_tenant ON public.support_categories USING btree (tenant_id);


--
-- Name: idx_support_csat_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_csat_ticket ON public.support_csat_ratings USING btree (ticket_id);


--
-- Name: idx_support_health_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_health_score ON public.support_customer_health USING btree (health_score);


--
-- Name: idx_support_history_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_history_changed_at ON public.support_ticket_history USING btree (changed_at);


--
-- Name: idx_support_history_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_history_ticket ON public.support_ticket_history USING btree (ticket_id);


--
-- Name: idx_support_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_messages_created ON public.support_messages USING btree (created_at);


--
-- Name: idx_support_messages_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_messages_ticket ON public.support_messages USING btree (ticket_id);


--
-- Name: idx_support_sla_policies_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_sla_policies_active ON public.support_sla_policies USING btree (organization_id, is_active);


--
-- Name: idx_support_sla_policies_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_sla_policies_org ON public.support_sla_policies USING btree (organization_id);


--
-- Name: idx_support_sla_policies_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_sla_policies_tenant ON public.support_sla_policies USING btree (tenant_id);


--
-- Name: idx_support_tags_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tags_org ON public.support_tags USING btree (organization_id);


--
-- Name: idx_support_tags_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tags_tenant ON public.support_tags USING btree (tenant_id);


--
-- Name: idx_support_tickets_assignee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_assignee ON public.support_tickets USING btree (assignee_id);


--
-- Name: idx_support_tickets_assignee_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_assignee_status ON public.support_tickets USING btree (assignee_id, status);


--
-- Name: idx_support_tickets_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_category ON public.support_tickets USING btree (category_id);


--
-- Name: idx_support_tickets_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_company ON public.support_tickets USING btree (crm_company_id);


--
-- Name: idx_support_tickets_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_contact ON public.support_tickets USING btree (crm_contact_id);


--
-- Name: idx_support_tickets_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_created ON public.support_tickets USING btree (created_at);


--
-- Name: idx_support_tickets_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_tickets_number ON public.support_tickets USING btree (ticket_number);


--
-- Name: idx_support_tickets_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_org ON public.support_tickets USING btree (organization_id);


--
-- Name: idx_support_tickets_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_priority ON public.support_tickets USING btree (priority);


--
-- Name: idx_support_tickets_sla_first_response; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_sla_first_response ON public.support_tickets USING btree (sla_first_response_due);


--
-- Name: idx_support_tickets_sla_res; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_sla_res ON public.support_tickets USING btree (sla_resolution_due);


--
-- Name: idx_support_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status);


--
-- Name: idx_support_tickets_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_tenant ON public.support_tickets USING btree (tenant_id);


--
-- Name: idx_tax_rates_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_rates_org ON public.finance_tax_rates USING btree (organization_id);


--
-- Name: idx_telemetry_cache_hit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telemetry_cache_hit ON public.ai_request_telemetry USING btree (tenant_id, cache_hit) WHERE (cache_hit = true);


--
-- Name: idx_telemetry_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telemetry_created ON public.ai_query_telemetry USING btree (created_at DESC);


--
-- Name: idx_telemetry_duration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telemetry_duration ON public.ai_query_telemetry USING btree (total_duration_ms DESC) WHERE (total_duration_ms > 5000);


--
-- Name: idx_telemetry_failures; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telemetry_failures ON public.ai_query_telemetry USING btree (created_at DESC) WHERE (success = false);


--
-- Name: idx_telemetry_feedback; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telemetry_feedback ON public.ai_query_telemetry USING btree (feedback_score, created_at DESC) WHERE (feedback_score IS NOT NULL);


--
-- Name: idx_telemetry_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telemetry_path ON public.ai_request_telemetry USING btree (path, created_at DESC);


--
-- Name: idx_telemetry_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telemetry_session ON public.ai_query_telemetry USING btree (session_id, created_at);


--
-- Name: idx_telemetry_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telemetry_tenant_date ON public.ai_request_telemetry USING btree (tenant_id, created_at DESC);


--
-- Name: idx_telemetry_tools; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telemetry_tools ON public.ai_query_telemetry USING gin (tools_used);


--
-- Name: idx_telemetry_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telemetry_user ON public.ai_query_telemetry USING btree (user_id, created_at DESC);


--
-- Name: idx_time_billing_rates_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_billing_rates_tenant ON public.time_billing_rates USING btree (tenant_id);


--
-- Name: idx_time_categories_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_categories_active ON public.time_categories USING btree (organization_id, is_active);


--
-- Name: idx_time_categories_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_categories_org ON public.time_categories USING btree (organization_id);


--
-- Name: idx_time_categories_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_categories_tenant ON public.time_categories USING btree (tenant_id);


--
-- Name: idx_time_entries_billable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_billable ON public.time_entries USING btree (is_billable);


--
-- Name: idx_time_entries_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_date ON public.time_entries USING btree (date);


--
-- Name: idx_time_entries_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_org ON public.time_entries USING btree (organization_id);


--
-- Name: idx_time_entries_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_project ON public.time_entries USING btree (project_id);


--
-- Name: idx_time_entries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_status ON public.time_entries USING btree (status);


--
-- Name: idx_time_entries_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_task ON public.time_entries USING btree (task_id);


--
-- Name: idx_time_entries_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_tenant ON public.time_entries USING btree (tenant_id);


--
-- Name: idx_time_entries_timesheet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_timesheet ON public.time_entries USING btree (timesheet_id);


--
-- Name: idx_time_entries_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_user ON public.time_entries USING btree (user_id);


--
-- Name: idx_time_entries_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_user_date ON public.time_entries USING btree (user_id, date);


--
-- Name: idx_time_rates_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_rates_active ON public.time_billing_rates USING btree (organization_id, is_active);


--
-- Name: idx_time_rates_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_rates_client ON public.time_billing_rates USING btree (client_id);


--
-- Name: idx_time_rates_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_rates_project ON public.time_billing_rates USING btree (project_id);


--
-- Name: idx_time_rates_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_rates_user ON public.time_billing_rates USING btree (user_id);


--
-- Name: idx_time_timers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_timers_active ON public.time_timers USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_time_timers_one_active_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_time_timers_one_active_per_user ON public.time_timers USING btree (user_id) WHERE (is_active = true);


--
-- Name: idx_time_timers_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_timers_tenant ON public.time_timers USING btree (tenant_id);


--
-- Name: idx_time_timers_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_timers_user ON public.time_timers USING btree (user_id);


--
-- Name: idx_time_timesheets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_timesheets_status ON public.time_timesheets USING btree (status);


--
-- Name: idx_time_timesheets_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_timesheets_tenant ON public.time_timesheets USING btree (tenant_id);


--
-- Name: idx_time_timesheets_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_timesheets_user ON public.time_timesheets USING btree (user_id);


--
-- Name: idx_time_timesheets_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_timesheets_week ON public.time_timesheets USING btree (week_start_date);


--
-- Name: idx_webhook_deliveries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_deliveries_status ON public.webhook_deliveries USING btree (status);


--
-- Name: idx_webhook_deliveries_webhook; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_deliveries_webhook ON public.webhook_deliveries USING btree (webhook_id);


--
-- Name: idx_webhooks_org_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhooks_org_active ON public.webhooks USING btree (organization_id, is_active);


--
-- Name: idx_webhooks_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhooks_tenant ON public.webhooks USING btree (tenant_id);


--
-- Name: search_logs_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "search_logs_createdAt_idx" ON public.search_logs USING btree ("createdAt");


--
-- Name: tags_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tags_name_key ON public.tags USING btree (name);


--
-- Name: tags_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tags_slug_key ON public.tags USING btree (slug);


--
-- Name: team_access_teamId_documentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "team_access_teamId_documentId_key" ON public.team_access USING btree ("teamId", "documentId");


--
-- Name: teams_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX teams_name_key ON public.teams USING btree (name);


--
-- Name: uq_finance_budgets_org_dept_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_finance_budgets_org_dept_name ON public.finance_budgets USING btree (organization_id, department, name) WHERE (name IS NOT NULL);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: finance_audit_log prevent_finance_audit_delete; Type: RULE; Schema: public; Owner: -
--

CREATE RULE prevent_finance_audit_delete AS
    ON DELETE TO public.finance_audit_log DO INSTEAD NOTHING;


--
-- Name: finance_audit_log prevent_finance_audit_update; Type: RULE; Schema: public; Owner: -
--

CREATE RULE prevent_finance_audit_update AS
    ON UPDATE TO public.finance_audit_log DO INSTEAD NOTHING;


--
-- Name: employees employee_email_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER employee_email_sync AFTER UPDATE OF email ON public.employees FOR EACH ROW EXECUTE FUNCTION public.sync_employee_email();


--
-- Name: approval_steps approval_steps_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_steps
    ADD CONSTRAINT approval_steps_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.reimbursement_users(id);


--
-- Name: approval_steps approval_steps_reimbursement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_steps
    ADD CONSTRAINT approval_steps_reimbursement_id_fkey FOREIGN KEY (reimbursement_id) REFERENCES public.reimbursement_requests(id) ON DELETE CASCADE;


--
-- Name: asset_assignments asset_assignments_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_assignments
    ADD CONSTRAINT asset_assignments_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: asset_categories asset_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT asset_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.asset_categories(id) ON DELETE SET NULL;


--
-- Name: asset_maintenance asset_maintenance_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_maintenance
    ADD CONSTRAINT asset_maintenance_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: assets assets_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.asset_categories(id) ON DELETE SET NULL;


--
-- Name: assets assets_purchase_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_purchase_invoice_id_fkey FOREIGN KEY (purchase_invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;


--
-- Name: assets assets_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.finance_vendors(id) ON DELETE SET NULL;


--
-- Name: attachments attachments_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT "attachments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: batch_jobs batch_jobs_hero_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_jobs
    ADD CONSTRAINT batch_jobs_hero_content_id_fkey FOREIGN KEY (hero_content_id) REFERENCES public.marketing_content(id) ON DELETE CASCADE;


--
-- Name: bookmarks bookmarks_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT "bookmarks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: bookmarks bookmarks_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT "bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: calibration_snapshots calibration_snapshots_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_snapshots
    ADD CONSTRAINT calibration_snapshots_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: categories categories_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.categories(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: channel_members channel_members_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_members
    ADD CONSTRAINT channel_members_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: comments comments_authorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: comments comments_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comments comments_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.comments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: competitor_events competitor_events_competitor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competitor_events
    ADD CONSTRAINT competitor_events_competitor_id_fkey FOREIGN KEY (competitor_id) REFERENCES public.competitors(id) ON DELETE CASCADE;


--
-- Name: compliance_scans compliance_scans_brand_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_scans
    ADD CONSTRAINT compliance_scans_brand_profile_id_fkey FOREIGN KEY (brand_profile_id) REFERENCES public.brand_profiles(id) ON DELETE SET NULL;


--
-- Name: compliance_scans compliance_scans_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_scans
    ADD CONSTRAINT compliance_scans_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.marketing_content(id) ON DELETE CASCADE;


--
-- Name: contract_obligations contract_obligations_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_obligations
    ADD CONSTRAINT contract_obligations_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE CASCADE;


--
-- Name: contract_reminders contract_reminders_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_reminders
    ADD CONSTRAINT contract_reminders_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE CASCADE;


--
-- Name: contract_signatories contract_signatories_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_signatories
    ADD CONSTRAINT contract_signatories_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE CASCADE;


--
-- Name: contracts contracts_crm_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_crm_company_id_fkey FOREIGN KEY (crm_company_id) REFERENCES public.crm_companies(id) ON DELETE SET NULL;


--
-- Name: contracts contracts_finance_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_finance_vendor_id_fkey FOREIGN KEY (finance_vendor_id) REFERENCES public.finance_vendors(id) ON DELETE SET NULL;


--
-- Name: crm_activities crm_activities_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: crm_activities crm_activities_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.crm_deals(id) ON DELETE CASCADE;


--
-- Name: crm_companies crm_companies_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_companies
    ADD CONSTRAINT crm_companies_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.finance_vendors(id);


--
-- Name: crm_contacts crm_contacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.crm_companies(id) ON DELETE SET NULL;


--
-- Name: crm_deal_stage_history crm_deal_stage_history_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deal_stage_history
    ADD CONSTRAINT crm_deal_stage_history_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.crm_deals(id) ON DELETE CASCADE;


--
-- Name: crm_deal_stage_history crm_deal_stage_history_from_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deal_stage_history
    ADD CONSTRAINT crm_deal_stage_history_from_stage_id_fkey FOREIGN KEY (from_stage_id) REFERENCES public.crm_deal_stages(id);


--
-- Name: crm_deal_stage_history crm_deal_stage_history_to_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deal_stage_history
    ADD CONSTRAINT crm_deal_stage_history_to_stage_id_fkey FOREIGN KEY (to_stage_id) REFERENCES public.crm_deal_stages(id);


--
-- Name: crm_deal_stages crm_deal_stages_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deal_stages
    ADD CONSTRAINT crm_deal_stages_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.crm_pipelines(id) ON DELETE CASCADE;


--
-- Name: crm_deals crm_deals_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.crm_companies(id) ON DELETE SET NULL;


--
-- Name: crm_deals crm_deals_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: crm_deals crm_deals_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.crm_pipelines(id);


--
-- Name: crm_deals crm_deals_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.crm_deal_stages(id);


--
-- Name: document_chunks document_chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: document_links document_links_sourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_links
    ADD CONSTRAINT "document_links_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_links document_links_targetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_links
    ADD CONSTRAINT "document_links_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_summaries document_summaries_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_summaries
    ADD CONSTRAINT document_summaries_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: document_tags document_tags_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_tags
    ADD CONSTRAINT "document_tags_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_tags document_tags_tagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_tags
    ADD CONSTRAINT "document_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_versions document_versions_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_views document_views_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_views
    ADD CONSTRAINT "document_views_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: document_views document_views_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_views
    ADD CONSTRAINT "document_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: documents documents_authorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: documents documents_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public.categories(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: dora_automation_log dora_automation_log_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dora_automation_log
    ADD CONSTRAINT dora_automation_log_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.dora_automation_policies(id) ON DELETE CASCADE;


--
-- Name: dora_messages dora_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dora_messages
    ADD CONSTRAINT dora_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.dora_sessions(id) ON DELETE CASCADE;


--
-- Name: employees employees_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE RESTRICT;


--
-- Name: employees employees_reports_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_reports_to_fkey FOREIGN KEY (reports_to) REFERENCES public.employees(id) ON DELETE SET NULL;


--
-- Name: expense_categories expense_categories_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: finance_budget_allocations finance_budget_allocations_budget_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_budget_allocations
    ADD CONSTRAINT finance_budget_allocations_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES public.budgets(id) ON DELETE CASCADE;


--
-- Name: finance_budget_snapshots finance_budget_snapshots_budget_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_budget_snapshots
    ADD CONSTRAINT finance_budget_snapshots_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES public.finance_budgets(id) ON DELETE CASCADE;


--
-- Name: finance_gl_accounts finance_gl_accounts_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_gl_accounts
    ADD CONSTRAINT finance_gl_accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.finance_gl_accounts(id);


--
-- Name: finance_journal_lines finance_journal_lines_gl_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_journal_lines
    ADD CONSTRAINT finance_journal_lines_gl_account_id_fkey FOREIGN KEY (gl_account_id) REFERENCES public.finance_gl_accounts(id);


--
-- Name: finance_journal_lines finance_journal_lines_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_journal_lines
    ADD CONSTRAINT finance_journal_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.finance_journal_entries(id) ON DELETE CASCADE;


--
-- Name: finance_payments finance_payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_payments
    ADD CONSTRAINT finance_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);


--
-- Name: finance_payments finance_payments_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_payments
    ADD CONSTRAINT finance_payments_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.finance_vendors(id);


--
-- Name: finance_period_close_tasks finance_period_close_tasks_period_close_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_period_close_tasks
    ADD CONSTRAINT finance_period_close_tasks_period_close_id_fkey FOREIGN KEY (period_close_id) REFERENCES public.finance_period_closes(id) ON DELETE CASCADE;


--
-- Name: departments fk_departments_head; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT fk_departments_head FOREIGN KEY (head_id) REFERENCES public.employees(id) ON DELETE SET NULL;


--
-- Name: heart_pulse_responses heart_pulse_responses_survey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.heart_pulse_responses
    ADD CONSTRAINT heart_pulse_responses_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.heart_pulse_surveys(id) ON DELETE CASCADE;


--
-- Name: invoice_line_items invoice_line_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: kb_collection_documents kb_collection_documents_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_collection_documents
    ADD CONSTRAINT kb_collection_documents_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.kb_collections(id) ON DELETE CASCADE;


--
-- Name: kb_document_tags kb_document_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_document_tags
    ADD CONSTRAINT kb_document_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.kb_tags(id) ON DELETE CASCADE;


--
-- Name: knowledge_ai_tool_logs knowledge_ai_tool_logs_query_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_ai_tool_logs
    ADD CONSTRAINT knowledge_ai_tool_logs_query_log_id_fkey FOREIGN KEY (query_log_id) REFERENCES public.knowledge_ai_query_logs(id) ON DELETE SET NULL;


--
-- Name: knowledge_attachments knowledge_attachments_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_attachments
    ADD CONSTRAINT knowledge_attachments_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_bookmarks knowledge_bookmarks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_bookmarks
    ADD CONSTRAINT knowledge_bookmarks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_categories knowledge_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_categories
    ADD CONSTRAINT knowledge_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.knowledge_categories(id) ON DELETE SET NULL;


--
-- Name: knowledge_collection_documents knowledge_collection_documents_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_collection_documents
    ADD CONSTRAINT knowledge_collection_documents_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.knowledge_collections(id) ON DELETE CASCADE;


--
-- Name: knowledge_collection_documents knowledge_collection_documents_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_collection_documents
    ADD CONSTRAINT knowledge_collection_documents_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_comments knowledge_comments_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_comments
    ADD CONSTRAINT knowledge_comments_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_comments knowledge_comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_comments
    ADD CONSTRAINT knowledge_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.knowledge_comments(id) ON DELETE CASCADE;


--
-- Name: knowledge_content_flags knowledge_content_flags_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_content_flags
    ADD CONSTRAINT knowledge_content_flags_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_document_links knowledge_document_links_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_links
    ADD CONSTRAINT knowledge_document_links_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_document_links knowledge_document_links_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_links
    ADD CONSTRAINT knowledge_document_links_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_document_tags knowledge_document_tags_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_tags
    ADD CONSTRAINT knowledge_document_tags_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_document_tags knowledge_document_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_tags
    ADD CONSTRAINT knowledge_document_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.knowledge_tags(id) ON DELETE CASCADE;


--
-- Name: knowledge_document_versions knowledge_document_versions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_versions
    ADD CONSTRAINT knowledge_document_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_document_views knowledge_document_views_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_views
    ADD CONSTRAINT knowledge_document_views_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_documents knowledge_documents_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.knowledge_categories(id) ON DELETE SET NULL;


--
-- Name: knowledge_embeddings knowledge_embeddings_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_embeddings
    ADD CONSTRAINT knowledge_embeddings_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_notifications knowledge_notifications_related_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_notifications
    ADD CONSTRAINT knowledge_notifications_related_document_id_fkey FOREIGN KEY (related_document_id) REFERENCES public.knowledge_documents(id) ON DELETE SET NULL;


--
-- Name: knowledge_review_actions knowledge_review_actions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_review_actions
    ADD CONSTRAINT knowledge_review_actions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_search_logs knowledge_search_logs_clicked_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_search_logs
    ADD CONSTRAINT knowledge_search_logs_clicked_document_id_fkey FOREIGN KEY (clicked_document_id) REFERENCES public.knowledge_documents(id);


--
-- Name: knowledge_team_access knowledge_team_access_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_team_access
    ADD CONSTRAINT knowledge_team_access_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_team_access knowledge_team_access_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_team_access
    ADD CONSTRAINT knowledge_team_access_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.knowledge_teams(id) ON DELETE CASCADE;


--
-- Name: knowledge_team_members knowledge_team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_team_members
    ADD CONSTRAINT knowledge_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.knowledge_teams(id) ON DELETE CASCADE;


--
-- Name: license_seats license_seats_license_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_seats
    ADD CONSTRAINT license_seats_license_id_fkey FOREIGN KEY (license_id) REFERENCES public.licenses(id) ON DELETE CASCADE;


--
-- Name: licenses licenses_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.finance_vendors(id) ON DELETE SET NULL;


--
-- Name: marketing_approval_queue marketing_approval_queue_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_approval_queue
    ADD CONSTRAINT marketing_approval_queue_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.marketing_content(id) ON DELETE CASCADE;


--
-- Name: marketing_automation_runs marketing_automation_runs_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_automation_runs
    ADD CONSTRAINT marketing_automation_runs_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES public.marketing_automations(id) ON DELETE CASCADE;


--
-- Name: marketing_budget_allocations marketing_budget_allocations_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_budget_allocations
    ADD CONSTRAINT marketing_budget_allocations_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE;


--
-- Name: marketing_campaign_spend marketing_campaign_spend_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_campaign_spend
    ADD CONSTRAINT marketing_campaign_spend_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE;


--
-- Name: marketing_campaigns marketing_campaigns_brand_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_brand_profile_id_fkey FOREIGN KEY (brand_profile_id) REFERENCES public.brand_profiles(id) ON DELETE SET NULL;


--
-- Name: marketing_content marketing_content_batch_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_content
    ADD CONSTRAINT marketing_content_batch_job_id_fkey FOREIGN KEY (batch_job_id) REFERENCES public.batch_jobs(id) ON DELETE SET NULL;


--
-- Name: marketing_content marketing_content_brand_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_content
    ADD CONSTRAINT marketing_content_brand_profile_id_fkey FOREIGN KEY (brand_profile_id) REFERENCES public.brand_profiles(id) ON DELETE SET NULL;


--
-- Name: marketing_content_calendar marketing_content_calendar_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_content_calendar
    ADD CONSTRAINT marketing_content_calendar_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;


--
-- Name: marketing_content_calendar marketing_content_calendar_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_content_calendar
    ADD CONSTRAINT marketing_content_calendar_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.marketing_content(id) ON DELETE CASCADE;


--
-- Name: marketing_content marketing_content_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_content
    ADD CONSTRAINT marketing_content_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;


--
-- Name: marketing_content marketing_content_parent_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_content
    ADD CONSTRAINT marketing_content_parent_content_id_fkey FOREIGN KEY (parent_content_id) REFERENCES public.marketing_content(id);


--
-- Name: marketing_email_campaigns marketing_email_campaigns_brand_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_email_campaigns
    ADD CONSTRAINT marketing_email_campaigns_brand_profile_id_fkey FOREIGN KEY (brand_profile_id) REFERENCES public.brand_profiles(id) ON DELETE SET NULL;


--
-- Name: marketing_email_campaigns marketing_email_campaigns_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_email_campaigns
    ADD CONSTRAINT marketing_email_campaigns_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;


--
-- Name: marketing_leads marketing_leads_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_leads
    ADD CONSTRAINT marketing_leads_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;


--
-- Name: marketing_leads marketing_leads_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_leads
    ADD CONSTRAINT marketing_leads_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.marketing_content(id) ON DELETE SET NULL;


--
-- Name: marketing_leads marketing_leads_crm_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_leads
    ADD CONSTRAINT marketing_leads_crm_contact_id_fkey FOREIGN KEY (crm_contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: marketing_leads marketing_leads_crm_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_leads
    ADD CONSTRAINT marketing_leads_crm_deal_id_fkey FOREIGN KEY (crm_deal_id) REFERENCES public.crm_deals(id) ON DELETE SET NULL;


--
-- Name: messages messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: mileage_claims mileage_claims_reimbursement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mileage_claims
    ADD CONSTRAINT mileage_claims_reimbursement_id_fkey FOREIGN KEY (reimbursement_id) REFERENCES public.reimbursement_requests(id) ON DELETE CASCADE;


--
-- Name: okr_check_ins okr_check_ins_key_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.okr_check_ins
    ADD CONSTRAINT okr_check_ins_key_result_id_fkey FOREIGN KEY (key_result_id) REFERENCES public.okr_key_results(id) ON DELETE CASCADE;


--
-- Name: okr_goals okr_goals_parent_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.okr_goals
    ADD CONSTRAINT okr_goals_parent_goal_id_fkey FOREIGN KEY (parent_goal_id) REFERENCES public.okr_goals(id) ON DELETE SET NULL;


--
-- Name: okr_goals okr_goals_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.okr_goals
    ADD CONSTRAINT okr_goals_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.okr_periods(id);


--
-- Name: okr_key_results okr_key_results_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.okr_key_results
    ADD CONSTRAINT okr_key_results_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.okr_goals(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: performance_feedback performance_feedback_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_feedback
    ADD CONSTRAINT performance_feedback_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.marketing_content(id) ON DELETE CASCADE;


--
-- Name: performance_team_members performance_team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_team_members
    ADD CONSTRAINT performance_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.performance_teams(id) ON DELETE CASCADE;


--
-- Name: project_showcase project_showcase_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_showcase
    ADD CONSTRAINT project_showcase_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: recruitment_applications recruitment_applications_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_applications
    ADD CONSTRAINT recruitment_applications_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE;


--
-- Name: recruitment_applications recruitment_applications_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_applications
    ADD CONSTRAINT recruitment_applications_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.recruitment_jobs(id) ON DELETE CASCADE;


--
-- Name: recruitment_interviews recruitment_interviews_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_interviews
    ADD CONSTRAINT recruitment_interviews_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.recruitment_applications(id) ON DELETE CASCADE;


--
-- Name: recruitment_offers recruitment_offers_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_offers
    ADD CONSTRAINT recruitment_offers_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.recruitment_applications(id) ON DELETE CASCADE;


--
-- Name: recruitment_stage_history recruitment_stage_history_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment_stage_history
    ADD CONSTRAINT recruitment_stage_history_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.recruitment_applications(id) ON DELETE CASCADE;


--
-- Name: reimbursement_activity_log reimbursement_activity_log_reimbursement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_activity_log
    ADD CONSTRAINT reimbursement_activity_log_reimbursement_id_fkey FOREIGN KEY (reimbursement_id) REFERENCES public.reimbursement_requests(id) ON DELETE CASCADE;


--
-- Name: reimbursement_activity_log reimbursement_activity_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_activity_log
    ADD CONSTRAINT reimbursement_activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.reimbursement_users(id);


--
-- Name: reimbursement_comments reimbursement_comments_reimbursement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_comments
    ADD CONSTRAINT reimbursement_comments_reimbursement_id_fkey FOREIGN KEY (reimbursement_id) REFERENCES public.reimbursement_requests(id) ON DELETE CASCADE;


--
-- Name: reimbursement_comments reimbursement_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_comments
    ADD CONSTRAINT reimbursement_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.reimbursement_users(id);


--
-- Name: reimbursement_documents reimbursement_documents_reimbursement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_documents
    ADD CONSTRAINT reimbursement_documents_reimbursement_id_fkey FOREIGN KEY (reimbursement_id) REFERENCES public.reimbursement_requests(id) ON DELETE CASCADE;


--
-- Name: reimbursement_documents reimbursement_documents_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_documents
    ADD CONSTRAINT reimbursement_documents_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.reimbursement_users(id);


--
-- Name: reimbursement_requests reimbursement_requests_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_requests
    ADD CONSTRAINT reimbursement_requests_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.expense_categories(id);


--
-- Name: reimbursement_requests reimbursement_requests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_requests
    ADD CONSTRAINT reimbursement_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: reimbursement_requests reimbursement_requests_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_requests
    ADD CONSTRAINT reimbursement_requests_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.reimbursement_users(id) ON DELETE CASCADE;


--
-- Name: reimbursement_settings reimbursement_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_settings
    ADD CONSTRAINT reimbursement_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: reimbursement_users reimbursement_users_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_users
    ADD CONSTRAINT reimbursement_users_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.reimbursement_users(id) ON DELETE SET NULL;


--
-- Name: reimbursement_users reimbursement_users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursement_users
    ADD CONSTRAINT reimbursement_users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: review_actions review_actions_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_actions
    ADD CONSTRAINT "review_actions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: review_actions review_actions_reviewerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_actions
    ADD CONSTRAINT "review_actions_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sessions sessions_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sprint_helpers sprint_helpers_sprint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_helpers
    ADD CONSTRAINT sprint_helpers_sprint_id_fkey FOREIGN KEY (sprint_id) REFERENCES public.sprint_requests(id) ON DELETE CASCADE;


--
-- Name: sprint_requests sprint_requests_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprint_requests
    ADD CONSTRAINT sprint_requests_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: support_categories support_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_categories
    ADD CONSTRAINT support_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.support_categories(id) ON DELETE SET NULL;


--
-- Name: support_csat_ratings support_csat_ratings_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_csat_ratings
    ADD CONSTRAINT support_csat_ratings_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_customer_health support_customer_health_crm_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_customer_health
    ADD CONSTRAINT support_customer_health_crm_company_id_fkey FOREIGN KEY (crm_company_id) REFERENCES public.crm_companies(id) ON DELETE CASCADE;


--
-- Name: support_messages support_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_ticket_history support_ticket_history_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_history
    ADD CONSTRAINT support_ticket_history_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.support_categories(id) ON DELETE SET NULL;


--
-- Name: support_tickets support_tickets_crm_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_crm_company_id_fkey FOREIGN KEY (crm_company_id) REFERENCES public.crm_companies(id) ON DELETE SET NULL;


--
-- Name: support_tickets support_tickets_crm_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_crm_contact_id_fkey FOREIGN KEY (crm_contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: support_tickets support_tickets_sla_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_sla_policy_id_fkey FOREIGN KEY (sla_policy_id) REFERENCES public.support_sla_policies(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: team_access team_access_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_access
    ADD CONSTRAINT "team_access_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: team_access team_access_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_access
    ADD CONSTRAINT "team_access_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public.teams(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: time_billing_rates time_billing_rates_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_billing_rates
    ADD CONSTRAINT time_billing_rates_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.crm_companies(id) ON DELETE CASCADE;


--
-- Name: time_entries time_entries_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.time_categories(id) ON DELETE SET NULL;


--
-- Name: time_entries time_entries_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.crm_companies(id) ON DELETE SET NULL;


--
-- Name: time_entries time_entries_timesheet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_timesheet_id_fkey FOREIGN KEY (timesheet_id) REFERENCES public.time_timesheets(id) ON DELETE SET NULL;


--
-- Name: time_timers time_timers_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_timers
    ADD CONSTRAINT time_timers_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.time_categories(id) ON DELETE SET NULL;


--
-- Name: user_badges user_badges_badge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES public.badges(id) ON DELETE CASCADE;


--
-- Name: users users_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public.teams(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: webhook_deliveries webhook_deliveries_webhook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES public.webhooks(id) ON DELETE CASCADE;


--
-- Name: asset_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- Name: reimbursement_users auth_lookup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_lookup ON public.reimbursement_users FOR SELECT USING (((tenant_id = public.current_tenant_id()) OR (public.current_tenant_id() IS NULL)));


--
-- Name: batch_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.batch_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: batch_jobs batch_jobs_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY batch_jobs_tenant ON public.batch_jobs USING ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: brand_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: brand_profiles brand_profiles_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand_profiles_org_isolation ON public.brand_profiles USING ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: budgets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: calibration_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calibration_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: calibration_snapshots calibration_snapshots_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calibration_snapshots_tenant_isolation ON public.calibration_snapshots USING ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: competitor_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competitor_events ENABLE ROW LEVEL SECURITY;

--
-- Name: competitor_events competitor_events_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY competitor_events_org_isolation ON public.competitor_events USING ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: competitors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;

--
-- Name: competitors competitors_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY competitors_org_isolation ON public.competitors USING ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: compliance_scans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_scans ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_scans compliance_scans_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY compliance_scans_org_isolation ON public.compliance_scans USING ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: contracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_deal_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_deal_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_pipelines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;

--
-- Name: dashboard_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dashboard_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: dashboard_snapshots dashboard_snapshots_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dashboard_snapshots_org_isolation ON public.dashboard_snapshots USING ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: dora_automation_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dora_automation_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: dora_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dora_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: dora_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dora_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: dora_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dora_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_embeddings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_embeddings ENABLE ROW LEVEL SECURITY;

--
-- Name: expense_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_approval_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_approval_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_budgets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_dora_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_dora_decisions ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_dora_job_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_dora_job_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_expense_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_expense_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_gl_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_gl_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_invoice_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_invoice_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_journal_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_journal_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_period_closes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_period_closes ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_tax_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_tax_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_vendors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_vendors ENABLE ROW LEVEL SECURITY;

--
-- Name: heart_pulse_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.heart_pulse_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: heart_pulse_surveys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.heart_pulse_surveys ENABLE ROW LEVEL SECURITY;

--
-- Name: heart_team_health; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.heart_team_health ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: licenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_automation_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_automation_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_automations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_automations ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_content; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_content ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_scoring_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_scoring_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_automation_runs mktg_automation_runs_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mktg_automation_runs_tenant ON public.marketing_automation_runs USING ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: marketing_automations mktg_automations_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mktg_automations_tenant ON public.marketing_automations USING ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: mp_marketing_triggers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mp_marketing_triggers ENABLE ROW LEVEL SECURITY;

--
-- Name: mp_marketing_triggers mp_triggers_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mp_triggers_org_isolation ON public.mp_marketing_triggers USING ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: okr_goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.okr_goals ENABLE ROW LEVEL SECURITY;

--
-- Name: okr_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.okr_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: performance_feedback perf_feedback_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY perf_feedback_org_isolation ON public.performance_feedback USING ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((organization_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: performance_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.performance_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: recruitment_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recruitment_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: recruitment_candidates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recruitment_candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: recruitment_interviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recruitment_interviews ENABLE ROW LEVEL SECURITY;

--
-- Name: recruitment_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recruitment_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: reimbursement_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reimbursement_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: reimbursement_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reimbursement_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: reimbursement_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reimbursement_users ENABLE ROW LEVEL SECURITY;

--
-- Name: support_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: support_sla_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_sla_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_embeddings tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.entity_embeddings USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: platform_audit_log tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.platform_audit_log USING ((tenant_id = public.current_tenant_id()));


--
-- Name: asset_categories tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.asset_categories FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: assets tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.assets FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: budgets tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.budgets FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: contracts tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.contracts FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_activities tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.crm_activities FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_companies tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.crm_companies FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_contacts tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.crm_contacts FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_deal_stages tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.crm_deal_stages FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_deals tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.crm_deals FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_pipelines tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.crm_pipelines FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_automation_policies tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.dora_automation_policies FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_insights tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.dora_insights FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_messages tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.dora_messages FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_sessions tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.dora_sessions FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: expense_categories tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.expense_categories FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_approval_policies tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_approval_policies FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_audit_log tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_audit_log FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_budgets tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_budgets FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_dora_decisions tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_dora_decisions FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_dora_job_runs tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_dora_job_runs FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_expense_policies tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_expense_policies FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_gl_accounts tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_gl_accounts FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_invoice_templates tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_invoice_templates FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_journal_entries tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_journal_entries FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_notification_preferences tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_notification_preferences FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_notifications tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_notifications FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_payments tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_payments FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_period_closes tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_period_closes FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_settings tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_settings FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_tax_rates tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_tax_rates FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_vendors tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.finance_vendors FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: heart_pulse_responses tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.heart_pulse_responses FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: heart_pulse_surveys tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.heart_pulse_surveys FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: heart_team_health tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.heart_team_health FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: invoices tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.invoices FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: licenses tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.licenses FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_campaigns tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.marketing_campaigns FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_content tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.marketing_content FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_leads tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.marketing_leads FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_scoring_rules tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.marketing_scoring_rules FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: okr_goals tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.okr_goals FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: okr_periods tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.okr_periods FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_applications tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.recruitment_applications FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_candidates tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.recruitment_candidates FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_interviews tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.recruitment_interviews FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_jobs tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.recruitment_jobs FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: reimbursement_requests tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.reimbursement_requests FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: reimbursement_settings tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.reimbursement_settings FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: reimbursement_users tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.reimbursement_users FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: support_categories tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.support_categories FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: support_sla_policies tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.support_sla_policies FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: support_tags tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.support_tags FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: support_tickets tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.support_tickets FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: time_billing_rates tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.time_billing_rates FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: time_categories tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.time_categories FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: time_entries tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.time_entries FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: time_timers tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.time_timers FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: time_timesheets tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.time_timesheets FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: webhooks tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.webhooks FOR DELETE USING ((tenant_id = public.current_tenant_id()));


--
-- Name: asset_categories tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.asset_categories FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: assets tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.assets FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: budgets tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.budgets FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: contracts tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.contracts FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_activities tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.crm_activities FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_companies tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.crm_companies FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_contacts tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.crm_contacts FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_deal_stages tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.crm_deal_stages FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_deals tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.crm_deals FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_pipelines tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.crm_pipelines FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_automation_policies tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.dora_automation_policies FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_insights tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.dora_insights FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_messages tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.dora_messages FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_sessions tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.dora_sessions FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: expense_categories tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.expense_categories FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_approval_policies tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_approval_policies FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_audit_log tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_audit_log FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_budgets tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_budgets FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_dora_decisions tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_dora_decisions FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_dora_job_runs tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_dora_job_runs FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_expense_policies tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_expense_policies FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_gl_accounts tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_gl_accounts FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_invoice_templates tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_invoice_templates FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_journal_entries tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_journal_entries FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_notification_preferences tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_notification_preferences FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_notifications tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_notifications FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_payments tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_payments FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_period_closes tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_period_closes FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_settings tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_settings FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_tax_rates tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_tax_rates FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_vendors tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.finance_vendors FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: heart_pulse_responses tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.heart_pulse_responses FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: heart_pulse_surveys tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.heart_pulse_surveys FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: heart_team_health tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.heart_team_health FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: invoices tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.invoices FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: licenses tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.licenses FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_campaigns tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.marketing_campaigns FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_content tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.marketing_content FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_leads tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.marketing_leads FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_scoring_rules tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.marketing_scoring_rules FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: okr_goals tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.okr_goals FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: okr_periods tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.okr_periods FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_applications tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.recruitment_applications FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_candidates tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.recruitment_candidates FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_interviews tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.recruitment_interviews FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_jobs tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.recruitment_jobs FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: reimbursement_requests tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.reimbursement_requests FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: reimbursement_settings tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.reimbursement_settings FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: reimbursement_users tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.reimbursement_users FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: support_categories tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.support_categories FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: support_sla_policies tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.support_sla_policies FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: support_tags tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.support_tags FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: support_tickets tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.support_tickets FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: time_billing_rates tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.time_billing_rates FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: time_categories tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.time_categories FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: time_entries tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.time_entries FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: time_timers tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.time_timers FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: time_timesheets tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.time_timesheets FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: webhooks tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.webhooks FOR INSERT WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: asset_categories tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.asset_categories FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: assets tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.assets FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: budgets tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.budgets FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: contracts tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.contracts FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_activities tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.crm_activities FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_companies tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.crm_companies FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_contacts tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.crm_contacts FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_deal_stages tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.crm_deal_stages FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_deals tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.crm_deals FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_pipelines tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.crm_pipelines FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_automation_policies tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.dora_automation_policies FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_insights tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.dora_insights FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_messages tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.dora_messages FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_sessions tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.dora_sessions FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: expense_categories tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.expense_categories FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_approval_policies tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_approval_policies FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_audit_log tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_audit_log FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_budgets tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_budgets FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_dora_decisions tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_dora_decisions FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_dora_job_runs tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_dora_job_runs FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_expense_policies tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_expense_policies FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_gl_accounts tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_gl_accounts FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_invoice_templates tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_invoice_templates FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_journal_entries tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_journal_entries FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_notification_preferences tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_notification_preferences FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_notifications tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_notifications FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_payments tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_payments FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_period_closes tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_period_closes FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_settings tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_settings FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_tax_rates tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_tax_rates FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_vendors tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.finance_vendors FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: heart_pulse_responses tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.heart_pulse_responses FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: heart_pulse_surveys tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.heart_pulse_surveys FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: heart_team_health tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.heart_team_health FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: invoices tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.invoices FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: licenses tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.licenses FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_campaigns tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.marketing_campaigns FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_content tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.marketing_content FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_leads tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.marketing_leads FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_scoring_rules tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.marketing_scoring_rules FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: okr_goals tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.okr_goals FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: okr_periods tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.okr_periods FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_applications tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.recruitment_applications FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_candidates tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.recruitment_candidates FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_interviews tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.recruitment_interviews FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_jobs tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.recruitment_jobs FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: reimbursement_requests tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.reimbursement_requests FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: reimbursement_settings tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.reimbursement_settings FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: support_categories tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.support_categories FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: support_sla_policies tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.support_sla_policies FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: support_tags tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.support_tags FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: support_tickets tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.support_tickets FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: time_billing_rates tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.time_billing_rates FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: time_categories tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.time_categories FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: time_entries tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.time_entries FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: time_timers tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.time_timers FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: time_timesheets tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.time_timesheets FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: webhooks tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.webhooks FOR SELECT USING ((tenant_id = public.current_tenant_id()));


--
-- Name: asset_categories tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.asset_categories FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: assets tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.assets FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: budgets tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.budgets FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: contracts tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.contracts FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_activities tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.crm_activities FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_companies tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.crm_companies FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_contacts tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.crm_contacts FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_deal_stages tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.crm_deal_stages FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_deals tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.crm_deals FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: crm_pipelines tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.crm_pipelines FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_automation_policies tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.dora_automation_policies FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_insights tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.dora_insights FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_messages tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.dora_messages FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: dora_sessions tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.dora_sessions FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: expense_categories tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.expense_categories FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_approval_policies tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_approval_policies FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_audit_log tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_audit_log FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_budgets tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_budgets FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_dora_decisions tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_dora_decisions FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_dora_job_runs tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_dora_job_runs FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_expense_policies tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_expense_policies FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_gl_accounts tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_gl_accounts FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_invoice_templates tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_invoice_templates FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_journal_entries tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_journal_entries FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_notification_preferences tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_notification_preferences FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_notifications tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_notifications FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_payments tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_payments FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_period_closes tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_period_closes FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_settings tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_settings FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_tax_rates tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_tax_rates FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: finance_vendors tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.finance_vendors FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: heart_pulse_responses tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.heart_pulse_responses FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: heart_pulse_surveys tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.heart_pulse_surveys FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: heart_team_health tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.heart_team_health FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: invoices tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.invoices FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: licenses tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.licenses FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_campaigns tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.marketing_campaigns FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_content tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.marketing_content FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_leads tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.marketing_leads FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: marketing_scoring_rules tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.marketing_scoring_rules FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: okr_goals tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.okr_goals FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: okr_periods tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.okr_periods FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_applications tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.recruitment_applications FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_candidates tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.recruitment_candidates FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_interviews tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.recruitment_interviews FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: recruitment_jobs tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.recruitment_jobs FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: reimbursement_requests tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.reimbursement_requests FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: reimbursement_settings tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.reimbursement_settings FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: reimbursement_users tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.reimbursement_users FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: support_categories tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.support_categories FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: support_sla_policies tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.support_sla_policies FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: support_tags tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.support_tags FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: support_tickets tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.support_tickets FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: time_billing_rates tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.time_billing_rates FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: time_categories tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.time_categories FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: time_entries tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.time_entries FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: time_timers tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.time_timers FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: time_timesheets tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.time_timesheets FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: webhooks tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.webhooks FOR UPDATE USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: time_billing_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_billing_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: time_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: time_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: time_timers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_timers ENABLE ROW LEVEL SECURITY;

--
-- Name: time_timesheets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_timesheets ENABLE ROW LEVEL SECURITY;

--
-- Name: webhooks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

-- Reset the empty search_path the dump sets, so the migration runner can use unqualified names afterwards.
SELECT pg_catalog.set_config('search_path', 'public', false);

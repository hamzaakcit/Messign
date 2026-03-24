export type { PaginatedResult } from '../types';

/** Row shape from GET /api/marketing/approvals (server contract). */
export interface MarketingApprovalApiRow {
  id: string;
  content_id: string;
  status: string;
  truth_validation: unknown;
  brand_voice_check: unknown;
  compliance_scan: unknown;
  content_title: string;
  content_body: string | null;
  user_brief: string | null;
  content_type: string;
  content_channel: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  submitted_at: string;
  revision_history?: unknown;
}

export interface SpendEntry {
  id: string;
  campaign_id: string;
  amount: number;
  currency: string;
  amount_eur: number | null;
  category: string | null;
  description: string | null;
  date: string;
  vendor: string | null;
  finance_expense_id: string | null;
  receipt_url: string | null;
  created_by: string | null;
  created_at: string;
  created_by_name?: string | null;
}

export interface Campaign {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  channel: string;
  status: string;
  budget: number;
  actual_spend: number;
  currency: string;
  budget_eur: number;
  actual_spend_eur: number;
  start_date: string | null;
  end_date: string | null;
  target_audience: string | null;
  goals: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  owner_name?: string | null;
  /** Merged spend ledger rows (populated by some endpoints). */
  spend_entries?: SpendEntry[];
  /** Enriched metrics from dashboard/detail endpoints. */
  impressions?: number | null;
  clicks?: number | null;
  conversions?: number | null;
  leads_generated?: number | null;
  cost_per_lead?: number | null;
  roi?: number | null;
  tags?: string[];
}

export interface EmailTemplate {
  id: string;
  organization_id: string;
  name: string;
  category: string;
  description: string | null;
  manifest_json: Record<string, unknown>;
  section_types: string[];
  theme: string;
  created_by: string;
  created_at: string;
  use_count: number;
}

export interface ContentItem {
  id: string;
  organization_id: string | null;
  campaign_id: string | null;
  title: string;
  body: string | null;
  type: string;
  channel: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  scheduled_for: string | null;
  metadata?: Record<string, unknown> | null;
  image_url?: string | null;
  image_variants?: Array<{
    id: string;
    image_url: string;
    style_preset: string;
    prompt: string;
    generated_at: string;
  }>;
  selected_variant_id?: string | null;
  hashtags?: string | string[] | null;
  user_brief?: string | null;
  brand_profile_id?: string | null;
  manifest_json?: Record<string, unknown> | null;
  design_json?: Record<string, unknown> | null;
  html_content?: string | null;
  /** Parent content id when this item was derived via batch atomization or repurpose. */
  parent_content_id?: string | null;
  /** Campaign name resolved from campaign_id — returned by some endpoints. */
  campaign_name?: string | null;
  /** Alias / UI fields used by cockpit and calendar views. */
  content_type?: string | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  image_prompt?: string | null;
  parent_title?: string | null;
  carousel_images?: unknown[] | null;
  body_html?: string | null;
  body_design?: Record<string, unknown> | null;
  truth_validation?: unknown;
  brand_voice_check?: unknown;
  visual_description?: string | null;
  views?: number | null;
  leads_attributed?: number | null;
  tags?: string[];
}

export interface ContentCalendarDay {
  date: string;
  items: ContentItem[];
}

export interface Lead {
  id: string;
  organization_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  /** Display name from CRM or enrichment (may mirror company). */
  company_name?: string | null;
  job_title: string | null;
  phone: string | null;
  source: string;
  status: string;
  score: number;
  /** Breakdown of score contributions (signal → points). */
  score_factors?: Record<string, number>;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer_url: string | null;
  landing_page: string | null;
  ip_address: string | null;
  user_agent: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  campaign_id: string | null;
  /** Resolved campaign label when joined in API responses. */
  campaign_name?: string | null;
  assigned_to: string | null;
  last_contacted_at: string | null;
  conversion_date: string | null;
  crm_contact_id: string | null;
  crm_contact_name?: string | null;
  crm_deal_id: string | null;
  crm_deal_title?: string | null;
  notes: string | null;
  last_activity_at?: string | null;
  converted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailCampaign {
  id: string;
  organization_id: string;
  name: string;
  subject: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  content_id: string | null;
  list_id: string | null;
  segment_id: string | null;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  total_recipients: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  spam_reports: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  body_html?: string | null;
  body_design?: Record<string, unknown> | null;
  /** Alias used by builder UI (may mirror total_recipients). */
  recipient_count?: number;
  open_rate?: number | null;
  click_rate?: number | null;
}

export interface LandingPage {
  id: string;
  organization_id: string;
  title: string;
  /** Alias from some API responses / builder (prefer title when both exist). */
  name?: string | null;
  slug: string;
  status: string;
  template_id: string | null;
  content_json: Record<string, unknown>;
  visits: number;
  conversions: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  body_html?: string | null;
  body_design?: Record<string, unknown> | null;
}

export interface MarketingPopup {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  status: string;
  trigger_config: Record<string, unknown>;
  content_json: Record<string, unknown>;
  impressions: number;
  conversions: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  slug?: string | null;
  body_html?: string | null;
  body_design?: Record<string, unknown> | null;
}

export interface MarketingDocument {
  id: string;
  organization_id: string;
  title: string;
  /** Alias used by builder create/update payloads. */
  name?: string | null;
  type: string;
  status: string;
  content: string | null;
  file_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  slug?: string | null;
  body_html?: string | null;
  body_design?: Record<string, unknown> | null;
}

// ── Batch Atomization Types ──

export interface BatchJob {
  id: string;
  organization_id: string;
  hero_content_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial' | 'cancelled';
  channels: string[];
  total_channels: number;
  completed_channels: number;
  failed_channels: number;
  results: BatchChannelResult[];
  error_log: BatchError[];
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface BatchChannelResult {
  channel: string;
  content_id: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface BatchError {
  channel: string;
  error: string;
  timestamp: string;
}

// ── Performance Feedback Types ──

export interface PerformanceRecord {
  id: string;
  content_id: string;
  channel: string;
  subject_line: string | null;
  open_rate: number | null;
  click_through_rate: number | null;
  conversion_rate: number | null;
  send_count: number;
  tone_tags: string[];
  theme_used: string | null;
  section_count: number | null;
  cta_variant: string | null;
  subject_length: number | null;
  hero_image_used: boolean;
  recorded_at: string;
}

export interface PerformanceContext {
  topPerformers: PerformanceRecord[];
  bottomPerformers: PerformanceRecord[];
  averages: {
    openRate: number | null;
    clickThroughRate: number | null;
    conversionRate: number | null;
  };
  patterns: {
    bestSubjectLength: number | null;
    bestThemes: string[];
    bestTones: string[];
    bestCtaVariants: string[];
    worstSubjectPatterns: string[];
    avgSectionCount: number | null;
    heroImageCorrelation: number | null;
  };
  totalRecords: number;
  hasEnoughData: boolean;
}

export interface CalibrationPromptResponse {
  text: string;
  generated_at: string;
  based_on_records: number;
}

export interface BrandProfileClient {
  id: string;
  organization_id: string;
  brand_name: string;
  brand_description: string | null;
  logo_url: string | null;
  tone_keywords: string[];
  forbidden_words: string[];
  required_disclaimers: string[];
  voice_examples: string[];
  style_guide_notes: string | null;
  color_palette: Record<string, string>;
  preferred_themes: string[];
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrandProfileStats {
  brand_profile_id: string;
  brand_name: string;
  content_count: number;
}

export interface RecordMetricsPayload {
  content_id: string;
  channel: string;
  metrics: {
    open_rate?: number;
    click_through_rate?: number;
    conversion_rate?: number;
    unsubscribe_rate?: number;
    bounce_rate?: number;
    send_count?: number;
    subject_line?: string;
    engagement_rate?: number;
    reach?: number;
    impressions?: number;
  };
  content_characteristics?: {
    tone_tags?: string[];
    visual_style?: string;
    theme_used?: string;
    section_count?: number;
    hero_image_used?: boolean;
    cta_variant?: string;
    subject_length?: number;
  };
  brand_profile_id?: string;
  campaign_period?: { start?: string; end?: string };
}

export interface MarketingAutomation {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  trigger_type: 'schedule' | 'event' | 'threshold' | 'manual';
  trigger_config: Record<string, unknown>;
  condition: Record<string, unknown> | null;
  actions: unknown[];
  hitl_mode: 'autopilot' | 'draft_and_wait' | 'escalation';
  enabled: boolean;
  last_fired_at: string | null;
  fire_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface CampaignMetricsSummary {
  activeCampaigns: number;
  totalSpend: number;
  totalLeads: number;
  avgCPL: number;
  avgROI: number;
  byChannel: Array<{
    channel: string;
    campaigns: number;
    spend: number;
    leads: number;
    cpl: number;
    roi: number;
  }>;
}

export interface LeadFunnelMetrics {
  new: number;
  contacted: number;
  nurturing: number;
  qualified: number;
  converted: number;
  disqualified: number;
}

export interface DashboardMetrics {
  mqls: number;
  cac: number;
  cpl: number;
  roi: number;
  activeCampaigns: number;
  totalSpend: number;
  totalLeads: number;
  emailOpenRate: number;
  contentPublished: number;
  channelBreakdown: Array<{
    channel: string;
    spend: number;
    leads: number;
    cpl: number;
    roi: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    spend: number;
    leads: number;
  }>;
}

// ── Brand Compliance Types ──

export interface ComplianceFlag {
  type: 'forbidden_word' | 'missing_disclaimer' | 'tone_deviation' | 'style_violation' | 'length_issue';
  severity: 'error' | 'warning';
  message: string;
  location?: string;
  detail?: string;
}

export interface BrandComplianceScanResult {
  score: number;
  passed: boolean;
  flags: ComplianceFlag[];
  ruleScore: number;
  llmScore: number | null;
  ruleFlags: ComplianceFlag[];
  llmFlags: ComplianceFlag[];
  scanDurationMs: number;
  brandProfileId: string | null;
  scanned_at?: string;
}

export type SubmitApprovalReviewPayload = {
  status: 'approved' | 'rejected';
  feedback?: string;
  rejection_reason?: 'off_brand' | 'factually_wrong' | 'wrong_audience' | 'needs_polish' | 'other';
  /** Alias for rejection_reason */
  reason?: 'off_brand' | 'factually_wrong' | 'wrong_audience' | 'needs_polish' | 'other';
};

// ── Competitor Intelligence ──

/** Mirrors server `LastScrapeSummary` (competitors.last_scrape_summary). */
export interface CompetitorLastScrapeSummary {
  urlsScraped: number;
  urlsFailed: number;
  eventsFound: number;
  eventsNew: number;
  eventsDuplicate: number;
  classificationErrors?: number;
  errors: Array<{ url: string; error: string }>;
  finishedAt: string;
  durationMs: number;
}

export interface CompetitorClient {
  id: string;
  organization_id: string;
  name: string;
  website_url: string | null;
  description: string | null;
  logo_url: string | null;
  monitor_urls: string[];
  monitor_email: boolean;
  monitor_social: boolean;
  industry: string | null;
  tier: 'direct' | 'indirect' | 'aspirational';
  active: boolean;
  last_scraped_at: string | null;
  last_scrape_summary?: CompetitorLastScrapeSummary | null;
  created_at: string;
  updated_at: string;
}

/** GET /competitors/stats */
export interface CompetitorStatsResponse {
  since: string;
  per_competitor: Array<{ competitor_id: string; competitor_name: string; event_count: number }>;
  total_events: number;
}

export interface CompetitorEventClient {
  id: string;
  competitor_id: string;
  event_type: string;
  title: string;
  summary: string | null;
  source_url: string | null;
  tags: string[];
  sentiment: 'positive' | 'negative' | 'neutral' | null;
  significance: 'low' | 'normal' | 'high' | 'critical';
  ai_analysis: string | null;
  event_date: string | null;
  discovered_at: string;
  competitor_name?: string;
}

export interface CompetitorScrapeStatus {
  competitor_id: string;
  competitor_name: string;
  last_scraped_at: string | null;
  last_scrape_summary?: CompetitorLastScrapeSummary | null;
  total_events: number;
  recent_events: CompetitorEventClient[];
}

// ── CEO Dashboard ──

export interface CeoDashboardSnapshot {
  emailsCreated: number;
  emailsSent: number;
  va2ManifestsGenerated: number;
  topTheme: string | null;
  avgSectionCount: number | null;
  batchJobsCreated: number;
  batchJobsCompleted: number;
  batchJobsFailed: number;
  totalDerivativesGenerated: number;
  channelSuccessRates: Record<string, number>;
  avgOpenRate: number | null;
  avgClickThroughRate: number | null;
  avgConversionRate: number | null;
  topPerformingContentId: string | null;
  topPerformingOpenRate: number | null;
  campaignsWithData: number;
  complianceScanTotal: number;
  compliancePassRate: number | null;
  avgComplianceScore: number | null;
  commonViolations: Array<{ type: string; count: number }>;
  competitorEventsDiscovered: number;
  significantCompetitorMoves: number;
  activeCompetitorsCount: number;
  topCompetitorEventType: string | null;
  contentInDraft: number;
  contentInReview: number;
  contentApproved: number;
  contentPublished: number;
  activeTeamMembers: number;
  contentPerMember: number | null;
  snapshotDate: string;
  generatedAt: string;
  generationDurationMs: number;
}

export interface CeoDashboardTrend {
  date: string;
  emailsSent: number;
  avgOpenRate: number | null;
  batchJobsCompleted: number;
  compliancePassRate: number | null;
  competitorEvents: number;
}

export interface MpTriggerClient {
  id: string;
  user_id: string;
  trigger_type: string;
  content_id: string | null;
  batch_job_id: string | null;
  compliance_scan_id: string | null;
  points_earned: number;
  multiplier: number;
  details: Record<string, unknown>;
  status: string;
  credited_at: string | null;
  created_at: string;
}

export interface MpTriggerSummaryUser {
  user_id: string;
  total_points: number;
  trigger_count: number;
  pending_points: number;
}

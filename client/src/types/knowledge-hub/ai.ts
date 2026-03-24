/**
 * Messign AI Brain — Frontend Type Definitions
 *
 * Types for the AI assistant UI: messages, SSE events, charts, tables, metadata.
 * These mirror the backend SSE event types from server/src/services/ai/types.ts.
 */

// ============================================================
// MESSAGE TYPES
// ============================================================

export interface SpecialistInfo {
  module: string;
  displayName: string;
  icon: string;
}

/** Act mode: server asked for confirmation before executing a mutation */
export interface DoraPendingConfirmation {
  action: string;
  params: Record<string, unknown>;
  message: string;
  sourceQuery: string;
  sourceIntentId?: string;
}

/** Token-based pending action from SSE `pending_action` (action interceptor) */
export interface DoraPendingActionDisplayField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'date' | 'number' | 'readonly';
  value: unknown;
  options?: Array<{ label: string; value: string }>;
  editable: boolean;
}

export interface DoraPendingActionContent {
  token: string;
  actionType: string;
  description: string;
  displayFields: DoraPendingActionDisplayField[];
  editableFields: string[];
  expiresAt: string;
  payload: Record<string, unknown>;
  riskLevel?: 'write' | 'irreversible';
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Registry intent id when the user sent a chip suggestion */
  intentId?: string;
  /** Act mode — user must confirm before the assistant proceeds */
  pendingConfirmation?: DoraPendingConfirmation;
  /** SSE `pending_action` — server-held token for execute/cancel APIs */
  pendingAction?: DoraPendingActionContent;
  actionStatus?: 'pending' | 'confirmed' | 'cancelled' | 'executed';
  /** Which specialist handled this response (orchestrator routing) */
  specialist?: SpecialistInfo | null;
  /** Metadata about the AI response (only on assistant messages) */
  metadata?: AIResponseMetadata;
  /** Source documents referenced (only on assistant messages) */
  sources?: AISourceDocument[];
  /** Chart data to render (only on assistant messages) */
  chartData?: AIChartPayload;
  /** Table data to render (only on assistant messages) */
  tableData?: AITablePayload;
  /** Generative UI widgets derived from tool results (Phase 5) */
  widgets?: AIWidgetPayload[];
  /** Whether this message is still being streamed */
  isStreaming?: boolean;
  /** Whether feedback has been given */
  feedback?: 'up' | 'down' | null;
}

// ============================================================
// SSE EVENT TYPES (received from backend)
// ============================================================

export interface AIResponseMetadata {
  /** Names of AI tools that were called to answer this question */
  toolsUsed: string[];
  /** Total number of data records analyzed across all tools */
  dataPoints: number;
  /** How long the full response took in milliseconds */
  responseTimeMs: number;
  /** Number of reasoning steps in the agentic loop (Phase 3) */
  steps?: number;
  /** Why the reasoning loop terminated (Phase 3) */
  terminationReason?: string;
  /** Telemetry record ID for feedback linking (Phase 3) */
  telemetryId?: string;
  /** Chip / direct-intent id when answer came from preset execution */
  intentId?: string;
  /** Specialist module (from metadata when no specialist event) */
  specialist?: string | null;
  specialistDisplayName?: string | null;
  specialistIcon?: string | null;
  /** Marketing Agent: persisted content row after Instagram workflow */
  marketingContentId?: string | null;
  /** Public URL for generated image (omit or empty when unavailable) */
  marketingImageUrl?: string | null;
  /** `marketing_content.status` after persisted workflow (e.g. `in_review`, `draft`) */
  marketingContentStatus?: string | null;
  /** Compact gatekeeper summary from agent pipeline */
  marketingValidation?: Record<string, unknown>;
}

export interface AISourceDocument {
  id: string;
  title: string;
  slug?: string;
  document_type?: string;
}

// ============================================================
// CHART TYPES
// ============================================================

export interface AIChartPayload {
  /** Which Recharts component to render */
  chartType: 'bar' | 'line' | 'pie' | 'radar';
  /** Chart title shown above the chart */
  title: string;
  /** Data array for Recharts */
  data: Record<string, unknown>[];
  /** Key used for the X-axis (or name field for pie charts) */
  xKey: string;
  /** Keys for the data series (bars, lines, pie slices) */
  dataKeys: string[];
  /** Optional color overrides for each data key */
  colors?: string[];
}

// ============================================================
// TABLE TYPES
// ============================================================

export interface AITablePayload {
  /** Table title shown above the table */
  title: string;
  /** Column definitions */
  columns: AITableColumn[];
  /** Row data */
  rows: Record<string, unknown>[];
}

export interface AITableColumn {
  /** Key matching the row data field */
  key: string;
  /** Human-readable header label */
  label: string;
  /** Optional alignment */
  align?: 'left' | 'center' | 'right';
}

// ============================================================
// GENERATIVE UI WIDGET TYPES (Phase 5)
// ============================================================

export type AIWidgetType =
  | 'system_overview'
  | 'task_table'
  | 'performance_overview'
  | 'financial_summary'
  | 'team_overview'
  | 'project_status'
  | 'revenue_chart'
  | 'data_table'
  | 'dora_dash'
  | 'invoice_preview'
  | 'leaderboard_list';

/** Whitelisted actions emitted by the server for dynamic block toolbars (navigate / follow-up message). */
export type WidgetBlockAction =
  | { id: string; label: string; kind: 'navigate'; to: string; state?: unknown }
  | { id: string; label: string; kind: 'send_message'; text: string; intentId?: string };

export interface AIWidgetPayload {
  /** Optional schema version for forward-compatible clients (default 1). */
  schemaVersion?: number;
  /** Stable id for React keys, analytics, and deep links */
  id?: string;
  widgetType: AIWidgetType;
  /** Human-readable title for the widget (from tool summary) */
  title: string;
  /** Raw structured data from the tool result — typed in each widget component */
  data: unknown;
  /** Server-declared toolbar actions (merged with client registry in AIWidgetRenderer) */
  actions?: WidgetBlockAction[];
}

// Typed data shapes consumed by each widget:

/** Rich widget: single invoice (from `finance:get_invoice_details` when one row). */
export interface InvoicePreviewData {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  status: string;
  currency: string;
  amount: number;
  issueDate: string;
  dueDate: string | null;
  lineItems?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
}

export interface LeaderboardEntry {
  rank: number;
  userId?: string;
  name: string;
  subtitle?: string;
  value: number | string;
  trend?: 'up' | 'down' | 'flat';
}

/** Rich widget: XP / rankings (from `achievements:get_achievements_leaderboard`). */
export interface LeaderboardData {
  title: string;
  metricLabel: string;
  entries: LeaderboardEntry[];
  maxRows?: number;
  emptyMessage?: string;
  variant?: 'compact' | 'full';
}

export interface SystemOverviewData {
  users: { total: number; active: number };
  tasks: { total: number; completed: number; in_progress: number; open: number; blocked: number; overdue: number };
  projects: { total: number; active: number };
  documents: { total: number; published: number; drafts: number; in_review: number };
  activities: { total: number; this_week: number; today: number };
}

export interface TaskRow {
  id?: string;
  task_name?: string;
  title?: string;
  description?: string;
  due_date?: string | null;
  priority?: string | null;
  status?: string;
  project_name?: string | null;
  assignees?: string[];
  tags?: string[];
}

// ============================================================
// SUGGESTION TYPES
// ============================================================

export interface AISuggestion {
  /** Display text on the chip */
  label: string;
  /** The actual query to send (can differ from label for better AI routing) */
  query: string;
  /** Icon name from Lucide React */
  icon?: string;
  /** Category for grouping */
  category?: 'quick' | 'performance' | 'projects' | 'finance' | 'knowledge';
}

// ============================================================
// CHAT STATE
// ============================================================

export interface AIChatState {
  messages: AIMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  /** Whether the user has toggled concise mode */
  conciseMode: boolean;
}

// ============================================================
// PRESENTATION TYPES (existing, keep compatible)
// ============================================================

export interface AIPresentation {
  title: string;
  slides: AIPresentationSlide[];
}

export interface AIPresentationSlide {
  title: string;
  bullets: string[];
}

// ============================================================
// TOOL DISPLAY MAPPING
// ============================================================

/**
 * Maps tool names to human-readable labels and icons.
 * Used by AIMetadataBar to show which data sources were queried.
 */
export const TOOL_DISPLAY_MAP: Record<string, { label: string; icon: string; color: string }> = {
  search_knowledge_base: { label: 'Knowledge Base', icon: 'BookOpen', color: 'text-primary-400' },
  get_employee_performance: { label: 'Performance', icon: 'TrendingUp', color: 'text-success-500' },
  get_project_status: { label: 'Projects', icon: 'FolderKanban', color: 'text-accent-500' },
  get_tasks_by_user: { label: 'Tasks', icon: 'CheckSquare', color: 'text-warning-500' },
  get_team_overview: { label: 'Team Metrics', icon: 'Users', color: 'text-primary-400' },
  get_sprint_status: { label: 'Sprint', icon: 'Zap', color: 'text-warning-500' },
  get_financial_summary: { label: 'Finance', icon: 'DollarSign', color: 'text-success-500' },
  get_reimbursement_details: { label: 'Reimbursements', icon: 'Receipt', color: 'text-success-500' },
  get_invoice_details: { label: 'Invoices', icon: 'FileText', color: 'text-success-500' },
  get_achievements_leaderboard: { label: 'Leaderboard', icon: 'Trophy', color: 'text-warning-500' },
  get_bounty_board: { label: 'Bounties', icon: 'Target', color: 'text-danger-500' },
  get_recent_activity: { label: 'Activity', icon: 'Activity', color: 'text-accent-500' },
  get_user_profile: { label: 'User Profile', icon: 'User', color: 'text-app-muted' },
  search_chat_messages: { label: 'Chat History', icon: 'MessageSquare', color: 'text-accent-400' },
  get_showcase_items: { label: 'Showcase', icon: 'Star', color: 'text-warning-500' },
  get_approval_queue: { label: 'Approvals', icon: 'ClipboardCheck', color: 'text-success-500' },
  get_system_stats: { label: 'System Stats', icon: 'BarChart3', color: 'text-app-muted' },
  get_meeting_decisions: { label: 'Meeting Notes', icon: 'Calendar', color: 'text-accent-500' },
  compare_employees: { label: 'Comparison', icon: 'GitCompare', color: 'text-danger-500' },
  get_department_report: { label: 'Executive Report', icon: 'PieChart', color: 'text-primary-400' },
  get_knowledge_base_stats: { label: 'Knowledge Stats', icon: 'BookOpen', color: 'text-accent-500' },
  get_available_questions: { label: 'Available Questions', icon: 'HelpCircle', color: 'text-primary-400' },
  play_dora_dash: { label: 'Dora Dash', icon: 'Gamepad2', color: 'text-accent-500' },
};

# Messign Workspace — Full Bottom-to-Top Architectural Audit Report

**Generated:** March 13, 2025  
**Purpose:** External architect review  
**Project Root:** `/Users/hamzaakcit/messign-workspace`

---

## 1. DATABASE LAYER

### 1.1 Schema Inventory

#### Migration Locations
- **Primary:** `db/migrations/` — 001_add_tenant_id.sql, 002_enable_rls.sql, 003_*, 004_rls_gap_fix.sql
- **Server:** `server/src/migrations/` — 001–063+ (includes rag_phase2.sql, 061_unified_embeddings.sql, knowledge_hub_v12.sql, etc.)

#### Tables with `tenant_id` (from 001_add_tenant_id.sql and 004_rls_gap_fix.sql)
| Table | tenant_id | Notes |
|-------|-----------|-------|
| crm_deals | ✓ | |
| crm_contacts | ✓ | |
| crm_companies | ✓ | |
| crm_activities | ✓ | |
| crm_pipelines | ✓ | |
| crm_deal_stages | ✓ | |
| reimbursement_settings | ✓ | |
| reimbursement_requests | ✓ | |
| expense_categories | ✓ | |
| finance_budgets | ✓ | |
| invoices | ✓ | |
| marketing_campaigns | ✓ | |
| marketing_leads | ✓ | |
| marketing_content | ✓ | |
| recruitment_jobs | ✓ | |
| recruitment_candidates | ✓ | |
| recruitment_applications | ✓ | |
| recruitment_interviews | ✓ | |
| support_tickets | ✓ | |
| support_sla_policies | ✓ | |
| time_timesheets | ✓ | |
| time_entries | ✓ | |
| assets | ✓ | |
| contracts | ✓ | |
| dora_insights | ✓ | |
| dora_automation_policies | ✓ | |
| dora_sessions | ✓ | |
| dora_messages | ✓ | |
| heart_pulse_surveys | ✓ | |
| heart_pulse_responses | ✓ | |
| asset_categories | ✓ | |
| licenses | ✓ | |
| reimbursement_users | ✓ | (004_rls_gap_fix) |

#### Row-Level Security (RLS)
- **002_enable_rls.sql:** `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`
- **Function:** `current_tenant_id()` returns `current_setting('app.current_tenant', true)::UUID`
- **Policy pattern:** `tenant_isolation` — `USING (tenant_id = current_tenant_id())`
- **entity_embeddings** (061_unified_embeddings.sql): RLS enabled with `tenant_isolation` policy

#### pgvector
- **Extension:** `CREATE EXTENSION IF NOT EXISTS vector`
- **Tables with vector columns:**

| Table | Column | Dimensions |
|-------|--------|------------|
| document_chunks | embedding | 1536 (text-embedding-3-small) |
| entity_embeddings | embedding | 1536 |
| knowledge_embeddings | embedding | 1024 (legacy, knowledge_hub_v12.sql) |

- **Indexes:** HNSW on `document_chunks.embedding` (vector_cosine_ops), `entity_embeddings.embedding`

#### Key Table Schemas (from migrations)

**document_chunks** (rag_phase2.sql):
```sql
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  heading TEXT,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding vector(1536),
  metadata JSONB NOT NULL DEFAULT '{}',
  content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- idx_dc_document_id, idx_dc_content_tsv (GIN), idx_dc_metadata (GIN), idx_dc_embedding_hnsw
```

**entity_embeddings** (061_unified_embeddings.sql):
```sql
CREATE TABLE IF NOT EXISTS entity_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  source_module TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  content_text TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding vector(1536) NOT NULL,
  access_roles TEXT[] DEFAULT '{}',
  sensitivity TEXT DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.2 Database Access Patterns

#### Connection
- **File:** `server/src/db/index.ts`
- **Client:** `pg.Pool` (node-postgres)
- **Config:** `max: usePgBouncer ? 10 : 20`, `idleTimeoutMillis`, `connectionTimeoutMillis`
- **Tenant scoping:** `withTenantQuery(tenantId, fn)` — sets `app.current_tenant` before query, clears after

#### PgBouncer
- **Referenced:** `.env.example` — `PGBOUNCER_URL` (port 6432)
- **Note:** `pool_mode=transaction` required for RLS

#### DAL Files (`server/src/dal/` and `server/src/modules/*/dal/`)
| File | Description |
|------|-------------|
| doraInsights.ts | Dora insights CRUD, tenant-scoped |
| doraReads.ts | Dora read receipts |
| projects.ts | Projects, tasks |
| channels.ts | Chat channels |
| contracts/ | Contract DAL (multiple files) |
| budgets.ts | Finance budgets |
| invoices.ts | Invoices (uses rbacWhereClause) |
| expenses.ts | Expenses (uses rbacWhereClause) |
| okrs.ts | OKRs |
| marketing/ | Marketing DAL |
| heart/ | Heart/culture DAL |
| time/ | Time tracking DAL |
| assets/ | Asset DAL |
| reports/ | Report DAL |
| executive/ | Executive dashboard DAL |
| helpers.ts | rbacWhereClause, paginationClause |
| types.ts | CallerContext, etc. |

#### Tenant Scoping Examples

**rbacWhereClause** (`server/src/dal/helpers.ts`):
```typescript
export function rbacWhereClause(
  ctx: CallerContext,
  userIdColumn: string = 'user_id',
  departmentColumn: string = 'department_id',
  paramOffset: number = 1,
): { clause: string; params: unknown[] } {
  switch (ctx.role) {
    case 'employee':
      return { clause: `${userIdColumn} = $${paramOffset}`, params: [ctx.userId] };
    case 'manager':
      return {
        clause: `(${userIdColumn} = $${paramOffset} OR ${userIdColumn} IN (SELECT id FROM reimbursement_users WHERE manager_id = $${paramOffset}))`,
        params: [ctx.userId],
      };
    case 'dept_head':
      return { clause: `${departmentColumn} = $${paramOffset}`, params: [ctx.departmentId] };
    case 'finance_admin':
    case 'system_admin':
      return { clause: '1=1', params: [] };
    default:
      return { clause: '1=0', params: [] };
  }
}
```

**Example usage (invoices.ts):**
```typescript
const rbac = rbacWhereClause(ctx, 'i.employee_id', 'i.organization_id', idx);
// Used in WHERE clause
```

**Example usage (expenses.ts):**
```typescript
const rbac = rbacWhereClause(ctx, 'r.submitted_by', 'r.team_id', idx);
```

---

## 2. AUTHENTICATION & AUTHORIZATION

### 2.1 Auth Middleware

#### requireAuth (`server/src/middleware/requireAuth.ts`)
- **Source:** `userId` from `req` (set by optionalJwt) or `X-User-Id` header
- **Lookup:** `reimbursement_users` by `auth_user_id`
- **Sets on req:** `req.userId`, `req.role`, `req.tenantId`, `req.organizationId`

#### optionalJwt / requireJwt (`server/src/middleware/authMiddleware.ts`)
- **Verification:** `verifyAccess(token)` (JWT)
- **Sets:** `req.userId`, `req.role`, `req.sessionId`
- **optionalJwt:** Does not block if no token; requireJwt blocks with 401

#### reimbursementAuth (`server/src/middleware/reimbursementAuth.ts`)
```typescript
export async function reimbursementAuth(req: ReimbursementRequest, res: Response, next: NextFunction): Promise<void> {
  const authUserId = req.headers['x-user-id'] as string | undefined;
  if (!authUserId) {
    res.status(401).json({ error: 'Missing x-user-id header' });
    return;
  }
  // Lookup org by slug 'messign', then reimbursement_users by auth_user_id
  req.reimbursementUser = mapReimbursementUser(row);
  req.organizationId = orgId;
  req.tenantId = orgId;
  next();
}
```

#### requireRole (`server/src/middleware/reimbursementAuth.ts`)
```typescript
export function requireRole(...roles: string[]) {
  return (req: ReimbursementRequest, res: Response, next: NextFunction): void => {
    const user = req.reimbursementUser;
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (roles.includes(user.role)) {
      next();
      return;
    }
    res.status(403).json({ error: 'Insufficient role' });
  };
}
```

#### Roles Found in Codebase
- `admin`, `finance`, `manager`, `employee`, `dept_head`, `finance_admin`, `system_admin`, `cpo`, `hr`

### 2.2 RBAC Implementation

- **rbacWhereClause:** See Section 1.2
- **Role flow:** `reimbursementAuth` / `requireAuth` → `req.reimbursementUser.role` or `req.role` → passed to DAL as `CallerContext`
- **Route → middleware mapping:** See Section 5.1

---

## 3. EVENT SYSTEM

### 3.1 Event Bus

**File:** `server/src/platform/eventBus.ts` (or `server/src/events/eventBus.ts`)
- **Implementation:** mitt-based (`emit`, `on`, `off`)

**Event Types** (`server/src/events/eventTypes.ts`):
- Finance, project, chat, knowledge, hr, gamification, crm, marketing, recruitment, assets, contracts, support, time, okr, system, heart, dora

**Subscribers** (`server/src/events/subscribers/`):
| Subscriber | Events | Behavior |
|------------|--------|----------|
| auditSubscriber | audit:* | Log audit events |
| gamificationSubscriber | gamification:* | Award XP, badges |
| notificationSubscriber | notification:* | Enqueue notification job |
| doraSubscriber | dora:* | emitToUser('dora:new-insight'), emitToUser('dora:insight-counts') |
| automationSubscriber | automation:* | Trigger automations |
| webhookSubscriber | webhook:* | Enqueue webhook job |
| celebrationSubscriber | celebration:* | emitToUser('celebration:sprint-completed') |
| cacheInvalidationSubscriber | cache:* | Invalidate caches |
| graphSyncSubscriber | graph:* | Sync graph data |
| crmSubscriber | crm:* | emitToUser('celebration:deal-won') |

### 3.2 BullMQ Queues & Workers

**Connection:** `server/src/queue/connection.ts` — `REDIS_URL`, ioredis

**Queues:**
- `cross-module` — crossModuleWorker
- `notifications` — notificationWorker
- `gamification` — gamificationWorker
- `dora-insights` — doraInsightsWorker
- `dora-scheduler` — doraSchedulerWorker
- `analytics` — analyticsWorker
- `webhooks` — webhookWorker
- `embeddings` — embeddingWorker

**Workers:**
| Worker | Queue | Behavior |
|--------|-------|----------|
| doraInsightsWorker | dora-insights | Handles: analyze_sentiment, expense_created, invoice_overdue, budget_threshold_breached, support_sla_breached, support_pattern_detected, support_volume_spike, support_ticket_created, crm_deal_won, crm_deal_stale. Calls insight generators, emits via eventBus |
| doraSchedulerWorker | dora-scheduler | budget_health_check, sla_check, overdue_invoice_check, recurring_invoice_generation, refresh_materialized_views, support_sla_check, customer_health_recalc, support_pattern_detection, daily_briefing (generateBriefing + emitToUser('dora:briefing-ready')), burnout_check, team_health, weekly_sentiment, onboarding_milestones, pulse_survey |
| notificationWorker | notifications | Sends notifications, emitToUser('notification:new') |
| embeddingWorker | embeddings | Generates embeddings for RAG |
| webhookWorker | webhooks | Delivers webhooks |
| crossModuleWorker | cross-module | Cross-module jobs |

---

## 4. AI SYSTEM (DORA)

### 4.1 Tool Registry

**File:** `server/src/services/ai/toolRegistry.ts`

```typescript
export function registerTool(tool: Tool): void;
export function getAllTools(): Tool[];
export function getTool(name: string): Tool | undefined;
export function getFullToolDefinition(name: string): FullToolDefinition | null;
export function getToolCount(): number;
export function getToolsForLLM(): LLMToolDefinition[];
export function getToolsForNamespace(namespace: string, userRoles: string[]): LLMToolDefinition[];
export function getBaseToolsForLLM(userRoles: string[]): LLMToolDefinition[];
export async function finalizeRegistry(): Promise<void>;
export async function executeTool(name: string, args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
```

**Registration:** `server/src/services/ai/tools/index.ts` — imports all tool modules; `finalizeRegistry()` at startup. Module tools registered via `server/src/modules/registry.ts` → `registerToolFromModule()`.

**Tool Files** (`server/src/services/ai/tools/`):
| File | Tool Name(s) | Description | Roles | Read/Write | DAL/Tables |
|------|--------------|-------------|-------|------------|------------|
| searchKnowledgeBase.ts | knowledge:search_knowledge_base | Search Knowledge Hub docs | — | Read | knowledge_documents, document_chunks, entity_embeddings, hybridSearch |
| core/searchTools.ts | core:search_tools | Search tool metadata index | — | Read | toolIndex |
| core/activateTool.ts | core:activate_tool | Activate deferred tool | — | Read | toolRegistry |
| systemStats.ts | analytics:get_system_stats | System overview | — | Read | Various |
| tasksByUser.ts | projects:get_tasks_by_user | Tasks for user | — | Read | tasks |
| projectStatus.ts | projects:get_project_status | Project status | — | Read | projects |
| financialSummary.ts | finance:get_financial_summary | Financial summary | finance, admin | Read | finance DAL |
| invoiceDetails.ts | finance:get_invoice_details | Invoice details | finance, admin | Read | invoices |
| approvalQueue.ts | finance:get_approval_queue | Approval queue | manager, finance, admin | Read | expenses |
| employeePerformance.ts | hr:get_employee_performance | Employee performance | manager, hr, admin | Read | performance |
| channelMessages.ts | communication:search_chat_messages | Search chat | — | Read | chat |
| achievementsBadges.ts | achievements:get_achievements_leaderboard | Leaderboard | — | Read | badges, xp |
| activityFeed.ts | analytics:get_recent_activity | Recent activity | — | Read | activities |
| userProfile.ts | team:get_user_profile | User profile | — | Read | users |
| departmentReport.ts | analytics:get_department_report | Department report | admin, cpo | Read | departments |
| availableQuestions.ts | system:get_available_questions | Available questions | — | Read | — |
| knowledgeBaseStats.ts | knowledge:get_knowledge_base_stats | KB stats | — | Read | knowledge_documents |
| doraDash.ts | fun:play_dora_dash | Dora Dash game | — | Read | — |
| write/writeToolsV2.ts | projects:create_task, projects:update_task, finance:draft_invoice, etc. | Write tools | Various | Write | projects, finance, crm, support, etc. |

**WRITE_TOOL_NAMES** (from writeDefinitions.ts): projects:create_task, projects:update_task_status, projects:update_task, finance:draft_invoice, communication:send_chat_message, finance:approve_expense, finance:flag_expense, finance:create_budget_alert, finance:create_budget, finance:update_budget, core:send_reminder, finance:auto_approve_expense, finance:flag_expense_for_review, finance:generate_invoice, finance:send_payment_reminder, finance:suggest_budget_reallocation, crm:create_deal, support:create_ticket, assets:assign_asset, contracts:send_renewal_reminder, marketing:create_campaign, recruitment:post_job

### 4.2 Agentic Loop

**File:** `server/src/services/ai/orchestrator/agenticLoop.ts`

```typescript
export async function orchestrate(
  query: string,
  history: Array<{ role: string; content: string }>,
  ctx: DoraRequestContext,
  legacyContext: ToolContext,
  onChunk: (chunk: string) => void,
  config: Partial<OrchestratorConfig> & { provider?: string } = {},
): Promise<OrchestrationResult>
```

- **Max steps:** 6 (DEFAULT_ORCHESTRATOR_CONFIG)
- **Tool loop:** ReAct (THINK → ACT → OBSERVE); tool results fed back as assistant message with tool_calls + tool results
- **Conversation history:** Trimmed via trimHistory(history, 1000); recent messages appended to LLM messages
- **System prompt:** `buildDoraAgenticPrompt(ctx)` from `agenticPrompts.ts`

**Main system prompt excerpt** (`agenticPrompts.ts`):
```
# You are Dora — the intelligent brain of Messign Workspace.

## CRITICAL TOOL EXECUTION RULES
1. You have access to a massive external tool library, but ONLY a few basic tools are currently loaded...
2. NEVER guess, hallucinate, or assume a tool exists...
3. All tools use namespace format: "module:action"
4. If you need a tool not loaded, MUST call core:search_tools first
5. Wait for core:activate_tool before executing

WORKFLOW:
- Assess request → Check available tools → If not in schema, use core:search_tools → Wait for core:activate_tool
```

### 4.3 AI Cascade & Routing

**aiCascade.ts / taskRouter.ts:** NOT FOUND. Replaced by `gateway.ts`.

**File:** `server/src/services/ai/gateway.ts`
- **Client:** LiteLLM proxy (`LITELLM_URL`, `LITELLM_MASTER_KEY`)
- **Functions:** `callModelSafe`, `streamModelSafe`
- **Tiers:** `fast`, `balanced`, `complex`, `vision` — model strings from LiteLLM config
- **Fallback:** Tries tiers in order until success

**API Key References:**
- `.env.example`: GROQ_API_KEY, GOOGLE_GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY (optional; used by LiteLLM)
- `gateway.ts`: Uses LITELLM_URL, LITELLM_MASTER_KEY — no direct API keys in app code

### 4.4 Intent Router (Legacy)

**File:** `server/src/services/ai/intentRouter.ts`

- **Deprecated:** Yes — fallback when orchestrator and agentic loop fail
- **Entry points:** `POST /api/knowledge-hub/ai/answer` — fallback path when `runOrchestrator` and `orchestrate` throw
- **Presentations:** `routeQuery` used for presentation data; synthesis via Groq/Gemini
- **Briefings:** Not used for briefings (dailyBriefing.ts uses direct DAL)

### 4.5 Dora Context & Prompts

**buildDoraContext** (`server/src/services/ai/dora/context.ts`):
```typescript
export async function buildDoraContext(
  userId: string,
  role: string | undefined,
  currentPath: string,
  conciseMode: boolean,
): Promise<Readonly<DoraRequestContext>>
```
- Queries: organizations, reimbursement_users, knowledge_user_roles, performance_team_members
- Returns: user (userId, userUuid, userName, userRole, organizationId, department, teamId, knowledgeRole, level, mpPoints), page (currentPath, currentModule), timestamp, todayDate, conciseMode

**Prompt files:**
- `server/src/services/ai/dora/agenticPrompts.ts` — buildDoraAgenticPrompt, buildForcedSynthesisPrompt
- `server/src/services/ai/dora/prompts.ts` — buildDoraRouterPrompt (legacy)

### 4.6 HITL / Action System

**Action Interceptor** (`server/src/services/ai/actions/actionInterceptor.ts`):
- `isWriteTool(toolName)` — checks WRITE_TOOL_NAMES
- `interceptWriteAction(toolName, args, ctx, originQuery)` — builds preview, creates pending action, returns ToolResult + PendingActionSSEEvent

**Action Store** (`server/src/services/ai/actions/actionStore.ts`):
- `createPendingAction(...)` — stores pending action, returns token

**Action Executor:** `server/src/services/ai/agents/approvalFlow.ts` — executes approved actions, emitToUser('dora:action_completed' | 'dora:action_rejected')

**Gated tools:** All tools in WRITE_TOOL_NAMES (see 4.1)

### 4.7 RAG System

**search_knowledge_base** (`server/src/services/ai/tools/searchKnowledgeBase.ts`):
- Prefers Phase 2 RAG: hybridSearchChunks, semanticSearchChunks, hybridSearch from knowledgeSearch.js; ragHybridSearch from rag/db.js
- Fallback: ILIKE on knowledge_documents
- Entity search: searchEmbeddings from rag/embeddingPipeline.js
- Context format: `### Source: {Title} > {HeadingPath}\n{Content}`

**Embeddings** (`server/src/services/rag/embeddings.ts`):
- `embedViaGateway` (LiteLLM → text-embedding-3-small, 1536 dims)
- Fallback: local hash-based vectors (384 dims, not semantic)
- `embedTexts`, `embedChunks`, `embedQuery`

**Vector search:** HNSW with vector_cosine_ops (cosine similarity)

### 4.8 Daily Briefing & Insights

**dailyBriefing.ts** (`server/src/services/dora/dailyBriefing.ts`):
- Sections: Needs Your Attention (pending actions), Sales Pipeline, Support Queue, Finance, Your Tasks, Goals & OKRs, Hiring, Time Tracking, Dora Insights
- `getOrGenerateBriefing`, `generateBriefing` — role-based section visibility

**doraInsightsWorker:** See Section 3.2

**doraScheduler.ts** (`server/src/services/finance/doraScheduler.ts`):
- Cron jobs: budget_health_check, sla_check, overdue_invoice_check, recurring_invoice_generation, refresh_materialized_views, support_sla_check, customer_health_recalc, support_pattern_detection, daily_briefing, burnout_check, team_health, weekly_sentiment, onboarding_milestones, pulse_survey

---

## 5. API ROUTES

### 5.1 Route Inventory

**Mount order** (`server/src/index.ts`):
```
/health (no auth)
/api/* (optionalJwt)
/api/auth
/api/users (requireAuth)
/api/channels (requireAuth)
/api/messages (requireAuth)
/api/chat (requireAuth)
/api/projects (requireAuth)
/api/tasks
/api/badges
/api/documents
/api/activities
/api/leaderboard
/api/admin
/api/categories
/api/exchange-rates
/api/mileage
/api/settings/reimbursement
/api/signatures
/api/performance (requireAuth)
/api/dashboard (requireAuth)
/api/departments
/api/bounties
/api/sprints
/api/showcase
/api/knowledge
/api/ai/actions (requireAuth)
/api/game (requireAuth)
/api/dora (doraInsightsRouter, doraAutomationsRouter, doraFiltersRouter, doraBriefingRouter, doraApprovalsRouter)
/api/dora (requireAuth, doraHistoryRouter)
/api/seed
/api/reports
/api/webhooks
/api/notifications
initializeModules → /api/crm, /api/support, /api/finance, /api/hr, /api/marketing, /api/knowledge-hub, /api/time, /api/okr, /api/heart, /api/executive, /api/assets, /api/contracts
```

**Knowledge Hub** (`server/src/routes/knowledge-hub/index.ts`):
- All under `requireAuth`
- `/ai` → aiRouter, `/ai/admin` → aiAdminRouter, `/documents`, `/categories`, `/tags`, `/search`, `/versions`, `/comments`, `/workflow`, `/bookmarks`, `/collections`, `/notifications`, `/flags`, `/analytics`, `/teams`, `/upload`, `/roles`

### 5.2 Dora-specific Routes

**POST /api/knowledge-hub/ai/answer** (`server/src/routes/knowledge-hub/ai.ts`):
- Auth: requireAuth (via knowledgeHubRouter)
- Flow: buildDoraContext → runOrchestrator (primary) → on NoSpecialistError/orchestrator failure → orchestrate (agentic loop) → on failure → routeQuery (intent router) + streamGroqAnswer/streamGeminiAnswer
- SSE: text, sources, metadata, done, pending_action, widget_data, error

**GET /api/dora/briefing** (via doraBriefingRouter): Returns daily briefing for user

---

## 6. SOCKET.IO / REALTIME

**Setup:** `server/src/sockets/index.ts`

**emitToUser(userId, event, data):**
- Looks up socket by userId; fallback: lookup reimbursement_users by id → auth_user_id
- `socket.emit(event, data)`

**emitToRole, emitToDepartment, emitBroadcast:** Also implemented

**Socket auth:** `io.use` middleware — JWT from `socket.handshake.auth?.token` or `Authorization` header; `verifyAccess(token)`; sets `socket.data.userId`, `socket.data.role`

**Event names emitted server-side:**
- dora:new-insight, dora:insight-counts, dora:briefing-ready, dora:approval_required, dora:action_completed, dora:action_rejected
- invoice:generated, invoice:finalized, invoice:rejected
- notification:new, dora_notification, finance:notification, finance:expense:status_changed, finance:expense:ai_step
- celebration:deal-won, celebration:sprint-completed, celebration:badge-earned, celebration:okr-kr-completed
- message:new, xp:gained, activity:new, task:updated, user:status
- kh:status-changed, kh:notification, kh:comment-added, kh:comment-resolved
- knowledge:new_document, knowledge:required_reading, knowledge:document_updated, knowledge:flag_created, knowledge:flag_resolved

---

## 7. FRONTEND STRUCTURE

### 7.1 Page Inventory

**Dora-related:** DoraPage.tsx, DailyBriefingPage.tsx, AutomationPoliciesPage.tsx, AutomationLogPage.tsx, AIAssistantPage.tsx (knowledge-hub), DoraDashPage.tsx

**Other:** LoginPage, SignUpPage, DashboardView, ChatView, TeamView, KnowledgeView, ProjectsView, FinancePage, ReimbursementDashboard, ReimbursementForm, ApprovalQueue, CRMPipelinePage, SupportTicketsPage, ExecutiveDashboardPage, OKRPage, etc. (see client/src/pages/)

### 7.2 State Management (Zustand)

| Store | Purpose |
|-------|---------|
| authStore | Auth state, persist |
| doraStore | Dora chat sessions, messages, persist |
| dailyBriefingStore | Daily briefing, persist |
| notificationStore | Notifications, persist |
| uiStore | UI state |
| financeStore | Finance state |
| dashboardStore | Dashboard state |
| chatStore | Chat state |
| knowledgeHubStore | Knowledge Hub state |
| themeStore | Theme |
| gameStore | Game state |
| projectStore | Projects, tasks |
| usersStore | Users |

**doraStore** (`client/src/stores/doraStore.ts`): sessions, activeSessionId; createSession, setActiveSession, deleteSession, clearAllSessions, getActiveMessages, setActiveMessages, updateSessionTitle; persist to localStorage

### 7.3 API Client

- **Config:** `client/src/lib/api.ts` — API_ORIGIN
- **Auth:** `getAccessToken()` from `@/lib/authToken`; Bearer token in headers
- **Pattern:** fetch/axios with Authorization header

### 7.4 Socket.io Client

- **Connection:** Socket.io client connects with auth token
- **Events:** Listens for dora:*, notification:*, celebration:*, etc.

---

## 8. CONFIGURATION & INFRASTRUCTURE

### 8.1 Package Dependencies

**Root package.json:** workspaces: client, server; scripts: dev, litellm, build, db:*

**Server:** express, pg, socket.io, bullmq, ioredis, dotenv, etc.

**Client:** react, zustand, etc.

### 8.2 Environment Variables

From `.env.example`:
- DATABASE_URL, DATABASE_ADMIN_URL, PGBOUNCER_URL
- REDIS_URL
- JWT_SECRET, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
- CLIENT_URL, ADDITIONAL_CORS_ORIGINS
- ENCRYPTION_KEY
- PORT, NODE_ENV, UPLOAD_DIR
- GROQ_API_KEY, GOOGLE_GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY
- LITELLM_MASTER_KEY, LITELLM_URL
- COMPANY_*, INVOICE_PREFIX
- SEED_SECRET, CRON_SECRET
- GRAPHHOPPER_API_KEY, ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY

### 8.3 Docker / Deployment

- **Dockerfile:** NOT FOUND in project root
- **Deployment:** Railway (from DEPLOYMENT.md), Vercel for frontend
- **LiteLLM:** Run via `npm run litellm` (Python)

---

## 9. CODE QUALITY & PATTERNS

### 9.1 TypeScript

- **tsconfig:** Standard Node/React configs
- **Strict mode:** Check tsconfig.json for strict flags
- **Path aliases:** @/ in client

### 9.2 Error Handling

- **Global handler:** `app.use((err, req, res, next) => ...)` in index.ts
- **DAL:** try/catch in some; errors propagated
- **AI tools:** executeTool catches, returns ToolResult with success: false

### 9.3 Testing

- **Framework:** Playwright (@playwright/test)
- **Test files:** Search for *.spec.ts, *.test.ts
- **AI tool tests:** Not explicitly found

---

## 10. IDENTIFIED ISSUES & ANTI-PATTERNS

1. **Cross-module DB imports:** Module DAL files import from `../../../dal/helpers.js` — acceptable. Check for CRM importing finance DAL directly.

2. **Hardcoded API keys:** None found; all via env.

3. **`any` usage:** `mapReimbursementUser(row as any)` in reimbursementAuth; `created: any` in ReimbursementForm.tsx

4. **Circular dependencies:** finalizeRegistry uses dynamic import for searchTools to avoid circular dependency.

5. **Unused/dead code:** intentRouter deprecated but still used as fallback.

6. **SQL injection:** Parameterized queries used (e.g. `$1`, `$2`). rbacWhereClause builds clause with param placeholders — safe.

7. **Missing error handling:** Some `.catch(() => {})` fire-and-forget (e.g. deleteSession fetch). Logging added in some places per prior work.

8. **Tools bypassing RBAC:** executeTool checks requiredRoles before execution. Module tools get context with userRole. Verify each write tool enforces tenant/role in DAL.

9. **Typo:** `oderId` in UserSocket interface (sockets/index.ts) — likely `userId`.

10. **Reimbursement users keyed by auth_user_id:** emitToUser uses userId; fallback maps reimbursement id → auth_user_id. Ensure consistency.

---

*End of Report*

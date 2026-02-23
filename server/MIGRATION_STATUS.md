# Backend: Mock vs Database Migration Status

This document lists which routes and data layers use the real PostgreSQL database and which still use in-memory mock data (no matching schema table).

## Migrated (using database)

### Reimbursement domain
- **Routes:** `reimbursements`, `categories`, `exchangeRates`, `approvals`, `reimbursement-settings`, `mileage`
- **Tables:** `organizations`, `reimbursement_users`, `expense_categories`, `reimbursement_requests`, `reimbursement_documents`, `approval_steps`, `mileage_claims`, `reimbursement_comments`, `reimbursement_activity_log`, `reimbursement_settings`, `exchange_rates`

### Performance domain
- **Routes:** `performance` (GET company, company/trends, teams/:teamId, teams/:teamId/members, teams/:teamId/trends)
- **Admin routes:** `admin/performance` (teams CRUD, team members CRUD, targets CRUD, export, audit)
- **Data layer:** `data/performance.ts` (getCompanyPerformance, getCompanyTrends, getTeamPerformance, getTeamTrends)
- **Tables:** `performance_teams`, `performance_team_members`, `performance_targets`, `performance_metrics`, `performance_audit_log`

### Auth / middleware (DB for validation only)
- **reimbursementAuth:** Resolves user by `reimbursement_users.auth_user_id` (no mock users).
- **requireAuth:** Validates via `reimbursement_users` by `auth_user_id` (used by `/api/performance`).
- **requireAdmin:** Validates via `reimbursement_users` by `auth_user_id` and `role = 'admin'`.

---

## Not migrated (mock data – no schema table)

These routes and data files still use in-memory arrays/variables. They cannot be migrated without adding the corresponding tables to the schema.

| Route / file | Data source | Missing schema |
|--------------|-------------|----------------|
| `routes/auth.ts` | data/users.js, data/badges.js | No `users` or `employees` table (level, xp, badges, department, jobTitle, etc.); no `badges` table |
| `routes/users.ts` | data/users.js, data/badges.js | Same |
| `routes/channels.ts` | data/channels.js | No `channels` table |
| `routes/messages.ts` | data/messages.js, data/users.js | No `messages` table; no users table |
| `routes/projects.ts` | data/projects.js, data/tasks.js | No `projects` or `tasks` tables |
| `routes/tasks.ts` | data/tasks.js, data/users.js, data/activities.js | No `tasks`, `users`, or `activities` tables |
| `routes/badges.ts` | data/badges.js | No `badges` or user-badges tables |
| `routes/documents.ts` | data/documents.js, data/users.js | No non-reimbursement `documents` or users table |
| `routes/activities.ts` | data/activities.js | No `activities` table |
| `routes/leaderboard.ts` | data/users.js, data/badges.js | No users/badges tables |
| `routes/admin/employees.ts` | data/users.js, data/departments.js, data/badges.js | No `employees`/users, no `departments` |
| `routes/admin/departments.ts` | data/departments.js, data/auditLogs.js | No `departments` table; no general `audit_log` table |
| `routes/admin/roles.ts` | data/roles.js, data/auditLogs.js | No `roles` table; no general audit log |
| `routes/admin/settings.ts` | data/settings.js, data/auditLogs.js | No app `settings` table; no general audit log |
| `routes/admin/audit.ts` | data/auditLogs.js | No general `audit_log` table (only reimbursement_activity_log and performance_audit_log exist) |
| `routes/admin/badges.ts` | data/badges.js, data/auditLogs.js | No badges/audit tables |
| `routes/admin/importExport.ts` | data/users.js, data/auditLogs.js | No users/audit tables |
| `sockets/index.ts` | data/messages.js, data/users.js, data/activities.js, data/channels.js, data/tasks.js | Same missing tables |

### In-memory only (no table in schema)
- **admin/performance metrics config and alerts:** `GET/PUT /admin/performance/metrics` and `GET/PUT /admin/performance/alerts` use in-memory variables; schema has no table for these.

---

## Schema reference

Database schema: `src/db/schema.sql`  
DB client: `src/db/index.ts` (`query<T>(text, params?)`, `getClient()`)

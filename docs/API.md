# Messign API Reference

Base URL: `/api` (relative to server origin, e.g. `http://localhost:3001`)

All endpoints except `/api/auth/login`, `/api/health`, and `/api/health/db` require authentication via session cookie or `Authorization: Bearer <token>`.

---

## Auth

| Method | Path | Description | Role |
|--------|------|-------------|------|
| POST | /api/auth/login | Login with email/password | Public |
| POST | /api/auth/logout | Logout, clear session | Authenticated |
| GET | /api/auth/me | Current user profile | Authenticated |
| POST | /api/auth/change-password | Change password | Authenticated |

---

## Finance

| Method | Path | Description | Role |
|--------|------|-------------|------|
| GET | /api/finance/expenses | List expenses (filter by status, category, date) | Finance |
| POST | /api/finance/expenses | Create expense | Finance |
| GET | /api/finance/expenses/:id | Get expense detail | Finance |
| PUT | /api/finance/expenses/:id | Update expense | Finance |
| POST | /api/finance/expenses/:id/submit | Submit for approval | Finance |
| POST | /api/finance/expenses/:id/approve | Approve expense | Manager/Admin |
| POST | /api/finance/expenses/:id/reject | Reject expense | Manager/Admin |
| GET | /api/finance/budgets | List budgets | Finance |
| POST | /api/finance/budgets | Create budget | Admin |
| GET | /api/finance/invoices | List invoices | Finance |
| POST | /api/finance/invoices | Create invoice | Finance |
| GET | /api/finance/vendors | List vendors | Finance |
| GET | /api/finance/payments | List payments | Finance |
| GET | /api/finance/dashboard | Dashboard metrics | Finance |
| GET | /api/finance/settings | Finance settings | Admin |

---

## CRM (Sales)

| Method | Path | Description | Role |
|--------|------|-------------|------|
| GET | /api/crm/pipelines | List pipelines | Sales |
| GET | /api/crm/pipelines/:id | Get pipeline with stages | Sales |
| GET | /api/crm/deals | List deals | Sales |
| POST | /api/crm/deals | Create deal | Sales |
| PUT | /api/crm/deals/:id | Update deal (incl. stage) | Sales |
| GET | /api/crm/companies | List companies | Sales |
| POST | /api/crm/companies | Create company | Sales |
| GET | /api/crm/contacts | List contacts | Sales |
| POST | /api/crm/contacts | Create contact | Sales |
| GET | /api/crm/forecast | Forecast summary | Sales |

---

## Support

| Method | Path | Description | Role |
|--------|------|-------------|------|
| GET | /api/support/tickets | List tickets | Support |
| POST | /api/support/tickets | Create ticket | Support |
| GET | /api/support/tickets/:id | Get ticket detail | Support |
| PUT | /api/support/tickets/:id | Update ticket | Support |
| GET | /api/support/categories | List categories | Support |
| GET | /api/support/sla | SLA policies | Support |
| GET | /api/support/dashboard | Dashboard metrics | Support |

---

## Time Tracking

| Method | Path | Description | Role |
|--------|------|-------------|------|
| GET | /api/time/entries | List time entries | Authenticated |
| POST | /api/time/entries | Create entry | Authenticated |
| GET | /api/time/timers/active | Get active timer | Authenticated |
| POST | /api/time/timers/start | Start timer | Authenticated |
| POST | /api/time/timers/:id/stop | Stop timer | Authenticated |
| GET | /api/time/timesheets/current | Current timesheet | Authenticated |
| GET | /api/time/categories | List categories | Authenticated |
| GET | /api/time/utilization | Utilization metrics | Manager |

---

## OKR

| Method | Path | Description | Role |
|--------|------|-------------|------|
| GET | /api/okr/goals | List goals | Authenticated |
| POST | /api/okr/goals | Create goal | Manager |
| PUT | /api/okr/goals/:id | Update goal | Manager |
| GET | /api/okr/periods | List periods | Authenticated |

---

## Dora AI

| Method | Path | Description | Role |
|--------|------|-------------|------|
| GET | /api/dora/insights | List insights by module | Authenticated |
| PUT | /api/dora/insights/:id/dismiss | Dismiss insight | Authenticated |
| POST | /api/dora/chat | Chat completion (streaming) | Authenticated |
| GET | /api/dora/history | Chat history | Authenticated |
| GET | /api/dora/automations | List automation policies | Admin |
| POST | /api/dora/automations | Create policy | Admin |
| GET | /api/dora/briefing | Daily briefing | Authenticated |

---

## Marketing

| Method | Path | Description | Role |
|--------|------|-------------|------|
| GET | /api/marketing/campaigns | List campaigns | Marketing |
| POST | /api/marketing/campaigns | Create campaign | Marketing |
| GET | /api/marketing/leads | List leads | Marketing |
| GET | /api/marketing/dashboard | Dashboard metrics | Marketing |

---

## Recruitment

| Method | Path | Description | Role |
|--------|------|-------------|------|
| GET | /api/recruitment/jobs | List jobs | HR |
| POST | /api/recruitment/jobs | Create job | HR |
| GET | /api/recruitment/applications | List applications | HR |
| GET | /api/recruitment/candidates | List candidates | HR |
| GET | /api/recruitment/dashboard | Dashboard metrics | HR |

---

## Assets & Contracts

| Method | Path | Description | Role |
|--------|------|-------------|------|
| GET | /api/assets | List assets | Authenticated |
| POST | /api/assets | Create asset | Admin |
| GET | /api/contracts | List contracts | Authenticated |
| POST | /api/contracts | Create contract | Admin |

---

## Executive & Reports

| Method | Path | Description | Role |
|--------|------|-------------|------|
| GET | /api/executive/dashboard | Executive dashboard KPIs | Admin/Leader |
| GET | /api/reports | Available reports | Authenticated |
| GET | /api/reports/:type | Run report | Authenticated |

---

## Notifications & Webhooks

| Method | Path | Description | Role |
|--------|------|-------------|------|
| GET | /api/notifications | List notifications | Authenticated |
| PUT | /api/notifications/:id/read | Mark read | Authenticated |
| POST | /api/webhooks | Register webhook | Admin |
| GET | /api/webhooks | List webhooks | Admin |

---

## Team & Culture (Heart)

| Method | Path | Description | Role |
|--------|------|-------------|------|
| GET | /api/heart/sentiment | Sentiment scores | Manager |
| GET | /api/heart/surveys | Pulse surveys | Authenticated |

---

## Admin

| Method | Path | Description | Role |
|--------|------|-------------|------|
| GET | /api/admin/users | List users | Admin |
| POST | /api/admin/employees | Create employee | Admin |
| PUT | /api/admin/employees/:id | Update employee | Admin |
| GET | /api/admin/departments | List departments | Admin |
| GET | /api/admin/roles | Role permissions | Admin |
| GET | /api/admin/audit | Audit log | Admin |
| GET | /api/admin/settings | System settings | Admin |

---

## Knowledge Hub

| Method | Path | Description | Role |
|--------|------|-------------|------|
| GET | /api/knowledge-hub/documents | List documents | Authenticated |
| POST | /api/knowledge-hub/documents | Create document | Authenticated |
| GET | /api/knowledge-hub/search | Search | Authenticated |
| GET | /api/knowledge-hub/categories | List categories | Authenticated |
| GET | /api/knowledge-hub/collections | List collections | Authenticated |

---

## Health

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | API health check |
| GET | /api/health/db | Database connectivity check |

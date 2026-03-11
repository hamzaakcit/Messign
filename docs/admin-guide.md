# Messign Admin Guide

## 1. Getting Started

### Login
- Use your admin credentials (e.g. `alex.chen@messign.com` with the default password from `server/src/types/auth.ts`).
- First-time setup: Ensure the database is migrated (`npm run db:migrate`) and seeded (`npm run db:seed`).

### Inviting Your Team
- Go to **Admin → Employees** to add new team members.
- Assign roles (admin, manager, member) and departments.
- New employees receive an email with login instructions (if email is configured).

---

## 2. Module Overview

Messign has 16 core modules that work together:

| Module | Purpose |
|--------|---------|
| **Executive** | High-level KPIs, revenue, support, OKR, team health |
| **Finance** | Expenses, budgets, invoices, payments, vendors |
| **Sales CRM** | Pipelines, deals, companies, contacts |
| **Support** | Tickets, SLA policies, categories |
| **Marketing** | Campaigns, leads, content |
| **Recruitment** | Jobs, applications, candidates |
| **Time** | Time entries, timers, timesheets, utilization |
| **OKR** | Goals, key results, periods |
| **Culture** | Pulse surveys, sentiment, team health |
| **Projects** | Tasks, sprints, bounties |
| **Knowledge Hub** | Documents, search, collections |
| **Assets** | Equipment, licenses |
| **Contracts** | Contract lifecycle |
| **Chat** | Team channels, DMs |
| **Achievements** | XP, badges, gamification |
| **Dora** | AI assistant, insights, automations |

---

## 3. Dora AI

### Questions & Insights
- Dora appears as a chat interface at `/dora` and as a floating widget.
- Use **⌘K** (Cmd+K) to quickly ask Dora from anywhere.
- Contextual insights appear in the **Insight Bar** on each module page.

### Automations
- Go to **Dora → Automations** to create automation policies.
- Policies can trigger on events (e.g. deal won, ticket created) and perform actions.
- View execution log at **Dora → Automations → Log**.

---

## 4. Automation Policies

- **Creating policies**: Define trigger (event type) and action (e.g. send notification, update field).
- **Risk levels**: Policies can be marked low/medium/high risk; high-risk may require approval.
- **Log**: All automation runs are logged for audit.

---

## 5. Finance Setup

### Budgets
- Create budgets by department and period.
- Set allocation and alert thresholds.

### Expense Policies
- Configure approval workflows in **Finance → Settings**.
- Define expense categories and tax rates.

### Approval Workflows
- Multi-step approval chains (e.g. Manager → Finance).
- AI pre-review for flagged expenses.

---

## 6. Sales CRM Setup

### Pipelines
- Create pipelines (e.g. Sales, Enterprise).
- Define stages (Lead, Qualified, Proposal, Won/Lost).

### Contacts & Companies
- Import or manually add companies and contacts.
- Link deals to companies and contacts.

---

## 7. Support Setup

### SLA Policies
- Define response and resolution SLAs by priority.
- Categories: Create ticket categories for routing.

### Assignment
- Assign tickets to agents or use round-robin.

---

## 8. Time Tracking Setup

### Categories
- Create time categories (e.g. Billable, Internal, PTO).
- Set hourly rates per category.

### Timesheet Approval
- Configure approval workflow for timesheets.
- Utilization targets per department.

---

## 9. OKR Setup

### Periods
- Create OKR periods (e.g. Q1 2025).

### Goal Hierarchy
- Company → Department → Team → Individual goals.
- Key results with target values and progress tracking.

---

## 10. Team Health / Culture

### Culture Dashboard
- View sentiment scores and pulse survey results.
- Identify at-risk teams or individuals.

### Privacy FAQ
- Pulse surveys are anonymized by default.
- Admins see aggregated data only.

---

## 11. Security

### RBAC Roles
- **Admin**: Full access, user management, settings.
- **Manager**: Team oversight, approvals, reports.
- **Member**: Standard user access.

### Access Control
- Role-based permissions per module.
- Audit logs for sensitive actions.

### Encryption
- Passwords hashed with bcrypt.
- Sensitive data encrypted at rest (if configured).

---

## 12. Webhooks

- Register webhooks for external integrations.
- Events: deal created, ticket resolved, expense approved, etc.
- Payload format: JSON with event type and entity data.

---

## 13. Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Login fails | Check DB is running, run `npm run db:seed` |
| Dora not responding | Verify `GROQ_API_KEY` in `.env` |
| Slow dashboard | Check Redis connection (`REDIS_URL`) |
| Missing data | Run migrations: `npm run db:migrate` |

### Launch Checklist
Run `npm run launch:check` in the server package to verify:
- Database connected and schema up to date
- Redis connected
- Required env vars present
- Core data (admin user, policies, categories) exists

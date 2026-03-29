# Dora suggested questions vs. department report vs. Report Hub

This document is the **single reference** for how these lists relate. The **source of truth for exact strings** is `server/src/services/ai/tools/availableQuestions.ts` (constants + `getAvailableQuestionsForRole`). Lists are **deduplicated with `Set`** (order preserved from array spread).

---

## 1. `system:get_available_questions` (what you can ask Dora)

Dora is instructed to call this tool for prompts like “What can I ask?” / “What can you do?” (`intentId`: `quick.available_questions` → preset in `intentIdPresets.ts`).

### Everyone (employee and up) — `EMPLOYEE_QUESTIONS`

1. What are my open tasks?
2. Show me my performance this month
3. What bounties are available?
4. What badges have I earned?
5. Show me my pending reimbursements
6. Search the knowledge base for [topic]

### Also for manager, HR, and finance — `MANAGER_QUESTIONS`

Everything in the employee list, **plus**:

7. Show me my team's performance this month
8. What is the status of all active projects?
9. What needs my approval?
10. Who are the top performers this quarter?
11. What is the current sprint status?
12. How do all teams compare this month?

### Also for admin and CPO — merged list (no separate “admin-only” branch)

Admin and CPO receive **the full manager list** (items 1–12) **plus** `ADMIN_EXTENDED_QUESTIONS`, which is:

- **`ADMIN_ONLY_QUESTIONS`** — org-wide / cross-cutting prompts (system overview, company finances, approvals, KB health, presentations, etc.)
- **`DEPARTMENT_REPORT_EXAMPLE_QUESTIONS`** — phrasings aligned with `analytics:get_department_report` (see §2)
- **`REPORT_HUB_CATALOG_LINE`** — one umbrella line pointing users at the Reports Hub without enumerating every report type (see §3)

So admins **do** get manager bullets 7–12 **and** the extended lines; duplicates against the manager list are removed by `Set` (e.g. the same project/sprint question is not listed twice).

---

## 2. Report-style questions → `analytics:get_department_report`

For **high-level / executive** reports, the tool lives in `server/src/services/ai/tools/departmentReport.ts`. It is restricted to **`admin` and `cpo`** (`requiredRoles`).

The tool description lists example asks (natural language). The same phrasings are **also** included in `DEPARTMENT_REPORT_EXAMPLE_QUESTIONS` inside `availableQuestions.ts` so “what can I ask?” for admins surfaces consistent wording. Routing and execution remain on the analytics tool.

---

## 3. Report Hub types (not the same as Dora’s question list)

The **generated report type** catalog is **`AVAILABLE_REPORT_TYPES`** in `server/src/dal/reports/reportGenerator.ts`. That drives the Report Hub / generation pipeline.

`get_available_questions` exposes **only** the short umbrella line (`REPORT_HUB_CATALOG_LINE`) so Dora can mention the Hub without pasting 20+ type ids. For the **exact** type list, use `reportGenerator.ts`.

---

## Summary

| Concern | Where it lives |
|--------|----------------|
| Enumerated Dora suggested questions (role-based) | `availableQuestions.ts` → `getAvailableQuestionsForRole` |
| Executive department / company report **tool** | `departmentReport.ts` (`analytics:get_department_report`) |
| Report **types** for the Hub | `AVAILABLE_REPORT_TYPES` in `reportGenerator.ts` |

-- Prevent duplicate budgets per org+department+name
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_budgets_org_dept_name
  ON finance_budgets (organization_id, department, name)
  WHERE name IS NOT NULL;

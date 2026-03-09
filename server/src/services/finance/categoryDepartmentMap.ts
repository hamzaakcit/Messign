import { query } from '../../db/index.js';

/** Maps expense category slugs to budget departments. */
export const CATEGORY_DEPARTMENT_MAP: Record<string, string> = {
  travel_flight: 'Operations',
  travel_hotel: 'Operations',
  travel_ground: 'Operations',
  meals_business: 'General',
  meals_team: 'General',
  meals_client: 'Sales',
  office_supplies: 'General',
  office_equipment: 'General',
  software_subscription: 'Engineering',
  software_license: 'Engineering',
  marketing_ads: 'Marketing',
  marketing_events: 'Marketing',
  training_course: 'General',
  training_conference: 'General',
  professional_legal: 'General',
  professional_consulting: 'General',
  utilities: 'Operations',
  communication_phone: 'Operations',
  communication_internet: 'Engineering',
  healthcare: 'General',
  other: 'General',
};

export function getDepartmentForCategory(slug: string): string {
  return CATEGORY_DEPARTMENT_MAP[slug] ?? 'General';
}

/**
 * Finds an active finance_budgets row for the department mapped from the category slug.
 * Returns the budget id if found, null otherwise.
 */
export async function getBudgetIdForCategory(orgId: string, categorySlug: string): Promise<string | null> {
  const department = getDepartmentForCategory(categorySlug);
  const result = await query<{ id: string }>(
    `SELECT id FROM finance_budgets
     WHERE organization_id = $1 AND department = $2
       AND (status = 'active' OR is_active = TRUE)
       AND (period_end IS NULL OR period_end >= CURRENT_DATE)
     ORDER BY period_end DESC NULLS LAST
     LIMIT 1`,
    [orgId, department],
  );
  return result.rows[0]?.id ?? null;
}

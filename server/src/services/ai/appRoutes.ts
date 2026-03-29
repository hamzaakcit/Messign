/**
 * App route paths aligned with {@link client/src/lib/routes.ts ROUTES}.
 * Server cannot import the client; duplicate values here and update both when adding routes.
 */
export const APP_ROUTES = {
  ROOT: '/',
  DASHBOARD: '/dashboard',
  EXECUTIVE: '/executive',
  REPORTS: '/reports',
  DORA: '/dora',
  KNOWLEDGE_HUB: '/knowledge-hub',
  PROJECTS: '/projects',
  FINANCE: '/finance',
  /** Finance shell invoices tab — matches {@link client/src/lib/financeRoutes.ts financePathForView('invoices')}. */
  FINANCE_INVOICES: '/finance/invoices',
  REIMBURSEMENTS: '/reimbursements',
  CRM: '/crm',
  MARKETING: '/marketing',
  MARKETING_DASHBOARD: '/marketing/dashboard',
  MARKETING_CAMPAIGNS: '/marketing/campaigns',
  RECRUITMENT: '/recruitment',
  RECRUITMENT_PIPELINE: '/recruitment/pipeline',
  SUPPORT: '/support',
  OKR: '/okr',
  ASSETS: '/assets',
  CONTRACTS: '/contracts',
  CULTURE: '/culture',
  ACHIEVEMENTS: '/achievements',
  SETTINGS: '/settings',
  ADMIN_AI_SETTINGS: '/admin/ai-settings',
} as const;

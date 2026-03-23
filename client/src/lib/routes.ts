/**
 * Centralized route constants — single source of truth for all app paths.
 * Import from here instead of hardcoding strings in nav, layout, and link components.
 */

export const ROUTES = {
  ROOT: '/',
  LOGIN: '/login',
  SIGNUP: '/signup',
  FORCE_PASSWORD_CHANGE: '/force-password-change',

  DASHBOARD: '/dashboard',
  EXECUTIVE: '/executive',
  REPORTS: '/reports',
  NOTIFICATIONS: '/notifications',

  DORA: '/dora',
  DORA_BRIEFING: '/dora/briefing',
  DORA_AUTOMATIONS: '/dora/automations',
  DORA_AUTOMATIONS_LOG: '/dora/automations/log',
  DORA_GAME: '/dora/game',

  CHAT: '/chat',
  KNOWLEDGE_HUB: '/knowledge-hub',
  ACHIEVEMENTS: '/achievements',
  TEAM: '/team',
  PROJECTS: '/projects',
  SETTINGS: '/settings',

  FINANCE: '/finance',
  REIMBURSEMENTS: '/reimbursements',
  INVOICES: '/reimbursements/invoices',

  CRM: '/crm',
  MARKETING: '/marketing',
  MARKETING_COMMAND_CENTER: '/marketing/command-center',
  MARKETING_CAMPAIGNS: '/marketing/campaigns',
  MARKETING_CONTENT: '/marketing/content',
  MARKETING_EMAIL: '/marketing/email',
  MARKETING_LEADS: '/marketing/leads',
  MARKETING_APPROVALS: '/marketing/approvals',
  MARKETING_AGENT: '/marketing/agent',
  MARKETING_PAGES: '/marketing/pages',
  MARKETING_POPUPS: '/marketing/popups',
  MARKETING_DOCUMENTS: '/marketing/documents',
  MARKETING_CREATIVE_HUB: '/marketing/creative-hub',
  MARKETING_AUTOMATION: '/marketing/automation',
  MARKETING_DASHBOARD: '/marketing/dashboard',
  MARKETING_BUILDER: '/marketing/builder',

  RECRUITMENT: '/recruitment',
  SUPPORT: '/support',
  TIME: '/time',
  OKR: '/okr',
  ASSETS: '/assets',
  CONTRACTS: '/contracts',
  CULTURE: '/culture',

  ADMIN: '/admin',
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_SECURITY: '/admin/security',
  ADMIN_EMPLOYEES: '/admin/employees',
  ADMIN_DEPARTMENTS: '/admin/departments',
  ADMIN_ROLES: '/admin/roles',
  ADMIN_ANALYTICS: '/admin/analytics',
  ADMIN_SETTINGS: '/admin/settings',
  ADMIN_AI_SETTINGS: '/admin/ai-settings',
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

export const VIEW_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  executive: 'Executive Dashboard',
  reports: 'Report Hub',
  notifications: 'Notifications',
  dora: 'Dora',
  game: 'Dora Game',
  chat: 'Chat',
  knowledge: 'Knowledge Hub',
  achievements: 'Achievements',
  team: 'Team Directory',
  projects: 'Project Marketplace',
  settings: 'Settings',
  finance: 'Finance',
  reimbursements: 'Reimbursements',
  invoices: 'Invoices',
  crm: 'Sales CRM',
  marketing: 'Marketing',
  recruitment: 'Recruitment',
  support: 'Support',
  time: 'Time Tracking',
  okr: 'OKRs & Goals',
  assets: 'Assets',
  contracts: 'Contracts',
  culture: 'Culture',
};

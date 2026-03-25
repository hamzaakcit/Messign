/**
 * Single source of truth for Dora suggestion chips (Dora page, Knowledge Hub, widget, follow-ups).
 */

export type IntentCategory =
  | 'quick'
  | 'dashboard'
  | 'performance'
  | 'projects'
  | 'finance'
  | 'knowledge'
  | 'crm'
  | 'marketing'
  | 'recruitment'
  | 'support'
  | 'okr'
  | 'assets'
  | 'contracts'
  | 'culture'
  | 'hr'
  | 'admin'
  | 'reports';

export type Surface = 'dora' | 'widget' | 'followup' | 'knowledge-hub';

/** leader = admin | manager | dept_head | system_admin (plus cpo for product parity). */
export type RoleRequirement = 'all' | 'admin' | 'manager' | 'leader';

export interface IntentEntry {
  id: string;
  label: string;
  query: string;
  icon: string;
  category: IntentCategory;
  surfaces: Surface[];
  roles: RoleRequirement;
  modules: string[] | 'all';
  priority: number;
  /** Server tool preset id (see server intentIdPresets) */
  handler?: string;
  cacheTTL?: number;
  followUpIntents?: string[];
  /** Stronger weight on /dora welcome (former isTopLevel extras). */
  doraWelcomeBoost?: boolean;
}

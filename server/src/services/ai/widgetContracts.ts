/**
 * Tool → widget coverage and default navigation for Dora generative UI.
 * Keeps deep-link actions aligned with {@link ./appRoutes.ts APP_ROUTES}.
 */

import { APP_ROUTES } from './appRoutes.js';
import { AI_WIDGET_TOOL_MAP } from './widgetToolMap.js';

/** Same shape as {@link ./widgetResolve.js WidgetBlockAction} — kept here to avoid circular imports. */
export type WidgetNavigationAction =
  | { id: string; label: string; kind: 'navigate'; to: string; state?: unknown }
  | { id: string; label: string; kind: 'send_message'; text: string; intentId?: string };

/** Tools that intentionally have no structured widget (discovery only). */
export const TEXT_ONLY_TOOLS = new Set<string>(['core:search_tools', 'core:activate_tool']);

/**
 * Tools with custom branches in {@link ./widgetResolve.ts resolveWidgetPayloadsForTool}
 * (not only AI_WIDGET_TOOL_MAP lookup).
 */
export const SPECIAL_RESOLVE_TOOLS = new Set<string>([
  'dashboard:get_command_center',
  'finance:get_invoice_details',
  'achievements:get_achievements_leaderboard',
  'knowledge:search_knowledge_base',
]);

/**
 * Returns true if the tool is covered by the widget system (map entry, special resolve, or explicit text-only waiver).
 */
export function hasWidgetCoverage(toolName: string): boolean {
  if (TEXT_ONLY_TOOLS.has(toolName)) return true;
  if (SPECIAL_RESOLVE_TOOLS.has(toolName)) return true;
  return Object.prototype.hasOwnProperty.call(AI_WIDGET_TOOL_MAP, toolName);
}

/**
 * Default primary navigation for a tool namespace — merged into widget payloads when not redundant.
 */
export function getDefaultNavigateActionsForTool(toolName: string): WidgetNavigationAction[] {
  const ns = toolName.split(':')[0];
  switch (ns) {
    case 'dashboard':
      return [{ id: 'nav-dashboard', label: 'Open dashboard', kind: 'navigate', to: APP_ROUTES.DASHBOARD }];
    case 'projects':
      return [{ id: 'nav-projects', label: 'Open projects', kind: 'navigate', to: APP_ROUTES.PROJECTS }];
    case 'finance':
      return [{ id: 'nav-finance', label: 'Open finance', kind: 'navigate', to: APP_ROUTES.FINANCE }];
    case 'crm':
      return [{ id: 'nav-crm', label: 'Open CRM', kind: 'navigate', to: APP_ROUTES.CRM }];
    case 'support':
      return [{ id: 'nav-support', label: 'Open support', kind: 'navigate', to: APP_ROUTES.SUPPORT }];
    case 'hr':
    case 'people':
      return [
        { id: 'nav-recruitment', label: 'Open recruitment', kind: 'navigate', to: APP_ROUTES.RECRUITMENT_PIPELINE },
      ];
    case 'marketing':
      return [
        { id: 'nav-marketing', label: 'Open marketing', kind: 'navigate', to: APP_ROUTES.MARKETING_DASHBOARD },
      ];
    case 'executive':
      return [{ id: 'nav-executive', label: 'Open executive', kind: 'navigate', to: APP_ROUTES.EXECUTIVE }];
    case 'analytics':
      if (toolName === 'analytics:get_recent_activity') {
        return [{ id: 'nav-dash-activity', label: 'Open dashboard', kind: 'navigate', to: APP_ROUTES.DASHBOARD }];
      }
      return [{ id: 'nav-reports', label: 'Open reports', kind: 'navigate', to: APP_ROUTES.REPORTS }];
    case 'knowledge':
      return [
        { id: 'nav-knowledge', label: 'Open knowledge hub', kind: 'navigate', to: APP_ROUTES.KNOWLEDGE_HUB },
      ];
    case 'okr':
      return [{ id: 'nav-okr', label: 'Open OKRs', kind: 'navigate', to: APP_ROUTES.OKR }];
    case 'assets':
      return [{ id: 'nav-assets', label: 'Open assets', kind: 'navigate', to: APP_ROUTES.ASSETS }];
    case 'contracts':
      return [{ id: 'nav-contracts', label: 'Open contracts', kind: 'navigate', to: APP_ROUTES.CONTRACTS }];
    case 'achievements':
    case 'fun':
      return [
        { id: 'nav-achievements', label: 'Open achievements', kind: 'navigate', to: APP_ROUTES.ACHIEVEMENTS },
      ];
    case 'system':
      return [{ id: 'nav-settings', label: 'Open settings', kind: 'navigate', to: APP_ROUTES.SETTINGS }];
    case 'memory':
    case 'automation':
      return [
        { id: 'nav-dora-auto', label: 'Dora automations', kind: 'navigate', to: '/dora/automations' },
      ];
    case 'seo':
    case 'conversion':
      return [
        { id: 'nav-mkt-campaigns', label: 'Marketing campaigns', kind: 'navigate', to: APP_ROUTES.MARKETING_CAMPAIGNS },
      ];
    default:
      return [];
  }
}

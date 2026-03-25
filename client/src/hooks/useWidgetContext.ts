import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { getSuggestions } from '@/shared/intents/suggestion-engine';
import type { IntentEntry } from '@/shared/intents/registry';
import { useDoraSessionStore } from '@/stores/doraSessionStore';

interface ViewingEntity {
  type: 'project' | 'document' | 'invoice' | 'employee' | 'task';
  id: string;
  name: string;
}

export interface WidgetContext {
  currentPath: string;
  routeParams: Record<string, string>;
  currentModule: string;
  viewingEntity?: ViewingEntity;
  widgetMode: 'expanded' | 'mini' | 'collapsed';
}

interface RoutePattern {
  pattern: RegExp;
  module: string;
  entityExtractor?: (match: RegExpMatchArray) => ViewingEntity | null;
}

const ROUTE_PATTERNS: RoutePattern[] = [
  {
    pattern: /^\/knowledge-hub\/documents\/([^/]+)$/,
    module: 'knowledge-hub',
    entityExtractor: (m) => ({ type: 'document', id: m[1], name: decodeURIComponent(m[1]) }),
  },
  { pattern: /^\/knowledge-hub\/ai-assistant/, module: 'knowledge-hub' },
  { pattern: /^\/knowledge-hub/, module: 'knowledge-hub' },
  {
    pattern: /^\/projects\/([^/]+)/,
    module: 'projects',
    entityExtractor: (m) => ({ type: 'project', id: m[1], name: decodeURIComponent(m[1]) }),
  },
  {
    pattern: /^\/reimbursements\/invoices\/([^/]+)/,
    module: 'invoices',
    entityExtractor: (m) => ({ type: 'invoice', id: m[1], name: m[1] }),
  },
  {
    pattern: /^\/team\/([^/]+)/,
    module: 'team-directory',
    entityExtractor: (m) => ({ type: 'employee', id: m[1], name: decodeURIComponent(m[1]) }),
  },
  { pattern: /^\/admin/, module: 'admin' },
  { pattern: /^\/dashboard/, module: 'dashboard' },
  { pattern: /^\/executive/, module: 'executive' },
  { pattern: /^\/reports/, module: 'reports' },
  { pattern: /^\/finance/, module: 'finance' },
  { pattern: /^\/culture/, module: 'culture' },
  { pattern: /^\/chat/, module: 'chat' },
  { pattern: /^\/projects/, module: 'projects' },
  { pattern: /^\/achievements/, module: 'achievements' },
  { pattern: /^\/reimbursements\/invoices/, module: 'invoices' },
  { pattern: /^\/reimbursements/, module: 'reimbursements' },
  { pattern: /^\/team/, module: 'team-directory' },
  { pattern: /^\/settings/, module: 'settings' },
  { pattern: /^\/dora/, module: 'dora' },
  { pattern: /^\/crm/, module: 'crm' },
  { pattern: /^\/marketing/, module: 'marketing' },
  { pattern: /^\/recruitment/, module: 'recruitment' },
  { pattern: /^\/assets/, module: 'assets' },
  { pattern: /^\/contracts/, module: 'contracts' },
  { pattern: /^\/support/, module: 'support' },
  { pattern: /^\/okr/, module: 'okr' },
];

function resolveRoute(pathname: string): {
  module: string;
  entity?: ViewingEntity;
  params: Record<string, string>;
} {
  for (const route of ROUTE_PATTERNS) {
    const match = pathname.match(route.pattern);
    if (match) {
      const entity = route.entityExtractor?.(match) || undefined;
      const params: Record<string, string> = {};
      if (match[1]) params.entityId = match[1];
      return { module: route.module, entity, params };
    }
  }
  return { module: 'unknown', params: {} };
}

function normalizeWidgetRole(userRole: string): string {
  if (userRole === 'employee') return 'member';
  return userRole;
}

function customizeForEntity(
  entries: IntentEntry[],
  module: string,
  entity?: ViewingEntity,
): IntentEntry[] {
  if (module !== 'projects' || entity?.type !== 'project' || !entity.name) return entries;
  return entries.map((e) => {
    if (e.id !== 'projects.widget_entity_status') return e;
    return {
      ...e,
      label: `Status of ${entity.name}`,
      query: `What is the status of ${entity.name}?`,
    };
  });
}

export function useWidgetContext(userRole: string = 'member') {
  const location = useLocation();

  const routeInfo = useMemo(
    () => resolveRoute(location.pathname),
    [location.pathname],
  );

  const widgetContext: WidgetContext = useMemo(
    () => ({
      currentPath: location.pathname,
      routeParams: routeInfo.params,
      currentModule: routeInfo.module,
      viewingEntity: routeInfo.entity,
      widgetMode: 'expanded',
    }),
    [location.pathname, routeInfo],
  );

  const role = normalizeWidgetRole(userRole);

  const sessionRecent = useDoraSessionStore((s) => s.recentIntents);
  const sessionFreq = useDoraSessionStore((s) => s.frequentCategories);
  const sessionVisited = useDoraSessionStore((s) => s.visitedModulePrefixes);

  const suggestions = useMemo(() => {
    const raw = getSuggestions({
      role,
      currentPath: location.pathname,
      surface: 'widget',
      conversationActive: false,
      recentIntents: sessionRecent,
      frequentCategories: sessionFreq,
      visitedModulePrefixes: sessionVisited,
    });
    return customizeForEntity(raw, routeInfo.module, routeInfo.entity);
  }, [role, location.pathname, routeInfo.module, routeInfo.entity, sessionRecent, sessionFreq, sessionVisited]);

  const entityLabel = useMemo(() => {
    if (routeInfo.entity) {
      const typeLabels: Record<string, string> = {
        project: 'Project',
        document: 'Document',
        invoice: 'Invoice',
        employee: 'Employee',
        task: 'Task',
      };
      return `${typeLabels[routeInfo.entity.type] || ''}: ${routeInfo.entity.name}`;
    }
    const moduleLabels: Record<string, string> = {
      dashboard: 'Dashboard',
      chat: 'Chat',
      projects: 'Projects',
      'knowledge-hub': 'Knowledge Hub',
      achievements: 'Achievements',
      'team-directory': 'Team Directory',
      reimbursements: 'Reimbursements',
      invoices: 'Invoices',
      admin: 'Admin',
      dora: 'Dora',
      crm: 'Sales CRM',
      marketing: 'Marketing',
      recruitment: 'Recruitment',
      assets: 'Assets',
      contracts: 'Contracts',
      support: 'Support',
      okr: 'OKRs & Goals',
      executive: 'Executive',
      reports: 'Reports',
      finance: 'Finance',
      culture: 'Culture',
    };
    return moduleLabels[routeInfo.module] || '';
  }, [routeInfo]);

  return { widgetContext, suggestions, entityLabel };
}

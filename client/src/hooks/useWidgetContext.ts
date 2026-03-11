import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

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

export interface SuggestionChip {
  label: string;
  query: string;
  icon?: string;
  category: 'personal' | 'team' | 'company' | 'action';
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
  { pattern: /^\/chat/, module: 'chat' },
  { pattern: /^\/projects/, module: 'projects' },
  { pattern: /^\/achievements/, module: 'achievements' },
  { pattern: /^\/reimbursements\/invoices/, module: 'invoices' },
  { pattern: /^\/reimbursements/, module: 'reimbursements' },
  { pattern: /^\/team/, module: 'team-directory' },
  { pattern: /^\/settings/, module: 'settings' },
  { pattern: /^\/dora/, module: 'dora' },
  { pattern: /^\/crm/, module: 'crm' },
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

const BASE_CHIPS: SuggestionChip[] = [
  { label: 'My open tasks',    query: 'What are my open tasks?',           icon: '✅', category: 'personal' },
  { label: 'My performance',   query: 'How is my performance this month?', icon: '📈', category: 'personal' },
  { label: 'Company overview', query: 'Give me a company overview',        icon: '📊', category: 'company' },
];

const MANAGER_CHIPS: SuggestionChip[] = [
  { label: 'Team performance',  query: 'How is my team performing?', icon: '👥', category: 'team' },
  { label: 'Pending approvals', query: 'Show my pending approvals',  icon: '📋', category: 'team' },
  { label: 'Create a task',     query: 'Create a task for my team',  icon: '➕', category: 'action' },
];

const ADMIN_CHIPS: SuggestionChip[] = [
  { label: 'System health',     query: 'What is the system health status?', icon: '🔧', category: 'company' },
  { label: 'Financial summary', query: 'Give me the financial summary',     icon: '💰', category: 'company' },
  { label: 'Executive report',  query: 'Generate an executive report',      icon: '📑', category: 'company' },
];

function getPageChips(module: string, entityName?: string): SuggestionChip[] {
  switch (module) {
    case 'dashboard':
      return [
        { label: 'Explain revenue trend', query: 'Explain the revenue trend on my dashboard', icon: '📈', category: 'company' },
        { label: 'Top performers',        query: 'Who are the top performers this quarter?',  icon: '🏆', category: 'company' },
      ];
    case 'projects':
      return entityName
        ? [
            { label: `Status of ${entityName}`, query: `What is the status of ${entityName}?`, icon: '🏗️', category: 'team' },
            { label: 'Create task here',         query: `Create a task for ${entityName}`,     icon: '➕', category: 'action' },
          ]
        : [
            { label: 'Active projects', query: 'What projects are currently active?', icon: '🏗️', category: 'team' },
            { label: 'Overdue tasks',   query: 'Are there any overdue tasks?',        icon: '⚠️', category: 'team' },
          ];
    case 'knowledge-hub':
      return [
        { label: 'Find a guide',     query: 'Find me a guide about',          icon: '📖', category: 'company' },
        { label: 'Brand guidelines', query: 'What are our brand guidelines?', icon: '🎨', category: 'company' },
      ];
    case 'chat':
      return [
        { label: 'Recent decisions', query: 'What decisions were made recently in chat?',  icon: '💬', category: 'team' },
        { label: 'Send a message',   query: 'Send a message to the general channel',       icon: '📤', category: 'action' },
      ];
    case 'crm':
      return [
        { label: 'Pipeline status', query: 'What is the current pipeline status?', icon: '🎯', category: 'company' },
        { label: 'Stale deals', query: 'Which deals need attention?', icon: '⏳', category: 'team' },
      ];
    case 'support':
      return [
        { label: 'Ticket overview', query: 'Give me the current support ticket overview', icon: '🎫', category: 'team' },
        { label: 'At-risk customers', query: 'Show at-risk customers from support', icon: '⚠️', category: 'company' },
      ];
    case 'invoices':
      return [
        { label: 'Pending invoices', query: 'Show me pending invoices', icon: '💰', category: 'company' },
        { label: 'Draft invoice',    query: 'Draft a new invoice',      icon: '➕', category: 'action' },
      ];
    default:
      return [];
  }
}

export function useWidgetContext(userRole: string = 'employee') {
  const location = useLocation();

  const routeInfo = useMemo(
    () => resolveRoute(location.pathname),
    [location.pathname],
  );

  const widgetContext: WidgetContext = useMemo(() => ({
    currentPath: location.pathname,
    routeParams: routeInfo.params,
    currentModule: routeInfo.module,
    viewingEntity: routeInfo.entity,
    widgetMode: 'expanded',
  }), [location.pathname, routeInfo]);

  const suggestions = useMemo(() => {
    const chips: SuggestionChip[] = [...BASE_CHIPS];

    if (['manager', 'hr', 'cpo', 'admin'].includes(userRole)) {
      chips.push(...MANAGER_CHIPS);
    }
    if (['admin', 'cpo'].includes(userRole)) {
      chips.push(...ADMIN_CHIPS);
    }

    const pageChips = getPageChips(routeInfo.module, routeInfo.entity?.name);
    chips.push(...pageChips);

    const seen = new Set<string>();
    return chips.filter((c) => {
      if (seen.has(c.query)) return false;
      seen.add(c.query);
      return true;
    });
  }, [userRole, routeInfo]);

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
      support: 'Support',
      okr: 'OKRs & Goals',
    };
    return moduleLabels[routeInfo.module] || '';
  }, [routeInfo]);

  return { widgetContext, suggestions, entityLabel };
}

import type { IntentCategory, IntentEntry, RoleRequirement, Surface } from './registry';
import { INTENT_REGISTRY, getIntentById } from './registry';

export interface SuggestionContext {
  role: string;
  currentPath: string;
  surface: Surface;
  lastIntentId?: string;
  recentIntents?: string[];
  conversationActive: boolean;
  /** Categories the user uses often this tab (from session memory) */
  frequentCategories?: IntentCategory[];
  /** Path prefixes visited recently (e.g. /finance) for discovery boost */
  visitedModulePrefixes?: string[];
}

export function roleSatisfies(role: string, req: RoleRequirement): boolean {
  const r = role.toLowerCase();
  if (req === 'all') return true;
  if (req === 'admin') return r === 'admin' || r === 'system_admin';
  if (req === 'leader') return ['admin', 'system_admin', 'manager', 'dept_head', 'cpo'].includes(r);
  if (req === 'manager') return ['admin', 'system_admin', 'manager', 'dept_head', 'cpo', 'hr'].includes(r);
  return false;
}

function pathMatchesModules(path: string, modules: string[] | 'all'): boolean {
  if (modules === 'all') return true;
  const p = path.split('?')[0] ?? path;
  return modules.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

function categoriesForPath(path: string): IntentCategory[] {
  const p = path.split('?')[0] ?? path;
  const out: IntentCategory[] = [];
  const add = (c: IntentCategory) => {
    if (!out.includes(c)) out.push(c);
  };
  if (p.startsWith('/finance') || p.startsWith('/reimbursements')) add('finance');
  if (p.startsWith('/dashboard')) add('dashboard');
  if (p.startsWith('/executive') || p.startsWith('/reports')) add('reports');
  if (p.startsWith('/projects')) add('projects');
  if (p.startsWith('/knowledge-hub')) add('knowledge');
  if (p.startsWith('/crm')) add('crm');
  if (p.startsWith('/marketing')) add('marketing');
  if (p.startsWith('/recruitment')) add('recruitment');
  if (p.startsWith('/support')) add('support');
  if (p.startsWith('/time')) add('time');
  if (p.startsWith('/okr')) add('okr');
  if (p.startsWith('/assets')) add('assets');
  if (p.startsWith('/contracts')) add('contracts');
  if (p.startsWith('/culture')) add('culture');
  if (p.startsWith('/admin')) add('admin');
  if (p.startsWith('/chat')) add('knowledge');
  if (p.startsWith('/dora')) add('quick');
  return out;
}

function timeOfDayCategoryBoost(category: IntentCategory): number {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) {
    if (category === 'dashboard' || category === 'quick') return 3;
  } else if (h >= 12 && h < 17) {
    if (category === 'performance' || category === 'projects') return 2;
  } else {
    if (category === 'time' || category === 'okr') return 2;
  }
  return 0;
}

/** Fri–Sun: nudge reports & time */
function endOfWeekCategoryBoost(category: IntentCategory): number {
  const d = new Date().getDay();
  if (d === 5 || d === 6 || d === 0) {
    if (category === 'reports' || category === 'time') return 3;
    if (category === 'dashboard') return 1;
  }
  return 0;
}

function moduleDiscoveryBoost(entry: IntentEntry, visited: string[] | undefined): number {
  if (entry.modules === 'all' || !visited?.length) return 0;
  const mods = entry.modules;
  const hits = mods.some((prefix) => {
    const px = prefix.startsWith('/') ? prefix : `/${prefix}`;
    return visited.some((v) => v === px || v.startsWith(`${px}/`));
  });
  return hits ? 0 : 2;
}

function scoreIntent(
  entry: IntentEntry,
  ctx: SuggestionContext,
  pathCategories: IntentCategory[],
  onDoraWelcome: boolean,
): number {
  let score = (11 - Math.min(10, Math.max(1, entry.priority))) * 2;
  if (pathCategories.includes(entry.category)) score += 10;
  if (pathMatchesModules(ctx.currentPath, entry.modules)) score += 10;
  score += timeOfDayCategoryBoost(entry.category);
  score += endOfWeekCategoryBoost(entry.category);
  if (entry.doraWelcomeBoost && onDoraWelcome) score += 8;

  const recent = ctx.recentIntents ?? [];
  if (recent.includes(entry.id)) score -= 6;

  const lastFive = recent.slice(-5);
  if (lastFive.includes(entry.id)) score -= 4;

  const freq = ctx.frequentCategories ?? [];
  if (freq.slice(0, 3).includes(entry.category)) score += 3;

  score += moduleDiscoveryBoost(entry, ctx.visitedModulePrefixes);

  return score;
}

export function getSuggestions(ctx: SuggestionContext): IntentEntry[] {
  const role = ctx.role === 'employee' ? 'member' : ctx.role;

  if (ctx.surface === 'followup') {
    const recent = ctx.recentIntents ?? [];
    if (ctx.lastIntentId) {
      const parent = getIntentById(ctx.lastIntentId);
      const ids = parent?.followUpIntents ?? [];
      const resolved = ids
        .map((id) => getIntentById(id))
        .filter((e): e is IntentEntry => !!e && roleSatisfies(role, e.roles))
        .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i);

      const moduleFirst = resolved.filter((e) => pathMatchesModules(ctx.currentPath, e.modules));
      const ordered = [...moduleFirst, ...resolved.filter((e) => !moduleFirst.includes(e))];

      const picked: IntentEntry[] = [];
      for (const e of ordered) {
        if (picked.length >= 3) break;
        if (!recent.includes(e.id)) picked.push(e);
      }
      for (const e of ordered) {
        if (picked.length >= 3) break;
        if (!picked.some((p) => p.id === e.id)) picked.push(e);
      }
      if (picked.length > 0) return picked.slice(0, 3);
    }
    return INTENT_REGISTRY.filter(
      (e) => e.surfaces.includes('followup') && e.id.startsWith('generic.') && roleSatisfies(role, e.roles),
    ).slice(0, 2);
  }

  if (
    ctx.conversationActive &&
    (ctx.surface === 'dora' || ctx.surface === 'knowledge-hub')
  ) {
    return [];
  }

  const onDoraWelcome =
    ctx.surface === 'dora' && !ctx.conversationActive && ctx.currentPath.startsWith('/dora');

  const pathCategories = categoriesForPath(ctx.currentPath);

  const candidates = INTENT_REGISTRY.filter(
    (e) => e.surfaces.includes(ctx.surface) && roleSatisfies(role, e.roles),
  ).filter((e) => !e.id.startsWith('generic.'));

  const seen = new Set<string>();
  const scored = candidates
    .filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .map((e) => ({
      entry: e,
      score: scoreIntent(e, ctx, pathCategories, onDoraWelcome),
    }))
    .sort((a, b) => b.score - a.score);

  const limit = ctx.surface === 'widget' ? 4 : 5;
  return scored.slice(0, limit).map((s) => s.entry);
}

/**
 * Full ranked list (no slice) for progressive chips and other UIs that need all scored intents.
 */
export function getRankedIntentEntries(ctx: SuggestionContext): IntentEntry[] {
  const role = ctx.role === 'employee' ? 'member' : ctx.role;

  if (ctx.surface === 'followup') {
    return [];
  }
  if (
    ctx.conversationActive &&
    (ctx.surface === 'dora' || ctx.surface === 'knowledge-hub')
  ) {
    return [];
  }

  const onDoraWelcome =
    ctx.surface === 'dora' && !ctx.conversationActive && ctx.currentPath.startsWith('/dora');

  const pathCategories = categoriesForPath(ctx.currentPath);

  const candidates = INTENT_REGISTRY.filter(
    (e) => e.surfaces.includes(ctx.surface) && roleSatisfies(role, e.roles),
  ).filter((e) => !e.id.startsWith('generic.'));

  const seen = new Set<string>();
  const scored = candidates
    .filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .map((e) => ({
      entry: e,
      score: scoreIntent(e, ctx, pathCategories, onDoraWelcome),
    }))
    .sort((a, b) => b.score - a.score);

  return scored.map((s) => s.entry);
}

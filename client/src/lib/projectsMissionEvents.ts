/** CustomEvent name for Mission Control command palette / shortcuts → ProjectsView. */
export const PROJECTS_MISSION_EVENT = 'messign:projects-mission';

export type ProjectsMissionDetail =
  | { action: 'create-task' }
  | { action: 'propose' }
  | { action: 'open-optimize' }
  | { action: 'hub' }
  | { action: 'tasks' };

/**
 * Dispatches a projects-scoped mission action (create task sheet, propose, optimization dialog).
 */
export function dispatchProjectsMission(detail: ProjectsMissionDetail): void {
  window.dispatchEvent(new CustomEvent(PROJECTS_MISSION_EVENT, { detail }));
}

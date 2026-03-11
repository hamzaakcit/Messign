import { eventBus } from '../eventBus.js';
import { emitToUser } from '../../sockets/index.js';
import { getProjectById } from '../../db/projectsDb.js';
import { getSprintHelpers } from '../../db/sprintsDb.js';

export function register(): void {
  eventBus.on('project.sprint.completed', async (payload) => {
    const project = await getProjectById(payload.projectId);
    const teamIds = project?.team ?? [];
    const helpers = payload.sprintId ? await getSprintHelpers(payload.sprintId) : [];
    const helperIds = helpers.map((h) => h.user_id);
    const userIds = [...new Set([...teamIds, ...helperIds])];
    for (const userId of userIds) {
      void emitToUser(userId, 'celebration:sprint-completed', {
        sprintId: payload.sprintId,
        projectId: payload.projectId,
        completedTasks: payload.completedTasks,
        totalTasks: payload.totalTasks,
      });
    }
  });
  console.log('[Subscriber] Celebration subscriber registered');
}

/**
 * Tool: get_sprint_status
 *
 * Adapted for Messign: sprint_requests (help requests) instead of traditional sprints.
 * sprint_requests: project_id, status ACTIVE/IN_PROGRESS/RESOLVED/EXPIRED, starts_at, ends_at.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import {
  buildShortSprintSummary,
  computeSprintStatusAggregates,
} from './sprintStatusAggregates.js';

const sprintStatusTool: Tool = {
  name: 'projects:get_sprint_status',
  category: 'projects',

  metadata: {
    namespace: 'projects',
    name: 'get_sprint_status',
    summary: 'Sprint/help request status: progress, remaining tasks, timeline.',
    tags: ['projects', 'sprint', 'velocity', 'burndown'],
    alwaysLoaded: false,
    parameterHints: 'project_name: string, sprint_identifier?: current|last|all',
  },

  description: `Get the current sprint/help request status including progress, remaining tasks, and timeline.

Use this tool when someone asks:
- "What's the current sprint status?"
- "How is the sprint going?"
- "Sprint progress" or "Sprint burndown"
- "How many story points are left?"
- "Will we finish the sprint on time?"
- Any question about sprint progress, velocity, or iterations`,

  parameters: {
    type: 'object',
    properties: {
      project_name: {
        type: 'string',
        description: 'Project name to get sprint for. Use "all" for all active sprints.',
      },
      sprint_identifier: {
        type: 'string',
        description: 'Sprint name/number. Use "current" for the active sprint, "last" for previous sprint.',
        enum: ['current', 'last', 'all'],
      },
    },
    required: ['project_name'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const projectName = (args.project_name as string) || '';
    const sprintIdentifier = (args.sprint_identifier as string) || 'current';

    try {
      let sprintQuery: string;
      const params: unknown[] = [];

      if (sprintIdentifier === 'current') {
        sprintQuery = `
          SELECT sr.*, p.name as project_name
          FROM sprint_requests sr
          JOIN projects p ON sr.project_id = p.id
          WHERE sr.status IN ('ACTIVE', 'IN_PROGRESS')`;
        if (projectName !== 'all') {
          sprintQuery += ` AND LOWER(p.name) LIKE LOWER($1)`;
          params.push(`%${projectName}%`);
        }
        sprintQuery += ` ORDER BY sr.starts_at DESC LIMIT 5`;
      } else if (sprintIdentifier === 'last') {
        sprintQuery = `
          SELECT sr.*, p.name as project_name
          FROM sprint_requests sr
          JOIN projects p ON sr.project_id = p.id
          WHERE sr.status IN ('RESOLVED', 'EXPIRED', 'CANCELLED')`;
        if (projectName !== 'all') {
          sprintQuery += ` AND LOWER(p.name) LIKE LOWER($1)`;
          params.push(`%${projectName}%`);
        }
        sprintQuery += ` ORDER BY sr.ends_at DESC LIMIT 5`;
      } else {
        sprintQuery = `
          SELECT sr.*, p.name as project_name
          FROM sprint_requests sr
          JOIN projects p ON sr.project_id = p.id`;
        if (projectName !== 'all') {
          sprintQuery += ` WHERE LOWER(p.name) LIKE LOWER($1)`;
          params.push(`%${projectName}%`);
        }
        sprintQuery += ` ORDER BY sr.starts_at DESC LIMIT 10`;
      }

      const sprintsResult = await query(sprintQuery, params.length > 0 ? params : undefined);

      if (sprintsResult.rows.length === 0) {
        const aggregates = computeSprintStatusAggregates([]);
        const hint =
          projectName !== 'all'
            ? `${sprintIdentifier} · project "${projectName}"`
            : `${sprintIdentifier} · all projects`;
        return {
          success: true,
          data: { sprints: [], aggregates },
          summary: buildShortSprintSummary(aggregates, hint),
          metadata: { source: 'sprint_requests, projects', count: 0 },
        };
      }

      type SprintRow = Record<string, unknown> & { id?: string; project_name?: string; title?: string; status?: string; max_helpers?: number; starts_at?: string; ends_at?: string; description?: string };
      const enriched: (SprintRow & { helperCount: number; progress: number; daysLeft: number | null })[] = [];

      for (const sprint of sprintsResult.rows as SprintRow[]) {
        const helpersResult = await query(
          `SELECT COUNT(*)::int as helper_count FROM sprint_helpers WHERE sprint_id = $1`,
          [sprint.id]
        );
        const helperCount = Number((helpersResult.rows[0] as Record<string, unknown>)?.helper_count ?? 0);
        const maxHelpers = Number(sprint.max_helpers ?? 3);
        const progress = maxHelpers > 0 ? Math.round((helperCount / maxHelpers) * 100) : 0;
        const daysLeft = sprint.ends_at
          ? Math.max(0, Math.ceil((new Date(sprint.ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          : null;

        enriched.push({
          ...sprint,
          helperCount,
          progress,
          daysLeft,
        });
      }

      const aggregates = computeSprintStatusAggregates(enriched as unknown as Record<string, unknown>[]);
      const summary = buildShortSprintSummary(aggregates);

      return {
        success: true,
        data: { sprints: enriched, aggregates },
        summary,
        metadata: { source: 'sprint_requests, sprint_helpers, projects', count: enriched.length },
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        summary: `Sprint data unavailable: ${(err as Error).message}. Your system may not have a sprint_requests table.`,
      };
    }
  },
};

registerTool(sprintStatusTool);
export default sprintStatusTool;

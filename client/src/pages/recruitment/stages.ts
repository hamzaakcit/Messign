/**
 * Single source of truth for recruitment pipeline UI and analytics alignment.
 * Kanban stage ids match server `RecruitmentStage` (see server/src/modules/hr/dal/recruitment/applications.ts).
 * Funnel buckets match `mv_recruitment_funnel` / getFunnelConversion (052_recruitment_ats.sql).
 */

export const RECRUITMENT_KANBAN_STAGE_IDS = [
  'applied',
  'screening',
  'phone_screen',
  'interview',
  'assessment',
  'final_interview',
  'offer',
  'hired',
] as const;

export type RecruitmentKanbanStageId = (typeof RECRUITMENT_KANBAN_STAGE_IDS)[number];

export interface RecruitmentKanbanStage {
  id: RecruitmentKanbanStageId;
  label: string;
}

export const RECRUITMENT_KANBAN_STAGES: RecruitmentKanbanStage[] = [
  { id: 'applied', label: 'Applied' },
  { id: 'screening', label: 'Screening' },
  { id: 'phone_screen', label: 'Phone Screen' },
  { id: 'interview', label: 'Interview' },
  { id: 'assessment', label: 'Assessment' },
  { id: 'final_interview', label: 'Final Interview' },
  { id: 'offer', label: 'Offer' },
  { id: 'hired', label: 'Hired' },
];

/** Aggregated funnel keys returned by getFunnelConversion / dashboard metrics `pipelineByStage`. */
export type RecruitmentFunnelBucket = 'applied' | 'screening' | 'interviewing' | 'offer' | 'hired';

/**
 * Maps a granular kanban stage to the materialized-view funnel bucket used in charts.
 * `phone_screen`, `interview`, `assessment`, `final_interview` → `interviewing`.
 */
export function funnelBucketForKanbanStage(
  stageId: string,
): RecruitmentFunnelBucket | 'rejected' | 'other' {
  switch (stageId) {
    case 'applied':
      return 'applied';
    case 'screening':
      return 'screening';
    case 'phone_screen':
    case 'interview':
    case 'assessment':
    case 'final_interview':
      return 'interviewing';
    case 'offer':
      return 'offer';
    case 'hired':
      return 'hired';
    case 'rejected':
    case 'withdrawn':
      return 'rejected';
    default:
      return 'other';
  }
}

/** Stage ids shown in “Move stage” dropdowns (same as kanban columns). */
export const RECRUITMENT_MOVE_STAGE_IDS: readonly RecruitmentKanbanStageId[] = RECRUITMENT_KANBAN_STAGE_IDS;

/**
 * Builds rows for the dashboard funnel chart from `pipelineByStage` API payload.
 */
export function buildFunnelChartDataFromMetrics(pipeline: Record<string, unknown>): Array<{ value: number; name: string }> {
  const n = (k: string): number => {
    const v = pipeline[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v !== '') {
      const parsed = Number(v);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };
  return [
    { value: n('applied'), name: 'Applied' },
    { value: n('screening'), name: 'Screening' },
    { value: n('interviewing'), name: 'Interviewing' },
    { value: n('offer'), name: 'Offer' },
    { value: n('hired'), name: 'Hired' },
  ];
}

import type { EventBus } from '../../../platform/eventBus.js';
import { crossModuleQueue, gamificationQueue } from '../../../queue/index.js';
import { query } from '../../../db/index.js';
import * as doraInsights from '../../../dal/doraInsights.js';
import * as recruitmentApplications from '../dal/recruitment/applications.js';
import { scoreCandidateResume } from '../../../services/recruitment/aiScoring.js';
import { closeJob } from '../dal/recruitment/jobs.js';

interface ApplicationMeta {
  application_id: string;
  job_id: string;
  job_title: string;
  organization_id: string;
  department: string | null;
  department_id: string | null;
  recruiter_id: string | null;
  hiring_manager_id: string | null;
  candidate_id: string;
  first_name: string;
  last_name: string | null;
  email: string;
  resume_text: string | null;
  requirements: string[];
}

async function getApplicationMeta(applicationId: string): Promise<ApplicationMeta | null> {
  const result = await query<ApplicationMeta>(
    `SELECT a.id::text AS application_id, a.job_id::text, j.title AS job_title, j.organization_id::text AS organization_id,
            j.department, j.department_id::text AS department_id, j.recruiter_id::text AS recruiter_id, j.hiring_manager_id::text AS hiring_manager_id,
            c.id::text AS candidate_id, c.first_name, c.last_name, c.email, c.resume_text, j.requirements
     FROM recruitment_applications a JOIN recruitment_jobs j ON j.id = a.job_id JOIN recruitment_candidates c ON c.id = a.candidate_id
     WHERE a.id = $1::uuid LIMIT 1`,
    [applicationId],
  );
  return result.rows[0] ?? null;
}

async function getJobMeta(jobId: string): Promise<{
  organization_id: string;
  title: string;
  recruiter_id: string | null;
  hiring_manager_id: string | null;
  positions_filled: number;
  positions_count: number;
} | null> {
  const result = await query<{
    organization_id: string;
    title: string;
    recruiter_id: string | null;
    hiring_manager_id: string | null;
    positions_filled: number;
    positions_count: number;
  }>(
    `SELECT organization_id::text, title, recruiter_id::text AS recruiter_id, hiring_manager_id::text AS hiring_manager_id, positions_filled, positions_count
     FROM recruitment_jobs WHERE id = $1::uuid LIMIT 1`,
    [jobId],
  );
  return result.rows[0] ?? null;
}

async function updateRecruitmentHireKrs(organizationId: string): Promise<void> {
  const hiredCountResult = await query<{ count: string }>(
    `SELECT COUNT(*)::int::text AS count FROM recruitment_applications a JOIN recruitment_jobs j ON j.id = a.job_id
     WHERE a.stage = 'hired' AND ($1::uuid IS NULL OR j.organization_id = $1::uuid)`,
    [organizationId],
  );
  const hiredCount = Number(hiredCountResult.rows[0]?.count ?? 0);
  const krs = await query<{ id: string; goal_id: string; target_value: string; start_value: string }>(
    `SELECT kr.id::text, kr.goal_id::text, kr.target_value::text, kr.start_value::text
     FROM okr_key_results kr JOIN okr_goals g ON g.id = kr.goal_id
     WHERE kr.auto_source = 'recruitment.hires_count' AND ($1::uuid IS NULL OR g.organization_id = $1::uuid)`,
    [organizationId],
  );
  for (const kr of krs.rows) {
    const target = Number(kr.target_value ?? 0);
    const start = Number(kr.start_value ?? 0);
    const range = target - start;
    const progress = range > 0 ? Math.min(100, Math.max(0, ((hiredCount - start) / range) * 100)) : 0;
    await query(`UPDATE okr_key_results SET current_value = $1, progress = $2, updated_at = NOW() WHERE id = $3::uuid`, [hiredCount, progress, kr.id]);
    const goalProgress = await query<{ avg_progress: string }>(`SELECT COALESCE(AVG(progress), 0)::numeric::text AS avg_progress FROM okr_key_results WHERE goal_id = $1::uuid`, [kr.goal_id]);
    await query(`UPDATE okr_goals SET progress = $1, updated_at = NOW() WHERE id = $2::uuid`, [Number(goalProgress.rows[0]?.avg_progress ?? 0), kr.goal_id]);
  }
}

function displayName(firstName: string, lastName: string | null, fallback: string): string {
  const full = [firstName, lastName].filter(Boolean).join(' ').trim();
  return full || fallback;
}

export function registerHrEventHandlers(eventBus: EventBus): void {
  eventBus.on('recruitment.application.received', async (payload) => {
    const meta = await getApplicationMeta(payload.applicationId);
    if (!meta) return;
    const aiScore = await scoreCandidateResume({
      candidateId: meta.candidate_id,
      jobId: meta.job_id,
      candidateName: displayName(meta.first_name, meta.last_name, meta.email),
      jobTitle: meta.job_title,
      resumeText: meta.resume_text ?? '',
      requirements: meta.requirements ?? [],
      tenantId: meta.organization_id ?? 'system',
    });
    const matchDetails = { matched_skills: aiScore.matched_skills, missing_skills: aiScore.missing_skills, recommendation: aiScore.recommendation, reasoning: aiScore.reasoning };
    await recruitmentApplications.updateApplicationScore(payload.applicationId, aiScore.match_score, matchDetails, 'ai', meta.organization_id ?? undefined);
    eventBus.emit('recruitment.candidate.screened', { applicationId: payload.applicationId, candidateId: payload.candidateId, matchScore: aiScore.match_score, screenedBy: 'dora-ai', method: 'ai' });
    if (aiScore.match_score >= 80) {
      await doraInsights.createInsight({
        organizationId: meta.organization_id,
        module: 'recruitment',
        severity: 'success',
        title: 'Strong candidate detected',
        message: `Strong candidate: ${displayName(meta.first_name, meta.last_name, meta.email)} scored ${aiScore.match_score}% match for ${meta.job_title}.`,
        sourceEvent: 'recruitment.application.received',
        sourceEntityType: 'application',
        sourceEntityId: payload.applicationId,
        targetUserId: meta.recruiter_id ?? meta.hiring_manager_id ?? undefined,
        metadata: matchDetails,
      });
    }
  });

  eventBus.on('recruitment.interview.completed', async (payload) => {
    const meta = await getApplicationMeta(payload.applicationId);
    if (!meta) return;
    const interviewMeta = await query<{ interviewer_id: string | null }>(`SELECT interviewer_id::text AS interviewer_id FROM recruitment_interviews WHERE id = $1::uuid LIMIT 1`, [payload.interviewId]);
    const stats = await query<{ pending_count: string; avg_rating: string }>(
      `SELECT COUNT(*) FILTER (WHERE status <> 'completed')::int::text AS pending_count, COALESCE(AVG(rating), 0)::numeric::text AS avg_rating
       FROM recruitment_interviews WHERE application_id = $1::uuid`,
      [payload.applicationId],
    );
    const pendingCount = Number(stats.rows[0]?.pending_count ?? 0);
    const avgRating = Number(stats.rows[0]?.avg_rating ?? 0);
    if (pendingCount === 0 && avgRating >= 4) {
      await doraInsights.createInsight({
        organizationId: meta.organization_id,
        module: 'recruitment',
        severity: 'success',
        title: 'Candidate ready for offer',
        message: `${displayName(meta.first_name, meta.last_name, meta.email)} has completed interviews for ${meta.job_title} with an average rating of ${avgRating.toFixed(1)}. Consider sending an offer.`,
        sourceEvent: 'recruitment.interview.completed',
        sourceEntityType: 'application',
        sourceEntityId: payload.applicationId,
        targetUserId: meta.recruiter_id ?? meta.hiring_manager_id ?? undefined,
        metadata: { avgRating },
      });
    }
    if (interviewMeta.rows[0]?.interviewer_id) {
      await gamificationQueue.add('recruitment_interviewer_xp', { type: 'award_xp', userId: interviewMeta.rows[0].interviewer_id, amount: 5, reason: 'Completed candidate interview' });
    }
  });

  eventBus.on('recruitment.candidate.hired', async (payload) => {
    const meta = await getApplicationMeta(payload.applicationId);
    const job = await getJobMeta(payload.jobId);
    if (!meta || !job) return;
    const candidateName = displayName(meta.first_name, meta.last_name, meta.email);
    const departmentId = meta.department_id ?? payload.departmentId;

    await crossModuleQueue.add('create_employee_from_hire', {
      type: 'create_employee_from_hire',
      payload: { candidateId: payload.candidateId, jobId: payload.jobId, departmentId, organizationId: meta.organization_id, startDate: payload.startDate, salary: payload.salary, employeeName: candidateName },
      sourceEvent: 'recruitment.candidate.hired',
    });

    await crossModuleQueue.add('allocate_new_hire_assets', {
      type: 'allocate_new_hire_assets',
      payload: { candidateId: payload.candidateId, departmentId, organizationId: meta.organization_id, startDate: payload.startDate, employeeName: candidateName },
      sourceEvent: 'recruitment.candidate.hired',
    });

    await query(`UPDATE recruitment_jobs SET positions_filled = LEAST(positions_count, positions_filled + 1), updated_at = NOW() WHERE id = $1::uuid`, [payload.jobId]);

    const refreshedJob = await getJobMeta(payload.jobId);
    if (refreshedJob && refreshedJob.positions_filled >= refreshedJob.positions_count) {
      await closeJob({ userId: job.recruiter_id ?? job.hiring_manager_id ?? 'system', role: 'manager', organizationId: meta.organization_id }, payload.jobId, 'Position filled');
    }

    if (job.recruiter_id) {
      await gamificationQueue.add('recruitment_hire_xp', { type: 'award_xp', userId: job.recruiter_id, amount: 20, reason: `Filled role ${job.title}` });
    }

    await doraInsights.createInsight({
      organizationId: meta.organization_id,
      module: 'recruitment',
      severity: 'success',
      title: 'Position filled',
      message: `Position '${job.title}' filled! ${candidateName} starts ${payload.startDate}.`,
      sourceEvent: 'recruitment.candidate.hired',
      sourceEntityType: 'application',
      sourceEntityId: payload.applicationId,
      targetUserId: job.hiring_manager_id ?? undefined,
      metadata: { candidateId: payload.candidateId, jobId: payload.jobId },
    });

    await updateRecruitmentHireKrs(meta.organization_id);
  });

  console.log('[HR] Event handlers registered');
}

import { query } from '../../../db/index.js';
import { eventBus } from '../../../events/index.js';
import * as doraInsights from '../../../dal/doraInsights.js';

const QUESTION_BANK = [
  { id: 'supported', text: 'How supported do you feel by your team this week?', scale: '1-5' },
  { id: 'energy', text: 'Rate your energy level this week', scale: '1-5' },
  { id: 'clarity', text: 'How clear are your priorities right now?', scale: '1-5' },
  { id: 'growth', text: 'Do you feel you are growing in your role?', scale: '1-5' },
  { id: 'heard', text: 'Do you feel your ideas and input are valued?', scale: '1-5' },
  { id: 'workload', text: 'How manageable is your current workload?', scale: '1-5' },
  { id: 'tools', text: 'Do you have the tools and resources you need?', scale: '1-5' },
  { id: 'belonging', text: 'How strong is your sense of belonging at the company?', scale: '1-5' },
  { id: 'recognition', text: 'Do you feel recognized for your contributions?', scale: '1-5' },
  { id: 'communication', text: 'How would you rate team communication?', scale: '1-5' },
];

export async function createAutoPulseSurvey(organizationId?: string): Promise<void> {
  const orgs = organizationId
    ? [{ id: organizationId }]
    : (await query<{ id: string }>(`SELECT id::text AS id FROM organizations LIMIT 20`)).rows;

  for (const org of orgs) {
    const recent = await query<{ questions: unknown }>(
      `SELECT questions FROM heart_pulse_surveys
       WHERE organization_id = $1::uuid AND sent_at >= NOW() - INTERVAL '30 days'
       ORDER BY sent_at DESC LIMIT 3`,
      [org.id]
    );
    const recentIds = (recent.rows.flatMap((r) => (r.questions as Array<{ id?: string }>)?.map((q) => q?.id) ?? []) ?? []) as string[];
    const available = QUESTION_BANK.filter((q) => !recentIds.includes(q.id));
    const pool = available.length >= 2 ? available : QUESTION_BANK;
    const idx1 = Math.floor(Math.random() * pool.length);
    let idx2 = Math.floor(Math.random() * (pool.length - 1));
    if (idx2 >= idx1) idx2 += 1;
    const selected = [pool[idx1], pool[idx2]].filter(Boolean);
    if (selected.length < 2) {
      selected.push(QUESTION_BANK.find((q) => q.id !== selected[0]?.id) ?? QUESTION_BANK[1]);
    }

    const title = `Pulse Check — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    const result = await query<{ id: string }>(
      `INSERT INTO heart_pulse_surveys (organization_id, title, questions, target_scope, status, sent_at, closes_at)
       VALUES ($1::uuid, $2, $3::jsonb, 'organization', 'active', NOW(), NOW() + INTERVAL '5 days')
       RETURNING id::text AS id`,
      [org.id, title, JSON.stringify(selected)]
    );
    const surveyId = result.rows[0]?.id;
    if (!surveyId) continue;

    await doraInsights.createInsight({
      organizationId: org.id,
      module: 'heart',
      severity: 'info',
      title: 'Quick pulse check',
      message: 'Dora has a 2-question wellness check for you. Takes 30 seconds.',
      sourceEvent: 'heart.pulse.survey_sent',
      metadata: { type: 'pulse_survey', surveyId },
    });

    const empCount = (
      await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM reimbursement_users
         WHERE organization_id = $1::uuid AND status IS DISTINCT FROM 'inactive'`,
        [org.id]
      )
    ).rows[0]?.count ?? '0';

    eventBus.emit('heart.pulse.survey_sent', {
      surveyId,
      questionCount: selected.length,
      recipientCount: parseInt(empCount, 10),
    });
    console.log(`[PulseSurvey] Created survey ${surveyId} with ${selected.length} questions for org ${org.id}`);
  }
}

export interface AggregatedPulseResults {
  survey: { id: string; title: string | null; questions: unknown[]; response_count: number };
  responseCount: number;
  distributions: Record<
    string,
    { '1': number; '2': number; '3': number; '4': number; '5': number; avg: number }
  >;
}

export async function getAggregatedResults(surveyId: string): Promise<AggregatedPulseResults | null> {
  const survey = await query<{
    id: string;
    title: string | null;
    questions: unknown;
    response_count: number;
  }>(
    `SELECT id::text AS id, title, questions, response_count
     FROM heart_pulse_surveys WHERE id = $1::uuid`,
    [surveyId]
  );
  const surveyRow = survey.rows[0];
  if (!surveyRow) return null;

  const distResult = await query<{ key: string; distribution: unknown }>(
    `SELECT key, jsonb_build_object(
       '1', COUNT(*) FILTER (WHERE (value::text)::int = 1),
       '2', COUNT(*) FILTER (WHERE (value::text)::int = 2),
       '3', COUNT(*) FILTER (WHERE (value::text)::int = 3),
       '4', COUNT(*) FILTER (WHERE (value::text)::int = 4),
       '5', COUNT(*) FILTER (WHERE (value::text)::int = 5),
       'avg', ROUND(AVG((value::text)::numeric), 2)
     ) AS distribution
     FROM heart_pulse_responses, jsonb_each_text(answers) AS x(key, value)
     WHERE survey_id = $1::uuid
     GROUP BY key`,
    [surveyId]
  );

  const distributions: Record<string, { '1': number; '2': number; '3': number; '4': number; '5': number; avg: number }> = {};
  for (const row of distResult.rows) {
    const d = row.distribution as Record<string, number>;
    distributions[row.key] = {
      '1': Number(d?.['1'] ?? 0),
      '2': Number(d?.['2'] ?? 0),
      '3': Number(d?.['3'] ?? 0),
      '4': Number(d?.['4'] ?? 0),
      '5': Number(d?.['5'] ?? 0),
      avg: Number(d?.avg ?? 0),
    };
  }

  const totalRow = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM heart_pulse_responses WHERE survey_id = $1::uuid`,
    [surveyId]
  );

  return {
    survey: {
      id: surveyRow.id,
      title: surveyRow.title,
      questions: (surveyRow.questions as unknown[]) ?? [],
      response_count: surveyRow.response_count,
    },
    responseCount: parseInt(totalRow.rows[0]?.total ?? '0', 10),
    distributions,
  };
}

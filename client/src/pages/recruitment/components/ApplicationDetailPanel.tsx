import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { recruitmentAPI, type RecruitmentApplication, type RecruitmentInterview } from '@/lib/recruitmentApi';
import { useAuthStore } from '@/stores/authStore';
import { RECRUITMENT_KANBAN_STAGES } from '../stages';

interface ApplicationDetailPanelProps {
  applicationId: string;
  onUpdated: () => void;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-300';
  if (score >= 50) return 'text-amber-300';
  return 'text-red-300';
}

/** `interviewer_id` references `reimbursement_users.id` — prefer workspace user id, then auth id. */
function interviewerUserId(user: { id?: string; authUserId?: string } | null): string {
  return user?.id || user?.authUserId || '';
}

export function ApplicationDetailPanel({ applicationId, onUpdated }: ApplicationDetailPanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [application, setApplication] = useState<RecruitmentApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [nextStage, setNextStage] = useState('interview');
  const [offerSalary, setOfferSalary] = useState('65000');
  const [offerStartDate, setOfferStartDate] = useState('');
  const [interviewAt, setInterviewAt] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [moveStageNotes, setMoveStageNotes] = useState('');
  const [pendingAction, setPendingAction] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setApplication(await recruitmentAPI.getApplication(userId, applicationId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load application');
      setApplication(null);
    } finally {
      setLoading(false);
    }
  }, [applicationId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (application?.stage) setNextStage(application.stage);
  }, [application?.stage]);

  const matchedSkills = useMemo(
    () =>
      Array.isArray(application?.match_details?.matched_skills)
        ? (application?.match_details?.matched_skills as string[])
        : [],
    [application],
  );
  const missingSkills = useMemo(
    () =>
      Array.isArray(application?.match_details?.missing_skills)
        ? (application?.match_details?.missing_skills as string[])
        : [],
    [application],
  );

  const runAction = async (fn: () => Promise<void>): Promise<void> => {
    setPendingAction(true);
    try {
      await fn();
      await load();
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setPendingAction(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-app-muted">Loading application…</div>;
  }
  if (!application) {
    return <div className="p-6 text-sm text-app-muted">Application not found.</div>;
  }

  const candidate = application.candidate;
  const latestOffer = application.offers?.[0];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-app-text">
            {candidate?.first_name} {candidate?.last_name}
          </h3>
          <p className="text-sm text-app-muted">
            {candidate?.email || 'No email'} • {candidate?.current_company || 'No company'}
          </p>
        </div>
        <Badge variant={application.screened_method === 'ai' ? 'green' : 'default'}>
          {application.screened_method === 'ai' ? 'AI Scored' : 'Manual'}
        </Badge>
      </div>

      <div className="rounded-xl border border-app-border bg-app-card p-4">
        <div className="text-xs text-app-muted mb-1">Match Score</div>
        <div className={`text-3xl font-semibold ${scoreColor(application.match_score || 0)}`}>
          {application.match_score ?? 0}%
        </div>
        <p className="mt-2 text-sm text-app-muted">{String(application.match_details?.reasoning || 'No Dora assessment yet.')}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-semibold text-app-text mb-2">Matched Skills</h4>
          <div className="flex flex-wrap gap-2">
            {matchedSkills.length > 0 ? (
              matchedSkills.map((skill) => (
                <Badge key={skill} variant="green">
                  {skill}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-app-muted">No matches yet.</span>
            )}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-app-text mb-2">Missing Skills</h4>
          <div className="flex flex-wrap gap-2">
            {missingSkills.length > 0 ? (
              missingSkills.map((skill) => (
                <Badge key={skill} variant="red">
                  {skill}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-app-muted">No major gaps detected.</span>
            )}
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-app-text mb-2">Stage History</h4>
        <div className="space-y-2">
          {(application.stage_history || []).length > 0 ? (
            application.stage_history?.map((entry, index) => (
              <div key={`${String(entry.id)}-${index}`} className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm">
                <div className="text-app-text">
                  {String(entry.from_stage || 'start')} → {String(entry.to_stage || '')}
                </div>
                <div className="text-app-muted text-xs">
                  {String(entry.moved_by_name || 'System')} • {String(entry.moved_at || '')}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-app-muted">No stage history yet.</div>
          )}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-app-text mb-2">Interview Scorecards</h4>
        <div className="space-y-2">
          {(application.interviews || []).length > 0 ? (
            application.interviews?.map((interview) => (
              <InterviewRow
                key={interview.id}
                interview={interview}
                userId={userId}
                disabled={pendingAction}
                onUpdated={() => {
                  void load();
                  onUpdated();
                }}
              />
            ))
          ) : (
            <div className="text-sm text-app-muted">No interviews scheduled yet.</div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-app-muted mb-1">Move Stage</label>
          <div className="flex gap-2">
            <select
              className="flex-1 rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
              value={nextStage}
              onChange={(e) => setNextStage(e.target.value)}
              disabled={pendingAction}
            >
              {RECRUITMENT_KANBAN_STAGES.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pendingAction}
              onClick={() =>
                void runAction(async () => {
                  const notes = moveStageNotes.trim();
                  await recruitmentAPI.moveApplicationStage(userId, application.id, nextStage, notes || undefined);
                  setMoveStageNotes('');
                })
              }
              className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-50"
            >
              Move
            </button>
          </div>
          <textarea
            className="mt-2 w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text min-h-[56px]"
            placeholder="Optional note for this stage change (logged in history)"
            value={moveStageNotes}
            onChange={(e) => setMoveStageNotes(e.target.value)}
            disabled={pendingAction}
          />
        </div>

        <div>
          <label className="block text-xs text-app-muted mb-1">Schedule Interview</label>
          <div className="flex gap-2">
            <input
              type="datetime-local"
              className="flex-1 rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
              value={interviewAt}
              onChange={(e) => setInterviewAt(e.target.value)}
              disabled={pendingAction}
            />
            <button
              type="button"
              disabled={pendingAction}
              onClick={() =>
                void runAction(async () => {
                  if (!interviewAt) {
                    toast.error('Pick a date and time');
                    return;
                  }
                  const iid = interviewerUserId(user);
                  if (!iid) {
                    toast.error('Missing interviewer account id');
                    return;
                  }
                  await recruitmentAPI.scheduleInterview(userId, {
                    application_id: application.id,
                    interviewer_id: iid,
                    scheduled_at: new Date(interviewAt).toISOString(),
                    interview_type: 'video',
                  });
                  toast.success('Interview scheduled');
                })
              }
              className="px-3 py-2 rounded-lg text-sm font-medium bg-app-surface-tertiary text-app-text hover:bg-app-hover disabled:opacity-50"
            >
              Schedule
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs text-app-muted mb-1">Send Offer</label>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              type="number"
              className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
              value={offerSalary}
              onChange={(e) => setOfferSalary(e.target.value)}
              placeholder="Salary"
              disabled={pendingAction}
            />
            <input
              type="date"
              className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
              value={offerStartDate}
              onChange={(e) => setOfferStartDate(e.target.value)}
              disabled={pendingAction}
            />
            <button
              type="button"
              disabled={pendingAction}
              onClick={() => {
                if (!window.confirm('Create and send this offer to the candidate now?')) return;
                void runAction(async () => {
                  const offer = await recruitmentAPI.createOffer(userId, {
                    application_id: application.id,
                    salary: Number(offerSalary || 0),
                    start_date: offerStartDate || undefined,
                  });
                  await recruitmentAPI.sendOffer(userId, offer.id);
                  toast.success('Offer sent');
                });
              }}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-app-text hover:bg-emerald-500 disabled:opacity-50"
            >
              Send
            </button>
          </div>
          {latestOffer && (
            <p className="mt-2 text-xs text-app-muted">
              Latest offer: {latestOffer.status} {latestOffer.start_date ? `• starts ${latestOffer.start_date}` : ''}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs text-app-muted mb-1">Reject reason</label>
          <textarea
            className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text min-h-[72px]"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (required)"
            disabled={pendingAction}
          />
        </div>
        <button
          type="button"
          disabled={pendingAction}
          onClick={() => {
            const reason = rejectReason.trim();
            if (!reason) {
              toast.error('Enter a rejection reason');
              return;
            }
            if (!window.confirm('Reject this candidate? This cannot be undone.')) return;
            void runAction(async () => {
              await recruitmentAPI.rejectApplication(userId, application.id, reason);
              toast.success('Application rejected');
            });
          }}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-red-500/15 text-red-300 hover:bg-red-500/20 disabled:opacity-50"
        >
          Reject Candidate
        </button>
      </div>
    </div>
  );
}

interface InterviewRowProps {
  interview: RecruitmentInterview;
  userId: string;
  disabled: boolean;
  onUpdated: () => void;
}

function InterviewRow({ interview, userId, disabled, onUpdated }: InterviewRowProps) {
  const [rating, setRating] = useState(String(interview.rating ?? 3));
  const [recommendation, setRecommendation] = useState(interview.recommendation || 'neutral');

  return (
    <div className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm space-y-2">
      <div className="text-app-text">
        {interview.interview_type} • {interview.status}
      </div>
      <div className="text-app-muted text-xs">
        {interview.scheduled_at} {interview.rating ? `• Rating ${interview.rating}/5` : ''}
      </div>
      {interview.status === 'scheduled' && (
        <div className="flex flex-wrap gap-2 items-end pt-1">
          <div>
            <label className="text-xs text-app-muted">Rating</label>
            <select
              className="block rounded border border-app-border bg-app-card px-2 py-1 text-xs"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              disabled={disabled}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-app-muted">Recommendation</label>
            <select
              className="block rounded border border-app-border bg-app-card px-2 py-1 text-xs"
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value)}
              disabled={disabled}
            >
              {(['strong_yes', 'yes', 'neutral', 'no', 'strong_no'] as const).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={disabled}
            className="px-2 py-1 rounded text-xs bg-primary-500/80 text-app-text"
            onClick={() =>
              void (async () => {
                try {
                  await recruitmentAPI.completeInterview(userId, interview.id, {
                    rating: Number(rating),
                    recommendation,
                  });
                  toast.success('Interview marked complete');
                  onUpdated();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Failed to complete interview');
                }
              })()
            }
          >
            Complete
          </button>
          <button
            type="button"
            disabled={disabled}
            className="px-2 py-1 rounded text-xs bg-app-surface-tertiary text-app-text"
            onClick={() => {
              const notes = window.prompt('Cancellation notes (optional)') ?? undefined;
              void (async () => {
                try {
                  await recruitmentAPI.cancelInterview(userId, interview.id, notes);
                  toast.success('Interview cancelled');
                  onUpdated();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Failed to cancel');
                }
              })();
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

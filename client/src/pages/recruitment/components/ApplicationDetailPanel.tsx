import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { recruitmentAPI, type RecruitmentApplication } from '@/lib/recruitmentApi';
import { useAuthStore } from '@/stores/authStore';

interface ApplicationDetailPanelProps {
  applicationId: string;
  onUpdated: () => void;
}

const STAGES = ['applied', 'screening', 'phone_screen', 'interview', 'assessment', 'final_interview', 'offer', 'hired'] as const;

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-300';
  if (score >= 50) return 'text-amber-300';
  return 'text-red-300';
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

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setApplication(await recruitmentAPI.getApplication(userId, applicationId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [applicationId, userId]);

  const matchedSkills = useMemo(() => Array.isArray(application?.match_details?.matched_skills) ? application?.match_details?.matched_skills as string[] : [], [application]);
  const missingSkills = useMemo(() => Array.isArray(application?.match_details?.missing_skills) ? application?.match_details?.missing_skills as string[] : [], [application]);

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
          <p className="text-sm text-app-muted">{candidate?.email || 'No email'} • {candidate?.current_company || 'No company'}</p>
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
            {matchedSkills.length > 0 ? matchedSkills.map((skill) => <Badge key={skill} variant="green">{skill}</Badge>) : <span className="text-sm text-app-muted">No matches yet.</span>}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-app-text mb-2">Missing Skills</h4>
          <div className="flex flex-wrap gap-2">
            {missingSkills.length > 0 ? missingSkills.map((skill) => <Badge key={skill} variant="red">{skill}</Badge>) : <span className="text-sm text-app-muted">No major gaps detected.</span>}
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-app-text mb-2">Stage History</h4>
        <div className="space-y-2">
          {(application.stage_history || []).length > 0 ? application.stage_history?.map((entry, index) => (
            <div key={`${String(entry.id)}-${index}`} className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm">
              <div className="text-app-text">{String(entry.from_stage || 'start')} → {String(entry.to_stage || '')}</div>
              <div className="text-app-muted text-xs">{String(entry.moved_by_name || 'System')} • {String(entry.moved_at || '')}</div>
            </div>
          )) : <div className="text-sm text-app-muted">No stage history yet.</div>}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-app-text mb-2">Interview Scorecards</h4>
        <div className="space-y-2">
          {(application.interviews || []).length > 0 ? application.interviews?.map((interview) => (
            <div key={interview.id} className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm">
              <div className="text-app-text">{interview.interview_type} • {interview.status}</div>
              <div className="text-app-muted text-xs">{interview.scheduled_at} {interview.rating ? `• Rating ${interview.rating}/5` : ''}</div>
            </div>
          )) : <div className="text-sm text-app-muted">No interviews scheduled yet.</div>}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-app-muted mb-1">Move Stage</label>
          <div className="flex gap-2">
            <select className="flex-1 rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={nextStage} onChange={(e) => setNextStage(e.target.value)}>
              {STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
            </select>
            <button
              onClick={async () => {
                await recruitmentAPI.moveApplicationStage(userId, application.id, nextStage);
                await load();
                onUpdated();
              }}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600"
            >
              Move
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs text-app-muted mb-1">Schedule Interview</label>
          <div className="flex gap-2">
            <input type="datetime-local" className="flex-1 rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={interviewAt} onChange={(e) => setInterviewAt(e.target.value)} />
            <button
              onClick={async () => {
                if (!interviewAt) return;
                await recruitmentAPI.scheduleInterview(userId, {
                  application_id: application.id,
                  interviewer_id: user?.id,
                  scheduled_at: new Date(interviewAt).toISOString(),
                  interview_type: 'video',
                });
                await load();
                onUpdated();
              }}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 text-app-text hover:bg-white/10"
            >
              Schedule
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs text-app-muted mb-1">Send Offer</label>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input type="number" className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={offerSalary} onChange={(e) => setOfferSalary(e.target.value)} placeholder="Salary" />
            <input type="date" className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={offerStartDate} onChange={(e) => setOfferStartDate(e.target.value)} />
            <button
              onClick={async () => {
                const offer = await recruitmentAPI.createOffer(userId, {
                  application_id: application.id,
                  salary: Number(offerSalary || 0),
                  start_date: offerStartDate || undefined,
                });
                await recruitmentAPI.sendOffer(userId, offer.id);
                await load();
                onUpdated();
              }}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500"
            >
              Send
            </button>
          </div>
          {latestOffer && <p className="mt-2 text-xs text-app-muted">Latest offer: {latestOffer.status} {latestOffer.start_date ? `• starts ${latestOffer.start_date}` : ''}</p>}
        </div>

        <button
          onClick={async () => {
            await recruitmentAPI.rejectApplication(userId, application.id, 'Rejected from application detail panel');
            await load();
            onUpdated();
          }}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-red-500/15 text-red-300 hover:bg-red-500/20"
        >
          Reject Candidate
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Phone, Mail, Users, StickyNote, Calendar, TrendingUp,
  ChevronDown, Trophy, XCircle, Plus, CheckCircle2,
  Building2, User, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { crmAPI } from '@/lib/crmApi';
import type {
  Deal, DealStage, StageHistoryEntry, ActivityDetail,
  CreateActivityInput, Contact,
} from '@/lib/crmApi';
import { cn } from '@/lib/utils';

interface DealDetailPanelProps {
  dealId: string;
  onClose: () => void;
  stages: DealStage[];
  onDealUpdated: () => void;
}

function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(d);
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  call: Phone, email: Mail, meeting: Users, note: StickyNote, task: CheckCircle2,
};

function getScoreColor(score: number): string {
  if (score > 70) return 'text-emerald-400';
  if (score > 40) return 'text-amber-400';
  return 'text-red-400';
}

function getScoreBg(score: number): string {
  if (score > 70) return 'bg-emerald-500/20 border-emerald-500/30';
  if (score > 40) return 'bg-amber-500/20 border-amber-500/30';
  return 'bg-red-500/20 border-red-500/30';
}

// ── Loading Skeleton ──

function DetailSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-6 bg-white/10 rounded w-2/3" />
        <div className="h-4 bg-white/10 rounded w-1/3" />
        <div className="h-8 bg-white/10 rounded w-1/4 mt-2" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <div key={i} className="h-16 bg-white/10 rounded-lg" />)}
      </div>
      <div className="h-10 bg-white/10 rounded-lg" />
      <div className="space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-20 bg-white/10 rounded-lg" />)}
      </div>
    </div>
  );
}

// ── Stage History Timeline ──

function StageTimeline({ history }: { history: StageHistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="text-xs text-app-muted">No stage transitions yet.</p>;
  }

  return (
    <div className="space-y-0">
      {history.map((entry, i) => (
        <div key={entry.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-2.5 h-2.5 rounded-full bg-primary-500 mt-1.5 shrink-0" />
            {i < history.length - 1 && <div className="w-px flex-1 bg-white/10 my-1" />}
          </div>
          <div className="pb-4 flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs">
              {entry.from_stage_name && (
                <>
                  <span className="text-app-muted">{entry.from_stage_name}</span>
                  <ArrowRight className="w-3 h-3 text-app-muted" />
                </>
              )}
              <span className="text-app-text font-medium">{entry.to_stage_name}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-app-muted">
              <span>{formatDate(entry.moved_at)}</span>
              {entry.moved_by_name && <span>by {entry.moved_by_name}</span>}
              {entry.time_in_previous_stage_hours != null && entry.time_in_previous_stage_hours > 0 && (
                <span className="text-app-muted">
                  ({entry.time_in_previous_stage_hours < 24
                    ? `${Math.round(entry.time_in_previous_stage_hours)}h`
                    : `${Math.round(entry.time_in_previous_stage_hours / 24)}d`
                  } in prev stage)
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Activity Log Item ──

function ActivityItem({ activity }: { activity: ActivityDetail }) {
  const Icon = ACTIVITY_ICONS[activity.type] ?? StickyNote;

  return (
    <div className="flex gap-3 py-3 border-b border-white/5 last:border-0">
      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-app-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-app-text truncate">
            {activity.subject || activity.type}
          </span>
          {activity.outcome && (
            <Badge variant={activity.outcome === 'positive' ? 'green' : activity.outcome === 'negative' ? 'red' : 'default'} size="sm">
              {activity.outcome}
            </Badge>
          )}
        </div>
        {activity.description && (
          <p className="text-xs text-app-muted mt-0.5 line-clamp-2">{activity.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1 text-[11px] text-app-muted">
          <span>{formatRelative(activity.created_at)}</span>
          {activity.user_name && <span>by {activity.user_name}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Log Activity Inline Form ──

function LogActivityForm({ onSubmit, onCancel }: { onSubmit: (data: CreateActivityInput) => void; onCancel: () => void }) {
  const [type, setType] = useState<CreateActivityInput['type']>('call');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [outcome, setOutcome] = useState('');

  const inputClass = 'w-full rounded-lg border border-app-border bg-app-inputBg px-3 py-1.5 text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <div className="rounded-lg border border-app-border bg-white/5 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select value={type} onChange={e => setType(e.target.value as CreateActivityInput['type'])} className={inputClass}>
          <option value="call">Call</option>
          <option value="email">Email</option>
          <option value="meeting">Meeting</option>
          <option value="note">Note</option>
          <option value="task">Task</option>
        </select>
        <input value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="Outcome" className={inputClass} />
      </div>
      <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" className={inputClass} autoFocus />
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description..." rows={2} className={inputClass} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1 text-xs text-app-muted hover:text-app-text">Cancel</button>
        <button
          type="button"
          onClick={() => onSubmit({ type, subject: subject || undefined, description: description || undefined, outcome: outcome || undefined })}
          className="px-3 py-1 text-xs font-medium rounded-md bg-primary-500 text-app-text hover:bg-primary-600"
        >
          Log
        </button>
      </div>
    </div>
  );
}

// ── Main Panel ──

export function DealDetailPanel({ dealId, stages, onDealUpdated }: DealDetailPanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId ?? user?.id ?? '';

  const [deal, setDeal] = useState<Deal | null>(null);
  const [history, setHistory] = useState<StageHistoryEntry[]>([]);
  const [activities, setActivities] = useState<ActivityDetail[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageDropdownOpen, setStageDropdownOpen] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [lostReasonMode, setLostReasonMode] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchAll = useCallback(async () => {
    if (!userId || !dealId) return;
    setLoading(true);
    try {
      const [dealData, historyData, activitiesData] = await Promise.all([
        crmAPI.getDeal(userId, dealId),
        crmAPI.getDealHistory(userId, dealId),
        crmAPI.getDealActivities(userId, dealId),
      ]);
      if (!mountedRef.current) return;
      setDeal(dealData);
      setHistory(historyData);
      setActivities(activitiesData.data ?? []);

      if (dealData.company_id) {
        const contactsData = await crmAPI.listContacts(userId, { company_id: dealData.company_id });
        if (mountedRef.current) setContacts(contactsData.data ?? []);
      }
    } catch (err) {
      if (mountedRef.current) toast.error(err instanceof Error ? err.message : 'Failed to load deal');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId, dealId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleMoveStage = async (stageId: string) => {
    if (!deal || stageId === deal.stage_id) return;
    setActionLoading(true);
    setStageDropdownOpen(false);
    try {
      await crmAPI.moveDealToStage(userId, dealId, stageId);
      toast.success('Deal moved');
      fetchAll();
      onDealUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to move deal');
    } finally {
      setActionLoading(false);
    }
  };

  const handleWin = async () => {
    const wonStage = stages.find(s => s.is_won);
    if (!wonStage) { toast.error('No "Won" stage found'); return; }
    await handleMoveStage(wonStage.id);
  };

  const handleLose = async () => {
    if (!lostReasonMode) { setLostReasonMode(true); return; }
    setActionLoading(true);
    try {
      await crmAPI.loseDeal(userId, dealId, lostReason || undefined);
      toast.success('Deal marked as lost');
      setLostReasonMode(false);
      setLostReason('');
      fetchAll();
      onDealUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to lose deal');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogActivity = async (data: CreateActivityInput) => {
    try {
      await crmAPI.createDealActivity(userId, dealId, data);
      toast.success('Activity logged');
      setShowLogForm(false);
      const activitiesData = await crmAPI.getDealActivities(userId, dealId);
      if (mountedRef.current) setActivities(activitiesData.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to log activity');
    }
  };

  if (loading || !deal) return <DetailSkeleton />;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── Header ── */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            {deal.stage_color && (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border"
                style={{
                  backgroundColor: `${deal.stage_color}20`,
                  borderColor: `${deal.stage_color}40`,
                  color: deal.stage_color,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: deal.stage_color }} />
                {deal.stage_name}
              </span>
            )}
            {deal.probability != null && (
              <span className="text-[11px] text-app-muted">{deal.probability}% probability</span>
            )}
          </div>
          <h2 className="text-lg font-semibold text-app-text">{deal.title}</h2>
          <p className="text-2xl font-bold text-emerald-400 mt-1">
            {formatCurrency(deal.amount, deal.currency)}
          </p>
        </div>

        {/* ── Key Info Row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {deal.owner_name && (
            <div className="rounded-lg border border-white/5 bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center text-[10px] font-medium text-primary-400">
                  {getInitials(deal.owner_name)}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-app-muted">Owner</p>
                  <p className="text-xs text-app-text truncate">{deal.owner_name}</p>
                </div>
              </div>
            </div>
          )}
          {deal.company_name && (
            <div className="rounded-lg border border-white/5 bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-app-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-app-muted">Company</p>
                  <p className="text-xs text-app-text truncate">{deal.company_name}</p>
                </div>
              </div>
            </div>
          )}
          {deal.expected_close_date && (
            <div className="rounded-lg border border-white/5 bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-app-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-app-muted">Expected Close</p>
                  <p className="text-xs text-app-text">{formatDate(deal.expected_close_date)}</p>
                </div>
              </div>
            </div>
          )}
          {deal.contact_name && (
            <div className="rounded-lg border border-white/5 bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-app-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-app-muted">Contact</p>
                  <p className="text-xs text-app-text truncate">{deal.contact_name}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Dora AI Section ── */}
        {deal.dora_score != null && (
          <div
            className="rounded-lg border p-4 flex items-start gap-4"
            style={{
              background: 'linear-gradient(135deg, #1E3A5F 0%, var(--app-bg) 100%)',
              borderColor: 'rgba(30, 64, 175, 0.2)',
            }}
          >
            <div className={cn(
              'w-12 h-12 rounded-full border-2 flex items-center justify-center shrink-0',
              getScoreBg(deal.dora_score),
            )}>
              <span className={cn('text-lg font-bold', getScoreColor(deal.dora_score))}>
                {deal.dora_score}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-app-text text-[10px]"
                  style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}
                >
                  ✦
                </div>
                <span className="text-xs font-medium text-blue-300">Dora Score</span>
              </div>
              {deal.dora_next_action && (
                <p className="text-[13px] text-blue-200/80">{deal.dora_next_action}</p>
              )}
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="activities">Activities ({activities.length})</TabsTrigger>
            <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
          </TabsList>

          {/* Details Tab */}
          <TabsContent value="details">
            <div className="space-y-4">
              {deal.description && (
                <div>
                  <h4 className="text-xs font-medium text-app-muted mb-1">Description</h4>
                  <p className="text-sm text-app-text whitespace-pre-wrap">{deal.description}</p>
                </div>
              )}

              {deal.competitor && (
                <div>
                  <h4 className="text-xs font-medium text-app-muted mb-1">Competitor</h4>
                  <p className="text-sm text-app-text">{deal.competitor}</p>
                </div>
              )}

              {deal.tags && deal.tags.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-app-muted mb-1">Tags</h4>
                  <div className="flex flex-wrap gap-1">
                    {deal.tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 text-[11px] bg-white/10 text-app-muted rounded-full">{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {deal.notes && (
                <div>
                  <h4 className="text-xs font-medium text-app-muted mb-1">Notes</h4>
                  <p className="text-sm text-app-text whitespace-pre-wrap">{deal.notes}</p>
                </div>
              )}

              <div>
                <h4 className="text-xs font-medium text-app-muted mb-2">Stage History</h4>
                <StageTimeline history={history} />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-app-muted">Created</span>
                  <p className="text-app-text">{formatDate(deal.created_at)}</p>
                </div>
                <div>
                  <span className="text-app-muted">Last Updated</span>
                  <p className="text-app-text">{formatDate(deal.updated_at)}</p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Activities Tab */}
          <TabsContent value="activities">
            <div className="space-y-3">
              <button
                onClick={() => setShowLogForm(prev => !prev)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary-400 hover:text-primary-300"
              >
                <Plus className="w-3.5 h-3.5" />
                Log Activity
              </button>

              {showLogForm && (
                <LogActivityForm
                  onSubmit={handleLogActivity}
                  onCancel={() => setShowLogForm(false)}
                />
              )}

              {activities.length === 0 ? (
                <p className="text-xs text-app-muted py-4 text-center">No activities yet.</p>
              ) : (
                <div>
                  {activities.map(a => <ActivityItem key={a.id} activity={a} />)}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="contacts">
            {contacts.length === 0 ? (
              <p className="text-xs text-app-muted py-4 text-center">
                {deal.company_id ? 'No contacts found for this company.' : 'No company linked to this deal.'}
              </p>
            ) : (
              <div className="space-y-0 divide-y divide-white/5">
                {contacts.map(c => (
                  <div key={c.id} className="py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[11px] font-medium text-app-muted shrink-0">
                      {getInitials(`${c.first_name} ${c.last_name}`)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-app-text font-medium truncate">
                        {c.first_name} {c.last_name}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-app-muted">
                        {c.job_title && <span>{c.job_title}</span>}
                        {c.email && <span>{c.email}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Action Bar ── */}
      <div className="shrink-0 border-t border-app-border px-6 py-3 flex items-center gap-2" style={{ backgroundColor: 'var(--app-sidebar)' }}>
        {/* Move Stage Dropdown */}
        <div className="relative">
          <button
            onClick={() => setStageDropdownOpen(prev => !prev)}
            disabled={actionLoading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-app-border bg-app-card text-app-text hover:bg-app-hover transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Move Stage
            <ChevronDown className="w-3 h-3" />
          </button>
          {stageDropdownOpen && (
            <>
              <div className="fixed inset-0 z-[70]" onClick={() => setStageDropdownOpen(false)} />
              <div className="absolute bottom-full mb-1 left-0 z-[71] w-48 rounded-lg border border-app-border bg-app-card shadow-xl py-1 max-h-60 overflow-y-auto">
                {stages.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleMoveStage(s.id)}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-app-hover transition-colors',
                      s.id === deal.stage_id && 'bg-primary-500/10 text-primary-400',
                    )}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    {s.name}
                    {s.id === deal.stage_id && <CheckCircle2 className="w-3 h-3 ml-auto" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Lost */}
        {lostReasonMode ? (
          <div className="flex items-center gap-2">
            <input
              value={lostReason}
              onChange={e => setLostReason(e.target.value)}
              placeholder="Reason (optional)"
              className="rounded-md border border-app-border bg-app-inputBg px-2 py-1 text-xs text-app-text w-36 focus:outline-none focus:ring-1 focus:ring-red-500"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleLose(); if (e.key === 'Escape') { setLostReasonMode(false); setLostReason(''); } }}
            />
            <button
              onClick={handleLose}
              disabled={actionLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500 text-app-text hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => { setLostReasonMode(false); setLostReason(''); }}
              className="px-2 py-1.5 text-xs text-app-muted hover:text-app-text"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={handleLose}
              disabled={actionLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <XCircle className="w-3.5 h-3.5" />
              Lost
            </button>
            <button
              onClick={handleWin}
              disabled={actionLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500 text-app-text hover:bg-emerald-600 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <Trophy className="w-3.5 h-3.5" />
              Won
            </button>
          </>
        )}
      </div>
    </div>
  );
}

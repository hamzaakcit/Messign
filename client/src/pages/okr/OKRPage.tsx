import { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown, ChevronRight, Plus, Target, CheckCircle2,
  AlertTriangle, XCircle, BarChart3, Send, LayoutGrid, GitBranch,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import * as okrAPI from '@/lib/okrApi';
import type { Goal, KeyResult, OKRPeriod, OKRMetrics, CreateGoalInput, CreateKeyResultInput } from '@/lib/okrApi';
import { OKRGoalTree } from '@/components/visualizations/OKRGoalTree';
import { EmptyState } from '@/components/ui';

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  on_track: { color: 'bg-emerald-400', bg: 'bg-emerald-400/10', label: 'On Track' },
  at_risk: { color: 'bg-amber-400', bg: 'bg-amber-400/10', label: 'At Risk' },
  behind: { color: 'bg-red-400', bg: 'bg-red-400/10', label: 'Behind' },
  completed: { color: 'bg-blue-400', bg: 'bg-blue-400/10', label: 'Completed' },
};

const LEVEL_LABELS: Record<string, string> = {
  company: 'Company',
  department: 'Department',
  team: 'Team',
  individual: 'Individual',
};

function progressBarColor(progress: number): string {
  if (progress >= 70) return 'bg-emerald-500';
  if (progress >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

// ── Check-in Inline Form ──

function CheckInForm({ kr, userId, onDone }: { kr: KeyResult; userId: string; onDone: () => void }) {
  const [value, setValue] = useState(kr.current_value?.toString() ?? '0');
  const [note, setNote] = useState('');
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low'>('medium');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await okrAPI.checkIn(kr.id, Number(value), note || undefined, confidence, userId);
      onDone();
    } catch (err) {
      console.error('Check-in failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-2 p-3 rounded-lg bg-[var(--app-bg)] border border-[var(--app-border)]">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-[11px] text-gray-400 mb-1 block">Value</label>
          <input
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
            className="w-full bg-white/5 border border-[var(--app-border)] rounded px-2 py-1 text-sm text-white"
          />
        </div>
        <div className="flex-1">
          <label className="text-[11px] text-gray-400 mb-1 block">Confidence</label>
          <select
            value={confidence}
            onChange={e => setConfidence(e.target.value as 'high' | 'medium' | 'low')}
            className="w-full bg-white/5 border border-[var(--app-border)] rounded px-2 py-1 text-sm text-white"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <button
          onClick={submit}
          disabled={submitting}
          className="px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded text-sm flex items-center gap-1 disabled:opacity-50"
        >
          <Send className="w-3 h-3" />
          {submitting ? '...' : 'Submit'}
        </button>
      </div>
      <div className="mt-2">
        <input
          placeholder="Add a note..."
          value={note}
          onChange={e => setNote(e.target.value)}
          className="w-full bg-white/5 border border-[var(--app-border)] rounded px-2 py-1 text-sm text-white placeholder-gray-500"
        />
      </div>
    </div>
  );
}

// ── Key Result Card ──

function KeyResultItem({ kr, userId, onUpdated }: { kr: KeyResult; userId: string; onUpdated: () => void }) {
  const [showCheckIn, setShowCheckIn] = useState(false);
  const pct = Number(kr.progress) || 0;

  return (
    <div className="py-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300 flex-1">{kr.title}</span>
        <span className="text-xs text-gray-400 mx-2 whitespace-nowrap">
          {kr.current_value} / {kr.target_value} {kr.unit || ''}
        </span>
        <button
          onClick={() => setShowCheckIn(!showCheckIn)}
          className="text-xs text-primary-400 hover:text-primary-300 whitespace-nowrap"
        >
          Check-in
        </button>
      </div>
      <div className="mt-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${progressBarColor(pct)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {showCheckIn && (
        <CheckInForm
          kr={kr}
          userId={userId}
          onDone={() => { setShowCheckIn(false); onUpdated(); }}
        />
      )}
    </div>
  );
}

// ── Goal Card (recursive) ──

function GoalCard({
  goal,
  userId,
  depth = 0,
  onRefresh,
  onSelectGoal,
}: {
  goal: Goal;
  userId: string;
  depth?: number;
  onRefresh: () => void;
  onSelectGoal: (g: Goal) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const status = STATUS_CONFIG[goal.status] || STATUS_CONFIG.on_track;
  const hasChildren = goal.children && goal.children.length > 0;
  const pct = Number(goal.progress) || 0;

  return (
    <div className={depth > 0 ? 'ml-6 mt-2' : 'mt-3'}>
      <div className="bg-[var(--app-card)] rounded-lg border border-[var(--app-border)] p-4 hover:ring-1 hover:ring-primary-500/20 transition-all">
        <div className="flex items-start gap-3">
          {/* Expand/Collapse */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-0.5 text-gray-400 hover:text-white transition"
          >
            {hasChildren ? (
              expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
            ) : (
              <div className="w-4" />
            )}
          </button>

          {/* Status dot */}
          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${status.color}`} />

          {/* Title and meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => onSelectGoal(goal)}
                className="text-sm font-medium text-white hover:text-primary-400 transition text-left"
              >
                {goal.title}
              </button>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${status.bg} ${status.color.replace('bg-', 'text-')}`}>
                {status.label}
              </span>
              <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded-full">
                {LEVEL_LABELS[goal.level]}
              </span>
            </div>

            {goal.owner_name && (
              <p className="text-xs text-gray-500 mt-0.5">{goal.owner_name}</p>
            )}

            {/* Progress bar */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${progressBarColor(pct)}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 w-10 text-right">{pct.toFixed(0)}%</span>
            </div>

            {/* Key Results */}
            {expanded && goal.key_results && goal.key_results.length > 0 && (
              <div className="mt-3 border-t border-[var(--app-border)] pt-2">
                {goal.key_results.map(kr => (
                  <KeyResultItem key={kr.id} kr={kr} userId={userId} onUpdated={onRefresh} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {goal.children!.map(child => (
            <GoalCard
              key={child.id}
              goal={child}
              userId={userId}
              depth={depth + 1}
              onRefresh={onRefresh}
              onSelectGoal={onSelectGoal}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Goal Detail Panel ──

function GoalDetailPanel({ goalId, userId, onClose: _onClose }: { goalId: string; userId: string; onClose: () => void }) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchGoal = useCallback(async () => {
    setLoading(true);
    try {
      const g = await okrAPI.getGoal(goalId, userId);
      setGoal(g);
    } catch (err) {
      console.error('Failed to fetch goal', err);
    } finally {
      setLoading(false);
    }
  }, [goalId, userId]);

  useEffect(() => { fetchGoal(); }, [fetchGoal]);

  if (loading) return <div className="p-6 text-gray-400 animate-pulse">Loading goal...</div>;
  if (!goal) return <div className="p-6 text-gray-400">Goal not found</div>;

  const status = STATUS_CONFIG[goal.status] || STATUS_CONFIG.on_track;
  const pct = Number(goal.progress) || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-3 h-3 rounded-full ${status.color}`} />
            <span className={`text-xs px-2 py-0.5 rounded-full ${status.bg} ${status.color.replace('bg-', 'text-')}`}>
              {status.label}
            </span>
            <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
              {LEVEL_LABELS[goal.level]}
            </span>
          </div>
          <h2 className="text-xl font-semibold text-white">{goal.title}</h2>
          {goal.owner_name && (
            <p className="text-sm text-gray-400 mt-1">Owned by {goal.owner_name}</p>
          )}
        </div>
      </div>

      {goal.description && (
        <p className="text-sm text-gray-300 leading-relaxed">{goal.description}</p>
      )}

      {/* Progress */}
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-400">Progress</span>
          <span className="text-white font-medium">{pct.toFixed(1)}%</span>
        </div>
        <div className="h-3 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progressBarColor(pct)}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      {/* Key Results */}
      {goal.key_results && goal.key_results.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-white mb-3">Key Results</h3>
          <div className="space-y-4">
            {goal.key_results.map(kr => {
              const krPct = Number(kr.progress) || 0;
              return (
                <div key={kr.id} className="bg-[var(--app-bg)] rounded-lg p-4 border border-[var(--app-border)]">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-white">{kr.title}</span>
                    <span className="text-xs text-gray-400">
                      {kr.current_value} / {kr.target_value} {kr.unit || ''}
                    </span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-3">
                    <div
                      className={`h-full rounded-full transition-all ${progressBarColor(krPct)}`}
                      style={{ width: `${Math.min(krPct, 100)}%` }}
                    />
                  </div>

                  {/* Check-ins */}
                  {kr.check_ins && kr.check_ins.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 font-medium">Recent Check-ins</p>
                      {kr.check_ins.slice(0, 5).map(ci => (
                        <div key={ci.id} className="flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-300">{ci.user_name || 'Unknown'}</span>
                            <span className="text-gray-500">→ {ci.value}</span>
                            {ci.confidence && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                ci.confidence === 'high' ? 'bg-emerald-400/10 text-emerald-400'
                                : ci.confidence === 'medium' ? 'bg-amber-400/10 text-amber-400'
                                : 'bg-red-400/10 text-red-400'
                              }`}>{ci.confidence}</span>
                            )}
                          </div>
                          <span className="text-gray-500">
                            {new Date(ci.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <CheckInForm kr={kr} userId={userId} onDone={fetchGoal} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Goal Create Panel ──

function GoalCreatePanel({
  userId,
  periods,
  onCreated,
}: {
  userId: string;
  periods: OKRPeriod[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<'company' | 'department' | 'team' | 'individual'>('team');
  const [periodId, setPeriodId] = useState(periods.find(p => p.is_active)?.id ?? periods[0]?.id ?? '');
  const [departmentId, setDepartmentId] = useState('');
  const [saving, setSaving] = useState(false);

  // KR creation
  const [krTitle, setKrTitle] = useState('');
  const [krTarget, setKrTarget] = useState('');
  const [krUnit, setKrUnit] = useState('');
  const [krs, setKrs] = useState<CreateKeyResultInput[]>([]);

  const addKR = () => {
    if (!krTitle.trim() || !krTarget) return;
    setKrs([...krs, { title: krTitle, target_value: Number(krTarget), unit: krUnit || undefined }]);
    setKrTitle('');
    setKrTarget('');
    setKrUnit('');
  };

  const submit = async () => {
    if (!title.trim() || !periodId) return;
    setSaving(true);
    try {
      const data: CreateGoalInput = {
        period_id: periodId,
        level,
        title,
        description: description || undefined,
        department_id: departmentId || undefined,
      };
      const goal = await okrAPI.createGoal(data, userId);

      for (const kr of krs) {
        await okrAPI.createKeyResult(goal.id, kr, userId);
      }

      onCreated();
    } catch (err) {
      console.error('Failed to create goal', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-semibold text-white">New Goal</h2>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">Period</label>
        <select
          value={periodId}
          onChange={e => setPeriodId(e.target.value)}
          className="w-full bg-white/5 border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm text-white"
        >
          {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">Level</label>
        <select
          value={level}
          onChange={e => setLevel(e.target.value as typeof level)}
          className="w-full bg-white/5 border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm text-white"
        >
          {Object.entries(LEVEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {(level === 'department' || level === 'team') && (
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Department</label>
          <input
            value={departmentId}
            onChange={e => setDepartmentId(e.target.value)}
            placeholder="e.g. Engineering"
            className="w-full bg-white/5 border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
          />
        </div>
      )}

      <div>
        <label className="text-xs text-gray-400 mb-1 block">Title *</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Increase MRR to €100K"
          className="w-full bg-white/5 border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
        />
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="w-full bg-white/5 border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 resize-none"
        />
      </div>

      {/* Key Results builder */}
      <div className="border-t border-[var(--app-border)] pt-4">
        <h3 className="text-sm font-medium text-white mb-3">Key Results</h3>

        {krs.length > 0 && (
          <div className="space-y-2 mb-3">
            {krs.map((kr, i) => (
              <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-300">{kr.title}</span>
                <span className="text-xs text-gray-400">Target: {kr.target_value} {kr.unit || ''}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <input
              value={krTitle}
              onChange={e => setKrTitle(e.target.value)}
              placeholder="KR title"
              className="w-full bg-white/5 border border-[var(--app-border)] rounded px-2 py-1.5 text-sm text-white placeholder-gray-500"
            />
          </div>
          <div className="w-20">
            <input
              type="number"
              value={krTarget}
              onChange={e => setKrTarget(e.target.value)}
              placeholder="Target"
              className="w-full bg-white/5 border border-[var(--app-border)] rounded px-2 py-1.5 text-sm text-white placeholder-gray-500"
            />
          </div>
          <div className="w-16">
            <input
              value={krUnit}
              onChange={e => setKrUnit(e.target.value)}
              placeholder="Unit"
              className="w-full bg-white/5 border border-[var(--app-border)] rounded px-2 py-1.5 text-sm text-white placeholder-gray-500"
            />
          </div>
          <button
            onClick={addKR}
            className="px-2 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded text-sm"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <button
        onClick={submit}
        disabled={saving || !title.trim() || !periodId}
        className="w-full px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition"
      >
        {saving ? 'Creating...' : 'Create Goal'}
      </button>
    </div>
  );
}

// ── Main OKR Page ──

export function OKRPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [periods, setPeriods] = useState<OKRPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [metrics, setMetrics] = useState<OKRMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');

  const fetchPeriods = useCallback(async () => {
    if (!userId) return;
    try {
      const p = await okrAPI.listPeriods(userId);
      setPeriods(p);
      const active = p.find(x => x.is_active);
      if (active) setSelectedPeriod(active.id);
      else if (p.length > 0) setSelectedPeriod(p[0].id);
    } catch (err) {
      console.error('Failed to fetch periods', err);
    }
  }, [userId]);

  const fetchData = useCallback(async () => {
    if (!userId || !selectedPeriod) return;
    setLoading(true);
    try {
      const [tree, m] = await Promise.all([
        okrAPI.getGoalTree(selectedPeriod, userId),
        okrAPI.getMetrics(selectedPeriod, userId),
      ]);
      setGoals(tree);
      setMetrics(m);
    } catch (err) {
      console.error('Failed to fetch OKR data', err);
    } finally {
      setLoading(false);
    }
  }, [userId, selectedPeriod]);

  useEffect(() => { fetchPeriods(); }, [fetchPeriods]);
  useEffect(() => { if (selectedPeriod) fetchData(); }, [selectedPeriod, fetchData]);

  const kpiCards = metrics
    ? [
        {
          title: 'Overall Progress',
          value: `${metrics.avgProgress.toFixed(1)}%`,
          icon: BarChart3,
          color: 'text-primary-400',
        },
        {
          title: 'On Track',
          value: metrics.onTrack.toString(),
          icon: CheckCircle2,
          color: 'text-emerald-400',
        },
        {
          title: 'At Risk',
          value: metrics.atRisk.toString(),
          icon: AlertTriangle,
          color: 'text-amber-400',
        },
        {
          title: 'Behind',
          value: metrics.behind.toString(),
          icon: XCircle,
          color: 'text-red-400',
        },
      ]
    : [];

  return (
    <div className="space-y-6 p-6">
      <DoraInsightBar module="okr" />

      {/* KPI Row */}
      {!loading && metrics && (
        <div className="grid grid-cols-4 gap-4">
          {kpiCards.map(kpi => (
            <KPICard
              key={kpi.title}
              title={kpi.title}
              value={kpi.value}
              icon={kpi.icon}
            />
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Target className="w-5 h-5 text-primary-400" />
          <h2 className="text-lg font-semibold text-white">OKRs & Goals</h2>
          {!loading && goals.length > 0 && (
            <div className="flex rounded-lg border border-[var(--app-border)] overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition ${
                  viewMode === 'list' ? 'bg-primary-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                List View
              </button>
              <button
                onClick={() => setViewMode('tree')}
                className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition ${
                  viewMode === 'tree' ? 'bg-primary-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                <GitBranch className="w-4 h-4" />
                Tree View
              </button>
            </div>
          )}
          {periods.length > 0 && (
            <select
              value={selectedPeriod}
              onChange={e => setSelectedPeriod(e.target.value)}
              className="ml-4 bg-white/5 border border-[var(--app-border)] rounded-lg px-3 py-1.5 text-sm text-white"
              aria-label="Select OKR period"
            >
              {periods.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.is_active ? '(Active)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition"
        >
          <Plus className="w-4 h-4" />
          New Goal
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[var(--app-card)] rounded-lg border border-[var(--app-border)] p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-white/10" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-white/10 rounded w-1/3" />
                  <div className="h-2 bg-white/10 rounded w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Goal Tree */}
      {!loading && goals.length === 0 && (
        <EmptyState
          icon={Target}
          title="No Goals Yet"
          description="Create your first OKR to get started."
          actionLabel="Create Goal"
          onAction={() => setShowCreate(true)}
        />
      )}

      {!loading && goals.length > 0 && viewMode === 'list' && (
        <div>
          {goals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              userId={userId}
              onRefresh={fetchData}
              onSelectGoal={g => setSelectedGoalId(g.id)}
            />
          ))}
        </div>
      )}

      {!loading && goals.length > 0 && viewMode === 'tree' && (
        <OKRGoalTree
          goals={goals}
          periodId={selectedPeriod}
          onGoalClick={(id) => setSelectedGoalId(id)}
        />
      )}

      {/* Goal Detail Panel */}
      <SlideOverPanel
        isOpen={!!selectedGoalId}
        onClose={() => setSelectedGoalId(null)}
        title="Goal Details"
        width={640}
      >
        {selectedGoalId && (
          <GoalDetailPanel
            goalId={selectedGoalId}
            userId={userId}
            onClose={() => setSelectedGoalId(null)}
          />
        )}
      </SlideOverPanel>

      {/* Goal Create Panel */}
      <SlideOverPanel
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Goal"
        width={640}
      >
        <GoalCreatePanel
          userId={userId}
          periods={periods}
          onCreated={() => { setShowCreate(false); fetchData(); }}
        />
      </SlideOverPanel>
    </div>
  );
}

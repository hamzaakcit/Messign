import { useCallback, useEffect, useState } from 'react';
import { Loader2, Zap, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { marketingAPI, type MarketingAutomation } from '@/lib/marketingApi';

const EVENT_OPTIONS = [
  { value: 'project.task.completed', label: 'Task completed' },
  { value: 'project.task.created', label: 'Task created' },
  { value: 'crm.deal.closed', label: 'Deal closed' },
  { value: 'crm.deal.created', label: 'Deal created' },
  { value: 'support.ticket.resolved', label: 'Ticket resolved' },
  { value: 'hr.employee.onboarded', label: 'Employee onboarded' },
  { value: 'okr.goal.completed', label: 'OKR goal completed' },
  { value: 'marketing.content.published', label: 'Content published' },
] as const;

type Props = {
  userId: string;
  onDataChanged?: () => void;
};

export function AutomationsPanel({ userId, onDataChanged }: Props) {
  const [items, setItems] = useState<MarketingAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [eventName, setEventName] = useState<string>(EVENT_OPTIONS[0].value);
  const [prompt, setPrompt] = useState('Draft a LinkedIn post celebrating: {{event.title}}');
  const [channel, setChannel] = useState('linkedin');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await marketingAPI.listAutomations(userId);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load automations');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (row: MarketingAutomation) => {
    setBusyId(row.id);
    try {
      await marketingAPI.updateAutomation(userId, row.id, { enabled: !row.enabled });
      await load();
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toggle failed');
    } finally {
      setBusyId(null);
    }
  };

  const fire = async (id: string) => {
    setBusyId(id);
    try {
      await marketingAPI.triggerAutomation(userId, id);
      await load();
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Trigger failed');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this automation?')) return;
    setBusyId(id);
    try {
      await marketingAPI.deleteAutomation(userId, id);
      await load();
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await marketingAPI.createAutomation(userId, {
        name: name.trim(),
        trigger_type: 'event',
        trigger_config: { event_name: eventName },
        actions: [
          {
            type: 'create_content',
            config: {
              prompt: prompt.trim() || 'Draft social copy from event context.',
              channel,
            },
          },
        ],
        hitl_mode: 'draft_and_wait',
        enabled: true,
      });
      setName('');
      await load();
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>
      )}

      <div className="rounded-lg border border-white/[0.08] bg-[#0c0f14] p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Create automation</div>
        <div className="mt-2 grid gap-2">
          <input
            className="rounded-md border border-white/[0.08] bg-[#080a0e] px-2 py-1.5 text-xs text-slate-200"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="text-[10px] text-slate-500">When (event)</label>
          <select
            className="rounded-md border border-white/[0.08] bg-[#080a0e] px-2 py-1.5 text-xs text-slate-200"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
          >
            {EVENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="text-[10px] text-slate-500">Prompt template</label>
          <textarea
            className="min-h-[72px] rounded-md border border-white/[0.08] bg-[#080a0e] px-2 py-1.5 text-xs text-slate-200"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="flex flex-wrap gap-1">
            {['{{event.title}}', '{{event.taskId}}', '{{event.projectId}}', '{{event.organizationId}}'].map((chip) => (
              <button
                key={chip}
                type="button"
                className="rounded border border-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-app-hover"
                onClick={() => setPrompt((p) => (p ? `${p} ${chip}` : chip))}
              >
                {chip}
              </button>
            ))}
          </div>
          <label className="text-[10px] text-slate-500">Channel</label>
          <select
            className="rounded-md border border-white/[0.08] bg-[#080a0e] px-2 py-1.5 text-xs text-slate-200"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            {['linkedin', 'x', 'instagram', 'email'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={creating || !name.trim()}
            onClick={() => void create()}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-cyan-600/80 px-3 py-2 text-xs font-medium text-app-text hover:bg-cyan-500 disabled:opacity-40"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="text-xs text-slate-500">No automations yet. Create one above or use the API.</p>
        )}
        <ul className="space-y-2">
          {items.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-white/[0.08] bg-[#0c0f14] px-3 py-2 text-xs text-slate-200"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-100">{row.name}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">
                    <span className="rounded bg-app-surface-tertiary px-1 py-0.5 text-slate-400">{row.trigger_type}</span>
                    {row.fire_count > 0 && (
                      <span className="ml-2">
                        Fires: {row.fire_count}
                        {row.last_fired_at && ` · last ${row.last_fired_at.slice(0, 19)}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title={row.enabled ? 'Disable' : 'Enable'}
                    className="rounded p-1 text-slate-400 hover:bg-app-hover"
                    disabled={busyId === row.id}
                    onClick={() => void toggle(row)}
                  >
                    {row.enabled ? <ToggleRight className="h-5 w-5 text-emerald-400/90" /> : <ToggleLeft className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    title="Fire now"
                    className="rounded p-1 text-amber-300/90 hover:bg-app-hover"
                    disabled={busyId === row.id}
                    onClick={() => void fire(row.id)}
                  >
                    <Zap className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    className="rounded p-1 text-red-300/80 hover:bg-app-hover"
                    disabled={busyId === row.id}
                    onClick={() => void remove(row.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {row.last_error && <p className="mt-1 text-[10px] text-red-300/90">Last error: {row.last_error}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

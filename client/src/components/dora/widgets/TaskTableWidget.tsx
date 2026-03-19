import { useState, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle, Clock, AlertTriangle, ArrowUpRight,
  Check, Pencil, Trash2, ChevronDown, Sparkles,
  X,
  Download,
} from 'lucide-react';
import type { TaskRow } from '@/types/knowledge-hub/ai';
import { useTaskActions } from '@/hooks/useTaskActions';
import { InlineDropdown, type DropdownOption } from './InlineDropdown';

// ============================================================
// Props
// ============================================================

interface TaskTableWidgetProps {
  data: TaskRow[] | Record<string, unknown>;
  onSendMessage?: (msg: string) => void;
}

// ============================================================
// Config — status & priority
// ============================================================

type StatusType = 'completed' | 'done' | 'in_progress' | 'in-progress' | 'blocked' | 'overdue' | 'open' | 'todo' | 'pending';

const STATUS_CONFIG: Record<string, { bg: string; color: string; icon: LucideIcon; label: string }> = {
  completed:     { bg: 'rgba(34,197,94,0.1)',  color: '#22c55e', icon: CheckCircle,   label: 'Done' },
  done:          { bg: 'rgba(34,197,94,0.1)',  color: '#22c55e', icon: CheckCircle,   label: 'Done' },
  in_progress:   { bg: 'rgba(56,189,248,0.1)', color: '#38bdf8', icon: ArrowUpRight,  label: 'In Progress' },
  'in-progress': { bg: 'rgba(56,189,248,0.1)', color: '#38bdf8', icon: ArrowUpRight,  label: 'In Progress' },
  blocked:       { bg: 'rgba(239,68,68,0.1)',  color: '#ef4444', icon: AlertTriangle,  label: 'Blocked' },
  overdue:       { bg: 'rgba(239,68,68,0.1)',  color: '#ef4444', icon: Clock,          label: 'Overdue' },
  open:          { bg: 'rgba(139,92,246,0.1)', color: '#8b5cf6', icon: Clock,          label: 'Open' },
  todo:          { bg: 'rgba(139,92,246,0.1)', color: '#8b5cf6', icon: Clock,          label: 'Open' },
  pending:       { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', icon: Clock,          label: 'Pending' },
};

const STATUS_OPTIONS: DropdownOption[] = [
  { value: 'todo',        label: 'Open',        color: '#8b5cf6' },
  { value: 'in_progress', label: 'In Progress', color: '#38bdf8' },
  { value: 'blocked',     label: 'Blocked',     color: '#ef4444' },
  { value: 'done',        label: 'Done',        color: '#22c55e' },
  { value: 'pending',     label: 'Pending',     color: '#f59e0b' },
];

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  high:     { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
  urgent:   { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
  critical: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
  medium:   { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
  normal:   { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
  low:      { bg: 'rgba(34,197,94,0.1)', color: '#22c55e' },
};

const PRIORITY_OPTIONS: DropdownOption[] = [
  { value: 'critical', label: 'Critical', color: '#ef4444' },
  { value: 'high',     label: 'High',     color: '#ef4444' },
  { value: 'medium',   label: 'Medium',   color: '#f59e0b' },
  { value: 'low',      label: 'Low',      color: '#22c55e' },
];

// ============================================================
// Badges (now clickable via InlineDropdown)
// ============================================================

function StatusBadge({ status, taskId, onStatusChange }: { status: string; taskId?: string; onStatusChange?: (id: string, s: string) => void }) {
  const key = (status ?? '').toLowerCase() as StatusType;
  const config = STATUS_CONFIG[key] || { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', icon: Clock, label: status || 'Unknown' };
  const Icon = config.icon;

  const badge = (selected: DropdownOption | undefined, isOpen: boolean) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10.5,
        fontWeight: 500,
        color: config.color,
        background: config.bg,
        padding: '2px 7px',
        borderRadius: 5,
        transition: 'box-shadow 150ms',
        boxShadow: isOpen ? `0 0 0 1px ${config.color}40` : 'none',
      }}
    >
      <Icon size={10} /> {selected?.label ?? config.label}
      <ChevronDown size={8} style={{ opacity: 0.5 }} />
    </span>
  );

  if (!taskId || !onStatusChange) {
    const fallbackConfig = STATUS_CONFIG[key] || { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', icon: Clock, label: status || 'Unknown' };
    const FallbackIcon = fallbackConfig.icon;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 500, color: fallbackConfig.color, background: fallbackConfig.bg, padding: '2px 7px', borderRadius: 5 }}>
        <FallbackIcon size={10} /> {fallbackConfig.label}
      </span>
    );
  }

  return (
    <InlineDropdown
      options={STATUS_OPTIONS}
      value={status.toLowerCase()}
      onChange={(v) => onStatusChange(taskId, v)}
    >
      {badge}
    </InlineDropdown>
  );
}

function PriorityBadge({ priority, taskId, onPriorityChange }: { priority: string; taskId?: string; onPriorityChange?: (id: string, p: string) => void }) {
  const key = priority.toLowerCase();
  const config = PRIORITY_COLORS[key] || { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8' };

  const badge = (_selected: DropdownOption | undefined, isOpen: boolean) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10.5,
        fontWeight: 500,
        color: config.color,
        background: config.bg,
        padding: '2px 7px',
        borderRadius: 5,
        transition: 'box-shadow 150ms',
        boxShadow: isOpen ? `0 0 0 1px ${config.color}40` : 'none',
      }}
    >
      {priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase()}
      <ChevronDown size={8} style={{ opacity: 0.5 }} />
    </span>
  );

  if (!taskId || !onPriorityChange) {
    return (
      <span style={{ fontSize: 10.5, fontWeight: 500, color: config.color, background: config.bg, padding: '2px 7px', borderRadius: 5 }}>
        {priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase()}
      </span>
    );
  }

  return (
    <InlineDropdown
      options={PRIORITY_OPTIONS}
      value={priority.toLowerCase()}
      onChange={(v) => onPriorityChange(taskId, v)}
    >
      {badge}
    </InlineDropdown>
  );
}

// ============================================================
// Date helpers
// ============================================================

function formatDueDate(dateStr: string | null | undefined): { display: string; overdue: boolean } {
  if (!dateStr) return { display: '—', overdue: false };
  try {
    const date = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const overdue = date < now;
    const display = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return { display, overdue };
  } catch {
    return { display: dateStr, overdue: false };
  }
}

// ============================================================
// Normalizer
// ============================================================

function escapeCsvCell(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function exportTasksCsv(tasks: TaskRow[]): void {
  const cols = [
    { key: 'title' as const, get: (t: TaskRow) => String(t.task_name ?? t.title ?? '') },
    { key: 'project' as const, get: (t: TaskRow) => String(t.project_name ?? '') },
    { key: 'status' as const, get: (t: TaskRow) => String(t.status ?? '') },
    { key: 'priority' as const, get: (t: TaskRow) => String(t.priority ?? '') },
    { key: 'due_date' as const, get: (t: TaskRow) => String(t.due_date ?? '') },
  ];
  const header = cols.map((c) => c.key).join(',');
  const lines = tasks.map((t) => cols.map((c) => escapeCsvCell(c.get(t))).join(','));
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dora-tasks-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeTasks(data: TaskRow[] | Record<string, unknown>): TaskRow[] {
  if (Array.isArray(data)) return data as TaskRow[];
  if (data && typeof data === 'object') {
    const values = Object.values(data);
    for (const v of values) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') return v as TaskRow[];
    }
  }
  return [];
}

// ============================================================
// Drill-Down Drawer (accordion row)
// ============================================================

function DrillDownDrawer({
  task,
  onSave,
  onCancel,
}: {
  task: TaskRow;
  onSave: (updates: Partial<TaskRow>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.task_name ?? task.title ?? '');
  const [description, setDescription] = useState(task.description ?? '');
  const [dueDate, setDueDate] = useState(task.due_date ?? '');

  return (
    <tr>
      <td colSpan={6} style={{ padding: 0, borderBottom: '1px solid rgba(148,163,184,0.03)' }}>
        <div
          className="dora-glass"
          style={{
            margin: '0 8px 8px',
            padding: '14px 16px',
            borderRadius: 12,
            border: '1px solid rgba(56,189,248,0.1)',
            animation: 'dora-drawer-open 200ms ease-out forwards',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }}>Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(15,23,42,0.6)',
                  border: '1px solid rgba(148,163,184,0.1)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  color: '#e2e8f0',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  background: 'rgba(15,23,42,0.6)',
                  border: '1px solid rgba(148,163,184,0.1)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  color: '#e2e8f0',
                  fontSize: 12,
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }}>Due Date</label>
                <input
                  type="date"
                  value={dueDate ? dueDate.split('T')[0] : ''}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{
                    background: 'rgba(15,23,42,0.6)',
                    border: '1px solid rgba(148,163,184,0.1)',
                    borderRadius: 8,
                    padding: '6px 10px',
                    color: '#e2e8f0',
                    fontSize: 12,
                    outline: 'none',
                    colorScheme: 'dark',
                  }}
                />
              </div>

              {task.assignees && task.assignees.length > 0 && (
                <div>
                  <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }}>Assignees</label>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {task.assignees.map((a, i) => (
                      <span key={i} style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(148,163,184,0.08)', padding: '2px 8px', borderRadius: 10 }}>{a}</span>
                    ))}
                  </div>
                </div>
              )}

              {task.tags && task.tags.length > 0 && (
                <div>
                  <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }}>Tags</label>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {task.tags.map((t, i) => (
                      <span key={i} style={{ fontSize: 10, color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', padding: '2px 8px', borderRadius: 10 }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button
              onClick={onCancel}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '5px 14px', borderRadius: 8,
                background: 'rgba(148,163,184,0.08)',
                border: '1px solid rgba(148,163,184,0.12)',
                color: '#94a3b8', fontSize: 11, cursor: 'pointer',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(148,163,184,0.14)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(148,163,184,0.08)'; }}
            >
              <X size={11} /> Cancel
            </button>
            <button
              onClick={() => {
                const updates: Partial<TaskRow> = {};
                if (title !== (task.task_name ?? task.title ?? '')) updates.title = title;
                if (description !== (task.description ?? '')) updates.description = description;
                if (dueDate !== (task.due_date ?? '')) updates.due_date = dueDate;
                onSave(updates);
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '5px 14px', borderRadius: 8,
                background: 'rgba(56,189,248,0.12)',
                border: '1px solid rgba(56,189,248,0.25)',
                color: '#38bdf8', fontSize: 11, cursor: 'pointer',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(56,189,248,0.2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(56,189,248,0.12)'; }}
            >
              <Check size={11} /> Save
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ============================================================
// Remediation Chips
// ============================================================

function RemediationChips({ tasks, onSendMessage }: { tasks: TaskRow[]; onSendMessage?: (msg: string) => void }) {
  const chips = useMemo(() => {
    const result: { text: string; variant: 'warn' | 'info' | 'action' }[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (const t of tasks) {
      if (t.due_date) {
        try {
          const d = new Date(t.due_date);
          if (d < now && t.status !== 'done' && t.status !== 'completed') {
            const name = t.task_name ?? t.title ?? 'this task';
            result.push({ text: `Extend deadline for "${name}"`, variant: 'warn' });
            result.push({ text: `Ping assignee about "${name}"`, variant: 'action' });
          }
        } catch { /* ignore */ }
      }
      if (t.status === 'blocked') {
        const name = t.task_name ?? t.title ?? 'this task';
        result.push({ text: `What's blocking "${name}"?`, variant: 'warn' });
      }
    }

    const highPri = tasks.filter((t) => ['high', 'urgent', 'critical'].includes((t.priority ?? '').toLowerCase()));
    if (highPri.length >= 3) {
      result.push({ text: 'Show me a priority breakdown', variant: 'info' });
    }

    return result.slice(0, 4);
  }, [tasks]);

  if (chips.length === 0 || !onSendMessage) return null;

  const variantStyles: Record<string, { bg: string; border: string; color: string }> = {
    warn:   { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.18)', color: '#f59e0b' },
    info:   { bg: 'rgba(56,189,248,0.06)', border: 'rgba(56,189,248,0.18)', color: '#38bdf8' },
    action: { bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.18)', color: '#8b5cf6' },
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 16px 4px' }}>
      {chips.map((chip, i) => {
        const s = variantStyles[chip.variant];
        return (
          <button
            key={i}
            onClick={() => onSendMessage(chip.text)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 12px',
              borderRadius: 20,
              background: s.bg,
              border: `1px solid ${s.border}`,
              color: s.color,
              fontSize: 11,
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = s.bg.replace('0.06', '0.12'); }}
            onMouseLeave={(e) => { e.currentTarget.style.background = s.bg; }}
          >
            <Sparkles size={10} />
            {chip.text}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// Hover Action Bar (inline in row)
// ============================================================

function HoverActionBar({
  visible,
  onComplete,
  onEdit,
  onDelete,
  confirmDelete,
}: {
  visible: boolean;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  confirmDelete: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        opacity: visible ? 1 : 0,
        transition: 'opacity 150ms',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onComplete(); }}
        title="Mark complete"
        style={{
          padding: 4, borderRadius: 6, border: 'none',
          background: 'rgba(34,197,94,0.08)', color: '#22c55e',
          cursor: 'pointer', transition: 'background 150ms', display: 'flex',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,197,94,0.18)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(34,197,94,0.08)'; }}
      >
        <Check size={12} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        title="Edit task"
        style={{
          padding: 4, borderRadius: 6, border: 'none',
          background: 'rgba(56,189,248,0.08)', color: '#38bdf8',
          cursor: 'pointer', transition: 'background 150ms', display: 'flex',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(56,189,248,0.18)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(56,189,248,0.08)'; }}
      >
        <Pencil size={12} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title={confirmDelete ? 'Click again to confirm' : 'Delete task'}
        style={{
          padding: 4, borderRadius: 6, border: 'none',
          background: confirmDelete ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.08)',
          color: '#ef4444',
          cursor: 'pointer', transition: 'all 150ms', display: 'flex',
          animation: confirmDelete ? 'dora-pulse-red 600ms ease-in-out' : 'none',
        }}
        onMouseEnter={(e) => { if (!confirmDelete) e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; }}
        onMouseLeave={(e) => { if (!confirmDelete) e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
      >
        {confirmDelete ? <span style={{ fontSize: 9, fontWeight: 600, lineHeight: '12px' }}>Sure?</span> : <Trash2 size={12} />}
      </button>
    </div>
  );
}

// ============================================================
// Main Widget
// ============================================================

export function TaskTableWidget({ data, onSendMessage }: TaskTableWidgetProps) {
  const normalized = normalizeTasks(data);
  const { tasks, updateStatus, updatePriority, markComplete, deleteTask, updateTaskField } = useTaskActions(normalized);

  const [hoveredRow, setHoveredRow] = useState<string | number | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (tasks.length === 0) {
    return (
      <div
        className="rounded-lg border border-white/10 bg-white/5 p-6 text-center space-y-3"
        style={{ marginTop: 12 }}
      >
        <p className="text-white/50 text-sm">No tasks found matching your criteria.</p>
        <p className="text-white/35 text-xs">Try a different status filter or ask about a specific project.</p>
        {onSendMessage && (
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onSendMessage('What are my open tasks?')}
              className="text-xs px-3 py-1.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/25 hover:bg-sky-500/25"
            >
              Show my open tasks
            </button>
            <button
              type="button"
              onClick={() => onSendMessage('Give me an overview of all active projects')}
              className="text-xs px-3 py-1.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/25 hover:bg-violet-500/25"
            >
              Active projects overview
            </button>
          </div>
        )}
      </div>
    );
  }

  const handleDelete = (taskId: string) => {
    if (confirmDeleteId === taskId) {
      deleteTask(taskId);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(taskId);
      setTimeout(() => setConfirmDeleteId((prev) => (prev === taskId ? null : prev)), 3000);
    }
  };

  const handleDrawerSave = (task: TaskRow, updates: Partial<TaskRow>) => {
    if (!task.id) return;
    if (updates.title) updateTaskField(task.id, 'title', updates.title);
    if (updates.description) updateTaskField(task.id, 'description', updates.description);
    if (updates.due_date !== undefined) updateTaskField(task.id, 'dueDate', updates.due_date ?? '');
    setExpandedRow(null);
  };

  return (
    <div
      className="dora-fade-up dora-glass dora-glow-border"
      style={{
        borderRadius: 'var(--dora-r-widget, 16px)',
        overflow: 'hidden',
        marginTop: 12,
      }}
    >
      <div style={{ height: 3, background: 'linear-gradient(90deg, #38bdf8, #8b5cf6)', opacity: 0.5 }} />

      <div style={{ padding: '14px 16px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
          <h3
            className="dora-font"
            style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', margin: 0 }}
          >
            Tasks ({tasks.length})
          </h3>
          <button
            type="button"
            onClick={() => exportTasksCsv(tasks)}
            title="Download CSV"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 8,
              border: '1px solid rgba(148,163,184,0.2)',
              background: 'rgba(56,189,248,0.08)',
              color: '#38bdf8',
              cursor: 'pointer',
            }}
          >
            <Download size={12} />
            CSV
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Task', 'Project', 'Status', 'Priority', 'Due Date', ''].map((col) => (
                  <th
                    key={col || 'actions'}
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      color: '#64748b',
                      textAlign: 'left',
                      padding: '6px 8px',
                      borderBottom: '1px solid rgba(148,163,184,0.06)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      ...(col === '' ? { width: 80 } : {}),
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, i) => {
                const rowKey = task.id ?? i;
                const name = task.task_name ?? task.title ?? '—';
                const { display: dueDateDisplay, overdue } = formatDueDate(task.due_date);
                const isHovered = hoveredRow === rowKey;
                const isExpanded = expandedRow === rowKey;

                return (
                  <>
                    <tr
                      key={rowKey}
                      style={{
                        transition: 'background 150ms',
                        background: isHovered ? 'rgba(56,189,248,0.06)' : 'transparent',
                      }}
                      onMouseEnter={() => setHoveredRow(rowKey)}
                      onMouseLeave={() => { setHoveredRow(null); if (confirmDeleteId === task.id) setConfirmDeleteId(null); }}
                    >
                      <td
                        className="dora-font"
                        style={{
                          fontSize: 12,
                          color: '#e2e8f0',
                          padding: '8px 8px',
                          borderBottom: '1px solid rgba(148,163,184,0.03)',
                          maxWidth: 200,
                          cursor: task.id ? 'pointer' : 'default',
                        }}
                        onClick={() => task.id && setExpandedRow(isExpanded ? null : rowKey)}
                      >
                        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {name}
                        </span>
                      </td>
                      <td
                        className="dora-font"
                        style={{ fontSize: 11, color: '#94a3b8', padding: '8px 8px', borderBottom: '1px solid rgba(148,163,184,0.03)', whiteSpace: 'nowrap' }}
                      >
                        {task.project_name ?? '—'}
                      </td>
                      <td style={{ padding: '8px 8px', borderBottom: '1px solid rgba(148,163,184,0.03)' }}>
                        {task.status
                          ? <StatusBadge status={task.status} taskId={task.id} onStatusChange={updateStatus} />
                          : <span style={{ color: '#475569', fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 8px', borderBottom: '1px solid rgba(148,163,184,0.03)' }}>
                        {task.priority
                          ? <PriorityBadge priority={task.priority} taskId={task.id} onPriorityChange={updatePriority} />
                          : <span style={{ color: '#475569', fontSize: 11 }}>—</span>}
                      </td>
                      <td
                        className="dora-mono"
                        style={{
                          fontSize: 11,
                          padding: '8px 8px',
                          borderBottom: '1px solid rgba(148,163,184,0.03)',
                          whiteSpace: 'nowrap',
                          color: overdue ? 'var(--dora-danger, #ef4444)' : 'var(--dora-text-3, #64748b)',
                        }}
                      >
                        {overdue && <AlertTriangle size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />}
                        {dueDateDisplay}
                      </td>
                      <td style={{ padding: '8px 4px', borderBottom: '1px solid rgba(148,163,184,0.03)', width: 80 }}>
                        {task.id && (
                          <HoverActionBar
                            visible={isHovered}
                            onComplete={() => markComplete(task.id!)}
                            onEdit={() => setExpandedRow(isExpanded ? null : rowKey)}
                            onDelete={() => handleDelete(task.id!)}
                            confirmDelete={confirmDeleteId === task.id}
                          />
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <DrillDownDrawer
                        key={`drawer-${rowKey}`}
                        task={task}
                        onSave={(updates) => handleDrawerSave(task, updates)}
                        onCancel={() => setExpandedRow(null)}
                      />
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <RemediationChips tasks={tasks} onSendMessage={onSendMessage} />
    </div>
  );
}

import type { LucideIcon } from 'lucide-react';
import { Users, FolderKanban, CheckSquare, BookOpen, Activity, AlertTriangle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { SystemOverviewData } from '@/types/knowledge-hub/ai';

interface SystemOverviewWidgetProps {
  data: SystemOverviewData;
}

const TASK_STATUS_COLORS: Record<string, string> = {
  Completed: '#22c55e',
  'In Progress': '#38bdf8',
  Open: '#8b5cf6',
  Blocked: '#ef4444',
  Overdue: '#f59e0b',
};

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  accentColor?: string;
  delay: number;
}

function MetricCard({ icon: Icon, label, value, sub, accentColor = '#38bdf8', delay }: MetricCardProps) {
  return (
    <div
      className="dora-fade-up dora-glass-light dora-glow-border"
      style={{
        borderRadius: 'var(--dora-r-card, 14px)',
        padding: '14px 16px',
        animationDelay: `${delay}s`,
        opacity: 0,
        minWidth: 0,
        flex: 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `${accentColor}12`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={14} color={accentColor} />
        </div>
      </div>
      <p
        className="dora-mono"
        style={{ fontSize: 22, fontWeight: 700, color: 'var(--dora-text-1, #f1f5f9)', letterSpacing: '-0.03em', margin: 0, lineHeight: 1 }}
      >
        {value}
      </p>
      <p style={{ fontSize: 11, color: 'var(--dora-text-3, #64748b)', margin: '4px 0 0', letterSpacing: '0.02em' }}>
        {label}
      </p>
      {sub && (
        <p style={{ fontSize: 10, color: 'var(--dora-text-4, #475569)', margin: '2px 0 0' }}>
          {sub}
        </p>
      )}
    </div>
  );
}

export function SystemOverviewWidget({ data }: SystemOverviewWidgetProps) {
  const { users, tasks, projects, documents, activities } = data;

  const totalTasks = tasks?.total ?? 0;
  const completed = tasks?.completed ?? 0;
  const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;
  const progressColor = completionRate >= 70 ? '#22c55e' : '#38bdf8';

  const taskPieData = [
    { name: 'Completed', value: tasks?.completed ?? 0 },
    { name: 'In Progress', value: tasks?.in_progress ?? 0 },
    { name: 'Open', value: tasks?.open ?? 0 },
    { name: 'Blocked', value: tasks?.blocked ?? 0 },
    { name: 'Overdue', value: tasks?.overdue ?? 0 },
  ].filter((d) => d.value > 0);

  return (
    <div className="dora-fade-up" style={{ marginTop: 12 }}>
      {/* Metric cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 10 }}>
        <MetricCard
          icon={Users}
          label="Active Users"
          value={users?.active ?? 0}
          sub={`${users?.total ?? 0} total`}
          accentColor="#38bdf8"
          delay={0}
        />
        <MetricCard
          icon={FolderKanban}
          label="Active Projects"
          value={projects?.active ?? 0}
          sub={`${projects?.total ?? 0} total`}
          accentColor="#8b5cf6"
          delay={0.06}
        />
        <MetricCard
          icon={CheckSquare}
          label="Task Completion"
          value={`${completionRate}%`}
          sub={`${completed} / ${totalTasks} tasks`}
          accentColor={progressColor}
          delay={0.12}
        />
        <MetricCard
          icon={BookOpen}
          label="KB Documents"
          value={documents?.published ?? 0}
          sub={`${documents?.total ?? 0} total`}
          accentColor="#22c55e"
          delay={0.18}
        />
      </div>

      {/* Task breakdown: progress + pie chart */}
      <div
        className="dora-fade-up dora-glass dora-glow-border"
        style={{
          borderRadius: 'var(--dora-r-widget, 16px)',
          overflow: 'hidden',
          animationDelay: '0.24s',
          opacity: 0,
          display: 'flex',
          gap: 12,
        }}
      >
        {/* Gradient accent bar */}
        <div style={{ width: 3, background: 'linear-gradient(180deg, #38bdf8, #8b5cf6, #ec4899)', opacity: 0.6, flexShrink: 0 }} />

        <div style={{ flex: 1, padding: '14px 16px 14px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--dora-text-2, #94a3b8)', fontWeight: 500 }}>
              Task Completion Rate
            </span>
            <span className="dora-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--dora-text-1, #e2e8f0)' }}>
              {completionRate}%
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(148,163,184,0.08)', overflow: 'hidden', marginBottom: 10 }}>
            <div
              style={{
                height: '100%',
                borderRadius: 3,
                background: `linear-gradient(90deg, ${progressColor}, ${progressColor}aa)`,
                width: `${Math.min(completionRate, 100)}%`,
                boxShadow: `0 0 8px ${progressColor}40`,
                transition: 'width 1s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          </div>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--dora-text-3, #64748b)' }}>
              <Activity size={11} color="var(--dora-primary, #38bdf8)" />
              {tasks?.in_progress ?? 0} in progress
            </span>
            {(tasks?.overdue ?? 0) > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--dora-warning, #f59e0b)' }}>
                <AlertTriangle size={11} />
                {tasks.overdue} overdue
              </span>
            )}
            <span style={{ color: 'var(--dora-text-4, #475569)' }}>
              {activities?.this_week ?? 0} actions this week
            </span>
          </div>
        </div>

        {/* Pie chart */}
        {taskPieData.length > 0 && (
          <div style={{ width: 100, flexShrink: 0, padding: '8px 12px 8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: 9, color: 'var(--dora-text-4, #475569)', fontWeight: 500, marginBottom: 2, textAlign: 'center' }}>Status</p>
            <ResponsiveContainer width="100%" height={80}>
              <PieChart>
                <Pie
                  data={taskPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={18}
                  outerRadius={32}
                  paddingAngle={2}
                >
                  {taskPieData.map((entry, i) => (
                    <Cell key={i} fill={TASK_STATUS_COLORS[entry.name] ?? '#6b7280'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15,23,42,0.9)',
                    border: '1px solid rgba(148,163,184,0.1)',
                    borderRadius: 8,
                    fontSize: 11,
                    color: '#e2e8f0',
                    padding: '6px 10px',
                    backdropFilter: 'blur(12px)',
                  }}
                  formatter={(value: number, name: string) => [value, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

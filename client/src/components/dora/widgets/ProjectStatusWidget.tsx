import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle, Clock, AlertTriangle, TrendingUp, Zap, Edit3 } from 'lucide-react';

export interface ProjectData {
  name: string;
  lead: string;
  dueDate: string;
  status: 'active' | 'on_track' | 'at_risk' | 'overdue';
  completion: number;
  tasks: {
    total: number;
    done: number;
    inProgress: number;
    blocked: number;
  };
  team: string[];
}

interface ProjectStatusWidgetProps {
  project: ProjectData;
  onApprove?: () => void;
  onEdit?: () => void;
  delay?: number;
}

const ProgressBar: React.FC<{ value: number; max?: number; color?: string }> = ({
  value,
  max = 100,
  color = '#38bdf8',
}) => (
  <div style={{ height: 6, borderRadius: 3, background: 'rgba(148,163,184,0.08)', overflow: 'hidden' }}>
    <div
      style={{
        height: '100%',
        borderRadius: 3,
        background: `linear-gradient(90deg, ${color}, ${color}aa)`,
        width: `${Math.min((value / max) * 100, 100)}%`,
        boxShadow: `0 0 8px ${color}40`,
        transition: 'width 1s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    />
  </div>
);

const StatusBadge: React.FC<{ status: ProjectData['status'] }> = ({ status }) => {
  const configs: Record<string, { bg: string; color: string; icon: LucideIcon; text: string }> = {
    active: { bg: 'rgba(34,197,94,0.1)', color: '#22c55e', icon: CheckCircle, text: 'Active' },
    on_track: { bg: 'rgba(56,189,248,0.1)', color: '#38bdf8', icon: TrendingUp, text: 'On Track' },
    at_risk: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', icon: AlertTriangle, text: 'At Risk' },
    overdue: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444', icon: Clock, text: 'Overdue' },
  };
  const c = configs[status] || configs.active;
  const Icon = c.icon;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10.5,
        fontWeight: 500,
        color: c.color,
        background: c.bg,
        padding: '3px 8px',
        borderRadius: 6,
      }}
    >
      <Icon size={11} /> {c.text}
    </span>
  );
};

const TeamAvatars: React.FC<{ members: string[] }> = ({ members }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div style={{ display: 'flex' }}>
      {members.slice(0, 5).map((member, i) => (
        <div
          key={i}
          title={member}
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: `hsl(${(i * 67 + 200) % 360}, 60%, 35%)`,
            border: '2px solid var(--dora-bg-surface, #0f172a)',
            marginLeft: i > 0 ? -6 : 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 600,
            color: '#e2e8f0',
            zIndex: members.length - i,
          }}
        >
          {member.split(' ').map((n) => n[0]).join('')}
        </div>
      ))}
    </div>
    <span style={{ fontSize: 10.5, color: 'var(--dora-text-3, #64748b)' }}>
      {members.length} member{members.length !== 1 ? 's' : ''}
    </span>
  </div>
);

const ProjectStatusWidget: React.FC<ProjectStatusWidgetProps> = ({
  project,
  onApprove,
  onEdit,
  delay = 0,
}) => {
  const [approved, setApproved] = useState(false);
  const progressColor = project.completion > 70 ? '#22c55e' : '#38bdf8';

  const taskStats = [
    { label: 'Total', value: project.tasks.total, color: 'var(--dora-text-2, #94a3b8)' },
    { label: 'Done', value: project.tasks.done, color: 'var(--dora-success, #22c55e)' },
    { label: 'In Progress', value: project.tasks.inProgress, color: 'var(--dora-primary, #38bdf8)' },
    { label: 'Blocked', value: project.tasks.blocked, color: 'var(--dora-danger, #ef4444)' },
  ];

  return (
    <div
      className="dora-fade-up dora-glass dora-glow-border"
      style={{
        borderRadius: 'var(--dora-r-widget, 16px)',
        overflow: 'hidden',
        animationDelay: `${delay}s`,
        opacity: delay > 0 ? 0 : undefined,
        marginTop: 12,
      }}
    >
      <div style={{ height: 3, background: 'linear-gradient(90deg, #38bdf8, #8b5cf6, #ec4899)', opacity: 0.7 }} />

      <div style={{ padding: '16px 18px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h3
              className="dora-font"
              style={{ fontSize: 14, fontWeight: 600, color: 'var(--dora-text-1, #f1f5f9)', margin: 0, letterSpacing: '-0.01em' }}
            >
              {project.name}
            </h3>
            <p style={{ fontSize: 11, color: 'var(--dora-text-3, #64748b)', margin: '3px 0 0' }}>
              Lead: {project.lead} &middot; Due: {project.dueDate}
            </p>
          </div>
          <StatusBadge status={project.status} />
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 10.5, color: 'var(--dora-text-2, #94a3b8)' }}>Completion</span>
            <span className="dora-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--dora-text-1, #e2e8f0)' }}>
              {project.completion}%
            </span>
          </div>
          <ProgressBar value={project.completion} color={progressColor} />
        </div>

        {/* Task stats grid */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {taskStats.map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 8, background: 'rgba(148,163,184,0.04)' }}>
              <p className="dora-mono" style={{ fontSize: 16, fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
              <p style={{ fontSize: 9.5, color: 'var(--dora-text-3, #64748b)', margin: '2px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Team avatars */}
        {project.team && project.team.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <TeamAvatars members={project.team} />
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setApproved(true); onApprove?.(); }}
            disabled={approved}
            style={{
              flex: 1,
              padding: '9px 12px',
              borderRadius: 'var(--dora-r-btn, 10px)',
              border: 'none',
              background: approved ? 'rgba(34,197,94,0.15)' : 'linear-gradient(135deg, #38bdf8, #6366f1)',
              color: approved ? '#22c55e' : '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: approved ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              transition: 'all 0.2s',
              boxShadow: approved ? 'none' : '0 2px 12px rgba(56,189,248,0.2)',
            }}
          >
            {approved ? (<><CheckCircle size={13} /> Approved</>) : (<><Zap size={13} /> Approve</>)}
          </button>
          <button
            onClick={onEdit}
            style={{
              flex: 1,
              padding: '9px 12px',
              borderRadius: 'var(--dora-r-btn, 10px)',
              border: '1px solid rgba(148,163,184,0.1)',
              background: 'rgba(148,163,184,0.04)',
              color: 'var(--dora-text-2, #94a3b8)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              transition: 'all 0.15s',
            }}
          >
            <Edit3 size={12} /> Edit Details
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectStatusWidget;

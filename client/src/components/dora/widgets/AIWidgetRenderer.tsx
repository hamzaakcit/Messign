import { Component, type ReactNode } from 'react';
import type { AIWidgetPayload, SystemOverviewData, TaskRow } from '@/types/knowledge-hub/ai';
import { SystemOverviewWidget } from './SystemOverviewWidget';
import { TaskTableWidget } from './TaskTableWidget';
import ProjectStatusWidget, { type ProjectData } from './ProjectStatusWidget';
import RevenueChartWidget from './RevenueChartWidget';
import { DoraDashWidget } from './DoraDashWidget';

// ============================================================
// Error boundary — graceful degradation per widget
// ============================================================

interface ErrorBoundaryProps {
  fallbackTitle: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class WidgetErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="dora-glass"
          style={{
            marginTop: 12,
            padding: '14px 16px',
            borderRadius: 'var(--dora-r-widget, 16px)',
            fontSize: 12,
            color: 'var(--dora-text-3, #64748b)',
            fontStyle: 'italic',
          }}
        >
          Could not render widget for &ldquo;{this.props.fallbackTitle}&rdquo; &mdash; raw data is in the text above.
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================
// Dispatcher
// ============================================================

interface AIWidgetRendererProps {
  widget: AIWidgetPayload;
  index?: number;
  onSendMessage?: (msg: string) => void;
}

export function AIWidgetRenderer({ widget, index = 0, onSendMessage }: AIWidgetRendererProps) {
  const { widgetType, data, title } = widget;
  const staggerDelay = 0.1 + index * 0.12;

  let inner: ReactNode = null;

  switch (widgetType) {
    case 'system_overview':
      inner = <SystemOverviewWidget data={data as SystemOverviewData} />;
      break;

    case 'task_table':
      inner = <TaskTableWidget data={data as TaskRow[] | Record<string, unknown>} onSendMessage={onSendMessage} />;
      break;

    case 'project_status': {
      const projectData = data as Record<string, unknown>;
      const shaped: ProjectData = {
        name: (projectData.name as string) || 'Unknown Project',
        lead: (projectData.lead as string) || (projectData.projectManager as string) || 'Unassigned',
        dueDate: (projectData.dueDate as string) || (projectData.deadline as string) || 'TBD',
        status: (projectData.status as ProjectData['status']) || 'active',
        completion: (projectData.completion as number) || (projectData.progress as number) || 0,
        tasks: {
          total: (projectData.totalTasks as number) || 0,
          done: (projectData.completedTasks as number) || 0,
          inProgress: (projectData.inProgressTasks as number) || 0,
          blocked: (projectData.blockedTasks as number) || 0,
        },
        team: (projectData.team as string[]) || (projectData.members as string[]) || [],
      };
      inner = <ProjectStatusWidget project={shaped} delay={staggerDelay} />;
      break;
    }

    case 'revenue_chart': {
      const chartData = data as Record<string, unknown>;
      inner = (
        <RevenueChartWidget
          data={(chartData.data as Array<{ month: string; revenue: number }>) || []}
          title={(chartData.title as string) || title}
          subtitle={(chartData.subtitle as string) || undefined}
          accent={(chartData.accent as string) || 'green-cyan'}
          delay={staggerDelay}
        />
      );
      break;
    }

    case 'data_table':
      inner = <TaskTableWidget data={data as TaskRow[] | Record<string, unknown>} />;
      break;

    case 'dora_dash':
      inner = <DoraDashWidget />;
      break;

    default:
      return null;
  }

  return (
    <WidgetErrorBoundary fallbackTitle={title}>
      {inner}
    </WidgetErrorBoundary>
  );
}

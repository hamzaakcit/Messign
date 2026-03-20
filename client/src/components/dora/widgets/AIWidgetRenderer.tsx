import { Component, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AIWidgetPayload, AIWidgetType } from '@/types/knowledge-hub/ai';
import type { BlockHostAction, DoraBlockHost } from '@/types/dora/dynamic-blocks';
import { exportWidget, WIDGET_ACTIONS } from '@/shared/intents/widget-actions';
import { renderRegisteredBlock } from './blockRegistry';

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
            color: 'var(--dora-chat-text-tertiary, var(--dora-text-3, #94a3b8))',
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
// Merged toolbar (server actions + client registry)
// ============================================================

function mergeToolbarActions(
  widget: AIWidgetPayload,
  widgetType: AIWidgetType,
): Array<{ id: string; label: string; action: BlockHostAction }> {
  const fromPayload = (widget.actions ?? []).map((a) => {
    if (a.kind === 'navigate') {
      return {
        id: a.id,
        label: a.label,
        action: { kind: 'navigate' as const, to: a.to, state: a.state },
      };
    }
    return {
      id: a.id,
      label: a.label,
      action: { kind: 'send_message' as const, text: a.text, intentId: a.intentId },
    };
  });

  const serverFilledToolbar =
    (widgetType === 'invoice_preview' || widgetType === 'leaderboard_list') &&
    (widget.actions?.length ?? 0) > 0;

  const fromClient: Array<{ id: string; label: string; action: BlockHostAction }> = [];
  if (!serverFilledToolbar) {
    (WIDGET_ACTIONS[widgetType] ?? []).forEach((d, i) => {
      if (d.exportPdf) {
        fromClient.push({
          id: `client-export-${i}`,
          label: d.label,
          action: { kind: 'export_widget', widgetType, format: 'pdf' },
        });
        return;
      }
      if (d.message) {
        fromClient.push({
          id: `client-msg-${i}-${d.label}`,
          label: d.label,
          action: { kind: 'send_message', text: d.message, intentId: d.intentId },
        });
      }
    });
  }

  return [...fromPayload, ...fromClient];
}

function BlockToolbar({
  actions,
  host,
}: {
  actions: Array<{ id: string; label: string; action: BlockHostAction }>;
  host: DoraBlockHost;
}) {
  if (!actions.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => void host.dispatch(a.action)}
          className="rounded-lg border border-dark-600 bg-dark-800/80 px-3 py-1.5 text-xs dora-chat-text-secondary transition-colors hover:border-sky-500/35 hover:text-white dora-focus-ring"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// Dispatcher
// ============================================================

interface AIWidgetRendererProps {
  widget: AIWidgetPayload;
  index?: number;
  onSendMessage?: (msg: string, intentId?: string) => void;
}

export function AIWidgetRenderer({ widget, index = 0, onSendMessage }: AIWidgetRendererProps) {
  const navigate = useNavigate();
  const { widgetType, title } = widget;
  const staggerDelay = 0.1 + index * 0.12;

  const host = useMemo<DoraBlockHost>(() => {
    return {
      dispatch(action: BlockHostAction) {
        switch (action.kind) {
          case 'send_message':
            onSendMessage?.(action.text, action.intentId);
            break;
          case 'navigate':
            navigate(action.to, action.state !== undefined ? { state: action.state } : undefined);
            break;
          case 'export_widget':
            exportWidget(action.widgetType, action.format);
            break;
          case 'approve_action':
          case 'reject_action':
          case 'open_editor':
          default:
            break;
        }
      },
    };
  }, [navigate, onSendMessage]);

  const toolbarActions = useMemo(
    () => mergeToolbarActions(widget, widgetType),
    [widget, widgetType],
  );

  const inner = renderRegisteredBlock({
    widget,
    staggerDelay,
    host,
    onSendMessage,
  });

  return (
    <WidgetErrorBoundary fallbackTitle={title}>
      <div className="space-y-0">
        {inner}
        <BlockToolbar actions={toolbarActions} host={host} />
      </div>
    </WidgetErrorBoundary>
  );
}

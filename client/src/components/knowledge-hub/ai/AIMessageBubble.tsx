import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { ThumbsUp, ThumbsDown, User as UserIcon, Copy, Check } from 'lucide-react';
import type { AIMessage, SpecialistInfo } from '@/types/knowledge-hub/ai';
import { AIMetadataBar } from './AIMetadataBar';
import { AIChartRenderer } from './AIChartRenderer';
import { AITableRenderer } from './AITableRenderer';
import { AISourcesList } from './AISourcesList';
import { AIWidgetRenderer } from '@/components/dora/widgets/AIWidgetRenderer';
import DoraAvatar from '@/components/dora/DoraAvatar';
import { ThinkingIndicator } from '@/components/dora/ThinkingIndicator';
import { DoraFollowUpChips } from './DoraFollowUpChips';
import { ActionConfirmationInline } from '@/components/dora/ActionConfirmationInline';

interface AIMessageBubbleProps {
  message: AIMessage;
  priorUserMessage?: AIMessage | null;
  userRole?: string;
  currentPath?: string;
  onFeedback?: (messageId: string, isHelpful: boolean) => void;
  onSendMessage?: (msg: string, intentId?: string) => void;
  onConfirmAct?: (message: AIMessage) => void;
  onCancelAct?: (messageId: string) => void;
  /** SSE `pending_action` (token flow) */
  onConfirmPendingAction?: (
    messageId: string,
    actionToken: string,
    payload: Record<string, unknown>,
  ) => void;
  onCancelPendingAction?: (messageId: string, actionToken: string) => void;
}

export function AIMessageBubble({
  message,
  priorUserMessage,
  userRole,
  currentPath,
  onFeedback,
  onSendMessage,
  onConfirmAct,
  onCancelAct,
  onConfirmPendingAction,
  onCancelPendingAction,
}: AIMessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="flex items-start gap-2 max-w-[80%]">
          <div className="px-4 py-2.5 bg-primary-500 text-white rounded-2xl rounded-tr-md text-sm leading-relaxed">
            {message.content}
          </div>
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-500/20 flex items-center justify-center mt-0.5">
            <UserIcon size={14} className="text-primary-400" />
          </div>
        </div>
      </div>
    );
  }

  const isEmptyStreaming = message.isStreaming && !message.content;

  return (
    <div className="flex justify-start mb-4">
      <div className="flex items-start gap-2 max-w-[85%]">
        {/* Hide avatar while thinking — the planes inside ThinkingIndicator serve as the avatar */}
        {!isEmptyStreaming && (
          <div className="flex-shrink-0 mt-0.5">
            <DoraAvatar size={26} isThinking={!!message.isStreaming} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {message.specialist && (
            <SpecialistBadge specialist={message.specialist} />
          )}
          {isEmptyStreaming ? (
            <ThinkingIndicator />
          ) : (
            <div className="dora-glass px-4 py-3 rounded-2xl rounded-tl-md">
              <div className="max-w-3xl text-sm text-gray-300 leading-relaxed whitespace-pre-wrap [&_strong]:text-white [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_ul]:my-1 [&_li]:text-gray-300">
                <DoraReactMarkdown content={message.content} />
                {message.isStreaming && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 2,
                      height: 15,
                      background: 'var(--dora-primary, #38bdf8)',
                      marginLeft: 2,
                      borderRadius: 1,
                      animation: 'dora-pulse 1s infinite',
                      verticalAlign: 'text-bottom',
                    }}
                  />
                )}
              </div>

              {message.pendingConfirmation && !message.isStreaming && onConfirmAct && onCancelAct && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-amber-500/20 pt-3">
                  <span className="w-full text-[11px] uppercase tracking-wide text-amber-400/90">Act mode — confirm</span>
                  <button
                    type="button"
                    onClick={() => onConfirmAct(message)}
                    className="rounded-lg bg-amber-500/90 px-4 py-2 text-xs font-medium text-dark-900 hover:bg-amber-400"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => onCancelAct(message.id)}
                    className="rounded-lg border border-dark-600 px-4 py-2 text-xs text-gray-300 hover:border-dark-500 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {message.pendingAction &&
                message.actionStatus === 'pending' &&
                !message.isStreaming &&
                onConfirmPendingAction &&
                onCancelPendingAction && (
                  <ActionConfirmationInline
                    action={message.pendingAction}
                    onConfirm={(payload) =>
                      onConfirmPendingAction(message.id, message.pendingAction!.token, payload)
                    }
                    onCancel={() =>
                      onCancelPendingAction(message.id, message.pendingAction!.token)
                    }
                  />
                )}
              {message.actionStatus === 'cancelled' && (
                <p className="mt-2 text-xs dora-chat-text-tertiary italic">Action cancelled.</p>
              )}
              {message.widgets && message.widgets.map((widget, i) => (
                <AIWidgetRenderer key={`${widget.widgetType}-${i}`} widget={widget} index={i} onSendMessage={onSendMessage} />
              ))}
              {message.chartData && <AIChartRenderer chart={message.chartData} />}
              {message.tableData && <AITableRenderer table={message.tableData} />}
              {message.sources && message.sources.length > 0 && (
                <AISourcesList sources={message.sources} />
              )}
              {message.metadata && <AIMetadataBar metadata={message.metadata} />}
              {!message.pendingConfirmation && !message.pendingAction && (
                <DoraFollowUpChips
                  message={message}
                  priorUserMessage={priorUserMessage}
                  userRole={userRole}
                  currentPath={currentPath}
                  onSendMessage={onSendMessage}
                />
              )}
            </div>
          )}

          {!message.isStreaming &&
            message.content.length > 0 &&
            !message.pendingConfirmation &&
            !message.pendingAction && (
            <div className="flex items-center gap-1 mt-1.5 ml-1">
              <button
                onClick={handleCopy}
                className="p-1 rounded hover:bg-dark-700 dora-chat-text-tertiary hover:text-gray-300 transition-colors"
                title="Copy response"
              >
                {copied ? (
                  <Check size={14} className="text-success-500" />
                ) : (
                  <Copy size={14} />
                )}
              </button>
              {onFeedback && (
                <>
                  <button
                    onClick={() => onFeedback(message.id, true)}
                    className={`p-1 rounded transition-colors ${
                      message.feedback === 'up'
                        ? 'bg-success-500/20 text-success-500'
                        : 'hover:bg-dark-700 dora-chat-text-tertiary hover:text-success-500'
                    }`}
                    title="Helpful"
                    disabled={message.feedback !== null}
                  >
                    <ThumbsUp size={14} />
                  </button>
                  <button
                    onClick={() => onFeedback(message.id, false)}
                    className={`p-1 rounded transition-colors ${
                      message.feedback === 'down'
                        ? 'bg-danger-500/20 text-danger-500'
                        : 'hover:bg-dark-700 dora-chat-text-tertiary hover:text-danger-500'
                    }`}
                    title="Not helpful"
                    disabled={message.feedback !== null}
                  >
                    <ThumbsDown size={14} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const MODULE_BADGE: Record<string, { emoji: string; className: string; short: string }> = {
  crm: { emoji: '📊', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20', short: 'CRM' },
  support: { emoji: '🎧', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', short: 'Support' },
  finance: { emoji: '💰', className: 'bg-green-500/10 text-green-400 border-green-500/20', short: 'Finance' },
  hr: { emoji: '👥', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20', short: 'HR' },
  marketing: { emoji: '📣', className: 'bg-pink-500/10 text-pink-400 border-pink-500/20', short: 'Marketing' },
  knowledge: { emoji: '📚', className: 'bg-sky-500/10 text-sky-400 border-sky-500/20', short: 'Knowledge' },
  time: { emoji: '⏱️', className: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20', short: 'Time' },
  okr: { emoji: '🎯', className: 'bg-orange-500/10 text-orange-400 border-orange-500/20', short: 'OKRs' },
  heart: { emoji: '❤️', className: 'bg-rose-500/10 text-rose-400 border-rose-500/20', short: 'Culture' },
  executive: { emoji: '📈', className: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', short: 'Executive' },
  assets: { emoji: '🏢', className: 'bg-teal-500/10 text-teal-400 border-teal-500/20', short: 'Assets' },
  contracts: { emoji: '📄', className: 'bg-slate-500/10 text-slate-300 border-slate-500/20', short: 'Contracts' },
  projects: { emoji: '📁', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20', short: 'Projects' },
  people: { emoji: '👤', className: 'bg-violet-500/10 text-violet-400 border-violet-500/20', short: 'People' },
};

function SpecialistBadge({ specialist }: { specialist: SpecialistInfo }) {
  const mod = specialist.module?.toLowerCase() ?? '';
  const cfg = MODULE_BADGE[mod] ?? {
    emoji: specialist.icon || '✨',
    className: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    short: specialist.displayName || mod || 'Dora',
  };
  return (
    <span
      className={`mb-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}
    >
      <span aria-hidden>{cfg.emoji}</span>
      {cfg.short}
    </span>
  );
}

function DoraReactMarkdown({ content }: { content: string }) {
  if (!content) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        h1: ({ children }) => <h3 className="text-base font-semibold text-white mt-3 mb-1">{children}</h3>,
        h2: ({ children }) => <h3 className="text-base font-semibold text-white mt-3 mb-1">{children}</h3>,
        h3: ({ children }) => <h4 className="text-sm font-semibold text-white mt-3 mb-1">{children}</h4>,
        p: ({ children }) => <p className="my-1">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-gray-300">{children}</li>,
        a: ({ href, children }) => (
          <a href={href} className="text-primary-400 underline" target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        code: ({ className, children, ...props }) => {
          const isBlock = /language-/.test(className ?? '') || String(children).includes('\n');
          if (isBlock) {
            return (
              <pre className="my-2 p-2 rounded-lg bg-dark-800 overflow-x-auto text-xs">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            );
          }
          return (
            <code className="px-1 py-0.5 bg-dark-700 rounded text-xs font-mono text-primary-300" {...props}>
              {children}
            </code>
          );
        },
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border-collapse border border-dark-600">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-dark-600 px-2 py-1 text-left text-gray-400 font-semibold">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border border-dark-600 px-2 py-1 text-gray-300">{children}</td>
        ),
        hr: () => <hr className="my-3 border-dark-600" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

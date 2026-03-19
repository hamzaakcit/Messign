import { useState } from 'react';
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

interface AIMessageBubbleProps {
  message: AIMessage;
  priorUserMessage?: AIMessage | null;
  userRole?: string;
  currentPath?: string;
  onFeedback?: (messageId: string, isHelpful: boolean) => void;
  onSendMessage?: (msg: string, intentId?: string) => void;
  onConfirmAct?: (message: AIMessage) => void;
  onCancelAct?: (messageId: string) => void;
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
                <MarkdownContent content={message.content} />
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

              {message.isStreaming && message.content && (
                <div
                  className="mt-3 h-20 rounded-xl bg-gradient-to-r from-white/[0.04] to-white/[0.02] animate-pulse border border-white/5"
                  aria-hidden
                />
              )}
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
              {message.widgets && message.widgets.map((widget, i) => (
                <AIWidgetRenderer key={`${widget.widgetType}-${i}`} widget={widget} index={i} onSendMessage={onSendMessage} />
              ))}
              {message.chartData && <AIChartRenderer chart={message.chartData} />}
              {message.tableData && <AITableRenderer table={message.tableData} />}
              {message.sources && message.sources.length > 0 && (
                <AISourcesList sources={message.sources} />
              )}
              {message.metadata && <AIMetadataBar metadata={message.metadata} />}
              {!message.pendingConfirmation && (
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

          {!message.isStreaming && message.content.length > 0 && !message.pendingConfirmation && (
            <div className="flex items-center gap-1 mt-1.5 ml-1">
              <button
                onClick={handleCopy}
                className="p-1 rounded hover:bg-dark-700 text-gray-500 hover:text-gray-300 transition-colors"
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
                        : 'hover:bg-dark-700 text-gray-500 hover:text-success-500'
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
                        : 'hover:bg-dark-700 text-gray-500 hover:text-danger-500'
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

function MarkdownContent({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={i} className="text-sm font-semibold text-white mt-3 mb-1">
          {formatInline(line.slice(4))}
        </h4>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h3 key={i} className="text-base font-semibold text-white mt-3 mb-1">
          {formatInline(line.slice(3))}
        </h3>
      );
    } else if (line.match(/^[\s]*[-•]\s/)) {
      elements.push(
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-gray-500 mt-0.5 flex-shrink-0">&bull;</span>
          <span>{formatInline(line.replace(/^[\s]*[-•]\s/, ''))}</span>
        </div>
      );
    } else if (line.match(/^\s*\d+\.\s/)) {
      const num = line.match(/^\s*(\d+)\./)?.[1] ?? '';
      elements.push(
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-gray-500 font-medium flex-shrink-0 w-5 text-right">
            {num}.
          </span>
          <span>{formatInline(line.replace(/^\s*\d+\.\s/, ''))}</span>
        </div>
      );
    } else if (line.trim() === '---') {
      elements.push(
        <hr key={i} className="my-3 border-dark-600" />
      );
    } else if (line.includes('|') && line.trim().startsWith('|')) {
      if (line.match(/^\|[\s-|]+\|$/)) continue;
      const cells = line
        .split('|')
        .filter((c) => c.trim())
        .map((c) => c.trim());
      const isHeader =
        i + 1 < lines.length && lines[i + 1]?.match(/^\|[\s-|]+\|$/);
      elements.push(
        <div
          key={i}
          className={`flex gap-4 py-1 px-2 text-xs ${
            isHeader
              ? 'font-semibold text-gray-500 border-b border-dark-600'
              : ''
          }`}
        >
          {cells.map((cell, ci) => (
            <span key={ci} className="flex-1 min-w-0 truncate">
              {formatInline(cell)}
            </span>
          ))}
        </div>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <span key={i}>
          {formatInline(line)}
          {i < lines.length - 1 ? '\n' : ''}
        </span>
      );
    }
  }

  return <>{elements}</>;
}

function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`(.+?)`/);
    const boldIdx = boldMatch?.index ?? Infinity;
    const codeIdx = codeMatch?.index ?? Infinity;

    if (boldIdx === Infinity && codeIdx === Infinity) {
      parts.push(remaining);
      break;
    }

    if (boldIdx <= codeIdx && boldMatch) {
      parts.push(remaining.slice(0, boldIdx));
      parts.push(
        <strong key={key++} className="font-semibold text-white">
          {boldMatch[1]}
        </strong>
      );
      remaining = remaining.slice(boldIdx + boldMatch[0].length);
    } else if (codeMatch) {
      parts.push(remaining.slice(0, codeIdx));
      parts.push(
        <code
          key={key++}
          className="px-1 py-0.5 bg-dark-700 rounded text-xs font-mono text-primary-300"
        >
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeIdx + codeMatch[0].length);
    }
  }

  return <>{parts}</>;
}

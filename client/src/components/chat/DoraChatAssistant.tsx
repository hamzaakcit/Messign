import { useState } from 'react';
import { Sparkles, FileText, ListChecks, BookOpen, Loader2, ChevronDown, ChevronUp, Plus, ExternalLink, X } from 'lucide-react';
import { useChatDora } from '@/hooks/useChatDora';
import { useChatStore } from '@/stores/chatStore';
import { cn } from '@/lib/utils';

export function DoraChatAssistant() {
  const {
    doraSummary, doraActionItems, doraLoading,
    summarize, getActionItems, getKBSuggestions, createTaskFromActionItem,
  } = useChatDora();
  const toggleDoraPanel = useChatStore((s) => s.toggleDoraPanel);
  const [activeTab, setActiveTab] = useState<'summary' | 'actions' | 'kb'>('summary');
  const [kbQuery, setKBQuery] = useState('');
  const [kbResults, setKBResults] = useState<Array<{ title: string; excerpt: string; documentId: string; relevanceScore: number }>>([]);
  const [kbLoading, setKBLoading] = useState(false);
  const [expandedAction, setExpandedAction] = useState<number | null>(null);
  const [creatingTask, setCreatingTask] = useState<number | null>(null);

  const handleKBSearch = async () => {
    if (!kbQuery.trim()) return;
    setKBLoading(true);
    const results = await getKBSuggestions(kbQuery);
    setKBResults(results);
    setKBLoading(false);
  };

  const handleCreateTask = async (idx: number, text: string, assignee?: string, priority?: string) => {
    setCreatingTask(idx);
    await createTaskFromActionItem(text, assignee, priority);
    setCreatingTask(null);
  };

  const tabs = [
    { id: 'summary' as const, label: 'Summary', icon: FileText },
    { id: 'actions' as const, label: 'Action Items', icon: ListChecks },
    { id: 'kb' as const, label: 'Knowledge', icon: BookOpen },
  ];

  return (
    <div className="border-b border-app bg-gradient-to-r from-primary-500/5 to-accent-500/5">
      {/* Header */}
      <div className="px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-app">Dora AI</span>
        </div>
        <button onClick={toggleDoraPanel} className="p-1 rounded text-app-muted hover:text-app transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === 'summary' && !doraSummary) summarize();
              if (tab.id === 'actions' && !doraActionItems) getActionItems();
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-primary-500/15 text-primary-400 border border-primary-500/20'
                : 'text-app-muted hover:text-app hover:bg-app-hover border border-transparent',
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 pb-3 max-h-64 overflow-y-auto">
        {doraLoading && (
          <div className="flex items-center justify-center py-6 gap-2 text-app-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Dora is thinking...</span>
          </div>
        )}

        {/* Summary tab */}
        {activeTab === 'summary' && !doraLoading && (
          <div>
            {doraSummary ? (
              <div className="space-y-3">
                <p className="text-sm text-app leading-relaxed">{doraSummary.summary}</p>
                {doraSummary.keyTopics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {doraSummary.keyTopics.map((topic, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-400 text-[11px] font-medium">
                        {topic}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 text-[11px] text-app-muted">
                  <span>{doraSummary.participantCount} participants</span>
                  <span>{doraSummary.messageCount} messages analyzed</span>
                </div>
                <button onClick={summarize} className="text-xs text-primary-400 hover:text-primary-300 font-medium">
                  Refresh summary
                </button>
              </div>
            ) : (
              <button onClick={summarize} className="w-full py-4 text-sm text-primary-400 hover:text-primary-300 font-medium">
                Click to summarize this conversation
              </button>
            )}
          </div>
        )}

        {/* Action Items tab */}
        {activeTab === 'actions' && !doraLoading && (
          <div>
            {doraActionItems && doraActionItems.actionItems.length > 0 ? (
              <div className="space-y-2">
                {doraActionItems.actionItems.map((item, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-app-bg border border-app">
                    <div className="flex items-start gap-2">
                      <button
                        onClick={() => setExpandedAction(expandedAction === idx ? null : idx)}
                        className="mt-0.5 shrink-0"
                      >
                        {expandedAction === idx ? <ChevronUp className="w-3.5 h-3.5 text-app-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-app-muted" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-app">{item.text}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {item.assignee && (
                            <span className="text-[11px] text-app-muted">@{item.assignee}</span>
                          )}
                          <span className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium',
                            item.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                            item.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-gray-500/20 text-gray-400',
                          )}>
                            {item.priority}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCreateTask(idx, item.text, item.assignee, item.priority)}
                        disabled={creatingTask === idx}
                        className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 text-xs font-medium transition-colors"
                      >
                        {creatingTask === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Create Task
                      </button>
                    </div>
                  </div>
                ))}
                <div className="text-[11px] text-app-muted">
                  Confidence: {Math.round(doraActionItems.confidence * 100)}%
                </div>
              </div>
            ) : (
              <button onClick={getActionItems} className="w-full py-4 text-sm text-primary-400 hover:text-primary-300 font-medium">
                Scan for action items
              </button>
            )}
          </div>
        )}

        {/* Knowledge tab */}
        {activeTab === 'kb' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={kbQuery}
                onChange={(e) => setKBQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleKBSearch()}
                placeholder="Ask about your knowledge base..."
                className="flex-1 px-3 py-1.5 text-sm bg-app-inputBg border border-app-inputBorder rounded-lg text-app placeholder:text-app-muted focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <button onClick={handleKBSearch} disabled={kbLoading} className="px-3 py-1.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50">
                {kbLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
              </button>
            </div>
            {kbResults.length > 0 && (
              <div className="space-y-2">
                {kbResults.map((doc) => (
                  <div key={doc.documentId} className="p-2.5 rounded-lg bg-app-bg border border-app">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-app">{doc.title}</p>
                        <p className="text-xs text-app-muted mt-0.5 line-clamp-2">{doc.excerpt}</p>
                      </div>
                      <a href={`/knowledge-hub/documents/${doc.documentId}`} className="shrink-0 p-1 text-primary-400 hover:text-primary-300">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

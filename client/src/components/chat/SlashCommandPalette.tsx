import { useRef, useEffect } from 'react';
import type { SlashSearchResult } from '@/types';
import type { SlashCommand } from '@/hooks/useSlashCommands';
import { cn } from '@/lib/utils';
import { ListChecks, FileText, User, Loader2, Search } from 'lucide-react';

interface SlashCommandPaletteProps {
  slash: {
    isOpen: boolean;
    activeCommand: SlashCommand | null;
    query: string;
    results: SlashSearchResult[];
    selectedIndex: number;
    loading: boolean;
    commands: SlashCommand[];
    search: (q: string) => void;
    setSelectedIndex: (i: number) => void;
    selectCommand?: (cmd: SlashCommand) => void;
  };
  onSelect: (item: { type: string; id: string; title: string }) => void;
  onClose: () => void;
}

export function SlashCommandPalette({ slash, onSelect, onClose }: SlashCommandPaletteProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'task': return <ListChecks className="w-4 h-4 text-primary-400" />;
      case 'document': return <FileText className="w-4 h-4 text-accent-400" />;
      case 'user': return <User className="w-4 h-4 text-success-400" />;
      default: return null;
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    const colors: Record<string, string> = {
      todo: 'bg-gray-500/20 text-gray-400',
      in_progress: 'bg-blue-500/20 text-blue-400',
      review: 'bg-yellow-500/20 text-yellow-400',
      done: 'bg-green-500/20 text-green-400',
      published: 'bg-green-500/20 text-green-400',
      draft: 'bg-gray-500/20 text-gray-400',
    };
    return (
      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', colors[status] ?? 'bg-gray-500/20 text-gray-400')}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  // Show command list when no active command
  if (!slash.activeCommand) {
    return (
      <div ref={containerRef} className="mb-2 bg-app-sidebar border border-app rounded-xl shadow-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-app">
          <p className="text-xs font-semibold text-app-muted uppercase">Commands</p>
        </div>
        <div className="py-1 max-h-48 overflow-y-auto">
          {slash.commands.map((cmd, idx) => (
            <button
              key={cmd.trigger}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                idx === slash.selectedIndex ? 'bg-primary-500/10 text-app' : 'text-app-muted hover:bg-app-hover hover:text-app',
              )}
              onMouseEnter={() => slash.setSelectedIndex(idx)}
              onClick={() => slash.selectCommand?.(cmd)}
            >
              <span className="text-lg">{cmd.icon}</span>
              <div>
                <div className="text-sm font-medium">{cmd.trigger}</div>
                <div className="text-xs text-app-muted">{cmd.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Show search results for active command
  return (
    <div ref={containerRef} className="mb-2 bg-app-sidebar border border-app rounded-xl shadow-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-app flex items-center gap-2">
        <span className="text-sm">{slash.activeCommand.icon}</span>
        <p className="text-xs font-semibold text-app">{slash.activeCommand.label}</p>
        {slash.loading && <Loader2 className="w-3 h-3 animate-spin text-app-muted ml-auto" />}
      </div>
      <div className="py-1 max-h-64 overflow-y-auto">
        {slash.results.length === 0 && !slash.loading && slash.query && (
          <div className="px-3 py-4 text-sm text-app-muted text-center flex flex-col items-center gap-2">
            <Search className="w-5 h-5 opacity-50" />
            No results for &quot;{slash.query}&quot;
          </div>
        )}
        {slash.results.length === 0 && !slash.query && (
          <div className="px-3 py-4 text-sm text-app-muted text-center">
            Type to search...
          </div>
        )}
        {slash.results.map((item, idx) => (
          <button
            key={item.id}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
              idx === slash.selectedIndex ? 'bg-primary-500/10' : 'hover:bg-app-hover',
            )}
            onClick={() => onSelect(item)}
            onMouseEnter={() => slash.setSelectedIndex(idx)}
          >
            {getTypeIcon(item.type)}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-app truncate">{item.title}</div>
              {item.subtitle && <div className="text-xs text-app-muted truncate">{item.subtitle}</div>}
            </div>
            {getStatusBadge(item.status)}
          </button>
        ))}
      </div>
    </div>
  );
}

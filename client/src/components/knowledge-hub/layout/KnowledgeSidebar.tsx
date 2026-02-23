import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, FolderOpen, Search, PanelLeftClose, PanelLeft, Plus, Bookmark, Library, Home } from 'lucide-react';
import { useKnowledgeHubStore } from '@/stores/knowledgeHubStore';
import { KnowledgeHubIcon, AiAssistantIcon } from '@/components/knowledge-hub/icons';
import type { KhCategory } from '@/types/knowledge-hub';
import { cn } from '@/lib/utils';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  activePath: string;
  onNavigate: (path: string) => void;
}

function CategoryTree({ categories, level = 0, activePath, onNavigate }: { categories: KhCategory[]; level?: number; activePath: string; onNavigate: (path: string) => void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <>
      {categories.map(cat => {
        const hasChildren = cat.children && cat.children.length > 0;
        const isExpanded = expanded[cat.id];
        const catPath = `/knowledge-hub/categories/${cat.id}`;
        const isActive = activePath === catPath;

        return (
          <div key={cat.id}>
            <button
              onClick={() => {
                onNavigate(catPath);
                if (hasChildren) setExpanded(prev => ({ ...prev, [cat.id]: !prev[cat.id] }));
              }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors',
                isActive ? 'bg-primary-500/10 text-primary-400' : 'text-gray-400 hover:bg-dark-700 hover:text-gray-200'
              )}
              style={{ paddingLeft: `${12 + level * 16}px` }}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              )}
              {cat.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />}
              <span className="truncate flex-1 text-left">{cat.name}</span>
              {cat.document_count != null && cat.document_count > 0 && (
                <span className="text-xs text-gray-500">{cat.document_count}</span>
              )}
            </button>
            {hasChildren && isExpanded && (
              <CategoryTree categories={cat.children!} level={level + 1} activePath={activePath} onNavigate={onNavigate} />
            )}
          </div>
        );
      })}
    </>
  );
}

export function KnowledgeSidebar({ collapsed, onToggle, activePath, onNavigate }: Props) {
  const { categories } = useKnowledgeHubStore();

  const standardLinks = [
    { id: 'home', label: 'Home', icon: Home, path: '/knowledge-hub' },
    { id: 'docs', label: 'All Documents', icon: FileText, path: '/knowledge-hub/documents' },
    { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark, path: '/knowledge-hub/bookmarks' },
    { id: 'collections', label: 'Collections', icon: Library, path: '/knowledge-hub/collections' },
  ];
  const aiAssistantPath = '/knowledge-hub/ai-assistant';

  if (collapsed) {
    return (
      <div className="w-14 border-r border-dark-700 bg-dark-800 flex flex-col items-center py-3 gap-2 shrink-0">
        <button onClick={onToggle} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700">
          <PanelLeft className="w-4 h-4" />
        </button>
        <div className="w-8 border-t border-dark-700 my-1" />
        {standardLinks.map(link => (
          <button
            key={link.id}
            onClick={() => onNavigate(link.path)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              activePath === link.path ? 'text-primary-400 bg-primary-500/10' : 'text-gray-400 hover:text-white hover:bg-dark-700'
            )}
            title={link.label}
          >
            <link.icon className="w-4 h-4" />
          </button>
        ))}
        <div className="flex-1 min-h-2" />
        <button
          onClick={() => onNavigate(aiAssistantPath)}
          className={cn(
            'p-2 rounded-lg transition-colors',
            activePath === aiAssistantPath ? 'text-primary-400 bg-primary-500/10' : 'text-gray-400 hover:text-white hover:bg-dark-700'
          )}
          title="AI Assistant"
        >
          <AiAssistantIcon size={20} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-dark-700 bg-dark-800 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
        <div className="flex items-center gap-2">
          <KnowledgeHubIcon size={20} active />
          <span className="font-semibold text-white text-sm">Knowledge Hub</span>
        </div>
        <button onClick={onToggle} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700">
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3 py-3">
        <button
          onClick={() => onNavigate('/knowledge-hub/documents/new')}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Document
        </button>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={() => onNavigate('/knowledge-hub/search')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-700/50 text-gray-400 text-sm hover:bg-dark-700 transition-colors"
        >
          <Search className="w-4 h-4" />
          <span>Search documents...</span>
          <kbd className="ml-auto text-xs text-gray-500 bg-dark-600 px-1.5 py-0.5 rounded">⌘K</kbd>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4 flex flex-col min-h-0">
        <div className="flex flex-col flex-1 min-h-0">
          <p className="px-3 text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Quick Access</p>
          <div className="flex flex-col gap-0.5 flex-1">
            {standardLinks.map(link => {
              const isActive = activePath === link.path;
              return (
                <button
                  key={link.id}
                  onClick={() => onNavigate(link.path)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-md transition-colors relative',
                    isActive ? 'bg-primary-500/10 text-primary-400' : 'text-gray-400 hover:bg-dark-700 hover:text-gray-200'
                  )}
                >
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary-500 rounded-r"
                    />
                  )}
                  <link.icon className="w-4 h-4 shrink-0" />
                  <span>{link.label}</span>
                </button>
              );
            })}
            <div className="flex-1 min-h-2" />
            <button
              onClick={() => onNavigate(aiAssistantPath)}
              className={cn(
                'ai-assistant-nav-item w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-xl transition-all relative',
                activePath === aiAssistantPath ? 'active' : ''
              )}
            >
              {activePath === aiAssistantPath && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary-500 rounded-r"
                />
              )}
              <AiAssistantIcon size={20} className="shrink-0" />
              <span className="flex-1 text-left">AI Assistant</span>
              <span className="plus-badge text-[8px] font-bold tracking-widest">PLUS</span>
            </button>
          </div>
        </div>

        <div>
          <p className="px-3 text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Categories</p>
          <CategoryTree categories={categories} activePath={activePath} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}

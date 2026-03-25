import { useState, useCallback, useRef, useEffect } from 'react';
import { chatAPI } from '@/lib/api';
import type { SlashSearchResult } from '@/types';

export interface SlashCommand {
  trigger: string;
  label: string;
  description: string;
  searchType: 'task' | 'document' | 'user';
  icon: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { trigger: '/task', label: 'Task', description: 'Search and embed a task card', searchType: 'task', icon: '📋' },
  { trigger: '/doc', label: 'Document', description: 'Search and embed a knowledge document', searchType: 'document', icon: '📄' },
  { trigger: '/user', label: 'User', description: 'Mention and find a coworker', searchType: 'user', icon: '👤' },
];

export function useSlashCommands() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCommand, setActiveCommand] = useState<SlashCommand | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SlashSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const open = useCallback((command?: SlashCommand) => {
    setIsOpen(true);
    setActiveCommand(command ?? null);
    setQuery('');
    setResults([]);
    setSelectedIndex(0);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveCommand(null);
    setQuery('');
    setResults([]);
    setSelectedIndex(0);
  }, []);

  const search = useCallback((q: string) => {
    setQuery(q);
    setSelectedIndex(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const type = activeCommand?.searchType ?? 'all';
        const data = await chatAPI.slashSearch(type, q, 10);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, [activeCommand]);

  const moveSelection = useCallback((direction: 'up' | 'down') => {
    const list = activeCommand ? results : SLASH_COMMANDS;
    setSelectedIndex((prev) => {
      if (direction === 'down') return Math.min(prev + 1, list.length - 1);
      return Math.max(prev - 1, 0);
    });
  }, [activeCommand, results]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const detectSlashCommand = useCallback((text: string): SlashCommand | null => {
    const trimmed = text.trim();
    for (const cmd of SLASH_COMMANDS) {
      if (trimmed === cmd.trigger || trimmed.startsWith(cmd.trigger + ' ')) {
        return cmd;
      }
    }
    return null;
  }, []);

  return {
    isOpen,
    activeCommand,
    query,
    results,
    selectedIndex,
    loading,
    open,
    close,
    search,
    moveSelection,
    setSelectedIndex,
    detectSlashCommand,
    commands: SLASH_COMMANDS,
  };
}

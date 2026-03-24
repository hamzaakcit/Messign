/**
 * DoraHistorySidebar — Left panel showing Dora conversation history.
 *
 * Features:
 * - List of past sessions sorted by last activity
 * - "New Chat" button
 * - Click to restore a past session
 * - Delete individual sessions
 * - Collapsible
 */
import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Plus, Trash2, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useDoraStore, type DoraSession } from '@/stores/doraStore';

interface DoraHistorySidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onSelectSession: (session: DoraSession) => void;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function DoraHistorySidebar({ collapsed, onToggle, onNewChat, onSelectSession }: DoraHistorySidebarProps) {
  const sessions = useDoraStore((s) => s.sessions);
  const activeSessionId = useDoraStore((s) => s.activeSessionId);
  const deleteSession = useDoraStore((s) => s.deleteSession);
  const setActiveSession = useDoraStore((s) => s.setActiveSession);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sort by most recent first
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      deleteSession(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  useEffect(() => {
    return () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); };
  }, []);

  const handleSelect = (session: DoraSession) => {
    setActiveSession(session.id);
    onSelectSession(session);
  };

  return (
    <div
      style={{
        height: '100%',
        width: collapsed ? 0 : 240,
        minWidth: collapsed ? 0 : 240,
        transition: 'width 0.25s ease, min-width 0.25s ease',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        borderRight: collapsed ? 'none' : '1px solid var(--app-border)',
        background: 'var(--app-sidebar)',
        position: 'relative',
      }}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        title={collapsed ? 'Show history' : 'Hide history'}
        style={{
          position: 'absolute',
          top: 12,
          right: collapsed ? -32 : -16,
          zIndex: 20,
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '1px solid var(--app-border-strong)',
          background: 'var(--panel-bg)',
          color: 'var(--app-text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'right 0.25s ease',
        }}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {!collapsed && (
        <>
          {/* Header */}
          <div
            style={{
              padding: '14px 14px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderBottom: '1px solid var(--app-border)',
              flexShrink: 0,
            }}
          >
            <MessageSquare size={14} style={{ color: 'var(--app-text-muted)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--app-text-muted)', flex: 1 }}>
              History
            </span>
            <button
              onClick={onNewChat}
              title="New conversation"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 8px', borderRadius: 6,
                border: '1px solid rgba(59,130,246,0.35)',
                background: 'rgba(59,130,246,0.10)',
                color: '#3b82f6', fontSize: 11, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={11} /> New
            </button>
          </div>

          {/* Session list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
            {sortedSessions.length === 0 ? (
              <div
                style={{
                  textAlign: 'center', padding: '32px 12px',
                  color: 'var(--app-text-tertiary)', fontSize: 12, fontStyle: 'italic',
                }}
              >
                No conversations yet.<br />Ask Dora something!
              </div>
            ) : (
              sortedSessions.map((session) => {
                const isActive = session.id === activeSessionId;
                const isHovered = hoveredId === session.id;
                const isConfirmDelete = confirmDeleteId === session.id;
                const lastMsg = [...session.messages].reverse().find((m) => m.role === 'assistant');

                return (
                  <div
                    key={session.id}
                    onClick={() => handleSelect(session)}
                    onMouseEnter={() => setHoveredId(session.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      padding: '9px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      marginBottom: 2,
                      background: isActive
                        ? 'var(--app-nav-active-bg)'
                        : isHovered
                        ? 'var(--app-nav-hover)'
                        : 'transparent',
                      border: isActive
                        ? '1px solid rgba(59,130,246,0.25)'
                        : '1px solid transparent',
                      transition: 'background 0.15s, border-color 0.15s',
                      position: 'relative',
                    }}
                  >
                    {/* Title */}
                    <div
                      style={{
                        fontSize: 12, fontWeight: isActive ? 600 : 400,
                        color: isActive ? 'var(--app-text)' : 'var(--app-text-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        paddingRight: 24,
                      }}
                    >
                      {session.title}
                    </div>

                    {/* Preview + time */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Clock size={9} style={{ color: 'var(--app-text-tertiary)' }} />
                      <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                        {formatRelativeTime(session.updatedAt)}
                      </span>
                      {session.messages.length > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                          · {Math.ceil(session.messages.length / 2)} msg{session.messages.length !== 2 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {lastMsg && (
                      <div
                        style={{
                          fontSize: 10, color: 'var(--app-text-tertiary)', marginTop: 2,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {lastMsg.content.slice(0, 60)}
                      </div>
                    )}

                    {/* Delete button */}
                    {(isHovered || isActive) && (
                      <button
                        onClick={(e) => handleDelete(e, session.id)}
                        title={isConfirmDelete ? 'Click again to confirm delete' : 'Delete'}
                        style={{
                          position: 'absolute', top: 8, right: 6,
                          width: 20, height: 20, borderRadius: 4,
                          border: 'none',
                          background: isConfirmDelete ? 'rgba(239,68,68,0.2)' : 'transparent',
                          color: isConfirmDelete ? '#ef4444' : 'var(--app-text-tertiary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

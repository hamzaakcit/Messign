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
        borderRight: collapsed ? 'none' : '1px solid rgba(100,140,255,0.1)',
        background: 'rgba(10,15,30,0.6)',
        backdropFilter: 'blur(8px)',
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
          border: '1px solid rgba(100,140,255,0.18)',
          background: 'rgba(20,30,60,0.95)',
          color: '#64748b',
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
              borderBottom: '1px solid rgba(100,140,255,0.08)',
              flexShrink: 0,
            }}
          >
            <MessageSquare size={14} color="#64748b" />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', flex: 1 }}>
              History
            </span>
            <button
              onClick={onNewChat}
              title="New conversation"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 8px', borderRadius: 6,
                border: '1px solid rgba(59,130,246,0.25)',
                background: 'rgba(59,130,246,0.08)',
                color: '#60a5fa', fontSize: 11, fontWeight: 600,
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
                  color: '#475569', fontSize: 12, fontStyle: 'italic',
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
                        ? 'rgba(59,130,246,0.12)'
                        : isHovered
                        ? 'rgba(100,140,255,0.06)'
                        : 'transparent',
                      border: isActive
                        ? '1px solid rgba(59,130,246,0.2)'
                        : '1px solid transparent',
                      transition: 'background 0.15s, border-color 0.15s',
                      position: 'relative',
                    }}
                  >
                    {/* Title */}
                    <div
                      style={{
                        fontSize: 12, fontWeight: isActive ? 600 : 400,
                        color: isActive ? '#e2e8f0' : '#94a3b8',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        paddingRight: 24,
                      }}
                    >
                      {session.title}
                    </div>

                    {/* Preview + time */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Clock size={9} color="#475569" />
                      <span style={{ fontSize: 10, color: '#475569' }}>
                        {formatRelativeTime(session.updatedAt)}
                      </span>
                      {session.messages.length > 0 && (
                        <span style={{ fontSize: 10, color: '#374151' }}>
                          · {Math.ceil(session.messages.length / 2)} msg{session.messages.length !== 2 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {lastMsg && (
                      <div
                        style={{
                          fontSize: 10, color: '#374151', marginTop: 2,
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
                          color: isConfirmDelete ? '#ef4444' : '#475569',
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

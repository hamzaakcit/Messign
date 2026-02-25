/**
 * DoraDashPage — Full-screen dedicated game page at /dora/game
 * True full-frame, no scroll. Canvas fills available height.
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Trophy, Play, RotateCcw, ArrowLeft, Target, Zap, Clock, Gamepad2 } from 'lucide-react';
import { useDoraDash } from '@/hooks/useDoraDash';
import { getAccessToken } from '@/lib/authToken';
import { API_ORIGIN } from '@/lib/api';

interface LeaderboardEntry {
  userId: string;
  userName: string;
  avatar: string | null;
  score: number;
  durationMs: number;
  playedAt: string;
}

const MEDAL_COLORS = ['#fbbf24', '#94a3b8', '#d97706'];
const MEDAL_LABELS = ['🥇', '🥈', '🥉'];

export function DoraDashPage() {
  const navigate = useNavigate();
  const { canvasRef, gameState, score, elapsed, speedMultiplier, start, restart } = useDoraDash();

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [isNewHigh, setIsNewHigh] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_ORIGIN}/api/game/leaderboard`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard ?? []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  useEffect(() => {
    if (gameState !== 'gameOver' || submitting) return;
    const submit = async () => {
      setSubmitting(true);
      try {
        const token = getAccessToken();
        const res = await fetch(`${API_ORIGIN}/api/game/scores`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ score, durationMs: Math.round(elapsed) }),
        });
        if (res.ok) {
          const data = await res.json();
          setLeaderboard(data.leaderboard ?? []);
          setIsNewHigh(data.isTopThree ?? false);
        }
      } catch { /* silent */ }
      finally { setSubmitting(false); }
    };
    submit();
  }, [gameState]);

  const handleRestart = useCallback(() => { setIsNewHigh(false); restart(); }, [restart]);

  return (
    /* Outermost: fill the MainContent area exactly, no scroll */
    <div style={{
      height: '100%',
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #0a0f1e 0%, #0f172a 60%, #0a1628 100%)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ── Top bar ── */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 20px',
        borderBottom: '1px solid rgba(100,140,255,0.08)',
        background: 'rgba(10,15,30,0.7)',
      }}>
        <button
          onClick={() => navigate('/dora')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(100,140,255,0.08)',
            border: '1px solid rgba(100,140,255,0.15)',
            borderRadius: 8, padding: '5px 12px',
            color: '#94a3b8', fontSize: 12, cursor: 'pointer',
          }}
        >
          <ArrowLeft size={13} /> Back to Dora
        </button>

        {/* Score pills (visible while playing) */}
        {gameState === 'playing' && (
          <div style={{ display: 'flex', gap: 12, marginLeft: 8 }}>
            <StatPill icon={Target} label="Score" value={String(score)} color="#60a5fa" />
            <StatPill icon={Zap} label="Speed" value={`${speedMultiplier.toFixed(1)}×`} color="#f472b6" />
            <StatPill icon={Clock} label="Time" value={`${(elapsed / 1000).toFixed(1)}s`} color="#a78bfa" />
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Gamepad2 size={13} color="#fff" />
          </div>
          <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14 }}>Dora Dash</span>
          <span style={{ color: '#475569', fontSize: 11 }}>Easter Egg Mode</span>
        </div>
      </div>

      {/* ── Main area: canvas + right panel, fills remaining height ── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        gap: 16,
        padding: '12px 16px',
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'stretch',
      }}>
        {/* Canvas wrapper — fills available height */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
          <canvas
            ref={canvasRef as React.RefObject<HTMLCanvasElement>}
            width={400}
            height={580}
            style={{
              display: 'block',
              borderRadius: 14,
              background: '#0f172a',
              border: '1px solid rgba(100,140,255,0.18)',
              boxShadow: '0 0 40px rgba(59,130,246,0.1)',
              width: 400,
              height: '100%',
              maxHeight: '100%',
              objectFit: 'fill',
            }}
          />

          {/* Idle overlay */}
          {gameState === 'idle' && (
            <div style={overlayStyle}>
              <div style={{ fontSize: 56, lineHeight: 1 }}>✈️</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', textAlign: 'center' }}>
                Dora Dash
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>
                Bugs fly in curves, waves & crosses now.<br />
                Move in all 4 directions to survive!
              </div>
              <button onClick={start} style={primaryBtnStyle} onMouseEnter={btnHoverIn} onMouseLeave={btnHoverOut}>
                <Play size={16} /> Start Game
              </button>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
                {['↑','↓','←','→','W','A','S','D'].map((k) => (
                  <kbd key={k} style={kbdStyle}>{k}</kbd>
                ))}
              </div>
            </div>
          )}

          {/* Game Over overlay */}
          {gameState === 'gameOver' && (
            <div style={overlayStyle}>
              {isNewHigh && (
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', letterSpacing: 2, textTransform: 'uppercase' }}>
                  ★ New High Score! ★
                </div>
              )}
              <div style={{ fontSize: 30, fontWeight: 700, color: '#ef4444' }}>Game Over</div>
              <div style={{ display: 'flex', gap: 20 }}>
                <StatBadge icon={Target} label="Score" value={String(score)} color="#60a5fa" />
                <StatBadge icon={Clock} label="Time" value={`${(elapsed / 1000).toFixed(1)}s`} color="#a78bfa" />
                <StatBadge icon={Zap} label="Speed" value={`${speedMultiplier.toFixed(1)}×`} color="#f472b6" />
              </div>
              <button onClick={handleRestart} style={primaryBtnStyle} onMouseEnter={btnHoverIn} onMouseLeave={btnHoverOut}>
                <RotateCcw size={16} /> Play Again
              </button>
            </div>
          )}
        </div>

        {/* Right panel — leaderboard + tips, scrollable internally if needed */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
          width: 220, flexShrink: 0, overflow: 'hidden',
        }}>
          {/* Leaderboard */}
          <div style={{
            borderRadius: 12, padding: 14,
            background: 'rgba(15,23,42,0.75)',
            border: '1px solid rgba(100,140,255,0.12)',
            flexShrink: 0,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              marginBottom: 12, paddingBottom: 8,
              borderBottom: '1px solid rgba(100,140,255,0.08)',
            }}>
              <Trophy size={14} color="#fbbf24" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Top 3 Messign</span>
            </div>
            {leaderboard.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, fontStyle: 'italic', padding: '12px 0' }}>
                No scores yet —<br />be the first!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {leaderboard.map((entry, i) => (
                  <div key={entry.userId} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8,
                    background: i === 0 ? 'rgba(251,191,36,0.07)' : 'rgba(100,140,255,0.04)',
                    border: i === 0 ? '1px solid rgba(251,191,36,0.15)' : '1px solid transparent',
                  }}>
                    <span style={{ fontSize: 16 }}>{MEDAL_LABELS[i]}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.userName}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>{(entry.durationMs / 1000).toFixed(1)}s</div>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: MEDAL_COLORS[i] }}>{entry.score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* How to play */}
          <div style={{
            borderRadius: 12, padding: 14,
            background: 'rgba(15,23,42,0.5)',
            border: '1px solid rgba(100,140,255,0.08)',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              How to play
            </div>
            {[
              ['✈️', 'Move in 4 directions'],
              ['🌀', 'Bugs fly in waves & curves'],
              ['➕', 'Cross-moving bugs cut laterally'],
              ['⚡', 'Speed up every 2 seconds'],
              ['⏱️', '+10 pts bonus per 10s'],
              ['💀', 'One hit = Game Over'],
            ].map(([icon, tip]) => (
              <div key={tip as string} style={{ display: 'flex', gap: 8, marginBottom: 7, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                <span>{icon}</span><span>{tip}</span>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div style={{
            borderRadius: 12, padding: 12,
            background: 'rgba(15,23,42,0.4)',
            border: '1px solid rgba(100,140,255,0.06)',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Controls
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['↑','↓','←','→','W','A','S','D'].map((k) => (
                <kbd key={k} style={kbdStyle}>{k}</kbd>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'absolute', inset: 0, borderRadius: 14,
  background: 'rgba(10,15,30,0.9)',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  gap: 16, backdropFilter: 'blur(8px)',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '11px 32px', borderRadius: 10, border: 'none',
  background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
  color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  transition: 'transform 0.15s, box-shadow 0.15s',
  boxShadow: '0 0 24px rgba(59,130,246,0.35)',
};

const btnHoverIn = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.transform = 'scale(1.06)';
  e.currentTarget.style.boxShadow = '0 0 36px rgba(59,130,246,0.55)';
};
const btnHoverOut = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.transform = 'scale(1)';
  e.currentTarget.style.boxShadow = '0 0 24px rgba(59,130,246,0.35)';
};

const kbdStyle: React.CSSProperties = {
  display: 'inline-block', padding: '2px 6px', borderRadius: 4,
  background: 'rgba(100,140,255,0.1)', border: '1px solid rgba(100,140,255,0.2)',
  fontSize: 11, fontFamily: 'monospace', color: '#94a3b8',
};

function StatBadge({ icon: Icon, label, value, color }: {
  icon: LucideIcon;
  label: string; value: string; color: string;
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <Icon size={16} color={color} />
      <div style={{ fontSize: 18, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function StatPill({ icon: Icon, label, value, color }: {
  icon: LucideIcon;
  label: string; value: string; color: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <Icon size={12} color={color} />
      <span style={{ fontSize: 11, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

/**
 * DoraDashWidget — Easter egg mini-game rendered as a GenUI widget in Dora's chat.
 * Player dodges falling "bugs" as the Messign pilot plane.
 */

import { useEffect, useState, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Trophy, Play, RotateCcw, Gamepad2, Clock, Zap, Target, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDoraDash } from '@/hooks/useDoraDash';
import { getAccessToken } from '@/lib/authToken';
import { API_ORIGIN } from '@/lib/api';

// ── Leaderboard types ───────────────────────────────────────────
interface LeaderboardEntry {
  userId: string;
  userName: string;
  avatar: string | null;
  score: number;
  durationMs: number;
  playedAt: string;
}

const MEDAL_COLORS = ['#fbbf24', '#94a3b8', '#d97706'];
const MEDAL_LABELS = ['1st', '2nd', '3rd'];

// ── Widget ──────────────────────────────────────────────────────
export function DoraDashWidget() {
  const navigate = useNavigate();
  const {
    canvasRef,
    gameState,
    score,
    elapsed,
    speedMultiplier,
    start,
    restart,
  } = useDoraDash();

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [isNewHigh, setIsNewHigh] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_ORIGIN}/api/game/leaderboard`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard || []);
      }
    } catch {
      // silent — leaderboard is non-critical
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Submit score on game over
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
          body: JSON.stringify({
            score,
            durationMs: Math.round(elapsed),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setLeaderboard(data.leaderboard || []);
          setIsNewHigh(data.isTopThree || false);
        }
      } catch {
        // silent
      } finally {
        setSubmitting(false);
      }
    };

    submit();
  }, [gameState]); // only trigger on state change

  const handleRestart = useCallback(() => {
    setIsNewHigh(false);
    restart();
  }, [restart]);

  return (
    <div
      className="dora-fade-up"
      style={{
        marginTop: 12,
        borderRadius: 'var(--dora-r-widget, 16px)',
        overflow: 'hidden',
        opacity: 0,
        animationDelay: '0.1s',
      }}
    >
      {/* Outer glow container */}
      <div
        className="dora-glass dora-glow-border"
        style={{
          borderRadius: 'var(--dora-r-widget, 16px)',
          padding: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Gamepad2 size={16} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div
              className="dora-font"
              style={{ fontSize: 14, fontWeight: 700, color: 'var(--dora-text-1, #f1f5f9)' }}
            >
              Dora Dash
            </div>
            <div style={{ fontSize: 11, color: 'var(--dora-text-3, #64748b)' }}>
              Dodge the bugs, survive as long as you can
            </div>
          </div>
          <button
            onClick={() => navigate('/dora/game')}
            title="Open full-screen game"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 8, border: 'none',
              background: 'rgba(59,130,246,0.12)',
              color: '#60a5fa', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <ExternalLink size={12} /> Full Screen
          </button>
        </div>

        {/* Main layout: canvas + leaderboard */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {/* Canvas area */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <canvas
              ref={canvasRef as React.RefObject<HTMLCanvasElement>}
              width={360}
              height={480}
              style={{
                display: 'block',
                borderRadius: 12,
                background: '#0f172a',
                border: '1px solid rgba(100,140,255,0.15)',
                width: 360,
                height: 480,
              }}
            />

            {/* Idle overlay */}
            {gameState === 'idle' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 12,
                  background: 'rgba(15,23,42,0.85)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 48,
                    lineHeight: 1,
                  }}
                >
                  ✈️
                </div>
                <div
                  className="dora-font"
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: '#f1f5f9',
                    textAlign: 'center',
                  }}
                >
                  Dora Dash
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#94a3b8',
                    textAlign: 'center',
                    maxWidth: 240,
                    lineHeight: 1.5,
                  }}
                >
                  Use arrow keys (or WASD) to dodge falling bugs in all directions.
                  Survive as long as you can!
                </div>
                <button
                  onClick={start}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 28px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    boxShadow: '0 0 20px rgba(59,130,246,0.3)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 0 30px rgba(59,130,246,0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(59,130,246,0.3)';
                  }}
                >
                  <Play size={16} />
                  Start Game
                </button>
              </div>
            )}

            {/* Game-over overlay */}
            {gameState === 'gameOver' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 12,
                  background: 'rgba(15,23,42,0.8)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  backdropFilter: 'blur(4px)',
                }}
              >
                {isNewHigh && (
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#fbbf24',
                      textTransform: 'uppercase',
                      letterSpacing: 2,
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }}
                  >
                    ★ New High Score! ★
                  </div>
                )}
                <div
                  className="dora-font"
                  style={{ fontSize: 26, fontWeight: 700, color: '#ef4444' }}
                >
                  Game Over
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
                  <StatBadge icon={Target} label="Score" value={String(score)} color="#60a5fa" />
                  <StatBadge
                    icon={Clock}
                    label="Time"
                    value={`${(elapsed / 1000).toFixed(1)}s`}
                    color="#a78bfa"
                  />
                  <StatBadge
                    icon={Zap}
                    label="Speed"
                    value={`${speedMultiplier.toFixed(1)}×`}
                    color="#f472b6"
                  />
                </div>
                <button
                  onClick={handleRestart}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 8,
                    padding: '10px 28px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    boxShadow: '0 0 20px rgba(59,130,246,0.3)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 0 30px rgba(59,130,246,0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(59,130,246,0.3)';
                  }}
                >
                  <RotateCcw size={16} />
                  Play Again
                </button>
              </div>
            )}
          </div>

          {/* Leaderboard panel */}
          <div
            className="dora-glass-light"
            style={{
              flex: '1 1 180px',
              minWidth: 180,
              borderRadius: 12,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                paddingBottom: 8,
                borderBottom: '1px solid rgba(100,140,255,0.1)',
              }}
            >
              <Trophy size={14} color="#fbbf24" />
              <span
                className="dora-font"
                style={{ fontSize: 13, fontWeight: 700, color: 'var(--dora-text-1, #f1f5f9)' }}
              >
                Top 3 Messign
              </span>
            </div>

            {leaderboard.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  color: 'var(--dora-text-3, #64748b)',
                  fontStyle: 'italic',
                  textAlign: 'center',
                  padding: '20px 0',
                }}
              >
                No scores yet — be the first!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {leaderboard.map((entry, i) => (
                  <div
                    key={`${entry.userId}-${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 10,
                      background: i === 0
                        ? 'rgba(251,191,36,0.08)'
                        : 'rgba(100,140,255,0.04)',
                      border: i === 0
                        ? '1px solid rgba(251,191,36,0.2)'
                        : '1px solid transparent',
                    }}
                  >
                    {/* Rank medal */}
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: MEDAL_COLORS[i] || '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 700,
                        color: i === 0 ? '#000' : '#fff',
                        flexShrink: 0,
                      }}
                    >
                      {MEDAL_LABELS[i]}
                    </div>

                    {/* Name + time */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        className="dora-font"
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--dora-text-1, #f1f5f9)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {entry.userName}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--dora-text-3, #64748b)' }}>
                        {(entry.durationMs / 1000).toFixed(1)}s survived
                      </div>
                    </div>

                    {/* Score */}
                    <div
                      className="dora-mono"
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: MEDAL_COLORS[i] || '#94a3b8',
                        flexShrink: 0,
                      }}
                    >
                      {entry.score}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* In-game HUD (external to canvas) */}
            {gameState === 'playing' && (
              <div
                style={{
                  marginTop: 'auto',
                  paddingTop: 10,
                  borderTop: '1px solid rgba(100,140,255,0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <HudRow icon={Target} label="Score" value={String(score)} />
                <HudRow icon={Zap} label="Speed" value={`${speedMultiplier.toFixed(1)}×`} />
                <HudRow icon={Clock} label="Time" value={`${(elapsed / 1000).toFixed(1)}s`} />
              </div>
            )}

            {/* Controls hint */}
            <div
              style={{
                marginTop: 'auto',
                paddingTop: 8,
                borderTop: '1px solid rgba(100,140,255,0.08)',
                fontSize: 10,
                color: 'var(--dora-text-3, #64748b)',
                lineHeight: 1.6,
              }}
            >
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                <kbd style={kbdStyle}>↑</kbd>
                <kbd style={kbdStyle}>↓</kbd>
                <kbd style={kbdStyle}>←</kbd>
                <kbd style={kbdStyle}>→</kbd>
                <span>or</span>
                <kbd style={kbdStyle}>W</kbd>
                <kbd style={kbdStyle}>A</kbd>
                <kbd style={kbdStyle}>S</kbd>
                <kbd style={kbdStyle}>D</kbd>
                <span>to move</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function StatBadge({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <Icon size={16} color={color} />
      <div
        className="dora-mono"
        style={{ fontSize: 16, fontWeight: 700, color, marginTop: 2 }}
      >
        {value}
      </div>
      <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
    </div>
  );
}

function HudRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Icon size={12} color="#64748b" />
      <span style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>{label}</span>
      <span className="dora-mono" style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
        {value}
      </span>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 5px',
  borderRadius: 4,
  background: 'rgba(100,140,255,0.08)',
  border: '1px solid rgba(100,140,255,0.15)',
  fontSize: 10,
  fontFamily: 'monospace',
  color: '#94a3b8',
};

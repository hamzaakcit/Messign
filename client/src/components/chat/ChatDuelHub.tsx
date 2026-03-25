import { useCallback, useEffect, useState } from 'react';
import {
  X,
  Swords,
  CircleDot,
  Target,
  ListChecks,
  MessageSquareText,
  Loader2,
  Copy,
  RotateCcw,
  Sparkles,
  Users,
} from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { chatAPI, fetchAPI } from '@/lib/api';
import { hashRpsCommitment, generateDuelSalt } from '@/lib/duelCommit';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type {
  ChatRpsMove,
  ChatRpsDuelResult,
  ChatRpsTwoPlayerDuelResult,
  ChatCoinDuelResult,
  ChatChamberDuelResult,
} from '@/types';

type DuelTab = 'rps' | 'coin' | 'chamber';
type RpsSubMode = 'house' | 'twoplayer';
type TwoPlayerPhase = 'idle' | 'waiting_opponent' | 'awaiting_reveal' | 'done';

interface ChannelDuelHistory {
  rps?: ChatRpsDuelResult;
  rpsTwoPlayer?: ChatRpsTwoPlayerDuelResult;
  coin?: ChatCoinDuelResult;
  chamber?: ChatChamberDuelResult;
  lastRpsMove?: ChatRpsMove;
  lastCoinCall?: 'heads' | 'tails';
  lastChamberPick?: number;
}

function duelStorageKey(channelId: string): string {
  return `messign-chat-duel-history-${channelId}`;
}

function loadHistory(channelId: string): ChannelDuelHistory {
  try {
    const raw = localStorage.getItem(duelStorageKey(channelId));
    if (!raw) return {};
    return JSON.parse(raw) as ChannelDuelHistory;
  } catch {
    return {};
  }
}

function saveHistory(channelId: string, h: ChannelDuelHistory): void {
  try {
    localStorage.setItem(duelStorageKey(channelId), JSON.stringify(h));
  } catch {
    /* ignore quota */
  }
}

export function ChatDuelHub() {
  const duelHubOpen = useChatStore((s) => s.duelHubOpen);
  const setDuelHubOpen = useChatStore((s) => s.setDuelHubOpen);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const channels = useChatStore((s) => s.channels);
  const requestComposerInsert = useChatStore((s) => s.requestComposerInsert);
  const currentUserId = useAuthStore((s) => s.user?.id) ?? null;

  const [tab, setTab] = useState<DuelTab>('rps');
  const [rpsSubMode, setRpsSubMode] = useState<RpsSubMode>('house');
  const [loading, setLoading] = useState(false);
  const [rpsResult, setRpsResult] = useState<ChatRpsDuelResult | null>(null);
  const [twoPlayerResult, setTwoPlayerResult] = useState<ChatRpsTwoPlayerDuelResult | null>(null);
  const [tpPhase, setTpPhase] = useState<TwoPlayerPhase>('idle');
  const [tpPickMove, setTpPickMove] = useState<ChatRpsMove | null>(null);
  const [tpSalt, setTpSalt] = useState<string | null>(null);
  const [tpInviteId, setTpInviteId] = useState<string | null>(null);
  const [joinInviteInput, setJoinInviteInput] = useState('');
  const [opponentPick, setOpponentPick] = useState<ChatRpsMove | null>(null);
  const [coinResult, setCoinResult] = useState<ChatCoinDuelResult | null>(null);
  const [chamberResult, setChamberResult] = useState<ChatChamberDuelResult | null>(null);
  const [pickedChamber, setPickedChamber] = useState<number | null>(null);
  const [lastHistory, setLastHistory] = useState<ChannelDuelHistory>({});

  const syncHistory = useCallback(() => {
    if (activeChannelId) setLastHistory(loadHistory(activeChannelId));
  }, [activeChannelId]);

  useEffect(() => {
    syncHistory();
  }, [syncHistory, duelHubOpen]);

  useEffect(() => {
    if (!duelHubOpen || !activeChannelId || !tpInviteId || tpPhase !== 'waiting_opponent') return;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const st = await chatAPI.chatDuelRpsTwoPlayerStatus(activeChannelId, tpInviteId);
          if (st.status === 'awaiting_reveal') {
            setTpPhase('awaiting_reveal');
          }
          if (st.status === 'expired' || st.status === 'not_found') {
            toast.error('This invite expired or was cleared.');
            setTpPhase('idle');
            setTpInviteId(null);
            setTpSalt(null);
            setTpPickMove(null);
          }
        } catch {
          /* ignore transient errors */
        }
      })();
    }, 2500);
    return () => window.clearInterval(id);
  }, [duelHubOpen, activeChannelId, tpInviteId, tpPhase]);

  const resetTwoPlayer = useCallback(() => {
    setTpPhase('idle');
    setTpPickMove(null);
    setTpSalt(null);
    setTpInviteId(null);
    setJoinInviteInput('');
    setOpponentPick(null);
    setTwoPlayerResult(null);
  }, []);

  if (!duelHubOpen || !activeChannelId) return null;

  const channelName = channels.find((c) => c.id === activeChannelId)?.name ?? 'channel';

  const persistHistory = (partial: Partial<ChannelDuelHistory>) => {
    const next = { ...loadHistory(activeChannelId), ...partial };
    saveHistory(activeChannelId, next);
    setLastHistory(next);
  };

  const close = () => {
    setDuelHubOpen(false);
    setRpsResult(null);
    setTwoPlayerResult(null);
    setCoinResult(null);
    setChamberResult(null);
    setPickedChamber(null);
    setRpsSubMode('house');
    resetTwoPlayer();
  };

  const shareToComposer = (line: string) => {
    requestComposerInsert(line);
    toast.success('Added to your draft — send when ready');
  };

  const copySummary = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied summary');
    } catch {
      toast.error('Could not copy');
    }
  };

  const createFollowUpTask = async (title: string) => {
    try {
      await fetchAPI('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: title.slice(0, 200),
          description: `Created from channel duel in #${channelName}`,
          priority: 'medium',
          status: 'todo',
        }),
      });
      await chatAPI.awardChatXP(activeChannelId, 'chat.task.created_from_chat').catch(() => {});
      toast.success('Task created from duel');
    } catch {
      toast.error('Could not create task');
    }
  };

  const formatRpsSummary = (r: ChatRpsDuelResult) =>
    `[Duel RPS #${channelName}] ${r.headline} — You: ${r.you}, house: ${r.house} (${r.outcome}). v${r.metadata?.seedVersion ?? '1'}`;

  const formatCoinSummary = (r: ChatCoinDuelResult) =>
    `[Duel coin #${channelName}] ${r.headline} — Called ${r.call}, landed ${r.result}. v${r.metadata?.seedVersion ?? '1'}`;

  const formatChamberSummary = (r: ChatChamberDuelResult) =>
    `[Duel chamber #${channelName}] ${r.headline} — Picked ${r.yourChamber}, dart slot ${r.dangerChamber}. v${r.metadata?.seedVersion ?? '1'}`;

  const formatTwoPlayerSummary = (r: ChatRpsTwoPlayerDuelResult) =>
    `[Duel RPS 2p #${channelName}] ${r.headline} — Moves: ${r.challengerMove} vs ${r.opponentMove}. v${r.metadata?.seedVersion ?? '1'}`;

  const sealTwoPlayerInvite = async () => {
    if (!tpPickMove || !activeChannelId) {
      toast.error('Pick rock, paper, or scissors first');
      return;
    }
    setLoading(true);
    try {
      const salt = generateDuelSalt();
      const commitmentHex = await hashRpsCommitment(tpPickMove, salt);
      const out = await chatAPI.chatDuelRpsTwoPlayerInvite(activeChannelId, commitmentHex);
      setTpSalt(salt);
      setTpInviteId(out.inviteId);
      setTpPhase('waiting_opponent');
      toast.success('Invite sealed — share the ID with your opponent');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create invite');
    } finally {
      setLoading(false);
    }
  };

  const copyInviteId = async () => {
    if (!tpInviteId) return;
    await copySummary(tpInviteId);
  };

  const joinTwoPlayer = async () => {
    const id = joinInviteInput.trim();
    if (!id || !opponentPick || !activeChannelId) {
      toast.error('Paste invite ID and pick your move');
      return;
    }
    setLoading(true);
    try {
      await chatAPI.chatDuelRpsTwoPlayerJoin(activeChannelId, id, opponentPick);
      toast.success('You’re in — challenger will reveal to finish');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not join');
    } finally {
      setLoading(false);
    }
  };

  const revealTwoPlayer = async () => {
    if (!tpInviteId || !tpPickMove || !tpSalt || !activeChannelId) {
      toast.error('Missing sealed move — start a new invite');
      return;
    }
    setLoading(true);
    try {
      const out = await chatAPI.chatDuelRpsTwoPlayerReveal(activeChannelId, tpInviteId, tpPickMove, tpSalt);
      setTwoPlayerResult(out);
      setTpPhase('done');
      persistHistory({ rpsTwoPlayer: out });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reveal failed');
    } finally {
      setLoading(false);
    }
  };

  const runRps = async (move: ChatRpsMove) => {
    setLoading(true);
    setRpsResult(null);
    try {
      const out = await chatAPI.chatDuelRps(activeChannelId, move);
      setRpsResult(out);
      persistHistory({ rps: out, lastRpsMove: move });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'RPS failed');
    } finally {
      setLoading(false);
    }
  };

  const runCoin = async (call: 'heads' | 'tails') => {
    setLoading(true);
    setCoinResult(null);
    try {
      const out = await chatAPI.chatDuelCoin(activeChannelId, call);
      setCoinResult(out);
      persistHistory({ coin: out, lastCoinCall: call });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Coin flip failed');
    } finally {
      setLoading(false);
    }
  };

  const runChamber = async (chamberOverride?: number) => {
    const slot = chamberOverride ?? pickedChamber;
    if (slot == null) {
      toast.error('Pick a chamber (1–6) first');
      return;
    }
    setLoading(true);
    setChamberResult(null);
    try {
      const out = await chatAPI.chatDuelChamber(activeChannelId, slot);
      setChamberResult(out);
      persistHistory({ chamber: out, lastChamberPick: slot });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Chamber duel failed');
    } finally {
      setLoading(false);
    }
  };

  const rematchRps = () => {
    const m = lastHistory.lastRpsMove ?? rpsResult?.you;
    if (m) void runRps(m);
  };

  const rematchCoin = () => {
    const c = lastHistory.lastCoinCall ?? coinResult?.call;
    if (c) void runCoin(c);
  };

  const rematchChamber = () => {
    const n = lastHistory.lastChamberPick ?? pickedChamber ?? chamberResult?.yourChamber;
    if (n != null) {
      setPickedChamber(n);
      void runChamber(n);
    }
  };

  const onTabChange = (id: DuelTab) => {
    setTab(id);
    setRpsResult(null);
    setTwoPlayerResult(null);
    setCoinResult(null);
    setChamberResult(null);
    setPickedChamber(null);
    setRpsSubMode('house');
    resetTwoPlayer();
  };

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm pointer-events-auto"
        aria-label="Close duels"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="duel-hub-title"
        className={cn(
          'relative pointer-events-auto w-full max-w-lg rounded-3xl border border-app/90 bg-app-sidebar shadow-2xl overflow-hidden',
          'animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none',
        )}
      >
        <div className="px-5 py-4 border-b border-app flex items-center justify-between bg-gradient-to-r from-violet-500/15 via-app-sidebar to-primary-500/12">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-500/20 ring-1 ring-violet-400/30">
              <Swords className="w-5 h-5 text-violet-300" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="duel-hub-title" className="text-base font-semibold text-app truncate">
                Channel duels
              </h2>
              <p className="text-[11px] text-app-muted truncate">#{channelName} · server RNG · v1</p>
            </div>
          </div>
          <button type="button" onClick={close} className="p-2 rounded-xl text-app-muted hover:text-app hover:bg-app-hover shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {(lastHistory.rps || lastHistory.rpsTwoPlayer || lastHistory.coin || lastHistory.chamber) && (
          <div className="px-5 py-2.5 border-b border-app bg-app-bg/40 text-[11px] text-app-muted">
            <span className="font-medium text-app/90">Last in this channel: </span>
            {lastHistory.rps && <span className="mr-2">RPS {lastHistory.rps.outcome}</span>}
            {lastHistory.rpsTwoPlayer && (
              <span className="mr-2">
                RPS 2p {lastHistory.rpsTwoPlayer.winnerUserId ? 'decided' : 'draw'}
              </span>
            )}
            {lastHistory.coin && <span className="mr-2">Coin {lastHistory.coin.youWin ? 'won' : 'lost'}</span>}
            {lastHistory.chamber && <span>Chamber {lastHistory.chamber.hit ? 'tagged' : 'safe'}</span>}
          </div>
        )}

        <p className="px-5 py-3 text-xs text-app-muted leading-relaxed border-b border-app/80">
          Fair random picks on the server. Use for decisions, chores, or bragging rights — then share to the channel or spin up a follow-up task.
        </p>

        <div className="flex border-b border-app bg-app-bg/30">
          {(
            [
              ['rps', 'RPS', 'Rock · paper · scissors vs house', Swords],
              ['coin', 'Coin', 'Binary calls with a server flip', CircleDot],
              ['chamber', 'Chamber', 'Pick 1–6, one dart slot', Target],
            ] as const
          ).map(([id, label, hint, Icon]) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              onClick={() => onTabChange(id)}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-3 px-1 text-center transition-colors',
                tab === id ? 'text-primary-300 bg-primary-500/10 border-b-2 border-primary-400' : 'text-app-muted hover:text-app hover:bg-app-hover/80',
              )}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden />
              <span className="text-xs font-semibold">{label}</span>
              <span className="hidden sm:block text-[10px] leading-tight text-app-muted/90 px-1">{hint}</span>
            </button>
          ))}
        </div>

        <div className="p-5 min-h-[220px]">
          {tab === 'rps' && (
            <div className="space-y-4">
              <div className="flex rounded-xl border border-app p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setRpsSubMode('house');
                    resetTwoPlayer();
                  }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors',
                    rpsSubMode === 'house' ? 'bg-primary-500/15 text-primary-300' : 'text-app-muted hover:text-app',
                  )}
                >
                  <Swords className="w-3.5 h-3.5" aria-hidden /> vs house
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRpsSubMode('twoplayer');
                    setRpsResult(null);
                    resetTwoPlayer();
                  }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors',
                    rpsSubMode === 'twoplayer' ? 'bg-violet-500/15 text-violet-200' : 'text-app-muted hover:text-app',
                  )}
                >
                  <Users className="w-3.5 h-3.5" aria-hidden /> 2 players
                </button>
              </div>

              {rpsSubMode === 'house' && (
                <>
                  <p className="text-sm text-app-muted">Play rock-paper-scissors vs the house.</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['rock', 'paper', 'scissors'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={loading}
                        onClick={() => runRps(m)}
                        className="py-3.5 rounded-2xl border border-app bg-app-bg hover:bg-app-hover text-sm font-medium text-app capitalize disabled:opacity-50 transition-colors"
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  {loading && rpsSubMode === 'house' && (
                    <div className="flex items-center justify-center gap-2 text-app-muted text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Playing…
                    </div>
                  )}
                  {rpsResult && !loading && rpsSubMode === 'house' && (
                    <div className="rounded-2xl border border-app/80 bg-app-bg/90 p-4 text-sm space-y-3 shadow-inner ring-1 ring-primary-500/15 motion-reduce:ring-0">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-primary-300 motion-reduce:opacity-90">
                        <Sparkles className="w-3.5 h-3.5 motion-reduce:scale-100" aria-hidden /> Outcome
                      </div>
                      <p className="text-base font-semibold text-app leading-snug">{rpsResult.headline}</p>
                      <p className="text-app-muted text-xs">
                        You: {rpsResult.you} · House: {rpsResult.house} · {rpsResult.outcome}
                      </p>
                      <p className="text-xs text-app-muted/90">{rpsResult.taskHint}</p>
                      <p className="text-[10px] text-app-muted/70">
                        Mode {rpsResult.metadata?.modeId ?? 'rps'} · seed {rpsResult.metadata?.seedVersion ?? '1'}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => shareToComposer(formatRpsSummary(rpsResult))}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-app-muted hover:text-app hover:bg-app-hover"
                        >
                          <MessageSquareText className="w-3.5 h-3.5" /> Share to composer
                        </button>
                        <button
                          type="button"
                          onClick={() => copySummary(formatRpsSummary(rpsResult))}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-app-muted hover:text-app hover:bg-app-hover"
                        >
                          <Copy className="w-3.5 h-3.5" /> Copy summary
                        </button>
                        <button
                          type="button"
                          onClick={rematchRps}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-primary-300 hover:bg-primary-500/10"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Rematch
                        </button>
                        <button
                          type="button"
                          onClick={() => createFollowUpTask(`Duel: RPS ${rpsResult.outcome} in #${channelName}`)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-primary-400 hover:text-primary-300"
                        >
                          <ListChecks className="w-3.5 h-3.5" /> Create task
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {rpsSubMode === 'twoplayer' && (
                <div className="space-y-4">
                  <p className="text-sm text-app-muted leading-relaxed">
                    Challenger picks a move and seals it (commit–reveal). Share the invite ID with someone else in this channel — they join, then you reveal to finish.
                  </p>

                  <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-violet-200/90 uppercase tracking-wide">Challenger</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(['rock', 'paper', 'scissors'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          disabled={loading || tpPhase === 'waiting_opponent' || tpPhase === 'awaiting_reveal'}
                          onClick={() => setTpPickMove(m)}
                          className={cn(
                            'py-2.5 rounded-xl border text-sm font-medium capitalize transition-colors',
                            tpPickMove === m
                              ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                              : 'border-app bg-app-bg text-app-muted hover:text-app',
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                    {tpPhase === 'idle' && (
                      <button
                        type="button"
                        disabled={loading || !tpPickMove}
                        onClick={() => void sealTwoPlayerInvite()}
                        className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold disabled:opacity-50"
                      >
                        Seal & create invite
                      </button>
                    )}
                    {(tpPhase === 'waiting_opponent' || tpPhase === 'awaiting_reveal') && tpInviteId && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-app-muted">Invite ID (send to opponent)</p>
                        <div className="flex gap-2">
                          <code className="flex-1 text-[11px] truncate rounded-lg bg-app-bg px-2 py-1.5 border border-app text-app">{tpInviteId}</code>
                          <button type="button" onClick={() => void copyInviteId()} className="shrink-0 px-2 rounded-lg border border-app text-xs text-app-muted hover:text-app">
                            Copy
                          </button>
                        </div>
                        {tpPhase === 'waiting_opponent' && (
                          <p className="text-[11px] text-app-muted">Waiting for opponent to join…</p>
                        )}
                        {tpPhase === 'awaiting_reveal' && (
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => void revealTwoPlayer()}
                            className="w-full py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold disabled:opacity-50"
                          >
                            Reveal & finish
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-app bg-app-bg/40 p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-app-muted uppercase tracking-wide">Opponent</p>
                    <input
                      type="text"
                      value={joinInviteInput}
                      onChange={(e) => setJoinInviteInput(e.target.value)}
                      placeholder="Paste invite ID"
                      className="w-full rounded-lg border border-app bg-app-bg px-3 py-2 text-sm text-app placeholder:text-app-muted"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      {(['rock', 'paper', 'scissors'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          disabled={loading}
                          onClick={() => setOpponentPick(m)}
                          className={cn(
                            'py-2 rounded-lg border text-xs font-medium capitalize',
                            opponentPick === m ? 'border-primary-400 bg-primary-500/15' : 'border-app bg-app-bg',
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void joinTwoPlayer()}
                      className="w-full py-2 rounded-xl border border-app bg-app-hover/80 text-sm font-medium text-app hover:bg-app-hover"
                    >
                      Join with my move
                    </button>
                  </div>

                  {loading && rpsSubMode === 'twoplayer' && (
                    <div className="flex items-center justify-center gap-2 text-app-muted text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Working…
                    </div>
                  )}

                  {twoPlayerResult && tpPhase === 'done' && (
                    <div className="rounded-2xl border border-app/80 bg-app-bg/90 p-4 text-sm space-y-3 shadow-inner">
                      <p className="text-base font-semibold text-app">{twoPlayerResult.headline}</p>
                      <p className="text-app-muted text-xs">
                        Challenger: {twoPlayerResult.challengerMove} · Opponent: {twoPlayerResult.opponentMove}
                      </p>
                      <p className="text-xs text-app-muted/90">
                        {twoPlayerResult.winnerUserId == null
                          ? 'Draw — no sole winner.'
                          : currentUserId && twoPlayerResult.winnerUserId === currentUserId
                            ? 'You took this round.'
                            : 'The other player took this round.'}
                      </p>
                      <p className="text-xs text-app-muted/80">{twoPlayerResult.taskHint}</p>
                      <p className="text-[10px] text-app-muted/70">
                        Mode {twoPlayerResult.metadata?.modeId ?? 'rps_two_player'} · seed {twoPlayerResult.metadata?.seedVersion ?? '1'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => shareToComposer(formatTwoPlayerSummary(twoPlayerResult))}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-app-muted hover:text-app hover:bg-app-hover"
                        >
                          <MessageSquareText className="w-3.5 h-3.5" /> Share to composer
                        </button>
                        <button
                          type="button"
                          onClick={() => copySummary(formatTwoPlayerSummary(twoPlayerResult))}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-app-muted hover:text-app hover:bg-app-hover"
                        >
                          <Copy className="w-3.5 h-3.5" /> Copy summary
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            resetTwoPlayer();
                            setTpPickMove(null);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-primary-300 hover:bg-primary-500/10"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> New 2p duel
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            createFollowUpTask(`Duel: RPS 2p in #${channelName}`)
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-primary-400 hover:text-primary-300"
                        >
                          <ListChecks className="w-3.5 h-3.5" /> Create task
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'coin' && (
            <div className="space-y-4">
              <p className="text-sm text-app-muted">Call heads or tails — server flips.</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => runCoin('heads')}
                  className="py-3.5 rounded-2xl border border-app bg-app-bg hover:bg-app-hover text-sm font-medium disabled:opacity-50"
                >
                  Heads
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => runCoin('tails')}
                  className="py-3.5 rounded-2xl border border-app bg-app-bg hover:bg-app-hover text-sm font-medium disabled:opacity-50"
                >
                  Tails
                </button>
              </div>
              {loading && (
                <div className="flex items-center justify-center gap-2 text-app-muted text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Flipping…
                </div>
              )}
              {coinResult && !loading && (
                <div className="rounded-2xl border border-app/80 bg-app-bg/90 p-4 text-sm space-y-3 shadow-inner">
                  <p className="text-base font-semibold text-app">{coinResult.headline}</p>
                  <p className="text-app-muted text-xs">
                    Call: {coinResult.call} · Result: {coinResult.result}
                  </p>
                  <p className="text-[10px] text-app-muted/70">
                    Mode {coinResult.metadata?.modeId ?? 'coin'} · seed {coinResult.metadata?.seedVersion ?? '1'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => shareToComposer(formatCoinSummary(coinResult))}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-app-muted hover:text-app hover:bg-app-hover"
                    >
                      <MessageSquareText className="w-3.5 h-3.5" /> Share to composer
                    </button>
                    <button
                      type="button"
                      onClick={() => copySummary(formatCoinSummary(coinResult))}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-app-muted hover:text-app hover:bg-app-hover"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy summary
                    </button>
                    <button type="button" onClick={rematchCoin} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-300 hover:bg-primary-500/10 rounded-lg px-2 py-1.5">
                      <RotateCcw className="w-3.5 h-3.5" /> Rematch
                    </button>
                    <button
                      type="button"
                      onClick={() => createFollowUpTask(`Duel: coin ${coinResult.youWin ? 'won' : 'lost'} in #${channelName}`)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-400 hover:text-primary-300 rounded-lg px-2 py-1.5"
                    >
                      <ListChecks className="w-3.5 h-3.5" /> Create task
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'chamber' && (
            <div className="space-y-4">
              <p className="text-sm text-app-muted">
                Pick chamber 1–6, then pull. One slot is the foam dart — match it and you&apos;re the channel&apos;s task hero (playful).
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={loading}
                    onClick={() => setPickedChamber(n)}
                    className={cn(
                      'py-2.5 rounded-xl border text-sm font-semibold transition-colors',
                      pickedChamber === n
                        ? 'border-violet-500 bg-violet-500/15 text-violet-200'
                        : 'border-app bg-app-bg text-app-muted hover:text-app hover:bg-app-hover',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={loading || pickedChamber == null}
                onClick={() => void runChamber()}
                className="w-full py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {loading ? 'Pulling…' : 'Pull my chamber'}
              </button>
              {loading && (
                <div className="flex items-center justify-center gap-2 text-app-muted text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                </div>
              )}
              {chamberResult && !loading && (
                <div className="rounded-2xl border border-app/80 bg-app-bg/90 p-4 text-sm space-y-3 shadow-inner">
                  <p className="text-base font-semibold text-app">{chamberResult.headline}</p>
                  <p className="text-app-muted text-xs">
                    You: {chamberResult.yourChamber} · Dart slot: {chamberResult.dangerChamber} · {chamberResult.hit ? 'Tagged' : 'Clear'}
                  </p>
                  <p className="text-[10px] text-app-muted/70">
                    Mode {chamberResult.metadata?.modeId ?? 'chamber'} · seed {chamberResult.metadata?.seedVersion ?? '1'}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => shareToComposer(formatChamberSummary(chamberResult))}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-app-muted hover:text-app rounded-lg px-2 py-1.5 hover:bg-app-hover"
                    >
                      <MessageSquareText className="w-3.5 h-3.5" /> Share to composer
                    </button>
                    <button
                      type="button"
                      onClick={() => copySummary(formatChamberSummary(chamberResult))}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-app-muted hover:text-app rounded-lg px-2 py-1.5 hover:bg-app-hover"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy summary
                    </button>
                    <button
                      type="button"
                      onClick={rematchChamber}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-300 hover:bg-primary-500/10 rounded-lg px-2 py-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Rematch
                    </button>
                    <button
                      type="button"
                      onClick={() => createFollowUpTask(`Duel: chamber ${chamberResult.hit ? 'hit' : 'safe'} in #${channelName}`)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-400 hover:text-primary-300 rounded-lg px-2 py-1.5"
                    >
                      <ListChecks className="w-3.5 h-3.5" /> Create task
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-app bg-app-hover/20 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => shareToComposer(`Anyone up for a channel duel? Open Duels in the chat header. #${channelName}`)}
            className="inline-flex items-center gap-1.5 text-xs text-app-muted hover:text-app rounded-lg px-2 py-1.5 hover:bg-app-hover"
          >
            <MessageSquareText className="w-3.5 h-3.5" /> Invite line → draft
          </button>
        </div>
      </div>
    </div>
  );
}

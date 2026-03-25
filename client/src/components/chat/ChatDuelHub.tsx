import { useState } from 'react';
import { X, Swords, CircleDot, Target, ListChecks, MessageSquareText, Loader2 } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { chatAPI, fetchAPI } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ChatRpsMove, ChatRpsDuelResult, ChatCoinDuelResult, ChatChamberDuelResult } from '@/types';

type DuelTab = 'rps' | 'coin' | 'chamber';

export function ChatDuelHub() {
  const duelHubOpen = useChatStore((s) => s.duelHubOpen);
  const setDuelHubOpen = useChatStore((s) => s.setDuelHubOpen);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const channels = useChatStore((s) => s.channels);
  const requestComposerInsert = useChatStore((s) => s.requestComposerInsert);

  const [tab, setTab] = useState<DuelTab>('rps');
  const [loading, setLoading] = useState(false);
  const [rpsResult, setRpsResult] = useState<ChatRpsDuelResult | null>(null);
  const [coinResult, setCoinResult] = useState<ChatCoinDuelResult | null>(null);
  const [chamberResult, setChamberResult] = useState<ChatChamberDuelResult | null>(null);
  const [pickedChamber, setPickedChamber] = useState<number | null>(null);

  if (!duelHubOpen || !activeChannelId) return null;

  const channelName = channels.find((c) => c.id === activeChannelId)?.name ?? 'channel';

  const close = () => {
    setDuelHubOpen(false);
    setRpsResult(null);
    setCoinResult(null);
    setChamberResult(null);
    setPickedChamber(null);
  };

  const shareToComposer = (line: string) => {
    requestComposerInsert(line);
    toast.success('Added to your draft — send when ready');
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

  const runRps = async (move: ChatRpsMove) => {
    setLoading(true);
    setRpsResult(null);
    try {
      const out = await chatAPI.chatDuelRps(activeChannelId, move);
      setRpsResult(out);
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Coin flip failed');
    } finally {
      setLoading(false);
    }
  };

  const runChamber = async () => {
    if (pickedChamber == null) {
      toast.error('Pick a chamber (1–6) first');
      return;
    }
    setLoading(true);
    setChamberResult(null);
    try {
      const out = await chatAPI.chatDuelChamber(activeChannelId, pickedChamber);
      setChamberResult(out);
      shareToComposer(
        `🎯 Chamber duel: picked ${out.yourChamber}, danger was ${out.dangerChamber}. ${out.headline} #${channelName}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Chamber duel failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-label="Close duels" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="duel-hub-title"
        className="relative w-full max-w-md bg-app-sidebar border border-app rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-app flex items-center justify-between bg-gradient-to-r from-violet-500/10 to-primary-500/10">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-violet-400" aria-hidden />
            <h2 id="duel-hub-title" className="text-sm font-semibold text-app">
              Channel duels
            </h2>
          </div>
          <button type="button" onClick={close} className="p-1 rounded-lg text-app-muted hover:text-app" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="px-4 py-2 text-[11px] text-app-muted border-b border-app">
          Fair random picks on the server. Use for decisions, chores, or bragging rights — optional task when someone “owes” the channel.
        </p>

        <div className="flex border-b border-app">
          {([
            ['rps', 'RPS', Swords],
            ['coin', 'Coin', CircleDot],
            ['chamber', 'Chamber', Target],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
                tab === id ? 'text-primary-400 bg-primary-500/10 border-b-2 border-primary-500' : 'text-app-muted hover:text-app hover:bg-app-hover',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 min-h-[200px]">
          {tab === 'rps' && (
            <div className="space-y-4">
              <p className="text-sm text-app-muted">Play rock-paper-scissors vs the house. Winner assigns a tiny favor (or create a task).</p>
              <div className="grid grid-cols-3 gap-2">
                {(['rock', 'paper', 'scissors'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={loading}
                    onClick={() => runRps(m)}
                    className="py-3 rounded-xl border border-app bg-app-bg hover:bg-app-hover text-sm font-medium text-app capitalize disabled:opacity-50"
                  >
                    {m}
                  </button>
                ))}
              </div>
              {loading && (
                <div className="flex items-center justify-center gap-2 text-app-muted text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Playing…
                </div>
              )}
              {rpsResult && !loading && (
                <div className="rounded-xl border border-app bg-app-bg p-3 text-sm space-y-2">
                  <p className="font-medium text-app">{rpsResult.headline}</p>
                  <p className="text-app-muted text-xs">
                    You: {rpsResult.you} · House: {rpsResult.house} · {rpsResult.outcome}
                  </p>
                  <p className="text-xs text-app-muted">{rpsResult.taskHint}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        shareToComposer(
                          `🪨 Duel (RPS): ${rpsResult.headline} — I played ${rpsResult.you}, house ${rpsResult.house} (${rpsResult.outcome}). #${channelName}`,
                        )
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-app-muted hover:text-app"
                    >
                      <MessageSquareText className="w-3.5 h-3.5" /> Share to composer
                    </button>
                    <button
                      type="button"
                      onClick={() => createFollowUpTask(`Duel: RPS ${rpsResult.outcome} in #${channelName}`)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-400 hover:text-primary-300"
                    >
                      <ListChecks className="w-3.5 h-3.5" /> Create task
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'coin' && (
            <div className="space-y-4">
              <p className="text-sm text-app-muted">Call heads or tails — server flips a coin.</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => runCoin('heads')}
                  className="py-3 rounded-xl border border-app bg-app-bg hover:bg-app-hover text-sm font-medium disabled:opacity-50"
                >
                  Heads
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => runCoin('tails')}
                  className="py-3 rounded-xl border border-app bg-app-bg hover:bg-app-hover text-sm font-medium disabled:opacity-50"
                >
                  Tails
                </button>
              </div>
              {loading && (
                <div className="flex items-center justify-center gap-2 text-app-muted text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Flipping…
                </div>
              )}
              {coinResult && !loading && (
                <div className="rounded-xl border border-app bg-app-bg p-3 text-sm space-y-2">
                  <p className="font-medium text-app">{coinResult.headline}</p>
                  <p className="text-app-muted text-xs">
                    Call: {coinResult.call} · Result: {coinResult.result}
                  </p>
                  <button
                    type="button"
                    onClick={() => createFollowUpTask(`Duel: coin ${coinResult.youWin ? 'won' : 'lost'} in #${channelName}`)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-400 hover:text-primary-300"
                  >
                    <ListChecks className="w-3.5 h-3.5" /> Create follow-up task
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'chamber' && (
            <div className="space-y-4">
              <p className="text-sm text-app-muted">
                Pick chamber 1–6, then pull. One random slot is the “foam dart” — if you match, you’re the channel’s task hero (playful, not real risk).
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={loading}
                    onClick={() => setPickedChamber(n)}
                    className={cn(
                      'py-2.5 rounded-lg border text-sm font-semibold transition-colors',
                      pickedChamber === n
                        ? 'border-violet-500 bg-violet-500/15 text-violet-300'
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
                onClick={runChamber}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {loading ? 'Pulling…' : 'Pull my chamber'}
              </button>
              {loading && (
                <div className="flex items-center justify-center gap-2 text-app-muted text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              )}
              {chamberResult && !loading && (
                <div className="rounded-xl border border-app bg-app-bg p-3 text-sm space-y-2">
                  <p className="font-medium text-app">{chamberResult.headline}</p>
                  <p className="text-app-muted text-xs">
                    You: {chamberResult.yourChamber} · Dart slot: {chamberResult.dangerChamber} · {chamberResult.hit ? 'Tagged' : 'Clear'}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        shareToComposer(
                          `🎯 Chamber duel: picked ${chamberResult.yourChamber}, dart slot ${chamberResult.dangerChamber}. ${chamberResult.headline} #${channelName}`,
                        )
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-app-muted hover:text-app"
                    >
                      <MessageSquareText className="w-3.5 h-3.5" /> Share to composer
                    </button>
                    <button
                      type="button"
                      onClick={() => createFollowUpTask(`Duel: chamber ${chamberResult.hit ? 'hit' : 'safe'} in #${channelName}`)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-400 hover:text-primary-300"
                    >
                      <ListChecks className="w-3.5 h-3.5" /> Create task
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-app bg-app-hover/30 flex justify-end">
          <button
            type="button"
            onClick={() => shareToComposer(`Anyone up for a channel duel? Open Duels in the chat header. #${channelName}`)}
            className="inline-flex items-center gap-1.5 text-xs text-app-muted hover:text-app"
          >
            <MessageSquareText className="w-3.5 h-3.5" /> Invite line → draft
          </button>
        </div>
      </div>
    </div>
  );
}

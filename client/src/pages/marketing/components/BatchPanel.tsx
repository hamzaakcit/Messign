import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Layers, Loader2 } from 'lucide-react';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { marketingAPI, type BatchJob, type ContentItem } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';
import {
  BATCH_CHANNELS,
  CHANNEL_LABELS,
  getDefaultSelectedChannels,
  getAtomizeButtonText,
  formatElapsedTime,
  getResultStatusHeader,
  getProgressPercentage,
} from '../lib/batchUtils';
import { BatchChannelRow } from './BatchChannelRow';

type PanelState = 'select' | 'processing' | 'results';

interface BatchPanelProps {
  heroContent: ContentItem;
  onClose: () => void;
}

export function BatchPanel({ heroContent, onClose }: BatchPanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [panelState, setPanelState] = useState<PanelState>('select');
  const [selectedChannels, setSelectedChannels] = useState<string[]>(
    getDefaultSelectedChannels(heroContent.channel || ''),
  );
  const [batchJob, setBatchJob] = useState<BatchJob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryingChannel, setRetryingChannel] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startElapsedTimer = useCallback((startedAt: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setElapsed(formatElapsedTime(startedAt));
    timerRef.current = setInterval(() => {
      setElapsed(formatElapsedTime(startedAt));
    }, 1000);
  }, []);

  const stopElapsedTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const toggleChannel = (channel: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channel)
        ? prev.filter((c) => c !== channel)
        : [...prev, channel],
    );
  };

  const allSelected = selectedChannels.length === BATCH_CHANNELS.length;

  const toggleAll = () => {
    setSelectedChannels(allSelected ? [] : [...BATCH_CHANNELS]);
  };

  const handleSubmit = async () => {
    if (selectedChannels.length === 0 || !userId) return;
    setIsSubmitting(true);
    try {
      const job = await marketingAPI.createBatchJob(
        userId,
        heroContent.id,
        selectedChannels,
      );
      setBatchJob(job);
      setPanelState('processing');

      if (job.started_at) startElapsedTimer(job.started_at);
      else startElapsedTimer(job.created_at);

      const final = await marketingAPI.pollBatchJob(userId, job.id, {
        onUpdate: (updated) => {
          setBatchJob(updated);
          if (updated.started_at && !timerRef.current) {
            startElapsedTimer(updated.started_at);
          }
        },
        intervalMs: 3000,
        timeoutMs: 5 * 60 * 1000,
      });

      setBatchJob(final);
      stopElapsedTimer();
      setPanelState('results');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start batch');
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!batchJob || !userId) return;
    try {
      const updated = await marketingAPI.cancelBatchJob(userId, batchJob.id);
      setBatchJob(updated);
      stopElapsedTimer();
      setPanelState('results');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to cancel batch',
      );
    }
  };

  const handleRetry = async (channel: string) => {
    if (!batchJob || !userId) return;
    setRetryingChannel(channel);
    try {
      const updated = await marketingAPI.retryBatchChannel(
        userId,
        batchJob.id,
        channel,
      );
      setBatchJob(updated);
      toast.success(`${CHANNEL_LABELS[channel] || channel} retried`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : `Retry failed for ${channel}`,
      );
    } finally {
      setRetryingChannel(null);
    }
  };

  const title =
    panelState === 'select'
      ? 'Atomize to Channels'
      : panelState === 'processing'
        ? 'Generating Content…'
        : 'Batch Results';

  return (
    <SlideOverPanel isOpen onClose={onClose} title={title} width={480}>
      <div className="flex flex-col h-full">
        {/* Hero preview */}
        <div className="px-5 pt-4 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="text-[13px] font-medium text-slate-200 truncate">
              {heroContent.title}
            </span>
          </div>
          {heroContent.body && (
            <p className="text-[11px] text-slate-500 line-clamp-2 ml-6">
              {heroContent.body.slice(0, 200)}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {panelState === 'select' && (
            <SelectState
              selectedChannels={selectedChannels}
              onToggle={toggleChannel}
              allSelected={allSelected}
              onToggleAll={toggleAll}
            />
          )}

          {panelState === 'processing' && batchJob && (
            <ProcessingState
              batchJob={batchJob}
              elapsed={elapsed}
            />
          )}

          {panelState === 'results' && batchJob && (
            <ResultsState
              batchJob={batchJob}
              elapsed={elapsed}
              retryingChannel={retryingChannel}
              onRetry={handleRetry}
            />
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-white/[0.06] px-5 py-3 flex items-center justify-end gap-2">
          {panelState === 'select' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-[12px] font-medium border border-white/[0.08] bg-app-surface-tertiary text-slate-200 hover:bg-app-hover transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedChannels.length === 0 || isSubmitting}
                onClick={() => void handleSubmit()}
                className="rounded-lg px-3 py-2 text-[12px] font-medium bg-purple-500 text-app-text hover:bg-purple-600 transition-colors disabled:opacity-40 flex items-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {getAtomizeButtonText(selectedChannels.length)}
              </button>
            </>
          )}

          {panelState === 'processing' && (
            <button
              type="button"
              onClick={() => void handleCancel()}
              className="rounded-lg px-3 py-2 text-[12px] font-medium border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Cancel Batch
            </button>
          )}

          {panelState === 'results' && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-[12px] font-medium bg-primary-500 text-app-text hover:bg-primary-600 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </SlideOverPanel>
  );
}

function SelectState({
  selectedChannels,
  onToggle,
  allSelected,
  onToggleAll,
}: {
  selectedChannels: string[];
  onToggle: (channel: string) => void;
  allSelected: boolean;
  onToggleAll: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] text-slate-400 uppercase tracking-wide">
          Target Channels
        </span>
        <button
          type="button"
          onClick={onToggleAll}
          className="text-[11px] text-primary-400 hover:text-primary-300 transition-colors"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {BATCH_CHANNELS.map((channel) => {
        const checked = selectedChannels.includes(channel);
        return (
          <label
            key={channel}
            className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-app-hover transition-colors"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(channel)}
              className="w-4 h-4 rounded border-app-border-strong bg-app-surface-tertiary text-purple-500 focus:ring-purple-500/30"
            />
            <span className="text-[13px] text-slate-200">
              {CHANNEL_LABELS[channel] || channel}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function ProcessingState({
  batchJob,
  elapsed,
}: {
  batchJob: BatchJob;
  elapsed: string;
}) {
  const pct = getProgressPercentage(
    batchJob.completed_channels + batchJob.failed_channels,
    batchJob.total_channels,
  );

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-slate-400">{pct}% complete</span>
          {elapsed && (
            <span className="text-[11px] text-slate-500">{elapsed}</span>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-app-surface-tertiary overflow-hidden">
          <div
            className="h-full rounded-full bg-purple-500 transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Channel rows */}
      <div className="rounded-lg border border-white/[0.06] bg-app-surface-tertiary divide-y divide-white/[0.04]">
        {batchJob.results.map((r) => (
          <BatchChannelRow
            key={r.channel}
            channel={r.channel}
            status={r.status}
            contentId={r.content_id}
            error={r.error}
          />
        ))}
      </div>
    </div>
  );
}

function ResultsState({
  batchJob,
  elapsed,
  retryingChannel,
  onRetry,
}: {
  batchJob: BatchJob;
  elapsed: string;
  retryingChannel: string | null;
  onRetry: (channel: string) => void;
}) {
  const header = getResultStatusHeader(batchJob.status);
  const colorMap: Record<string, string> = {
    green: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    gray: 'text-slate-400',
  };

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <span
          className={`text-[13px] font-medium ${colorMap[header.color] || 'text-slate-400'}`}
        >
          {header.text}
        </span>
        {elapsed && (
          <span className="text-[11px] text-slate-500">{elapsed}</span>
        )}
      </div>

      {/* Summary row */}
      <div className="flex gap-3 text-[11px]">
        <span className="text-slate-400">
          {batchJob.total_channels} total
        </span>
        {batchJob.completed_channels > 0 && (
          <span className="text-emerald-400">
            {batchJob.completed_channels} done
          </span>
        )}
        {batchJob.failed_channels > 0 && (
          <span className="text-red-400">
            {batchJob.failed_channels} failed
          </span>
        )}
      </div>

      {/* Channel rows */}
      <div className="rounded-lg border border-white/[0.06] bg-app-surface-tertiary divide-y divide-white/[0.04]">
        {batchJob.results.map((r) => (
          <BatchChannelRow
            key={r.channel}
            channel={r.channel}
            status={r.status}
            contentId={r.content_id}
            error={r.error}
            onRetry={() => onRetry(r.channel)}
            isRetrying={retryingChannel === r.channel}
          />
        ))}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, BarChart3, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import {
  marketingAPI,
  type PerformanceRecord,
  type CalibrationPromptResponse,
} from '@/lib/marketingApi';

interface CampaignMetricsPanelProps {
  contentId: string;
  userId: string;
  channel?: string;
  subjectLine?: string;
}

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500';

function toDecimal(pct: number): number {
  return pct / 100;
}

function toPercent(dec: number | null | undefined): string {
  if (dec === null || dec === undefined) return '—';
  return `${(dec * 100).toFixed(1)}%`;
}

export function CampaignMetricsPanel({
  contentId,
  userId,
  channel = 'email',
  subjectLine,
}: CampaignMetricsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PerformanceRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [openRate, setOpenRate] = useState('');
  const [ctr, setCtr] = useState('');
  const [conversion, setConversion] = useState('');
  const [unsubRate, setUnsubRate] = useState('');
  const [sendCount, setSendCount] = useState('');
  const [subject, setSubject] = useState(subjectLine ?? '');

  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationPromptResponse | null>(null);
  const [loadingCalibration, setLoadingCalibration] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!contentId || !userId) return;
    setLoadingHistory(true);
    try {
      const { records } = await marketingAPI.getContentPerformanceHistory(userId, contentId);
      setHistory(records);
    } catch {
      // Non-fatal — history is supplementary
    } finally {
      setLoadingHistory(false);
    }
  }, [contentId, userId]);

  useEffect(() => {
    if (expanded) {
      void fetchHistory();
    }
  }, [expanded, fetchHistory]);

  useEffect(() => {
    if (subjectLine && !subject) setSubject(subjectLine);
  }, [subjectLine, subject]);

  const isValidRate = (v: string) => {
    if (!v) return true;
    const n = parseFloat(v);
    return !isNaN(n) && n >= 0 && n <= 100;
  };

  const isValidCount = (v: string) => {
    if (!v) return true;
    const n = parseInt(v, 10);
    return !isNaN(n) && n >= 0 && String(n) === v.trim();
  };

  const hasAnyMetric =
    openRate !== '' || ctr !== '' || conversion !== '' || unsubRate !== '' || sendCount !== '';

  const allValid =
    isValidRate(openRate) &&
    isValidRate(ctr) &&
    isValidRate(conversion) &&
    isValidRate(unsubRate) &&
    isValidCount(sendCount);

  const handleSubmit = async () => {
    if (!hasAnyMetric || !allValid) return;
    setSaving(true);
    try {
      await marketingAPI.recordPerformanceMetrics(userId, {
        content_id: contentId,
        channel,
        metrics: {
          ...(openRate !== '' ? { open_rate: toDecimal(parseFloat(openRate)) } : {}),
          ...(ctr !== '' ? { click_through_rate: toDecimal(parseFloat(ctr)) } : {}),
          ...(conversion !== '' ? { conversion_rate: toDecimal(parseFloat(conversion)) } : {}),
          ...(unsubRate !== '' ? { unsubscribe_rate: toDecimal(parseFloat(unsubRate)) } : {}),
          ...(sendCount !== '' ? { send_count: parseInt(sendCount, 10) } : {}),
          ...(subject ? { subject_line: subject } : {}),
        },
        content_characteristics: subject
          ? { subject_length: subject.length }
          : undefined,
      });
      toast.success('Metrics recorded');
      setOpenRate('');
      setCtr('');
      setConversion('');
      setUnsubRate('');
      setSendCount('');
      void fetchHistory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record metrics');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadCalibration = async () => {
    if (calibration) {
      setCalibrationOpen(!calibrationOpen);
      return;
    }
    setLoadingCalibration(true);
    try {
      const data = await marketingAPI.getCalibrationPrompt(userId, { channel });
      setCalibration(data);
      setCalibrationOpen(true);
    } catch {
      toast.error('Failed to load calibration data');
    } finally {
      setLoadingCalibration(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-app-text hover:bg-white/5 rounded-xl"
      >
        <span className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary-400" />
          Campaign Metrics
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-app-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-app-muted" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Record form */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-app-muted mb-1">Open rate %</label>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="32.5"
                  value={openRate}
                  onChange={(e) => setOpenRate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-app-muted mb-1">CTR %</label>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="5.2"
                  value={ctr}
                  onChange={(e) => setCtr(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-app-muted mb-1">Conversion %</label>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="2.0"
                  value={conversion}
                  onChange={(e) => setConversion(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-app-muted mb-1">Unsub. %</label>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="0.3"
                  value={unsubRate}
                  onChange={(e) => setUnsubRate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-app-muted mb-1">Send count</label>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="1"
                  placeholder="5000"
                  value={sendCount}
                  onChange={(e) => setSendCount(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-app-muted mb-1">Subject line</label>
                <input
                  className={inputClass}
                  placeholder="Auto-filled from campaign"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              disabled={saving || !hasAnyMetric || !allValid}
              onClick={() => void handleSubmit()}
              className="w-full mt-1 px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Recording…' : 'Record Metrics'}
            </button>
          </div>

          {/* History */}
          {loadingHistory ? (
            <p className="text-xs text-app-muted">Loading history…</p>
          ) : history.length > 0 ? (
            <div>
              <h4 className="text-xs font-medium text-app-muted mb-2">Recorded History</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-app-text">
                  <thead>
                    <tr className="border-b border-white/10 text-app-muted">
                      <th className="text-left pb-1 pr-2">Date</th>
                      <th className="text-right pb-1 pr-2">Open</th>
                      <th className="text-right pb-1 pr-2">CTR</th>
                      <th className="text-right pb-1 pr-2">Conv.</th>
                      <th className="text-right pb-1">Sends</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 10).map((r) => (
                      <tr key={r.id} className="border-b border-white/5">
                        <td className="py-1 pr-2">
                          {new Date(r.recorded_at).toLocaleDateString()}
                        </td>
                        <td className="text-right py-1 pr-2">
                          {toPercent(r.open_rate)}
                        </td>
                        <td className="text-right py-1 pr-2">
                          {toPercent(r.click_through_rate)}
                        </td>
                        <td className="text-right py-1 pr-2">
                          {toPercent(r.conversion_rate)}
                        </td>
                        <td className="text-right py-1">
                          {r.send_count?.toLocaleString() ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-xs text-app-muted">No metrics recorded yet.</p>
          )}

          {/* Calibration preview */}
          <div>
            <button
              type="button"
              onClick={() => void handleLoadCalibration()}
              className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300"
            >
              <TrendingUp className="w-3 h-3" />
              {loadingCalibration
                ? 'Loading…'
                : calibrationOpen
                  ? 'Hide calibration data'
                  : 'View calibration data'}
            </button>
            {calibrationOpen && calibration && (
              <div className="mt-2 rounded-lg bg-white/5 border border-white/10 p-3 text-xs text-app-muted space-y-1">
                <p className="text-app-text font-medium">
                  Based on {calibration.based_on_records} campaigns
                </p>
                <p className="text-[10px]">
                  Generated {new Date(calibration.generated_at).toLocaleString()}
                </p>
                <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-app-text/80 max-h-48 overflow-y-auto">
                  {calibration.text}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

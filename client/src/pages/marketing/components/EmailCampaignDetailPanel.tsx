import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ExternalLink, Loader2, Mail, Send } from 'lucide-react';
import { marketingAPI, type EmailCampaign } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';
import { Badge } from '@/components/ui/Badge';

interface EmailCampaignDetailPanelProps {
  emailId: string;
  onUpdated: () => void;
}

export function EmailCampaignDetailPanel({ emailId, onUpdated }: EmailCampaignDetailPanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const navigate = useNavigate();
  const [email, setEmail] = useState<EmailCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !emailId) return;
    setLoading(true);
    setError(null);
    try {
      const row = await marketingAPI.getEmailCampaign(userId, emailId);
      setEmail(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load email campaign');
      setEmail(null);
    } finally {
      setLoading(false);
    }
  }, [emailId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSend = async () => {
    if (!userId || !email) return;
    setSending(true);
    try {
      await marketingAPI.sendEmailCampaign(userId, email.id);
      toast.success('Send queued');
      await load();
      onUpdated();
    } catch (e) {
      toast.error('Send failed', { description: e instanceof Error ? e.message : 'Unknown' });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-app-muted">
        <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
        <p className="text-sm">Loading email…</p>
      </div>
    );
  }

  if (error || !email) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
          <Mail className="h-7 w-7 text-red-400/90" />
        </div>
        <p className="text-sm text-app-text font-medium">Could not open this email</p>
        <p className="text-xs text-app-muted max-w-sm mx-auto">{error ?? 'Unknown error'}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-primary-400 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const html = email.body_html?.trim();
  const canSend = email.status !== 'sent' && (email.status === 'draft' || email.status === 'scheduled');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-app-border bg-gradient-to-r from-emerald-950/40 to-[#0c0f14] px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/25">
              <Mail className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge variant="blue">Email campaign</Badge>
                <Badge variant={email.status === 'sent' ? 'green' : 'default'}>{email.status}</Badge>
              </div>
              <h2 className="text-lg font-semibold text-app-text truncate">{email.name}</h2>
              <p className="text-sm text-app-muted mt-0.5 truncate">{email.subject || 'No subject'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                navigate(`/marketing/builder?type=email&open=${encodeURIComponent(email.id)}`);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-app-border bg-app-surface-tertiary px-3 py-2 text-xs font-medium text-app-text hover:bg-app-hover"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Edit in builder
            </button>
            {canSend && (
              <button
                type="button"
                disabled={sending}
                onClick={() => void handleSend()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-app-text hover:bg-emerald-500 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { label: 'Recipients', value: String(email.recipient_count ?? email.total_recipients ?? 0) },
            { label: 'Opened', value: String(email.opened ?? 0) },
            { label: 'Clicked', value: String(email.clicked ?? 0) },
            { label: 'Delivered', value: String(email.delivered ?? 0) },
          ].map((cell) => (
            <div
              key={cell.label}
              className="rounded-lg border border-app-border bg-app-surface-tertiary px-2 py-2"
            >
              <p className="text-[10px] uppercase tracking-wide text-app-muted">{cell.label}</p>
              <p className="text-sm font-semibold text-app-text tabular-nums">{cell.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-app-card p-3">
        {html ? (
          <div
            className="min-h-[320px] rounded-lg border border-black/10 bg-white p-4 text-left shadow-inner [&_img]:max-w-full"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-app-muted">
            No HTML body yet. Open in the builder to design this email.
          </div>
        )}
      </div>
    </div>
  );
}

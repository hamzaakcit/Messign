import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Instagram, CheckCircle, AlertCircle, Loader2, RefreshCw, Trash2, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui';
import { fetchAPI } from '@/lib/apiCore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InstagramAccount {
  id: string;
  platform_user_id: string;
  platform_username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  token_expires_at: string | null;
  connected_at: string;
  is_expiring_soon: boolean;
  meta: { fb_page_name?: string };
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchAccounts(): Promise<InstagramAccount[]> {
  const res = await fetchAPI<{ accounts: InstagramAccount[] }>('/api/integrations/instagram/accounts');
  return res.accounts;
}

async function disconnectAccount(platformUserId: string): Promise<void> {
  await fetchAPI(`/api/integrations/instagram/${encodeURIComponent(platformUserId)}`, { method: 'DELETE' });
}

async function refreshToken(platformUserId: string): Promise<void> {
  await fetchAPI(`/api/integrations/instagram/${encodeURIComponent(platformUserId)}/refresh`, { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IntegrationsPage({ embedded = false }: { embedded?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Handle OAuth redirect success/error
  useEffect(() => {
    const success = searchParams.get('success');
    const account = searchParams.get('account');
    const error = searchParams.get('error');

    if (success === 'instagram') {
      setToast({ type: 'success', message: `Instagram connected${account ? ` — @${account}` : ''}` });
      setSearchParams({}, { replace: true });
    } else if (error) {
      setToast({ type: 'error', message: decodeURIComponent(error) });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setAccounts(await fetchAccounts());
    } catch {
      // No accounts or not configured
    } finally {
      setLoading(false);
    }
  }

  function connectInstagram() {
    window.location.href = '/api/integrations/instagram/connect';
  }

  async function handleDisconnect(platformUserId: string) {
    if (!confirm('Disconnect this Instagram account? Published posts will remain on Instagram.')) return;
    setActionLoading(platformUserId);
    try {
      await disconnectAccount(platformUserId);
      setAccounts((prev) => prev.filter((a) => a.platform_user_id !== platformUserId));
      setToast({ type: 'success', message: 'Instagram account disconnected' });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to disconnect' });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRefresh(platformUserId: string) {
    setActionLoading(`refresh-${platformUserId}`);
    try {
      await refreshToken(platformUserId);
      setToast({ type: 'success', message: 'Token refreshed — valid for another 60 days' });
      await load();
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to refresh token' });
    } finally {
      setActionLoading(null);
    }
  }

  function formatExpiry(expiresAt: string | null): string {
    if (!expiresAt) return 'Never expires';
    const d = new Date(expiresAt);
    const daysLeft = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) return 'Expired';
    if (daysLeft <= 7) return `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
    return `Expires ${d.toLocaleDateString()}`;
  }

  const content = (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold text-app">Integrations</h2>
          <p className="text-sm text-app-muted mt-1">
            Connect your social media accounts to publish content directly from Messign.
          </p>
        </div>
      )}

        {/* Toast */}
        {toast && (
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            {toast.message}
          </div>
        )}

        {/* Instagram */}
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center shrink-0">
                <Instagram className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-medium text-app">Instagram</h3>
                <p className="text-xs text-app-muted">
                  Publish posts to your Instagram Business or Creator account
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={connectInstagram}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {accounts.length > 0 ? '+ Add account' : 'Connect'}
            </button>
          </div>

          {/* Connected accounts */}
          {loading ? (
            <div className="mt-4 flex items-center gap-2 text-app-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading connected accounts…
            </div>
          ) : accounts.length > 0 ? (
            <div className="mt-4 space-y-3">
              {accounts.map((acct) => (
                <div
                  key={acct.platform_user_id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-app-hover border border-app"
                >
                  {acct.avatar_url ? (
                    <img
                      src={acct.avatar_url}
                      alt={acct.platform_username ?? ''}
                      className="w-9 h-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold">
                      {(acct.platform_username ?? acct.display_name ?? 'I')[0].toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-app truncate">
                        {acct.platform_username ? `@${acct.platform_username}` : acct.display_name ?? 'Instagram account'}
                      </span>
                      <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`text-xs ${acct.is_expiring_soon ? 'text-amber-400' : 'text-app-muted'}`}
                      >
                        {formatExpiry(acct.token_expires_at)}
                      </span>
                      {acct.meta.fb_page_name && (
                        <>
                          <span className="text-app-muted text-xs">·</span>
                          <span className="text-xs text-app-muted truncate">via {acct.meta.fb_page_name}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {acct.is_expiring_soon && (
                      <button
                        type="button"
                        title="Refresh token"
                        onClick={() => handleRefresh(acct.platform_user_id)}
                        disabled={actionLoading === `refresh-${acct.platform_user_id}`}
                        className="p-1.5 rounded-md text-app-muted hover:text-app hover:bg-app-active transition-colors disabled:opacity-50"
                      >
                        {actionLoading === `refresh-${acct.platform_user_id}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    <a
                      href={`https://www.instagram.com/${acct.platform_username ?? ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View on Instagram"
                      className="p-1.5 rounded-md text-app-muted hover:text-app hover:bg-app-active transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      title="Disconnect"
                      onClick={() => handleDisconnect(acct.platform_user_id)}
                      disabled={actionLoading === acct.platform_user_id}
                      className="p-1.5 rounded-md text-app-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      {actionLoading === acct.platform_user_id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-app-muted">
              No Instagram accounts connected. Click <strong>Connect</strong> to authorize via your Meta/Facebook account.
            </p>
          )}

          {/* Setup note */}
          <div className="mt-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
            <p className="text-xs text-blue-400 leading-relaxed">
              <strong>Requires:</strong> A Meta App with Instagram Graph API enabled.
              Set <code className="font-mono bg-blue-500/10 px-1 rounded">META_APP_ID</code>,{' '}
              <code className="font-mono bg-blue-500/10 px-1 rounded">META_APP_SECRET</code>, and{' '}
              <code className="font-mono bg-blue-500/10 px-1 rounded">META_REDIRECT_URI</code> in your server{' '}
              <code className="font-mono bg-blue-500/10 px-1 rounded">.env</code>.
              Your Instagram account must be a Business or Creator account linked to a Facebook Page.
            </p>
          </div>
        </Card>

        {/* Coming soon: LinkedIn, X */}
        <Card className="p-6 opacity-60">
          <h3 className="font-medium text-app mb-3">Coming soon</h3>
          <div className="space-y-2 text-sm text-app-muted">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">in</div>
              <span>LinkedIn — OAuth account connection</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-black flex items-center justify-center text-white text-[10px] font-bold">𝕏</div>
              <span>X (Twitter) — OAuth account connection</span>
            </div>
          </div>
        </Card>
    </div>
  );

  if (embedded) return content;

  return (
    <div className="h-full overflow-auto bg-app transition-colors duration-200">
      <div className="max-w-2xl mx-auto p-6">
        {content}
      </div>
    </div>
  );
}

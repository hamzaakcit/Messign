import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_ORIGIN } from '@/lib/apiCore';
import { TEXT, pickLang } from './unsubscribeText';

/**
 * Public unsubscribe page (WP-13), reached from the link in a marketing email: /u/:token. No sign-in. The token in the
 * link is the credential, so this page talks to the public API routes directly (not through the authenticated client,
 * whose 401 handling would log a signed-in user out). Opening the page never unsubscribes: that takes the button.
 */

interface Info { channel: string; addressHint: string | null; senderName: string | null; unsubscribed: boolean }
type View =
  | { kind: 'loading' }
  | { kind: 'ready'; info: Info }
  | { kind: 'working'; info: Info }
  | { kind: 'done'; already: boolean }
  | { kind: 'invalid' }
  | { kind: 'error'; retry: 'load' | 'confirm'; info?: Info };

const endpoint = (token: string) => `${API_ORIGIN}/api/engage/unsubscribe/${encodeURIComponent(token)}`;

export function UnsubscribePage(): JSX.Element {
  const { token = '' } = useParams<{ token: string }>();
  const t = useMemo(() => TEXT[pickLang(typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [])], []);
  const [view, setView] = useState<View>({ kind: 'loading' });

  // The link carries the credential: keep it out of search results and out of Referer headers.
  useEffect(() => {
    const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex, nofollow';
    const referrer = document.createElement('meta'); referrer.name = 'referrer'; referrer.content = 'no-referrer';
    document.head.append(robots, referrer);
    return () => { robots.remove(); referrer.remove(); };
  }, []);

  const load = useCallback(async () => {
    setView({ kind: 'loading' });
    try {
      const res = await fetch(endpoint(token), { headers: { Accept: 'application/json' } });
      if (res.status === 404) return setView({ kind: 'invalid' });
      if (!res.ok) return setView({ kind: 'error', retry: 'load' });
      const info = (await res.json()) as Info;
      setView(info.unsubscribed ? { kind: 'done', already: true } : { kind: 'ready', info });
    } catch {
      setView({ kind: 'error', retry: 'load' });
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const confirm = async (info: Info) => {
    setView({ kind: 'working', info });
    try {
      const res = await fetch(endpoint(token), { method: 'POST', headers: { Accept: 'application/json' } });
      if (res.status === 404) return setView({ kind: 'invalid' });
      if (!res.ok) return setView({ kind: 'error', retry: 'confirm', info });
      const body = (await res.json()) as { alreadyUnsubscribed?: boolean };
      setView({ kind: 'done', already: body.alreadyUnsubscribed === true });
    } catch {
      setView({ kind: 'error', retry: 'confirm', info });
    }
  };

  const info = view.kind === 'ready' || view.kind === 'working' ? view.info : view.kind === 'error' ? view.info : undefined;

  return (
    <main className="min-h-screen bg-app flex items-center justify-center px-4 py-10" data-testid="unsubscribe-page">
      <div className="w-full max-w-md rounded-2xl border border-app bg-app-card p-6 shadow-lg">
        <h1 className="text-lg font-semibold text-app">{t.title}</h1>

        {view.kind === 'loading' && <p className="mt-4 text-sm text-app-muted" role="status">{t.loading}</p>}

        {(view.kind === 'ready' || view.kind === 'working') && (
          <>
            <p className="mt-4 text-sm text-app">{t.question(view.info.senderName)}</p>
            {view.info.addressHint && <p className="mt-2 text-sm text-app-muted">{t.address(view.info.addressHint)}</p>}
            <button
              type="button"
              onClick={() => void confirm(view.info)}
              disabled={view.kind === 'working'}
              className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {view.kind === 'working' ? t.working : t.confirm}
            </button>
          </>
        )}

        {view.kind === 'done' && <p className="mt-4 text-sm text-app" role="status">{view.already ? t.already : t.done}</p>}
        {view.kind === 'invalid' && <p className="mt-4 text-sm text-app-muted" role="alert">{t.invalid}</p>}

        {view.kind === 'error' && (
          <>
            <p className="mt-4 text-sm text-red-400" role="alert">{t.error}</p>
            {info?.addressHint && <p className="mt-2 text-sm text-app-muted">{t.address(info.addressHint)}</p>}
            <button
              type="button"
              onClick={() => (view.retry === 'confirm' && view.info ? void confirm(view.info) : void load())}
              className="mt-4 w-full rounded-lg border border-app px-4 py-2.5 text-sm font-medium text-app hover:bg-app-hover"
            >
              {t.retry}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

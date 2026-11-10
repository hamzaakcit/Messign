import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { listCustomers, type CustomerListItem } from './customersApi';

/** Engage customer list (WP-19): newest first, search by email or the start of an external id. */

export const formatTime = (v: string | null): string => (v ? new Date(v).toLocaleString() : '—');

function ConsentBadge({ c }: { c: CustomerListItem }): JSX.Element {
  if (c.erased) return <span className="rounded bg-app-muted/20 px-2 py-0.5 text-xs text-app-muted">erased</span>;
  if (c.suppressed) return <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-600">suppressed</span>;
  if (c.emailConsent === 'granted') return <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-700">granted</span>;
  if (c.emailConsent === 'revoked') return <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700">revoked</span>;
  return <span className="text-xs text-app-muted">none</span>;
}

export function CustomersPage(): JSX.Element {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setQ(input.trim()), 300);
    return () => window.clearTimeout(t);
  }, [input]);

  const query = useInfiniteQuery({
    queryKey: ['engage', 'customers', q],
    queryFn: ({ pageParam }) => listCustomers({ q, cursor: pageParam, limit: 50 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const rows = query.data?.pages.flatMap((p) => p.profiles) ?? [];

  return (
    <div className="flex-1 overflow-y-auto bg-app px-4 py-6 sm:px-8" data-testid="engage-customers">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-xl font-bold text-app">Customers</h1>
        <p className="mt-1 text-sm text-app-muted">Every customer, with their consent, messages and journeys.</p>
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search by email or customer ID"
          aria-label="Search customers"
          className="input-theme mt-4 text-sm sm:max-w-sm"
        />

        {query.isError && <p role="alert" className="mt-4 text-sm text-red-600">Could not load customers. Try again.</p>}
        {query.isPending && <p className="mt-4 text-sm text-app-muted">Loading…</p>}
        {!query.isPending && !query.isError && rows.length === 0 && (
          <p className="mt-6 text-sm text-app-muted">{q ? 'No customer matches this search.' : 'No customers yet. They appear here once your store sends them.'}</p>
        )}

        {rows.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-md border border-app">
            <table className="w-full text-left text-sm">
              <thead className="bg-app-muted/10 text-xs uppercase text-app-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Customer ID</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Email consent</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">Last event</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/customers/${c.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/customers/${c.id}`); }}
                    tabIndex={0}
                    className="cursor-pointer border-t border-app hover:bg-app-muted/10 focus:bg-app-muted/10 focus:outline-none"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-app">{c.externalId}</td>
                    <td className="px-3 py-2 text-app">{c.email ?? <span className="text-app-muted">—</span>}</td>
                    <td className="px-3 py-2"><ConsentBadge c={c} /></td>
                    <td className="hidden px-3 py-2 text-app-muted sm:table-cell">{formatTime(c.lastEventAt)}</td>
                    <td className="hidden px-3 py-2 text-app-muted md:table-cell">{formatTime(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {query.hasNextPage && (
          <button
            type="button"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="mt-4 rounded-md border border-app px-3 py-1.5 text-sm text-app hover:bg-app-muted/10 disabled:opacity-50"
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}

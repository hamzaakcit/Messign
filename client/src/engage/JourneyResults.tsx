import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getJourneyResults, type JourneyResults as Results } from './builderApi';
import { Card, ErrorLine, Select } from './ui';

/** Results of a journey (WP-21): treatment versus holdout, with the uplift and its 95% interval. */

const pct = (v: number | null): string => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const pts = (v: number | null): string => (v === null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)} points`);
const money = (v: number | null): string => (v === null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 2 }));

export function upliftText(r: Results): string {
  const u = r.conversion.uplift;
  if (u.difference === null) return 'Not enough mature customers in both groups yet.';
  const range = `95% interval ${pts(u.low)} to ${pts(u.high)}`;
  if (u.significant) return `${u.difference > 0 ? 'The journey helped' : 'The journey did worse'}: ${pts(u.difference)} (${range}).`;
  return `No clear difference yet: ${pts(u.difference)} (${range}). The interval includes zero.`;
}

export function JourneyResults({ journeyId }: { journeyId: string }): JSX.Element {
  const [windowHours, setWindowHours] = useState(72);
  const q = useQuery({ queryKey: ['engage', 'journey-results', journeyId, windowHours], queryFn: () => getJourneyResults(journeyId, windowHours) });
  return (
    <Card title="Results" actions={
      <div className="w-44">
        <Select value={String(windowHours)} onChange={(v) => setWindowHours(Number(v))} ariaLabel="Conversion window"
          options={[{ value: '24', label: 'Within 24 hours' }, { value: '72', label: 'Within 72 hours' }, { value: '168', label: 'Within 7 days' }]} />
      </div>
    }>
      {q.isPending && <p className="text-sm text-app-muted">Loading…</p>}
      <ErrorLine error={q.error} />
      {q.data && !q.data.conversion && <p className="text-sm text-app-muted">Results are not available for this journey.</p>}
      {q.data?.conversion && (
        <div className="space-y-3 text-sm" data-testid="journey-results">
          <p className="text-app" data-testid="uplift-text">{upliftText(q.data)}</p>
          <table className="w-full text-left">
            <thead className="text-xs uppercase text-app-muted">
              <tr><th className="py-1">Group</th><th className="py-1">Customers</th><th className="py-1">Converted</th><th className="py-1">Rate</th><th className="py-1">Revenue per customer</th></tr>
            </thead>
            <tbody>
              {(['treatment', 'holdout'] as const).map((g) => {
                const c = q.data!.conversion[g];
                return (
                  <tr key={g} className="border-t border-app">
                    <td className="py-1 text-app">{g === 'treatment' ? 'Journey' : 'Holdout (no messages)'}</td>
                    <td className="py-1">{c.n}</td>
                    <td className="py-1">{c.converted}</td>
                    <td className="py-1">{pct(c.conversionRate)}</td>
                    <td className="py-1">{money(c.revenuePerCustomer)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-app-muted">
            {q.data.note} Messages: {q.data.messages.created} created, {q.data.messages.heldOut} held out.
            {Object.entries(q.data.messages.byStatus).map(([s, n]) => ` ${s}: ${n}.`).join('')}
          </p>
        </div>
      )}
    </Card>
  );
}

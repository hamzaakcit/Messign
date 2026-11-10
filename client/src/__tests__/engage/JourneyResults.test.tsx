import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JourneyResults, upliftText } from '@/engage/JourneyResults';
import type { JourneyResults as Results } from '@/engage/builderApi';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const group = (n: number, converted: number, revenue: number) => ({ n, converted, conversionRate: n ? converted / n : null, revenue, revenuePerCustomer: n ? revenue / n : null });
const RESULT = (windowHours: number, over: Partial<Results['conversion']['uplift']> = {}): Results => ({
  windowHours, asOf: '2026-11-10T00:00:00Z',
  enrollments: { treatment: { entered: 100, mature: 90, active: 0, completed: 90, exited: 0, failed: 0 }, holdout: { entered: 100, mature: 90, active: 0, completed: 90, exited: 0, failed: 0 } },
  conversion: {
    treatment: group(90, 27, 2700), holdout: group(90, 18, 1800),
    uplift: { treatmentRate: 0.3, holdoutRate: 0.2, difference: 0.1, low: 0.02, high: 0.18, relative: 0.5, significant: true, ...over },
    revenueDifferencePerCustomer: 10,
  },
  messages: { created: 90, byStatus: { sent: 88, failed: 2 }, heldOut: 90 },
  note: `Only customers whose ${windowHours}-hour window has ended are counted.`,
});

describe('journey results panel (WP-21)', () => {
  const original = globalThis.fetch;
  let urls: string[];
  afterEach(() => { globalThis.fetch = original; });
  const show = (handler: (url: string) => Response) => {
    urls = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => { const url = String(input); urls.push(url); return handler(url); }) as typeof fetch;
    return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><JourneyResults journeyId="j1" /></QueryClientProvider>);
  };

  it('shows the uplift in words with its interval, both groups, and the messages', async () => {
    show((url) => json(RESULT(Number(new URL(url, 'http://x').searchParams.get('windowHours')))));
    expect(await screen.findByTestId('uplift-text')).toHaveTextContent('The journey helped: +10.00 points (95% interval +2.00 points to +18.00 points).');
    expect(screen.getByText('Journey')).toBeInTheDocument();
    expect(screen.getByText('Holdout (no messages)')).toBeInTheDocument();
    expect(screen.getByText('30.0%')).toBeInTheDocument();
    expect(screen.getByText('20.0%')).toBeInTheDocument();
    expect(screen.getByText(/90 created, 90 held out. sent: 88. failed: 2./)).toBeInTheDocument();
  });

  it('says so when the interval includes zero, and when there are no mature customers yet', () => {
    expect(upliftText(RESULT(72, { difference: 0.01, low: -0.02, high: 0.04, significant: false }))).toMatch(/No clear difference yet: \+1.00 points.*includes zero/);
    expect(upliftText({ ...RESULT(72), conversion: { ...RESULT(72).conversion, uplift: { ...RESULT(72).conversion.uplift, difference: null } } })).toMatch(/Not enough mature/);
    expect(upliftText(RESULT(72, { difference: -0.05, low: -0.09, high: -0.01, significant: true }))).toMatch(/did worse/);
  });

  it('asks again for the chosen window', async () => {
    show((url) => json(RESULT(Number(new URL(url, 'http://x').searchParams.get('windowHours')))));
    await screen.findByTestId('journey-results');
    fireEvent.change(screen.getByLabelText('Conversion window'), { target: { value: '24' } });
    await waitFor(() => expect(urls.some((u) => u.endsWith('/engage/journeys/j1/analytics?windowHours=24'))).toBe(true));
  });

  it('shows a clear error, not a crash, when results cannot be loaded', async () => {
    show(() => json({ error: 'Journey not found' }, 404));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not found.');
  });
});

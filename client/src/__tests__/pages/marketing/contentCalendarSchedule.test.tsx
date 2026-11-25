import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { marketingAPI, type ContentItem } from '@/lib/marketingApi';
import { ContentCalendarTab } from '@/pages/marketing/sections/ContentCalendarTab';
import { localDateKey, monthGridLength, monthRange, readyToSchedule, scheduleDropRule, trayLabel } from '@/pages/marketing/lib/calendarSchedule';

// The shops are in Turkey: a time zone east of UTC, where a local midnight is the previous day in UTC.
vi.hoisted(() => {
  process.env.TZ = 'Europe/Istanbul';
});

vi.mock('sonner', () => ({ toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: { authUserId: 'u1', id: 'u1' } }) }));
vi.mock('@/pages/marketing/components/ContentDetailPanel', () => ({ ContentDetailPanel: () => null }));

const today = new Date();
const day = (d: number) => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function item(over: Partial<ContentItem>): ContentItem {
  return {
    id: 'x', title: 'Post', body: 'Caption', content_type: 'social', channel: 'instagram', status: 'draft',
    scheduled_date: null, created_at: '2026-11-20T00:00:00Z', updated_at: '2026-11-20T00:00:00Z', ...over,
  } as ContentItem;
}

const draftOnCalendar = item({ id: 'draft-1', title: 'Draft post', status: 'draft', scheduled_date: day(10) });
const approved = item({ id: 'ready-1', title: 'Papatya buketi', status: 'approved', image_url: 'https://cdn.example/papatya.jpg' });

vi.mock('@/lib/marketingApi', () => ({
  marketingAPI: {
    getCalendarView: vi.fn(),
    listContent: vi.fn(),
    scheduleContent: vi.fn().mockResolvedValue({}),
    instagramPublishMode: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(marketingAPI.getCalendarView).mockResolvedValue([{ date: day(10), items: [draftOnCalendar] }] as never);
  vi.mocked(marketingAPI.listContent).mockImplementation(async (_u, f) =>
    (f?.status === 'approved' ? { data: [approved] } : { data: [draftOnCalendar] }) as never,
  );
  vi.mocked(marketingAPI.instagramPublishMode).mockResolvedValue({ mode: 'mock' } as never);
});

function renderCalendar() {
  return render(<MemoryRouter><ContentCalendarTab /></MemoryRouter>);
}

describe('scheduleDropRule', () => {
  it('takes approved and scheduled posts, refuses drafts, reviews and published', () => {
    expect(scheduleDropRule({ status: 'approved' })).toEqual({ ok: true });
    expect(scheduleDropRule({ status: 'scheduled' })).toEqual({ ok: true });
    expect(scheduleDropRule({ status: 'draft' })).toEqual({ ok: false, message: 'Only approved posts go on the calendar.' });
    expect(scheduleDropRule({ status: 'in_review' })).toMatchObject({ ok: false });
    expect(scheduleDropRule({ status: 'published' })).toEqual({ ok: false, message: 'This post is already published.' });
  });

  it('takes only Instagram posts with a caption and a still: another channel or a missing picture would fail on its day', () => {
    const still = 'https://cdn.example/still.jpg';
    const rows = [
      item({ id: 'ok', status: 'approved', image_url: still }),
      item({ id: 'linkedin', status: 'approved', channel: 'linkedin', image_url: still }),
      item({ id: 'no-still', status: 'approved', image_url: null }),
      item({ id: 'no-caption', status: 'approved', body: '  ', image_url: still }),
      item({ id: 'email', status: 'approved', channel: 'email', image_url: null }),
    ];
    expect(readyToSchedule(rows).map((i) => i.id)).toEqual(['ok']);
  });

  it('labels a tray card by its caption when the title is the generic AI draft', () => {
    expect(trayLabel({ title: 'Papatya buketi', body: 'Caption' })).toBe('Papatya buketi');
    expect(trayLabel({ title: 'AI draft', body: 'Vitrinde bu hafta: Kürk Mantolu Madonna, ₺189 ile.\nGel bak.' })).toBe('Vitrinde bu hafta: Kürk Mantolu Mado…');
    expect(trayLabel({ title: 'AI draft', body: 'Short caption' })).toBe('Short caption');
    expect(trayLabel({ title: '', body: '' })).toBe('Untitled post');
  });

  it('gives the first and last day of the month, including in a time zone east of UTC', () => {
    expect(monthRange(2026, 11)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange(2026, 12)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(monthRange(2028, 2)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('keys a day by its local date, not the UTC date of its midnight', () => {
    expect(localDateKey(new Date(2026, 10, 27))).toBe('2026-11-27');
    expect(localDateKey(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(localDateKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('gives a month grid whole weeks, six when the month needs them', () => {
    expect(monthGridLength(2026, 10)).toBe(42); // Nov 2026 starts on a Sunday and has 30 days
    expect(monthGridLength(2027, 1)).toBe(28); // Feb 2027 starts on a Monday and has 28 days: exactly four weeks
    expect(monthGridLength(2026, 1)).toBe(35); // Feb 2026 starts on a Sunday
    expect(monthGridLength(2026, 11)).toBe(35); // Dec 2026
    expect(monthGridLength(2027, 4)).toBe(42); // May 2027 starts on a Saturday and has 31 days
  });

  it('lists approved posts without a day as ready', () => {
    expect(readyToSchedule([approved, item({ id: 'a2', status: 'approved', scheduled_date: day(3) }), draftOnCalendar]).map((i) => i.id)).toEqual(['ready-1']);
  });
});

describe('calendar grid', () => {
  it('starts on a Monday, covers the whole month, and puts each date under its weekday', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 18, 10, 0, 0));
    try {
      renderCalendar();
      await screen.findByTestId('ready-tray');
      const cells = screen.getAllByTestId(/^day-/);
      expect(cells).toHaveLength(42);
      expect(cells[0]).toHaveAttribute('data-testid', 'day-2026-10-26'); // a Monday
      expect(cells[41]).toHaveAttribute('data-testid', 'day-2026-12-06'); // a Sunday
      expect(screen.getByTestId('day-2026-11-30')).toBeInTheDocument();
      const column = (key: string) => cells.findIndex((c) => c.getAttribute('data-testid') === `day-${key}`) % 7;
      expect(column('2026-11-02')).toBe(0); // Monday
      expect(column('2026-11-27')).toBe(4); // Friday
      expect(column('2026-11-29')).toBe(6); // Sunday
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('calendar', () => {
  it('shows approved posts in the tray and schedules one dropped on a day', async () => {
    renderCalendar();
    const tray = await screen.findByTestId('ready-tray');
    const chip = await within(tray).findByText('Papatya buketi');
    fireEvent.dragStart(chip);
    fireEvent.drop(screen.getByTestId(`day-${day(12)}`));
    await waitFor(() => expect(marketingAPI.scheduleContent).toHaveBeenCalledWith('u1', 'ready-1', day(12)));
  });

  it('refuses to drop a draft on a day', async () => {
    renderCalendar();
    const cell = await screen.findByTestId(`day-${day(10)}`);
    fireEvent.dragStart(await within(cell).findByText('Draft post'));
    fireEvent.drop(screen.getByTestId(`day-${day(14)}`));
    expect(marketingAPI.scheduleContent).not.toHaveBeenCalled();
    expect(toast.message).toHaveBeenCalledWith('Only approved posts go on the calendar.');
  });

  it('warns only when live sending is on', async () => {
    const { unmount } = renderCalendar();
    await screen.findByTestId('ready-tray');
    expect(screen.queryByTestId('live-send-warning')).toBeNull();
    unmount();
    vi.mocked(marketingAPI.instagramPublishMode).mockResolvedValue({ mode: 'live' } as never);
    renderCalendar();
    expect(await screen.findByTestId('live-send-warning')).toHaveTextContent('will be published on its day');
  });

  it('does not open a create form when an empty day is clicked', async () => {
    renderCalendar();
    fireEvent.click(await screen.findByTestId(`day-${day(20)}`));
    expect(screen.queryByText('Create Content')).toBeNull();
  });
});

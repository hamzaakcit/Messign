import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { marketingAPI, type ContentItem } from '@/lib/marketingApi';
import { ContentCalendarTab } from '@/pages/marketing/sections/ContentCalendarTab';
import { readyToSchedule, scheduleDropRule } from '@/pages/marketing/lib/calendarSchedule';

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
const approved = item({ id: 'ready-1', title: 'Papatya buketi', status: 'approved' });

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

  it('lists approved posts without a day as ready', () => {
    expect(readyToSchedule([approved, item({ id: 'a2', status: 'approved', scheduled_date: day(3) }), draftOnCalendar]).map((i) => i.id)).toEqual(['ready-1']);
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

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const surface = vi.hoisted(() => ({ frozen: false }));

vi.mock('@/lib/productSurface', async (orig) => ({
  ...(await orig<typeof import('@/lib/productSurface')>()),
  mountsFrozenModules: () => surface.frozen,
}));
vi.mock('@/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/pages/marketing/MarketingLayout', () => ({ MarketingLayout: () => <div>legacy marketing hub</div> }));
vi.mock('@/stores/uiStore', () => ({
  useUIStore: (sel: (s: { currentView: string; focusMode: boolean }) => unknown) => sel({ currentView: 'marketing', focusMode: false }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: { user: { name: string } }) => unknown) => sel({ user: { name: 'Ayşe Yılmaz' } }),
}));

import { MainContent } from '@/components/layout/MainContent';

const show = () => render(<MemoryRouter initialEntries={['/marketing']}><MainContent /></MemoryRouter>);

describe('MainContent marketing view by product surface', () => {
  it('engage: shows the engage home, never the legacy marketing hub (its API is not tenant-safe; Lucy is frozen)', async () => {
    surface.frozen = false;
    show();
    expect(await screen.findByTestId('engage-home')).toBeInTheDocument();
    expect(screen.getByText('Welcome, Ayşe')).toBeInTheDocument();
    expect(screen.queryByText('legacy marketing hub')).not.toBeInTheDocument();
  });

  it('workspace: keeps the marketing hub', async () => {
    surface.frozen = true;
    show();
    expect(await screen.findByText('legacy marketing hub')).toBeInTheDocument();
    expect(screen.queryByTestId('engage-home')).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CompanyPage } from '@/site/CompanyPage';
import { ContactPage } from '@/site/ContactPage';
import { DevelopersPage } from '@/site/DevelopersPage';
import { EngagePage } from '@/site/EngagePage';
import { HomePage } from '@/site/HomePage';
import { InfrastructurePage } from '@/site/InfrastructurePage';
import { SiteNav } from '@/site/SiteNav';
import { SiteShell } from '@/site/SiteShell';
import { SolutionPage } from '@/site/SolutionPage';
import { skipsDevLoginScreen } from '@/site/paths';

const BANNED = [/SOC\s*2/i, /ISO\s*\d/i, /GDPR/i, /KVKK/i, /Kitapyurdu/i, /Lilyana/i, /trusted by/i, /\d+\s*%/, /\d+\s+countries/i];

function renderAt(path: string, page: JSX.Element): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<SiteShell />}>
          <Route path={path} element={page} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('public site', () => {
  it('keeps the marketing homepage outside the dev sign-in screen', () => {
    expect(skipsDevLoginScreen('/')).toBe(true);
    expect(skipsDevLoginScreen('/engage')).toBe(true);
    expect(skipsDevLoginScreen('/solutions/wholesale')).toBe(true);
    expect(skipsDevLoginScreen('/u/token')).toBe(true);
    expect(skipsDevLoginScreen('/login')).toBe(false);
    expect(skipsDevLoginScreen('/dashboard')).toBe(false);
    expect(skipsDevLoginScreen('/marketing')).toBe(false);
  });

  it('opens with the positioning line and a login destination', () => {
    renderAt('/', <HomePage />);
    expect(screen.getByRole('heading', { level: 1, name: /Every message/i })).toBeInTheDocument();
    const login = screen.getAllByRole('link', { name: 'Login' });
    expect(login.length).toBeGreaterThan(0);
    for (const link of login) expect(link).toHaveAttribute('href', '/login');
    const home = screen.getByRole('link', { name: 'Messign home' });
    const mark = home.querySelector('svg');
    expect(mark?.innerHTML ?? '').toContain('M10 32L52 14L44 32L52 50L10 32Z');
    expect(mark?.innerHTML ?? '').not.toContain('M28 27Q31 30.5 34 27');
    expect(screen.getByRole('link', { name: 'Explore Messign' })).toHaveAttribute('href', '/engage');
    expect(screen.getAllByRole('link', { name: 'Contact Sales' })[0]).toHaveAttribute('href', '/contact');
  });

  it('opens the product menu', () => {
    render(
      <MemoryRouter>
        <SiteNav isAuthenticated={false} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Products' }));
    expect(screen.getByRole('link', { name: /Email marketing/i })).toHaveAttribute('href', '/engage#email');
    expect(screen.getByRole('link', { name: /A2P wholesale SMS/i })).toHaveAttribute('href', '/infrastructure#wholesale');
  });

  it('states that live SMS campaigns are not in Engage', () => {
    renderAt('/engage', <EngagePage />);
    expect(screen.getByRole('heading', { name: 'SMS campaigns' })).toBeInTheDocument();
    expect(screen.getByText(/There is no live SMS campaign in Engage/i)).toBeInTheDocument();
  });

  it('does not publish coverage, certifications or customer names', () => {
    const pages: Array<[string, JSX.Element]> = [
      ['/', <HomePage />],
      ['/engage', <EngagePage />],
      ['/infrastructure', <InfrastructurePage />],
      ['/developers', <DevelopersPage />],
      ['/company', <CompanyPage />],
      ['/contact', <ContactPage />],
      ['/solutions/wholesale', <SolutionPage />],
    ];
    for (const [path, page] of pages) {
      const view = render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={path.startsWith('/solutions') ? '/solutions/:slug' : path} element={page} />
          </Routes>
        </MemoryRouter>,
      );
      const text = view.container.textContent ?? '';
      for (const pattern of BANNED) {
        expect(text, `${path} matched ${pattern}`).not.toMatch(pattern);
      }
      view.unmount();
    }
  });
});

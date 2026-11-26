import { useEffect, useId, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SITE_MENUS, type SiteMenu } from './content';
import { SiteContainer, SiteMark, StatusMark } from './ui';

interface SiteNavProps {
  isAuthenticated: boolean;
}

/**
 * Product navigation. Desktop opens a panel from the header.
 * Small screens use the same links in a full-height menu.
 */
export function SiteNav({ isAuthenticated }: SiteNavProps): JSX.Element {
  const [open, setOpen] = useState<SiteMenu['id'] | null>(null);
  const [mobile, setMobile] = useState(false);
  const panelId = useId();
  const active = SITE_MENUS.find((menu) => menu.id === open) ?? null;

  useEffect(() => {
    if (!mobile && !open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(null);
        setMobile(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobile, open]);

  useEffect(() => {
    document.body.style.overflow = mobile ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobile]);

  return (
    <header
      className="sticky top-0 z-40 border-b border-[#101828]/10 bg-[#f3f5f8]/90 backdrop-blur-md"
      onMouseLeave={() => setOpen(null)}
    >
      <SiteContainer>
        <div className="flex h-16 items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 text-[#101828]" aria-label="Messign home">
            <SiteMark size={32} />
            <span className="text-[16px] font-medium tracking-[-0.02em]">Messign</span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {SITE_MENUS.map((menu) => {
              const expanded = open === menu.id;
              return (
                <button
                  key={menu.id}
                  type="button"
                  className={cn(
                    'rounded-full px-3 py-2 text-[14px] text-[#3d4d63] transition-colors hover:bg-[#e7edf5] hover:text-[#101828]',
                    expanded && 'bg-[#e7edf5] text-[#101828]',
                  )}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onMouseEnter={() => setOpen(menu.id)}
                  onFocus={() => setOpen(menu.id)}
                  onClick={() => setOpen(expanded ? null : menu.id)}
                >
                  {menu.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="hidden text-[14px] font-medium text-[#101828] lg:inline"
              >
                Workspace
              </Link>
            ) : (
              <Link
                to="/login"
                data-testid="site-login"
                className="hidden rounded-full px-3 py-2 text-[14px] font-medium text-[#101828] hover:bg-[#e7edf5] lg:inline"
              >
                Login
              </Link>
            )}
            <Link
              to="/signup"
              className="rounded-full bg-[#101828] px-3.5 py-2 text-[14px] font-medium text-white hover:bg-[#1c283d] sm:px-4"
            >
              Get Started
            </Link>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#101828]/10 lg:hidden"
              aria-expanded={mobile}
              aria-label={mobile ? 'Close menu' : 'Open menu'}
              onClick={() => {
                setMobile((value) => !value);
                setOpen(null);
              }}
            >
              {mobile ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </SiteContainer>

      {active ? (
        <div id={panelId} className="ms-menu hidden border-t border-[#101828]/10 bg-white lg:block">
          <SiteContainer className="grid gap-10 py-8 lg:grid-cols-[1fr_16rem]">
            <div className={cn('grid gap-10', active.groups.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1')}>
              {active.groups.map((group) => (
                <div key={group.title}>
                  <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#1a56db]">{group.title}</p>
                  <ul className="mt-4 space-y-1">
                    {group.links.map((link) => (
                      <li key={`${group.title}-${link.label}`}>
                        <NavLink
                          to={link.href}
                          onClick={() => setOpen(null)}
                          className="block rounded-xl px-3 py-2.5 hover:bg-[#f3f5f8]"
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="text-[15px] font-medium text-[#101828]">{link.label}</span>
                            <StatusMark status={link.status} />
                          </span>
                          <span className="mt-1 block text-[13px] leading-5 text-[#3d4d63]">{link.detail}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="text-[14px] leading-6 text-[#3d4d63]">{active.note}</p>
          </SiteContainer>
        </div>
      ) : null}

      {mobile ? (
        <div className="fixed inset-x-0 bottom-0 top-16 z-30 overflow-y-auto bg-[#f3f5f8] lg:hidden" role="dialog" aria-label="Menu">
          <SiteContainer className="py-6">
            <div className="mb-6 flex gap-3">
              {isAuthenticated ? (
                <Link to="/dashboard" onClick={() => setMobile(false)} className="rounded-full bg-[#101828] px-4 py-2 text-[14px] text-white">
                  Workspace
                </Link>
              ) : (
                <Link to="/login" data-testid="site-login-mobile" onClick={() => setMobile(false)} className="rounded-full border border-[#101828]/15 px-4 py-2 text-[14px]">
                  Login
                </Link>
              )}
              <Link to="/signup" onClick={() => setMobile(false)} className="rounded-full bg-[#1a56db] px-4 py-2 text-[14px] text-white">
                Get Started
              </Link>
            </div>
            {SITE_MENUS.map((menu) => (
              <section key={menu.id} className="border-t border-[#101828]/10 py-5">
                <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-[#1a56db]">{menu.label}</h2>
                <ul className="mt-3 space-y-3">
                  {menu.groups.flatMap((group) => group.links).map((link) => (
                    <li key={`${menu.id}-${link.href}-${link.label}`}>
                      <Link to={link.href} onClick={() => setMobile(false)} className="block">
                        <span className="text-[16px] text-[#101828]">{link.label}</span>
                        <span className="mt-1 flex items-center gap-2 text-[13px] text-[#3d4d63]">
                          <StatusMark status={link.status} />
                          {link.detail}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </SiteContainer>
        </div>
      ) : null}
    </header>
  );
}

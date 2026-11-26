import { Link } from 'react-router-dom';
import { SITE_MENUS } from './content';
import { SiteContainer } from './ui';

/** Closing links. Every destination is a page on this site, login, or the existing sign-up notice. */
export function SiteFooter(): JSX.Element {
  return (
    <footer className="border-t border-[#101828]/10 bg-[#f3f5f8]">
      <SiteContainer className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        {SITE_MENUS.map((menu) => (
          <div key={menu.id}>
            <h2 className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#1a56db]">{menu.label}</h2>
            <ul className="mt-4 space-y-2">
              {menu.groups.flatMap((group) => group.links).map((link) => (
                <li key={`${menu.id}-${link.href}-${link.label}`}>
                  <Link to={link.href} className="text-[14px] text-[#3d4d63] hover:text-[#101828]">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </SiteContainer>
      <SiteContainer className="flex flex-col gap-3 border-t border-[#101828]/10 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-[#3d4d63]">Messign. The customer is the sender.</p>
        <div className="flex gap-4 text-[13px]">
          <Link to="/login" className="text-[#101828] hover:underline">Login</Link>
          <Link to="/signup" className="text-[#101828] hover:underline">Get Started</Link>
          <Link to="/contact" className="text-[#101828] hover:underline">Contact</Link>
        </div>
      </SiteContainer>
    </footer>
  );
}

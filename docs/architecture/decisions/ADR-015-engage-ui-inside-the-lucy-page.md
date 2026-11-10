# ADR-015: Engage screens live inside the Lucy marketing page; records and editors open as panels over it

- **Status:** Accepted (2026-11-10, restructure after WP-21)
- **Context:** WP-19 to WP-21 built the engage screens as their own shell: sidebar entries and routes (`/customers`, `/journeys`, `/segments`, `/templates`) and an engage home page. The product owner does not want a second shell or separate pages for engage. The engage work belongs on the Lucy page the team already designs and shows (`/marketing`, the bento layout with the CMO column).
- **Decision:**
  1. On the engage surface, `/marketing` renders `EngageHub` (`client/src/engage/EngageHub.tsx`) in the Lucy layout. The engage sections (Customers, Journeys, Segments, Templates) are tabs in the main column. The right column is the CMO-style column with "Go to" tiles and quick actions (new journey, segment, template; tenant admins only).
  2. A record or an editor (a customer, a journey with its versions and results, a segment, a template, a new journey version) opens in a `SlideOverPanel` over the page. Nothing opens on its own route. `/customers`, `/journeys`, `/segments` and `/templates` are not engage paths (`isPathOnSurface`), so they redirect to `/marketing`.
  3. Lucy's own assistant is not offered on engage, as ADR-009 requires (the Dora assistant is frozen for engage tenants). The hub shows a neutral note instead of the chat.
  4. The workspace surface is unchanged: `/marketing` there is still the Company-OS Lucy page.
  5. The engage sidebar keeps Marketing and Settings only. The frozen Company-OS modules stay out of engage (ADR-001, ADR-009).
- **Consequences:** + one page for the engage work, the same layout as the rest of the product; + a panel keeps the list the user was reading, behind it; + the tests drive the hub (tabs, tiles, panels), not routes. − a panel is not a deep link: a customer or a journey cannot be shared as a URL yet (a `?panel=` parameter is the follow-up if the team needs it); − every new engage section has to follow the same rules: a tab, a tile, and panels for records and editors.
- **Not in v1:** deep links to panels; the Lucy assistant on engage (WP-23/24, under ADR-009).

import { useState } from 'react';
import { MessignIcon } from '@/components/ui/MessignLogo';

const TABS = ['Customers', 'Journeys', 'Campaigns', 'Segments', 'Templates'] as const;
type WorkspaceTab = (typeof TABS)[number];

/**
 * Hero composition: the real Engage section names, a send-gate reminder, and the paper-plane mark.
 * Sample layout only. It is not a screenshot and it shows no metrics.
 */
export function HeroStage(): JSX.Element {
  return (
    <div className="ms-rise" style={{ animationDelay: '80ms' }}>
      <div className="overflow-hidden rounded-[28px] border border-[#d5deea] bg-[#0c1733] text-white shadow-[0_24px_60px_rgba(16,24,40,0.16)]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2.5">
            <MessignIcon size={26} variant="dark" animate={false} />
            <div>
              <p className="text-[12px] font-medium tracking-wide text-white">Engage</p>
              <p className="text-[11px] text-white/50">Workspace sections</p>
            </div>
          </div>
          <p className="text-[11px] text-white/45">Sample layout</p>
        </div>
        <div className="flex flex-wrap gap-1 px-3 py-3 sm:px-4">
          {TABS.map((tab, index) => (
            <span
              key={tab}
              className={
                index === 0
                  ? 'shrink-0 rounded-full bg-white/12 px-3 py-1 text-[12px] text-white'
                  : 'shrink-0 rounded-full px-3 py-1 text-[12px] text-white/55'
              }
            >
              {tab}
            </span>
          ))}
        </div>
        <div className="grid gap-px bg-white/10 sm:grid-cols-5">
          {[
            ['Customer', 'Sample reader'],
            ['Address', 'reader@example.com'],
            ['Email consent', 'On the ledger'],
            ['Journey', 'Approved, then active'],
            ['Campaign', 'One step, same gate'],
          ].map(([label, value]) => (
            <div key={label} className="bg-[#0c1733] px-4 py-5 sm:py-6">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">{label}</p>
              <p className="mt-2 text-[14px] leading-5 text-white/90">{value}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-px border-t border-white/10 bg-white/10 md:grid-cols-[1.3fr_0.7fr]">
          <div className="bg-[#0c1733] px-5 py-5 sm:px-6">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">Marketing email</p>
            <p className="mt-2 text-[15px] text-white/90">Subject line stays in the template. The address is the tenant’s.</p>
          </div>
          <div className="bg-[#132044] px-5 py-5 sm:px-6">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#9db7ff]">Send gate</p>
            <p className="mt-2 text-[14px] leading-5 text-white/80">Consent, suppression, quiet hours and the budget cap run before a message exists.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const PANELS: Record<WorkspaceTab, { title: string; rows: string[]; note: string }> = {
  Customers: {
    title: 'Profiles, with history',
    rows: ['One active email and one active phone', 'Older addresses kept for matching', 'Consent stored as a ledger, not a checkbox'],
    note: 'A hand-added customer uses the same write path as the ingestion API.',
  },
  Journeys: {
    title: 'A definition, then a version',
    rows: ['Trigger: event, API call, or date', 'Wait, branch, holdout, exit', 'Email step. WhatsApp step on the tenant account'],
    note: 'An unapproved version cannot be activated. There is no SMS step.',
  },
  Campaigns: {
    title: 'One send, one step',
    rows: ['A segment, a template, a person who presses send', 'The audience is consent-only', 'The same gate as a journey message'],
    note: 'A campaign is a one-step journey plus a record. It can be resumed if it stops.',
  },
  Segments: {
    title: 'Rules you can count',
    rows: ['Attributes and order history', 'A preview before the segment is saved', 'A scheduled run enrolls once per profile'],
    note: 'Counts come from the tenant’s own data. This page has none.',
  },
  Templates: {
    title: 'Email HTML, and WhatsApp mappings',
    rows: ['Email is edited as Unlayer HTML', 'Missing variables fail the render', 'WhatsApp maps onto a template the tenant registered'],
    note: 'Marketing email must carry a one-click unsubscribe link.',
  },
};

/**
 * Tabbed layout of the Engage workspace. Labels match the product.
 * The rows describe behavior, not a tenant’s numbers.
 */
export function WorkspaceStage(): JSX.Element {
  const [tab, setTab] = useState<WorkspaceTab>('Customers');
  const panel = PANELS[tab];

  return (
    <div className="overflow-hidden rounded-[28px] border border-[#d5deea] bg-[#0c1733] text-white">
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-[12px] uppercase tracking-[0.16em] text-white/45">Workspace</p>
          <p className="mt-1 text-[15px] text-white">The Engage sections a signed-in tenant sees</p>
        </div>
        <p className="text-[12px] text-white/45">Sample structure. No live data.</p>
      </div>
      <div className="flex flex-wrap gap-1 px-3 py-3 sm:px-5" role="tablist" aria-label="Workspace sections">
        {TABS.map((item) => {
          const selected = item === tab;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(item)}
              className={
                selected
                  ? 'shrink-0 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-[#0c1733]'
                  : 'shrink-0 rounded-full px-3 py-1.5 text-[13px] text-white/65 hover:text-white'
              }
            >
              {item}
            </button>
          );
        })}
      </div>
      <div className="grid gap-8 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[1.1fr_0.9fr]" role="tabpanel">
        <div>
          <h3 className="text-[1.6rem] font-medium tracking-[-0.03em]">{panel.title}</h3>
          <ul className="mt-5 space-y-3">
            {panel.rows.map((row) => (
              <li key={row} className="border-t border-white/10 pt-3 text-[15px] leading-6 text-white/85">
                {row}
              </li>
            ))}
          </ul>
        </div>
        <p className="self-end text-[14px] leading-6 text-white/60">{panel.note}</p>
      </div>
    </div>
  );
}

const CODE_TABS = [
  {
    id: 'http',
    label: 'Ingestion API',
    code: `POST /api/engage/v1/profiles:upsert
x-api-key: <tenant api key>
Content-Type: application/json

{
  "external_id": "customer-1001",
  "identifiers": { "email": "reader@example.com" },
  "skip_triggers": true
}`,
  },
  {
    id: 'sdk',
    label: 'Website SDK',
    code: `<script
  async
  src="https://www.messign.com/sdk/v1/loader.js"
  data-site-key="msk_..."
></script>`,
  },
] as const;

/**
 * Two real surfaces: the ingestion API and the website loader.
 * The loader does not create a visitor and does not record events.
 */
export function CodeStage(): JSX.Element {
  const [current, setCurrent] = useState<(typeof CODE_TABS)[number]['id']>('http');
  const tab = CODE_TABS.find((item) => item.id === current) ?? CODE_TABS[0];

  return (
    <div className="overflow-hidden rounded-[28px] border border-[#d5deea] bg-[#101828]">
      <div className="flex gap-1 border-b border-white/10 px-3 py-3" role="tablist" aria-label="Developer surfaces">
        {CODE_TABS.map((item) => {
          const selected = item.id === current;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setCurrent(item.id)}
              className={
                selected
                  ? 'rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-[#101828]'
                  : 'rounded-full px-3 py-1.5 text-[13px] text-white/60 hover:text-white'
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <pre className="overflow-x-auto p-5 text-[13px] leading-6 text-[#d6e4ff] sm:p-6">
        <code>{tab.code}</code>
      </pre>
    </div>
  );
}

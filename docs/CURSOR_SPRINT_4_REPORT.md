# Sprint 4 Report — Content Repurposing Engine

## Part 1: Database

- **Migration:** `server/src/migrations/091_marketing_content_parent_lineage.sql` — adds `parent_content_id` (FK to `marketing_content`), partial index, comment.
- **Apply locally:** run your usual migration path (e.g. `psql $DATABASE_URL -f server/src/migrations/091_marketing_content_parent_lineage.sql` or project migration runner).
- **Verification:**  
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'marketing_content' AND column_name = 'parent_content_id';`

## Part 2: API

- **POST** `/api/marketing/content/:id/repurpose` — body: `{ target_channels: string[], style_hints?: Record<string,string> }` — response: `{ success, variants[], errors? }`.
- **GET** `/api/marketing/content?parent_id=<uuid>` — lists rows where `parent_content_id` matches (for variant lists / lineage).

## Part 3: Repurpose service

- **File:** `server/src/services/ai/marketing/repurposeService.ts`
- **Flow:** LLM variant per channel (`generateText` / complex tier) → `createContent` with `parent_content_id` → parallel gatekeepers → truth FAIL → `draft`; truth PASS → Instagram image gen (when applicable) → `assignApproval` → `in_review`.
- **Skips** target channel equal to normalized source (`twitter` / `x` treated as same).

## Part 4: Frontend

- Cockpit **ContentDetailPanel:** “Repurpose to other channels” toggle, **RepurposeModal** channel grid, lineage **Derived from** + **Repurposed variants** list, `onSelectContent` wired from **MarketingCommandCenterPage**.
- **Types:** `ContentItem.parent_content_id`, `parent_title` in `marketingApi.ts`.

## TypeScript

- Server: PASS  
- Client: PASS  

## Files touched (summary)

- `server/src/migrations/091_marketing_content_parent_lineage.sql`
- `server/src/dal/marketing/content.ts`
- `server/src/routes/marketing/content.ts`
- `server/src/services/ai/marketing/repurposeService.ts`
- `client/src/lib/marketingApi.ts`
- `client/src/pages/marketing/components/cockpit/ContentDetailPanel.tsx`
- `client/src/pages/marketing/components/cockpit/RepurposeModal.tsx`
- `client/src/pages/marketing/components/cockpit/CockpitContextPanel.tsx`
- `client/src/pages/marketing/MarketingCommandCenterPage.tsx`

## Deferred (Sprint 5+)

- Agent tool `marketing:repurpose_content` / natural-language repurpose.

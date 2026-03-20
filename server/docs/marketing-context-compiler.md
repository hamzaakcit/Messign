# Marketing context compiler

## ORM

Messign’s server uses **PostgreSQL + `pg`** with versioned SQL migrations (`src/migrations/`). There is **no Prisma/Drizzle schema** in-repo; table definitions live in SQL. TypeScript row shapes and Zod helpers live in [`src/dal/marketing/marketingContextSchema.ts`](../src/dal/marketing/marketingContextSchema.ts).

## Workspace ID

`workspace_id` in the new tables is **`organizations.id`** — the same tenant key as `organization_id` elsewhere (e.g. `marketing_glossary.organization_id`).

## Tables

| Spec / doc name | Implementation |
|-----------------|----------------|
| `marketing_product_truth` | Created in `072_marketing_context_compiler_tables.sql` |
| `marketing_approved_claims` | Created in 072 |
| `marketing_blocked_claims` | Created in 072 |
| `marketing_glossary` | **Existing** table from migration 069 (`organization_id`); compiler reads it as glossary for the workspace |
| `marketing_competitor_map` | Created in 072 (`approved_comparison_points` JSONB) |
| `marketing_brand_profiles` | Created in 072 (one row per workspace, `UNIQUE(workspace_id)`) |
| `marketing_brand_examples` | **Existing** 069 table; 072 adds optional `format` and `content` |

Legacy JSON `marketing_brand_profile` is merged into [`buildBrandVoiceProfile`](../src/services/marketing/marketingContextCompiler.ts) when the relational profile is sparse.

## Campaign operations (075+)

- [`075_marketing_calendar_budget.sql`](../src/migrations/075_marketing_calendar_budget.sql) — `marketing_content_calendar`, `marketing_budget_allocations`, `marketing_campaigns.objective`.
- Tool services: [`campaignManagerTools.ts`](../src/services/marketing/campaignManagerTools.ts) (confirmation gates, transactional `campaign_budget_allocate` + [`marketingJournalBridge.ts`](../src/services/finance/marketingJournalBridge.ts)).

## Product truth lookup tool

`marketing:product_truth_lookup` uses [`productTruthSearchService.ts`](../src/services/marketing/productTruthSearchService.ts): parallel SQL over `marketing_product_truth`, `marketing_approved_claims`, `marketing_blocked_claims`, and `marketing_competitor_map` (ILIKE + pg_trgm `%`). Apply migration `074_product_truth_search_indexes.sql` for GIN/trgm indexes.

## API

- `buildProductTruthSheet(workspaceId)` — Markdown for LLM injection.
- `buildBrandVoiceProfile(workspaceId)` — Markdown; taboos first.
- `invalidateWorkspaceMarketingContext(workspaceId)` — call after UI/API updates to truth or brand data.
- `invalidateAllMarketingContextCache()` — flush in-memory cache (NodeCache, 300s TTL).

## Run locally

```bash
npm run db:migrate   # apply 072
npm run marketing:print-context
```

Pass `WORKSPACE_ID=<uuid>` or the UUID as the first argument to pick a tenant.

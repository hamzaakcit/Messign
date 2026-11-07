# ADR-001: Engagement product as an isolated `engage` module in the same repo; Company OS frozen behind a product-surface flag

- **Status:** Accepted (2026-11-07, with D-01)
- **Context:** The repo is a 286K-LOC Company OS. The engagement product needs new data, auth paths and execution. There is one solo builder with ~30 sessions. Freeze-not-delete is the founder default (master-prompt §5 Q1).
- **Decision:**
  1. All engagement code lives in `server/src/engage/**` and `client/src/engage/**`. Its tables live in a Postgres schema `engage`. It mounts at `/api/engage`.
  2. Engage code may import from: `db/index.ts` (`withTenantQuery` only), `services/ai/gateway.ts`, the Lucy content/approval DAL, the Unlayer template DAL, and auth utilities. It must not import Company-OS modules.
  3. `PRODUCT_SURFACE` env (server) + `VITE_PRODUCT_SURFACE` (client): `engage` | `workspace` | `all` (dev). With `engage`, frozen module routers are not mounted and their nav is hidden. An org-level `organizations.product` column (default `workspace`) keeps engage tenants from seeing Company-OS screens even when `all` is set.
  4. Frozen modules: no new features. Fixes only when they block engage. Removed: `dal/time`, `knowledge-hub*` dirs, dumps, root scripts, RLS-unblock SQL, seed routes in production.
- **Consequences:** + no rewrite, fast start, existing auth/AI/content reused. − two products in one deploy (bigger image, shared failure domain); acceptable until a second team exists.
- **Rejected:** new repo (loses reuse of auth/AI/Lucy, adds infra work); deleting Company-OS modules (irreversible, founder default is freeze).

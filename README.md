# Messign Workspace

Messign Workspace is an AI-native Company OS — a single web app that replaces the patchwork of SaaS tools a growing company needs. It covers finance, CRM, marketing, HR, projects, knowledge management, support, OKRs, time tracking, and more, all tied together by **Dora**, an AI assistant that can read data and take actions across every module. The platform is multi-tenant with row-level security, gamified with XP and badges, and built for real-time collaboration.

## Core Technologies

| Layer | Stack |
|---|---|
| Frontend | Vite, React 18, TypeScript, Tailwind CSS, React Router, Zustand |
| Backend | Express.js, TypeScript, Socket.io |
| Database | PostgreSQL (Neon / Railway compatible) with Row-Level Security |
| AI | LiteLLM proxy routing to Groq, Google Gemini, OpenAI, Anthropic |
| Email Builder | Unlayer (`react-email-editor`) |
| Charts | Recharts, D3.js |
| Rich Text | TipTap |
| Background Jobs | BullMQ + Redis, pg-boss |
| Testing | Vitest (unit), Playwright (e2e) |
| Deployment | Railway (API), Vercel (SPA) |

## Quick Start

### Prerequisites

- **Node.js 20+** (the repo pins 22.x via `.nvmrc` — run `nvm use` if you use nvm)
- **PostgreSQL 15+** running locally or a Neon/Railway database
- **Redis** running locally (needed for BullMQ job queues and caching)

### 1. Install dependencies

```bash
git clone <your-repo-url> messign-workspace
cd messign-workspace
npm install
```

This installs both `client/` and `server/` workspaces automatically.

### 2. Configure environment

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Open `server/.env` and set at minimum:

- `DATABASE_URL` — your PostgreSQL connection string (use the `messign_app` role for RLS)
- `REDIS_URL` — defaults to `redis://localhost:6379`
- `JWT_SECRET` and `JWT_REFRESH_SECRET` — any random strings for signing tokens

AI features require at least one provider key (e.g. `GROQ_API_KEY`, `GEMINI_API_KEY`, or `OPENAI_API_KEY`).

The client `.env` is optional for local dev — the Vite dev server proxies `/api` requests to the Express backend automatically.

### 3. Set up the database

Create the restricted app role (enforces RLS):

```bash
psql -f db/scripts/create_app_role.sql
```

Run migrations:

```bash
npm run db:migrate
```

Seed sample data (optional but recommended for first run):

```bash
npm run db:seed
```

### 4. Start developing

```bash
npm run dev
```

This starts both servers concurrently:

- **Client** on `http://localhost:3000` (Vite dev server)
- **API** on `http://localhost:3001` (Express)

The client proxies all `/api/*` and `/socket.io` requests to the API server, so you only need to open `localhost:3000`.

### 5. Start LiteLLM (optional)

If you want the AI proxy for model routing and fallbacks:

```bash
npm run litellm
```

This starts the LiteLLM proxy on port 4000. See `litellm/config.yaml` for model configuration.

## Project Structure

```
messign-workspace/
  client/             # Vite + React SPA
  server/             # Express API + background workers
  db/                 # RLS enforcement scripts and shared SQL
  litellm/            # LiteLLM proxy configuration
  docs/               # PRD, roadmap, architecture notes
  e2e/                # Playwright end-to-end tests
  scripts/            # Build and utility scripts
  deploy/             # PgBouncer and deployment configs
  assets/             # Branding (logos, SVGs)
  package.json        # Workspace root — npm workspaces
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed breakdown of every folder.

## Available Scripts

Run these from the workspace root:

| Command | What it does |
|---|---|
| `npm run dev` | Start client + server in development mode |
| `npm run build` | Build the client SPA for production (Vercel default) |
| `npm run build:server` | Build the server for production (Railway / Node) |
| `npm run build:client` | Same as `npm run build` (explicit client build) |
| `npm run type-check` | TypeScript check across both workspaces |
| `npm run db:migrate` | Run all pending SQL migrations |
| `npm run db:seed` | Seed the database with sample data |
| `npm run db:apply-rls` | Apply Row-Level Security policies |
| `npm run litellm` | Start the LiteLLM AI proxy on port 4000 |

## Environment Variables

All variables are documented with comments in their respective `.env.example` files:

- **`server/.env.example`** (~200 lines) — database, Redis, JWT, AI provider keys, marketing integrations, Dora flags
- **`client/.env.example`** — only `VITE_*` variables; the client never holds API secrets

The critical ones to set for a working local environment:

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | server | PostgreSQL connection (use `messign_app` role) |
| `REDIS_URL` | server | Redis for BullMQ and caching |
| `JWT_SECRET` | server | Signs access tokens |
| `JWT_REFRESH_SECRET` | server | Signs refresh tokens |
| `GROQ_API_KEY` or similar | server | At least one AI provider for Dora |

## Deployment

The project is configured for split deployment:

- **API** deploys to **Railway** — see `railway.json` and [`server/DEPLOYMENT.md`](server/DEPLOYMENT.md)
- **Client** deploys to **Vercel** as a static SPA — see [`VERCEL_DEPLOY.md`](VERCEL_DEPLOY.md)

When deploying the client, set `VITE_API_URL` in Vercel environment variables to point at your Railway API host.

**CI:** On push to `main`, [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) can trigger a Vercel production deploy via the `VERCEL_DEPLOY_HOOK` secret; Railway typically auto-deploys when the repo is connected in Railway (see `VERCEL_DEPLOY.md` and `server/DEPLOYMENT.md`).

## Further Reading

- [ARCHITECTURE.md](ARCHITECTURE.md) — how the codebase is organized, how data flows, how the AI works
- [docs/PRD.md](docs/PRD.md) — product requirements document
- [docs/ROADMAP.md](docs/ROADMAP.md) — development roadmap
- [docs/API.md](docs/API.md) — API documentation
- [litellm/README.md](litellm/README.md) — LiteLLM proxy setup

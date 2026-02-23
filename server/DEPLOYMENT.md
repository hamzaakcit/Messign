# Messign backend — deployment (Render / Railway)

## Scripts

- **Build:** `npm run build` — compiles TypeScript to `dist/`
- **Start:** `npm run start` — runs `node dist/index.js` (production)
- The server listens on **`process.env.PORT`** (default `3001`). Set `PORT` on Render/Railway; the platform assigns it.

## CORS

The server allows requests from:

- **https://messign.vercel.app** (production frontend)
- **http://localhost:5173** (local Vite dev)
- **http://localhost:3000** (local app on port 3000)

Configured in `src/index.ts` (Express and Socket.io).

## Environment variables

Set these in the Render/Railway dashboard (or in a `.env` file for local runs).

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname` |
| `JWT_SECRET` | Secret for access tokens (or use `JWT_ACCESS_SECRET`) | long random string |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens (optional; falls back to `JWT_SECRET`) | long random string |

### Optional (server behavior)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP port (Render/Railway set this automatically) | `3001` |
| `NODE_ENV` | `production` or `development` | — |
| `UPLOAD_DIR` | Directory for uploaded files | `./uploads` (relative to cwd) |

### Optional (AI / Knowledge Hub)

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Groq API for Dora / knowledge answers |
| `GOOGLE_GEMINI_API_KEY` | Google Gemini for knowledge answers |
| `ANTHROPIC_API_KEY` | Claude for OCR, knowledge search, embeddings |
| `OPENAI_API_KEY` | OpenAI for RAG embeddings |

### Optional (invoices / company)

| Variable | Description | Default |
|----------|-------------|---------|
| `COMPANY_NAME` | Company name on invoices | Messign Communications |
| `COMPANY_ADDRESS` | Company address | Delaware, USA |
| `COMPANY_REG_NUMBER` | Registration number | 13799611524 |
| `COMPANY_VAT_NUMBER` | VAT number | 030319941 |
| `INVOICE_PREFIX` | Invoice number prefix | MSG |

### Optional (other)

| Variable | Description |
|----------|-------------|
| `GRAPHHOPPER_API_KEY` | Mileage / distance (GraphHopper) |
| `ACCESS_TOKEN_EXPIRY` | JWT access expiry (e.g. `15m`) |
| `REFRESH_TOKEN_EXPIRY` | JWT refresh expiry (e.g. `7d`) |

## Copy-paste list for Render/Railway

Add these in the dashboard; leave optional ones unset if not used.

```
DATABASE_URL
JWT_SECRET
JWT_REFRESH_SECRET
PORT
NODE_ENV
UPLOAD_DIR
GROQ_API_KEY
GOOGLE_GEMINI_API_KEY
ANTHROPIC_API_KEY
OPENAI_API_KEY
COMPANY_NAME
COMPANY_ADDRESS
COMPANY_REG_NUMBER
COMPANY_VAT_NUMBER
INVOICE_PREFIX
GRAPHHOPPER_API_KEY
ACCESS_TOKEN_EXPIRY
REFRESH_TOKEN_EXPIRY
```

## Deploy steps (Render / Railway)

1. Connect the repo; set **Root Directory** to **`server`** (or build/start from the `server` folder).
2. **Build command:** `npm install && npm run build`
3. **Start command:** `npm run start`
4. Add a PostgreSQL database and set `DATABASE_URL`.
5. Set the env vars above (at least `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`).
6. Deploy. The frontend at https://messign.vercel.app must call this backend’s URL (set `VITE_API_URL` or your app’s API base URL to the deployed server URL).

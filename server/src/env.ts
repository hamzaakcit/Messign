/**
 * Must be imported first from index.ts so process.env is populated before db/index.ts
 * (and any route) loads. Matches db:migrate-runner: workspace .env then server/.env.
 */
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(__dirname, '..');
const workspaceRoot = join(__dirname, '..', '..');

dotenv.config({ path: join(workspaceRoot, '.env') });
dotenv.config({ path: join(serverRoot, '.env') });

const cwdEnv = join(process.cwd(), '.env');
const cwdServerEnv = join(process.cwd(), 'server', '.env');
if (existsSync(cwdEnv)) {
  dotenv.config({ path: cwdEnv });
}
if (existsSync(cwdServerEnv)) {
  dotenv.config({ path: cwdServerEnv });
}
dotenv.config();

if (!process.env.GRAPHHOPPER_API_KEY) {
  console.warn('[server] GRAPHHOPPER_API_KEY not set; mileage calculator will use fallback 10 km.');
}

if (process.env.NODE_ENV === 'production') {
  const required = ['DATABASE_URL'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[FATAL] Missing required env vars in production: ${missing.join(', ')}`);
    process.exit(1);
  }

  const recommended = ['REDIS_URL', 'JWT_SECRET', 'CORS_ORIGIN'];
  const absent = recommended.filter((k) => !process.env[k]);
  if (absent.length > 0) {
    console.warn(`[server] Recommended env vars not set: ${absent.join(', ')}`);
  }
}

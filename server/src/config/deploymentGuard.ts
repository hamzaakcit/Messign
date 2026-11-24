/**
 * Fail-closed check that a deployed server is configured as production (WP-31, risk R10).
 *
 * Several protections are tied to NODE_ENV: the demo password and case-insensitive login, the placeholder token secrets, the
 * relaxed rate limits, the uploads login, the session fingerprint and the `trust proxy` setting. A deployment whose NODE_ENV
 * is missing or mistyped would run all of them in their development form, on the internet. Railway and Vercel set their own
 * variables on every deployment, so a process that has them and is not NODE_ENV=production refuses to start.
 *
 * This module is imported first by index.ts so that it runs before anything reads a secret.
 */

const DEPLOYED = /^(RAILWAY_|VERCEL_)/;
const DEFAULT_TOKEN_SECRETS: readonly string[] = [
  'messign-access-secret-change-in-production',
  'messign-refresh-secret-change-in-production',
];

export function deploymentProblem(env: NodeJS.ProcessEnv): string | null {
  const deployed = Object.keys(env).some((k) => DEPLOYED.test(k) && env[k]);
  if (deployed && env.NODE_ENV !== 'production') {
    return `NODE_ENV is ${env.NODE_ENV ? `"${env.NODE_ENV}"` : 'not set'} on a deployed environment. Set NODE_ENV=production: demo logins, placeholder token secrets and relaxed rate limits follow it.`;
  }
  for (const key of ['JWT_SECRET', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (env[key] && DEFAULT_TOKEN_SECRETS.includes(env[key]!)) return `${key} is set to the placeholder from the repository. Set a long random value.`;
  }
  return null;
}

const problem = deploymentProblem(process.env);
if (problem) throw new Error(`[FATAL] ${problem}`);

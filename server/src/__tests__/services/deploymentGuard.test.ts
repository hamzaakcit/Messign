import { describe, expect, it } from 'vitest';
import { deploymentProblem } from '../../config/deploymentGuard.js';

describe('deployment guard (WP-31)', () => {
  it('passes a developer machine, whatever NODE_ENV says', () => {
    expect(deploymentProblem({})).toBeNull();
    expect(deploymentProblem({ NODE_ENV: 'development' })).toBeNull();
    expect(deploymentProblem({ NODE_ENV: 'test' })).toBeNull();
  });
  it('passes a deployment that is NODE_ENV=production', () => {
    expect(deploymentProblem({ NODE_ENV: 'production', RAILWAY_PROJECT_ID: 'p', VERCEL_ENV: 'production' })).toBeNull();
  });
  it('refuses a deployment with NODE_ENV missing, mistyped or not production', () => {
    for (const env of [{ RAILWAY_PROJECT_ID: 'p' }, { RAILWAY_ENVIRONMENT: 'production', NODE_ENV: 'prod' }, { VERCEL_ENV: 'preview', NODE_ENV: 'development' }, { RAILWAY_SERVICE_ID: 's', NODE_ENV: '' }]) {
      expect(deploymentProblem(env), JSON.stringify(env)).toMatch(/Set NODE_ENV=production/);
    }
  });
  it('ignores a deployment variable that is empty', () => {
    expect(deploymentProblem({ RAILWAY_PROJECT_ID: '' })).toBeNull();
  });
  it('refuses the token-secret placeholders from the repository, anywhere', () => {
    expect(deploymentProblem({ NODE_ENV: 'production', JWT_SECRET: 'messign-access-secret-change-in-production' })).toMatch(/JWT_SECRET/);
    expect(deploymentProblem({ JWT_REFRESH_SECRET: 'messign-refresh-secret-change-in-production' })).toMatch(/JWT_REFRESH_SECRET/);
    expect(deploymentProblem({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(48) })).toBeNull();
  });
});

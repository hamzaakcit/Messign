import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverSrc = join(__dirname, '..', '..');

describe('terminal 234 SQL regressions (schema drift guards)', () => {
  it('commandCenter blockers query orders blocked tasks by created_at (tasks has no updated_at)', () => {
    const src = readFileSync(join(serverSrc, 'dal', 'commandCenter.ts'), 'utf8');
    expect(src).toContain("WHERE t.status = 'blocked'");
    expect(src).toContain('ORDER BY t.created_at DESC NULLS LAST');
    expect(src).not.toMatch(/WHERE t\.status = 'blocked'[\s\S]*ORDER BY t\.updated_at/);
  });

  it('recruitment getDashboardMetrics offerStats filters use o.status (not ambiguous with applications.status)', () => {
    const src = readFileSync(
      join(serverSrc, 'modules', 'hr', 'dal', 'recruitment', 'metrics.ts'),
      'utf8',
    );
    expect(src).toContain("COUNT(*) FILTER (WHERE o.status = 'accepted')");
    expect(src).toContain("COUNT(*) FILTER (WHERE o.status IN ('accepted', 'rejected'))");
  });

  it('migration adds reimbursement_users.avatar for leaderboard queries', () => {
    const sql = readFileSync(
      join(serverSrc, 'migrations', '108_reimbursement_users_avatar.sql'),
      'utf8',
    );
    expect(sql).toMatch(/reimbursement_users/i);
    expect(sql).toMatch(/avatar/i);
  });

  it('game leaderboard uses full_name (reimbursement_users has no name column)', () => {
    const src = readFileSync(join(serverSrc, 'routes', 'game.ts'), 'utf8');
    expect(src).toContain('ru.full_name AS user_name');
    expect(src).not.toContain('ru.name AS user_name');
  });
});

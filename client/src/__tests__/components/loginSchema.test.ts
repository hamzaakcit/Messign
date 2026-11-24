import { makeLoginFormSchema } from '@/components/login/loginSchema';

const form = (email: string) => ({ email, password: 'pw', rememberMe: false });

describe('login form schema by product surface', () => {
  it('workspace: only @messign.com addresses', () => {
    const s = makeLoginFormSchema('workspace');
    expect(s.safeParse(form('alex.chen@messign.com')).success).toBe(true);
    const r = s.safeParse(form('admin@kitapyurdu.com'));
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/Only Messign company accounts/);
  });

  it.each(['engage', 'all'] as const)('%s: any valid address (the server decides which accounts may sign in)', (surface) => {
    const s = makeLoginFormSchema(surface);
    expect(s.safeParse(form('  admin@kitapyurdu.com ')).success).toBe(true);
    expect(s.safeParse(form('alex.chen@messign.com')).success).toBe(true);
    expect(s.safeParse(form('not-an-email')).success).toBe(false);
  });
});

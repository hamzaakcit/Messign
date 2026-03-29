import { z } from 'zod';

/**
 * Client-side login validation aligned with `POST /api/auth/login` (e.g. `@messign.com` only).
 * Auth still uses `useAuthStore().login` — this schema only shapes UX before the request.
 */
export const loginFormSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .email('Enter a valid email')
        .refine((v) => v.toLowerCase().endsWith('@messign.com'), {
          message: 'Only Messign company accounts (@messign.com) can sign in.',
        }),
    ),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean(),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

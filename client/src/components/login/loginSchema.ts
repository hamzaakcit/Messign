import { z } from 'zod';
import { getProductSurface, type ProductSurface } from '@/lib/productSurface';

/**
 * Client-side login validation aligned with `POST /api/auth/login`. Company-OS accounts are `@messign.com`; where
 * engage is on (surface `engage` or `all`) an engage tenant's account can use any address, and the server decides.
 * Auth still uses `useAuthStore().login` — this schema only shapes UX before the request.
 */
export function makeLoginFormSchema(surface: ProductSurface) {
  const companyOnly = surface === 'workspace';
  return z.object({
    email: z
      .string()
      .min(1, 'Email is required')
      .transform((s) => s.trim())
      .pipe(
        z
          .string()
          .email('Enter a valid email')
          .refine((v) => !companyOnly || v.toLowerCase().endsWith('@messign.com'), {
            message: 'Only Messign company accounts (@messign.com) can sign in.',
          }),
      ),
    password: z.string().min(1, 'Password is required'),
    rememberMe: z.boolean(),
  });
}

export const loginFormSchema = makeLoginFormSchema(getProductSurface());

export type LoginFormValues = z.infer<typeof loginFormSchema>;

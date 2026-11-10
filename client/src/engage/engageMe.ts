import { getEngageMe } from './builderApi';
import { getProductSurface, setSessionSurface } from '@/lib/productSurface';

/**
 * Who the signed-in user is to engage, asked once per signed-in user. On a shared (`all`) build the answer also decides
 * the surface of the session (ADR-017): a tenant is narrowed to `engage`. The narrowing happens here, before the answer
 * is handed to anything that renders, so no screen is ever drawn for the wrong surface. A refusal (not an engage
 * organization) leaves the build's surface as it is.
 */
export function engageMeQuery(userId: string | undefined) {
  return {
    queryKey: ['engage', 'me', userId ?? 'anonymous'] as const,
    queryFn: async () => {
      try {
        const me = await getEngageMe();
        setSessionSurface(getProductSurface() === 'all' && me.product === 'engage' ? 'engage' : null);
        return me;
      } catch (err) {
        setSessionSurface(null);
        throw err;
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  };
}

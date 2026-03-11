import { toast } from 'sonner';

const DEFAULT_DURATION = 4000;

/**
 * Compact success toast: slides from top-right, green accent, auto-dismiss 4s.
 * Stacks up to 3 (configured on Toaster).
 */
export function successToast(
  message: string | React.ReactNode,
  options?: { duration?: number; description?: string }
): void {
  toast.success(message, {
    duration: options?.duration ?? DEFAULT_DURATION,
    description: options?.description,
  });
}

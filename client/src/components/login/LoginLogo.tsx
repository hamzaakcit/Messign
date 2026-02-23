/**
 * Messign logo for the login panel (light background).
 * Uses adaptive logo component for contrast; no tagline per enterprise requirements.
 */
import { MessignLogo } from '@/components/ui';

export function LoginLogo() {
  return (
    <div className="flex flex-col items-center text-center">
      <MessignLogo variant="light" size="xl" showText showTagline={false} animate logoSrc="/logo.png" className="justify-center" />
    </div>
  );
}

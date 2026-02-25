const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

export const posthog = posthogKey ? null : null;

export function trackEvent(
  eventName: string,
  properties?: Record<string, any>
): void {
  if (!posthogKey) return;

  console.log(`[posthog] ${eventName}`, properties);
}

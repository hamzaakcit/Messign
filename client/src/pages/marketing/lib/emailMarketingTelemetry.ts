/**
 * Lightweight client hook for VA2 email builder analytics.
 * Listen on `window` for `messign:va2-email` CustomEvents (detail: { event, ... }).
 *
 * Known `event` names: `email_resolve_complete`, `email_resolve_slot_status`, `email_assembly_complete` (from design assembler).
 */
export function trackVa2EmailTelemetry(
  event: string,
  payload?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent('messign:va2-email', {
        detail: { event, ts: Date.now(), ...payload },
      }),
    );
  } catch {
    /* ignore */
  }
}

export interface Va2EmailResolveTelemetryPayload {
  durationMs: number;
  slotCount: number;
  partial: boolean;
  idempotencyReplayed?: boolean;
  errorCount: number;
  /** Present when the HTTP call failed before a structured resolve body. */
  failureReason?: 'network' | 'rate_limit' | 'api';
}

/**
 * Fires when POST resolve-email-images completes (success, partial, or replayed).
 */
export function trackVa2EmailResolveTelemetry(payload: Va2EmailResolveTelemetryPayload): void {
  trackVa2EmailTelemetry('email_resolve_complete', payload as unknown as Record<string, unknown>);
}

// ─────────────────────────────────────────────────────────────────────────────
// Email assembly path metrics — legacy vs VA2 (in-memory; dev console optional)
// ─────────────────────────────────────────────────────────────────────────────

export type EmailAssemblyPathKind = 'va2_direct' | 'legacy_flat_bridge' | 'legacy_assemble_deprecated';

interface EmailAssemblyPathMetrics {
  va2Direct: number;
  legacyFlatBridge: number;
  legacyAssembleDeprecated: number;
}

const metrics: EmailAssemblyPathMetrics = {
  va2Direct: 0,
  legacyFlatBridge: 0,
  legacyAssembleDeprecated: 0,
};

/**
 * Increment count when email assembly uses the canonical VA2 manifest path (no legacy flat JSON).
 */
export function recordEmailAssemblyPathVa2Direct(): void {
  metrics.va2Direct += 1;
  if (import.meta.env.DEV) {
    console.debug('[EmailAssembly] path=va2_direct', getEmailAssemblyPathMetrics());
  }
}

/**
 * Increment count when a v1 flat manifest (colorTheme/layout/meta) was bridged to VA2.
 */
export function recordEmailAssemblyPathLegacyBridge(): void {
  metrics.legacyFlatBridge += 1;
  if (import.meta.env.DEV) {
    console.debug('[EmailAssembly] path=legacy_flat_bridge', getEmailAssemblyPathMetrics());
  }
}

/**
 * Increment when deprecated `assembleLegacyDesign` is used (should trend to zero).
 */
export function recordEmailAssemblyPathLegacyAssembleDeprecated(): void {
  metrics.legacyAssembleDeprecated += 1;
  if (import.meta.env.DEV) {
    console.warn('[EmailAssembly] path=legacy_assemble_deprecated', getEmailAssemblyPathMetrics());
  }
}

/**
 * Snapshot of assembly path counters (for tests and diagnostics).
 */
export function getEmailAssemblyPathMetrics(): Readonly<EmailAssemblyPathMetrics> {
  return { ...metrics };
}

/**
 * Reset metrics (Vitest only).
 */
export function resetEmailAssemblyPathMetricsForTests(): void {
  metrics.va2Direct = 0;
  metrics.legacyFlatBridge = 0;
  metrics.legacyAssembleDeprecated = 0;
}

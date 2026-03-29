import { useMemo } from 'react';
import type { DesignManifest } from '../../lib/types/manifestTypes';
import type { AssemblyResult } from '../../lib/types/unlayerTypes';
import type { EmailResolveRegeneratePayload } from '../../lib/emailResolveTypes';
import { listEmailImageSlotsForRegen } from '../contentEmail/manifestHelpers';
import { resolveMotionOverlayFromManifest } from '../../lib/motionOverlayManifest';
import { explainVa2AccessibilityHint } from '../../lib/a11yExplainEmail';

interface Va2DiagnosticsPanelProps {
  manifest: DesignManifest;
  assemblyResult: AssemblyResult;
  isResolvingImage: boolean;
  onRegenerate: (msg: string) => void;
  /** Targeted AI regen for manifest image slots (sections and grid items). */
  onRegenerateEmailSlot: (regenerate: EmailResolveRegeneratePayload) => Promise<void>;
  /** Last server image resolve (client state). */
  lastResolve?: {
    runId?: string;
    durationMs: number;
    partial: boolean;
    at: string;
    idempotencyReplayed?: boolean;
    debug?: {
      campaignPrefix?: string;
      effectivePromptBySection?: Record<number, string>;
      effectivePromptByItem?: Record<string, string>;
    };
  } | null;
}

function sampleTrackedUrl(campaignId: string): string {
  try {
    const u = new URL('https://example.com/offer');
    u.searchParams.set('utm_source', 'messign');
    u.searchParams.set('utm_medium', 'email');
    u.searchParams.set('utm_campaign', campaignId);
    return u.toString();
  } catch {
    return `…&utm_campaign=${encodeURIComponent(campaignId)}`;
  }
}

export function Va2DiagnosticsPanel({
  manifest,
  assemblyResult,
  isResolvingImage,
  onRegenerate,
  onRegenerateEmailSlot,
  lastResolve,
}: Va2DiagnosticsPanelProps) {
  const imageSlots = useMemo(() => listEmailImageSlotsForRegen(manifest), [manifest]);
  const campaignId = manifest.metadata?.campaign_id?.trim();
  const assemblySource = manifest.metadata?.assembly_source;
  const motion = resolveMotionOverlayFromManifest(manifest);
  const sectionFlow = [...manifest.sections]
    .sort((a, b) => a.order - b.order)
    .map((s) => s.type)
    .join(' → ');

  return (
    <div className="space-y-2 text-[11px] text-slate-400 px-1 py-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-300">VA2 Diagnostics</span>
        <span className="text-[10px] text-slate-500">
          {assemblyResult.metadata.theme} · {assemblyResult.metadata.sectionCount} rows
          {assemblyResult.metadata.accessibilityScore != null
            ? ` · a11y ${assemblyResult.metadata.accessibilityScore}`
            : ''}
        </span>
      </div>

      {assemblySource ? (
        <p className="text-[10px] text-slate-500">
          Assembly: <span className="text-slate-400">{assemblySource}</span>
        </p>
      ) : null}

      {manifest.metadata?.visual_density ? (
        <p className="text-[10px] text-slate-500">
          Layout density: <span className="text-slate-400">{manifest.metadata.visual_density}</span>
          {' — '}
          <span className="text-slate-500">
            {manifest.metadata.visual_density === 'minimal'
              ? 'Fewer auto image slots; good for transactional or legal copy.'
              : 'Rich campaign layout — more image slots and visual rhythm.'}
          </span>
        </p>
      ) : null}

      {manifest.easterEgg || manifest.motionOverlay ? (
        <p className="text-[10px] text-slate-500">
          Motion:{' '}
          <span className="text-slate-400">
            {manifest.motionOverlay ?? manifest.easterEgg ?? '—'}
          </span>
        </p>
      ) : null}

      <details className="text-slate-500">
        <summary className="cursor-pointer text-[10px] text-slate-400">Section order</summary>
        <p className="mt-1 pl-1 text-[10px] break-words text-slate-500">{sectionFlow}</p>
      </details>

      {motion.enabled ? (
        <div className="rounded border border-cyan-500/20 bg-cyan-950/20 px-2 py-1.5 text-[10px] text-slate-400">
          <div className="font-medium text-slate-300">Motion overlay</div>
          <p className="mt-0.5">
            Paper plane · <span className="text-slate-300">{motion.intensity}</span> ·{' '}
            <code className="text-cyan-500/90">motionOverlay</code> = paper_plane_sweep
          </p>
          <p className="mt-1 text-slate-500">
            Static fallback when recipients use “reduce motion”; some clients clip CSS — see email pipeline docs.
          </p>
        </div>
      ) : null}

      {lastResolve ? (
        <div className="space-y-1">
          <p className="text-[10px] text-slate-500 rounded border border-white/10 bg-black/20 px-2 py-1">
            Last resolve:{' '}
            <span className="text-slate-400">
              {lastResolve.durationMs}ms
              {lastResolve.runId ? ` · run ${lastResolve.runId.slice(0, 8)}…` : ''}
              {lastResolve.partial ? ' · partial / fallbacks' : ''}
              {lastResolve.idempotencyReplayed ? ' · replayed (Idempotency-Key)' : ''}
            </span>
          </p>
          {import.meta.env.DEV && lastResolve.debug?.effectivePromptBySection && (
            <details className="text-[10px] text-slate-500 rounded border border-violet-500/20 bg-violet-950/10 px-2 py-1">
              <summary className="cursor-pointer text-violet-300/90">Image prompt debug (dev)</summary>
              {lastResolve.debug.campaignPrefix ? (
                <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-[9px] text-slate-500">
                  {lastResolve.debug.campaignPrefix}
                </pre>
              ) : null}
              <p className="mt-1 text-[9px] text-slate-600">Section order → full prompt passed to generator (with campaign prefix).</p>
              <ul className="mt-1 max-h-40 space-y-1 overflow-auto pl-1">
                {Object.entries(lastResolve.debug.effectivePromptBySection).map(([ord, pr]) => (
                  <li key={ord} className="break-words">
                    <span className="text-slate-500">order {ord}:</span>{' '}
                    <span className="text-slate-400">{pr.slice(0, 280)}{pr.length > 280 ? '…' : ''}</span>
                  </li>
                ))}
              </ul>
              {lastResolve.debug.effectivePromptByItem &&
                Object.keys(lastResolve.debug.effectivePromptByItem).length > 0 ? (
                <ul className="mt-1 max-h-32 space-y-1 overflow-auto pl-1 border-t border-white/5 pt-1">
                  {Object.entries(lastResolve.debug.effectivePromptByItem).map(([k, pr]) => (
                    <li key={k} className="break-words">
                      <span className="text-slate-500">{k}:</span>{' '}
                      <span className="text-slate-400">{pr.slice(0, 200)}{pr.length > 200 ? '…' : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </details>
          )}
        </div>
      ) : null}

      {manifest.metadata?.email_resolve ? (
        <div className="text-[10px] text-slate-500 rounded border border-white/10 bg-black/20 px-2 py-1.5 space-y-0.5">
          <div className="font-medium text-slate-400">Persisted resolve (manifest)</div>
          <p>
            {manifest.metadata.email_resolve.resolvedAt
              ? `At ${manifest.metadata.email_resolve.resolvedAt}`
              : 'Recorded'}
            {manifest.metadata.email_resolve.errorCount != null
              ? ` · ${manifest.metadata.email_resolve.errorCount} error(s)`
              : ''}
            {manifest.metadata.email_resolve.partial ? ' · partial' : ''}
          </p>
        </div>
      ) : null}

      {manifest.metadata?.visual_slots_auto_enriched ? (
        <p className="text-[10px] text-slate-500 rounded border border-emerald-500/20 bg-emerald-950/20 px-2 py-1">
          Extra <code className="text-emerald-400/90">image_text</code> sections were added so this email reaches the minimum campaign image slots (you can edit or remove them in the manifest).
        </p>
      ) : null}

      {assemblyResult.metadata.layoutRichnessHint ? (
        <div className="rounded border border-amber-500/15 bg-amber-950/30 px-2 py-1.5 text-[10px] text-slate-400">
          <div className="font-medium text-slate-300">Layout richness</div>
          <p className="mt-0.5 text-slate-500">{assemblyResult.metadata.layoutRichnessHint}</p>
        </div>
      ) : null}

      {campaignId ? (
        <div className="rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[10px] text-slate-400">
          <div className="font-medium text-slate-300">Campaign tracking</div>
          <p className="mt-0.5">
            <code className="text-cyan-500/90">metadata.campaign_id</code> = {campaignId}
          </p>
          <p className="mt-1 text-slate-500 break-all">Links get UTM: {sampleTrackedUrl(campaignId)}</p>
        </div>
      ) : null}

      <p className="text-[10px] text-slate-500 border-t border-white/5 pt-2">
        Brand lock: edits in Unlayer stay in the exported design until you regenerate AI images below (that
        re-assembles from the manifest) or use the theme switcher for a new baseline.
      </p>

      {assemblyResult.metadata.accessibilityWarnings &&
      assemblyResult.metadata.accessibilityWarnings.length > 0 ? (
        <details className="text-cyan-400/85">
          <summary className="cursor-pointer text-[10px]">
            Accessibility detail ({assemblyResult.metadata.accessibilityWarnings.length})
          </summary>
          <p className="mt-1 text-[10px] text-slate-500 pl-1">
            These come from WCAG-style checks (contrast, alt text). Hero-on-photo layouts may show contrast
            notices when text sits over imagery — adjust theme or copy if recipients need stronger legibility.
          </p>
          <ul className="mt-1 space-y-1 pl-3 text-[10px]">
            {assemblyResult.metadata.accessibilityWarnings.map((w, i) => {
              const hint = explainVa2AccessibilityHint(w);
              return (
                <li key={i}>
                  <span>{w}</span>
                  {hint ? (
                    <span className="block text-slate-500 mt-0.5 pl-3 border-l border-slate-600/50">{hint}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      {assemblyResult.warnings.length > 0 ? (
        <details className="text-amber-500/80">
          <summary className="cursor-pointer">
            {assemblyResult.warnings.length} warning{assemblyResult.warnings.length > 1 ? 's' : ''}
          </summary>
          <ul className="mt-1 space-y-0.5 pl-3 text-[10px]">
            {assemblyResult.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {assemblyResult.skippedSections.length > 0 ? (
        <details className="text-red-400/80">
          <summary className="cursor-pointer">
            {assemblyResult.skippedSections.length} skipped
          </summary>
          <ul className="mt-1 space-y-0.5 pl-3 text-[10px]">
            {assemblyResult.skippedSections.map((s, i) => (
              <li key={i}>
                <strong>{s.type}</strong>: {s.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {imageSlots.length > 0 ? (
        <details className="rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[10px] text-slate-400">
          <summary className="cursor-pointer font-medium text-slate-300">Regenerate AI images</summary>
          <p className="mt-1 text-slate-500">
            Re-runs image generation for a slot or the whole email. Replaces the Unlayer layout from the
            updated manifest.
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
            {imageSlots.map((row) => (
              <li
                key={row.kind === 'section' ? `s-${row.order}` : `i-${row.itemKey}`}
                className="flex items-center justify-between gap-2"
              >
                <span className="min-w-0 truncate text-slate-500" title={row.label}>
                  {row.label}
                </span>
                <button
                  type="button"
                  disabled={isResolvingImage}
                  onClick={() =>
                    void onRegenerateEmailSlot(
                      row.kind === 'section'
                        ? { regenerate_section_orders: [row.order] }
                        : { regenerate_item_keys: [row.itemKey!] },
                    )
                  }
                  className="shrink-0 rounded bg-app-surface-tertiary px-2 py-0.5 text-[10px] text-slate-300 hover:bg-app-hover disabled:opacity-40"
                >
                  Regen
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2 border-t border-white/5 pt-2">
            <button
              type="button"
              disabled={isResolvingImage}
              onClick={() => void onRegenerateEmailSlot({ force_all: true })}
              className="text-[10px] px-2 py-0.5 rounded bg-app-surface-tertiary hover:bg-app-hover text-slate-300 disabled:opacity-40"
            >
              {isResolvingImage ? 'Generating…' : 'Regenerate all'}
            </button>
          </div>
        </details>
      ) : null}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={isResolvingImage}
          onClick={() =>
            onRegenerate(
              `Regenerate this ${manifest.theme} email about "${manifest.subject}" with improved copy.`,
            )
          }
          className="text-[10px] px-2 py-0.5 rounded bg-app-surface-tertiary hover:bg-app-hover text-slate-300 transition-colors disabled:opacity-40"
        >
          Ask Dora to regen
        </button>
      </div>
    </div>
  );
}

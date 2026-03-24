import type { DesignManifest } from '../../lib/types/manifestTypes';
import type { AssemblyResult } from '../../lib/types/unlayerTypes';

interface Va2DiagnosticsPanelProps {
  manifest: DesignManifest;
  assemblyResult: AssemblyResult;
  isResolvingImage: boolean;
  onRegenerate: (msg: string) => void;
  onRegenerateHeroImage: () => Promise<void>;
}

export function Va2DiagnosticsPanel({
  manifest,
  assemblyResult,
  isResolvingImage,
  onRegenerate,
  onRegenerateHeroImage,
}: Va2DiagnosticsPanelProps) {
  return (
    <div className="space-y-2 text-[11px] text-slate-400 px-1 py-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-300">VA2 Diagnostics</span>
        <span className="text-[10px] text-slate-500">
          {assemblyResult.metadata.theme} · {assemblyResult.metadata.sectionCount} sections
        </span>
      </div>

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

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={isResolvingImage}
          onClick={() => void onRegenerateHeroImage()}
          className="text-[10px] px-2 py-0.5 rounded bg-app-surface-tertiary hover:bg-app-hover text-slate-300 disabled:opacity-40 transition-colors"
        >
          {isResolvingImage ? 'Generating…' : 'Regen hero image'}
        </button>
        <button
          type="button"
          onClick={() =>
            onRegenerate(
              `Regenerate this ${manifest.theme} email about "${manifest.subject}" with improved copy.`,
            )
          }
          className="text-[10px] px-2 py-0.5 rounded bg-app-surface-tertiary hover:bg-app-hover text-slate-300 transition-colors"
        >
          Ask Dora to regen
        </button>
      </div>
    </div>
  );
}

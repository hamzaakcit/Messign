import type { DesignManifest } from '../lib/types/manifestTypes';

interface Va2VariantToggleProps {
  variants: DesignManifest[];
  activeVariant: 'A' | 'B';
  onSwitchVariant: (variant: 'A' | 'B') => void;
  isAssembling?: boolean;
}

export function Va2VariantToggle({
  variants,
  activeVariant,
  onSwitchVariant,
  isAssembling,
}: Va2VariantToggleProps) {
  if (variants.length < 2) return null;

  return (
    <span className="inline-flex items-center gap-0.5 rounded-md bg-app-surface-tertiary p-0.5">
      {(['A', 'B'] as const).map((v) => (
        <button
          key={v}
          type="button"
          disabled={isAssembling}
          onClick={() => onSwitchVariant(v)}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            activeVariant === v
              ? 'bg-primary-500/30 text-primary-300'
              : 'text-slate-400 hover:text-slate-200 hover:bg-app-hover'
          } disabled:opacity-40`}
        >
          {v}
        </button>
      ))}
    </span>
  );
}

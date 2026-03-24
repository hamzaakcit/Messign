import { Layers, MousePointerClick, Sparkles } from 'lucide-react';

export function EmptyContextPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-4 py-8">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-violet-500/25 via-fuchsia-500/15 to-cyan-500/20 blur-2xl" aria-hidden />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-app-border bg-gradient-to-br from-white/[0.08] to-white/[0.02] shadow-lg">
          <Layers className="h-9 w-9 text-violet-300/90" strokeWidth={1.25} />
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-2 max-w-[280px]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-surface-tertiary px-2.5 py-1 text-[10px] text-slate-400">
          <MousePointerClick className="h-3 w-3 text-emerald-400/80" />
          Tap a row
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-surface-tertiary px-2.5 py-1 text-[10px] text-slate-400">
          <Sparkles className="h-3 w-3 text-amber-400/80" />
          Preview here
        </span>
      </div>
      <p className="text-[11px] text-slate-500">Workspace</p>
    </div>
  );
}

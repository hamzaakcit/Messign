import { PanelRightOpen } from 'lucide-react';

export function EmptyContextPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <PanelRightOpen className="h-10 w-10 text-slate-700" aria-hidden />
      <div>
        <p className="text-sm font-medium text-slate-400">Select an item to view details</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
          Click any row in the workspace to preview content, campaigns, or leads — approve or edit without leaving the cockpit.
        </p>
      </div>
    </div>
  );
}

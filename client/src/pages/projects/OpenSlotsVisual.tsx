import type { RecruitmentSlot } from '@/lib/api';
import { cn } from '@/lib/utils';
import { getDeptColor } from './types';

export function OpenSlotsVisual({ config, compact }: { config: RecruitmentSlot[]; compact?: boolean }) {
  if (!config?.length) return null;
  const isCompact = compact;
  return (
    <div className={cn('mt-1', isCompact ? 'space-y-1' : 'space-y-2 mt-2')}>
      <div className={cn('flex justify-between text-app-muted', isCompact ? 'text-[10px]' : 'text-xs')}>
        <span>Open</span>
        <span>
          {config.reduce((s, r) => s + r.filled, 0)}/{config.reduce((s, r) => s + r.count, 0)}
        </span>
      </div>
      <div className={cn(isCompact ? 'space-y-0.5' : 'space-y-1.5')}>
        {config.map((slot, idx) => {
          const colors = getDeptColor(slot.dept);
          return (
            <div key={idx} className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                <span className={cn('rounded-full shrink-0', isCompact ? 'w-1.5 h-1.5' : 'w-2 h-2')} style={{ backgroundColor: colors.text }} />
                <span className={cn('text-app capitalize', isCompact ? 'text-[10px]' : 'text-xs')}>{slot.dept}</span>
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: slot.count }).map((_, i) => {
                  const filled = i < slot.filled;
                  return (
                    <span
                      key={i}
                      className={cn(
                        'inline-flex rounded-full border-2 items-center justify-center',
                        isCompact ? 'w-4 h-4 text-[10px]' : 'w-6 h-6 text-xs',
                        filled ? 'border-solid' : 'border-dashed border-app-border bg-app-surface-tertiary'
                      )}
                      style={filled ? { backgroundColor: colors.bg, borderColor: colors.border } : undefined}
                      title={`${slot.dept}: ${slot.filled}/${slot.count}`}
                    >
                      {!filled && '+'}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

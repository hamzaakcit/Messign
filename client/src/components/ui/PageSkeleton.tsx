import { cn } from '@/lib/utils';

type Variant = 'dashboard' | 'list' | 'kanban' | 'detail';

interface PageSkeletonProps {
  variant?: Variant;
  className?: string;
}

function ShimmerBar({ className }: { className?: string }) {
  return (
    <div
      className={cn('h-full rounded bg-white/10', className)}
      style={{
        background: 'linear-gradient(90deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.08) 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
      }}
    />
  );
}

export function PageSkeleton({ variant = 'dashboard', className }: PageSkeletonProps) {
  if (variant === 'dashboard') {
    return (
      <div className={cn('space-y-6 p-6', className)}>
        <div className="flex gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1 h-24 rounded-lg border border-app-border bg-app-card p-4">
              <ShimmerBar className="h-3 w-20 mb-3" />
              <ShimmerBar className="h-6 w-16" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 rounded-lg border border-app-border bg-app-card p-4">
            <ShimmerBar className="h-4 w-32 mb-4" />
            <ShimmerBar className="h-48 w-full" />
          </div>
          <div className="h-64 rounded-lg border border-app-border bg-app-card p-4">
            <ShimmerBar className="h-4 w-32 mb-4" />
            <ShimmerBar className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div className={cn('space-y-4 p-6', className)}>
        <div className="flex justify-between items-center">
          <ShimmerBar className="h-8 w-48" />
          <ShimmerBar className="h-9 w-24" />
        </div>
        <div className="rounded-lg border border-app-border overflow-hidden">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b border-app-border last:border-0">
              <ShimmerBar className="h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <ShimmerBar className="h-4 w-3/4" />
                <ShimmerBar className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'kanban') {
    return (
      <div className={cn('flex gap-4 overflow-x-auto p-6', className)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="w-[280px] min-w-[280px] rounded-lg border border-app-border bg-app-card">
            <div className="px-4 py-3 border-b border-app-border flex items-center gap-2">
              <ShimmerBar className="h-3 w-3 rounded-full" />
              <ShimmerBar className="h-4 w-24" />
              <ShimmerBar className="h-4 w-6 ml-auto" />
            </div>
            <div className="p-3 space-y-3">
              {[1, 2, 3].map((j) => (
                <div key={j} className="rounded-lg border border-app-border p-3 space-y-2">
                  <ShimmerBar className="h-4 w-full" />
                  <ShimmerBar className="h-3 w-2/3" />
                  <div className="flex justify-between pt-2">
                    <ShimmerBar className="h-5 w-5 rounded-full" />
                    <ShimmerBar className="h-3 w-12" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'detail') {
    return (
      <div className={cn('space-y-6 p-6 max-w-3xl', className)}>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <ShimmerBar className="h-8 w-64" />
            <ShimmerBar className="h-4 w-40" />
          </div>
          <ShimmerBar className="h-9 w-24" />
        </div>
        <div className="rounded-lg border border-app-border p-6 space-y-4">
          <ShimmerBar className="h-4 w-32" />
          <ShimmerBar className="h-4 w-full" />
          <ShimmerBar className="h-4 w-full" />
          <ShimmerBar className="h-4 w-2/3" />
        </div>
        <div className="rounded-lg border border-app-border p-6 space-y-4">
          <ShimmerBar className="h-4 w-32" />
          <ShimmerBar className="h-20 w-full" />
        </div>
      </div>
    );
  }

  return null;
}

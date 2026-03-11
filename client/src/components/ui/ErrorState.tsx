import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  message = 'Something went wrong',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-6 text-center',
        className
      )}
    >
      <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-red-400" />
      </div>
      <h3 className="text-lg font-semibold text-app-text">Something went wrong</h3>
      <p className="mt-2 text-sm text-app-muted max-w-sm">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-4 py-2 text-sm font-medium rounded-lg border border-app-border bg-app-card text-app-text hover:bg-app-hover transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}

import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';

interface Props {
  count: number;
  onReviewClick: () => void;
}

export function RequiredReadingBanner({ count, onReviewClick }: Props) {
  if (count <= 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-4 flex-wrap">
      <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-app">
          You have {count} document{count > 1 ? 's' : ''} that require{count === 1 ? 's' : ''} your review.
        </p>
        <p className="text-sm text-app-muted mt-0.5">
          Required reading must be acknowledged before the deadline.
        </p>
      </div>
      <Button onClick={onReviewClick} className="shrink-0 bg-amber-600 hover:bg-amber-500 gap-2">
        Review Now <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

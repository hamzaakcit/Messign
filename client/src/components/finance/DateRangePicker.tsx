import { Calendar } from 'lucide-react';

interface DateRangePickerProps {
  from?: string;
  to?: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}

export function DateRangePicker({ from, to, onChange, className }: DateRangePickerProps) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <Calendar className="h-4 w-4 text-app-muted" />
      <input
        type="date"
        value={from ?? ''}
        onChange={(e) => onChange(e.target.value, to ?? '')}
        className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:border-primary-500 focus:outline-none"
      />
      <span className="text-xs text-app-muted">to</span>
      <input
        type="date"
        value={to ?? ''}
        onChange={(e) => onChange(from ?? '', e.target.value)}
        className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:border-primary-500 focus:outline-none"
      />
    </div>
  );
}

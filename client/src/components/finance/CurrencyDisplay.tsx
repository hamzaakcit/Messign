interface CurrencyDisplayProps {
  amount: number;
  currency?: string;
  notation?: 'standard' | 'compact';
  className?: string;
}

export function CurrencyDisplay({ amount, currency = 'USD', notation = 'standard', className }: CurrencyDisplayProps) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation,
  }).format(amount);

  return <span className={className}>{formatted}</span>;
}

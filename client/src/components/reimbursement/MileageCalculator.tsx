import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui';

interface MileageCalculatorProps {
  onCalculate: (data: { origin_address: string; destination_address: string; is_round_trip?: boolean }) => Promise<{
    distance_km: number;
    rate_per_km: number;
    calculated_amount: number;
    currency: string;
    is_round_trip?: boolean;
  }>;
  getRate: () => Promise<{ ratePerKm: number; currency: string }>;
  onResult?: (amount: number, distanceKm: number, ratePerKm: number, currency: string) => void;
}

export function MileageCalculator({ onCalculate, onResult }: MileageCalculatorProps) {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [roundTrip, setRoundTrip] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    distance_km: number;
    rate_per_km: number;
    calculated_amount: number;
    currency: string;
  } | null>(null);

  const handleCalculate = async () => {
    if (!origin.trim() || !destination.trim()) return;
    setLoading(true);
    try {
      const res = await onCalculate({
        origin_address: origin.trim(),
        destination_address: destination.trim(),
        is_round_trip: roundTrip,
      });
      setResult({
        distance_km: res.distance_km,
        rate_per_km: res.rate_per_km,
        calculated_amount: res.calculated_amount,
        currency: res.currency,
      });
      onResult?.(res.calculated_amount, res.distance_km, res.rate_per_km, res.currency);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4 rounded-lg bg-app-hover border border-app">
      <h3 className="text-sm font-medium text-app">Mileage Claim</h3>
      <div>
        <label className="block text-xs text-app-muted mb-1">Starting Point</label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted" />
          <input
            type="text"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="e.g. Istanbul Office, Levent"
            className="input-theme pl-10"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-app-muted mb-1">Destination</label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted" />
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Client Office, Maslak"
            className="input-theme pl-10"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-app-muted">
        <input
          type="checkbox"
          checked={roundTrip}
          onChange={(e) => setRoundTrip(e.target.checked)}
          className="rounded border-app-inputBorder bg-app-inputBg text-primary-500 focus:ring-primary-500"
        />
        Round trip (return to starting point)
      </label>
      <Button type="button" onClick={handleCalculate} disabled={loading || !origin.trim() || !destination.trim()}>
        {loading ? 'Calculating...' : 'Calculate'}
      </Button>
      {result && (
        <div className="pt-2 border-t border-app text-sm text-app-muted">
          <p>Distance: {result.distance_km} km</p>
          <p>Rate: {result.rate_per_km} {result.currency}/km</p>
          <p className="text-app font-medium mt-1">Total: {result.calculated_amount} {result.currency}</p>
        </div>
      )}
    </div>
  );
}

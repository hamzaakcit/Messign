import { useEffect, useState } from 'react';
import { marketingAPI, type BrandProfileClient } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';

interface BrandSelectorProps {
  selectedBrandId: string | null;
  onBrandChange: (brandId: string | null) => void;
  disabled?: boolean;
  className?: string;
}

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500';

export function BrandSelector({ selectedBrandId, onBrandChange, disabled, className }: BrandSelectorProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [brands, setBrands] = useState<BrandProfileClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    marketingAPI
      .listBrandProfiles(userId, { limit: 200 })
      .then((res) => {
        const sorted = [...res.profiles].sort((a, b) => a.brand_name.localeCompare(b.brand_name));
        setBrands(sorted);
      })
      .catch(() => setBrands([]))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <select
      className={className || inputClass}
      value={selectedBrandId || ''}
      onChange={(e) => onBrandChange(e.target.value || null)}
      disabled={disabled || loading}
    >
      {loading ? (
        <option value="">Loading brands…</option>
      ) : brands.length === 0 ? (
        <option value="">No brands configured</option>
      ) : (
        <>
          <option value="">No specific brand</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.brand_name}
            </option>
          ))}
        </>
      )}
    </select>
  );
}

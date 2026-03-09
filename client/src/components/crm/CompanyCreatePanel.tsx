import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/stores/authStore';
import { crmAPI } from '@/lib/crmApi';

const companySchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  domain: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  annual_revenue: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
});

type CompanyFormValues = z.infer<typeof companySchema>;

interface CompanyCreatePanelProps {
  onCreated: () => void;
  onCancel: () => void;
}

export function CompanyCreatePanel({ onCreated, onCancel }: CompanyCreatePanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: '',
      domain: '',
      industry: '',
      size: '',
      annual_revenue: '',
      address: '',
      city: '',
      country: '',
      notes: '',
    },
  });

  const onSubmit = async (values: CompanyFormValues) => {
    if (!userId) return;
    setSubmitting(true);
    try {
      await crmAPI.createCompany(userId, {
        name: values.name,
        domain: values.domain || undefined,
        industry: values.industry || undefined,
        size: values.size || undefined,
        annual_revenue: values.annual_revenue ? Number(values.annual_revenue) : undefined,
        address: values.address || undefined,
        city: values.city || undefined,
        country: values.country || undefined,
        notes: values.notes || undefined,
      });
      onCreated();
    } catch {
      // Error handled by crmRequest
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
      <FormField label="Company Name *" error={errors.name?.message}>
        <input {...register('name')} className={inputCls} placeholder="Acme Inc." />
      </FormField>

      <FormField label="Domain" error={errors.domain?.message}>
        <input {...register('domain')} className={inputCls} placeholder="acme.com" />
      </FormField>

      <FormField label="Industry" error={errors.industry?.message}>
        <select {...register('industry')} className={inputCls}>
          <option value="">— Select industry —</option>
          <option value="Technology">Technology</option>
          <option value="Finance">Finance</option>
          <option value="Healthcare">Healthcare</option>
          <option value="Manufacturing">Manufacturing</option>
          <option value="Retail">Retail</option>
          <option value="Education">Education</option>
          <option value="Consulting">Consulting</option>
          <option value="Media">Media</option>
          <option value="Real Estate">Real Estate</option>
          <option value="Other">Other</option>
        </select>
      </FormField>

      <FormField label="Size" error={errors.size?.message}>
        <select {...register('size')} className={inputCls}>
          <option value="">— Select size —</option>
          <option value="1-10">1–10</option>
          <option value="11-50">11–50</option>
          <option value="51-200">51–200</option>
          <option value="201-1000">201–1,000</option>
          <option value="1001+">1,001+</option>
        </select>
      </FormField>

      <FormField label="Annual Revenue" error={errors.annual_revenue?.message}>
        <input
          {...register('annual_revenue')}
          type="number"
          min="0"
          step="1000"
          className={inputCls}
          placeholder="1000000"
        />
      </FormField>

      <FormField label="Address" error={errors.address?.message}>
        <input {...register('address')} className={inputCls} placeholder="123 Main St" />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="City" error={errors.city?.message}>
          <input {...register('city')} className={inputCls} placeholder="San Francisco" />
        </FormField>
        <FormField label="Country" error={errors.country?.message}>
          <input {...register('country')} className={inputCls} placeholder="US" />
        </FormField>
      </div>

      <FormField label="Notes" error={errors.notes?.message}>
        <textarea {...register('notes')} className={`${inputCls} min-h-[80px]`} placeholder="Additional notes…" />
      </FormField>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Creating…' : 'Create Company'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium rounded-lg text-app-muted hover:text-app-text hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputCls =
  'w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors';

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-app-muted mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

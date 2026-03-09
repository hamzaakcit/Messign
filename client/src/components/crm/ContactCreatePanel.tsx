import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/stores/authStore';
import { crmAPI, type Company } from '@/lib/crmApi';

const contactSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  job_title: z.string().optional(),
  company_id: z.string().optional(),
  source: z.string().optional(),
  tags: z.string().optional(),
  notes: z.string().optional(),
});

type ContactFormValues = z.infer<typeof contactSchema>;

interface ContactCreatePanelProps {
  onCreated: () => void;
  onCancel: () => void;
}

export function ContactCreatePanel({ onCreated, onCancel }: ContactCreatePanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [companies, setCompanies] = useState<Company[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      job_title: '',
      company_id: '',
      source: '',
      tags: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (!userId) return;
    crmAPI.listCompanies(userId).then(res => setCompanies(res.data)).catch(() => {});
  }, [userId]);

  const onSubmit = async (values: ContactFormValues) => {
    if (!userId) return;
    setSubmitting(true);
    try {
      const tags = values.tags
        ? values.tags.split(',').map(t => t.trim()).filter(Boolean)
        : undefined;
      await crmAPI.createContact(userId, {
        first_name: values.first_name,
        last_name: values.last_name || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
        job_title: values.job_title || undefined,
        company_id: values.company_id || undefined,
        source: values.source || undefined,
        tags,
        notes: values.notes || undefined,
      });
      onCreated();
    } catch {
      // Error is already handled by crmRequest throwing
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
      <FormField label="First Name *" error={errors.first_name?.message}>
        <input {...register('first_name')} className={inputCls} placeholder="Jane" />
      </FormField>

      <FormField label="Last Name" error={errors.last_name?.message}>
        <input {...register('last_name')} className={inputCls} placeholder="Doe" />
      </FormField>

      <FormField label="Email" error={errors.email?.message}>
        <input {...register('email')} type="email" className={inputCls} placeholder="jane@example.com" />
      </FormField>

      <FormField label="Phone" error={errors.phone?.message}>
        <input {...register('phone')} className={inputCls} placeholder="+1 (555) 123-4567" />
      </FormField>

      <FormField label="Job Title" error={errors.job_title?.message}>
        <input {...register('job_title')} className={inputCls} placeholder="VP of Sales" />
      </FormField>

      <FormField label="Company" error={errors.company_id?.message}>
        <select {...register('company_id')} className={inputCls}>
          <option value="">— Select company —</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </FormField>

      <FormField label="Source" error={errors.source?.message}>
        <select {...register('source')} className={inputCls}>
          <option value="">— Select source —</option>
          <option value="website">Website</option>
          <option value="referral">Referral</option>
          <option value="linkedin">LinkedIn</option>
          <option value="cold_call">Cold Call</option>
          <option value="event">Event</option>
          <option value="inbound">Inbound</option>
          <option value="other">Other</option>
        </select>
      </FormField>

      <FormField label="Tags" error={errors.tags?.message}>
        <input {...register('tags')} className={inputCls} placeholder="vip, decision-maker (comma separated)" />
      </FormField>

      <FormField label="Notes" error={errors.notes?.message}>
        <textarea {...register('notes')} className={`${inputCls} min-h-[80px]`} placeholder="Additional notes…" />
      </FormField>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Creating…' : 'Create Contact'}
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

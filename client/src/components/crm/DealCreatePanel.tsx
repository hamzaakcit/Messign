import { useState, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import {
  crmAPI,
  type Pipeline,
  type DealStage,
  type Company,
  type Contact,
} from '@/lib/crmApi';

const dealSchema = z.object({
  title: z.string().min(1, 'Deal title is required'),
  amount: z.string().optional(),
  currency: z.string().default('EUR'),
  company_id: z.string().optional(),
  contact_id: z.string().optional(),
  pipeline_id: z.string().min(1, 'Pipeline is required'),
  stage_id: z.string().min(1, 'Stage is required'),
  expected_close_date: z.string().optional(),
  competitor: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

type DealFormValues = z.infer<typeof dealSchema>;

interface DealCreatePanelProps {
  pipelineId: string;
  stages: DealStage[];
  onCreated: () => void;
  onCancel: () => void;
}

export function DealCreatePanel({ pipelineId, stages, onCreated, onCancel }: DealCreatePanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineStages, setPipelineStages] = useState<DealStage[]>(stages);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Company search
  const [companyQuery, setCompanyQuery] = useState('');
  const [companyResults, setCompanyResults] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

  // Contact search
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [, setSelectedContact] = useState<Contact | null>(null);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [contactQuery, setContactQuery] = useState('');

  // Tag input
  const [tagInput, setTagInput] = useState('');

  const companyRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLDivElement>(null);

  const firstStage = stages.find(s => !s.is_won && !s.is_lost) ?? stages[0];

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<DealFormValues>({
    resolver: zodResolver(dealSchema),
    defaultValues: {
      title: '',
      amount: '',
      currency: 'EUR',
      company_id: '',
      contact_id: '',
      pipeline_id: pipelineId,
      stage_id: firstStage?.id ?? '',
      expected_close_date: '',
      competitor: '',
      description: '',
      tags: [],
    },
  });

  const watchedPipelineId = watch('pipeline_id');
  const watchedStageId = watch('stage_id');
  const watchedTags = watch('tags');

  // Fetch pipelines on mount
  useEffect(() => {
    if (!userId) return;
    crmAPI.listPipelines(userId).then(setPipelines).catch(() => {});
  }, [userId]);

  // Update stages when pipeline changes
  useEffect(() => {
    if (!userId || watchedPipelineId === pipelineId) {
      setPipelineStages(stages);
      return;
    }
    crmAPI.getPipeline(userId, watchedPipelineId)
      .then(p => {
        if (p.stages) {
          setPipelineStages(p.stages);
          const first = p.stages.find(s => !s.is_won && !s.is_lost);
          if (first) setValue('stage_id', first.id);
        }
      })
      .catch(() => {});
  }, [userId, watchedPipelineId, pipelineId, stages, setValue]);

  // Auto-set probability from stage
  const currentStage = pipelineStages.find(s => s.id === watchedStageId);

  // Company search debounced
  useEffect(() => {
    if (!userId || companyQuery.length < 2) {
      setCompanyResults([]);
      return;
    }
    const timer = setTimeout(() => {
      crmAPI.listCompanies(userId, { search: companyQuery, pageSize: '8' })
        .then(res => setCompanyResults(res.data))
        .catch(() => setCompanyResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [userId, companyQuery]);

  // Contact search - filtered by selected company
  useEffect(() => {
    if (!userId) return;
    if (contactQuery.length < 2 && !selectedCompany) {
      setContactResults([]);
      return;
    }
    const timer = setTimeout(() => {
      const filters: Record<string, string> = { pageSize: '8' };
      if (selectedCompany) filters.company_id = selectedCompany.id;
      if (contactQuery.length >= 2) filters.search = contactQuery;
      crmAPI.listContacts(userId, filters)
        .then(res => setContactResults(res.data))
        .catch(() => setContactResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [userId, contactQuery, selectedCompany]);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (companyRef.current && !companyRef.current.contains(e.target as Node)) {
        setShowCompanyDropdown(false);
      }
      if (contactRef.current && !contactRef.current.contains(e.target as Node)) {
        setShowContactDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelectCompany = useCallback((company: Company) => {
    setSelectedCompany(company);
    setCompanyQuery(company.name);
    setValue('company_id', company.id);
    setShowCompanyDropdown(false);
    // Reset contact when company changes
    setSelectedContact(null);
    setValue('contact_id', '');
    setContactQuery('');
  }, [setValue]);

  const handleSelectContact = useCallback((contact: Contact) => {
    setSelectedContact(contact);
    setContactQuery(`${contact.first_name} ${contact.last_name ?? ''}`);
    setValue('contact_id', contact.id);
    setShowContactDropdown(false);
    // If contact has a company, auto-fill company
    if (contact.company_id && contact.company_name && !selectedCompany) {
      setSelectedCompany({ id: contact.company_id, name: contact.company_name } as Company);
      setCompanyQuery(contact.company_name);
      setValue('company_id', contact.company_id);
    }
  }, [setValue, selectedCompany]);

  const handleAddTag = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = tagInput.trim();
      if (tag && !watchedTags.includes(tag)) {
        setValue('tags', [...watchedTags, tag]);
      }
      setTagInput('');
    }
  }, [tagInput, watchedTags, setValue]);

  const handleRemoveTag = useCallback((tag: string) => {
    setValue('tags', watchedTags.filter(t => t !== tag));
  }, [watchedTags, setValue]);

  const onSubmit = async (values: DealFormValues) => {
    if (!userId) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await crmAPI.createDeal(userId, {
        title: values.title,
        pipeline_id: values.pipeline_id,
        stage_id: values.stage_id,
        amount: values.amount ? parseFloat(values.amount) : undefined,
        currency: values.currency || undefined,
        company_id: values.company_id || undefined,
        contact_id: values.contact_id || undefined,
        expected_close_date: values.expected_close_date || undefined,
        competitor: values.competitor || undefined,
        description: values.description || undefined,
        tags: values.tags.length > 0 ? values.tags : undefined,
      });
      onCreated();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create deal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
      {/* Title */}
      <FormField label="Title *" error={errors.title?.message}>
        <input data-testid="deal-title" {...register('title')} className={inputCls} placeholder="Acme Corp — Enterprise License" autoFocus />
      </FormField>

      {/* Amount + Currency */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <FormField label="Amount" error={errors.amount?.message}>
            <input data-testid="deal-amount" {...register('amount')} type="number" min="0" step="0.01" className={inputCls} placeholder="0" />
          </FormField>
        </div>
        <FormField label="Currency" error={errors.currency?.message}>
          <select {...register('currency')} className={inputCls}>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="TRY">TRY</option>
          </select>
        </FormField>
      </div>

      {/* Company (searchable) */}
      <div ref={companyRef} className="relative">
        <FormField label="Company">
          <input
            value={companyQuery}
            onChange={e => {
              setCompanyQuery(e.target.value);
              setShowCompanyDropdown(true);
              if (!e.target.value) {
                setSelectedCompany(null);
                setValue('company_id', '');
              }
            }}
            onFocus={() => companyQuery.length >= 2 && setShowCompanyDropdown(true)}
            className={inputCls}
            placeholder="Search companies…"
          />
        </FormField>
        {showCompanyDropdown && companyResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-app-border bg-app-card shadow-lg max-h-48 overflow-y-auto">
            {companyResults.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectCompany(c)}
                className="w-full px-3 py-2 text-left text-sm text-app-text hover:bg-primary-500/10 transition-colors"
              >
                <span className="font-medium">{c.name}</span>
                {c.domain && <span className="ml-2 text-xs text-app-muted">{c.domain}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contact (searchable, filtered by company) */}
      <div ref={contactRef} className="relative">
        <FormField label="Contact">
          <input
            value={contactQuery}
            onChange={e => {
              setContactQuery(e.target.value);
              setShowContactDropdown(true);
              if (!e.target.value) {
                setSelectedContact(null);
                setValue('contact_id', '');
              }
            }}
            onFocus={() => setShowContactDropdown(true)}
            className={inputCls}
            placeholder={selectedCompany ? `Search contacts at ${selectedCompany.name}…` : 'Search contacts…'}
          />
        </FormField>
        {showContactDropdown && contactResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-app-border bg-app-card shadow-lg max-h-48 overflow-y-auto">
            {contactResults.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectContact(c)}
                className="w-full px-3 py-2 text-left text-sm text-app-text hover:bg-primary-500/10 transition-colors"
              >
                <span className="font-medium">{c.first_name} {c.last_name ?? ''}</span>
                {c.job_title && <span className="ml-2 text-xs text-app-muted">{c.job_title}</span>}
                {c.company_name && <span className="ml-1 text-xs text-app-muted">@ {c.company_name}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pipeline + Stage */}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Pipeline" error={errors.pipeline_id?.message}>
          <select {...register('pipeline_id')} className={inputCls}>
            {pipelines.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            {pipelines.length === 0 && (
              <option value={pipelineId}>Default Pipeline</option>
            )}
          </select>
        </FormField>
        <FormField label="Stage" error={errors.stage_id?.message}>
          <select {...register('stage_id')} className={inputCls}>
            {pipelineStages.filter(s => !s.is_won && !s.is_lost).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </FormField>
      </div>

      {/* Probability hint */}
      {currentStage && (
        <p className="text-xs text-app-muted -mt-2">
          Probability: {currentStage.probability_default}%
        </p>
      )}

      {/* Expected Close Date */}
      <FormField label="Expected Close Date" error={errors.expected_close_date?.message}>
        <input {...register('expected_close_date')} type="date" className={inputCls} />
      </FormField>

      {/* Competitor */}
      <FormField label="Competitor" error={errors.competitor?.message}>
        <input {...register('competitor')} className={inputCls} placeholder="Main competitor" />
      </FormField>

      {/* Description */}
      <FormField label="Description" error={errors.description?.message}>
        <textarea {...register('description')} className={`${inputCls} min-h-[80px]`} placeholder="Deal description…" />
      </FormField>

      {/* Tags */}
      <FormField label="Tags">
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {watchedTags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary-500/15 text-primary-400">
              {tag}
              <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-red-400">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <input
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={handleAddTag}
          className={inputCls}
          placeholder="Type and press Enter to add tags"
        />
      </FormField>

      {/* Error */}
      {submitError && (
        <p className="text-sm text-red-400">{submitError}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Creating…' : 'Create Deal'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium rounded-lg text-app-muted hover:text-app-text hover:bg-app-nav-hover transition-colors"
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

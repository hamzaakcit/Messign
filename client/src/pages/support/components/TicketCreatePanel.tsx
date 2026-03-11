import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { crmAPI, type Contact } from '@/lib/crmApi';
import {
  supportApi,
  type CreateSupportTicketInput,
  type SupportCategory,
  type SupportPriority,
  type SupportSource,
  type SupportTicket,
} from '@/lib/supportApi';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';

const ticketSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  description: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  categoryId: z.string().optional(),
  reporterEmail: z.string().email('Valid email is required'),
  reporterName: z.string().optional(),
  assigneeId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  source: z.enum(['web', 'email', 'chat', 'phone', 'api']).default('web'),
  crmContactId: z.string().optional(),
  crmCompanyId: z.string().optional(),
});

type TicketFormValues = z.infer<typeof ticketSchema>;

interface TicketCreatePanelProps {
  onCreated: (ticket: SupportTicket) => void;
  onCancel: () => void;
}

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:ring-1 focus:ring-primary-500';

function formatContactLabel(contact: Contact): string {
  const name = `${contact.first_name} ${contact.last_name ?? ''}`.trim();
  if (contact.company_name) return `${name} • ${contact.company_name}`;
  return name || contact.email || 'Unknown contact';
}

export function TicketCreatePanel({ onCreated, onCancel }: TicketCreatePanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const { users } = useUsersStore();

  const [categories, setCategories] = useState<SupportCategory[]>([]);
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TicketFormValues>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      subject: '',
      description: '',
      priority: 'medium',
      categoryId: '',
      reporterEmail: '',
      reporterName: '',
      assigneeId: '',
      tags: [],
      source: 'web',
      crmContactId: '',
      crmCompanyId: '',
    },
  });

  const watchedTags = watch('tags');

  useEffect(() => {
    if (!userId) return;
    supportApi.listCategories(userId).then(setCategories).catch(() => setCategories([]));
  }, [userId]);

  useEffect(() => {
    if (!userId || contactSearch.trim().length < 2) {
      setContactResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      crmAPI
        .listContacts(userId, { search: contactSearch, pageSize: '6' })
        .then((result) => setContactResults(result.data))
        .catch(() => setContactResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [contactSearch, userId]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (contactRef.current && !contactRef.current.contains(event.target as Node)) {
        setShowContactDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const availableAssignees = useMemo(
    () => users.filter((entry) => ['admin', 'manager', 'member'].includes(entry.role)),
    [users],
  );

  const handleSelectContact = useCallback(
    (contact: Contact) => {
      const fullName = `${contact.first_name} ${contact.last_name ?? ''}`.trim();
      setContactSearch(contact.email ?? fullName);
      setValue('reporterEmail', contact.email ?? '');
      setValue('reporterName', fullName);
      setValue('crmContactId', contact.id);
      setValue('crmCompanyId', contact.company_id ?? '');
      setShowContactDropdown(false);
    },
    [setValue],
  );

  const handleAddTag = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' && event.key !== ',') return;
    event.preventDefault();
    const nextTag = tagInput.trim();
    if (!nextTag || watchedTags.includes(nextTag)) return;
    setValue('tags', [...watchedTags, nextTag]);
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setValue(
      'tags',
      watchedTags.filter((entry) => entry !== tag),
    );
  };

  const onSubmit = async (values: TicketFormValues) => {
    if (!userId) return;
    setSubmitting(true);
    try {
      const payload: CreateSupportTicketInput = {
        subject: values.subject,
        description: values.description || undefined,
        priority: values.priority as SupportPriority,
        categoryId: values.categoryId || undefined,
        reporterEmail: values.reporterEmail,
        reporterName: values.reporterName || undefined,
        assigneeId: values.assigneeId || undefined,
        tags: values.tags.length > 0 ? values.tags : undefined,
        source: values.source as SupportSource,
        crmContactId: values.crmContactId || undefined,
        crmCompanyId: values.crmCompanyId || undefined,
      };

      const ticket = await supportApi.createTicket(userId, payload);
      if (attachments.length > 0) {
        toast.info('Ticket created. Attachments can be sent in the conversation thread next.');
      }
      onCreated(ticket);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
      <FormField label="Subject *" error={errors.subject?.message}>
        <input
          data-testid="ticket-subject"
          {...register('subject')}
          placeholder="Customer unable to sync invoices after upgrade"
          className={inputClass}
          autoFocus
        />
      </FormField>

      <FormField label="Description">
        <textarea
          {...register('description')}
          rows={5}
          placeholder="Add issue context, reproduction steps, or customer notes…"
          className={inputClass}
        />
      </FormField>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormField label="Priority">
          <select {...register('priority')} className={inputClass}>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </FormField>
        <FormField label="Category">
          <select {...register('categoryId')} className={inputClass}>
            <option value="">Uncategorized</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div ref={contactRef} className="relative">
        <FormField label="Reporter Email *" error={errors.reporterEmail?.message}>
          <input
            {...register('reporterEmail')}
            value={watch('reporterEmail')}
            onChange={(event) => {
              setValue('reporterEmail', event.target.value);
              setContactSearch(event.target.value);
              setShowContactDropdown(true);
            }}
            placeholder="customer@acme.com"
            className={inputClass}
          />
        </FormField>
        {showContactDropdown && contactResults.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-app-border bg-app-sidebar shadow-xl overflow-hidden">
            {contactResults.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => handleSelectContact(contact)}
                className="w-full text-left px-3 py-2 text-sm text-app-text hover:bg-app-hover"
              >
                <div className="font-medium">{formatContactLabel(contact)}</div>
                {contact.email && <div className="text-xs text-app-muted">{contact.email}</div>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormField label="Reporter Name">
          <input {...register('reporterName')} placeholder="Ava Johnson" className={inputClass} />
        </FormField>
        <FormField label="Assignee">
          <select {...register('assigneeId')} className={inputClass}>
            <option value="">Unassigned</option>
            {availableAssignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.name}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormField label="Source">
          <select {...register('source')} className={inputClass}>
            <option value="web">Web</option>
            <option value="email">Email</option>
            <option value="chat">Chat</option>
            <option value="phone">Phone</option>
            <option value="api">API</option>
          </select>
        </FormField>
        <FormField label="Tags">
          <input
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={handleAddTag}
            placeholder="Type a tag and press Enter"
            className={inputClass}
          />
        </FormField>
      </div>

      {watchedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {watchedTags.map((tag) => (
            <Badge key={tag} variant="blue" className="gap-1">
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="text-current/80 hover:text-current"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-2 text-sm text-app-text mb-2">
          <Paperclip className="w-4 h-4" />
          Attachments
        </div>
        <input
          type="file"
          multiple
          onChange={(event) => setAttachments(Array.from(event.target.files ?? []))}
          className="text-sm text-app-muted"
        />
        {attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {attachments.map((file) => (
              <Badge key={`${file.name}-${file.size}`} variant="default">
                {file.name}
              </Badge>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-app-muted">
          Selected files are kept ready for follow-up conversation messages after ticket creation.
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" isLoading={submitting}>
          Create Ticket
        </Button>
      </div>
    </form>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-app-text">{label}</span>
      {children}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  );
}

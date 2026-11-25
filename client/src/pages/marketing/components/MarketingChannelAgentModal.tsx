import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import {
  type MarketingChannelAgentModalId,
  MARKETING_CHANNEL_AGENT_MODAL_TITLES,
  validateEmailVa2AgentForm,
  buildEmailVa2AgentMessage,
  EMAIL_LAYOUTS,
  type EmailLayout,
} from '@/pages/marketing/lib/marketingChannelAgentBuilders';

export interface MarketingChannelAgentModalProps {
  channel: MarketingChannelAgentModalId | null;
  isOpen: boolean;
  onClose: () => void;
  onSend: (message: string) => void;
  onApplyToComposer?: (message: string) => void;
}

/** Lucy's email brief: audience, offer and notes become one structured request (the composer's email templates). */
export function MarketingChannelAgentModal({
  channel,
  isOpen,
  onClose,
  onSend,
  onApplyToComposer,
}: MarketingChannelAgentModalProps): JSX.Element | null {
  const [layout, setLayout] = useState<EmailLayout>('standard');
  const [emailAudience, setEmailAudience] = useState('');
  const [offer, setOffer] = useState('');
  const [emailNotes, setEmailNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || !channel) return;
    setFieldErrors({});
    setLayout('standard');
    setEmailAudience('');
    setOffer('');
    setEmailNotes('');
  }, [isOpen, channel]);

  const handleSubmit = useCallback(
    (mode: 'send' | 'composer') => {
      if (!channel) return;
      const v = { audience: emailAudience, offer, notes: emailNotes, layout };
      const errs = validateEmailVa2AgentForm(v);
      const mapped: Record<string, string> = {};
      if (errs.audience) mapped.emailAudience = errs.audience;
      if (errs.offer) mapped.offer = errs.offer;
      setFieldErrors(mapped);
      if (Object.keys(mapped).length) return;
      const msg = buildEmailVa2AgentMessage(v);
      if (mode === 'send') onSend(msg);
      else onApplyToComposer?.(msg);
      onClose();
    },
    [channel, emailAudience, offer, emailNotes, layout, onSend, onApplyToComposer, onClose],
  );

  if (!channel) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={MARKETING_CHANNEL_AGENT_MODAL_TITLES[channel]} size="lg" forceDark>
      <div className="space-y-3 text-sm text-app-text">
        <p className="text-xs text-app-muted leading-relaxed">Describe the audience and the offer.</p>
          <div>
            <label htmlFor="ch-email-layout" className="mb-1 block text-xs font-medium text-app-muted">
              Layout
            </label>
            <select
              id="ch-email-layout"
              value={layout}
              onChange={(e) => setLayout(e.target.value as EmailLayout)}
              className="input-theme h-[42px] w-full rounded-lg px-3 text-sm"
            >
              {EMAIL_LAYOUTS.map((row) => (
                <option key={row.id} value={row.id}>{row.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-app-muted">{EMAIL_LAYOUTS.find((row) => row.id === layout)?.hint}</p>
          </div>
          <div>
            <label htmlFor="ch-email-audience" className="mb-1 block text-xs font-medium text-app-muted">
              Audience <span className="text-red-400">*</span>
            </label>
            <Input
              id="ch-email-audience"
              value={emailAudience}
              onChange={(e) => setEmailAudience(e.target.value)}
              placeholder="Who is this email for?"
              className="w-full"
              autoComplete="off"
            />
            {fieldErrors.emailAudience ? (
              <p className="mt-1 text-xs text-red-400">{fieldErrors.emailAudience}</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="ch-offer" className="mb-1 block text-xs font-medium text-app-muted">
              Offer / topic <span className="text-red-400">*</span>
            </label>
            <Input
              id="ch-offer"
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="Main message or promotion"
              className="w-full"
              autoComplete="off"
            />
            {fieldErrors.offer ? <p className="mt-1 text-xs text-red-400">{fieldErrors.offer}</p> : null}
          </div>
          <div>
            <label htmlFor="ch-email-notes" className="mb-1 block text-xs font-medium text-app-muted">
              Notes (optional)
            </label>
            <textarea
              id="ch-email-notes"
              value={emailNotes}
              onChange={(e) => setEmailNotes(e.target.value)}
              placeholder="CTA, timing, brand guardrails"
              rows={3}
              className="input-theme w-full resize-y min-h-[72px] text-sm"
            />
          </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-app-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border border-app-border text-app-muted hover:bg-app-hover"
          >
            Cancel
          </button>
          {onApplyToComposer ? (
            <button
              type="button"
              onClick={() => handleSubmit('composer')}
              className="px-4 py-2 rounded-lg text-sm border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
            >
              Insert into composer
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => handleSubmit('send')}
            className="px-4 py-2 rounded-lg text-sm bg-violet-600 text-app-text hover:bg-violet-500 font-medium"
          >
            Send to Lucy
          </button>
        </div>
      </div>
    </Modal>
  );
}

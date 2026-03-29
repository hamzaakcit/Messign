import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import {
  type MarketingChannelAgentModalId,
  MARKETING_CHANNEL_AGENT_MODAL_TITLES,
  validateLinkedInAgentForm,
  buildLinkedInAgentMessage,
  validateXAgentForm,
  buildXAgentMessage,
  validateBlogAgentForm,
  buildBlogAgentMessage,
  validateAdsAgentForm,
  buildAdsAgentMessage,
  validateEmailVa2AgentForm,
  buildEmailVa2AgentMessage,
  validateMetricsAgentForm,
  buildMetricsAgentMessage,
} from '@/pages/marketing/lib/marketingChannelAgentBuilders';

export interface MarketingChannelAgentModalProps {
  channel: MarketingChannelAgentModalId | null;
  isOpen: boolean;
  onClose: () => void;
  onSend: (message: string) => void;
  onApplyToComposer?: (message: string) => void;
  defaultTopic?: string | null;
}

/**
 * Structured channel prompts (LinkedIn, X, Blog, Ads, Email VA2, Metrics) — same UX pattern as InstagramAgentPromptModal.
 */
export function MarketingChannelAgentModal({
  channel,
  isOpen,
  onClose,
  onSend,
  onApplyToComposer,
  defaultTopic,
}: MarketingChannelAgentModalProps): JSX.Element | null {
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState('');
  const [angle, setAngle] = useState('');
  const [productTopic, setProductTopic] = useState('');
  const [goal, setGoal] = useState('');
  const [platform, setPlatform] = useState('');
  const [emailAudience, setEmailAudience] = useState('');
  const [offer, setOffer] = useState('');
  const [emailNotes, setEmailNotes] = useState('');
  const [metricsFocus, setMetricsFocus] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || !channel) return;
    setFieldErrors({});
    setTopic((defaultTopic ?? '').trim());
    setAudience('');
    setTone('');
    setAngle('');
    setProductTopic((defaultTopic ?? '').trim());
    setGoal('');
    setPlatform('');
    setEmailAudience('');
    setOffer('');
    setEmailNotes('');
    setMetricsFocus('');
  }, [isOpen, channel, defaultTopic]);

  const handleSubmit = useCallback(
    (mode: 'send' | 'composer') => {
      if (!channel) return;
      setFieldErrors({});

      if (channel === 'linkedin') {
        const v = { topic, audience, tone };
        const errs = validateLinkedInAgentForm(v);
        const mapped: Record<string, string> = {};
        if (errs.topic) mapped.topic = errs.topic;
        if (Object.keys(mapped).length) {
          setFieldErrors(mapped);
          return;
        }
        const msg = buildLinkedInAgentMessage(v);
        if (mode === 'send') onSend(msg);
        else onApplyToComposer?.(msg);
        onClose();
        return;
      }

      if (channel === 'x') {
        const v = { topic, tone };
        const errs = validateXAgentForm(v);
        if (errs.topic) {
          setFieldErrors({ topic: errs.topic });
          return;
        }
        const msg = buildXAgentMessage(v);
        if (mode === 'send') onSend(msg);
        else onApplyToComposer?.(msg);
        onClose();
        return;
      }

      if (channel === 'blog') {
        const v = { topic, angle };
        const errs = validateBlogAgentForm(v);
        if (errs.topic) {
          setFieldErrors({ topic: errs.topic });
          return;
        }
        const msg = buildBlogAgentMessage(v);
        if (mode === 'send') onSend(msg);
        else onApplyToComposer?.(msg);
        onClose();
        return;
      }

      if (channel === 'ads') {
        const v = { productTopic, goal, platform };
        const errs = validateAdsAgentForm(v);
        if (errs.productTopic) {
          setFieldErrors({ productTopic: errs.productTopic });
          return;
        }
        const msg = buildAdsAgentMessage(v);
        if (mode === 'send') onSend(msg);
        else onApplyToComposer?.(msg);
        onClose();
        return;
      }

      if (channel === 'email') {
        const v = { audience: emailAudience, offer, notes: emailNotes };
        const errs = validateEmailVa2AgentForm(v);
        const mapped: Record<string, string> = {};
        if (errs.audience) mapped.emailAudience = errs.audience;
        if (errs.offer) mapped.offer = errs.offer;
        if (Object.keys(mapped).length) {
          setFieldErrors(mapped);
          return;
        }
        const msg = buildEmailVa2AgentMessage(v);
        if (mode === 'send') onSend(msg);
        else onApplyToComposer?.(msg);
        onClose();
        return;
      }

      if (channel === 'metrics') {
        const v = { focus: metricsFocus };
        const errs = validateMetricsAgentForm(v);
        if (errs.focus) {
          setFieldErrors({ metricsFocus: errs.focus });
          return;
        }
        const msg = buildMetricsAgentMessage(v);
        if (mode === 'send') onSend(msg);
        else onApplyToComposer?.(msg);
        onClose();
      }
    },
    [
      channel,
      topic,
      audience,
      tone,
      angle,
      productTopic,
      goal,
      platform,
      emailAudience,
      offer,
      emailNotes,
      metricsFocus,
      onSend,
      onApplyToComposer,
      onClose,
    ],
  );

  if (!channel) return null;

  const title = MARKETING_CHANNEL_AGENT_MODAL_TITLES[channel];

  const intro =
    channel === 'email'
      ? 'Describe audience and offer. Lucy will request a VA2 email design manifest JSON for the builder.'
      : channel === 'metrics'
        ? 'What should we prioritize in the performance summary?'
        : 'Fill in the basics. Lucy formats a full request for the agent — edit after insert if needed.';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg" forceDark>
      <div className="space-y-3 text-sm text-app-text">
        <p className="text-xs text-app-muted leading-relaxed">{intro}</p>

        {(channel === 'linkedin' || channel === 'x' || channel === 'blog') && (
          <div>
            <label htmlFor="ch-topic" className="mb-1 block text-xs font-medium text-app-muted">
              Topic <span className="text-red-400">*</span>
            </label>
            <Input
              id="ch-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Q2 launch, hiring push, product education"
              className="w-full"
              autoComplete="off"
            />
            {fieldErrors.topic ? <p className="mt-1 text-xs text-red-400">{fieldErrors.topic}</p> : null}
          </div>
        )}

        {channel === 'linkedin' && (
          <>
            <div>
              <label htmlFor="ch-audience" className="mb-1 block text-xs font-medium text-app-muted">
                Audience (optional)
              </label>
              <Input
                id="ch-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. SMB founders in EU"
                className="w-full"
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="ch-tone" className="mb-1 block text-xs font-medium text-app-muted">
                Tone (optional)
              </label>
              <Input
                id="ch-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="e.g. confident, warm"
                className="w-full"
                autoComplete="off"
              />
            </div>
          </>
        )}

        {channel === 'x' && (
          <div>
            <label htmlFor="ch-x-tone" className="mb-1 block text-xs font-medium text-app-muted">
              Tone (optional)
            </label>
            <Input
              id="ch-x-tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="e.g. punchy, helpful"
              className="w-full"
              autoComplete="off"
            />
          </div>
        )}

        {channel === 'blog' && (
          <div>
            <label htmlFor="ch-angle" className="mb-1 block text-xs font-medium text-app-muted">
              Angle (optional)
            </label>
            <Input
              id="ch-angle"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder="e.g. thought leadership vs how-to"
              className="w-full"
              autoComplete="off"
            />
          </div>
        )}

        {channel === 'ads' && (
          <>
            <div>
              <label htmlFor="ch-product" className="mb-1 block text-xs font-medium text-app-muted">
                Product / topic <span className="text-red-400">*</span>
              </label>
              <Input
                id="ch-product"
                value={productTopic}
                onChange={(e) => setProductTopic(e.target.value)}
                placeholder="e.g. Messign onboarding, spring sale"
                className="w-full"
                autoComplete="off"
              />
              {fieldErrors.productTopic ? (
                <p className="mt-1 text-xs text-red-400">{fieldErrors.productTopic}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="ch-goal" className="mb-1 block text-xs font-medium text-app-muted">
                Campaign goal (optional)
              </label>
              <Input
                id="ch-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. signups, awareness, retargeting"
                className="w-full"
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="ch-platform" className="mb-1 block text-xs font-medium text-app-muted">
                Placement (optional)
              </label>
              <Input
                id="ch-platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                placeholder="e.g. Meta, LinkedIn, display"
                className="w-full"
                autoComplete="off"
              />
            </div>
          </>
        )}

        {channel === 'email' && (
          <>
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
          </>
        )}

        {channel === 'metrics' && (
          <div>
            <label htmlFor="ch-metrics" className="mb-1 block text-xs font-medium text-app-muted">
              What should we analyze? <span className="text-red-400">*</span>
            </label>
            <textarea
              id="ch-metrics"
              value={metricsFocus}
              onChange={(e) => setMetricsFocus(e.target.value)}
              placeholder="e.g. last 30 days paid social vs email; ROI trend; top funnel drop-off"
              rows={4}
              className="input-theme w-full resize-y min-h-[88px] text-sm"
            />
            {fieldErrors.metricsFocus ? (
              <p className="mt-1 text-xs text-red-400">{fieldErrors.metricsFocus}</p>
            ) : null}
          </div>
        )}

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

import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import {
  buildInstagramAgentMessage,
  validateInstagramAgentForm,
  type InstagramAgentFormValues,
} from '@/pages/marketing/lib/buildInstagramAgentMessage';

export interface InstagramAgentPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Primary: send assembled message to the agent. */
  onSend: (message: string) => void;
  /** Optional: only fill the composer for manual edits. */
  onApplyToComposer?: (message: string) => void;
  /** Pre-fill topic (e.g. selected board card title). */
  defaultTopic?: string | null;
}

const FORMAT_OPTIONS: { value: InstagramAgentFormValues['format']; label: string }[] = [
  { value: 'feed', label: 'Feed (1:1 square)' },
  { value: 'story', label: 'Story (9:16)' },
  { value: 'reel', label: 'Reel cover (9:16)' },
];

export function InstagramAgentPromptModal({
  isOpen,
  onClose,
  onSend,
  onApplyToComposer,
  defaultTopic,
}: InstagramAgentPromptModalProps): JSX.Element {
  const [topic, setTopic] = useState('');
  const [heroImageDescription, setHeroImageDescription] = useState('');
  const [tone, setTone] = useState('');
  const [format, setFormat] = useState<InstagramAgentFormValues['format']>('feed');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof InstagramAgentFormValues, string>>>({});

  useEffect(() => {
    if (!isOpen) return;
    setFieldErrors({});
    setTopic((defaultTopic ?? '').trim());
    setHeroImageDescription('');
    setTone('');
    setFormat('feed');
  }, [isOpen, defaultTopic]);

  const values: InstagramAgentFormValues = {
    topic,
    heroImageDescription,
    tone: tone.trim() || undefined,
    format,
  };

  const handleSubmit = useCallback(
    (mode: 'send' | 'composer') => {
      const errs = validateInstagramAgentForm(values);
      setFieldErrors(errs);
      if (Object.keys(errs).length > 0) return;

      const message = buildInstagramAgentMessage(values);
      if (mode === 'send') {
        onSend(message);
      } else {
        onApplyToComposer?.(message);
      }
      onClose();
    },
    [values, onSend, onApplyToComposer, onClose],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Instagram post"
      size="lg"
      forceDark
    >
      <div className="space-y-3 text-sm text-app-text">
        <p className="text-xs text-app-muted leading-relaxed">
          Describe what you want in plain language. We format the request for the agent — including the hero image
          block — so you don&apos;t need to paste <code className="text-[11px] text-pink-300/90">[IMAGE_PROMPT]</code>{' '}
          tags yourself.
        </p>

        <div>
          <label htmlFor="ig-modal-topic" className="mb-1 block text-xs font-medium text-app-muted">
            Topic / goal <span className="text-red-400">*</span>
          </label>
          <Input
            id="ig-modal-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Q2 product launch for small teams"
            className="w-full"
            autoComplete="off"
          />
          {fieldErrors.topic ? <p className="mt-1 text-xs text-red-400">{fieldErrors.topic}</p> : null}
        </div>

        <div>
          <label htmlFor="ig-modal-hero" className="mb-1 block text-xs font-medium text-app-muted">
            Hero image description <span className="text-red-400">*</span>
          </label>
          <textarea
            id="ig-modal-hero"
            value={heroImageDescription}
            onChange={(e) => setHeroImageDescription(e.target.value)}
            placeholder="Subject, setting, lighting, mood, colors — square or vertical matches format below."
            rows={4}
            className="input-theme w-full resize-y min-h-[88px] text-sm"
          />
          {fieldErrors.heroImageDescription ? (
            <p className="mt-1 text-xs text-red-400">{fieldErrors.heroImageDescription}</p>
          ) : (
            <p className="mt-1 text-[10px] text-app-muted">At least 10 characters. No legible text in the image unless you need it.</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="ig-modal-tone" className="mb-1 block text-xs font-medium text-app-muted">
              Tone (optional)
            </label>
            <Input
              id="ig-modal-tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="e.g. confident, playful"
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="ig-modal-format" className="mb-1 block text-xs font-medium text-app-muted">
              Format
            </label>
            <select
              id="ig-modal-format"
              value={format ?? 'feed'}
              onChange={(e) => setFormat(e.target.value as InstagramAgentFormValues['format'])}
              className="input-theme w-full h-[42px] text-sm rounded-lg px-3"
            >
              {FORMAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
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
            className="px-4 py-2 rounded-lg text-sm bg-pink-600 text-white hover:bg-pink-500 font-medium"
          >
            Send to agent
          </button>
        </div>
      </div>
    </Modal>
  );
}

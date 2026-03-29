import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { marketingAPI } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
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
  const user = useAuthStore((s) => s.user);
  const userId = user?.authUserId || user?.id || '';

  const [topic, setTopic] = useState('');
  const [heroImageDescription, setHeroImageDescription] = useState('');
  const [tone, setTone] = useState('');
  const [format, setFormat] = useState<InstagramAgentFormValues['format']>('feed');
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [refUploading, setRefUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof InstagramAgentFormValues, string>>>({});
  const refInputRef = useRef<HTMLInputElement>(null);
  /** Sync guard — set true before any await so Send cannot race ahead of upload. */
  const refUploadInFlightRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      refUploadInFlightRef.current = false;
      return;
    }
    setFieldErrors({});
    setTopic((defaultTopic ?? '').trim());
    setHeroImageDescription('');
    setTone('');
    setFormat('feed');
    setReferenceImageUrl(null);
    setRefUploading(false);
  }, [isOpen, defaultTopic]);

  const values: InstagramAgentFormValues = {
    topic,
    heroImageDescription,
    tone: tone.trim() || undefined,
    format,
    referenceImageUrl,
  };

  const handleReferenceFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !userId) return;
      refUploadInFlightRef.current = true;
      setRefUploading(true);
      try {
        const r = await marketingAPI.uploadLucyReferenceImage(userId, file);
        setReferenceImageUrl(r.reference_image_url);
        toast.success('Photo uploaded', {
          description: 'Lucy will use it as the base for AI edits (Kontext). Describe changes below.',
        });
      } catch (e) {
        toast.error('Upload failed', {
          description: e instanceof Error ? e.message : 'Could not upload image',
        });
      } finally {
        refUploadInFlightRef.current = false;
        setRefUploading(false);
        if (refInputRef.current) refInputRef.current.value = '';
      }
    },
    [userId],
  );

  const handleSubmit = useCallback(
    (mode: 'send' | 'composer') => {
      if (refUploadInFlightRef.current || refUploading) {
        toast.error('Wait for the photo upload to finish', {
          description: 'So Lucy receives your image for Kontext edits.',
        });
        return;
      }
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
    [values, refUploading, onSend, onApplyToComposer, onClose],
  );

  const hasRef = Boolean(referenceImageUrl);

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
          tags yourself. Optionally upload a real photo for AI additive edits (same flow as the Instagram cockpit).
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

        <div
          className="rounded-xl border border-white/[0.08] bg-app-surface-tertiary/80 p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <Camera className="w-3.5 h-3.5 text-app-muted shrink-0" />
            <span className="text-xs font-medium text-app-text">Reference photo (optional)</span>
          </div>
          <p className="text-[10px] text-app-muted leading-relaxed">
            JPEG, PNG, or WebP. Uploaded to your marketing storage; Lucy uses it for FLUX Kontext-style edits when
            generating the hero image. Wait until upload finishes before sending — otherwise your photo is not included.
          </p>
          {refUploading ? (
            <p className="text-[10px] text-amber-400/90" role="status">
              Uploading reference photo… Send and Insert stay disabled until this completes.
            </p>
          ) : null}
          <input
            ref={refInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={refUploading || !userId}
            onChange={(e) => void handleReferenceFile(e.target.files?.[0])}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={refUploading || !userId}
              onClick={() => refInputRef.current?.click()}
              className="rounded-lg border border-pink-500/35 bg-pink-950/30 px-3 py-1.5 text-[11px] font-medium text-pink-100 hover:bg-pink-950/50 disabled:opacity-50"
            >
              {refUploading ? 'Uploading…' : 'Choose photo'}
            </button>
            {hasRef ? (
              <span className="text-[10px] text-emerald-400/90">Ready — describe edits below</span>
            ) : (
              <span className="text-[10px] text-app-muted">No photo selected</span>
            )}
            {hasRef ? (
              <button
                type="button"
                className="text-[10px] text-app-muted underline underline-offset-2 hover:text-app-text"
                onClick={() => setReferenceImageUrl(null)}
              >
                Remove
              </button>
            ) : null}
          </div>
          {hasRef && referenceImageUrl ? (
            <img
              src={referenceImageUrl}
              alt=""
              className="max-h-24 rounded-lg border border-white/[0.06] object-cover"
            />
          ) : null}
        </div>

        <div>
          <label htmlFor="ig-modal-hero" className="mb-1 block text-xs font-medium text-app-muted">
            {hasRef ? 'Visual / edit instructions' : 'Hero image description'}{' '}
            <span className="text-red-400">*</span>
          </label>
          <textarea
            id="ig-modal-hero"
            value={heroImageDescription}
            onChange={(e) => setHeroImageDescription(e.target.value)}
            placeholder={
              hasRef
                ? 'What to add, change, or emphasize on the photo — lighting, mood, subject, and aspect note.'
                : 'Subject, setting, lighting, mood, colors — square or vertical matches format below.'
            }
            rows={4}
            className="input-theme w-full resize-y min-h-[88px] text-sm"
          />
          {fieldErrors.heroImageDescription ? (
            <p className="mt-1 text-xs text-red-400">{fieldErrors.heroImageDescription}</p>
          ) : (
            <p className="mt-1 text-[10px] text-app-muted">
              {hasRef
                ? `At least 5 characters when a reference photo is attached. No legible text in the image unless you need it.`
                : `At least 10 characters. No legible text in the image unless you need it.`}
            </p>
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
              disabled={refUploading}
              title={refUploading ? 'Wait for photo upload' : undefined}
              className="px-4 py-2 rounded-lg text-sm border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-45 disabled:pointer-events-none"
            >
              Insert into composer
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => handleSubmit('send')}
            disabled={refUploading}
            title={refUploading ? 'Wait for photo upload' : undefined}
            className="px-4 py-2 rounded-lg text-sm bg-pink-600 text-app-text hover:bg-pink-500 font-medium disabled:opacity-45 disabled:pointer-events-none"
          >
            {refUploading ? 'Uploading photo…' : 'Send to Lucy'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

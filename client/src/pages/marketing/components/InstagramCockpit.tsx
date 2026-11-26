// ============================================================================
// Instagram Cockpit — InstagramCockpit.tsx
// ============================================================================
// High-fidelity Instagram post preview with image generation controls.
// Renders inside the Marketing Command Center's ActiveContentViewport
// when channel === 'instagram'.
//
// File: client/src/pages/marketing/components/InstagramCockpit.tsx
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { Camera, Download, Sparkles } from 'lucide-react';
import { IMAGE_ENGINE_LABEL, imageEngineOptions, type ImageEngine } from '../lib/imageEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstagramCockpitProps {
  /** Post caption text (includes hashtags) */
  caption: string;
  /** URL of the generated image (null = not yet generated) */
  imageUrl: string | null;
  /** The prompt used/proposed for image generation */
  imagePrompt: string | null;
  /** Whether image is currently being generated */
  isGenerating?: boolean;
  /** Callback to regenerate image with edited prompt */
  onRegenerateImage?: (
    newPrompt: string,
    stylePreset: string,
    extras?: { mock?: boolean; image_provider?: ImageEngine },
  ) => void;
  /** Engines the server reported as connected. Empty shows every engine. */
  imageEngines?: readonly Exclude<ImageEngine, 'all'>[];
  /** Callback when caption is edited */
  onCaptionEdit?: (newCaption: string) => void;
  /** Callback to approve and queue */
  onApprove?: () => void;
  /** Content ID for reference */
  contentId?: string;
  /** Post title — used to build a default image prompt when the agent did not set `image_prompt`. */
  contentTitle?: string | null;
  /** Shop logo placed on new stills. */
  brandLogoUrl?: string | null;
  /** Upload a JPEG/PNG/WebP logo. The file is placed on later stills. */
  onUploadBrandLogo?: (file: File) => Promise<void>;
  /** Public URL after user uploaded a real-world reference photo (Kontext input). */
  referenceImageUrl?: string | null;
  /** Upload a JPEG/PNG/WebP; parent persists via API and updates `referenceImageUrl`. */
  onUploadReferenceImage?: (file: File) => Promise<void>;
  /** Run FLUX Kontext on `referenceImageUrl` with the given instruction. */
  /** Second arg is style preset (same values as regenerate), sent to Kontext as `style_preset`. */
  onApplyAiPhotoEdit?: (editPrompt: string, stylePreset: string) => Promise<void>;
  /** Look saved on the sheet. The regenerate menu opens on this value. */
  initialLook?: string | null;
  className?: string;
}

/** Server requires ≥10 chars for regenerate-image; used when `image_prompt` is missing. */
function buildFallbackImagePrompt(caption: string, title?: string | null): string {
  const c = caption.trim();
  if (c.length >= 10) return c.slice(0, 500);
  const t = (title ?? '').trim();
  if (t.length > 0) {
    return `Eye-catching Instagram square image for "${t.slice(0, 120)}": premium brand aesthetic, bold composition, soft lighting, no text in the image.`;
  }
  return 'Premium Instagram feed image: bold composition, brand-safe, square 1:1, cinematic lighting, no overlaid text in frame.';
}

// ---------------------------------------------------------------------------
// Style presets for the dropdown
// ---------------------------------------------------------------------------

/** Short snippets appended to the AI photo edit prompt — explicit shadows/material beat vague “add X”. */
const AI_PHOTO_REALISM_CHIPS: ReadonlyArray<{ label: string; snippet: string }> = [
  {
    label: '+Shadows',
    snippet:
      'Include a soft contact shadow on the surface beneath the object; penumbra must match other shadows in the frame.',
  },
  {
    label: '+Paper texture',
    snippet: 'Matte folded paper with subtle creases and edge thickness — not a flat vector or sticker.',
  },
  {
    label: '+Match light',
    snippet: 'Match highlight direction and color temperature to the existing scene; no neon or poster saturation.',
  },
  {
    label: '+Camera match',
    snippet:
      'Match the background sharpness and ISO noise — the object must not look cleaner or more “3D render” than the rest of the photo.',
  },
];

const STYLE_PRESETS = [
  { value: 'photoreal', label: 'Photoreal', desc: 'Natural light, documentary photo look' },
  { value: 'modern_noir', label: 'Modern Noir', desc: 'Dark tones, purple accents, studio glow' },
  { value: 'vibrant_lifestyle', label: 'Vibrant Lifestyle', desc: 'Warm golden-hour, saturated colors' },
  { value: 'minimal_flat', label: 'Minimal Flat-Lay', desc: 'Top-down, clean surface, editorial' },
  { value: 'editorial', label: 'Editorial', desc: 'Dramatic lighting, cinematic grading' },
  { value: 'product_spotlight', label: 'Product Spotlight', desc: 'Clean background, hero light, sharp product' },
  { value: 'team_culture', label: 'Team Culture', desc: 'Workplace light, candid people' },
  { value: 'data_viz', label: 'Data Visualization', desc: 'Abstract geometry, glowing lines' },
  { value: 'seasonal', label: 'Seasonal', desc: 'Season in the light, color, and props' },
  { value: 'ugc_style', label: 'Phone Camera', desc: 'Natural light, mild grain, imperfect framing' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InstagramCockpit({
  caption,
  imageUrl,
  imagePrompt,
  isGenerating = false,
  onRegenerateImage,
  onCaptionEdit: _onCaptionEdit,
  onApprove,
  contentId,
  contentTitle,
  brandLogoUrl,
  onUploadBrandLogo,
  referenceImageUrl,
  onUploadReferenceImage,
  onApplyAiPhotoEdit,
  initialLook,
  imageEngines,
  className,
}: InstagramCockpitProps) {
  const [isPromptEditorOpen, setPromptEditorOpen] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(() => imagePrompt ?? buildFallbackImagePrompt(caption, contentTitle));
  const [selectedStyle, setSelectedStyle] = useState(() =>
    STYLE_PRESETS.some((preset) => preset.value === initialLook) ? (initialLook as string) : 'photoreal',
  );
  const [mockImage, setMockImage] = useState(false);
  const engines = imageEngineOptions(imageEngines);
  const [engine, setEngine] = useState<ImageEngine>('fal');
  const selectedEngine = engines.includes(engine) ? engine : (engines[0] ?? 'fal');
  const [refUploading, setRefUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [aiEditBusy, setAiEditBusy] = useState(false);
  const [aiEditPrompt, setAiEditPrompt] = useState('');
  const refInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync from server; when `image_prompt` is absent, pre-fill a valid prompt so Regenerate works (server min 10 chars).
  useEffect(() => {
    if (imagePrompt) setEditedPrompt(imagePrompt);
    else setEditedPrompt(buildFallbackImagePrompt(caption, contentTitle));
  }, [imagePrompt, caption, contentTitle, contentId]);

  // Auto-focus prompt editor when opened
  useEffect(() => {
    if (isPromptEditorOpen && promptTextareaRef.current) {
      promptTextareaRef.current.focus();
      promptTextareaRef.current.selectionStart = promptTextareaRef.current.value.length;
    }
  }, [isPromptEditorOpen]);

  const handleRegenerate = useCallback(() => {
    if (onRegenerateImage && editedPrompt.trim().length > 10) {
      onRegenerateImage(editedPrompt.trim(), selectedStyle, { mock: mockImage, image_provider: selectedEngine });
      setPromptEditorOpen(false);
    }
  }, [editedPrompt, selectedStyle, onRegenerateImage, mockImage, selectedEngine]);

  const handleLogoFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !onUploadBrandLogo) return;
      setLogoUploading(true);
      try {
        await onUploadBrandLogo(file);
      } finally {
        setLogoUploading(false);
        if (logoInputRef.current) logoInputRef.current.value = '';
      }
    },
    [onUploadBrandLogo],
  );

  const handleReferenceFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !onUploadReferenceImage) return;
      setRefUploading(true);
      try {
        await onUploadReferenceImage(file);
      } finally {
        setRefUploading(false);
        if (refInputRef.current) refInputRef.current.value = '';
      }
    },
    [onUploadReferenceImage],
  );

  const handleAiPhotoEdit = useCallback(async () => {
    const q = aiEditPrompt.trim();
    if (q.length < 10 || !onApplyAiPhotoEdit) return;
    setAiEditBusy(true);
    try {
      await onApplyAiPhotoEdit(q, selectedStyle);
    } finally {
      setAiEditBusy(false);
    }
  }, [aiEditPrompt, onApplyAiPhotoEdit, selectedStyle]);

  const appendAiRealismChip = useCallback((snippet: string) => {
    setAiEditPrompt((prev) => {
      const t = prev.trim();
      return t ? `${t} ${snippet}` : snippet;
    });
  }, []);

  const handleDownloadImage = useCallback(async () => {
    if (!imageUrl) return;
    const base = contentId?.slice(0, 8) ?? 'instagram-image';
    try {
      const res = await fetch(imageUrl, { mode: 'cors' });
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const ext = blob.type?.includes('png')
        ? 'png'
        : blob.type?.includes('jpeg') || blob.type?.includes('jpg')
          ? 'jpg'
          : blob.type?.includes('webp')
            ? 'webp'
            : 'png';
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${base}.${ext}`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
    }
  }, [imageUrl, contentId]);

  const charCount = caption.length;
  const isOverLimit = charCount > 2200;

  return (
    <div className={`ig-cockpit ${className ?? ''}`} style={styles.root}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.channelBadge}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <path d="m16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
            <span>Instagram Post</span>
          </div>
        </div>
        <div style={styles.headerRight}>
          <span style={{
            ...styles.charCount,
            color: isOverLimit ? '#ef4444' : charCount > 2000 ? '#f59e0b' : '#78716c',
          }}>
            {charCount.toLocaleString()} / 2,200
          </span>
        </div>
      </div>


      {/* ── Controls Panel ─────────────────────────────────────── */}
      <div style={styles.controls}>
        {onUploadReferenceImage && contentId && (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 10,
              border: '1px solid #e7e0d6',
              background: '#ffffff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1c1917' }}>Brand logo</span>
            </div>
            <p style={{ fontSize: 11, color: '#78716c', marginBottom: 10, lineHeight: 1.45 }}>
              Attach the shop logo. It is placed on new stills. The picture does not paint a brand name.
            </p>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              data-testid="brand-logo-file"
              disabled={logoUploading}
              onChange={(e) => void handleLogoFile(e.target.files?.[0])}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <button
                type="button"
                data-testid="brand-logo-attach"
                disabled={logoUploading || !onUploadBrandLogo}
                onClick={() => logoInputRef.current?.click()}
                style={{
                  ...styles.controlBtn,
                  fontSize: 11,
                  padding: '6px 12px',
                  opacity: logoUploading ? 0.6 : 1,
                }}
              >
                {logoUploading ? 'Uploading…' : 'Attach logo'}
              </button>
              {brandLogoUrl ? (
                <span style={{ fontSize: 10, color: '#166534' }}>Logo saved</span>
              ) : (
                <span style={{ fontSize: 10, color: '#78716c' }}>No logo yet</span>
              )}
            </div>
            {brandLogoUrl ? (
              <img
                src={brandLogoUrl}
                alt="Shop logo"
                data-testid="brand-logo-preview"
                style={{ maxHeight: 64, maxWidth: 180, objectFit: 'contain', marginBottom: 14 }}
              />
            ) : null}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Camera size={14} style={{ opacity: 0.85 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1c1917' }}>Real photo (AI additive edit)</span>
            </div>
            <p style={{ fontSize: 11, color: '#78716c', marginBottom: 10, lineHeight: 1.45 }}>
              Upload a picture from your phone or camera. Then describe what to add — e.g. a paper plane in the sky, or a bear near the desk. Uses FLUX Kontext to blend into your scene.
            </p>
            <input
              ref={refInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={refUploading}
              onChange={(e) => void handleReferenceFile(e.target.files?.[0])}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <button
                type="button"
                disabled={refUploading}
                onClick={() => refInputRef.current?.click()}
                style={{
                  ...styles.controlBtn,
                  fontSize: 11,
                  padding: '6px 12px',
                  opacity: refUploading ? 0.6 : 1,
                }}
              >
                {refUploading ? 'Uploading…' : 'Choose photo'}
              </button>
              {referenceImageUrl ? (
                <span style={{ fontSize: 10, color: '#166534', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Reference saved
                </span>
              ) : (
                <span style={{ fontSize: 10, color: '#78716c' }}>No reference yet</span>
              )}
            </div>
            {referenceImageUrl && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: 'column' }}>
                <img
                  src={referenceImageUrl}
                  alt="Your reference"
                  style={{ maxHeight: 96, maxWidth: '100%', borderRadius: 8, objectFit: 'cover', border: '1px solid #e7e0d6' }}
                />
                <label style={{ fontSize: 10, color: '#78716c', alignSelf: 'stretch' }} htmlFor={`ig-ai-style-${contentId ?? 'x'}`}>
                  Style preset (AI edit — same as regenerate)
                </label>
                <select
                  id={`ig-ai-style-${contentId ?? 'x'}`}
                  value={selectedStyle}
                  onChange={(e) => setSelectedStyle(e.target.value)}
                  style={{
                    width: '100%',
                    fontSize: 11,
                    color: '#1c1917',
                    background: '#ffffff',
                    border: '1px solid #e7e0d6',
                    borderRadius: 8,
                    padding: '6px 10px',
                  }}
                >
                  {STYLE_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <textarea
                  value={aiEditPrompt}
                  onChange={(e) => setAiEditPrompt(e.target.value)}
                  placeholder="e.g. Small red paper plane on the cobblestones — matte folded paper, match the sun direction and shadows in this photo"
                  rows={2}
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    minHeight: 52,
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #e7e0d6',
                    background: '#ffffff',
                    color: '#1c1917',
                    fontSize: 12,
                    lineHeight: 1.4,
                  }}
                />
                <p style={{ fontSize: 10, color: '#78716c', margin: 0, lineHeight: 1.45 }}>
                  Vague prompts often look flat. Tap a chip to add shadow/lighting language, or write your own.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {AI_PHOTO_REALISM_CHIPS.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      disabled={aiEditBusy}
                      onClick={() => appendAiRealismChip(c.snippet)}
                      style={{
                        fontSize: 10,
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid #e7e0d6',
                        background: '#f4efe8',
                        color: '#44403c',
                        cursor: aiEditBusy ? 'not-allowed' : 'pointer',
                        opacity: aiEditBusy ? 0.5 : 1,
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={aiEditBusy || aiEditPrompt.trim().length < 10}
                  onClick={() => void handleAiPhotoEdit()}
                  style={{
                    ...styles.controlBtn,
                    ...styles.controlBtnPrimary,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    opacity: aiEditBusy || aiEditPrompt.trim().length < 10 ? 0.5 : 1,
                  }}
                >
                  <Sparkles size={14} />
                  {aiEditBusy ? 'Applying AI…' : 'Apply AI to photo'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Regenerate Image */}
        <button
          style={{
            ...styles.controlBtn,
            ...styles.controlBtnPrimary,
            opacity: isGenerating ? 0.5 : 1,
          }}
          disabled={isGenerating}
          onClick={() => setPromptEditorOpen(!isPromptEditorOpen)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          {isPromptEditorOpen ? 'Close editor' : 'Regenerate image'}
        </button>

        {/* Approve */}
        {imageUrl && !isGenerating && (
          <button
            type="button"
            style={{ ...styles.controlBtn, ...styles.controlBtnSecondary }}
            onClick={() => void handleDownloadImage()}
            title="Download image"
          >
            <Download size={14} strokeWidth={2} />
            Download
          </button>
        )}

        {onApprove && (
          <button
            style={{
              ...styles.controlBtn,
              ...styles.controlBtnSuccess,
              opacity: (!imageUrl && !isGenerating) ? 0.5 : 1,
            }}
            disabled={!imageUrl && !isGenerating}
            onClick={onApprove}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Approve for queue
          </button>
        )}
      </div>

      {/* ── Prompt Editor (collapsible) ────────────────────────── */}
      {isPromptEditorOpen && (
        <div style={styles.promptEditor}>
          <label style={styles.promptLabel}>Image generation prompt</label>
          <textarea
            ref={promptTextareaRef}
            value={editedPrompt}
            onChange={(e) => setEditedPrompt(e.target.value)}
            style={styles.promptTextarea}
            rows={6}
            placeholder="Describe the visual: subject, composition, lighting, mood, colors..."
          />

          <div style={styles.promptControls}>
            <div style={styles.styleSelector}>
              <label style={styles.styleSelectorLabel}>Style preset</label>
              <div style={styles.styleGrid}>
                {STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    style={{
                      ...styles.styleOption,
                      ...(selectedStyle === preset.value ? styles.styleOptionActive : {}),
                    }}
                    onClick={() => setSelectedStyle(preset.value)}
                  >
                    <span style={styles.styleOptionLabel}>{preset.label}</span>
                    <span style={styles.styleOptionDesc}>{preset.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#78716c' }}>
              Image engine
              <select
                aria-label="Image engine"
                value={selectedEngine}
                onChange={(e) => setEngine(e.target.value as ImageEngine)}
                style={{ fontSize: 12, color: '#1c1917', background: '#fff', border: '1px solid #e7e0d6', borderRadius: 8, padding: '4px 8px' }}
              >
                {engines.map((id) => (
                  <option key={id} value={id}>{IMAGE_ENGINE_LABEL[id]}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#78716c' }}>
              <input
                type="checkbox"
                checked={mockImage}
                onChange={(e) => setMockImage(e.target.checked)}
              />
              Mock image
            </label>
            <button
              style={{
                ...styles.controlBtn,
                ...styles.controlBtnPrimary,
                width: '100%',
                justifyContent: 'center',
                opacity: editedPrompt.trim().length <= 10 ? 0.5 : 1,
              }}
              disabled={editedPrompt.trim().length <= 10 || isGenerating}
              onClick={handleRegenerate}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              Generate image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Inline styles (CSS-in-JS for portability — convert to Tailwind if preferred)
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    width: '100%',
    maxWidth: '420px',
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid #e7e0d6',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
  },
  channelBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '6px',
    background: '#f4efe8',
    color: '#44403c',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  charCount: {
    fontSize: '11px',
    fontFamily: 'monospace',
    fontWeight: 500,
  },
  controls: {
    display: 'flex',
    gap: '8px',
    padding: '0 16px',
  },
  controlBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid #e7e0d6',
    background: '#ffffff',
    color: '#44403c',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
  },
  controlBtnPrimary: {
    background: '#f4efe8',
    borderColor: '#1c1917',
    color: '#1c1917',
  },
  controlBtnSecondary: {
    background: '#f4efe8',
    borderColor: '#d6d3d1',
    color: '#1c1917',
  },
  controlBtnSuccess: {
    background: '#ecfdf3',
    borderColor: '#bbf7d0',
    color: '#166534',
  },
  promptEditor: {
    margin: '12px 16px 0',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #e7e0d6',
    background: '#ffffff',
  },
  promptLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: '#78716c',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: '8px',
  },
  promptTextarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #e7e0d6',
    background: '#ffffff',
    color: '#1c1917',
    fontSize: '13px',
    lineHeight: '1.6',
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  promptControls: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  styleSelector: {},
  styleSelectorLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: '#a8a29e',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: '8px',
  },
  styleGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px',
  },
  styleOption: {
    padding: '8px 10px',
    borderRadius: '6px',
    border: '1px solid #e7e0d6',
    background: '#ffffff',
    color: '#78716c',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'all 0.15s ease',
    outline: 'none',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  styleOptionActive: {
    borderColor: '#1c1917',
    background: '#f4efe8',
    color: '#1c1917',
  },
  styleOptionLabel: {
    fontSize: '12px',
    fontWeight: 600,
  },
  styleOptionDesc: {
    fontSize: '10px',
    opacity: 0.6,
  },
};

// ---------------------------------------------------------------------------
// CSS keyframes (inject once via a <style> tag or global CSS)
// ---------------------------------------------------------------------------
// Add to your global CSS or inject via useEffect:
//
// @keyframes igPulse {
//   0%, 100% { transform: scale(1); opacity: 0.3; }
//   50% { transform: scale(1.3); opacity: 0.1; }
// }

export default InstagramCockpit;

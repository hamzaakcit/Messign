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
import { Download } from 'lucide-react';

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
  /** Alt text for accessibility */
  altText?: string | null;
  /** Brand handle shown in preview */
  username?: string;
  /** Avatar URL for the brand */
  avatarUrl?: string | null;
  /** Whether image is currently being generated */
  isGenerating?: boolean;
  /** Generation progress message */
  progressMessage?: string;
  /** Callback to regenerate image with edited prompt */
  onRegenerateImage?: (newPrompt: string, stylePreset: string) => void;
  /** Callback when caption is edited */
  onCaptionEdit?: (newCaption: string) => void;
  /** Callback to approve and queue */
  onApprove?: () => void;
  /** Content ID for reference */
  contentId?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Style presets for the dropdown
// ---------------------------------------------------------------------------

const STYLE_PRESETS = [
  { value: 'modern_noir', label: 'Modern Noir', desc: 'Dark tones, purple accents, studio glow' },
  { value: 'vibrant_lifestyle', label: 'Vibrant Lifestyle', desc: 'Warm golden-hour, saturated colors' },
  { value: 'minimal_flat', label: 'Minimal Flat-Lay', desc: 'Top-down, clean surface, editorial' },
  { value: 'editorial', label: 'Editorial', desc: 'Dramatic lighting, cinematic grading' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InstagramCockpit({
  caption,
  imageUrl,
  imagePrompt,
  altText,
  username = 'messign_workspace',
  avatarUrl,
  isGenerating = false,
  progressMessage,
  onRegenerateImage,
  onCaptionEdit: _onCaptionEdit,
  onApprove,
  contentId,
  className,
}: InstagramCockpitProps) {
  const [isPromptEditorOpen, setPromptEditorOpen] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(imagePrompt ?? '');
  const [selectedStyle, setSelectedStyle] = useState('modern_noir');
  const [isExpanded, setIsExpanded] = useState(false);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync external prompt changes
  useEffect(() => {
    if (imagePrompt) setEditedPrompt(imagePrompt);
  }, [imagePrompt]);

  useEffect(() => {
    const id = 'messign-ig-pulse-keyframes';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent =
      '@keyframes igPulse { 0%, 100% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.3); opacity: 0.1; } }';
    document.head.appendChild(el);
  }, []);

  // Auto-focus prompt editor when opened
  useEffect(() => {
    if (isPromptEditorOpen && promptTextareaRef.current) {
      promptTextareaRef.current.focus();
      promptTextareaRef.current.selectionStart = promptTextareaRef.current.value.length;
    }
  }, [isPromptEditorOpen]);

  const handleRegenerate = useCallback(() => {
    if (onRegenerateImage && editedPrompt.trim().length > 10) {
      onRegenerateImage(editedPrompt.trim(), selectedStyle);
      setPromptEditorOpen(false);
    }
  }, [editedPrompt, selectedStyle, onRegenerateImage]);

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

  // Split caption into body + hashtags for display
  const { body: captionBody, hashtags } = splitCaptionAndHashtags(caption);
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
          {contentId && (
            <span style={styles.contentId}>{contentId.slice(0, 8)}</span>
          )}
        </div>
        <div style={styles.headerRight}>
          <span style={{
            ...styles.charCount,
            color: isOverLimit ? '#ef4444' : charCount > 2000 ? '#f59e0b' : '#6b7280',
          }}>
            {charCount.toLocaleString()} / 2,200
          </span>
        </div>
      </div>

      {/* ── Phone Preview Frame ────────────────────────────────── */}
      <div style={styles.previewFrame}>
        <div style={styles.phoneChrome}>
          {/* Profile bar */}
          <div style={styles.profileBar}>
            <div style={styles.avatar}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" style={styles.avatarImg} />
              ) : (
                <div style={styles.avatarFallback}>
                  {username.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <span style={styles.username}>{username}</span>
            <div style={{ flex: 1 }} />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.4 }}>
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </div>

          {/* Image area */}
          <div style={styles.imageContainer}>
            {isGenerating ? (
              <div style={styles.generatingState}>
                <div style={styles.pulseRing} />
                <div style={styles.pulseRingOuter} />
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ position: 'relative', zIndex: 1, opacity: 0.7 }}>
                  <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                  <path d="M3 16V8a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z" />
                </svg>
                <p style={styles.generatingText}>
                  {progressMessage ?? 'Generating visual...'}
                </p>
              </div>
            ) : imageUrl ? (
              <img
                src={imageUrl}
                alt={altText ?? 'Generated Instagram post image'}
                style={styles.postImage}
              />
            ) : (
              <div style={styles.placeholderState}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <p style={styles.placeholderText}>
                  {imagePrompt
                    ? 'Image prompt ready — click Regenerate to generate'
                    : 'No image prompt — agent will generate one'}
                </p>
              </div>
            )}
          </div>

          {/* Action bar (Instagram-style) */}
          <div style={styles.actionBar}>
            <div style={{ display: 'flex', gap: '14px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m22 2-7 20-4-9-9-4z" /><path d="m22 2-11 11" /></svg>
            </div>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
          </div>

          {/* Caption area */}
          <div style={styles.captionArea}>
            <p style={styles.captionText}>
              <span style={styles.captionUsername}>{username}</span>{' '}
              {isExpanded ? captionBody : truncate(captionBody, 125)}
              {captionBody.length > 125 && !isExpanded && (
                <span
                  style={styles.moreBtn}
                  onClick={() => setIsExpanded(true)}
                >
                  ...more
                </span>
              )}
            </p>
            {hashtags.length > 0 && (isExpanded || captionBody.length <= 125) && (
              <p style={styles.hashtagText}>
                {hashtags.join(' ')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Controls Panel ─────────────────────────────────────── */}
      <div style={styles.controls}>
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
              Generate with Nano Banana 2
            </button>
          </div>
        </div>
      )}

      {/* ── Metadata footer ────────────────────────────────────── */}
      <div style={styles.metaFooter}>
        <span>{hashtags.length} hashtags</span>
        <span style={styles.metaDot} />
        <span>{imageUrl ? 'Image ready' : isGenerating ? 'Generating...' : 'No image'}</span>
        <span style={styles.metaDot} />
        <span>1:1 feed post</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitCaptionAndHashtags(caption: string): { body: string; hashtags: string[] } {
  const lines = caption.split('\n');
  const hashtagLine = lines.findIndex(
    (line) => line.trim().startsWith('#') && (line.match(/#/g) ?? []).length >= 3,
  );

  if (hashtagLine === -1) {
    const inlineHashtags = caption.match(/#[\w\u00C0-\u024F]+/g) ?? [];
    return { body: caption, hashtags: inlineHashtags };
  }

  const body = lines.slice(0, hashtagLine).join('\n').trim();
  const hashtagText = lines.slice(hashtagLine).join(' ');
  const hashtags = hashtagText.match(/#[\w\u00C0-\u024F]+/g) ?? [];

  return { body, hashtags };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max);
}

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
    borderBottom: '1px solid rgba(255,255,255,0.06)',
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
    background: 'linear-gradient(135deg, rgba(131,58,180,0.15), rgba(253,29,29,0.1), rgba(252,176,69,0.1))',
    color: '#c084fc',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  contentId: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.25)',
    fontFamily: 'monospace',
  },
  charCount: {
    fontSize: '11px',
    fontFamily: 'monospace',
    fontWeight: 500,
  },
  previewFrame: {
    padding: '16px',
  },
  phoneChrome: {
    borderRadius: '16px',
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.08)',
    background: '#000',
  },
  profileBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    color: '#e5e5e5',
  },
  avatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 700,
  },
  username: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#f5f5f5',
  },
  imageContainer: {
    position: 'relative' as const,
    width: '100%',
    aspectRatio: '1 / 1',
    background: '#111',
    overflow: 'hidden',
  },
  postImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
  },
  generatingState: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    background: 'radial-gradient(ellipse at center, rgba(131,58,180,0.08) 0%, transparent 70%)',
    color: 'rgba(255,255,255,0.5)',
    position: 'relative' as const,
  },
  pulseRing: {
    position: 'absolute' as const,
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    border: '1px solid rgba(192,132,252,0.2)',
    animation: 'igPulse 2s ease-in-out infinite',
  },
  pulseRingOuter: {
    position: 'absolute' as const,
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    border: '1px solid rgba(192,132,252,0.1)',
    animation: 'igPulse 2s ease-in-out infinite 0.5s',
  },
  generatingText: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    position: 'relative' as const,
    zIndex: 1,
  },
  placeholderState: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    color: 'rgba(255,255,255,0.3)',
    padding: '40px',
    textAlign: 'center' as const,
  },
  placeholderText: {
    fontSize: '12px',
    lineHeight: '1.5',
    color: 'rgba(255,255,255,0.25)',
  },
  actionBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    color: '#e5e5e5',
  },
  captionArea: {
    padding: '0 12px 12px',
  },
  captionText: {
    fontSize: '13px',
    lineHeight: '1.5',
    color: '#e5e5e5',
    margin: 0,
    wordBreak: 'break-word' as const,
    whiteSpace: 'pre-wrap' as const,
  },
  captionUsername: {
    fontWeight: 600,
    fontSize: '13px',
    color: '#f5f5f5',
  },
  moreBtn: {
    color: 'rgba(255,255,255,0.4)',
    cursor: 'pointer',
    fontSize: '13px',
  },
  hashtagText: {
    fontSize: '13px',
    lineHeight: '1.5',
    color: '#8b5cf6',
    marginTop: '4px',
    wordBreak: 'break-word' as const,
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
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#d4d4d4',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
  },
  controlBtnPrimary: {
    background: 'rgba(139,92,246,0.12)',
    borderColor: 'rgba(139,92,246,0.25)',
    color: '#c4b5fd',
  },
  controlBtnSecondary: {
    background: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#e5e5e5',
  },
  controlBtnSuccess: {
    background: 'rgba(34,197,94,0.1)',
    borderColor: 'rgba(34,197,94,0.2)',
    color: '#86efac',
  },
  promptEditor: {
    margin: '12px 16px 0',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid rgba(139,92,246,0.15)',
    background: 'rgba(139,92,246,0.04)',
  },
  promptLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: '8px',
  },
  promptTextarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(0,0,0,0.3)',
    color: '#e5e5e5',
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
    color: 'rgba(255,255,255,0.4)',
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
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.2)',
    color: '#a3a3a3',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'all 0.15s ease',
    outline: 'none',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  styleOptionActive: {
    borderColor: 'rgba(139,92,246,0.4)',
    background: 'rgba(139,92,246,0.08)',
    color: '#c4b5fd',
  },
  styleOptionLabel: {
    fontSize: '12px',
    fontWeight: 600,
  },
  styleOptionDesc: {
    fontSize: '10px',
    opacity: 0.6,
  },
  metaFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    fontSize: '11px',
    color: 'rgba(255,255,255,0.25)',
    borderTop: '1px solid rgba(255,255,255,0.04)',
    marginTop: '8px',
  },
  metaDot: {
    width: '3px',
    height: '3px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
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

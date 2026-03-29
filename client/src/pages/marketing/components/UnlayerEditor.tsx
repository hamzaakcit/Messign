import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import EmailEditor, { type EditorRef } from 'react-email-editor';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import type { UnlayerDisplayMode, UnlayerStarterTemplate } from '../unlayerTemplates/types';
import { UnlayerTemplatePicker } from './UnlayerTemplatePicker';
import { resolvePublicAssetUrl } from '../../../lib/resolvePublicAssetUrl';
import { runEmailAssemblyPipeline } from '../lib/designAssembler';
import type { DesignManifest } from '../lib/types/manifestTypes';

export type UnlayerExportPayload = {
  html: string;
  design: Record<string, unknown>;
};

export type { UnlayerDisplayMode };

export type UnlayerEditorProps = {
  displayMode: UnlayerDisplayMode;
  /** Remount the embedded editor when switching entities */
  editorKey?: string;
  initialDesign?: Record<string, unknown> | null;
  initialHtml?: string;
  onApply: (payload: UnlayerExportPayload) => void;
  user?: { id?: string; name?: string; email?: string };
  /**
   * For displayMode `popup`, pass a stable unique id when exporting HTML so Unlayer can avoid CSS
   * conflicts (see Unlayer exportHtml options). Typically the saved row UUID.
   */
  exportPopupId?: string;
  /** When set and there is no saved design/HTML, show Messign starter template grid before the editor. */
  starterTemplates?: UnlayerStarterTemplate[];
  /** Called when user triggers AI image regeneration from the editor. Returns the new image URL. */
  onRegenerateImage?: (prompt: string) => Promise<string | null>;
  /** Fired when a manifest-based starter template is assembled so the parent can track the manifest (runs in an effect, not during render). */
  onManifestAssembled?: (manifest: Record<string, unknown>, assemblyResult: Record<string, unknown>) => void | Promise<void>;
  /** When true, blocks interaction with the template picker and editor (e.g. while images resolve). */
  interactionLocked?: boolean;
};

export type UnlayerEditorHandle = {
  exportNow: () => Promise<UnlayerExportPayload>;
  /** Programmatically load a new design into the embedded Unlayer editor. Returns true on success. */
  loadDesign: (design: Record<string, unknown>) => boolean;
};

function parseProjectId(raw: string | undefined): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function hasDesignContent(design: Record<string, unknown> | null | undefined): boolean {
  if (design == null || typeof design !== 'object') return false;
  return Object.keys(design).length > 0;
}

type UnlayerExportHtmlFn = (
  callback: (data: { html: string; design?: unknown }) => void,
  options?: { popupId?: string },
) => void;

function tryLoadHtmlDesign(
  unlayer: NonNullable<EditorRef['editor']>,
  html: string,
): boolean {
  const loadDesign = unlayer.loadDesign as (data: Record<string, unknown>) => void;
  try {
    loadDesign({ html, classic: true } as Record<string, unknown>);
    return true;
  } catch {
    try {
      loadDesign({ html } as Record<string, unknown>);
      return true;
    } catch {
      return false;
    }
  }
}

export const UnlayerEditor = forwardRef<UnlayerEditorHandle, UnlayerEditorProps>(function UnlayerEditor(
  {
    displayMode,
    editorKey,
    initialDesign,
    initialHtml,
    onApply,
    user,
    exportPopupId,
    starterTemplates,
    onRegenerateImage,
    onManifestAssembled,
    interactionLocked,
  },
  ref,
) {
  const emailEditorRef = useRef<EditorRef>(null);
  const [aiImageModalOpen, setAiImageModalOpen] = useState(false);
  const [aiImageDraft, setAiImageDraft] = useState('');
  const aiImageDoneRef = useRef<((data: { progress: number; url?: string }) => void) | null>(null);
  /** Unlayer instance from `onReady(unlayer)` — `emailEditorRef.current?.editor` is often still undefined there (see unlayer/react-email-editor#248). */
  const unlayerFromReadyRef = useRef<NonNullable<EditorRef['editor']> | null>(null);
  /**
   * UI gate for Apply: true when embed is usable for the current `editorMountKey` + `retryCount`.
   * We store which mount generation is ready instead of a boolean so parent `useEffect` cannot reset
   * readiness *after* Unlayer `onReady` (child runs before parent effects — last writer was `false`).
   * `react-email-editor` onReady can miss — we also poll ref + timeout fallback.
   */
  const [exportReadyMountKey, setExportReadyMountKey] = useState<string | null>(null);
  const [editorLoadError, setEditorLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const projectId = useMemo(() => parseProjectId(import.meta.env.VITE_UNLAYER_PROJECT_ID), []);
  const [pickedStarterId, setPickedStarterId] = useState<string | null>(null);

  /** Stable ref so parent callback identity changes do not re-fire manifest assembly (duplicate toasts + extra work). */
  const onManifestAssembledRef = useRef(onManifestAssembled);
  useEffect(() => {
    onManifestAssembledRef.current = onManifestAssembled;
  }, [onManifestAssembled]);

  /** Starter list often gets a new array identity each parent render; do not re-run manifest notify effect for that. */
  const starterTemplatesRef = useRef(starterTemplates);
  useEffect(() => {
    starterTemplatesRef.current = starterTemplates;
  }, [starterTemplates]);

  const shouldOfferPicker =
    Boolean(starterTemplates?.length) &&
    !hasDesignContent(initialDesign ?? null) &&
    !initialHtml?.trim();

  useEffect(() => {
    setPickedStarterId(null);
  }, [editorKey]);

  const resolvedFromPick = useMemo(() => {
    if (!shouldOfferPicker || pickedStarterId == null || !starterTemplates?.length) return null;
    const t = starterTemplates.find((s) => s.id === pickedStarterId);
    if (t?.htmlImportUrl) return null;
    if (t?.manifest) {
      try {
        const result = runEmailAssemblyPipeline(t.manifest as unknown as DesignManifest);
        if (result.success && result.design) {
          return result.design as unknown as Record<string, unknown>;
        }
      } catch (err) {
        console.error('[UnlayerEditor] runEmailAssemblyPipeline crashed for manifest template:', err);
        toast.error('Failed to assemble template design. Try a different template.');
        return null;
      }
    }
    return t?.design ?? null;
  }, [shouldOfferPicker, pickedStarterId, starterTemplates]);

  useEffect(() => {
    if (!shouldOfferPicker || pickedStarterId == null) return;
    const templates = starterTemplatesRef.current;
    if (!templates?.length) return;
    const cb = onManifestAssembledRef.current;
    if (!cb) return;
    const t = templates.find((s) => s.id === pickedStarterId);
    if (!t?.manifest) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = runEmailAssemblyPipeline(t.manifest as unknown as DesignManifest);
        if (cancelled || !result.success || !result.design) return;
        await Promise.resolve(
          cb(t.manifest as Record<string, unknown>, result as unknown as Record<string, unknown>),
        );
        if (cancelled) return;
      } catch (err) {
        console.error('[UnlayerEditor] onManifestAssembled failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldOfferPicker, pickedStarterId]);

  const effectiveInitialDesign = shouldOfferPicker && pickedStarterId != null ? resolvedFromPick : initialDesign;

  const pickedTemplate = useMemo(() => {
    if (!shouldOfferPicker || pickedStarterId == null || !starterTemplates?.length) return null;
    return starterTemplates.find((s) => s.id === pickedStarterId) ?? null;
  }, [shouldOfferPicker, pickedStarterId, starterTemplates]);

  const closeAiImageModal = useCallback(() => {
    const done = aiImageDoneRef.current;
    aiImageDoneRef.current = null;
    if (done) done({ progress: 0 });
    setAiImageModalOpen(false);
    setAiImageDraft('');
  }, []);

  const submitAiImageModal = useCallback(async () => {
    const done = aiImageDoneRef.current;
    const prompt = aiImageDraft.trim();
    if (!onRegenerateImage || !done) {
      closeAiImageModal();
      return;
    }
    if (prompt.length < 10) {
      toast.error('Image prompt must be at least 10 characters');
      return;
    }
    aiImageDoneRef.current = null;
    setAiImageModalOpen(false);
    setAiImageDraft('');
    done({ progress: 50 });
    try {
      const url = await onRegenerateImage(prompt);
      if (url) {
        done({ progress: 100, url });
      } else {
        done({ progress: 0 });
        toast.error('Image generation failed');
      }
    } catch {
      done({ progress: 0 });
      toast.error('Image generation failed');
    }
  }, [aiImageDraft, onRegenerateImage, closeAiImageModal]);

  const exportNow = useCallback(async (): Promise<UnlayerExportPayload> => {
    const getEditor = (): NonNullable<EditorRef['editor']> | undefined =>
      unlayerFromReadyRef.current ?? emailEditorRef.current?.editor ?? undefined;

    const waitForEditor = (): Promise<NonNullable<EditorRef['editor']>> =>
      new Promise((resolve, reject) => {
        const tryOnce = (): NonNullable<EditorRef['editor']> | undefined => getEditor();
        const ed = tryOnce();
        if (ed) {
          resolve(ed);
          return;
        }
        const timeout = setTimeout(() => {
          clearInterval(poll);
          reject(new Error('Editor is still loading.'));
        }, 30_000);
        const poll = setInterval(() => {
          const next = tryOnce();
          if (next) {
            clearInterval(poll);
            clearTimeout(timeout);
            resolve(next);
          }
        }, 200);
      });

    const editor = await waitForEditor();
    await new Promise((r) => setTimeout(r, 600));

    return new Promise<UnlayerExportPayload>((resolve, reject) => {
      const exportTimeout = window.setTimeout(() => {
        reject(new Error('Unlayer exportHtml did not return within 60s.'));
      }, 60_000);
      try {
        const popupOpts =
          displayMode === 'popup' && exportPopupId ? { popupId: exportPopupId } : undefined;
        const exportHtml = editor.exportHtml as UnlayerExportHtmlFn;
        exportHtml(
          (data: { html: string; design?: unknown }) => {
            window.clearTimeout(exportTimeout);
            const design =
              data.design && typeof data.design === 'object'
                ? (data.design as Record<string, unknown>)
                : {};
            resolve({ html: data.html, design });
          },
          popupOpts,
        );
      } catch (e) {
        window.clearTimeout(exportTimeout);
        reject(e instanceof Error ? e : new Error('exportHtml failed'));
      }
    });
  }, [displayMode, exportPopupId]);

  const loadDesign = useCallback((design: Record<string, unknown>): boolean => {
    const editor = unlayerFromReadyRef.current ?? emailEditorRef.current?.editor;
    if (!editor) return false;
    try {
      (editor.loadDesign as (d: Record<string, unknown>) => void)(design);
      return true;
    } catch {
      return false;
    }
  }, []);

  useImperativeHandle(ref, () => ({ exportNow, loadDesign }), [exportNow, loadDesign]);

  const applyLabel =
    displayMode === 'email'
      ? 'Email design applied.'
      : displayMode === 'web'
        ? 'Page design applied.'
        : displayMode === 'document'
          ? 'Document design applied.'
          : 'Popup design applied.';

  const handleApply = useCallback(() => {
    void exportNow()
      .then((payload) => {
        onApply(payload);
        toast.success(applyLabel);
      })
      .catch(() =>
        toast.error('Editor is still initializing. Wait a few seconds after the builder appears, then try again.'),
      );
  }, [applyLabel, exportNow, onApply]);

  const handleLoad = useCallback(
    (unlayer: NonNullable<EditorRef['editor']>) => {
      if (pickedTemplate?.htmlImportUrl) {
        const url = resolvePublicAssetUrl(pickedTemplate.htmlImportUrl);
        void fetch(url)
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
          })
          .then((html) => {
            if (tryLoadHtmlDesign(unlayer, html)) return;
            toast.error(
              'Unlayer could not import this HTML (legacy import may be disabled in your embed version). Export design JSON from Unlayer and add it as a JSON starter, or use “Simple message”.',
            );
            unlayer.loadBlank();
          })
          .catch((err: unknown) => {
            console.error('[UnlayerEditor] template fetch', err);
            toast.error(
              `Could not fetch template (${url}). Add files under client/public/marketing/unlayer/… and restart Vite.`,
            );
            unlayer.loadBlank();
          });
        return;
      }
      if (hasDesignContent(effectiveInitialDesign ?? null)) {
        unlayer.loadDesign(effectiveInitialDesign as Record<string, unknown>);
        return;
      }
      unlayer.loadBlank();
    },
    [pickedTemplate, effectiveInitialDesign],
  );

  const showLegacyPreview =
    !hasDesignContent(effectiveInitialDesign ?? null) && Boolean(initialHtml?.trim());

  const intro =
    displayMode === 'email' ? (
      <>
        Design in the visual builder, then apply to save HTML and design JSON. Set{' '}
        <code className="text-[11px] text-app-text/90">VITE_UNLAYER_PROJECT_ID</code> locally and in Vercel; add your
        production domain under Unlayer → Project → Deployment → Allowed Domains.
      </>
    ) : displayMode === 'web' ? (
      <>
        Build a landing page in the visual builder (Page Builder), then apply to save HTML and design JSON. Uses the same{' '}
        <code className="text-[11px] text-app-text/90">VITE_UNLAYER_PROJECT_ID</code> as email; allow your app domain in
        Unlayer → Deployment → Allowed Domains.
      </>
    ) : displayMode === 'document' ? (
      <>
        Create reports, proposals, or contracts in the Document builder (<code className="text-[11px] text-app-text/90">displayMode: document</code>
        ). Apply to save HTML and design JSON. Same project ID and allowed domains as other builders.
      </>
    ) : (
      <>
        Design a popup (Popup Builder). Export uses a unique <code className="text-[11px] text-app-text/90">popupId</code>{' '}
        after save to avoid CSS conflicts when embedding multiple popups. Same project ID and allowed domains as other
        builders.
      </>
    );

  const legacyCopy =
    displayMode === 'email'
      ? 'This campaign has HTML only (no saved Unlayer design). The builder opens blank; preview of the stored HTML is below. Rebuild in the editor and apply once to enable full round-trip editing.'
      : displayMode === 'web'
        ? 'This page has HTML only (no saved Unlayer design). The builder opens blank; preview below. Apply once from the editor to save design JSON for full round-trip editing.'
        : displayMode === 'document'
          ? 'This document has HTML only (no saved Unlayer design). The builder opens blank; preview below. Apply once to save design JSON for full round-trip editing.'
          : 'This popup has HTML only (no saved Unlayer design). The builder opens blank; preview below. Apply once to save design JSON.';

  const previewTitle =
    displayMode === 'email'
      ? 'Email HTML preview'
      : displayMode === 'web'
        ? 'Page HTML preview'
        : displayMode === 'document'
          ? 'Document HTML preview'
          : 'Popup HTML preview';

  const editorMountKey =
    shouldOfferPicker && pickedStarterId != null
      ? `${editorKey ?? 'unlayer'}-${pickedStarterId}`
      : editorKey;

  const embedInstanceKey = `${editorMountKey ?? 'unlayer'}-${retryCount}`;
  const editorExportReady = exportReadyMountKey === embedInstanceKey;

  useEffect(() => {
    setEditorLoadError(false);
    let cancelled = false;
    const mark = () => {
      if (!cancelled) setExportReadyMountKey(embedInstanceKey);
    };
    const hasEditor = (): boolean =>
      Boolean(unlayerFromReadyRef.current || emailEditorRef.current?.editor);
    const poll = window.setInterval(() => {
      if (hasEditor()) {
        window.clearInterval(poll);
        window.setTimeout(mark, 400);
      }
    }, 120);
    const fallback = window.setTimeout(() => {
      if (!cancelled && !hasEditor()) {
        setEditorLoadError(true);
        console.warn('[UnlayerEditor] Editor did not initialize within timeout — CDN may be unreachable or embed script changed.');
      }
      mark();
    }, 15000);
    return () => {
      cancelled = true;
      unlayerFromReadyRef.current = null;
      window.clearInterval(poll);
      window.clearTimeout(fallback);
    };
  }, [embedInstanceKey]);

  if (shouldOfferPicker && pickedStarterId === null) {
    return (
      <div className="relative space-y-3">
        {interactionLocked ? (
          <div
            className="absolute inset-0 z-20 rounded-lg bg-black/60 backdrop-blur-[1px] flex items-start justify-center pt-10 pointer-events-auto"
            role="status"
            aria-live="polite"
            aria-label="Loading"
          >
            <span className="text-xs text-app-text bg-app-surface-tertiary/95 px-3 py-1.5 rounded-lg border border-app-border shadow-lg">
              Generating images…
            </span>
          </div>
        ) : null}
        {!projectId ? (
          <p className="text-xs text-amber-400/90">
            Unlayer project ID is not set — the editor may show branding limits. Add{' '}
            <code className="text-[11px]">VITE_UNLAYER_PROJECT_ID</code> in your env.
          </p>
        ) : null}
        <UnlayerTemplatePicker templates={starterTemplates!} onSelect={setPickedStarterId} />
      </div>
    );
  }

  return (
    <div className="relative space-y-3">
      {interactionLocked ? (
        <div
          className="absolute inset-0 z-20 rounded-lg bg-black/40 backdrop-blur-[1px] flex items-start justify-center pt-10 pointer-events-auto"
          role="status"
          aria-live="polite"
          aria-label="Loading"
        >
          <span className="text-xs text-app-text bg-app-surface-tertiary/95 px-3 py-1.5 rounded-lg border border-app-border shadow-lg">
            Generating images…
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-app-muted max-w-[52rem]">{intro}</p>
        <div className="flex items-center gap-2">
          {shouldOfferPicker && pickedStarterId != null && (
            <button
              type="button"
              onClick={() => setPickedStarterId(null)}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-app-surface-tertiary text-app-text hover:bg-app-hover"
            >
              Change template
            </button>
          )}
          <button
            type="button"
            disabled={!editorExportReady}
            title={!editorExportReady ? 'Wait until the Unlayer builder finishes loading' : undefined}
            onClick={handleApply}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {editorExportReady ? 'Apply HTML & design' : 'Loading builder…'}
          </button>
        </div>
      </div>
      {!projectId ? (
        <p className="text-xs text-amber-400/90">
          Unlayer project ID is not set — the editor may show branding limits. Add{' '}
          <code className="text-[11px]">VITE_UNLAYER_PROJECT_ID</code> in your env.
        </p>
      ) : null}
      {showLegacyPreview ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-app-muted space-y-2">
          <p>{legacyCopy}</p>
          <details>
            <summary className="cursor-pointer text-app-text/90">Preview saved HTML</summary>
            <iframe
              title={previewTitle}
              className="mt-2 w-full min-h-[200px] rounded border border-app-border bg-white"
              sandbox="allow-same-origin"
              srcDoc={initialHtml ?? ''}
            />
          </details>
        </div>
      ) : null}
      {editorLoadError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-app-muted flex items-center justify-between gap-3">
          <span>
            The visual editor is taking longer than expected to load. This can happen if the Unlayer CDN is slow or your network blocks third-party scripts.
          </span>
          <button
            type="button"
            onClick={() => {
              setEditorLoadError(false);
              setExportReadyMountKey(null);
              setRetryCount((c) => c + 1);
            }}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
          >
            Retry
          </button>
        </div>
      )}
      <div
        className="rounded-lg border border-app-border bg-app-card overflow-hidden w-full"
        style={{ minHeight: 700, minWidth: 'min(100%, 1024px)' }}
      >
        <EmailEditor
          key={embedInstanceKey}
          ref={emailEditorRef}
          minHeight={700}
          options={{
            ...(projectId != null ? { projectId } : {}),
            displayMode,
            ...(user?.id || user?.email
              ? {
                  user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                  },
                }
              : {}),
          }}
          onLoad={handleLoad}
          onReady={(unlayer) => {
            unlayerFromReadyRef.current = unlayer;
            setExportReadyMountKey(embedInstanceKey);
            setEditorLoadError(false);
            if (onRegenerateImage) {
              if (typeof (unlayer as Record<string, unknown>).registerCallback === 'function') {
                (unlayer as Record<string, unknown> & { registerCallback: (name: string, cb: (file: File, done: (data: { progress: number; url?: string }) => void) => void) => void })
                  .registerCallback('image', (_file: File, done: (data: { progress: number; url?: string }) => void) => {
                    const fromName = _file.name?.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') || 'professional product photo';
                    const padded =
                      fromName.length >= 10 ? fromName : `${fromName} — email marketing photograph`;
                    aiImageDoneRef.current = done;
                    setAiImageDraft(padded);
                    setAiImageModalOpen(true);
                  });
              }
            }
          }}
        />
      </div>

      <Modal
        isOpen={aiImageModalOpen && Boolean(onRegenerateImage)}
        onClose={closeAiImageModal}
        title="Generate image with AI"
        size="sm"
      >
        <p className="text-xs text-app-muted mb-2">
          Describe the image you want. Minimum 10 characters (required by the image API).
        </p>
        <textarea
          value={aiImageDraft}
          onChange={(e) => setAiImageDraft(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-app-border bg-app-surface-tertiary px-3 py-2 text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          placeholder="e.g. minimal product hero on soft gradient, no text in frame"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeAiImageModal}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-app-surface-tertiary text-app-text hover:bg-app-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submitAiImageModal()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-500 text-app-text hover:bg-primary-600"
          >
            Generate
          </button>
        </div>
      </Modal>
    </div>
  );
});

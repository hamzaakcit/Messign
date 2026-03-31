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
  /** Same readiness gate as “Apply HTML & design” — use to disable export until the embed iframe is usable. */
  onExportReady?: (ready: boolean) => void;
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
    onExportReady,
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
   * UI gate for Apply / export: set only after a delay once `onReady` fires (or fallback).
   * Do not mark from a short ref poll — `emailEditorRef.editor` / `onLoad` can exist before Unlayer’s
   * internal iframe (`frame`) is attached, which throws on exportHtml.
   */
  const [exportReadyMountKey, setExportReadyMountKey] = useState<string | null>(null);
  const exportReadyTimerRef = useRef<number | null>(null);
  /** If `exportHtml` never invokes its callback (Unlayer quirk), still unblock the UI after this cap. */
  const exportReadyForceTimerRef = useRef<number | null>(null);
  /** Current embed mount id — read in delayed `onReady` callbacks without stale closures. */
  const embedInstanceKeyRef = useRef<string>('');
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
    /**
     * Do not fall back to `emailEditorRef.current?.editor` here: it is often set before Unlayer’s
     * internal iframe (`frame`) exists, which throws "Cannot read properties of undefined (reading 'frame')".
     */
    const getEditor = (): NonNullable<EditorRef['editor']> | undefined =>
      unlayerFromReadyRef.current ?? undefined;

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

    await waitForEditor();
    /** Extra settle — Unlayer’s iframe can lag the JS `unlayer` handle by 1–3s. */
    await new Promise((r) => setTimeout(r, 1200));

    const popupOpts =
      displayMode === 'popup' && exportPopupId ? { popupId: exportPopupId } : undefined;

    const isTransientExportError = (e: unknown): boolean => {
      const msg = e instanceof Error ? e.message : String(e);
      return /Cannot read properties of undefined \(reading 'frame'\)|reading 'frame'|still loading|not ready/i.test(
        msg,
      );
    };

    const MAX_EXPORT_ATTEMPTS = 24;
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_EXPORT_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 500));
      }
      const editor = unlayerFromReadyRef.current;
      if (!editor) {
        lastErr = new Error('Editor is still loading.');
        if (attempt === MAX_EXPORT_ATTEMPTS - 1) {
          throw lastErr;
        }
        continue;
      }
      try {
        const result = await new Promise<UnlayerExportPayload>((resolve, reject) => {
          const exportTimeout = window.setTimeout(() => {
            reject(new Error('Unlayer exportHtml did not return within 60s.'));
          }, 60_000);
          try {
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
        return result;
      } catch (e) {
        lastErr = e;
        if (!isTransientExportError(e) || attempt === MAX_EXPORT_ATTEMPTS - 1) {
          const raw = e instanceof Error ? e.message : String(e);
          if (/reading 'frame'|Cannot read properties of undefined \(reading 'frame'\)/i.test(raw)) {
            throw new Error(
              'The email editor is still attaching its preview. Wait until “Download HTML” is enabled, then try again.',
            );
          }
          throw e instanceof Error ? e : new Error('exportHtml failed');
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('exportHtml failed');
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
      /** Same instance `onReady` will set — needed so export does not use `emailEditorRef.editor` before the iframe exists (Unlayer throws on `.frame`). */
      unlayerFromReadyRef.current = unlayer;
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

  /**
   * Prefer marking ready when `exportHtml` runs (proves iframe is usable). If the callback never
   * fires (seen in the wild), a force timer still enables Apply/Download so the UI cannot hang forever.
   */
  const scheduleExportReadyProbe = useCallback(
    (embedKey: string, opts: { initialDelayMs: number }) => {
      const popupOptsLocal =
        displayMode === 'popup' && exportPopupId ? { popupId: exportPopupId } : undefined;

      const clearProbeTimers = (): void => {
        if (exportReadyTimerRef.current != null) {
          window.clearTimeout(exportReadyTimerRef.current);
          exportReadyTimerRef.current = null;
        }
        if (exportReadyForceTimerRef.current != null) {
          window.clearTimeout(exportReadyForceTimerRef.current);
          exportReadyForceTimerRef.current = null;
        }
      };

      clearProbeTimers();

      const markReadyFromProbe = (): void => {
        if (embedInstanceKeyRef.current !== embedKey) return;
        clearProbeTimers();
        setExportReadyMountKey(embedKey);
      };

      /** ms after `initialDelayMs` — if exportHtml callback never runs, unblock anyway. */
      const FORCE_READY_AFTER_MS = 6000;

      exportReadyForceTimerRef.current = window.setTimeout(() => {
        exportReadyForceTimerRef.current = null;
        if (embedInstanceKeyRef.current !== embedKey) return;
        if (exportReadyTimerRef.current != null) {
          window.clearTimeout(exportReadyTimerRef.current);
          exportReadyTimerRef.current = null;
        }
        setExportReadyMountKey(embedKey);
      }, opts.initialDelayMs + FORCE_READY_AFTER_MS);

      const runProbe = (attempt: number): void => {
        if (embedInstanceKeyRef.current !== embedKey) return;
        const ed = unlayerFromReadyRef.current;
        if (!ed) {
          if (attempt < 45) {
            exportReadyTimerRef.current = window.setTimeout(() => runProbe(attempt + 1), 400);
          }
          return;
        }
        try {
          const exportHtml = ed.exportHtml as UnlayerExportHtmlFn;
          exportHtml(
            () => {
              markReadyFromProbe();
            },
            popupOptsLocal,
          );
        } catch {
          if (attempt < 55) {
            exportReadyTimerRef.current = window.setTimeout(() => runProbe(attempt + 1), 500);
          }
        }
      };

      exportReadyTimerRef.current = window.setTimeout(() => {
        exportReadyTimerRef.current = null;
        runProbe(0);
      }, opts.initialDelayMs);
    },
    [displayMode, exportPopupId],
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
  embedInstanceKeyRef.current = embedInstanceKey;

  const editorExportReady = exportReadyMountKey === embedInstanceKey;
  /** Avoid treating the 15s “fallback mark” as ready while the template grid is shown (no embed mounted yet). */
  const editorExportReadyForActions =
    editorExportReady && (!shouldOfferPicker || pickedStarterId != null);

  useEffect(() => {
    onExportReady?.(editorExportReadyForActions);
    return () => {
      onExportReady?.(false);
    };
  }, [editorExportReadyForActions, onExportReady]);

  useEffect(() => {
    setEditorLoadError(false);
    setExportReadyMountKey(null);
    if (exportReadyTimerRef.current != null) {
      window.clearTimeout(exportReadyTimerRef.current);
      exportReadyTimerRef.current = null;
    }
    if (exportReadyForceTimerRef.current != null) {
      window.clearTimeout(exportReadyForceTimerRef.current);
      exportReadyForceTimerRef.current = null;
    }
    let cancelled = false;
    const key = embedInstanceKey;
    const hasEditor = (): boolean =>
      Boolean(unlayerFromReadyRef.current || emailEditorRef.current?.editor);
    /** If `onReady` never fires, still try the same export probe after 15s. */
    const fallback = window.setTimeout(() => {
      if (cancelled) return;
      if (!hasEditor()) {
        setEditorLoadError(true);
        console.warn('[UnlayerEditor] Editor did not initialize within timeout — CDN may be unreachable or embed script changed.');
        return;
      }
      if (cancelled || embedInstanceKeyRef.current !== key) return;
      scheduleExportReadyProbe(key, { initialDelayMs: 0 });
    }, 15000);
    return () => {
      cancelled = true;
      unlayerFromReadyRef.current = null;
      window.clearTimeout(fallback);
      if (exportReadyTimerRef.current != null) {
        window.clearTimeout(exportReadyTimerRef.current);
        exportReadyTimerRef.current = null;
      }
      if (exportReadyForceTimerRef.current != null) {
        window.clearTimeout(exportReadyForceTimerRef.current);
        exportReadyForceTimerRef.current = null;
      }
    };
  }, [embedInstanceKey, scheduleExportReadyProbe]);

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
            setEditorLoadError(false);
            const key = embedInstanceKey;
            scheduleExportReadyProbe(key, { initialDelayMs: 600 });
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

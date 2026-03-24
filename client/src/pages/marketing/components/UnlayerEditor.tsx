import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import EmailEditor, { type EditorRef } from 'react-email-editor';
import { toast } from 'sonner';
import type { UnlayerDisplayMode, UnlayerStarterTemplate } from '../unlayerTemplates/types';
import { UnlayerTemplatePicker } from './UnlayerTemplatePicker';
import { assembleDesign } from '../lib/designAssembler';
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

/** Build absolute URL for files in `public/` (respects Vite `base`, e.g. `/app/` on deploy). */
function resolvePublicAssetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const basePath = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const p = path.startsWith('/') ? path.slice(1) : path;
  if (typeof window === 'undefined') return `${basePath}${p}`;
  return new URL(p, `${window.location.origin}${basePath}`).href;
}

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
  { displayMode, editorKey, initialDesign, initialHtml, onApply, user, exportPopupId, starterTemplates, onRegenerateImage, onManifestAssembled },
  ref,
) {
  const emailEditorRef = useRef<EditorRef>(null);
  /**
   * UI gate for Apply: true when embed is usable. `react-email-editor` onReady can miss if `editor:ready`
   * fires before the listener is attached — we also poll ref + timeout fallback.
   */
  const [editorExportReady, setEditorExportReady] = useState(false);
  const projectId = useMemo(() => parseProjectId(import.meta.env.VITE_UNLAYER_PROJECT_ID), []);
  const [pickedStarterId, setPickedStarterId] = useState<string | null>(null);

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
        const result = assembleDesign(t.manifest as unknown as DesignManifest);
        if (result.success && result.design) {
          return result.design as unknown as Record<string, unknown>;
        }
      } catch (err) {
        console.error('[UnlayerEditor] assembleDesign crashed for manifest template:', err);
        toast.error('Failed to assemble template design. Try a different template.');
        return null;
      }
    }
    return t?.design ?? null;
  }, [shouldOfferPicker, pickedStarterId, starterTemplates]);

  useEffect(() => {
    if (!shouldOfferPicker || pickedStarterId == null || !starterTemplates?.length || !onManifestAssembled) return;
    const t = starterTemplates.find((s) => s.id === pickedStarterId);
    if (!t?.manifest) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = assembleDesign(t.manifest as unknown as DesignManifest);
        if (cancelled || !result.success || !result.design) return;
        await Promise.resolve(
          onManifestAssembled(t.manifest as Record<string, unknown>, result as unknown as Record<string, unknown>),
        );
        if (cancelled) return;
      } catch (err) {
        console.error('[UnlayerEditor] onManifestAssembled failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldOfferPicker, pickedStarterId, starterTemplates, onManifestAssembled]);

  const effectiveInitialDesign = shouldOfferPicker && pickedStarterId != null ? resolvedFromPick : initialDesign;

  const pickedTemplate = useMemo(() => {
    if (!shouldOfferPicker || pickedStarterId == null || !starterTemplates?.length) return null;
    return starterTemplates.find((s) => s.id === pickedStarterId) ?? null;
  }, [shouldOfferPicker, pickedStarterId, starterTemplates]);

  const exportNow = useCallback(async (): Promise<UnlayerExportPayload> => {
    const waitForEditor = (): Promise<NonNullable<typeof emailEditorRef.current>['editor']> =>
      new Promise((resolve, reject) => {
        const editor = emailEditorRef.current?.editor;
        if (editor) { resolve(editor); return; }
        const timeout = setTimeout(() => {
          clearInterval(poll);
          reject(new Error('Editor is still loading.'));
        }, 30_000);
        const poll = setInterval(() => {
          const ed = emailEditorRef.current?.editor;
          if (ed) { clearInterval(poll); clearTimeout(timeout); resolve(ed); }
        }, 200);
      });

    const editor = await waitForEditor();
    await new Promise((r) => setTimeout(r, 600));

    return new Promise<UnlayerExportPayload>((resolve, reject) => {
      try {
        const popupOpts =
          displayMode === 'popup' && exportPopupId ? { popupId: exportPopupId } : undefined;
        const exportHtml = editor.exportHtml as UnlayerExportHtmlFn;
        exportHtml(
          (data: { html: string; design?: unknown }) => {
            const design =
              data.design && typeof data.design === 'object'
                ? (data.design as Record<string, unknown>)
                : {};
            resolve({ html: data.html, design });
          },
          popupOpts,
        );
      } catch (e) {
        reject(e instanceof Error ? e : new Error('exportHtml failed'));
      }
    });
  }, [displayMode, exportPopupId]);

  const loadDesign = useCallback((design: Record<string, unknown>): boolean => {
    const editor = emailEditorRef.current?.editor;
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

  useEffect(() => {
    setEditorExportReady(false);
    let cancelled = false;
    const mark = () => {
      if (!cancelled) setEditorExportReady(true);
    };
    const poll = window.setInterval(() => {
      if (emailEditorRef.current?.editor) {
        window.clearInterval(poll);
        window.setTimeout(mark, 400);
      }
    }, 120);
    const fallback = window.setTimeout(mark, 12000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearTimeout(fallback);
    };
  }, [editorMountKey]);

  if (shouldOfferPicker && pickedStarterId === null) {
    return (
      <div className="space-y-3">
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
    <div className="space-y-3">
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
      <div
        className="rounded-lg border border-app-border bg-app-card overflow-hidden w-full"
        style={{ minHeight: 700, minWidth: 'min(100%, 1024px)' }}
      >
        <EmailEditor
          key={editorMountKey}
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
          onReady={() => {
            setEditorExportReady(true);
            if (onRegenerateImage) {
              const editor = emailEditorRef.current?.editor;
              if (editor && typeof (editor as Record<string, unknown>).registerCallback === 'function') {
                (editor as Record<string, unknown> & { registerCallback: (name: string, cb: (file: File, done: (data: { progress: number; url?: string }) => void) => void) => void })
                  .registerCallback('image', (_file: File, done: (data: { progress: number; url?: string }) => void) => {
                    done({ progress: 50 });
                    const prompt = _file.name?.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') || 'professional product photo';
                    void onRegenerateImage(prompt).then((url) => {
                      if (url) {
                        done({ progress: 100, url });
                      } else {
                        done({ progress: 0 });
                        toast.error('Image generation failed');
                      }
                    });
                  });
              }
            }
          }}
        />
      </div>
    </div>
  );
});

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Bookmark, ChevronDown, Download, FileDown, HelpCircle, Mail, RefreshCw, Sparkles, Square, Wand2 } from 'lucide-react';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { marketingAPI, type ContentItem } from '@/lib/marketingApi';
import { UnlayerEmailEditor } from './UnlayerEmailEditor';
import {
  EmailDesignWizard,
} from './EmailDesignWizard';
import { Va2DiagnosticsPanel } from './cockpit/Va2DiagnosticsPanel';
import { Va2VariantToggle } from './Va2VariantToggle';
import { Va2ThemeSwitcher } from './Va2ThemeSwitcher';
import type { ThemeName } from '../lib/types/designTokenTypes';
import { EASTER_EGG_OPTIONS } from '../lib/specialEffects';
import { runEmailAssemblyPipeline } from '../lib/designAssembler';
import { templatizeManifest, extractSectionTypes } from '../lib/templateUtils';
import type { EmailResolveRegeneratePayload } from '../lib/emailResolveTypes';
import { patchFirstHeroSectionImageUrl } from './contentEmail/manifestHelpers';
import { useEmailBuilderState } from './contentEmail/useEmailBuilderState';
import { useEmailWizardAssembly } from './contentEmail/useEmailWizardAssembly';
import { useEmailThemeEffects } from './contentEmail/useEmailThemeEffects';
import { SaveTemplateModal } from './contentEmail/SaveTemplateModal';
import { EmailInboxPreviewStrip } from './contentEmail/EmailInboxPreviewStrip';
import { EmailPipelineStatusStrip } from './contentEmail/EmailPipelineStatusStrip';
import { mightContainManifest } from '../lib/manifestParser';
import { buildEmailBrandOverridesForAssembly } from '../lib/emailBrandHeaderOverrides';
import {
  estimateUnlayerDesignHtmlWeight,
  ESTIMATED_HTML_EXPORT_WARN_KB,
} from '../lib/estimateUnlayerDesignHtmlWeight';

function hashBodyKey(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return String(h);
}

/**
 * Programmatic download after async work: the user activation may be gone, so some
 * browsers block a bare `a.click()`. Double rAF + append-to-body matches common fixes.
 */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener noreferrer';
  a.style.position = 'fixed';
  a.style.left = '-9999px';
  document.body.appendChild(a);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        a.click();
      } finally {
        window.setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 250);
      }
    });
  });
}

export function ContentEmailUnlayerControls({
  content,
  onUpdated,
  surface = 'page',
  onAskDoraRegenerate,
}: {
  content: ContentItem;
  onUpdated: () => void | Promise<void>;
  /** Cockpit shows richer assembly details and Dora re-generate hook. */
  surface?: 'page' | 'cockpit';
  onAskDoraRegenerate?: (message: string) => void;
}) {
  const state = useEmailBuilderState({ content, onUpdated, surface });
  const wizard = useEmailWizardAssembly(state, content);
  const themeEffects = useEmailThemeEffects(state);

  const {
    user,
    userId,
    builderOpen, setBuilderOpen,
    editorRef,
    bodyHtml,
    setBodyHtml,
    bodyDesign,
    setBodyDesign,
    editorKey,
    saving,
    va2Manifest, setVa2Manifest,
    va2Variants,
    va2ActiveVariant,
    va2AssemblyResult, setVa2AssemblyResult,
    va2IsAssembling,
    va2IsResolvingImage, setVa2IsResolvingImage,
    va2LastResolve,
    legacyEmailBuilderEffects,
    legacyEffectsTheme,
    saveTemplateOpen, setSaveTemplateOpen,
    saveTemplateForm, setSaveTemplateForm,
    savingTemplate, setSavingTemplate,
    wizardOpen, setWizardOpen,
    setUserTemplates,
    suggestedGoal,
    applyAiBusy,
    brandFooterDefaults,
    brandColors,
    brandLogoUrl,
    mergedStarters,
    openBuilderWithSaved,
    pushDesignToEditor,
    resolveManifestEmailImages,
    handleSave,
    stripClass,
    loadingClass,
  } = state;

  const [exportQaBusy, setExportQaBusy] = useState(false);
  const [exportHtmlBusy, setExportHtmlBusy] = useState(false);
  /** Mirrors Unlayer embed + iframe readiness — avoids exportHtml before internal `frame` exists. */
  const [editorExportReady, setEditorExportReady] = useState(false);

  /** Block layout-disrupting actions while images generate or assembly runs. */
  const pipelineBusy = va2IsResolvingImage || va2IsAssembling;

  const brandOverrides = useMemo(
    () =>
      buildEmailBrandOverridesForAssembly(
        brandColors,
        brandLogoUrl,
        brandFooterDefaults?.companyName,
      ),
    [brandColors, brandLogoUrl, brandFooterDefaults?.companyName],
  );

  const handleRegenerateEmailSlot = useCallback(
    async (regenerate: EmailResolveRegeneratePayload) => {
      if (!userId || !content.id || !va2Manifest) return;
      setVa2IsResolvingImage(true);
      try {
        const { manifest: updated, filledSlots } = await resolveManifestEmailImages(va2Manifest, {
          regenerate,
          suppressToast: true,
        });
        if (filledSlots > 0) {
          setVa2Manifest(updated);
          const reAssembled = runEmailAssemblyPipeline(updated, {
            footerDefaults: brandFooterDefaults,
            brandOverrides,
          });
          setVa2AssemblyResult(reAssembled);
          if (reAssembled.success && reAssembled.design) {
            pushDesignToEditor(reAssembled.design as unknown as Record<string, unknown>);
            toast.success(`Regenerated ${filledSlots} image${filledSlots > 1 ? 's' : ''} and updated design.`);
          }
        } else {
          toast.error('Could not regenerate images — check prompts or try again.');
        }
      } catch (e) {
        console.warn('[VA2] Image slot regeneration failed:', e);
        toast.error('Image regeneration failed.');
      } finally {
        setVa2IsResolvingImage(false);
      }
    },
    [
      userId,
      content.id,
      va2Manifest,
      resolveManifestEmailImages,
      brandFooterDefaults,
      brandOverrides,
      pushDesignToEditor,
      setVa2Manifest,
      setVa2AssemblyResult,
      setVa2IsResolvingImage,
    ],
  );

  const designExportWeight = useMemo(() => {
    if (!bodyDesign || typeof bodyDesign !== 'object') return null;
    const raw = JSON.stringify(bodyDesign);
    if (raw.length < 3) return null;
    const { estimatedBytes, httpUrlCount } = estimateUnlayerDesignHtmlWeight(raw);
    const kb = Math.max(1, Math.round(estimatedBytes / 1024));
    return {
      estimatedKb: kb,
      urlCount: httpUrlCount,
      heavy: kb >= ESTIMATED_HTML_EXPORT_WARN_KB,
    };
  }, [bodyDesign]);

  const rawBody = content.body ?? '';
  const manifestLikely = mightContainManifest(rawBody);
  const hasPersistedDesign =
    Boolean(content.body_design && Object.keys(content.body_design as object).length > 0) ||
    Boolean((content.body_html ?? '').trim());
  const showVa2BuildBanner =
    Boolean(rawBody.trim()) && manifestLikely && !hasPersistedDesign && !va2Manifest && !applyAiBusy;

  const applyDraftRef = useRef(wizard.handleApplyAiDraft);
  applyDraftRef.current = wizard.handleApplyAiDraft;

  useEffect(() => {
    if (!builderOpen) setEditorExportReady(false);
  }, [builderOpen]);

  useEffect(() => {
    const raw = content.body ?? '';
    if (!raw.trim() || !mightContainManifest(raw)) return;
    if (
      Boolean(content.body_design && Object.keys(content.body_design as object).length > 0) ||
      Boolean((content.body_html ?? '').trim())
    ) {
      return;
    }
    if (va2Manifest) return;
    if (applyAiBusy) return;
    if (!content.id) return;

    const storageKey = `messign_va2_auto_${content.id}_${hashBodyKey(raw)}`;
    try {
      if (sessionStorage.getItem(storageKey)) return;
    } catch {
      /* private mode */
    }

    const t = window.setTimeout(() => {
      try {
        sessionStorage.setItem(storageKey, '1');
      } catch {
        /* ignore */
      }
      void applyDraftRef.current();
    }, 450);

    return () => window.clearTimeout(t);
  }, [content.id, content.body, content.body_design, content.body_html, va2Manifest, applyAiBusy]);

  const handleDownloadHtml = async () => {
    setExportHtmlBusy(true);
    try {
      const ex = await editorRef.current?.exportNow();
      const html = (ex?.html ?? bodyHtml)?.trim() ?? '';
      if (!html) {
        toast.error('No HTML yet. Open the builder, wait until the canvas loads, then try again.');
        return;
      }
      const safeName = `email-${content.id.slice(0, 8)}.html`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      triggerBlobDownload(blob, safeName);
      toast.success('HTML download started — check your Downloads folder.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Export failed';
      if (bodyHtml.trim()) {
        try {
          await navigator.clipboard.writeText(bodyHtml);
          toast.message('Editor export failed; last saved HTML copied to clipboard instead.', {
            description: 'Paste into a file and save as .html',
          });
        } catch {
          toast.error(msg);
        }
      } else {
        const suffix = /still attaching|Download HTML|enabled, then try/i.test(msg)
          ? ''
          : ' — wait for the editor to finish loading, then try again.';
        toast.error(`${msg}${suffix}`);
      }
    } finally {
      setExportHtmlBusy(false);
    }
  };

  const handleExportQaBundle = async () => {
    setExportQaBusy(true);
    try {
      const ex = await editorRef.current?.exportNow();
      const html = ex?.html ?? bodyHtml;
      const design = ex?.design ?? bodyDesign;
      const payload = {
        exportedAt: new Date().toISOString(),
        contentId: content.id,
        manifest: va2Manifest,
        html,
        unlayerDesign: design,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      triggerBlobDownload(blob, `email-qa-${content.id.slice(0, 8)}.json`);
      toast.success('QA bundle download started (JSON with HTML + manifest).');
    } catch {
      toast.error('Export failed — wait for the editor to finish loading, then try again.');
    } finally {
      setExportQaBusy(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!va2Manifest || !userId || !saveTemplateForm.name.trim()) return;
    setSavingTemplate(true);
    try {
      const templated = templatizeManifest(va2Manifest);
      await marketingAPI.saveEmailTemplate(userId, {
        name: saveTemplateForm.name.trim(),
        category: saveTemplateForm.category,
        description: saveTemplateForm.description.trim() || undefined,
        manifest_json: templated as unknown as Record<string, unknown>,
        section_types: extractSectionTypes(va2Manifest),
        theme: va2Manifest.theme,
      });
      toast.success(`Template saved: ${saveTemplateForm.name.trim()}`);
      setSaveTemplateOpen(false);
      setSaveTemplateForm({ name: '', category: 'custom', description: '' });
      void marketingAPI.listEmailTemplates(userId, { pageSize: 50 }).then((r) => {
        setUserTemplates(
          (r.data ?? []).filter((t): t is typeof t & { manifest_json: Record<string, unknown> } =>
            Boolean(t.manifest_json && Object.keys(t.manifest_json).length > 0),
          ),
        );
      }).catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            {content.body_design || (content.body_html ?? '').trim()
              ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="text-app-muted">Design saved</span></>
              : <><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /><span className="text-app-muted">Text only</span></>
            }
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setWizardOpen(true)} disabled={pipelineBusy} title="Design email" className="h-7 px-2.5 rounded-md text-xs font-medium bg-primary-500 text-app-text hover:bg-primary-600 inline-flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none">
              <Wand2 className="w-3 h-3" /> Design
            </button>
            <button type="button" onClick={openBuilderWithSaved} disabled={pipelineBusy} title="Open builder" className="h-7 w-7 flex items-center justify-center rounded-md bg-app-surface-tertiary text-app-muted hover:text-app-text hover:bg-app-hover disabled:opacity-40 disabled:pointer-events-none">
              <Mail className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => void wizard.handleApplyAiDraft()} disabled={!(content.body ?? '').trim() || applyAiBusy} title="Apply AI draft" className="h-7 w-7 flex items-center justify-center rounded-md bg-app-surface-tertiary text-app-muted hover:text-app-text hover:bg-app-hover disabled:opacity-40">
              {applyAiBusy ? <span className="w-3 h-3 rounded-full border border-app-muted border-t-transparent animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            </button>
            {va2Manifest && (
              <button type="button" onClick={() => setSaveTemplateOpen(true)} disabled={pipelineBusy} title="Save template" className="h-7 w-7 flex items-center justify-center rounded-md bg-app-surface-tertiary text-app-muted hover:text-app-text hover:bg-app-hover disabled:opacity-40">
                <Bookmark className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {showVa2BuildBanner && (
        <div className="rounded-xl border border-primary-500/30 bg-primary-500/10 px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-app-text">
            <span className="font-medium">Design manifest ready.</span> Build the Unlayer layout and images from this draft.
          </p>
          <button
            type="button"
            disabled={pipelineBusy}
            onClick={() => void wizard.handleApplyAiDraft()}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-40"
          >
            <Sparkles className="w-3.5 h-3.5" /> Build email layout
          </button>
        </div>
      )}

      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-app-border bg-app-bg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <EmailDesignWizard
              onComplete={wizard.handleWizardComplete}
              onCancel={() => setWizardOpen(false)}
              hasAiDraft={Boolean((content.body ?? '').trim())}
              suggestedGoal={suggestedGoal}
            />
          </div>
        </div>
      )}

      {saveTemplateOpen && va2Manifest && (
        <SaveTemplateModal
          va2Manifest={va2Manifest}
          form={saveTemplateForm}
          onFormChange={setSaveTemplateForm}
          saving={savingTemplate}
          onSave={() => void handleSaveTemplate()}
          onClose={() => setSaveTemplateOpen(false)}
        />
      )}

      <SlideOverPanel
        isOpen={builderOpen}
        onClose={() => setBuilderOpen(false)}
        title="Email builder"
        width={1200}
      >
        <div className="p-4 space-y-3 min-h-0 flex flex-col">
          {(va2IsResolvingImage || (va2IsAssembling && !va2IsResolvingImage)) && (
            <div className={`${loadingClass} flex flex-wrap items-center justify-between gap-2`}>
              <span>
                <span className="animate-pulse">●</span>{' '}
                {va2IsResolvingImage ? 'Generating images…' : 'Assembling…'}
              </span>
              {pipelineBusy ? (
                <button
                  type="button"
                  onClick={() => {
                    wizard.cancelApplyDraft();
                    wizard.cancelWizardTemplateRun();
                    wizard.cancelManifestPick();
                    toast.message('Stopped pipeline — partial results may remain.');
                  }}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-app-surface-tertiary text-app-muted hover:text-app-text hover:bg-app-hover border border-app-border"
                >
                  <Square className="w-3 h-3" /> Stop
                </button>
              ) : null}
            </div>
          )}

          {va2Manifest ? (
            <EmailPipelineStatusStrip
              hasManifest
              isResolvingImage={va2IsResolvingImage}
              isAssembling={va2IsAssembling}
              assemblyResult={va2AssemblyResult}
              estimatedHtmlKb={designExportWeight?.estimatedKb}
              exportHttpUrlCount={designExportWeight?.urlCount}
              htmlExportHeavy={designExportWeight?.heavy}
            />
          ) : null}

          {(va2AssemblyResult && va2Manifest) || legacyEmailBuilderEffects ? (
            <div className={stripClass}>
              {legacyEmailBuilderEffects && !va2Manifest ? (
                <>
                  <Va2ThemeSwitcher
                    currentTheme={legacyEffectsTheme}
                    onThemeChange={themeEffects.handleLegacyThemeSwitch}
                    isAssembling={pipelineBusy}
                  />
                  <span className="text-slate-500">Plain draft — theme drives plane asset</span>
                </>
              ) : va2AssemblyResult && va2Manifest ? (
                <>
                  <Va2ThemeSwitcher
                    currentTheme={va2Manifest.theme as ThemeName}
                    onThemeChange={themeEffects.handleThemeSwitch}
                    isAssembling={pipelineBusy}
                  />
                  <span>
                    {va2AssemblyResult.metadata.sectionCount} sections
                    {typeof va2AssemblyResult.metadata.imageSlotCount === 'number' ? (
                      <>
                        {' '}
                        ·{' '}
                        <span
                          className={
                            va2AssemblyResult.metadata.layoutRichnessHint
                              ? 'cursor-help border-b border-dotted border-slate-500/60'
                              : ''
                          }
                          title={
                            va2AssemblyResult.metadata.layoutRichnessHint ??
                            'Campaign image slots (hero, image_text, image, value_prop, product_grid). Brand logo row is not counted.'
                          }
                        >
                          {va2AssemblyResult.metadata.imageSlotCount} img slot
                          {va2AssemblyResult.metadata.imageSlotCount === 1 ? '' : 's'}
                        </span>
                      </>
                    ) : null}
                    {va2AssemblyResult.metadata.accessibilityScore != null
                      ? ` · a11y ${va2AssemblyResult.metadata.accessibilityScore}`
                      : ''}
                  </span>
                  {va2AssemblyResult.warnings.length > 0 ? (
                    <span
                      className="cursor-help text-amber-500/90"
                      title={va2AssemblyResult.warnings.join('\n')}
                    >
                      {va2AssemblyResult.warnings.length} warning
                      {va2AssemblyResult.warnings.length > 1 ? 's' : ''}
                    </span>
                  ) : null}
                  {va2AssemblyResult.skippedSections.length > 0 ? (
                    <span
                      className="cursor-help text-red-400/90"
                      title={va2AssemblyResult.skippedSections.map((s) => `${s.type}: ${s.reason}`).join('\n')}
                    >
                      {va2AssemblyResult.skippedSections.length} skipped
                    </span>
                  ) : null}
                </>
              ) : null}
              <span className="relative">
                <button
                  type="button"
                  disabled={pipelineBusy}
                  onClick={() => themeEffects.setEffectsOpen((v) => !v)}
                  title="Decorative motion in the builder preview. Hidden on narrow mobile preview. Subscribers with “reduce motion” see a static plane. Many email clients (Outlook, Gmail) clip or strip CSS animation — verify before sending."
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-app-surface-tertiary hover:bg-app-hover text-slate-300 disabled:opacity-40 transition-colors"
                >
                  <Wand2 className="w-3 h-3" />
                  {themeEffects.activeEffectLabel}
                  <HelpCircle className="w-3 h-3 opacity-50" aria-hidden />
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </button>
                {themeEffects.effectsOpen ? (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => themeEffects.setEffectsOpen(false)} />
                    <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-lg border border-app-border bg-[#141720] shadow-xl py-1">
                      {EASTER_EGG_OPTIONS.map((opt) => {
                        const isActive = themeEffects.displayedEasterEgg === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => void themeEffects.handleEffectToggle(opt.value)}
                            className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 transition-colors ${
                              isActive
                                ? 'bg-primary-500/20 text-primary-300'
                                : 'text-slate-300 hover:bg-app-hover'
                            }`}
                          >
                            {isActive ? (
                              <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />
                            ) : (
                              <span className="w-1.5 h-1.5" />
                            )}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </span>
              {va2Variants.length > 1 ? (
                <span className="ml-auto">
                  <Va2VariantToggle
                    variants={va2Variants}
                    activeVariant={va2ActiveVariant}
                    onSwitchVariant={wizard.handleSwitchVariant}
                    isAssembling={pipelineBusy}
                  />
                </span>
              ) : null}
            </div>
          ) : null}

          {va2Manifest && va2LastResolve?.partial ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90">
              Last image run used fallbacks or skipped some slots — check the cockpit diagnostics or regenerate images.
            </div>
          ) : null}

          {va2Manifest ? (
            <div className="max-w-xl shrink-0 space-y-1">
              <EmailInboxPreviewStrip subject={va2Manifest.subject} preheader={va2Manifest.preheader} />
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-app-muted">
                <span className="text-emerald-600 dark:text-emerald-500/90">Manifest</span>
                <span className={va2IsResolvingImage ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-500/90'}>
                  Images{va2LastResolve ? ` · ${va2LastResolve.durationMs}ms` : ''}
                </span>
                <span className={va2AssemblyResult?.success ? 'text-emerald-600 dark:text-emerald-500/90' : ''}>Assembled</span>
                {va2AssemblyResult?.metadata?.accessibilityScore != null ? (
                  <span>a11y {va2AssemblyResult.metadata.accessibilityScore}</span>
                ) : null}
              </div>
              <p className="text-[10px] text-app-muted leading-snug">
                The top row is often your brand logo; AI campaign imagery appears in the hero and sections below.
              </p>
            </div>
          ) : null}

          {surface === 'cockpit' && va2AssemblyResult && va2Manifest ? (
            <Va2DiagnosticsPanel
              manifest={va2Manifest}
              assemblyResult={va2AssemblyResult}
              isResolvingImage={va2IsResolvingImage}
              lastResolve={va2LastResolve}
              onRegenerate={(msg) => onAskDoraRegenerate?.(msg)}
              onRegenerateEmailSlot={handleRegenerateEmailSlot}
            />
          ) : null}

          <div className="min-h-[640px] min-w-0 flex-1">
            <ErrorBoundary
              resetKey={editorKey}
              fallback={
                <div className="flex flex-col items-center justify-center gap-3 p-12 text-center min-h-[400px]">
                  <p className="text-sm font-medium text-app-text">The email builder encountered an error.</p>
                  <p className="text-xs text-app-muted max-w-sm">
                    This can happen when the Unlayer CDN updates or the editor fails to initialize. Try closing and reopening the builder.
                  </p>
                  <button
                    type="button"
                    onClick={() => setBuilderOpen(false)}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Close and retry
                  </button>
                </div>
              }
            >
              <UnlayerEmailEditor
                ref={editorRef}
                editorKey={editorKey}
                initialDesign={bodyDesign}
                initialHtml={bodyHtml}
                starterTemplates={mergedStarters}
                onExportReady={setEditorExportReady}
                user={user ? { id: user.id, name: user.name, email: user.email } : undefined}
                onApply={({ html, design }) => {
                  setBodyHtml(html);
                  setBodyDesign(design);
                }}
                onRegenerateImage={async (prompt: string) => {
                  if (!userId || !content.id) return null;
                  try {
                    const result = await marketingAPI.regenerateContentImage(userId, content.id, { image_prompt: prompt });
                    if (result.image_url && va2Manifest) {
                      setVa2Manifest(patchFirstHeroSectionImageUrl(va2Manifest, result.image_url));
                    }
                    return result.image_url;
                  } catch {
                    return null;
                  }
                }}
                onManifestAssembled={wizard.handleManifestAssembled}
                interactionLocked={va2IsResolvingImage}
              />
            </ErrorBoundary>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-app-border">
            <button
              type="button"
              onClick={() => void handleDownloadHtml()}
              disabled={!editorExportReady || exportHtmlBusy || exportQaBusy || pipelineBusy}
              title={
                !editorExportReady
                  ? 'Wait until the Unlayer canvas finishes loading'
                  : 'Download the rendered email as a .html file (for local preview or ESP upload)'
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-app-surface-tertiary text-app-text hover:bg-app-hover disabled:opacity-50"
            >
              <FileDown className="w-3.5 h-3.5" />
              {exportHtmlBusy ? 'Preparing…' : !editorExportReady ? 'Loading builder…' : 'Download HTML'}
            </button>
            <button
              type="button"
              onClick={() => void handleExportQaBundle()}
              disabled={!editorExportReady || exportQaBusy || exportHtmlBusy || pipelineBusy}
              title={
                !editorExportReady
                  ? 'Wait until the Unlayer canvas finishes loading'
                  : 'Download JSON bundle with exported HTML, Unlayer design, and VA2 manifest'
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-app-surface-tertiary text-app-text hover:bg-app-hover disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {exportQaBusy ? 'Exporting…' : !editorExportReady ? 'Loading builder…' : 'Export QA bundle'}
            </button>
            <button
              type="button"
              onClick={() => setBuilderOpen(false)}
              className="px-4 py-2 rounded-lg text-sm bg-app-surface-tertiary text-app-text hover:bg-app-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || applyAiBusy}
              onClick={() => void handleSave()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save to content'}
            </button>
          </div>
        </div>
      </SlideOverPanel>
    </>
  );
}

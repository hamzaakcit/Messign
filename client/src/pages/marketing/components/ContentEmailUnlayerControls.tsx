import { toast } from 'sonner';
import { Bookmark, ChevronDown, Mail, Sparkles, Wand2 } from 'lucide-react';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
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
import { assembleDesign } from '../lib/designAssembler';
import { templatizeManifest, extractSectionTypes } from '../lib/templateUtils';
import { mergeResolvedEmailImagesIntoManifest } from './contentEmail/manifestHelpers';
import { useEmailBuilderState } from './contentEmail/useEmailBuilderState';
import { useEmailWizardAssembly } from './contentEmail/useEmailWizardAssembly';
import { useEmailThemeEffects } from './contentEmail/useEmailThemeEffects';
import { SaveTemplateModal } from './contentEmail/SaveTemplateModal';
import type { DesignManifest } from '../lib/types/manifestTypes';

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
    bodyHtml, setBodyHtml,
    bodyDesign, setBodyDesign,
    editorKey,
    saving,
    va2Manifest, setVa2Manifest,
    va2Variants,
    va2ActiveVariant,
    va2AssemblyResult, setVa2AssemblyResult,
    va2IsAssembling,
    va2IsResolvingImage, setVa2IsResolvingImage,
    legacyEmailBuilderEffects,
    legacyEffectsTheme,
    saveTemplateOpen, setSaveTemplateOpen,
    saveTemplateForm, setSaveTemplateForm,
    savingTemplate, setSavingTemplate,
    wizardOpen, setWizardOpen,
    setUserTemplates,
    suggestedGoal,
    applyAiBusy,
    mergedStarters,
    openBuilderWithSaved,
    pushDesignToEditor,
    handleSave,
    stripClass,
    loadingClass,
  } = state;

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
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            {content.body_design || (content.body_html ?? '').trim()
              ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="text-app-muted">Design saved</span></>
              : <><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /><span className="text-app-muted">Text only</span></>
            }
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setWizardOpen(true)} title="Design email" className="h-7 px-2.5 rounded-md text-xs font-medium bg-primary-500 text-white hover:bg-primary-600 inline-flex items-center gap-1">
              <Wand2 className="w-3 h-3" /> Design
            </button>
            <button type="button" onClick={openBuilderWithSaved} title="Open builder" className="h-7 w-7 flex items-center justify-center rounded-md bg-white/[0.06] text-app-muted hover:text-app-text hover:bg-white/10">
              <Mail className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => void wizard.handleApplyAiDraft()} disabled={!(content.body ?? '').trim() || applyAiBusy} title="Apply AI draft" className="h-7 w-7 flex items-center justify-center rounded-md bg-white/[0.06] text-app-muted hover:text-app-text hover:bg-white/10 disabled:opacity-40">
              {applyAiBusy ? <span className="w-3 h-3 rounded-full border border-app-muted border-t-transparent animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            </button>
            {va2Manifest && (
              <button type="button" onClick={() => setSaveTemplateOpen(true)} title="Save template" className="h-7 w-7 flex items-center justify-center rounded-md bg-white/[0.06] text-app-muted hover:text-app-text hover:bg-white/10">
                <Bookmark className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-app-bg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
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
            <div className={loadingClass}>
              <span className="animate-pulse">●</span>
              {va2IsResolvingImage ? 'Generating images…' : 'Assembling…'}
            </div>
          )}

          {(va2AssemblyResult && va2Manifest) || legacyEmailBuilderEffects ? (
            <div className={stripClass}>
              {legacyEmailBuilderEffects && !va2Manifest ? (
                <>
                  <Va2ThemeSwitcher
                    currentTheme={legacyEffectsTheme}
                    onThemeChange={themeEffects.handleLegacyThemeSwitch}
                    isAssembling={va2IsAssembling}
                  />
                  <span className="text-slate-500">Plain draft — theme drives plane asset</span>
                </>
              ) : va2AssemblyResult && va2Manifest ? (
                <>
                  <Va2ThemeSwitcher
                    currentTheme={va2Manifest.theme as ThemeName}
                    onThemeChange={themeEffects.handleThemeSwitch}
                    isAssembling={va2IsAssembling}
                  />
                  <span>{va2AssemblyResult.metadata.sectionCount} sections</span>
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
                  disabled={va2IsAssembling}
                  onClick={() => themeEffects.setEffectsOpen((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 disabled:opacity-40 transition-colors"
                >
                  <Wand2 className="w-3 h-3" />
                  {themeEffects.activeEffectLabel}
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </button>
                {themeEffects.effectsOpen ? (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => themeEffects.setEffectsOpen(false)} />
                    <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-lg border border-white/10 bg-[#141720] shadow-xl py-1">
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
                                : 'text-slate-300 hover:bg-white/[0.06]'
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
                    isAssembling={va2IsAssembling}
                  />
                </span>
              ) : null}
            </div>
          ) : null}

          {surface === 'cockpit' && va2AssemblyResult && va2Manifest ? (
            <Va2DiagnosticsPanel
              manifest={va2Manifest}
              assemblyResult={va2AssemblyResult}
              isResolvingImage={va2IsResolvingImage}
              onRegenerate={(msg) => onAskDoraRegenerate?.(msg)}
              onRegenerateHeroImage={async () => {
                if (!userId || !content.id || !va2Manifest) return;
                setVa2IsResolvingImage(true);
                try {
                  const imgResult = await marketingAPI.resolveEmailImages(userId, content.id, {
                    manifest: va2Manifest as unknown as Record<string, unknown>,
                    workspace_id: null,
                  });
                  const resolvedImages = imgResult.images;
                  const resolvedItemImages = imgResult.itemImages;
                  let updated: DesignManifest = { ...va2Manifest };
                  let imgCount = 0;
                  if (resolvedImages && Object.keys(resolvedImages).length > 0) {
                    updated = mergeResolvedEmailImagesIntoManifest(updated, resolvedImages, undefined);
                    imgCount += Object.keys(resolvedImages).length;
                  }
                  if (resolvedItemImages && Object.keys(resolvedItemImages).length > 0) {
                    updated = mergeResolvedEmailImagesIntoManifest(updated, undefined, resolvedItemImages);
                    imgCount += Object.keys(resolvedItemImages).length;
                  }
                  if (imgCount > 0) {
                    setVa2Manifest(updated);
                    const reAssembled = assembleDesign(updated);
                    setVa2AssemblyResult(reAssembled);
                    if (reAssembled.success && reAssembled.design) {
                      pushDesignToEditor(reAssembled.design as unknown as Record<string, unknown>);
                      toast.success(`Regenerated ${imgCount} image${imgCount > 1 ? 's' : ''} and updated design.`);
                    }
                  }
                } catch (e) {
                  console.warn('[VA2] Image regeneration failed:', e);
                  toast.error('Image regeneration failed.');
                } finally {
                  setVa2IsResolvingImage(false);
                }
              }}
            />
          ) : null}

          <div className="min-h-[640px] min-w-0 flex-1">
            <UnlayerEmailEditor
              ref={editorRef}
              editorKey={editorKey}
              initialDesign={bodyDesign}
              initialHtml={bodyHtml}
              starterTemplates={mergedStarters}
              user={user ? { id: user.id, name: user.name, email: user.email } : undefined}
              onApply={({ html, design }) => {
                setBodyHtml(html);
                setBodyDesign(design);
              }}
              onRegenerateImage={async (prompt: string) => {
                if (!userId || !content.id) return null;
                try {
                  const result = await marketingAPI.regenerateContentImage(userId, content.id, { image_prompt: prompt });
                  return result.image_url;
                } catch {
                  return null;
                }
              }}
              onManifestAssembled={wizard.handleManifestAssembled}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => setBuilderOpen(false)}
              className="px-4 py-2 rounded-lg text-sm bg-white/5 text-app-text hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || applyAiBusy}
              onClick={() => void handleSave()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save to content'}
            </button>
          </div>
        </div>
      </SlideOverPanel>
    </>
  );
}

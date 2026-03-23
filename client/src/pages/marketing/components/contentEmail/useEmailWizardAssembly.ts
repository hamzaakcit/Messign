import { useCallback } from 'react';
import { toast } from 'sonner';
import type { ContentItem } from '@/lib/marketingApi';
import { getStarterTemplates } from '../../unlayerTemplates/registry';
import {
  mergeUserEmailDraftIntoTemplateManifest,
  normalizeManifest,
  parseManifestFromLLMOutput,
  synthesizeManifestFromPlainText,
} from '../../lib/manifestParser';
import { assembleDesign } from '../../lib/designAssembler';
import type { DesignManifest } from '../../lib/types/manifestTypes';
import { resetIdCounter } from '../../lib/designTokens';
import type { ThemeName } from '../../lib/types/designTokenTypes';
import type { WizardResult, EmailGoal, ContentDensity } from '../EmailDesignWizard';
import { manifestHasResolvableImagePrompts } from './manifestHelpers';
import type { EmailBuilderState } from './useEmailBuilderState';

export const GOAL_TO_TEMPLATE: Record<EmailGoal, string> = {
  product_launch: 'email-product-launch',
  newsletter: 'email-weekly-newsletter',
  flash_sale: 'email-flash-sale',
  event_invitation: 'email-event-invitation',
  onboarding: 'email-customer-onboarding',
  case_study: 'email-case-study',
  seasonal: 'email-seasonal-campaign',
  re_engagement: 'email-re-engagement',
  feature_update: 'email-feature-announcement',
  minimalist_cta: 'email-minimalist-cta',
};

export const AB_VARIANT_THEME_MAP: Record<string, ThemeName> = {
  executive: 'startup',
  startup: 'executive',
  luxury: 'minimal',
  minimal: 'bold',
  bold: 'tech',
  nature: 'warm',
  tech: 'startup',
  warm: 'nature',
};

export function useEmailWizardAssembly(
  state: EmailBuilderState,
  content: ContentItem,
) {
  const {
    userId,
    setVa2IsAssembling,
    setVa2IsResolvingImage,
    setVa2Manifest,
    setVa2Variants,
    setVa2ActiveVariant,
    setVa2AssemblyResult,
    setLegacyEmailBuilderEffects,
    applyAiBusy,
    pushDesignToEditor,
    resolveManifestEmailImages,
    openBuilderWithSaved,
    openBuilderWithAiTemplateLegacy,
  } = state;

  const handleWizardComplete = (result: WizardResult) => {
    state.setWizardOpen(false);
    if (result.mode === 'ai') {
      void handleApplyAiDraft({ theme: result.theme, density: result.density });
      return;
    }
    const templateId = GOAL_TO_TEMPLATE[result.goal];
    const starters = getStarterTemplates('email');
    const starter = starters.find((s) => s.id === templateId);
    if (starter?.manifest) {
      void (async () => {
        const rawBody = content.body ?? '';
        let mergedA = normalizeManifest({
          ...(starter.manifest as Record<string, unknown>),
          theme: result.theme,
        });
        if (rawBody.trim()) {
          mergedA = mergeUserEmailDraftIntoTemplateManifest(mergedA, rawBody);
        }
        setVa2IsAssembling(true);
        setVa2IsResolvingImage(true);
        try {
          let mergedB: DesignManifest | null = null;
          if (result.generateAbVariant) {
            const altTheme = AB_VARIANT_THEME_MAP[result.theme] ?? 'minimal';
            mergedB = normalizeManifest({
              ...(starter.manifest as Record<string, unknown>),
              theme: altTheme,
            });
            if (rawBody.trim()) {
              mergedB = mergeUserEmailDraftIntoTemplateManifest(mergedB, rawBody);
            }
          }
          if (userId && content.id) {
            try {
              mergedA = await resolveManifestEmailImages(mergedA);
              if (mergedB) {
                mergedB = await resolveManifestEmailImages(mergedB, { suppressToast: true });
              }
            } catch (imgErr) {
              console.warn('[VA2] Template image resolution failed:', imgErr);
            }
          }
          resetIdCounter();
          const assembled = assembleDesign(mergedA);
          if (assembled.success && assembled.design) {
            setLegacyEmailBuilderEffects(false);
            setVa2Manifest(mergedA);
            setVa2AssemblyResult(assembled);

            if (result.generateAbVariant && mergedB) {
              setVa2Variants([mergedA, mergedB]);
              setVa2ActiveVariant('A');
            } else {
              setVa2Variants([]);
            }

            pushDesignToEditor(assembled.design as unknown as Record<string, unknown>);
            const abMsg = result.generateAbVariant ? ' (A/B variant generated — use toggle to switch)' : '';
            const draftNote = rawBody.trim() ? ' — your draft was merged into the layout' : '';
            toast.success(`${starter.title} template loaded (${result.theme})${draftNote}${abMsg}`);
            return;
          }
          openBuilderWithSaved();
        } catch (e) {
          console.warn('[VA2] Wizard template load failed:', e);
          openBuilderWithSaved();
        } finally {
          setVa2IsResolvingImage(false);
          setVa2IsAssembling(false);
        }
      })();
      return;
    }
    openBuilderWithSaved();
  };

  const handleSwitchVariant = (variant: 'A' | 'B') => {
    const idx = variant === 'A' ? 0 : 1;
    if (!state.va2Variants[idx]) return;

    setVa2IsAssembling(true);
    setVa2ActiveVariant(variant);
    try {
      const manifest = state.va2Variants[idx];
      setVa2Manifest(manifest);
      resetIdCounter();
      const result = assembleDesign(manifest);
      setVa2AssemblyResult(result);
      if (result.success && result.design) {
        pushDesignToEditor(result.design as unknown as Record<string, unknown>);
      }
    } finally {
      setVa2IsAssembling(false);
    }
  };

  const handleApplyAiDraft = async (wizardOverrides?: { theme?: ThemeName; density?: ContentDensity }) => {
    const raw = content.body ?? '';
    if (!raw.trim()) {
      toast.error('No AI draft text to apply');
      return;
    }
    if (applyAiBusy) return;

    const parseResult = parseManifestFromLLMOutput(raw);
    const ch = parseResult.sourceChannel?.toLowerCase().trim();
    if (ch && ch !== 'email') {
      openBuilderWithAiTemplateLegacy();
      return;
    }

    let manifests: DesignManifest[];
    let wasSynthesized = false;

    if (!parseResult.isManifest || parseResult.manifests.length === 0) {
      try {
        const synthesized = synthesizeManifestFromPlainText(raw);
        manifests = [synthesized];
        wasSynthesized = true;
      } catch (synthError) {
        console.warn('[VA2] Manifest synthesis failed, falling back to legacy:', synthError);
        openBuilderWithAiTemplateLegacy();
        return;
      }
    } else {
      manifests = parseResult.manifests;
    }

    setVa2IsAssembling(true);
    try {
      setLegacyEmailBuilderEffects(false);
      setVa2Variants(manifests);
      setVa2ActiveVariant('A');
      let manifest: DesignManifest = { ...manifests[0] };
      if (wizardOverrides?.theme) {
        manifest = { ...manifest, theme: wizardOverrides.theme };
      }
      setVa2Manifest(manifest);

      if (manifestHasResolvableImagePrompts(manifest) && userId && content.id) {
        setVa2IsResolvingImage(true);
        try {
          manifest = await resolveManifestEmailImages(manifest);
          setVa2Manifest(manifest);
        } catch (imgError) {
          console.warn('[VA2] Section image resolution failed, using fallbacks:', imgError);
        } finally {
          setVa2IsResolvingImage(false);
        }
      }

      const assembled = assembleDesign(manifest);
      setVa2AssemblyResult(assembled);

      if (assembled.success && assembled.design) {
        const design = assembled.design as unknown as Record<string, unknown>;
        pushDesignToEditor(design);
        toast.success(
          wasSynthesized
            ? `Email designed: ${assembled.metadata.sectionCount} sections with AI-generated layout`
            : `Email assembled: ${assembled.metadata.sectionCount} sections, ${manifest.theme} theme`,
        );
        if (assembled.warnings.length > 0) {
          console.info('[VA2] Assembly warnings:', assembled.warnings);
        }
        if (assembled.skippedSections.length > 0) {
          console.warn('[VA2] Skipped sections:', assembled.skippedSections);
        }
      } else {
        console.warn('[VA2] Assembly failed, falling back to legacy path');
        openBuilderWithAiTemplateLegacy();
      }
    } catch (error) {
      console.error('[VA2] Manifest processing failed, falling back to legacy:', error);
      openBuilderWithAiTemplateLegacy();
    } finally {
      setVa2IsAssembling(false);
    }
  };

  const handleManifestAssembled = useCallback(
    async (manifest: Record<string, unknown>, _assemblyResult: Record<string, unknown>) => {
      setLegacyEmailBuilderEffects(false);
      let dm = { ...manifest } as unknown as DesignManifest;
      if (manifestHasResolvableImagePrompts(dm) && userId && content.id) {
        setVa2IsResolvingImage(true);
        try {
          dm = await resolveManifestEmailImages(dm);
        } catch (e) {
          console.warn('[VA2] Image resolution failed for template pick:', e);
        } finally {
          setVa2IsResolvingImage(false);
        }
      }
      resetIdCounter();
      const result = assembleDesign(dm);
      setVa2Manifest(dm);
      setVa2AssemblyResult(result);
      if (result.success && result.design) {
        pushDesignToEditor(result.design as unknown as Record<string, unknown>);
      }
    },
    [userId, content.id, resolveManifestEmailImages, pushDesignToEditor, setLegacyEmailBuilderEffects, setVa2IsResolvingImage, setVa2Manifest, setVa2AssemblyResult],
  );

  return {
    handleWizardComplete,
    handleSwitchVariant,
    handleApplyAiDraft,
    handleManifestAssembled,
  };
}

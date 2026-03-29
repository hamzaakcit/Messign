import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { ContentItem } from '@/lib/marketingApi';
import { getStarterTemplates } from '../../unlayerTemplates/registry';
import {
  applyDensityToManifestSections,
  mergeUserEmailDraftIntoTemplateManifest,
  normalizeManifest,
  parseManifestFromLLMOutput,
  synthesizeManifestFromPlainText,
} from '../../lib/manifestParser';
import {
  formatManifestValidationWarningsAsStrings,
  runEmailAssemblyPipeline,
  validateManifest,
} from '../../lib/designAssembler';
import { enrichManifestForVisualDensity } from '../../lib/enrichManifestVisuals';
import type { BrandEmailColors } from '../../lib/emailAiDraftToDesign';
import type { DesignManifest } from '../../lib/types/manifestTypes';
import type { AssemblyResult } from '../../lib/types/unlayerTypes';
import { resetIdCounter } from '../../lib/designTokens';
import { buildEmailBrandOverridesForAssembly } from '../../lib/emailBrandHeaderOverrides';
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
  real_estate_open_house: 'email-real-estate-open-house',
  nonprofit_giving: 'email-nonprofit-impact-giving',
  food_hospitality: 'email-food-chefs-table',
  music_tour: 'email-music-tour-announce',
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

/** Surface assembler warnings/skips so users know when layout or sections were adjusted. */
function notifyAssemblyQuality(result: AssemblyResult): void {
  if (result.warnings.length > 0) {
    const forToast = result.warnings.filter((line) => !line.includes('[Copy Quality · low]'));
    const lines = forToast.length > 0 ? forToast : result.warnings;
    const w = lines.slice(0, 3).join(' · ');
    toast.info(`Email build: ${w}${lines.length > 3 ? '…' : ''}`, {
      duration: 6500,
      id: 'va2-email-build-warnings',
    });
  }
  if (result.skippedSections.length > 0) {
    const labels = result.skippedSections
      .map((s) => `${s.type} (order ${s.order})`)
      .slice(0, 4)
      .join(', ');
    toast.warning(
      `Some sections were skipped: ${labels}${result.skippedSections.length > 4 ? '…' : ''}`,
      { duration: 8000, id: 'va2-email-build-skipped' },
    );
  }
}

function assembleEmail(
  manifest: DesignManifest,
  brandFooterDefaults: EmailBuilderState['brandFooterDefaults'],
  brandColors: BrandEmailColors | undefined,
  brandLogoUrl: string | undefined,
  manifestValidationWarnings?: string[],
): AssemblyResult {
  return runEmailAssemblyPipeline(manifest, {
    footerDefaults: brandFooterDefaults,
    brandOverrides: buildEmailBrandOverridesForAssembly(
      brandColors,
      brandLogoUrl,
      brandFooterDefaults?.companyName,
    ),
    manifestValidationWarnings: manifestValidationWarnings?.length
      ? manifestValidationWarnings
      : undefined,
  });
}

export function useEmailWizardAssembly(
  state: EmailBuilderState,
  content: ContentItem,
) {
  const {
    userId,
    brandFooterDefaults,
    brandColors,
    brandLogoUrl,
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

  const wizardRunAbortRef = useRef<AbortController | null>(null);
  const manifestPickAbortRef = useRef<AbortController | null>(null);
  const applyDraftAbortRef = useRef<AbortController | null>(null);

  const cancelApplyDraft = useCallback(() => {
    applyDraftAbortRef.current?.abort();
  }, []);

  const cancelWizardTemplateRun = useCallback(() => {
    wizardRunAbortRef.current?.abort();
  }, []);

  const cancelManifestPick = useCallback(() => {
    manifestPickAbortRef.current?.abort();
  }, []);

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
      wizardRunAbortRef.current?.abort();
      const ac = new AbortController();
      wizardRunAbortRef.current = ac;
      void (async () => {
        const rawBody = content.body ?? '';
        let mergedA = normalizeManifest({
          ...(starter.manifest as Record<string, unknown>),
          theme: result.theme,
        });
        if (rawBody.trim()) {
          mergedA = mergeUserEmailDraftIntoTemplateManifest(mergedA, rawBody);
        }
        mergedA = applyDensityToManifestSections(mergedA, result.density);
        const validatedA = validateManifest(mergedA as unknown);
        if (!validatedA.valid) {
          const msg = validatedA.errors
            .slice(0, 2)
            .map((e) => e.message)
            .join('; ');
          toast.error(`Template manifest needs fixes: ${msg}`);
          openBuilderWithSaved();
          return;
        }
        if (validatedA.normalizedManifest) {
          mergedA = validatedA.normalizedManifest;
        }
        mergedA = enrichManifestForVisualDensity(mergedA);
        const validatedAfterEnrichA = validateManifest(mergedA as unknown);
        if (validatedAfterEnrichA.valid && validatedAfterEnrichA.normalizedManifest) {
          mergedA = validatedAfterEnrichA.normalizedManifest;
        }
        if (ac.signal.aborted) return;
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
            mergedB = applyDensityToManifestSections(mergedB, result.density);
            const vB = validateManifest(mergedB as unknown);
            if (!vB.valid) {
              toast.warning('A/B variant B failed validation — loading variant A only');
              mergedB = null;
            } else if (vB.normalizedManifest) {
              mergedB = vB.normalizedManifest;
            }
            if (mergedB) {
              mergedB = enrichManifestForVisualDensity(mergedB);
              const vAfterB = validateManifest(mergedB as unknown);
              if (vAfterB.valid && vAfterB.normalizedManifest) {
                mergedB = vAfterB.normalizedManifest;
              }
            }
          }
          if (ac.signal.aborted) return;
          if (userId && content.id) {
            try {
              mergedA = (await resolveManifestEmailImages(mergedA, { signal: ac.signal })).manifest;
              if (mergedB) {
                mergedB = (
                  await resolveManifestEmailImages(mergedB, {
                    suppressToast: true,
                    signal: ac.signal,
                  })
                ).manifest;
              }
            } catch (imgErr) {
              console.warn('[VA2] Template image resolution failed:', imgErr);
            }
          }
          if (ac.signal.aborted) return;
          resetIdCounter();
          const assembled = assembleEmail(
            mergedA,
            brandFooterDefaults,
            brandColors,
            brandLogoUrl,
            formatManifestValidationWarningsAsStrings(validatedAfterEnrichA),
          );
          if (assembled.success && assembled.design) {
            notifyAssemblyQuality(assembled);
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
      let manifest = state.va2Variants[idx];
      manifest = enrichManifestForVisualDensity(manifest);
      const vAfter = validateManifest(manifest as unknown);
      if (vAfter.valid && vAfter.normalizedManifest) {
        manifest = vAfter.normalizedManifest;
      }
      setVa2Manifest(manifest);
      resetIdCounter();
      const v = vAfter;
      const mw =
        v.valid && v.warnings.length > 0 ? formatManifestValidationWarningsAsStrings(v) : undefined;
      const result = assembleEmail(manifest, brandFooterDefaults, brandColors, brandLogoUrl, mw);
      if (result.success && result.design) {
        notifyAssemblyQuality(result);
      }
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

    applyDraftAbortRef.current?.abort();
    const applyAc = new AbortController();
    applyDraftAbortRef.current = applyAc;

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
      let manifest: DesignManifest = { ...manifests[0] };
      if (wizardOverrides?.theme) {
        manifest = { ...manifest, theme: wizardOverrides.theme };
      }
      const validated = validateManifest(manifest as unknown);
      if (!validated.valid) {
        const msg = validated.errors
          .slice(0, 3)
          .map((e) => e.message)
          .join('; ');
        toast.error(`Email design data is invalid: ${msg}`);
        openBuilderWithAiTemplateLegacy();
        return;
      }
      if (validated.normalizedManifest) {
        manifest = validated.normalizedManifest;
      }
      if (wizardOverrides?.density) {
        manifest = applyDensityToManifestSections(manifest, wizardOverrides.density);
      }
      manifest = enrichManifestForVisualDensity(manifest);
      const validatedAfterEnrich = validateManifest(manifest as unknown);
      if (validatedAfterEnrich.valid && validatedAfterEnrich.normalizedManifest) {
        manifest = validatedAfterEnrich.normalizedManifest;
      }
      setLegacyEmailBuilderEffects(false);
      setVa2Variants(manifests.map((m, i) => (i === 0 ? manifest : m)));
      setVa2ActiveVariant('A');
      setVa2Manifest(manifest);

      if (manifestHasResolvableImagePrompts(manifest) && userId && content.id) {
        setVa2IsResolvingImage(true);
        try {
          if (applyAc.signal.aborted) return;
          manifest = (await resolveManifestEmailImages(manifest, { signal: applyAc.signal })).manifest;
          if (applyAc.signal.aborted) return;
          setVa2Manifest(manifest);
        } catch (imgError) {
          console.warn('[VA2] Section image resolution failed, using fallbacks:', imgError);
        } finally {
          setVa2IsResolvingImage(false);
        }
      }

      const assembled = assembleEmail(
        manifest,
        brandFooterDefaults,
        brandColors,
        brandLogoUrl,
        formatManifestValidationWarningsAsStrings(validatedAfterEnrich),
      );
      setVa2AssemblyResult(assembled);

      if (assembled.success && assembled.design) {
        notifyAssemblyQuality(assembled);
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
      manifestPickAbortRef.current?.abort();
      const ac = new AbortController();
      manifestPickAbortRef.current = ac;
      setLegacyEmailBuilderEffects(false);
      let dm = enrichManifestForVisualDensity({ ...manifest } as unknown as DesignManifest);
      if (manifestHasResolvableImagePrompts(dm) && userId && content.id) {
        setVa2IsResolvingImage(true);
        try {
          dm = (await resolveManifestEmailImages(dm, { signal: ac.signal })).manifest;
        } catch (e) {
          console.warn('[VA2] Image resolution failed for template pick:', e);
        } finally {
          setVa2IsResolvingImage(false);
        }
      }
      if (ac.signal.aborted) return;
      const vPick = validateManifest(dm as unknown);
      if (vPick.valid && vPick.normalizedManifest) {
        dm = vPick.normalizedManifest as DesignManifest;
      }
      const mwPick =
        vPick.valid && vPick.warnings.length > 0
          ? formatManifestValidationWarningsAsStrings(vPick)
          : undefined;
      resetIdCounter();
      const result = assembleEmail(dm, brandFooterDefaults, brandColors, brandLogoUrl, mwPick);
      if (result.success && result.design) {
        notifyAssemblyQuality(result);
      }
      setVa2Manifest(dm);
      setVa2AssemblyResult(result);
      if (result.success && result.design) {
        pushDesignToEditor(result.design as unknown as Record<string, unknown>);
      }
    },
    [
      userId,
      content.id,
      brandFooterDefaults,
      brandColors,
      brandLogoUrl,
      resolveManifestEmailImages,
      pushDesignToEditor,
      setLegacyEmailBuilderEffects,
      setVa2IsResolvingImage,
      setVa2Manifest,
      setVa2AssemblyResult,
    ],
  );

  return {
    handleWizardComplete,
    handleSwitchVariant,
    handleApplyAiDraft,
    handleManifestAssembled,
    cancelApplyDraft,
    cancelWizardTemplateRun,
    cancelManifestPick,
  };
}

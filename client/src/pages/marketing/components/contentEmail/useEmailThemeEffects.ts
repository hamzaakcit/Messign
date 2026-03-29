import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { runEmailAssemblyPipeline } from '../../lib/designAssembler';
import type { DesignManifest } from '../../lib/types/manifestTypes';
import type { UnlayerRow as Va2UnlayerRow } from '../../lib/types/unlayerTypes';
import { resetIdCounter } from '../../lib/designTokens';
import { buildEmailBrandOverridesForAssembly } from '../../lib/emailBrandHeaderOverrides';
import type { ThemeName } from '../../lib/types/designTokenTypes';
import {
  applyPaperPlaneToLegacyDesign,
  EASTER_EGG_OPTIONS,
} from '../../lib/specialEffects';
import {
  manifestToPaperPlaneUiEffect,
  paperPlaneUiEffectToManifestFields,
  resolveMotionOverlayFromManifest,
  type PaperPlaneUiEffect,
} from '../../lib/motionOverlayManifest';
import { removeAllOverlays } from '../../lib/overlayEngine';
import {
  resolvePlaneAssetAsync,
  onPlaneAssetResolved,
  preloadPaperPlaneAssets,
} from '../../lib/paperPlaneAssets';
import { trackVa2EmailTelemetry } from '../../lib/emailMarketingTelemetry';
import type { EmailBuilderState } from './useEmailBuilderState';

function paperPlaneEnabledFromUi(effect: PaperPlaneUiEffect): boolean {
  return effect === 'paper_plane_signature' || effect === 'paper_plane_subtle';
}

function overlayIntensityFromUi(effect: PaperPlaneUiEffect): 'signature' | 'subtle' {
  return effect === 'paper_plane_subtle' ? 'subtle' : 'signature';
}

export function useEmailThemeEffects(state: EmailBuilderState) {
  const {
    userId,
    brandFooterDefaults,
    brandColors,
    brandLogoUrl,
    builderOpen,
    va2Manifest, setVa2Manifest,
    va2Variants, va2ActiveVariant, setVa2Variants,
    setVa2IsAssembling,
    setVa2AssemblyResult,
    legacyEmailBuilderEffects,
    legacyEffectsTheme, setLegacyEffectsTheme,
    legacyEasterEgg, setLegacyEasterEgg,
    pushDesignToEditor,
    getDesignFromEditor,
  } = state;

  const [effectsOpen, setEffectsOpen] = useState(false);

  const brandOverrides = useMemo(
    () =>
      buildEmailBrandOverridesForAssembly(
        brandColors,
        brandLogoUrl,
        brandFooterDefaults?.companyName,
      ),
    [brandColors, brandLogoUrl, brandFooterDefaults?.companyName],
  );

  useEffect(() => {
    if (!builderOpen) return;
    preloadPaperPlaneAssets();
  }, [builderOpen]);

  useEffect(() => {
    const unsub = onPlaneAssetResolved((resolvedTheme, _url) => {
      if (!builderOpen) return;
      const activeTheme = va2Manifest?.theme ?? legacyEffectsTheme;
      if (resolvedTheme !== activeTheme) return;
      const activeEffect = va2Manifest
        ? manifestToPaperPlaneUiEffect(va2Manifest)
        : legacyEasterEgg;
      if (!paperPlaneEnabledFromUi(activeEffect)) return;

      void (async () => {
        try {
          const exported = await getDesignFromEditor();
          if (!exported) return;
          const intensity = overlayIntensityFromUi(activeEffect);
          const updated = applyPaperPlaneToLegacyDesign(exported, resolvedTheme as ThemeName, {
            intensity,
            brandPrimaryHex: brandOverrides?.primaryHex,
          });
          pushDesignToEditor(updated);
        } catch {
          /* editor not ready */
        }
      })();
    });
    return unsub;
  }, [
    builderOpen,
    va2Manifest,
    legacyEffectsTheme,
    legacyEasterEgg,
    brandOverrides?.primaryHex,
    pushDesignToEditor,
    getDesignFromEditor,
  ]);

  const handleLegacyThemeSwitch = (newTheme: ThemeName) => {
    if (!legacyEmailBuilderEffects || newTheme === legacyEffectsTheme) return;
    setLegacyEffectsTheme(newTheme);
    if (!paperPlaneEnabledFromUi(legacyEasterEgg)) return;

    void (async () => {
      setVa2IsAssembling(true);
      try {
        if (userId) {
          await resolvePlaneAssetAsync(newTheme, userId, {
            brandPrimaryHex: brandOverrides?.primaryHex,
          });
        }
        const exported = await getDesignFromEditor();
        if (!exported || typeof exported !== 'object') return;
        const updated = applyPaperPlaneToLegacyDesign(exported, newTheme, {
          intensity: overlayIntensityFromUi(legacyEasterEgg),
          brandPrimaryHex: brandOverrides?.primaryHex,
        });
        pushDesignToEditor(updated);
        trackVa2EmailTelemetry('email_theme_switch', {
          theme: newTheme,
          surface: 'legacy_effects',
          paperPlane: legacyEasterEgg,
        });
      } finally {
        setVa2IsAssembling(false);
      }
    })();
  };

  const handleThemeSwitch = (newTheme: ThemeName) => {
    if (!va2Manifest || newTheme === va2Manifest.theme) return;

    void (async () => {
      setVa2IsAssembling(true);
      try {
        const updatedManifest: DesignManifest = { ...va2Manifest, theme: newTheme };
        setVa2Manifest(updatedManifest);

        if (va2Variants.length > 0) {
          const variantIdx = va2ActiveVariant === 'A' ? 0 : 1;
          const updatedVariants = [...va2Variants];
          updatedVariants[variantIdx] = updatedManifest;
          setVa2Variants(updatedVariants);
        }

        const motion = resolveMotionOverlayFromManifest(updatedManifest);
        if (motion.enabled && userId) {
          await resolvePlaneAssetAsync(newTheme, userId, {
            brandPrimaryHex: brandOverrides?.primaryHex,
          });
        }

        resetIdCounter();
        const result = runEmailAssemblyPipeline(updatedManifest, {
          footerDefaults: brandFooterDefaults,
          brandOverrides,
        });
        setVa2AssemblyResult(result);

        if (result.success && result.design) {
          pushDesignToEditor(result.design as unknown as Record<string, unknown>);
          trackVa2EmailTelemetry('email_theme_switch', {
            theme: newTheme,
            surface: 'va2',
            motionOverlay: updatedManifest.motionOverlay ?? 'paper_plane_sweep',
            assemblySuccess: true,
          });
        }
      } finally {
        setVa2IsAssembling(false);
      }
    })();
  };

  const handleEffectToggle = async (effect: PaperPlaneUiEffect) => {
    if (legacyEmailBuilderEffects && !va2Manifest) {
      setEffectsOpen(false);
      setVa2IsAssembling(true);
      try {
        setLegacyEasterEgg(effect);
        const exported = await getDesignFromEditor();
        if (!exported || typeof exported !== 'object') {
          toast.error('Editor design not ready yet. Wait for the canvas to load.');
          return;
        }
        if (effect === 'none') {
          const clone = structuredClone(exported) as { body?: { rows?: Va2UnlayerRow[] } };
          removeAllOverlays(clone);
          pushDesignToEditor(clone as Record<string, unknown>);
        } else {
          if (userId) {
            await resolvePlaneAssetAsync(legacyEffectsTheme, userId, {
              brandPrimaryHex: brandOverrides?.primaryHex,
            });
          }
          const updated = applyPaperPlaneToLegacyDesign(exported, legacyEffectsTheme, {
            intensity: overlayIntensityFromUi(effect),
            brandPrimaryHex: brandOverrides?.primaryHex,
          });
          pushDesignToEditor(updated);
        }
        trackVa2EmailTelemetry('email_motion_overlay_toggle', {
          effect,
          surface: 'legacy_effects',
          theme: legacyEffectsTheme,
        });
      } finally {
        setVa2IsAssembling(false);
      }
      return;
    }

    if (!va2Manifest) return;
    setEffectsOpen(false);
    setVa2IsAssembling(true);
    try {
      const fields = paperPlaneUiEffectToManifestFields(effect);
      const updatedManifest: DesignManifest = {
        ...va2Manifest,
        ...fields,
      };
      setVa2Manifest(updatedManifest);

      if (va2Variants.length > 0) {
        const variantIdx = va2ActiveVariant === 'A' ? 0 : 1;
        const updatedVariants = [...va2Variants];
        updatedVariants[variantIdx] = updatedManifest;
        setVa2Variants(updatedVariants);
      }

      if (paperPlaneEnabledFromUi(effect) && userId) {
        await resolvePlaneAssetAsync(updatedManifest.theme, userId, {
          brandPrimaryHex: brandOverrides?.primaryHex,
        });
      }

      resetIdCounter();
      const result = runEmailAssemblyPipeline(updatedManifest, {
        footerDefaults: brandFooterDefaults,
        brandOverrides,
      });
      setVa2AssemblyResult(result);

      if (result.success && result.design) {
        pushDesignToEditor(result.design as unknown as Record<string, unknown>);
        trackVa2EmailTelemetry('email_motion_overlay_toggle', {
          effect,
          surface: 'va2',
          theme: updatedManifest.theme,
          assemblySuccess: true,
        });
      }
    } finally {
      setVa2IsAssembling(false);
    }
  };

  const displayedEasterEgg: PaperPlaneUiEffect =
    legacyEmailBuilderEffects && !va2Manifest
      ? legacyEasterEgg
      : va2Manifest
        ? manifestToPaperPlaneUiEffect(va2Manifest)
        : 'none';
  const activeEffectLabel =
    EASTER_EGG_OPTIONS.find((o) => o.value === displayedEasterEgg)?.label ?? 'Off';

  return {
    effectsOpen, setEffectsOpen,
    handleLegacyThemeSwitch,
    handleThemeSwitch,
    handleEffectToggle,
    displayedEasterEgg,
    activeEffectLabel,
  };
}

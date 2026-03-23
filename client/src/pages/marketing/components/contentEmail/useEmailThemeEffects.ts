import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { assembleDesign } from '../../lib/designAssembler';
import type { DesignManifest } from '../../lib/types/manifestTypes';
import type { UnlayerRow as Va2UnlayerRow } from '../../lib/types/unlayerTypes';
import { resetIdCounter } from '../../lib/designTokens';
import type { ThemeName } from '../../lib/types/designTokenTypes';
import {
  applyPaperPlaneToLegacyDesign,
  EASTER_EGG_OPTIONS,
  type EasterEggType,
} from '../../lib/specialEffects';
import { removeAllOverlays } from '../../lib/overlayEngine';
import { resolvePlaneAssetAsync, onPlaneAssetResolved } from '../../lib/paperPlaneAssets';
import type { EmailBuilderState } from './useEmailBuilderState';

export function useEmailThemeEffects(state: EmailBuilderState) {
  const {
    userId,
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

  useEffect(() => {
    const unsub = onPlaneAssetResolved((resolvedTheme, _url) => {
      if (!builderOpen) return;
      const activeTheme = va2Manifest?.theme ?? legacyEffectsTheme;
      if (resolvedTheme !== activeTheme) return;
      const activeEffect = legacyEasterEgg;
      if (activeEffect !== 'paper_plane') return;

      void (async () => {
        try {
          const exported = await getDesignFromEditor();
          if (!exported) return;
          const updated = applyPaperPlaneToLegacyDesign(exported, resolvedTheme as ThemeName);
          pushDesignToEditor(updated);
        } catch {
          /* editor not ready */
        }
      })();
    });
    return unsub;
  }, [builderOpen, va2Manifest, legacyEffectsTheme, legacyEasterEgg, pushDesignToEditor, getDesignFromEditor]);

  const handleLegacyThemeSwitch = (newTheme: ThemeName) => {
    if (!legacyEmailBuilderEffects || newTheme === legacyEffectsTheme) return;
    setLegacyEffectsTheme(newTheme);
    if (legacyEasterEgg !== 'paper_plane') return;

    void (async () => {
      setVa2IsAssembling(true);
      try {
        const exported = await getDesignFromEditor();
        if (!exported || typeof exported !== 'object') return;
        const updated = applyPaperPlaneToLegacyDesign(exported, newTheme);
        pushDesignToEditor(updated);
        if (userId) void resolvePlaneAssetAsync(newTheme, userId);
      } finally {
        setVa2IsAssembling(false);
      }
    })();
  };

  const handleThemeSwitch = (newTheme: ThemeName) => {
    if (!va2Manifest || newTheme === va2Manifest.theme) return;

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

      resetIdCounter();
      const result = assembleDesign(updatedManifest);
      setVa2AssemblyResult(result);

      if (result.success && result.design) {
        pushDesignToEditor(result.design as unknown as Record<string, unknown>);
      }
    } finally {
      setVa2IsAssembling(false);
    }
  };

  const handleEffectToggle = async (effect: EasterEggType) => {
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
          const updated = applyPaperPlaneToLegacyDesign(exported, legacyEffectsTheme);
          pushDesignToEditor(updated);
          if (effect === 'paper_plane' && userId) {
            void resolvePlaneAssetAsync(legacyEffectsTheme, userId);
          }
        }
      } finally {
        setVa2IsAssembling(false);
      }
      return;
    }

    if (!va2Manifest) return;
    setEffectsOpen(false);
    setVa2IsAssembling(true);
    try {
      const updatedManifest: DesignManifest = {
        ...va2Manifest,
        easterEgg: effect === 'none' ? undefined : effect,
      };
      setVa2Manifest(updatedManifest);

      if (va2Variants.length > 0) {
        const variantIdx = va2ActiveVariant === 'A' ? 0 : 1;
        const updatedVariants = [...va2Variants];
        updatedVariants[variantIdx] = updatedManifest;
        setVa2Variants(updatedVariants);
      }

      resetIdCounter();
      const result = assembleDesign(updatedManifest);
      setVa2AssemblyResult(result);

      if (result.success && result.design) {
        pushDesignToEditor(result.design as unknown as Record<string, unknown>);
      }

      if (effect === 'paper_plane' && userId) {
        void resolvePlaneAssetAsync(updatedManifest.theme, userId);
      }
    } finally {
      setVa2IsAssembling(false);
    }
  };

  const displayedEasterEgg =
    legacyEmailBuilderEffects && !va2Manifest ? legacyEasterEgg : (va2Manifest?.easterEgg ?? 'none');
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

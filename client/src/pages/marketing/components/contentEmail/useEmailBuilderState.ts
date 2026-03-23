import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { marketingAPI, type ContentItem } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';
import type { UnlayerEmailEditorHandle } from '../UnlayerEmailEditor';
import { getStarterTemplates } from '../../unlayerTemplates/registry';
import {
  buildEmailDesignFromAiDraft,
  extractBrandEmailColors,
  plainTextFromHtml,
} from '../../lib/emailAiDraftToDesign';
import type { DesignManifest } from '../../lib/types/manifestTypes';
import type { AssemblyResult } from '../../lib/types/unlayerTypes';
import type { ThemeName } from '../../lib/types/designTokenTypes';
import type { EasterEggType } from '../../lib/specialEffects';
import { inferEmailGoalFromDraft } from '../EmailDesignWizard';
import { manifestHasResolvableImagePrompts, mergeResolvedEmailImagesIntoManifest } from './manifestHelpers';

type UserTemplate = { id: string; name: string; manifest_json: Record<string, unknown>; category?: string; description?: string | null };

export function useEmailBuilderState({
  content,
  onUpdated,
  surface,
}: {
  content: ContentItem;
  onUpdated: () => void | Promise<void>;
  surface: 'page' | 'cockpit';
}) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [builderOpen, setBuilderOpen] = useState(false);
  const editorRef = useRef<UnlayerEmailEditorHandle>(null);
  const [bodyHtml, setBodyHtml] = useState(content.body_html ?? '');
  const [bodyDesign, setBodyDesign] = useState<Record<string, unknown> | null>(content.body_design ?? null);
  const [editorKey, setEditorKey] = useState(content.id);
  const [saving, setSaving] = useState(false);
  const [brandColors, setBrandColors] = useState<ReturnType<typeof extractBrandEmailColors>>(undefined);

  const [va2Manifest, setVa2Manifest] = useState<DesignManifest | null>(null);
  const [va2Variants, setVa2Variants] = useState<DesignManifest[]>([]);
  const [va2ActiveVariant, setVa2ActiveVariant] = useState<'A' | 'B'>('A');
  const [va2AssemblyResult, setVa2AssemblyResult] = useState<AssemblyResult | null>(null);
  const [va2IsAssembling, setVa2IsAssembling] = useState(false);
  const [va2IsResolvingImage, setVa2IsResolvingImage] = useState(false);

  const [legacyEmailBuilderEffects, setLegacyEmailBuilderEffects] = useState(false);
  const [legacyEffectsTheme, setLegacyEffectsTheme] = useState<ThemeName>('minimal');
  const [legacyEasterEgg, setLegacyEasterEgg] = useState<EasterEggType>('none');

  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateForm, setSaveTemplateForm] = useState({ name: '', category: 'custom', description: '' });
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [wizardOpen, setWizardOpen] = useState(false);

  const suggestedGoal = useMemo(() => inferEmailGoalFromDraft(content.body ?? ''), [content.body]);
  const applyAiBusy = va2IsAssembling || va2IsResolvingImage;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void marketingAPI
      .getBrandProfile(userId)
      .then((r) => {
        if (cancelled) return;
        setBrandColors(extractBrandEmailColors(r.profile) ?? undefined);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void marketingAPI
      .listEmailTemplates(userId, { pageSize: 50 })
      .then((r) => {
        if (cancelled) return;
        const withManifest = (r.data ?? [])
          .filter((t): t is typeof t & { manifest_json: Record<string, unknown> } =>
            Boolean(t.manifest_json && Object.keys(t.manifest_json).length > 0),
          );
        setUserTemplates(withManifest);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const mergedStarters = useMemo(() => {
    const bundled = getStarterTemplates('email');
    const userStarters = userTemplates.map((t): import('../../unlayerTemplates/types').UnlayerStarterTemplate => ({
      id: `user-template-${t.id}`,
      title: t.name,
      design: null,
      manifest: t.manifest_json,
      category: (t.category === 'sales_outreach' || t.category === 'product_launch') ? 'sales'
        : (t.category === 'newsletter') ? 'nurture'
        : (t.category === 'event_invite') ? 'engage'
        : 'general',
      description: t.description || 'Saved template',
    }));
    return [...bundled, ...userStarters];
  }, [userTemplates]);

  const pushDesignToEditor = useCallback((design: Record<string, unknown>) => {
    setBodyHtml('');
    if (builderOpen && editorRef.current?.loadDesign) {
      const ok = editorRef.current.loadDesign(design);
      if (ok) {
        setBodyDesign(design);
        return;
      }
    }
    setBodyDesign(design);
    setEditorKey(`va2-${content.id}-${Date.now()}`);
    setBuilderOpen(true);
  }, [builderOpen, content.id]);

  const resolveManifestEmailImages = useCallback(
    async (manifest: DesignManifest, options?: { suppressToast?: boolean }): Promise<DesignManifest> => {
      if (!manifestHasResolvableImagePrompts(manifest)) return manifest;
      if (!userId || !content.id) return manifest;
      const imageResult = await marketingAPI.resolveEmailImages(userId, content.id, {
        manifest: manifest as unknown as Record<string, unknown>,
        workspace_id: null,
      });
      const merged = mergeResolvedEmailImagesIntoManifest(manifest, imageResult.images, imageResult.itemImages);
      const sectionKeys = imageResult.images ? Object.keys(imageResult.images).length : 0;
      const itemKeys = imageResult.itemImages ? Object.keys(imageResult.itemImages).length : 0;
      const imageCount = sectionKeys + itemKeys;
      if (imageCount > 0 && !options?.suppressToast) {
        toast.success(`Generated ${imageCount} image${imageCount > 1 ? 's' : ''} for email sections`);
      }
      if (imageResult.errors?.length) {
        console.warn('[VA2] Some section images failed:', imageResult.errors);
      }
      return merged;
    },
    [userId, content.id],
  );

  const openBuilderWithSaved = useCallback(() => {
    setLegacyEmailBuilderEffects(false);
    setVa2Manifest(null);
    setVa2Variants([]);
    setVa2AssemblyResult(null);
    const hasSavedVisual =
      Boolean(content.body_design && Object.keys(content.body_design).length > 0) ||
      Boolean((content.body_html ?? '').trim());
    setBodyHtml(hasSavedVisual ? (content.body_html ?? '') : '');
    setBodyDesign(hasSavedVisual ? (content.body_design ?? null) : null);
    setEditorKey(content.id);
    setBuilderOpen(true);
  }, [content.body_design, content.body_html, content.id]);

  const openBuilderWithAiTemplateLegacy = useCallback(() => {
    const raw = content.body ?? '';
    if (!raw.trim()) {
      toast.error('No AI draft text to apply');
      return;
    }
    setLegacyEmailBuilderEffects(true);
    setLegacyEffectsTheme('minimal');
    setLegacyEasterEgg('none');
    setVa2Manifest(null);
    setVa2Variants([]);
    setVa2AssemblyResult(null);
    setBodyDesign(
      buildEmailDesignFromAiDraft(raw, {
        contentId: content.id,
        layoutStyle: 'messign-architect',
        brandColors,
        heroImageUrl: content.image_url ?? undefined,
      }),
    );
    setBodyHtml('');
    setEditorKey(`ai-${content.id}-${Date.now()}`);
    setBuilderOpen(true);
    toast.success(
      'AI draft loaded (Messign Architect: topic-based body background; saved image used when set). Adjust in the builder, then save.',
    );
  }, [content.body, content.id, content.image_url, brandColors]);

  const getDesignFromEditor = useCallback(async (): Promise<Record<string, unknown> | null> => {
    try {
      const ex = await editorRef.current?.exportNow();
      if (ex?.design) return ex.design as Record<string, unknown>;
    } catch {
      /* editor may still be loading */
    }
    return bodyDesign;
  }, [bodyDesign]);

  const handleSave = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    try {
      let html = bodyHtml;
      let design = bodyDesign;
      try {
        const exported = await editorRef.current?.exportNow();
        if (exported) {
          html = exported.html;
          design = exported.design;
        }
      } catch {
        toast.error('Editor is still loading. Try again in a moment.');
        return;
      }
      const plain = plainTextFromHtml(html);
      await marketingAPI.updateContent(userId, content.id, {
        body_html: html,
        body_design: design,
        body: plain || content.body,
      });
      await onUpdated();
      toast.success('Email design saved.');
      setBuilderOpen(false);
    } finally {
      setSaving(false);
    }
  }, [userId, bodyHtml, bodyDesign, content.id, content.body, onUpdated]);

  const stripClass =
    surface === 'cockpit'
      ? 'flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-[#0c0f14]/80 px-3 py-1.5 text-[11px] text-slate-400'
      : 'flex flex-wrap items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-app-muted';

  const loadingClass =
    surface === 'cockpit'
      ? 'flex items-center gap-2 border-b border-white/[0.06] bg-cyan-950/40 px-3 py-1.5 text-[11px] text-cyan-200/90'
      : 'flex items-center gap-2 border-b border-white/10 bg-primary-500/10 px-3 py-1.5 text-xs text-app-text';

  return {
    user,
    userId,
    builderOpen, setBuilderOpen,
    editorRef,
    bodyHtml, setBodyHtml,
    bodyDesign, setBodyDesign,
    editorKey, setEditorKey,
    saving,
    brandColors,
    va2Manifest, setVa2Manifest,
    va2Variants, setVa2Variants,
    va2ActiveVariant, setVa2ActiveVariant,
    va2AssemblyResult, setVa2AssemblyResult,
    va2IsAssembling, setVa2IsAssembling,
    va2IsResolvingImage, setVa2IsResolvingImage,
    legacyEmailBuilderEffects, setLegacyEmailBuilderEffects,
    legacyEffectsTheme, setLegacyEffectsTheme,
    legacyEasterEgg, setLegacyEasterEgg,
    saveTemplateOpen, setSaveTemplateOpen,
    saveTemplateForm, setSaveTemplateForm,
    savingTemplate, setSavingTemplate,
    wizardOpen, setWizardOpen,
    userTemplates, setUserTemplates,
    suggestedGoal,
    applyAiBusy,
    mergedStarters,
    pushDesignToEditor,
    resolveManifestEmailImages,
    openBuilderWithSaved,
    openBuilderWithAiTemplateLegacy,
    getDesignFromEditor,
    handleSave,
    stripClass,
    loadingClass,
  };
}

export type EmailBuilderState = ReturnType<typeof useEmailBuilderState>;

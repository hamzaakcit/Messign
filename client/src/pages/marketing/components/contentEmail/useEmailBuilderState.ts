import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runEmailAssemblyPipeline } from '../../lib/designAssembler';
import { resetIdCounter } from '../../lib/designTokens';
import type { BrandThemeOverrides } from '../../lib/designTokens';
import { buildEmailBrandOverridesForAssembly } from '../../lib/emailBrandHeaderOverrides';
import { toast } from 'sonner';
import { marketingAPI, type ContentItem } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';
import type { UnlayerEmailEditorHandle } from '../UnlayerEmailEditor';
import { getStarterTemplates } from '../../unlayerTemplates/registry';
import {
  buildEmailDesignFromAiDraft,
  extractBrandEmailColors,
  extractBrandLogoUrl,
  extractBrandFooterDefaults,
  plainTextFromHtml,
  type BrandFooterDefaults,
} from '../../lib/emailAiDraftToDesign';
import type { DesignManifest } from '../../lib/types/manifestTypes';
import type { AssemblyResult } from '../../lib/types/unlayerTypes';
import { trackVa2EmailResolveTelemetry, trackVa2EmailTelemetry } from '../../lib/emailMarketingTelemetry';
import type { ThemeName } from '../../lib/types/designTokenTypes';
import type { PaperPlaneUiEffect } from '../../lib/motionOverlayManifest';
import { inferEmailGoalFromDraft } from '../EmailDesignWizard';
import type { EmailResolveDebugPayload } from '../../lib/emailResolveTypes';
import {
  hashManifestForIdempotencyKey,
  hasEmailResolveRegenerateTargets,
  isPersistedUnlayerDesign,
  manifestHasResolvableImagePrompts,
  mergeResolvedEmailImagesIntoManifest,
  mergeResolveTelemetryIntoManifest,
  type ResolveManifestEmailImagesResult,
} from './manifestHelpers';
import type { EmailResolveRegeneratePayload } from '../../lib/emailResolveTypes';

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
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | undefined>(undefined);
  const [brandFooterDefaults, setBrandFooterDefaults] = useState<BrandFooterDefaults | undefined>(undefined);

  const [va2Manifest, setVa2Manifest] = useState<DesignManifest | null>(null);
  const [va2Variants, setVa2Variants] = useState<DesignManifest[]>([]);
  const [va2ActiveVariant, setVa2ActiveVariant] = useState<'A' | 'B'>('A');
  const [va2AssemblyResult, setVa2AssemblyResult] = useState<AssemblyResult | null>(null);
  const [va2IsAssembling, setVa2IsAssembling] = useState(false);
  const [va2IsResolvingImage, setVa2IsResolvingImage] = useState(false);
  const [va2LastResolve, setVa2LastResolve] = useState<{
    runId?: string;
    durationMs: number;
    partial: boolean;
    at: string;
    idempotencyReplayed?: boolean;
    debug?: EmailResolveDebugPayload;
  } | null>(null);

  const [legacyEmailBuilderEffects, setLegacyEmailBuilderEffects] = useState(false);
  const [legacyEffectsTheme, setLegacyEffectsTheme] = useState<ThemeName>('minimal');
  const [legacyEasterEgg, setLegacyEasterEgg] = useState<PaperPlaneUiEffect>('none');

  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateForm, setSaveTemplateForm] = useState({ name: '', category: 'custom', description: '' });
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [wizardOpen, setWizardOpen] = useState(false);

  const va2BrandOverrides = useMemo((): BrandThemeOverrides => {
    return buildEmailBrandOverridesForAssembly(
      brandColors,
      brandLogoUrl,
      brandFooterDefaults?.companyName,
    );
  }, [brandColors, brandLogoUrl, brandFooterDefaults?.companyName]);

  const va2ManifestRef = useRef(va2Manifest);
  va2ManifestRef.current = va2Manifest;
  const bodyDesignRef = useRef(bodyDesign);
  bodyDesignRef.current = bodyDesign;

  /** When the builder opens, resolve campaign images and assemble Unlayer if the server only stored `va2_manifest` (no rows). */
  const va2BuilderBootstrapKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setVa2Manifest(null);
    setVa2Variants([]);
    setVa2ActiveVariant('A');
    setVa2AssemblyResult(null);
    setVa2LastResolve(null);
  }, [content.id]);

  /** Restore VA2 manifest / variants when saved `body_design` includes `va2_manifest` (after save or load). */
  useEffect(() => {
    const d = content.body_design as Record<string, unknown> | null | undefined;
    if (!d || typeof d !== 'object') return;
    const vm = d.va2_manifest;
    if (vm && typeof vm === 'object' && !Array.isArray(vm)) {
      const m = vm as DesignManifest;
      if (Array.isArray(m.sections) && m.sections.length > 0) {
        setVa2Manifest(m);
      }
    }
    const vv = d.va2_variants;
    if (Array.isArray(vv) && vv.length > 0 && vv.every((x) => x && typeof x === 'object')) {
      setVa2Variants(vv as DesignManifest[]);
    }
    const ab = d.va2_active_variant;
    if (ab === 'A' || ab === 'B') setVa2ActiveVariant(ab);
  }, [content.id, content.body_design]);

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
        setBrandLogoUrl(extractBrandLogoUrl(r.profile));
        setBrandFooterDefaults(extractBrandFooterDefaults(r.profile));
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
    async (
      manifest: DesignManifest,
      options?: {
        suppressToast?: boolean;
        signal?: AbortSignal;
        idempotencyKey?: string;
        regenerate?: EmailResolveRegeneratePayload;
      },
    ): Promise<ResolveManifestEmailImagesResult> => {
      if (options?.signal?.aborted) return { manifest, filledSlots: 0 };
      const reg = options?.regenerate;
      if (!hasEmailResolveRegenerateTargets(reg) && !manifestHasResolvableImagePrompts(manifest)) {
        return { manifest, filledSlots: 0 };
      }
      if (!userId || !content.id) return { manifest, filledSlots: 0 };
      let imageResult: Awaited<ReturnType<typeof marketingAPI.resolveEmailImages>>;
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      try {
        imageResult = await marketingAPI.resolveEmailImages(
          userId,
          content.id,
          {
            manifest: manifest as unknown as Record<string, unknown>,
            workspace_id: null,
            persist: true,
            ...(reg ? { regenerate: reg } : {}),
          },
          {
            idempotencyKey:
              options?.idempotencyKey ?? hashManifestForIdempotencyKey(manifest, content.id, reg ?? null),
            signal: options?.signal,
          },
        );
      } catch (e) {
        const isAbort =
          (typeof e === 'object' &&
            e !== null &&
            'name' in e &&
            (e as { name?: string }).name === 'AbortError') ||
          (e instanceof Error && /aborted/i.test(e.message));
        if (isAbort) {
          return { manifest, filledSlots: 0 };
        }
        const raw = e instanceof Error ? e.message : String(e);
        const isRate = /too many|rate limit|429/i.test(raw);
        const isNet = /network|fetch|Failed to fetch/i.test(raw);
        const friendly = isRate
          ? 'Too many image requests — wait a minute and retry.'
          : isNet
            ? 'Network error — check your connection and retry.'
            : `Marketing API error — images were not merged. ${raw}`;
        console.warn('[VA2] resolveEmailImages failed:', e);
        trackVa2EmailResolveTelemetry({
          durationMs: 0,
          slotCount: 0,
          partial: true,
          errorCount: 1,
          failureReason: isRate ? 'rate_limit' : isNet ? 'network' : 'api',
        });
        if (!options?.suppressToast) {
          toast.error(friendly);
        }
        return {
          manifest: mergeResolveTelemetryIntoManifest(manifest, {
            partial: true,
            errors: [raw],
          }),
          filledSlots: 0,
        };
      }
      if (options?.signal?.aborted) return { manifest, filledSlots: 0 };
      const durationMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
      );
      let merged = mergeResolvedEmailImagesIntoManifest(manifest, imageResult.images, imageResult.itemImages);
      merged = mergeResolveTelemetryIntoManifest(merged, imageResult);
      const sectionKeys = imageResult.images ? Object.keys(imageResult.images).length : 0;
      const itemKeys = imageResult.itemImages ? Object.keys(imageResult.itemImages).length : 0;
      const imageCount = sectionKeys + itemKeys;
      setVa2LastResolve({
        runId: imageResult.resolveRunId,
        durationMs,
        partial: Boolean(imageResult.partial ?? imageResult.errors?.length),
        at: new Date().toISOString(),
        idempotencyReplayed: imageResult.idempotencyReplayed,
        debug: imageResult.debug,
      });
      trackVa2EmailResolveTelemetry({
        durationMs,
        slotCount: imageCount,
        partial: Boolean(imageResult.partial ?? imageResult.errors?.length),
        idempotencyReplayed: imageResult.idempotencyReplayed,
        errorCount: imageResult.errors?.length ?? 0,
      });
      if (imageCount > 0 && !options?.suppressToast) {
        toast.success(`Generated ${imageCount} image${imageCount > 1 ? 's' : ''} for email sections`);
      }
      if (imageResult.errors?.length) {
        console.warn('[VA2] Some section images failed:', imageResult.errors);
        if (!options?.suppressToast) {
          const preview = imageResult.errors.slice(0, 2).join(' · ');
          toast.warning(
            `Some images used fallbacks (${imageResult.errors.length} issue${imageResult.errors.length > 1 ? 's' : ''}). ${preview}${imageResult.errors.length > 2 ? '…' : ''}`,
          );
        }
      }
      const sr = imageResult.sectionResults;
      if (sr && Object.keys(sr).length > 0 && !options?.suppressToast) {
        const bad = Object.entries(sr).filter(
          ([, v]) => v && v.status && v.status !== 'generated' && v.status !== 'stock',
        );
        if (bad.length > 0) {
          const detail = bad
            .slice(0, 4)
            .map(([ord, v]) => `section order ${ord}: ${v.status}${v.error ? ` (${v.error})` : ''}`)
            .join('; ');
          trackVa2EmailTelemetry('email_resolve_slot_status', {
            failedSlots: bad.length,
            detail,
          });
        }
      }
      return { manifest: merged, filledSlots: imageCount };
    },
    [userId, content.id],
  );

  useEffect(() => {
    if (!builderOpen) {
      va2BuilderBootstrapKeyRef.current = null;
      return;
    }
    if (!userId || !content.id) return;

    const sessionKey = `${content.id}:${editorKey}`;
    if (va2BuilderBootstrapKeyRef.current === sessionKey) return;

    const ac = new AbortController();
    const run = async (): Promise<void> => {
      const manifest = va2ManifestRef.current;
      if (!manifest) {
        va2BuilderBootstrapKeyRef.current = sessionKey;
        return;
      }

      const needsResolve = manifestHasResolvableImagePrompts(manifest);
      const bd = bodyDesignRef.current;
      const designComplete = isPersistedUnlayerDesign(bd);

      if (!needsResolve && designComplete) {
        va2BuilderBootstrapKeyRef.current = sessionKey;
        return;
      }

      if (needsResolve) {
        setVa2IsResolvingImage(true);
      }
      setVa2IsAssembling(true);
      try {
        let m = manifest;
        if (needsResolve) {
          const r = await resolveManifestEmailImages(m, { signal: ac.signal, suppressToast: true });
          m = r.manifest;
          if (ac.signal.aborted) return;
          setVa2Manifest(m);
        }
        if (!designComplete || needsResolve) {
          if (ac.signal.aborted) return;
          resetIdCounter();
          const result = runEmailAssemblyPipeline(m, {
            footerDefaults: brandFooterDefaults,
            brandOverrides: va2BrandOverrides,
          });
          setVa2AssemblyResult(result);
          if (result.success && result.design) {
            pushDesignToEditor(result.design as unknown as Record<string, unknown>);
          }
        }
        va2BuilderBootstrapKeyRef.current = sessionKey;
      } finally {
        setVa2IsResolvingImage(false);
        setVa2IsAssembling(false);
      }
    };

    void run();
    return () => {
      ac.abort();
    };
  }, [
    builderOpen,
    content.id,
    editorKey,
    userId,
    brandFooterDefaults,
    va2BrandOverrides,
    resolveManifestEmailImages,
    pushDesignToEditor,
  ]);

  const openBuilderWithSaved = useCallback(() => {
    setLegacyEmailBuilderEffects(false);
    setVa2AssemblyResult(null);
    const d = content.body_design as Record<string, unknown> | null | undefined;
    const vv = d?.va2_variants;
    if (Array.isArray(vv) && vv.length > 0 && vv.every((x) => x && typeof x === 'object')) {
      setVa2Variants(vv as DesignManifest[]);
    } else {
      setVa2Variants([]);
    }
    const ab = d?.va2_active_variant;
    if (ab === 'A' || ab === 'B') {
      setVa2ActiveVariant(ab);
    }
    const vm = d?.va2_manifest;
    if (vm && typeof vm === 'object' && !Array.isArray(vm)) {
      const m = vm as DesignManifest;
      if (Array.isArray(m.sections) && m.sections.length > 0) {
        setVa2Manifest(m);
      } else {
        setVa2Manifest(null);
      }
    } else {
      setVa2Manifest(null);
    }
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
      let persistedDesign = design as Record<string, unknown>;
      if (va2Manifest) {
        persistedDesign = {
          ...persistedDesign,
          va2_manifest: va2Manifest as unknown as Record<string, unknown>,
          va2_pipeline_version: '2',
          va2_saved_at: new Date().toISOString(),
        };
      }
      if (va2Variants.length > 0) {
        persistedDesign = {
          ...persistedDesign,
          va2_variants: va2Variants as unknown as Record<string, unknown>[],
          va2_active_variant: va2ActiveVariant,
        };
      }
      await marketingAPI.updateContent(userId, content.id, {
        body_html: html,
        body_design: persistedDesign,
        body: plain || content.body,
      });
      await onUpdated();
      toast.success('Email design saved.');
      setBuilderOpen(false);
    } finally {
      setSaving(false);
    }
  }, [userId, bodyHtml, bodyDesign, content.id, content.body, onUpdated, va2Manifest, va2Variants, va2ActiveVariant]);

  const stripClass =
    surface === 'cockpit'
      ? 'flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-[#0c0f14]/80 px-3 py-1.5 text-[11px] text-slate-400'
      : 'flex flex-wrap items-center gap-2 border-b border-app-border bg-app-surface-tertiary px-3 py-1.5 text-xs text-app-muted';

  const loadingClass =
    surface === 'cockpit'
      ? 'flex items-center gap-2 border-b border-white/[0.06] bg-cyan-950/40 px-3 py-1.5 text-[11px] text-cyan-200/90'
      : 'flex items-center gap-2 border-b border-app-border bg-primary-500/10 px-3 py-1.5 text-xs text-app-text';

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
    brandLogoUrl,
    brandFooterDefaults,
    va2Manifest, setVa2Manifest,
    va2Variants, setVa2Variants,
    va2ActiveVariant, setVa2ActiveVariant,
    va2AssemblyResult, setVa2AssemblyResult,
    va2IsAssembling, setVa2IsAssembling,
    va2IsResolvingImage, setVa2IsResolvingImage,
    va2LastResolve,
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

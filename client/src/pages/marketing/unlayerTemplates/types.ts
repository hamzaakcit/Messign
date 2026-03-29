export type UnlayerDisplayMode = 'email' | 'web' | 'popup' | 'document';

export type TemplateCategory =
  | 'sales'
  | 'nurture'
  | 'announce'
  | 'engage'
  | 'general'
  | 'real_estate'
  | 'nonprofit'
  | 'food'
  | 'music';

/** Bundled starter; `design: null` means blank canvas (loadBlank). */
/** Default VA2 keys expected for manifest-based email starters (subject line, preheader, theme, rows). */
export const DEFAULT_VA2_STARTER_MANIFEST_FIELDS: readonly string[] = [
  'subject',
  'preheader',
  'theme',
  'sections',
  'metadata.visual_density',
];

export type UnlayerStarterTemplate = {
  id: string;
  title: string;
  design: Record<string, unknown> | null;
  /** Public URL e.g. `/marketing/unlayer/foo.png` */
  thumbnailSrc?: string;
  /**
   * Exported HTML (e.g. Unlayer "Export HTML" zip). Loaded with legacy HTML import.
   * Use with `design: null`. Image paths inside the HTML should be absolute to `/marketing/...`.
   */
  htmlImportUrl?: string;
  /** VA2 DesignManifest JSON — assembled via `runEmailAssemblyPipeline()` / Unlayer at load time. */
  manifest?: Record<string, unknown>;
  /**
   * Manifest keys this starter expects (shown in the gallery). Defaults to
   * {@link DEFAULT_VA2_STARTER_MANIFEST_FIELDS} when `manifest` is set.
   */
  requiredManifestFields?: readonly string[];
  /** Goal category for filtering in the template gallery. */
  category?: TemplateCategory;
  /** Short description shown in the gallery card. */
  description?: string;
};

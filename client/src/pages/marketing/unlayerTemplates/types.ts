export type UnlayerDisplayMode = 'email' | 'web' | 'popup' | 'document';

export type TemplateCategory = 'sales' | 'nurture' | 'announce' | 'engage' | 'general';

/** Bundled starter; `design: null` means blank canvas (loadBlank). */
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
  /** VA2 DesignManifest JSON — assembled via `assembleDesign()` at load time. */
  manifest?: Record<string, unknown>;
  /** Goal category for filtering in the template gallery. */
  category?: TemplateCategory;
  /** Short description shown in the gallery card. */
  description?: string;
};

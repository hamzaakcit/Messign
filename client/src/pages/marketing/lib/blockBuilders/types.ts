import type { ManifestSection } from '../types/manifestTypes';
import type { DesignTheme, SpacingKey } from '../types/designTokenTypes';
import type { UnlayerRow as Va2UnlayerRow } from '../types/unlayerTypes';

/** Options passed to every block builder */
export interface BlockBuilderOptions {
  variant?: string;
  spacing?: {
    paddingTop?: SpacingKey;
    paddingBottom?: SpacingKey;
  };
}

/** Block builder function signature (VA2 manifest sections -> Unlayer rows) */
export type BlockBuilder = (
  content: ManifestSection['content'],
  theme: DesignTheme,
  options?: BlockBuilderOptions,
) => Va2UnlayerRow[];

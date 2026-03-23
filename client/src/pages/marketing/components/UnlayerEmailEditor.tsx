import { forwardRef } from 'react';
import { UnlayerEditor, type UnlayerEditorHandle, type UnlayerEditorProps, type UnlayerExportPayload } from './UnlayerEditor';

export type { UnlayerExportPayload };

/** @deprecated Use UnlayerEditorHandle — kept for existing imports */
export type UnlayerEmailEditorHandle = UnlayerEditorHandle;

type UnlayerEmailEditorProps = Omit<UnlayerEditorProps, 'displayMode'>;

export const UnlayerEmailEditor = forwardRef<UnlayerEditorHandle, UnlayerEmailEditorProps>(function UnlayerEmailEditor(
  props,
  ref,
) {
  return <UnlayerEditor ref={ref} displayMode="email" {...props} />;
});

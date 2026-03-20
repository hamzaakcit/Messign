/**
 * @deprecated Import from ./widgetCoercers, ./WidgetUnknownFallback, or ./blockRegistry instead.
 * Re-exports preserved for stable import paths.
 */
export { coerceInvoicePreviewData, coerceLeaderboardData } from './widgetCoercers';
export { UnknownWidgetFallback } from './WidgetUnknownFallback';
export { renderRegisteredBlock as renderWidgetContent, type WidgetRenderContext } from './blockRegistry';

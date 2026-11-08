import { getAdapter, registerAdapter } from './adapter.js';
import { mockAdapter } from './mockAdapter.js';

/** The mock adapter is always available. Real adapters register themselves here as their work packages land. */
export function registerBuiltInAdapters(): void {
  if (!getAdapter(mockAdapter.provider)) registerAdapter(mockAdapter);
}
registerBuiltInAdapters();

export * from './adapter.js';
export * from './messages.js';
export * from './dispatch.js';
export * from './dlrSimulator.js';
export { MOCK_PROVIDER, MOCK_SIGNATURE_HEADER, mockProviderMessageId, signMockPayload, resetMockAdapter } from './mockAdapter.js';

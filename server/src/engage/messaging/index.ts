import { getAdapter, registerAdapter } from './adapter.js';
import { mockAdapter } from './mockAdapter.js';
import { createSesAdapter } from './sesAdapter.js';

/** Built-in adapters: the mock (sandbox only, enforced by the gate's account-mode rule) and Amazon SES. */
export function registerBuiltInAdapters(): void {
  if (!getAdapter(mockAdapter.provider)) registerAdapter(mockAdapter);
  if (!getAdapter('ses')) registerAdapter(createSesAdapter());
}
registerBuiltInAdapters();

export * from './adapter.js';
export * from './messages.js';
export * from './dispatch.js';
export { evaluateGate, checkContent, REQUIRED_READINESS, type GateResult, type GateReason } from './gate.js';
export * from './gateConfig.js';
export * from './dlrSimulator.js';
export { MOCK_PROVIDER, MOCK_SIGNATURE_HEADER, mockProviderMessageId, signMockPayload, resetMockAdapter } from './mockAdapter.js';
export { createSesAdapter, SES_PROVIDER, snsStringToSign, mapSesNotification } from './sesAdapter.js';

/**
 * Messign AI Brain — Circuit Breaker
 *
 * Monitors AI provider health (Groq, Gemini, Anthropic) and prevents
 * wasted time on providers that are consistently failing.
 *
 * States:
 * - CLOSED: Provider is healthy, requests go through normally
 * - OPEN: Provider is failing, requests are skipped immediately
 * - HALF_OPEN: Testing if provider has recovered (allows 1 request through)
 *
 * Configuration:
 * - Failure threshold: 3 consecutive failures → OPEN
 * - Recovery timeout: 30 seconds → HALF_OPEN
 * - Success in HALF_OPEN → back to CLOSED
 * - Failure in HALF_OPEN → back to OPEN (reset timer)
 */

type CircuitState = 'closed' | 'open' | 'half_open';

interface ProviderCircuit {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
  lastSuccessAt: number;
  totalFailures: number;
  totalSuccesses: number;
  halfOpenProbeInFlight: boolean;
}

const FAILURE_THRESHOLD = 3;
const RECOVERY_TIMEOUT_MS = 30_000; // 30 seconds

const circuits: Map<string, ProviderCircuit> = new Map();

/**
 * Get or initialize a circuit for a provider.
 */
function getCircuit(provider: string): ProviderCircuit {
  let circuit = circuits.get(provider);
  if (!circuit) {
    circuit = {
      state: 'closed',
      failureCount: 0,
      lastFailureAt: 0,
      lastSuccessAt: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      halfOpenProbeInFlight: false,
    };
    circuits.set(provider, circuit);
  }
  return circuit;
}

/**
 * Check if a provider is available (circuit is not open).
 * Returns true if the request should proceed.
 */
export function isProviderAvailable(provider: string): boolean {
  const circuit = getCircuit(provider);

  switch (circuit.state) {
    case 'closed':
      return true;

    case 'open': {
      if (Date.now() - circuit.lastFailureAt >= RECOVERY_TIMEOUT_MS) {
        circuit.state = 'half_open';
        circuit.halfOpenProbeInFlight = true;
        console.log(`[Circuit Breaker] ${provider}: OPEN → HALF_OPEN (testing recovery)`);
        return true;
      }
      return false;
    }

    case 'half_open':
      if (circuit.halfOpenProbeInFlight) {
        return false;
      }
      circuit.halfOpenProbeInFlight = true;
      return true;
  }
}

/**
 * Record a successful call to a provider.
 */
export function recordSuccess(provider: string): void {
  const circuit = getCircuit(provider);
  circuit.totalSuccesses++;
  circuit.lastSuccessAt = Date.now();

  if (circuit.state === 'half_open') {
    circuit.state = 'closed';
    circuit.failureCount = 0;
    circuit.halfOpenProbeInFlight = false;
    console.log(`[Circuit Breaker] ${provider}: HALF_OPEN → CLOSED (recovered)`);
  } else {
    circuit.failureCount = 0;
  }
}

/**
 * Record a failed call to a provider.
 */
export function recordFailure(provider: string, error?: string): void {
  const circuit = getCircuit(provider);
  circuit.totalFailures++;
  circuit.failureCount++;
  circuit.lastFailureAt = Date.now();

  if (circuit.state === 'half_open') {
    circuit.state = 'open';
    circuit.halfOpenProbeInFlight = false;
    console.log(`[Circuit Breaker] ${provider}: HALF_OPEN → OPEN (recovery failed: ${error})`);
  } else if (circuit.failureCount >= FAILURE_THRESHOLD) {
    // Too many failures — open the circuit
    circuit.state = 'open';
    console.warn(`[Circuit Breaker] ${provider}: CLOSED → OPEN (${circuit.failureCount} consecutive failures: ${error})`);
  }
}

/**
 * Get the ordered list of available providers.
 * Skips providers with open circuits.
 */
export function getAvailableProviders(): string[] {
  const allProviders = ['groq', 'gemini', 'anthropic'];
  return allProviders.filter(p => isProviderAvailable(p));
}

/**
 * Get circuit status for all providers (admin monitoring).
 */
export function getCircuitStatus(): Record<string, {
  state: CircuitState;
  failureCount: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
}> {
  const status: Record<string, {
    state: CircuitState;
    failureCount: number;
    totalFailures: number;
    totalSuccesses: number;
    lastFailureAt: string | null;
    lastSuccessAt: string | null;
  }> = {};

  for (const provider of ['groq', 'gemini', 'anthropic']) {
    const circuit = getCircuit(provider);
    // Refresh state in case recovery timeout elapsed
    isProviderAvailable(provider);

    status[provider] = {
      state: circuit.state,
      failureCount: circuit.failureCount,
      totalFailures: circuit.totalFailures,
      totalSuccesses: circuit.totalSuccesses,
      lastFailureAt: circuit.lastFailureAt ? new Date(circuit.lastFailureAt).toISOString() : null,
      lastSuccessAt: circuit.lastSuccessAt ? new Date(circuit.lastSuccessAt).toISOString() : null,
    };
  }

  return status;
}

/**
 * Reset a specific provider's circuit (manual recovery).
 */
export function resetCircuit(provider: string): void {
  const circuit = getCircuit(provider);
  circuit.state = 'closed';
  circuit.failureCount = 0;
  console.log(`[Circuit Breaker] ${provider}: Manual reset → CLOSED`);
}

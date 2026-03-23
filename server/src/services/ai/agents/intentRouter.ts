/**
 * Alias for the intent router (agents/orchestrator.ts).
 * New code should import from this file for clarity.
 */
export {
  runOrchestrator,
  buildAgentContextFromDora,
  NoSpecialistError,
  type OrchestratorResult,
} from './orchestrator.js';

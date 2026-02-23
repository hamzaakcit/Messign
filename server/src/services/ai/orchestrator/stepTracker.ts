import type { ToolResult } from '../types.js';
import type {
  AgentStep,
  StepTokenUsage,
  OrchestratorConfig,
  TerminationReason,
} from './types.js';

type ObservationEntry = ToolResult & { toolName: string; executionTimeMs: number };

export class StepTracker {
  private steps: AgentStep[] = [];
  private totalTokens: StepTokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  private toolCache = new Map<string, ToolResult>();
  private startTime: number;
  private config: OrchestratorConfig;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.startTime = Date.now();
  }

  addStep(step: AgentStep): void {
    this.steps.push(step);
    this.totalTokens.promptTokens += step.tokensUsed.promptTokens;
    this.totalTokens.completionTokens += step.tokensUsed.completionTokens;
    this.totalTokens.totalTokens += step.tokensUsed.totalTokens;
  }

  getSteps(): AgentStep[] {
    return [...this.steps];
  }

  getStepCount(): number {
    return this.steps.length;
  }

  getTokenUsage(): StepTokenUsage {
    return { ...this.totalTokens };
  }

  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }

  shouldTerminate(): TerminationReason | null {
    if (this.steps.length >= this.config.maxSteps) {
      console.log(`[StepTracker] Terminating: max steps (${this.steps.length}/${this.config.maxSteps})`);
      return 'max_steps';
    }

    const tokenRatio = this.totalTokens.totalTokens / this.config.maxTotalTokens;
    if (tokenRatio >= this.config.tokenBudgetThreshold) {
      console.log(`[StepTracker] Terminating: token budget (${Math.round(tokenRatio * 100)}% used)`);
      return 'token_budget';
    }

    const elapsed = this.getElapsedMs();
    if (elapsed >= this.config.totalTimeoutMs) {
      console.log(`[StepTracker] Terminating: timeout (${elapsed}ms/${this.config.totalTimeoutMs}ms)`);
      return 'timeout';
    }

    return null;
  }

  private makeCacheKey(toolName: string, args: Record<string, unknown>): string {
    const safeArgs = args ?? {};
    const sortedArgs = Object.keys(safeArgs).sort().reduce((acc, key) => {
      acc[key] = safeArgs[key];
      return acc;
    }, {} as Record<string, unknown>);
    return `${toolName}:${JSON.stringify(sortedArgs)}`;
  }

  getCachedResult(toolName: string, args: Record<string, unknown>): ToolResult | null {
    if (!this.config.enableDeduplication) return null;
    const key = this.makeCacheKey(toolName, args);
    const cached = this.toolCache.get(key);
    if (cached) {
      console.log(`[StepTracker] Cache hit for ${toolName}`);
    }
    return cached || null;
  }

  cacheResult(toolName: string, args: Record<string, unknown>, result: ToolResult): void {
    if (!this.config.enableDeduplication) return;
    const key = this.makeCacheKey(toolName, args);
    this.toolCache.set(key, result);
  }

  buildFullContextForSynthesis(): string {
    const allObservations: string[] = [];

    for (const step of this.steps) {
      for (const obs of step.observations) {
        if (obs.success && obs.summary) {
          allObservations.push(obs.summary);
        }
      }
    }

    const unique = [...new Set(allObservations)];
    return unique.join('\n\n---\n\n');
  }

  getUniqueToolsUsed(): string[] {
    const toolSet = new Set<string>();
    for (const step of this.steps) {
      for (const obs of step.observations) {
        toolSet.add(obs.toolName);
      }
    }
    return Array.from(toolSet);
  }

  getTotalDataPoints(): number {
    return this.steps.reduce(
      (sum, step) => sum + step.observations.reduce(
        (s, obs) => s + (obs.metadata?.count ?? 0), 0
      ), 0
    );
  }

  getThoughtTrace(): string[] {
    return this.steps
      .filter((s) => s.thought)
      .map((s) => `[Step ${s.index + 1}] ${s.thought}`);
  }

  getTotalToolDurationMs(): number {
    return this.steps.reduce(
      (sum, step) => sum + step.observations.reduce(
        (s, obs) => s + obs.executionTimeMs, 0
      ), 0
    );
  }
}

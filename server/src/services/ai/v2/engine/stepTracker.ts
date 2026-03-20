import type { StepRecord, ToolCall, ToolResult } from '../types.js';

function callKey(name: string, args: Record<string, unknown>): string {
  try {
    return `${name}:${JSON.stringify(args)}`;
  } catch {
    return `${name}:<unserializable>`;
  }
}

export class StepTracker {
  private seen = new Set<string>();
  readonly steps: StepRecord[] = [];

  isDuplicate(call: ToolCall): boolean {
    const k = callKey(call.name, call.args);
    if (this.seen.has(k)) return true;
    this.seen.add(k);
    return false;
  }

  recordStep(step: number, toolCalls: ToolCall[], results: ToolResult[]): void {
    this.steps.push({ step, toolCalls, results });
  }
}

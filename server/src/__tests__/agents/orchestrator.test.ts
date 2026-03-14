/**
 * Orchestrator routing tests.
 * Mocks callModelSafe to return predictable routing decisions, and getSpecialist to avoid real specialist execution.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOrchestrator, buildAgentContextFromDora } from '../../services/ai/agents/orchestrator.js';
import * as gateway from '../../services/ai/gateway.js';
import * as specialistRegistry from '../../services/ai/agents/specialistRegistry.js';
import * as moduleRegistry from '../../modules/registry.js';
import type { DoraRequestContext } from '../../services/ai/dora/types.js';
import type { ToolContext } from '../../services/ai/types.js';
import type { SpecialistAgent } from '../../services/ai/agents/types.js';

const mockDoraCtx: DoraRequestContext = {
  user: {
    userId: 'user-1',
    userUuid: '00000000-0000-0000-0000-000000000001',
    userName: 'Test User',
    userRole: 'manager',
    organizationId: 'org-1',
    department: 'Sales',
    teamId: null,
    knowledgeRole: null,
    level: 'L2',
    mpPoints: 100,
  },
  page: { currentPath: '/dora', currentModule: 'dora' },
  timestamp: new Date().toISOString(),
  todayDate: 'Friday, March 13, 2025',
  conciseMode: false,
};

const legacyContext: ToolContext = {
  userId: 'user-1',
  userRole: 'manager',
  organizationId: 'org-1',
  userName: 'Test User',
};

function buildContext(): ReturnType<typeof buildAgentContextFromDora> {
  return buildAgentContextFromDora(mockDoraCtx, legacyContext, 'conv-1', '/dora');
}

const mockSpecialist: SpecialistAgent = {
  namespace: 'mock',
  execute: async () => ({ type: 'final_answer', content: 'Mock specialist response' }),
};

describe('orchestrator', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(specialistRegistry, 'getSpecialist').mockImplementation((ns) =>
      ns ? { ...mockSpecialist, namespace: ns } : undefined,
    );
    vi.spyOn(moduleRegistry, 'getAccessibleModules').mockReturnValue([
      { namespace: 'crm' },
      { namespace: 'support' },
      { namespace: 'finance' },
      { namespace: 'hr' },
      { namespace: 'marketing' },
    ] as never);
  });

  it('"Show me my open deals" → routes to crm specialist', async () => {
    vi.spyOn(gateway, 'callModelSafe').mockResolvedValue({
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'route_to_specialist',
                  arguments: JSON.stringify({
                    primary_module: 'crm',
                    refined_query: 'Show me my open deals',
                    complexity: 'simple',
                  }),
                },
              },
            ],
          },
        },
      ],
    } as never);

    const chunks: string[] = [];
    const result = await runOrchestrator(
      'Show me my open deals',
      [],
      buildContext(),
      (chunk) => chunks.push(chunk),
    );

    expect(result.toolsUsed).toContain('crm');
    expect(result.stepCount).toBe(1);
    expect(result.terminationReason).toBe('complete');
    expect(gateway.callModelSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'fast',
        messages: expect.any(Array),
        tools: expect.any(Array),
      }),
    );
  });

  it('"What tickets are overdue?" → routes to support specialist', async () => {
    vi.spyOn(gateway, 'callModelSafe').mockResolvedValue({
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'route_to_specialist',
                  arguments: JSON.stringify({
                    primary_module: 'support',
                    refined_query: 'What tickets are overdue?',
                    complexity: 'simple',
                  }),
                },
              },
            ],
          },
        },
      ],
    } as never);

    const result = await runOrchestrator(
      'What tickets are overdue?',
      [],
      buildContext(),
      () => {},
    );

    expect(result.toolsUsed).toContain('support');
    expect(result.stepCount).toBe(1);
  });

  it('"Create an expense report" → routes to finance specialist', async () => {
    vi.spyOn(gateway, 'callModelSafe').mockResolvedValue({
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'route_to_specialist',
                  arguments: JSON.stringify({
                    primary_module: 'finance',
                    refined_query: 'Create an expense report',
                    complexity: 'moderate',
                  }),
                },
              },
            ],
          },
        },
      ],
    } as never);

    const result = await runOrchestrator(
      'Create an expense report',
      [],
      buildContext(),
      () => {},
    );

    expect(result.toolsUsed).toContain('finance');
    expect(result.stepCount).toBe(1);
  });

  it('"Hello, how are you?" → direct reply (no routing)', async () => {
    vi.spyOn(gateway, 'callModelSafe').mockResolvedValue({
      choices: [
        {
          message: {
            role: 'assistant',
            content: "Hello! I'm doing well, thanks for asking. How can I help you today?",
            tool_calls: undefined,
          },
        },
      ],
    } as never);

    const chunks: string[] = [];
    const result = await runOrchestrator(
      'Hello, how are you?',
      [],
      buildContext(),
      (chunk) => chunks.push(chunk),
    );

    expect(result.toolsUsed).toEqual([]);
    expect(result.stepCount).toBe(0);
    expect(result.finalAnswer).toContain('Hello');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('"Compare Q3 deals with Q4 support tickets" → routes to primary module', async () => {
    vi.spyOn(gateway, 'callModelSafe').mockResolvedValue({
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'route_to_specialist',
                  arguments: JSON.stringify({
                    primary_module: 'crm',
                    refined_query: 'Compare Q3 deals with Q4 support tickets',
                    complexity: 'complex',
                  }),
                },
              },
            ],
          },
        },
      ],
    } as never);

    const result = await runOrchestrator(
      'Compare Q3 deals with Q4 support tickets',
      [],
      buildContext(),
      () => {},
    );

    expect(result.toolsUsed).toContain('crm');
    expect(result.stepCount).toBe(1);
  });

  it('uses fast tier for orchestrator call', async () => {
    vi.spyOn(gateway, 'callModelSafe').mockResolvedValue({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Hi there!',
            tool_calls: undefined,
          },
        },
      ],
    } as never);

    await runOrchestrator('Hi', [], buildContext(), () => {});

    expect(gateway.callModelSafe).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'fast' }),
    );
  });
});

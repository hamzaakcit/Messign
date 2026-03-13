/**
 * Orchestrator Agent — Routing "traffic cop"
 *
 * Classifies user intent and routes to the appropriate specialist agent.
 * Uses fast tier (Groq) for classification only.
 */
import { callModelSafe } from '../gateway.js';
import { getAccessibleModules } from '../../../modules/registry.js';
import { getSpecialist } from './specialistRegistry.js';
import { requestApproval } from './approvalFlow.js';
import type { AgentContext, ActionApproval } from './types.js';

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Messign Workspace routing agent. Your job is to:
1. Understand the user's intent
2. Determine which department module(s) can handle it
3. Route to the correct specialist agent

You do NOT perform actions yourself. You classify and route.

Available modules (route by returning a JSON tool call):
{MODULE_LIST}

For cross-module queries (e.g., "deals at risk because of PTO requests"),
route to the PRIMARY module first, then indicate secondary modules needed.

If the query is a simple greeting or general question not tied to any module,
respond directly without routing.`;

export async function runOrchestrator(
  query: string,
  context: AgentContext,
): Promise<string> {
  const accessibleModules = getAccessibleModules(context.userRoles);

  const moduleList = accessibleModules
    .map((m) => `- ${m.namespace}: ${m.displayName} (${m.requiredRoles.join(', ') || 'any'})`)
    .join('\n');

  const systemPrompt = ORCHESTRATOR_SYSTEM_PROMPT.replace('{MODULE_LIST}', moduleList);

  const namespaces = accessibleModules.map((m) => m.namespace);
  if (namespaces.length === 0) {
    return "I don't have access to any modules. Please check your permissions.";
  }

  // Step 1: Classify intent using fast model
  const classificationResponse = await callModelSafe({
    tier: 'fast',
    tenantId: context.tenantId,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'route_to_specialist',
          description: 'Route the user query to the appropriate specialist agent',
          parameters: {
            type: 'object',
            properties: {
              primary_module: {
                type: 'string',
                enum: namespaces,
                description: 'The primary module to handle this query',
              },
              refined_query: {
                type: 'string',
                description: 'A refined, specific query for the specialist agent',
              },
              secondary_modules: {
                type: 'array',
                items: { type: 'string' },
                description: 'Additional modules needed for cross-module queries',
              },
              complexity: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'Query complexity assessment',
              },
            },
            required: ['primary_module', 'refined_query', 'complexity'],
          },
        },
      },
    ],
  });

  const choice = classificationResponse.choices?.[0];
  if (!choice?.message) {
    return "I couldn't process your request. Please try again.";
  }

  // If the orchestrator responds directly (greeting, general question)
  if (choice.finish_reason !== 'tool_calls' || !choice.message.tool_calls?.length) {
    return choice.message.content || "I'm here to help. What would you like to work on?";
  }

  // Step 2: Parse routing decision
  const toolCall = choice.message.tool_calls[0];
  const fn = toolCall.type === 'function' && 'function' in toolCall ? toolCall.function : null;
  if (!fn?.arguments) {
    return "I couldn't determine how to route your request. Please try rephrasing.";
  }

  let routing: {
    primary_module: string;
    refined_query: string;
    secondary_modules?: string[];
    complexity: 'low' | 'medium' | 'high';
  };
  try {
    routing = JSON.parse(fn.arguments) as typeof routing;
  } catch {
    return "I encountered an error parsing the routing decision. Please try again.";
  }

  // Step 3: Execute specialist agent
  const specialist = getSpecialist(routing.primary_module);
  if (!specialist) {
    return `I don't have access to the ${routing.primary_module} module. Please check your permissions.`;
  }

  const result = await specialist.execute(routing.refined_query, context);

  // Step 4: Handle cross-module (Phase 3 concern — stub for now)
  if (routing.secondary_modules && routing.secondary_modules.length > 0) {
    const crossModuleNote = `\n\n_Note: This analysis could be enriched with data from ${routing.secondary_modules.join(', ')}. Cross-module queries coming soon._`;
    return (result.content || '') + crossModuleNote;
  }

  // Step 5: Handle result type
  if (result.type === 'needs_approval' && result.approvalRequest) {
    return await handleApprovalRequest(result.approvalRequest, context);
  }

  return result.content || 'No response from specialist agent.';
}

async function handleApprovalRequest(
  approval: ActionApproval,
  context: AgentContext,
): Promise<string> {
  return requestApproval(approval, context);
}

/**
 * Module Registry — Loads domain plugins and wires tools, routes, and events
 */
import type { Express } from 'express';
import { Router } from 'express';
import type { PlatformModule, ToolRegistration } from './types.js';
import { registerTool, finalizeRegistry } from '../services/ai/toolRegistry.js';
import type { Tool, ToolResult } from '../services/ai/types.js';
import { eventBus } from '../platform/eventBus.js';

// Import all modules
import { crmModule } from './crm/index.js';
import { supportModule } from './support/index.js';
import { financeModule } from './finance/index.js';
import { hrModule } from './hr/index.js';
import { marketingModule } from './marketing/index.js';
import { knowledgeModule } from './knowledge/index.js';
import { timeModule } from './time/index.js';
import { okrModule } from './okr/index.js';
import { heartModule } from './heart/index.js';
import { executiveModule } from './executive/index.js';

const modules: PlatformModule[] = [
  crmModule,
  supportModule,
  financeModule,
  hrModule,
  marketingModule,
  knowledgeModule,
  timeModule,
  okrModule,
  heartModule,
  executiveModule,
];

const moduleMap: Map<string, PlatformModule> = new Map();

/** Map namespace to Tool category for the legacy registry */
const namespaceToCategory: Record<string, Tool['category']> = {
  crm: 'finance',
  support: 'analytics',
  finance: 'finance',
  hr: 'people',
  marketing: 'analytics',
  knowledge: 'knowledge',
  time: 'analytics',
  okr: 'analytics',
  heart: 'people',
  executive: 'analytics',
};

/** Convert ToolRegistration to Tool and register with the global registry */
function registerToolFromModule(reg: ToolRegistration): void {
  const params = reg.llmSchema.function.parameters;
  const props = params.properties ?? {};
  const tool: Tool = {
    name: reg.name,
    category: namespaceToCategory[reg.namespace] ?? 'analytics',
    description: reg.llmSchema.function.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(props).map(([k, v]) => [
          k,
          {
            type: (v.type === 'number' || v.type === 'boolean' || v.type === 'array' ? v.type : 'string') as 'string' | 'number' | 'boolean' | 'array',
            description: v.description ?? '',
            enum: v.enum,
          },
        ]),
      ),
      required: params.required ?? [],
    },
    requiredRoles: reg.requiredRoles,
    metadata: {
      namespace: reg.namespace,
      name: reg.name.split(':')[1] ?? reg.name,
      summary: reg.summary,
      tags: reg.tags,
      alwaysLoaded: !reg.deferLoaded,
      parameterHints: reg.parameterHints,
      requiredRoles: reg.requiredRoles,
    },
    execute: async (args, context): Promise<ToolResult> => {
      const result = await reg.handler(args, context);
      if (result && typeof result === 'object' && 'success' in result && 'data' in result && 'summary' in result) {
        return result as ToolResult;
      }
      return { success: true, data: result, summary: String(result), metadata: { source: reg.namespace } };
    },
  };
  registerTool(tool);
}

export async function initializeModules(app: Express): Promise<void> {
  for (const mod of modules) {
    // 1. Register tools
    const tools = mod.registerTools();
    for (const tool of tools) {
      registerToolFromModule(tool);
    }

    // 2. Mount routes under /api/{namespace}
    const router = mod.getRouter();
    app.use(`/api/${mod.namespace}`, router);

    // 3. Register event handlers
    mod.registerEventHandlers(eventBus);

    // 4. Store in map for agent access
    moduleMap.set(mod.namespace, mod);

    console.log(`[Registry] Module "${mod.displayName}" loaded: ${tools.length} tools`);
  }

  // Finalize the tool search index
  await finalizeRegistry();
}

/** Used by specialist agents to get module-specific prompt */
export function getModulePrompt(namespace: string, userRole: string): string | null {
  const mod = moduleMap.get(namespace);
  return mod?.getSystemPromptFragment(userRole) ?? null;
}

/** Used by orchestrator to determine which modules a user can access */
export function getAccessibleModules(userRoles: string[]): PlatformModule[] {
  return modules.filter(
    (mod) =>
      mod.requiredRoles.length === 0 || mod.requiredRoles.some((r) => userRoles.includes(r)),
  );
}

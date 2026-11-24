/**
 * Module Registry — Loads domain plugins and wires tools, routes, and events
 */
import type { Express } from 'express';
import { Router } from 'express';
import type { PlatformModule, ToolRegistration } from './types.js';
import { registerTool, finalizeRegistry } from '../services/ai/toolRegistry.js';
import type { Tool, ToolParameterProperty, ToolResult } from '../services/ai/types.js';
import { eventBus } from '../platform/eventBus.js';
import { isModuleOnSurface } from '../config/productSurface.js';

// Import all modules
import { crmModule } from './crm/index.js';
import { supportModule } from './support/index.js';
import { financeModule } from './finance/index.js';
import { hrModule } from './hr/index.js';
import { marketingModule } from './marketing/index.js';
import { knowledgeModule } from './knowledge/index.js';
import { okrModule } from './okr/index.js';
import { heartModule } from './heart/index.js';
import { executiveModule } from './executive/index.js';
import { assetsModule } from './assets/index.js';
import { contractsModule } from './contracts/index.js';
import { creativeModule } from './creative/index.js';
import { marketingAutomationModule } from './marketing_automation/index.js';

const modules: PlatformModule[] = [
  crmModule,
  supportModule,
  financeModule,
  hrModule,
  marketingModule,
  creativeModule,
  marketingAutomationModule,
  knowledgeModule,
  okrModule,
  heartModule,
  executiveModule,
  assetsModule,
  contractsModule,
];

const moduleMap: Map<string, PlatformModule> = new Map();

/** Map namespace to Tool category for the legacy registry */
const namespaceToCategory: Record<string, Tool['category']> = {
  crm: 'finance',
  support: 'analytics',
  finance: 'finance',
  hr: 'people',
  marketing: 'analytics',
  marketing_automation: 'analytics',
  creative: 'analytics',
  knowledge: 'knowledge',
  okr: 'analytics',
  heart: 'people',
  executive: 'analytics',
  assets: 'analytics',
  contracts: 'analytics',
  projects: 'analytics',
  people: 'people',
  analytics: 'analytics',
  seo: 'analytics',
  conversion: 'analytics',
  memory: 'analytics',
  automation: 'analytics',
  communication: 'analytics',
  system: 'analytics',
};

/** Map module LLM property → ToolParameterProperty (preserves array `items`, nested objects). */
function mapLlmPropertyToToolParameter(v: {
  type?: string;
  description?: string;
  enum?: string[];
  items?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}): ToolParameterProperty {
  const t = v.type;
  if (t === 'array') {
    const prop: ToolParameterProperty = {
      type: 'array',
      description: v.description ?? '',
    };
    if (v.items && typeof v.items === 'object') {
      const it = v.items;
      prop.items = {
        type: typeof it.type === 'string' ? it.type : 'string',
        description: typeof it.description === 'string' ? it.description : '',
      };
      if (Array.isArray(it.enum)) {
        prop.items.enum = it.enum as string[];
      }
    }
    return prop;
  }
  if (t === 'object' && v.properties && typeof v.properties === 'object') {
    return {
      type: 'object',
      description: v.description ?? '',
      properties: Object.fromEntries(
        Object.entries(v.properties).map(([key, child]) => [
          key,
          mapLlmPropertyToToolParameter(child as { type?: string; description?: string; enum?: string[]; items?: Record<string, unknown>; properties?: Record<string, unknown> }),
        ]),
      ),
    };
  }
  const typeStr =
    t === 'number' || t === 'boolean' || t === 'array' || t === 'object' ? t : 'string';
  return {
    type: typeStr as 'string' | 'number' | 'boolean' | 'array' | 'object',
    description: v.description ?? '',
    enum: v.enum,
  };
}

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
        Object.entries(props).map(([k, v]) => [k, mapLlmPropertyToToolParameter(v)]),
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
  for (const mod of modules.filter((m) => isModuleOnSurface(m.namespace))) {
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
      isModuleOnSurface(mod.namespace) &&
      (mod.requiredRoles.length === 0 || mod.requiredRoles.some((r) => userRoles.includes(r))),
  );
}

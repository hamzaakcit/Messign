/**
 * Zod argument schemas for high-traffic tools (executeTool validates before handlers).
 */
import { z } from 'zod';
import { productTruthLookupFields } from '../marketing/productTruthSearchService.js';

export const toolArgSchemas: Record<string, z.ZodType<Record<string, unknown>>> = {
  'knowledge:search_knowledge_base': z
    .object({
      query: z.string().min(1).max(800),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'core:search_tools': z
    .object({
      query: z.string().min(1).max(400),
      limit: z.number().int().min(1).max(25).optional(),
      namespace: z.string().max(64).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'core:activate_tool': z
    .object({
      tool_name: z.string().min(1).max(200),
    })
    .passthrough() as z.ZodType<Record<string, unknown>>,

  'projects:get_tasks_by_user': z
    .object({
      user_identifier: z.string().max(200).optional(),
      status_filter: z.string().max(64).optional(),
      project_name: z.string().max(200).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'marketing:product_truth_lookup': productTruthLookupFields.passthrough() as z.ZodType<Record<string, unknown>>,

  'marketing:brand_voice_check': z
    .object({
      draft_text: z.string().min(1).max(20_000),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'marketing:competitor_content_scan': z
    .object({
      competitor_name: z.string().max(200).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'marketing:validate_product_truth': z
    .object({
      content: z.string().min(1).max(24_000),
      topic: z.string().max(500).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'marketing:compliance_scan': z
    .object({
      content: z.string().min(1).max(20_000),
      content_type: z.string().max(120).optional(),
      target_channel: z.string().max(200).optional(),
      topic: z.string().max(500).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,
};

export function getToolArgSchema(toolName: string): z.ZodType<Record<string, unknown>> | undefined {
  return toolArgSchemas[toolName];
}

export function formatZodIssues(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
}

export function validateToolArgsForExecution(
  resolvedToolName: string,
  args: Record<string, unknown>,
): { ok: true; args: Record<string, unknown> } | { ok: false; summary: string } {
  const schema = getToolArgSchema(resolvedToolName);
  if (!schema) return { ok: true, args };
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      summary:
        `[TOOL_ARGS_INVALID] Fix the arguments and retry once. Issues: ${formatZodIssues(parsed.error)}.`,
    };
  }
  return { ok: true, args: parsed.data as Record<string, unknown> };
}

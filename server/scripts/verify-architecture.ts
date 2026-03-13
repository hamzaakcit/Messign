/**
 * Temporary diagnostic script: verify ToolMetadata + toolIndex architecture.
 *
 * - Initializes toolRegistry (populates toolIndex)
 * - Logs total registered tools and alwaysLoaded count
 * - Compares token estimates: new Dora (5 core tools) vs old (all tools)
 *
 * Run: npx tsx server/scripts/verify-architecture.ts
 * (from workspace root)
 */

// Trigger tool registration (populates registry + toolIndex)
import '../src/services/ai/tools/index.js';
import { getToolCount, getToolsForLLM } from '../src/services/ai/toolRegistry.js';
import { toolIndex } from '../src/services/ai/tools/toolIndex.js';

/** 5 core tools sent in the new Dora initialization (reduced payload) */
const CORE_5_NAMES = new Set([
  'knowledge:search_knowledge_base',
  'system:get_user_profile',
  'system:get_available_questions',
  'people:get_team_overview',
  'finance:get_financial_summary',
]);

function estimateTokens(str: string): number {
  return Math.ceil(str.length * 0.25);
}

function main() {
  const total = getToolCount();
  const alwaysLoadedCount = Array.from(toolIndex.values()).filter((m) => m.alwaysLoaded).length;

  console.log('\n=== Tool Registry & toolIndex Verification ===\n');
  console.log(`Total registered tools: ${total} (expected: 50+)`);
  console.log(`Always-loaded tools:   ${alwaysLoadedCount} (expected: 5)\n`);

  const allTools = getToolsForLLM();
  const coreTools = allTools.filter((t) => CORE_5_NAMES.has(t.function.name));

  const oldPayload = JSON.stringify(allTools);
  const newPayload = JSON.stringify(coreTools);

  const oldTokens = estimateTokens(oldPayload);
  const newTokens = estimateTokens(newPayload);
  const reduction = oldTokens - newTokens;
  const pct = total > 0 ? ((reduction / oldTokens) * 100).toFixed(1) : '0';

  console.log('=== Token Estimate Comparison ===\n');
  console.log('OLD (all tools):');
  console.log(`  Tools: ${allTools.length}`);
  console.log(`  Payload length: ${oldPayload.length} chars`);
  console.log(`  Est. tokens:    ${oldTokens} (~0.25 tokens/char)\n`);

  console.log('NEW (5 core tools only):');
  console.log(`  Tools: ${coreTools.length}`);
  coreTools.forEach((t) => console.log(`    - ${t.function.name}`));
  console.log(`  Payload length: ${newPayload.length} chars`);
  console.log(`  Est. tokens:    ${newTokens} (~0.25 tokens/char)\n`);

  console.log('=== Reduction ===');
  console.log(`  Tokens saved: ${reduction} (${pct}% reduction)`);
  console.log('');
}

main();

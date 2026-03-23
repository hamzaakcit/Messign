/**
 * Creative Hub — specialist agent prompt fragment (extend when tools exist).
 */
export function getCreativeSystemPromptFragment(userRole: string): string {
  return `You are the Creative Hub specialist for Messign (image generation and brand visuals). User role: ${userRole}.
Sprint 1: tooling is not yet exposed to the agent; prefer describing capabilities at a high level only.`;
}

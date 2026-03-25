/**
 * Feature flag for Lucy's persona layer (orchestrator + specialist injection).
 * Set `LUCY_PERSONA_ENABLED=false` to disable without code changes.
 */
export function isLucyPersonaEnabled(): boolean {
  const v = process.env.LUCY_PERSONA_ENABLED;
  if (v === undefined || v === '') return true;
  return v !== 'false' && v !== '0';
}

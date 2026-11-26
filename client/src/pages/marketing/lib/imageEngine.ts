/** Image engines the still controls can ask for. `all` tries each connected engine. */
export const IMAGE_ENGINES = ['fal', 'gemini', 'openai', 'litellm', 'all'] as const;

export type ImageEngine = (typeof IMAGE_ENGINES)[number];

export const IMAGE_ENGINE_LABEL: Record<ImageEngine, string> = {
  fal: 'Fal',
  gemini: 'Gemini',
  openai: 'OpenAI',
  litellm: 'LiteLLM',
  all: 'All connected',
};

/**
 * Menu for the still controls. An empty configured list shows every engine.
 * All connected appears when more than one engine is listed.
 */
export function imageEngineOptions(configured?: readonly Exclude<ImageEngine, 'all'>[]): ImageEngine[] {
  const known = new Set<string>(IMAGE_ENGINES);
  const engines = (configured ?? []).filter((id): id is Exclude<ImageEngine, 'all'> => known.has(id));
  const base: ImageEngine[] = engines.length > 0 ? [...engines] : ['fal', 'gemini', 'openai', 'litellm'];
  if (base.length > 1) return [...base, 'all'];
  return base;
}

/** Read the journey template id stored on an email child. */
export function journeyTemplateRefFromTags(tags: readonly string[] | null | undefined): string | null {
  const prefix = 'journey_template_ref:';
  const tag = tags?.find((item) => item.startsWith(prefix));
  return tag ? tag.slice(prefix.length) : null;
}

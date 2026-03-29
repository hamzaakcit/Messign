/**
 * Canonical VA2 email Design Manifest JSON skeleton — shared by Content Strategist prompt and `emailGenerator`.
 * Client assembly expects `version`, `theme`, `subject`, `preheader`, `sections`, `metadata`.
 *
 * **layoutDensity** (optional): `airy` | `normal` | `compact` — typography and vertical rhythm in the assembler.
 * Distinct from `metadata.visual_density` (`minimal` | `rich`), which gates auto-inserted image sections.
 *
 * **Hero:** optional `content.heroLayout`: `"standard"` (default) | `"editorial_tall"` | `"split"` — split = two-column copy + image (`heroBuilder`).
 */
export const VA2_EMAIL_MANIFEST_SCHEMA_JSON_MIN = `{
  "version": "2.0",
  "theme": "<executive|startup|luxury|minimal|bold|nature|tech|warm>",
  "subject": "<40-60 chars, benefit-driven>",
  "preheader": "<secondary hook; complements subject — new info, not a repeat or truncation>",
  "layoutDensity": "<airy|normal|compact — optional; omit for default>",
  "sections": [
    {
      "type": "<section_type>",
      "order": 1,
      "content": { },
      "variant": "<optional: card|band|flush>"
    }
  ],
  "metadata": {
    "channel": "email",
    "tone": "<voice tone>",
    "audience": "<target audience>",
    "subject_variants": ["<alternate subject line 1>", "<alternate subject line 2>"],
    "visual_density": "minimal|rich",
    "target_image_slots": 6,
    "visual_slots_auto_enriched": false
  },
  "artDirection": {
    "mood": "<overall visual mood>",
    "imageStyle": "<hero / global image style hint>"
  }
}`;

/** Reads the machine-checked tables of the onboarding documents (docs/onboarding/*.md). */
/** The rows of the table between `<!-- name:start -->` and `<!-- name:end -->`, as cells with the backticks removed. */
export function tableBetween(doc: string, name: string): string[][] {
  const m = new RegExp(`<!-- ${name}:start -->([\\s\\S]*?)<!-- ${name}:end -->`).exec(doc);
  if (!m) throw new Error(`markers for ${name} not found`);
  return m[1]!.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'))
    .map((l) => l.slice(1, -1).split('|').map((c) => c.trim()))
    .filter((cells) => !cells.every((c) => /^-+$/.test(c)))
    .slice(1) // the header
    .map((cells) => cells.map((c) => c.replace(/^`|`$/g, '')));
}

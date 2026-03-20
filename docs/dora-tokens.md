# Dora / chat semantic tokens (dark mode)

Use these roles instead of ad hoc Tailwind grays on `dora-glass` and chat bubbles so small text meets WCAG AA (~4.5:1) on `#0f172a`-like surfaces.

| Role | CSS variable | Utility | Use for |
|------|----------------|---------|---------|
| Primary body | `--dora-text-1` | inline / `text` | Headings, primary copy in widgets |
| Secondary | `--dora-text-2`, `--dora-chat-text-secondary` | `.dora-chat-text-secondary` | Supporting sentences, button labels (idle) |
| Tertiary / meta | `--dora-text-3`, `--dora-chat-text-tertiary` | `.dora-chat-text-tertiary` | Timestamps, hints, table headers, sources |
| Focus ring | `--dora-primary` | `.dora-focus-ring` | All interactive controls in Dora chat/widgets |

**Files:** [`client/src/styles/dora-tokens.css`](../client/src/styles/dora-tokens.css), chat under `client/src/components/knowledge-hub/ai/`, widgets under `client/src/components/dora/widgets/`.

**Interactive (non-text) contrast:** Prefer visible `focus-visible` outlines (`.dora-focus-ring`) and hover states that stay above 3:1 against adjacent backgrounds (WCAG 2.2 non-text).

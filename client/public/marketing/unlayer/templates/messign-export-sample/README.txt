This folder was created from an Unlayer “Export HTML” zip (HTML + images).

The embedded Unlayer editor in this app does not support loading that HTML as an editable design
(legacy HTML import is disabled in current Unlayer embed versions).

To use this look as a starter template:
1. Open the same design in https://app.unlayer.com (or re-import if needed).
2. Save or export the design as JSON (design object), not HTML.
3. Add a file under client/src/pages/marketing/unlayerTemplates/starters/your-name.json
4. Register it in client/src/pages/marketing/unlayerTemplates/registry.ts (see “Simple message” / minimal.json).

You can delete this public/ folder if you no longer need the static HTML preview assets.

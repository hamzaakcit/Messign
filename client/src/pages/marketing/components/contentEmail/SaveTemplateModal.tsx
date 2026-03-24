import type { DesignManifest } from '../../lib/types/manifestTypes';
import { extractSectionTypes } from '../../lib/templateUtils';

export function SaveTemplateModal({
  va2Manifest,
  form,
  onFormChange,
  saving,
  onSave,
  onClose,
}: {
  va2Manifest: DesignManifest;
  form: { name: string; category: string; description: string };
  onFormChange: (updater: (prev: { name: string; category: string; description: string }) => { name: string; category: string; description: string }) => void;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-app-border bg-app-bg p-6 space-y-4 shadow-xl">
        <h3 className="text-sm font-semibold text-app-text">Save as template</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-app-muted mb-1">Template name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onFormChange((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g., Product Launch v1"
              className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs text-app-muted mb-1" htmlFor="save-template-category">Category</label>
            <select
              id="save-template-category"
              value={form.category}
              onChange={(e) => onFormChange((f) => ({ ...f, category: e.target.value }))}
              className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="custom">Custom</option>
              <option value="product_launch">Product Launch</option>
              <option value="newsletter">Newsletter</option>
              <option value="event_invite">Event Invite</option>
              <option value="sales_outreach">Sales Outreach</option>
              <option value="reengagement">Re-engagement</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-app-muted mb-1">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={(e) =>
                onFormChange((f) => ({ ...f, description: e.target.value.slice(0, 200) }))
              }
              placeholder="Brief description of the template..."
              rows={2}
              className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
            />
          </div>
          <div className="rounded-lg bg-app-surface-tertiary px-3 py-2 text-xs text-app-muted space-y-0.5">
            <div>
              Theme: <span className="text-app-text">{va2Manifest.theme}</span>
            </div>
            <div>
              Sections: <span className="text-app-text">{va2Manifest.sections.length}</span>
              {' — '}
              {extractSectionTypes(va2Manifest).join(', ')}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm bg-app-surface-tertiary text-app-text hover:bg-app-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!form.name.trim() || saving}
            onClick={onSave}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

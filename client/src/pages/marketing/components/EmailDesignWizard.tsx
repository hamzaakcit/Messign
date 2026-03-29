import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Layers, Mail, Sparkles, X } from 'lucide-react';
import { getAllThemes } from '../lib/designTokens';
import type { ThemeName } from '../lib/types/designTokenTypes';

export type EmailGoal =
  | 'product_launch'
  | 'newsletter'
  | 'flash_sale'
  | 'event_invitation'
  | 'onboarding'
  | 'case_study'
  | 'seasonal'
  | 're_engagement'
  | 'feature_update'
  | 'minimalist_cta'
  | 'real_estate_open_house'
  | 'nonprofit_giving'
  | 'food_hospitality'
  | 'music_tour';

export type ContentDensity = 'light' | 'medium' | 'rich';

/** Detect holiday / seasonal copy so we can pre-select Seasonal Campaign in the wizard. */
export function inferEmailGoalFromDraft(body: string): EmailGoal | null {
  const b = body.toLowerCase();
  if (
    /\b(mother'?s day|mothers day|father'?s day|fathers day|valentine|christmas|easter|hanukkah|thanksgiving|black friday|cyber monday|holiday|seasonal)\b/.test(
      b,
    )
  ) {
    return 'seasonal';
  }
  return null;
}

export interface WizardResult {
  mode: 'template' | 'ai';
  goal: EmailGoal;
  theme: ThemeName;
  density: ContentDensity;
  generateAbVariant: boolean;
}

const GOALS: { id: EmailGoal; label: string; description: string; icon: string }[] = [
  { id: 'product_launch', label: 'Product Launch', description: 'Announce a new product or service', icon: '🚀' },
  { id: 'newsletter', label: 'Newsletter', description: 'Recurring digest or update', icon: '📰' },
  { id: 'flash_sale', label: 'Flash Sale', description: 'Time-limited promotion with products', icon: '⚡' },
  { id: 'event_invitation', label: 'Event Invite', description: 'Webinar, conference, or meetup', icon: '🎟️' },
  { id: 'onboarding', label: 'Onboarding', description: 'Welcome new customers', icon: '👋' },
  { id: 'case_study', label: 'Case Study', description: 'Share success stories and testimonials', icon: '📊' },
  { id: 'seasonal', label: 'Seasonal Campaign', description: 'Holiday or seasonal promotion', icon: '🌿' },
  { id: 're_engagement', label: 'Re-engagement', description: 'Win back inactive subscribers', icon: '🔄' },
  { id: 'feature_update', label: 'Feature Update', description: 'Announce new features or improvements', icon: '✨' },
  { id: 'minimalist_cta', label: 'Minimalist CTA', description: 'Single focused action', icon: '🎯' },
  { id: 'real_estate_open_house', label: 'Real estate', description: 'Open house or listing showcase', icon: '🏠' },
  { id: 'nonprofit_giving', label: 'Nonprofit', description: 'Impact, match, or donation drive', icon: '💜' },
  { id: 'food_hospitality', label: 'Food & dining', description: 'Chef’s table, tasting, reservation', icon: '🍽️' },
  { id: 'music_tour', label: 'Music & events', description: 'Tour dates, presale, entertainment', icon: '🎸' },
];

const DENSITIES: { id: ContentDensity; label: string; description: string; sectionHint: string }[] = [
  { id: 'light', label: 'Light', description: 'Hero + CTA — clean and focused', sectionHint: '2-3 sections' },
  { id: 'medium', label: 'Medium', description: 'Hero + content blocks + CTA', sectionHint: '4-5 sections' },
  { id: 'rich', label: 'Rich', description: 'Full layout with grids and social proof', sectionHint: '6+ sections' },
];

interface Props {
  onComplete: (result: WizardResult) => void;
  onCancel: () => void;
  hasAiDraft?: boolean;
  /** When set (e.g. seasonal copy from draft), pre-selects goal on step 1. */
  suggestedGoal?: EmailGoal | null;
}

export function EmailDesignWizard({ onComplete, onCancel, hasAiDraft, suggestedGoal }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [goal, setGoal] = useState<EmailGoal | null>(null);

  useEffect(() => {
    if (suggestedGoal) setGoal(suggestedGoal);
  }, [suggestedGoal]);
  const [theme, setTheme] = useState<ThemeName | null>(null);
  const [density, setDensity] = useState<ContentDensity>('medium');
  const [generateAbVariant, setGenerateAbVariant] = useState(false);

  const themes = getAllThemes();

  const handleFinish = (mode: 'template' | 'ai') => {
    if (!goal || !theme) return;
    onComplete({ mode, goal, theme, density, generateAbVariant });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary-400" />
          <h3 className="text-base font-semibold text-app-text">Design your email</h3>
        </div>
        <button
          type="button"
          onClick={onCancel}
          title="Close wizard"
          className="rounded-lg p-1.5 text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs text-app-muted">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                s === step
                  ? 'bg-primary-500 text-app-text'
                  : s < step
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'bg-app-surface-tertiary text-app-muted'
              }`}
            >
              {s}
            </div>
            <span className={s === step ? 'text-app-text font-medium' : ''}>
              {s === 1 ? 'Goal' : s === 2 ? 'Theme' : 'Density'}
            </span>
            {s < 3 && <ArrowRight className="h-3 w-3 text-app-muted/50" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-app-muted">What kind of email are you creating?</p>
          {suggestedGoal === 'seasonal' && (
            <p className="text-[11px] text-emerald-400/90 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
              Your draft looks seasonal — <strong>Seasonal Campaign</strong> is pre-selected. Change it if you prefer a different layout.
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {GOALS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGoal(g.id)}
                className={`text-left rounded-xl border p-3 transition-all ${
                  goal === g.id
                    ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500/30'
                    : 'border-app-border bg-app-surface-tertiary hover:bg-app-hover'
                }`}
              >
                <div className="text-lg mb-1">{g.icon}</div>
                <p className="text-sm font-medium text-app-text leading-tight">{g.label}</p>
                <p className="text-[10px] text-app-muted mt-0.5 leading-snug">{g.description}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={!goal}
              onClick={() => setStep(2)}
              className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-app-text transition-opacity disabled:opacity-40 hover:bg-primary-600"
            >
              Next <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-app-muted">Choose a visual theme</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {themes.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => setTheme(t.name)}
                className={`text-left rounded-xl border p-3 transition-all ${
                  theme === t.name
                    ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500/30'
                    : 'border-app-border bg-app-surface-tertiary hover:bg-app-hover'
                }`}
              >
                <div className="flex gap-1.5 mb-2">
                  <div className="h-4 w-4 rounded-full border border-app-border-strong" style={{ background: t.colors.primary }} />
                  <div className="h-4 w-4 rounded-full border border-app-border-strong" style={{ background: t.colors.accent }} />
                  <div className="h-4 w-4 rounded-full border border-app-border-strong" style={{ background: t.colors.background }} />
                </div>
                <p className="text-sm font-medium text-app-text">{t.label}</p>
                <p className="text-[10px] text-app-muted mt-0.5 leading-snug">{t.description}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 rounded-lg border border-app-border px-4 py-2 text-sm font-medium text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button
              type="button"
              disabled={!theme}
              onClick={() => setStep(3)}
              className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-app-text transition-opacity disabled:opacity-40 hover:bg-primary-600"
            >
              Next <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-app-muted">How much content?</p>
          <div className="grid grid-cols-3 gap-3">
            {DENSITIES.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDensity(d.id)}
                className={`text-left rounded-xl border p-4 transition-all ${
                  density === d.id
                    ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500/30'
                    : 'border-app-border bg-app-surface-tertiary hover:bg-app-hover'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Layers className="h-4 w-4 text-app-muted" />
                  <span className="text-xs text-app-muted">{d.sectionHint}</span>
                </div>
                <p className="text-sm font-medium text-app-text">{d.label}</p>
                <p className="text-[11px] text-app-muted mt-0.5">{d.description}</p>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-app-border bg-app-surface-tertiary p-3 cursor-pointer hover:bg-app-hover transition-colors">
            <input
              type="checkbox"
              checked={generateAbVariant}
              onChange={(e) => setGenerateAbVariant(e.target.checked)}
              className="h-4 w-4 rounded border-app-border-strong bg-app-surface-tertiary text-primary-500 focus:ring-primary-500/40"
            />
            <div>
              <p className="text-sm font-medium text-app-text">Generate A/B variant</p>
              <p className="text-[11px] text-app-muted">Create a second version with a different theme for A/B testing</p>
            </div>
          </label>
          {hasAiDraft && (
            <p className="text-[11px] text-app-muted rounded-lg border border-app-border bg-app-surface-tertiary px-3 py-2 leading-relaxed">
              <span className="font-medium text-app-text">Apply AI draft</span> builds the layout from your text (best when you want the copy to drive structure).{' '}
              <span className="font-medium text-app-text">Use template</span> loads a professional starter and merges your subject/body into it (fixes mismatched themes like Mother’s Day vs generic “product launch”).
            </p>
          )}
          <div className="flex justify-between pt-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex items-center gap-1.5 rounded-lg border border-app-border px-4 py-2 text-sm font-medium text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div className="flex flex-wrap gap-2 justify-end">
              {hasAiDraft && (
                <button
                  type="button"
                  onClick={() => handleFinish('ai')}
                  className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-app-text hover:bg-primary-600 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Apply AI draft
                </button>
              )}
              <button
                type="button"
                onClick={() => handleFinish('template')}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  hasAiDraft
                    ? 'border border-app-border bg-app-surface-tertiary text-app-text hover:bg-app-hover'
                    : 'bg-primary-500 text-app-text hover:bg-primary-600'
                }`}
              >
                Use template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

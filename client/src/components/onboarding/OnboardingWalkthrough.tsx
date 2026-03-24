import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const STORAGE_KEY = 'onboarding_completed';

const STEPS = [
  { id: 'welcome', title: 'Welcome to Messign', body: 'Your gamified digital workspace. Let\'s take a quick tour of the key features.', selector: null },
  { id: 'sidebar', title: 'Navigation', body: 'Use the sidebar to navigate between modules: Finance, CRM, Support, Time, and more.', selector: '[data-testid="onboarding-sidebar"]' },
  { id: 'cmdk', title: 'Quick Search', body: 'Press ⌘K (or Ctrl+K) to search pages, create expenses, or ask Dora anything.', selector: '[data-testid="onboarding-cmdk"]' },
  { id: 'dora', title: 'Dora AI', body: 'Dora is your AI assistant. Click here to chat, get insights, and automate tasks.', selector: '[data-testid="onboarding-dora-nav"]' },
  { id: 'insight', title: 'Insight Bar', body: 'Contextual insights appear here on each page. Dora surfaces what matters most.', selector: '[data-testid="onboarding-insight-bar"]' },
  { id: 'notifications', title: 'Notifications', body: 'Stay on top of approvals, mentions, and updates.', selector: '[data-testid="onboarding-notifications"]' },
  { id: 'timer', title: 'Time Tracking', body: 'Start the floating timer to log time. It appears on every page.', selector: '[data-testid="timer-start"]' },
  { id: 'done', title: "You're all set!", body: 'Explore the workspace. You can always access Dora from the sidebar or with ⌘K.', selector: null },
];

export function OnboardingWalkthrough() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const completed = localStorage.getItem(STORAGE_KEY);
      if (!completed) setVisible(true);
    } catch {
      setVisible(false);
    }
  }, []);

  const complete = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, []);

  const handleNext = useCallback(() => {
    if (step >= STEPS.length - 1) {
      complete();
    } else {
      setStep((s) => s + 1);
    }
  }, [step, complete]);

  const handleBack = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  const handleSkip = useCallback(() => {
    complete();
  }, [complete]);

  if (!visible) return null;

  const current = STEPS[step];
  const targetEl = current.selector ? document.querySelector(current.selector) : null;

  const overlay = (
    <div
      className="fixed inset-0 z-[9998] pointer-events-none"
      aria-hidden={!visible}
    >
      {/* Dim overlay */}
      <div
        className="absolute inset-0 bg-black/60"
        style={{ pointerEvents: 'none' }}
      />

      {/* Spotlight cutout around target */}
      {targetEl && (() => {
        const box = getBoundingBox(targetEl);
        return (
          <div
            className="absolute border-2 border-primary-500 rounded-lg"
            style={{
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
              pointerEvents: 'none',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
            }}
          />
        );
      })()}

      {/* Tooltip - fixed at bottom for consistency */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-24 w-[90%] max-w-md px-4 py-4 rounded-xl bg-app-card border border-app-border shadow-xl pointer-events-auto">
        <h3 className="text-lg font-semibold text-app mb-2">{current.title}</h3>
        <p className="text-sm text-app-muted mb-4">{current.body}</p>

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                className={`w-2 h-2 rounded-full transition-colors ${i === step ? 'bg-primary-500' : 'bg-app-muted/50'}`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSkip}
              className="text-sm text-app-muted hover:text-app"
            >
              Skip
            </button>
            {step > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="px-3 py-1.5 text-sm rounded-lg bg-app-surface-tertiary text-app-muted hover:text-app"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="px-4 py-1.5 text-sm font-medium rounded-lg bg-primary-500 text-app-text hover:bg-primary-600"
            >
              {step >= STEPS.length - 1 ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

function getBoundingBox(el: Element): { top: number; left: number; width: number; height: number; bottom: number } {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    bottom: rect.bottom,
  };
}

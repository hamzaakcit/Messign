export type InstagramJourneyPhase = 'writing' | 'image' | 'review' | 'ready';

const PHASES: Array<{ id: InstagramJourneyPhase; label: string }> = [
  { id: 'writing', label: 'Writing' },
  { id: 'image', label: 'Image' },
  { id: 'review', label: 'Review' },
  { id: 'ready', label: 'Ready' },
];

/**
 * Where an Instagram draft sits in the create flow.
 * A row with no caption is still being written. A caption without an image is in image generation.
 */
export function instagramJourneyPhase(input: {
  body?: string | null;
  imageUrl?: string | null;
  status?: string | null;
}): InstagramJourneyPhase {
  const status = (input.status ?? '').toLowerCase();
  if (status === 'in_review' || status === 'approved' || status === 'ready' || status === 'published' || status === 'scheduled') {
    return 'ready';
  }
  const hasBody = Boolean(input.body?.trim());
  const hasImage = Boolean(input.imageUrl?.trim());
  if (hasBody && hasImage) return 'review';
  if (hasBody) return 'image';
  return 'writing';
}

function phaseIndex(phase: InstagramJourneyPhase): number {
  return PHASES.findIndex((p) => p.id === phase);
}

export function InstagramJourneyStrip({ phase }: { phase: InstagramJourneyPhase }): JSX.Element {
  const current = phaseIndex(phase);
  const hint =
    phase === 'writing'
      ? 'No caption yet. Open the offer and press Write caption.'
      : phase === 'image'
        ? 'Caption is in. The image is generating.'
        : phase === 'review'
          ? 'Read the caption and the image, then mark it ready.'
          : 'This draft is in review, approved, or scheduled.';

  return (
    <div className="rounded-xl border border-white/[0.08] bg-slate-950/50 px-3 py-2.5" data-testid="instagram-journey">
      <ol className="flex flex-wrap gap-1.5">
        {PHASES.map((step, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'upcoming';
          return (
            <li
              key={step.id}
              className={
                state === 'current'
                  ? 'rounded-full border border-pink-400/50 bg-pink-500/15 px-2.5 py-0.5 text-[11px] font-medium text-pink-100'
                  : state === 'done'
                    ? 'rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-200'
                    : 'rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[11px] text-app-muted'
              }
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {step.label}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-app-muted">{hint}</p>
    </div>
  );
}

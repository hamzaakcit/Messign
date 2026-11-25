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
        ? 'Caption is in. The still is next: use Regenerate image below.'
        : phase === 'review'
          ? 'Read the caption and the still, then press Looks good on the offer.'
          : 'This draft is in review, approved, or scheduled.';

  return (
    <div className="rounded-xl border border-[#e7e0d6] bg-white px-3 py-2.5" data-testid="instagram-journey">
      <ol className="flex flex-wrap gap-1.5">
        {PHASES.map((step, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'upcoming';
          return (
            <li
              key={step.id}
              className={
                state === 'current'
                  ? 'rounded-full border border-[#1c1917] bg-[#1c1917] px-2.5 py-0.5 text-[11px] font-medium text-white'
                  : state === 'done'
                    ? 'rounded-full border border-[#d6d3d1] bg-[#f4efe8] px-2.5 py-0.5 text-[11px] font-medium text-[#44403c]'
                    : 'rounded-full border border-[#e7e0d6] px-2.5 py-0.5 text-[11px] text-[#a8a29e]'
              }
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {step.label}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-[#78716c]">{hint}</p>
    </div>
  );
}

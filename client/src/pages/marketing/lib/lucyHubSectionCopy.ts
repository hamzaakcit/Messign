import { ROUTES } from '@/lib/routes';

export type LucyHubSheetId = 'pipeline' | 'calendar' | 'builder' | 'intelligence';

export interface LucyHubSheetCopy {
  title: string;
  body: string;
  ctaLabel: string;
  path: string;
}

/**
 * Copy for hub destination sheets on the Lucy bento home (opens before navigating).
 */
export function getLucyHubSheetCopy(id: LucyHubSheetId): LucyHubSheetCopy {
  switch (id) {
    case 'pipeline':
      return {
        title: 'Content pipeline',
        body:
          'Drag content through draft, review, and live. Pair with command-center columns on their own routes when you need plays and funnel context.',
        ctaLabel: 'Open pipeline',
        path: ROUTES.MARKETING_PIPELINE,
      };
    case 'calendar':
      return {
        title: 'Content calendar',
        body: 'Plan and schedule content across channels. Opens the calendar view with your existing filters and brands.',
        ctaLabel: 'Open calendar',
        path: ROUTES.MARKETING_CALENDAR,
      };
    case 'builder':
      return {
        title: 'Email and builder',
        body: 'Visual Architect, Unlayer email studio, and asset flows. Continue in the builder without leaving the marketing hub.',
        ctaLabel: 'Open builder',
        path: ROUTES.MARKETING_BUILDER,
      };
    case 'intelligence':
      return {
        title: 'Competitor intelligence',
        body: 'Signals, competitor moves, and market context to inform campaigns. Opens the intelligence dashboard.',
        ctaLabel: 'Open intelligence',
        path: ROUTES.MARKETING_INTELLIGENCE,
      };
  }
}

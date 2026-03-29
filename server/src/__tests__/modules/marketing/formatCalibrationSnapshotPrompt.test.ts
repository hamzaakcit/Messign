import { describe, it, expect } from 'vitest';
import { formatCalibrationSnapshotPrompt } from '../../../modules/marketing/prompts/formatCalibrationSnapshotPrompt.js';
import type { CalibrationSnapshotRow } from '../../../dal/marketing/calibrationSnapshots.js';

describe('formatCalibrationSnapshotPrompt', () => {
  it('wraps snapshot data in performance_calibration tags and sections', () => {
    const row: CalibrationSnapshotRow = {
      id: 'snap-1',
      organization_id: 'org-1',
      snapshot_date: new Date('2026-01-15T12:00:00Z'),
      emails_sent: 200,
      avg_open_rate: 0.243,
      avg_click_rate: 0.031,
      avg_bounce_rate: 0.01,
      avg_complaint_rate: 0.001,
      top_subjects: [
        {
          subject: 'Test subject',
          preheader: 'Pre',
          open_rate: 0.4,
          click_rate: 0.05,
          content_id: 'c1',
        },
      ],
      top_ctas: [{ buttonText: 'Get started', click_rate: 0.06, content_id: 'c1' }],
      top_sections: [],
      top_hooks: [
        {
          hook_type: 'curiosity_gap',
          headline: 'What if you could ship twice as fast?',
          open_rate: 0.38,
          content_id: 'c1',
        },
      ],
      bottom_subjects: [
        {
          subject: 'Bad subject',
          preheader: '',
          open_rate: 0.1,
          click_rate: 0.01,
          content_id: 'c2',
        },
      ],
      bottom_ctas: [{ buttonText: 'Click', click_rate: 0.01, content_id: 'c2' }],
      detected_patterns: ['Short subjects win for this audience.'],
      window_start: new Date('2025-12-16'),
      window_end: new Date('2026-01-15'),
      created_at: new Date(),
    };

    const text = formatCalibrationSnapshotPrompt(row);
    expect(text).toContain('<performance_calibration>');
    expect(text).toContain('</performance_calibration>');
    expect(text).toContain('200 emails sent');
    expect(text).toContain('24.3%');
    expect(text).toContain('Test subject');
    expect(text).toContain('Get started');
    expect(text).toContain('curiosity_gap');
    expect(text).toContain('Short subjects win');
    expect(text).toContain('How to Use This Data');
  });
});

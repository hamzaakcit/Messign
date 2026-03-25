import { describe, it, expect } from 'vitest';
import { getCurrentWeekRange, isDateInRange } from '@/pages/recruitment/interviewMetrics';

describe('interviewMetrics', () => {
  it('isDateInRange returns true for ISO string inside week', () => {
    const range = getCurrentWeekRange(new Date('2025-03-25T12:00:00'));
    const monday = new Date(range.start);
    monday.setHours(14, 30, 0, 0);
    expect(isDateInRange(monday.toISOString(), range)).toBe(true);
  });

  it('isDateInRange returns false for empty', () => {
    const range = getCurrentWeekRange();
    expect(isDateInRange(undefined, range)).toBe(false);
  });
});

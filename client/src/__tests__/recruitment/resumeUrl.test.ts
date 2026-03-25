import { describe, it, expect } from 'vitest';
import { publicResumeUrl } from '@/pages/recruitment/resumeUrl';

describe('publicResumeUrl', () => {
  it('returns null for empty input', () => {
    expect(publicResumeUrl(null)).toBeNull();
    expect(publicResumeUrl(undefined)).toBeNull();
    expect(publicResumeUrl('')).toBeNull();
  });

  it('passes through absolute http(s) URLs', () => {
    expect(publicResumeUrl('https://example.com/cv.pdf')).toBe('https://example.com/cv.pdf');
  });

  it('prefixes relative paths', () => {
    const u = publicResumeUrl('/uploads/recruitment/resumes/x.pdf');
    expect(u).toContain('/uploads/recruitment/resumes/x.pdf');
  });
});

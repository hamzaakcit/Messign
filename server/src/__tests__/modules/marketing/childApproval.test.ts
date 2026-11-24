import { describe, expect, it } from 'vitest';
import {
  offerChildState,
  statusesAfterApproving,
} from '../../../services/marketing/childApproval.js';

describe('partial child approval', () => {
  it('approving the email leaves Instagram in draft', () => {
    const after = statusesAfterApproving(
      [
        { id: 'email-1', channel: 'email', status: 'in_review' },
        { id: 'ig-1', channel: 'instagram', status: 'draft' },
      ],
      'email-1',
    );
    expect(after.find((child) => child.id === 'email-1')?.status).toBe('approved');
    expect(after.find((child) => child.id === 'ig-1')?.status).toBe('draft');
    expect(offerChildState('draft')).toBe('draft');
    expect(offerChildState(undefined)).toBe('missing');
  });
});

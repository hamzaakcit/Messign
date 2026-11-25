import { describe, expect, it } from 'vitest';
import { approvalRoleBlock } from '../../../services/marketing/approvalRole.js';

describe('approvalRoleBlock', () => {
  it('lets a manager or admin approve', () => {
    expect(approvalRoleBlock('approved', 'in_review', 'manager')).toBeNull();
    expect(approvalRoleBlock('approved', 'in_review', 'admin')).toBeNull();
  });

  it('refuses an employee or an unknown role', () => {
    expect(approvalRoleBlock('approved', 'in_review', 'employee')).toBe('Only a manager or admin can approve content.');
    expect(approvalRoleBlock('approved', null, undefined)).toBe('Only a manager or admin can approve content.');
  });

  it('does not block other changes or an already approved row', () => {
    expect(approvalRoleBlock('in_review', 'draft', 'employee')).toBeNull();
    expect(approvalRoleBlock('draft', 'in_review', 'employee')).toBeNull();
    expect(approvalRoleBlock('approved', 'approved', 'employee')).toBeNull();
  });
});

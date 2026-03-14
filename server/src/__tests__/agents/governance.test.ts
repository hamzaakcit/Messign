/**
 * Action risk classification tests.
 */
import { describe, it, expect } from 'vitest';
import { classifyActionRisk } from '../../services/ai/agents/governance.js';

describe('classifyActionRisk', () => {
  it('crm:search_deals → read', () => {
    expect(classifyActionRisk('crm:search_deals', {})).toBe('read');
  });

  it('finance:create_expense with amount 500 → write', () => {
    expect(classifyActionRisk('finance:create_expense', { amount: 500 })).toBe('write');
  });

  it('finance:approve_expense → irreversible', () => {
    expect(classifyActionRisk('finance:approve_expense', { amount: 5000 })).toBe('irreversible');
  });

  it('crm:delete_deal → irreversible', () => {
    expect(classifyActionRisk('crm:delete_deal', {})).toBe('irreversible');
  });

  it('finance:create_budget with allocated_amount 1500 → irreversible', () => {
    expect(classifyActionRisk('finance:create_budget', { allocated_amount: 1500 })).toBe('irreversible');
  });

  it('write tool with amount over threshold → irreversible', () => {
    expect(classifyActionRisk('finance:create_expense', { amount: 1500 })).toBe('irreversible');
  });

  it('unknown tool → read (safer default)', () => {
    expect(classifyActionRisk('unknown:unknown_tool', {})).toBe('read');
  });

  it('projects:create_task → irreversible (always HITL)', () => {
    expect(classifyActionRisk('projects:create_task', { title: 'Test' })).toBe('irreversible');
  });
});

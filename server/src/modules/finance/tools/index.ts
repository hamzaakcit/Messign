/**
 * Finance Module — Tool registrations
 * Finance tools are registered globally via services/ai/tools/finance.
 * This module returns empty array; tools are loaded at app bootstrap.
 */
import type { ToolRegistration } from '../../types.js';

export const financeTools: ToolRegistration[] = [];

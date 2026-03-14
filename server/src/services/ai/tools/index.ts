/**
 * Messign AI Brain — Tool Auto-Registration (COMPLETE)
 *
 * All 20 tools. Import this file once to register everything.
 */

// Phase 1: Foundation (4 tools)
import './searchKnowledgeBase.js';
import './knowledgeBaseStats.js';
import './employeePerformance.js';
import './projectStatus.js';

// Phase 2: Tasks & Projects (3 tools)
import './tasksByUser.js';
import './teamMetrics.js';
import './sprintStatus.js';

// Phase 2: Finance (3 tools)
import './financialSummary.js';
import './reimbursementStatus.js';
import './invoiceDetails.js';

// Phase 2: Achievements & Social (3 tools)
import './achievementsBadges.js';
import './bountyBoard.js';
import './showcaseItems.js';

// Phase 2: People & Communication (3 tools)
import './activityFeed.js';
import './userProfile.js';
import './channelMessages.js';

// Phase 2: Analytics & Cross-Domain (6 tools)
import './approvalQueue.js';
import './systemStats.js';
import './meetingDecisions.js';
import './departmentReport.js';
import './availableQuestions.js';

// Phase 3: Budget Management (1 tool)
import './budgetTools.js';

// Phase 5.5: Easter Egg (1 tool)
import './doraDash.js';

// Finance v1.2: 14 finance tools (9 read + 5 write)
import './finance/index.js';

// Sales CRM: tools registered via modules/crm (registry)

// Customer Support: tools registered via modules/support (registry)

// Time Tracking: tools registered via modules/time (registry)

// Marketing: tools registered via modules/marketing (registry)

// Recruitment: tools registered via modules/hr (registry)
// Assets, Contracts: tools registered via modules (registry)
// Executive: tools registered via modules/executive (registry)

// Dora Heart: tools registered via modules/heart (registry)

// Core: search_tools + activate_tool (always loaded, enables tool discovery)
import './core/activateTool.js';
import './core/searchTools.js';

export {
  getAllTools,
  getToolsForLLM,
  getBaseToolsForLLM,
  executeTool,
  getToolCount,
  finalizeRegistry,
} from '../toolRegistry.js';
export { searchTools, rebuildSearchIndex } from './core/searchTools.js';
export { createToolSession, activateTool, type ToolSession } from './core/activateTool.js';

import { finalizeRegistry } from '../toolRegistry.js';
void finalizeRegistry();

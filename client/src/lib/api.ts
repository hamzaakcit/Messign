/**
 * Public API barrel: re-exports HTTP core (`apiCore`) and domain clients. Import from `@/lib/api` as before.
 * Core fetch logic lives in `apiCore.ts` so domain modules never import this file (avoids circular TDZ in Rollup).
 */
export {
  API_ORIGIN,
  API_BASE,
  assertNotHtmlApiResponse,
  setOnUnauthorized,
  isAuthError,
  authHeaders,
  fetchWithUserId,
  fetchAPI,
  fetchAdminAPI,
} from './apiCore';

export { reportsAPI, type ReportRequest, type ReportResult } from './reportsApi';
export { heartAPI } from './cultureApi';
export { notificationsAPI, type AppNotification, type NotificationPreference } from './notificationsApi';
export { authAPI } from './authApi';
export { departmentsAPI, usersAPI } from './orgApi';
export { channelsAPI, messagesAPI, chatAPI } from './messagingApi';
export { projectsAPI, tasksAPI, bountiesAPI, sprintsAPI, showcaseAPI, type RecruitmentSlot, type OpportunityType, type RewardCurrency, type MarketplaceProject, type UserApplication, type ProjectApplicationWithUser } from './projectsApi';
export { documentsAPI } from './documentsApi';
export { adminAPI } from './adminApi';
export { performanceAPI, dashboardAPI, executiveAPI, doraBriefingAPI, doraAiStatsAPI } from './executiveApi';
export type { ExecutiveDashboard, PendingItems, ExecutiveChartData, BriefingItem, BriefingSection, DailyBriefing, DoraUserStats } from './executiveApi';
export { reimbursementAPI, categoriesAPI, reimbursementSettingsAPI, budgetsAPI, exchangeRatesAPI, mileageAPI, approvalsAPI, invoicesAPI, bankDetailsAPI, signaturesAPI } from './reimbursementApi';
export type { Budget } from './reimbursementApi';
export { badgesAPI, activitiesAPI, leaderboardAPI } from './gamificationApi';
export { knowledgeAPI, adminKnowledgeAPI } from './knowledgeApi';
export { financeAPI } from './financeApi';
export { crmAPI } from './crmApi';
export { supportApi } from './supportApi';
export { marketingAPI } from './marketingApi';
export { recruitmentAPI } from './recruitmentApi';

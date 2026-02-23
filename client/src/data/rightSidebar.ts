/** Mock data for page-specific right sidebars */

export const pinnedMessages = [
  { id: 'pin-1', snippet: 'Q1 goals are now live in the wiki...', timestamp: '2h ago', authorId: 'user-2' },
  { id: 'pin-2', snippet: 'Reminder: All PRs need two approvals', timestamp: '1d ago', authorId: 'user-1' },
  { id: 'pin-3', snippet: 'Staging deploy completed successfully', timestamp: '2d ago', authorId: 'user-7' },
];

export const channelThreads = [
  { id: 't1', preview: 'Discussion on API design', replyCount: 12, lastActivity: '30m ago' },
  { id: 't2', preview: 'Bug in login flow', replyCount: 5, lastActivity: '1h ago' },
];

export const filesShared = [
  { id: 'f1', name: 'design-mockups-v2.pdf', type: 'pdf', thumb: null },
  { id: 'f2', name: 'sprint-planning.xlsx', type: 'xlsx', thumb: null },
  { id: 'f3', name: 'api-spec.yaml', type: 'yaml', thumb: null },
];

export const projectMilestones = [
  { id: 'm1', projectId: 'project-1', title: 'Mobile beta release', due: '2026-02-15', color: 'primary' },
  { id: 'm2', projectId: 'project-2', title: 'API v3 cutover', due: '2026-02-28', color: 'accent' },
  { id: 'm3', projectId: 'project-3', title: 'Brand guidelines', due: '2026-02-12', color: 'success' },
  { id: 'm4', projectId: 'project-4', title: 'Campaign launch', due: '2026-03-01', color: 'warning' },
  { id: 'm5', projectId: 'project-5', title: 'Performance audit', due: '2026-02-10', color: 'primary' },
];

export const teamWorkload = [
  { userId: 'user-1', name: 'Alex', capacity: 85 },
  { userId: 'user-4', name: 'Emily', capacity: 70 },
  { userId: 'user-5', name: 'David', capacity: 95 },
  { userId: 'user-3', name: 'Marcus', capacity: 60 },
];

export const recentProjectUpdates = [
  { id: 'u1', message: 'Task "Push notifications" moved to In Progress', time: '15m ago' },
  { id: 'u2', message: 'Project "API v3" progress: 45% → 48%', time: '1h ago' },
  { id: 'u3', message: 'Marcus completed "Finalize color palette"', time: '2h ago' },
  { id: 'u4', message: 'New task added to Messign Mobile App', time: '3h ago' },
  { id: 'u5', message: 'Jessica completed "Define target audience"', time: '5h ago' },
];

export const popularTags = [
  { tag: 'onboarding', count: 24 },
  { tag: 'api', count: 18 },
  { tag: 'design', count: 15 },
  { tag: 'engineering', count: 12 },
  { tag: 'marketing', count: 10 },
  { tag: 'product', count: 9 },
];

export const topContributors = [
  { userId: 'user-2', articleCount: 12, xp: 420 },
  { userId: 'user-6', articleCount: 10, xp: 380 },
  { userId: 'user-5', articleCount: 8, xp: 310 },
  { userId: 'user-3', articleCount: 7, xp: 265 },
  { userId: 'user-1', articleCount: 6, xp: 240 },
];

export const recentArticles = [
  { id: 'a1', title: 'API Documentation v3', authorId: 'user-5', updated: '2h ago' },
  { id: 'a2', title: 'Design System Guidelines', authorId: 'user-3', updated: '5h ago' },
  { id: 'a3', title: 'Q1 Marketing Playbook', authorId: 'user-6', updated: '1d ago' },
  { id: 'a4', title: 'Engineering Best Practices', authorId: 'user-1', updated: '2d ago' },
  { id: 'a5', title: 'Product Roadmap 2026', authorId: 'user-2', updated: '3d ago' },
];

export const searchSuggestions = ['API authentication', 'Design tokens', 'Sprint planning', 'Onboarding checklist'];

export const myDrafts = [
  { id: 'd1', title: 'Deployment runbook (draft)' },
  { id: 'd2', title: 'Team retrospective notes' },
];

export const nearestAchievements = [
  { id: 'badge-1', name: 'Task Master', progress: 87, needed: '13 more tasks' },
  { id: 'badge-2', name: 'Communicator', progress: 72, needed: '280 more messages' },
  { id: 'badge-3', name: 'React Pro', progress: 56, needed: '8 more React tasks' },
];

export const recentUnlocks = [
  { userId: 'user-8', badgeName: 'Bug Squasher', time: '2h ago' },
  { userId: 'user-4', badgeName: 'Speed Demon', time: '5h ago' },
  { userId: 'user-1', badgeName: 'Level 24', time: '1d ago' },
];

export const myAchievementStats = { totalBadges: 6, totalPossible: 50, xpFromAchievements: 5240, completionPercent: 12, rarestBadge: 'API Architect' };

export const nextMilestones = [
  { text: '3 more tasks to unlock Project Master', action: 'tasks' },
  { text: '5 more code reviews to unlock Code Guru', action: 'reviews' },
];

export const teamStats = {
  totalMembers: 47,
  averageLevel: 28,
  mostActiveDepartment: 'Engineering',
  departmentBreakdown: [
    { name: 'Engineering', count: 15 },
    { name: 'Product', count: 8 },
    { name: 'Design', count: 6 },
    { name: 'Marketing', count: 7 },
    { name: 'Sales', count: 11 },
  ],
};

export const birthdaysThisWeek = [
  { userId: 'user-3', name: 'Marcus Williams', date: 'Feb 2' },
  { userId: 'user-10', name: 'Rachel Lee', date: 'Feb 5' },
];

export const newTeamMembers = [
  { userId: 'user-9', name: 'Chris Wilson', joinDate: 'Jan 15, 2026' },
  { userId: 'user-10', name: 'Rachel Lee', joinDate: 'Jan 8, 2026' },
];

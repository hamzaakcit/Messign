// User with gamification stats
export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  jobTitle: string;
  department: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  badges: Badge[];
  stats: UserStats;
  status: UserStatus;
  role: UserRole;
  joinedAt: string;
  /** Auth provider user ID (e.g. Supabase auth.uid); used by finance pages */
  authUserId?: string;
  /** Optional fields for employee detail panel */
  phone?: string;
  location?: string;
  timezone?: string;
  managerId?: string;
  employeeId?: string;
  skills?: string[];
}

export interface UserStats {
  tasksCompleted: number;
  messagesSent: number;
  hoursLogged: number;
  projectsContributed: number;
  documentsCreated: number;
}

export type UserStatus = 'online' | 'away' | 'busy' | 'offline' | 'deep_work';
export type UserRole =
  | 'employee'
  | 'manager'
  | 'dept_head'
  | 'finance'
  | 'finance_admin'
  | 'admin'
  | 'system_admin'
  | 'member';

// Channel/Chat
export interface Channel {
  id: string;
  name: string;
  description?: string;
  type: ChannelType;
  members: string[];
  unreadCount: number;
  lastMessage?: Message;
  createdAt: string;
  topic?: string;
  avatarUrl?: string;
  archived?: boolean;
}

export type ChannelType = 'public' | 'private' | 'dm';

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  attachments: Attachment[];
  mentions: string[];
  xpGained: number;
  timestamp: string;
  reactions?: Reaction[];
  isEdited?: boolean;
  isPinned?: boolean;
  senderName?: string;
  senderAvatar?: string;
  metadata?: MessageMetadata;
  threadId?: string | null;
  replyCount?: number;
  isDeleted?: boolean;
}

export interface MessageMetadata {
  embeddedCards?: EmbeddedCardRef[];
  actionItems?: ActionItemRef[];
  [key: string]: unknown;
}

export interface EmbeddedCardRef {
  type: 'task' | 'document';
  refId: string;
}

export interface ActionItemRef {
  text: string;
  assignee?: string;
  priority: 'low' | 'medium' | 'high';
  taskId?: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  url: string;
  size: number;
}

export interface Reaction {
  emoji: string;
  users: string[];
}

// Chat v2: Embedded Cards
export interface EmbeddedTaskCard {
  type: 'task';
  id: string;
  title: string;
  status: string;
  priority: string;
  assignees: string[];
  assigneeNames: string[];
  projectId: string;
  projectName: string;
  dueDate?: string;
  xpReward: number;
}

export interface EmbeddedDocCard {
  type: 'document';
  id: string;
  title: string;
  excerpt: string;
  authorName: string;
  updatedAt: string;
  status: string;
  category?: string;
}

export type EmbeddedCard = EmbeddedTaskCard | EmbeddedDocCard;

// Chat v2: Dora Suggestions
export interface DoraSummaryResult {
  summary: string;
  keyTopics: string[];
  participantCount: number;
  messageCount: number;
}

export interface DoraActionItem {
  text: string;
  assignee?: string;
  priority: 'low' | 'medium' | 'high';
  sourceMessageId: string;
}

export interface DoraActionItemsResult {
  actionItems: DoraActionItem[];
  confidence: number;
}

export interface DoraKBSuggestion {
  title: string;
  excerpt: string;
  documentId: string;
  relevanceScore: number;
}

export interface SmartReplyResult {
  replies: string[];
  contextSummary: string;
}

export interface DoraDecisionsResult {
  decisions: Array<{ text: string; owners?: string[] }>;
  confidence: number;
}

export type DoraTransformAction =
  | 'explain'
  | 'shorten'
  | 'expand'
  | 'professional'
  | 'friendly'
  | 'translate';

export interface DoraMessageTransformResult {
  text: string;
}

/** Channel duel: rock-paper-scissors vs server “house”. */
export type ChatRpsMove = 'rock' | 'paper' | 'scissors';

export interface ChatDuelMetadata {
  seedVersion: string;
  modeId: 'rps' | 'coin' | 'chamber' | 'rps_two_player';
}

/** Commit–reveal RPS: challenger vs another channel member (fair: move hidden until reveal). */
export interface ChatRpsTwoPlayerDuelResult {
  inviteId: string;
  challengerId: string;
  opponentId: string;
  challengerMove: ChatRpsMove;
  opponentMove: ChatRpsMove;
  winnerUserId: string | null;
  headline: string;
  taskHint: string;
  metadata?: ChatDuelMetadata;
}

export interface ChatRpsDuelResult {
  you: ChatRpsMove;
  house: ChatRpsMove;
  outcome: 'win' | 'lose' | 'draw';
  headline: string;
  taskHint: string;
  /** Present when returned by the current API; omitted in older cached payloads. */
  metadata?: ChatDuelMetadata;
}

/** Channel duel: call a coin flip. */
export interface ChatCoinDuelResult {
  call: 'heads' | 'tails';
  result: 'heads' | 'tails';
  youWin: boolean;
  headline: string;
  taskHint: string;
  metadata?: ChatDuelMetadata;
}

/**
 * Channel duel: pick chamber 1–6; one random “danger” slot (playful — foam-dart / task hero, not real harm).
 */
export interface ChatChamberDuelResult {
  yourChamber: number;
  dangerChamber: number;
  hit: boolean;
  headline: string;
  taskHint: string;
  metadata?: ChatDuelMetadata;
}

// Chat v2: Slash Commands
export interface SlashSearchResult {
  type: 'task' | 'document' | 'user';
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
}

// Chat v2: Search
export interface ChatSearchResult {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  timestamp: string;
  senderName?: string;
  channelName?: string;
}

// Chat v2: Smart Folders
export interface SmartFolder {
  id: string;
  name: string;
  type: 'project' | 'department' | 'custom';
  channelIds: string[];
  icon?: string;
  userId: string;
  createdAt: string;
}

// Chat v2: Universal Search
export interface UniversalSearchResults {
  messages: ChatSearchResult[];
  tasks: SlashSearchResult[];
  documents: SlashSearchResult[];
  users: SlashSearchResult[];
}

// Chat v2: Media
export interface ChatMediaItem {
  id?: string;
  name?: string;
  type?: string;
  url?: string;
  size?: number;
  messageId: string;
  sharedBy?: string;
  sharedAt: string;
}

// Project & Task
export interface Project {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  progress: number;
  team: string[];
  capacity: TeamCapacity;
  status: ProjectStatus;
  dueDate?: string;
  createdAt: string;
  /** Marketplace: recruitment_status from DB */
  recruitment_status?: RecruitmentStatus;
  /** Marketplace: open slots per department */
  recruitment_config?: RecruitmentSlot[];
  xp_reward?: number;
  is_featured?: boolean;
  application_count?: number;
  user_application_status?: ApplicationStatus;
}

export type ProjectType = 'product' | 'engineering' | 'design' | 'marketing';
export type ProjectStatus = 'active' | 'completed' | 'on_hold' | 'archived';

/** Recruitment status for marketplace */
export type RecruitmentStatus = 'recruiting' | 'active' | 'completed' | 'closed' | 'pending_approval';

/** Slot requirement: department, total count, filled count */
export interface RecruitmentSlot {
  dept: string;
  count: number;
  filled: number;
}

/** User's application status for a project */
export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'none';

export interface TeamCapacity {
  current: number;
  max: number;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignees: string[];
  tags: string[];
  dueDate?: string;
  xpReward: number;
  priority: TaskPriority;
  createdAt: string;
  completedAt?: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// Badges & Achievements
export interface Badge {
  id: string;
  name: string;
  icon: string;
  type: BadgeType;
  description: string;
  rarity: BadgeRarity;
  holders: string[];
  criteria?: string;
  unlockedAt?: string;
}

export type BadgeType = 'achievement' | 'skill' | 'milestone';
export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

// Knowledge Base
export interface Document {
  id: string;
  title: string;
  content: string;
  description: string;
  tags: string[];
  author: string;
  type: DocumentType;
  isPinned: boolean;
  views: number;
  createdAt: string;
  updatedAt: string;
}

export type DocumentType = 'wiki' | 'pdf' | 'doc' | 'link';

// Activity Feed
export interface Activity {
  id: string;
  userId: string;
  type: ActivityType;
  message: string;
  metadata?: Record<string, unknown>;
  xpGained?: number;
  timestamp: string;
}

export type ActivityType = 
  | 'task_completed'
  | 'badge_earned'
  | 'level_up'
  | 'message_sent'
  | 'project_joined'
  | 'document_created'
  | 'milestone_reached';

// Notification
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  link?: string;
  timestamp: string;
}

export type NotificationType = 
  | 'mention'
  | 'badge'
  | 'deadline'
  | 'level_up'
  | 'task_assigned'
  | 'message';

// Leaderboard
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  user: User;
  xp: number;
  change: number; // Position change from previous period
}

// MP Events
export interface XPEvent {
  type: string;
  amount: number;
  description: string;
}

export const XP_REWARDS: Record<string, number> = {
  message_sent: 5,
  task_completed: 50,
  project_completed: 200,
  document_created: 25,
  badge_earned: 100,
  daily_login: 10,
  help_colleague: 30,
};

// Level thresholds
export const LEVEL_THRESHOLDS: number[] = [
  0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 3800, // Levels 1-10
  4700, 5700, 6800, 8000, 9300, 10700, 12200, 13800, 15500, 17300, // Levels 11-20
  19200, 21200, 23300, 25500, 27800, 30200, 32700, 35300, 38000, 40800, // Levels 21-30
];

export function calculateLevel(xp: number): { level: number; xpToNext: number; progress: number } {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    } else {
      break;
    }
  }
  
  const currentThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] || currentThreshold + 2000;
  const xpInLevel = xp - currentThreshold;
  const xpNeeded = nextThreshold - currentThreshold;
  
  return {
    level,
    xpToNext: nextThreshold - xp,
    progress: (xpInLevel / xpNeeded) * 100,
  };
}

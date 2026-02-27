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

export type UserStatus = 'online' | 'away' | 'busy' | 'offline';
export type UserRole = 'admin' | 'manager' | 'member';

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
}

export type ChannelType = 'public' | 'private' | 'dm';

// Message with MP reward (senderName/senderAvatar from API when joined with reimbursement_users)
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
  senderName?: string;
  senderAvatar?: string;
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

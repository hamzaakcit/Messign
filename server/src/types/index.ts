// Shared types between client and server

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
  phone?: string;
  location?: string;
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

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  user: User;
  xp: number;
  change: number;
}

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
}

export type ProjectType = 'product' | 'engineering' | 'design' | 'marketing';
export type ProjectStatus = 'active' | 'completed' | 'on_hold' | 'archived';

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

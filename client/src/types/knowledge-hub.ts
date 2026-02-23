export type DocumentStatus = 'draft' | 'in_review' | 'published' | 'archived' | 'rejected';
export type DocumentType = 'guide' | 'faq' | 'specification' | 'roadmap' | 'meeting_note' | 'micro_learn' | 'announcement' | 'template' | 'sop' | 'policy';
export type KnowledgeRole = 'admin' | 'cpo' | 'editor' | 'reviewer' | 'viewer';
export type ReviewAction = 'approved' | 'rejected' | 'requested_changes';
export type NotificationType = 'review_requested' | 'document_approved' | 'document_rejected' | 'comment_added' | 'mention' | 'content_stale' | 'system';

export interface KhTag {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  created_by: string | null;
  document_count?: number;
}

export interface KhCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  parent_id: string | null;
  sort_order: number;
  document_count?: number;
  children?: KhCategory[];
}

export interface KhDocument {
  id: string;
  title: string;
  slug: string;
  content: unknown;
  plain_text: string | null;
  excerpt: string | null;
  cover_image: string | null;
  status: DocumentStatus;
  document_type: DocumentType;
  metadata: Record<string, unknown>;
  author_id: string;
  author_name?: string;
  category_id: string | null;
  category_name?: string | null;
  category_slug?: string | null;
  category_color?: string | null;
  is_public: boolean;
  is_pinned: boolean;
  is_featured: boolean;
  is_bookmarked?: boolean;
  view_count: number;
  last_viewed_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  tags: KhTag[];
}

export interface KhVersion {
  id: string;
  document_id: string;
  version_number: number;
  content: unknown;
  plain_text: string | null;
  change_note: string | null;
  created_by: string;
  author_name?: string;
  created_at: string;
}

export interface KhComment {
  id: string;
  document_id: string;
  author_id: string;
  author_name?: string;
  content: string;
  selection_from: number | null;
  selection_to: number | null;
  selected_text: string | null;
  parent_id: string | null;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
  replies?: KhComment[];
}

export interface KhReviewAction {
  id: string;
  document_id: string;
  reviewer_id: string;
  reviewer_name?: string;
  action: ReviewAction;
  comment: string | null;
  created_at: string;
}

export interface KhCollection {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  is_shared: boolean;
  document_count?: number;
  created_at: string;
  updated_at: string;
}

export interface KhNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  related_document_id: string | null;
  created_at: string;
}

export interface KhContentFlag {
  id: string;
  document_id: string;
  document_title?: string;
  document_slug?: string;
  flagged_by: string;
  flagged_by_name?: string;
  reason: string;
  description: string | null;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface KhTeam {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  member_count?: number;
}

export interface KhSearchResult {
  docs: KhDocument[];
  total: number;
  page: number;
  limit: number;
}

export interface KhAnalyticsStats {
  total_docs: number;
  published_docs: number;
  total_views: number;
  total_searches: number;
  total_users: number;
}

export interface KhContentHealth {
  status: 'fresh' | 'aging' | 'stale';
  count: number;
}

export const DOCUMENT_TYPE_META: Record<DocumentType, { label: string; color: string; icon: string }> = {
  guide: { label: 'Guide', color: '#3b82f6', icon: 'BookOpen' },
  faq: { label: 'FAQ', color: '#10b981', icon: 'HelpCircle' },
  specification: { label: 'Specification', color: '#8b5cf6', icon: 'FileCode' },
  roadmap: { label: 'Roadmap', color: '#f59e0b', icon: 'Map' },
  meeting_note: { label: 'Meeting Notes', color: '#6366f1', icon: 'MessageSquare' },
  micro_learn: { label: 'Micro Learn', color: '#ec4899', icon: 'Zap' },
  announcement: { label: 'Announcement', color: '#ef4444', icon: 'Megaphone' },
  template: { label: 'Template', color: '#64748b', icon: 'LayoutTemplate' },
  sop: { label: 'SOP', color: '#f97316', icon: 'ClipboardList' },
  policy: { label: 'Policy', color: '#14b8a6', icon: 'Shield' },
};

export const STATUS_META: Record<DocumentStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#6b7280' },
  in_review: { label: 'In Review', color: '#f59e0b' },
  published: { label: 'Published', color: '#10b981' },
  archived: { label: 'Archived', color: '#ef4444' },
  rejected: { label: 'Rejected', color: '#ef4444' },
};

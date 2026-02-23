import { create } from 'zustand';
import type { KhDocument, KhCategory, KhTag, KhNotification, KhCollection, DocumentStatus, DocumentType } from '@/types/knowledge-hub';

interface Filters {
  search: string;
  category: string;
  tag: string;
  type: DocumentType | '';
  status: DocumentStatus | '';
  sort: 'recent' | 'popular' | 'alphabetical' | 'oldest';
}

interface KnowledgeHubState {
  documents: KhDocument[];
  totalDocs: number;
  currentPage: number;
  pageSize: number;
  isLoading: boolean;

  categories: KhCategory[];
  categoriesLoaded: boolean;
  tags: KhTag[];
  tagsLoaded: boolean;

  currentDocument: KhDocument | null;
  currentDocumentLoading: boolean;

  notifications: KhNotification[];
  unreadCount: number;

  collections: KhCollection[];

  commandPaletteOpen: boolean;
  sidebarCollapsed: boolean;

  filters: Filters;

  setDocuments: (docs: KhDocument[], total: number) => void;
  setCurrentPage: (page: number) => void;
  setIsLoading: (loading: boolean) => void;

  setCategories: (categories: KhCategory[]) => void;
  setTags: (tags: KhTag[]) => void;

  setCurrentDocument: (doc: KhDocument | null) => void;
  setCurrentDocumentLoading: (loading: boolean) => void;

  setNotifications: (notifications: KhNotification[]) => void;
  markNotificationRead: (id: string) => void;

  setCollections: (collections: KhCollection[]) => void;

  setFilters: (filters: Partial<Filters>) => void;
  resetFilters: () => void;

  toggleCommandPalette: () => void;
  toggleSidebar: () => void;
}

const defaultFilters: Filters = {
  search: '',
  category: '',
  tag: '',
  type: '',
  status: '',
  sort: 'recent',
};

export const useKnowledgeHubStore = create<KnowledgeHubState>((set, get) => ({
  documents: [],
  totalDocs: 0,
  currentPage: 1,
  pageSize: 20,
  isLoading: false,

  categories: [],
  categoriesLoaded: false,
  tags: [],
  tagsLoaded: false,

  currentDocument: null,
  currentDocumentLoading: false,

  notifications: [],
  unreadCount: 0,

  collections: [],

  commandPaletteOpen: false,
  sidebarCollapsed: false,

  filters: { ...defaultFilters },

  setDocuments: (docs, total) => set({ documents: docs, totalDocs: total }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  setCategories: (categories) => set({ categories, categoriesLoaded: true }),
  setTags: (tags) => set({ tags, tagsLoaded: true }),

  setCurrentDocument: (doc) => set({ currentDocument: doc }),
  setCurrentDocumentLoading: (loading) => set({ currentDocumentLoading: loading }),

  setNotifications: (notifications) => set({
    notifications,
    unreadCount: notifications.filter(n => !n.is_read).length,
  }),
  markNotificationRead: (id) => {
    const updated = get().notifications.map(n => n.id === id ? { ...n, is_read: true } : n);
    set({ notifications: updated, unreadCount: updated.filter(n => !n.is_read).length });
  },

  setCollections: (collections) => set({ collections }),

  setFilters: (partial) => set({ filters: { ...get().filters, ...partial }, currentPage: 1 }),
  resetFilters: () => set({ filters: { ...defaultFilters }, currentPage: 1 }),

  toggleCommandPalette: () => set(s => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));

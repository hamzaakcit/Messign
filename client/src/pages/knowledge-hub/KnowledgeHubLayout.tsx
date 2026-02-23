import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useKnowledgeHubStore } from '@/stores/knowledgeHubStore';
import { khCategoriesAPI, khTagsAPI } from '@/lib/knowledge-hub/api';
import { KnowledgeSidebar } from '@/components/knowledge-hub/layout/KnowledgeSidebar';
import { KnowledgeHubHomePage } from './KnowledgeHubHomePage';
import { AllDocumentsPage } from './AllDocumentsPage';
import { CategoryPage } from './CategoryPage';
import { DocumentViewPage } from './DocumentViewPage';
import { DocumentEditPage } from './DocumentEditPage';
import { DocumentVersionsPage } from './DocumentVersionsPage';
import { SearchResultsPage } from './SearchResultsPage';
import { BookmarksPage } from './BookmarksPage';
import { CollectionsPage } from './CollectionsPage';
import { AIAssistantPage } from './AIAssistantPage';

const BASE = '/knowledge-hub';

function parseRoute(pathname: string) {
  const rel = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  const clean = rel.replace(/^\/+/, '');
  const parts = clean.split('/').filter(Boolean);

  if (!parts.length) return { page: 'home' };
  if (parts[0] === 'search') return { page: 'search' };
  if (parts[0] === 'bookmarks') return { page: 'bookmarks' };
  if (parts[0] === 'collections') return { page: 'collections' };
  if (parts[0] === 'ai-assistant') return { page: 'ai-assistant' };
  if (parts[0] === 'categories' && parts[1]) return { page: 'category', categoryId: parts[1] };
  if (parts[0] === 'documents') {
    if (parts.length === 1) return { page: 'all-documents' };
    if (parts[1] === 'new') return { page: 'document-edit', docId: undefined };
    if (parts[2] === 'edit') return { page: 'document-edit', docId: parts[1] };
    if (parts[2] === 'versions') return { page: 'document-versions', docId: parts[1] };
    return { page: 'document-view', docId: parts[1] };
  }
  return { page: 'home' };
}

export function KnowledgeHubLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { categoriesLoaded, tagsLoaded, setCategories, setTags, sidebarCollapsed, toggleSidebar } = useKnowledgeHubStore();

  useEffect(() => {
    if (!categoriesLoaded) {
      khCategoriesAPI.list(true).then(setCategories).catch(console.error);
    }
    if (!tagsLoaded) {
      khTagsAPI.list().then(setTags).catch(console.error);
    }
  }, [categoriesLoaded, tagsLoaded]);

  const route = useMemo(() => parseRoute(location.pathname), [location.pathname]);

  const renderPage = () => {
    switch (route.page) {
      case 'home': return <KnowledgeHubHomePage />;
      case 'all-documents': return <AllDocumentsPage />;
      case 'search': return <SearchResultsPage />;
      case 'category': return <CategoryPage categoryId={route.categoryId!} />;
      case 'document-view': return <DocumentViewPage docId={route.docId!} />;
      case 'document-edit': return <DocumentEditPage docId={route.docId} />;
      case 'document-versions': return <DocumentVersionsPage docId={route.docId!} />;
      case 'bookmarks': return <BookmarksPage />;
      case 'collections': return <CollectionsPage />;
      case 'ai-assistant': return <AIAssistantPage />;
      default: return <KnowledgeHubHomePage />;
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <KnowledgeSidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        activePath={location.pathname}
        onNavigate={(path) => navigate(path)}
      />
      <main className="flex-1 min-h-0 overflow-y-auto bg-dark-900">
        {renderPage()}
      </main>
    </div>
  );
}

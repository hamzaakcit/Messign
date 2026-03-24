import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, TrendingUp, Star, Clock, BookOpen, ArrowRight, FileText } from 'lucide-react';
import { khDocumentsAPI, khCategoriesAPI, khTagsAPI, khAnalyticsAPI } from '@/lib/knowledge-hub/api';
import type { KhDocument, KhCategory, KhTag, KhAnalyticsStats } from '@/types/knowledge-hub';
import { DOCUMENT_TYPE_META } from '@/types/knowledge-hub';
import { stripHtmlForPreview } from '@/lib/knowledge-hub/stripHtml';

function DocCard({ doc, onClick }: { doc: KhDocument; onClick: () => void }) {
  const typeMeta = DOCUMENT_TYPE_META[doc.document_type];
  return (
    <button onClick={onClick} className="text-left w-full p-4 rounded-xl bg-app-sidebar border border-app-border hover:border-primary-500/40 transition-all group">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: typeMeta?.color + '20' }}>
          <FileText className="w-5 h-5" style={{ color: typeMeta?.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-app-text group-hover:text-primary-400 truncate transition-colors">{doc.title}</h3>
          <p className="text-xs text-app-muted mt-0.5 line-clamp-2">{stripHtmlForPreview(doc.excerpt || doc.plain_text, 100) || 'No description'}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-app-muted">
            <span>{doc.author_name}</span>
            <span>{new Date(doc.updated_at).toLocaleDateString()}</span>
            {doc.view_count > 0 && <span>{doc.view_count} views</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

export function KnowledgeHubHomePage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [featured, setFeatured] = useState<KhDocument[]>([]);
  const [recent, setRecent] = useState<KhDocument[]>([]);
  const [popular, setPopular] = useState<KhDocument[]>([]);
  const [categories, setCategories] = useState<KhCategory[]>([]);
  const [tags, setTags] = useState<KhTag[]>([]);
  const [stats, setStats] = useState<KhAnalyticsStats | null>(null);

  useEffect(() => {
    khDocumentsAPI.list({ featured: 'true', limit: '4' }).then(r => setFeatured(r.docs)).catch(() => {});
    khDocumentsAPI.list({ sort: 'recent', limit: '6' }).then(r => setRecent(r.docs)).catch(() => {});
    khDocumentsAPI.list({ sort: 'popular', limit: '6' }).then(r => setPopular(r.docs)).catch(() => {});
    khCategoriesAPI.list(true).then(setCategories).catch(() => {});
    khTagsAPI.list().then(setTags).catch(() => {});
    khAnalyticsAPI.stats().then(setStats).catch(() => {});
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) navigate(`/knowledge-hub/search?q=${encodeURIComponent(searchQuery)}`);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Hero Search */}
      <div className="relative rounded-2xl bg-gradient-to-br from-primary-500/10 to-blue-600/5 border border-primary-500/20 p-8">
        <div className="max-w-xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-app-text mb-2">Knowledge Hub</h1>
          <p className="text-app-muted mb-6">Find answers, guides, and documentation all in one place</p>
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-app-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents, guides, FAQs..."
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-app-sidebar border border-app-border text-app-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 text-sm"
            />
          </form>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Documents', value: stats.total_docs, icon: FileText },
            { label: 'Published', value: stats.published_docs, icon: BookOpen },
            { label: 'Total Views', value: stats.total_views, icon: TrendingUp },
            { label: 'Active Readers', value: stats.total_users, icon: Star },
          ].map(s => (
            <div key={s.label} className="p-4 rounded-xl bg-app-sidebar border border-app-border">
              <div className="flex items-center gap-2 text-app-muted text-xs mb-1">
                <s.icon className="w-3.5 h-3.5" />
                {s.label}
              </div>
              <span className="text-xl font-bold text-app-text">{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Featured */}
      {featured.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-app-text flex items-center gap-2"><Star className="w-5 h-5 text-yellow-400" /> Featured</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {featured.map(doc => (
              <DocCard key={doc.id} doc={doc} onClick={() => navigate(`/knowledge-hub/documents/${doc.slug}`)} />
            ))}
          </div>
        </section>
      )}

      {/* Recently Updated */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-app-text flex items-center gap-2"><Clock className="w-5 h-5 text-blue-400" /> Recently Updated</h2>
          <button onClick={() => navigate('/knowledge-hub/documents')} className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {recent.map(doc => (
            <DocCard key={doc.id} doc={doc} onClick={() => navigate(`/knowledge-hub/documents/${doc.slug}`)} />
          ))}
        </div>
      </section>

      {/* Popular */}
      {popular.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-app-text flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-400" /> Most Popular</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {popular.map(doc => (
              <DocCard key={doc.id} doc={doc} onClick={() => navigate(`/knowledge-hub/documents/${doc.slug}`)} />
            ))}
          </div>
        </section>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-app-text mb-3">Browse by Category</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => navigate(`/knowledge-hub/categories/${cat.id}`)}
                className="p-4 rounded-xl bg-app-sidebar border border-app-border hover:border-primary-500/30 text-left transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  {cat.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />}
                  <span className="text-sm font-medium text-app-text">{cat.name}</span>
                </div>
                <p className="text-xs text-app-muted">{cat.document_count ?? 0} documents</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Popular Tags */}
      {tags.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-app-text mb-3">Popular Tags</h2>
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 15).map(tag => (
              <button
                key={tag.id}
                onClick={() => navigate(`/knowledge-hub/search?tag=${tag.slug}`)}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-app-card text-gray-300 hover:bg-primary-500/20 hover:text-primary-400 transition-colors"
                style={tag.color ? { borderColor: tag.color, borderWidth: 1 } : {}}
              >
                {tag.name}
                {tag.document_count != null && <span className="ml-1 text-app-muted">{tag.document_count}</span>}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

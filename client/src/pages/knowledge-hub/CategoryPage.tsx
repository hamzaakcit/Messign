import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, FolderOpen } from 'lucide-react';
import { khCategoriesAPI } from '@/lib/knowledge-hub/api';
import type { KhDocument, KhCategory } from '@/types/knowledge-hub';
import { DOCUMENT_TYPE_META } from '@/types/knowledge-hub';
import { stripHtmlForPreview } from '@/lib/knowledge-hub/stripHtml';

export function CategoryPage({ categoryId }: { categoryId: string }) {
  const navigate = useNavigate();
  const [category, setCategory] = useState<KhCategory | null>(null);
  const [docs, setDocs] = useState<KhDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      khCategoriesAPI.getById(categoryId),
      khCategoriesAPI.documents(categoryId),
    ]).then(([cat, result]) => {
      setCategory(cat);
      setDocs(result.docs);
      setTotal(result.total);
    }).catch(console.error).finally(() => setLoading(false));
  }, [categoryId]);

  if (loading) return <div className="flex items-center justify-center h-full text-app-muted">Loading...</div>;
  if (!category) return <div className="flex items-center justify-center h-full text-app-muted">Category not found</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <button onClick={() => navigate('/knowledge-hub')} className="flex items-center gap-1.5 text-sm text-app-muted hover:text-app-text mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center gap-3 mb-6">
        {category.color && <span className="w-4 h-4 rounded-full" style={{ backgroundColor: category.color }} />}
        <div>
          <h1 className="text-xl font-bold text-app-text">{category.name}</h1>
          {category.description && <p className="text-sm text-app-muted mt-0.5">{category.description}</p>}
        </div>
        <span className="ml-auto text-sm text-app-muted">{total} documents</span>
      </div>

      {/* Subcategories */}
      {category.children && category.children.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-app-muted mb-2">Subcategories</h2>
          <div className="flex flex-wrap gap-2">
            {category.children.map(sub => (
              <button key={sub.id} onClick={() => navigate(`/knowledge-hub/categories/${sub.id}`)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-app-sidebar border border-app-border hover:border-primary-500/30 text-sm text-gray-300 hover:text-app-text transition-colors">
                <FolderOpen className="w-3.5 h-3.5" />
                {sub.name}
                <span className="text-xs text-app-muted">{sub.document_count ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {docs.map(doc => {
          const typeMeta = DOCUMENT_TYPE_META[doc.document_type];
          return (
            <button key={doc.id} onClick={() => navigate(`/knowledge-hub/documents/${doc.slug}`)} className="text-left p-4 rounded-xl bg-app-sidebar border border-app-border hover:border-primary-500/40 transition-all group">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: typeMeta?.color + '20', color: typeMeta?.color }}>{typeMeta?.label}</span>
              </div>
              <h3 className="text-sm font-medium text-app-text group-hover:text-primary-400 mb-1 truncate">{doc.title}</h3>
              <p className="text-xs text-app-muted line-clamp-2">{stripHtmlForPreview(doc.excerpt || doc.plain_text, 100)}</p>
              <div className="flex items-center gap-2 text-xs text-app-muted mt-2">
                <span>{doc.author_name}</span>
                <span>·</span>
                <span>{new Date(doc.updated_at).toLocaleDateString()}</span>
              </div>
            </button>
          );
        })}
      </div>

      {docs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-app-muted">
          <FileText className="w-10 h-10 mb-2 text-gray-600" />
          <p>No documents in this category yet</p>
        </div>
      )}
    </div>
  );
}

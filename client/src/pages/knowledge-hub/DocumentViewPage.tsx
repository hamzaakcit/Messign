import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bookmark, BookmarkCheck, Edit, Clock, Eye, Tag, MessageSquare, Link2, FileText, File, Image, Video, Music, Download, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from 'sonner';
import { khDocumentsAPI, khBookmarksAPI, khCommentsAPI, khVersionsAPI } from '@/lib/knowledge-hub/api';
import type { KhDocument, KhComment, KhVersion } from '@/types/knowledge-hub';
import { DOCUMENT_TYPE_META, STATUS_META } from '@/types/knowledge-hub';
import { cn } from '@/lib/utils';
import { InlineCommentThread } from '@/components/knowledge-hub/documents/InlineCommentThread';
import { WorkflowStatusBar } from '@/components/knowledge-hub/workflow/WorkflowStatusBar';
import { useAuthStore } from '@/stores/authStore';

export function DocumentViewPage({ docId }: { docId: string }) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [doc, setDoc] = useState<KhDocument | null>(null);
  const [comments, setComments] = useState<KhComment[]>([]);
  const [versions, setVersions] = useState<KhVersion[]>([]);
  const [backlinks, setBacklinks] = useState<{ id: string; title: string; slug: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [pdfZoom, setPdfZoom] = useState<number | 'fit'>(100);

  useEffect(() => {
    setLoading(true);
    const looksLikeId = (docId.includes('-') && docId.length > 20) || docId.startsWith('doc-');
    const promise = looksLikeId ? khDocumentsAPI.getById(docId) : khDocumentsAPI.getBySlug(docId);
    promise.then(d => {
      setDoc(d);
      setBookmarked(!!d.is_bookmarked);
      khCommentsAPI.list(d.id).then(setComments).catch(() => {});
      khVersionsAPI.list(d.id).then(v => setVersions(v.slice(0, 5))).catch(() => {});
      khDocumentsAPI.backlinks(d.id).then(setBacklinks).catch(() => {});
    }).catch(() => navigate('/knowledge-hub')).finally(() => setLoading(false));
  }, [docId]);

  const toggleBookmark = async () => {
    if (!doc) return;
    try {
      const result = await khBookmarksAPI.toggle(doc.id);
      setBookmarked(result.bookmarked);
      toast.success(result.bookmarked ? 'Bookmarked' : 'Removed from bookmarks');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bookmark failed');
    }
  };

  const getAttachments = (): { url: string; fileName: string; fileType?: string }[] => {
    const meta = doc?.metadata as { attachments?: { url: string; fileName: string; fileType?: string }[] } | undefined;
    return Array.isArray(meta?.attachments) ? meta.attachments : [];
  };

  const renderContent = () => {
    if (!doc) return null;
    const content = doc.content as { type?: string; content?: unknown[] } | null;
    const attachments = getAttachments();

    if (content && typeof content === 'object' && content.type === 'doc') {
      return (
        <div className="prose prose-invert max-w-none prose-headings:text-app-text prose-p:text-app-muted prose-a:text-primary-400 prose-code:text-primary-300 prose-strong:text-app-text">
          <TipTapRenderer content={content} />
        </div>
      );
    }

    if (doc.plain_text) {
      return <div className="prose prose-invert max-w-none whitespace-pre-wrap text-app-muted">{doc.plain_text}</div>;
    }

    if (attachments.length > 0) {
      const singlePdf = attachments.length === 1 && (attachments[0].fileType || '').toLowerCase() === 'pdf';
      const pdfAttachment = singlePdf ? attachments[0] : null;

      if (pdfAttachment) {
        const href = pdfAttachment.url.startsWith('http') ? pdfAttachment.url : `${origin}${pdfAttachment.url}`;
        const pdfSrc = pdfZoom === 'fit'
          ? `${href}#view=Fit`
          : `${href}#zoom=${pdfZoom}`;
        return (
          <div className="flex flex-col flex-1 min-h-0 -mx-2 sm:-mx-4">
            <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
              <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300">
                <FileText className="w-4 h-4 shrink-0" />
                <span className="truncate">{pdfAttachment.fileName}</span>
                <Download className="w-3.5 h-3.5 shrink-0" />
              </a>
              <div className="flex items-center gap-1 rounded-lg bg-app-card p-1">
                <button
                  onClick={() => setPdfZoom(z => (z === 'fit' ? 100 : Math.max(50, (typeof z === 'number' ? z : 100) - 25)))}
                  className="p-1.5 rounded text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPdfZoom('fit')}
                  className={cn('px-2 py-1 rounded text-xs font-medium transition-colors', pdfZoom === 'fit' ? 'bg-primary-500 text-app-text' : 'text-app-muted hover:text-app-text hover:bg-app-hover')}
                  title="Fit page"
                >
                  Fit
                </button>
                <button
                  onClick={() => setPdfZoom(z => (z === 'fit' ? 125 : Math.min(200, (typeof z === 'number' ? z : 100) + 25)))}
                  className="p-1.5 rounded text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <span className="px-2 text-xs text-app-muted tabular-nums">
                  {pdfZoom === 'fit' ? 'Fit' : `${pdfZoom}%`}
                </span>
              </div>
            </div>
            <div className="flex-1 min-h-0 rounded-xl border border-app-border bg-app-sidebar overflow-hidden">
              <iframe
                src={pdfSrc}
                title={pdfAttachment.fileName}
                className="w-full h-full min-h-0 border-0"
              />
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-app-muted">Attachments</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {attachments.map((a) => {
              const href = a.url.startsWith('http') ? a.url : `${origin}${a.url}`;
              const ft = (a.fileType || '').toLowerCase();
              const isPdf = ft === 'pdf';
              const isImage = ['image', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ft);
              const isVideo = ['video', 'mp4', 'webm', 'mov', 'avi', 'ogg'].includes(ft);
              const isAudio = ['audio', 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ft);
              const Icon = isImage ? Image : isVideo ? Video : isAudio ? Music : isPdf ? FileText : File;
              return (
                <div key={a.url} className="rounded-xl border border-app-border bg-app-sidebar p-4">
                  {isImage && (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="block mb-3">
                      <img src={href} alt={a.fileName} className="w-full max-h-64 object-contain rounded-lg" />
                    </a>
                  )}
                  {isVideo && (
                    <video src={href} controls className="w-full rounded-lg mb-3" />
                  )}
                  {isAudio && (
                    <audio src={href} controls className="w-full mb-3" />
                  )}
                  {isPdf && (
                    <iframe src={href} title={a.fileName} className="w-full h-96 rounded-lg border-0 mb-3" />
                  )}
                  <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary-400 hover:text-primary-300">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{a.fileName}</span>
                    <Download className="w-3.5 h-3.5 shrink-0" />
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return <p className="text-app-muted italic">No content yet</p>;
  };

  if (loading) return <div className="flex items-center justify-center h-full text-app-muted">Loading document...</div>;
  if (!doc) return <div className="flex items-center justify-center h-full text-app-muted">Document not found</div>;

  const origin = (import.meta as { env?: { VITE_API_ORIGIN?: string } }).env?.VITE_API_ORIGIN ?? window.location.origin;
  const typeMeta = DOCUMENT_TYPE_META[doc.document_type];
  const statusMeta = STATUS_META[doc.status];
  const isAuthor = user?.id === doc.author_id;
  const attachments = getAttachments();
  const isSinglePdf = attachments.length === 1 && (attachments[0].fileType || '').toLowerCase() === 'pdf';

  return (
    <div className="flex h-full min-h-0">
      {/* Main content */}
      <div className={cn('flex-1 overflow-y-auto overflow-x-hidden p-6 flex flex-col min-h-0', isSinglePdf ? 'min-w-0' : 'max-w-4xl mx-auto')}>
        {isSinglePdf ? (
          <>
            <div className="flex items-center justify-between gap-3 mb-2 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => navigate('/knowledge-hub/documents')} className="flex items-center gap-1.5 text-sm text-app-muted hover:text-app-text shrink-0 transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <h1 className="text-lg font-bold text-app-text truncate">{doc.title}</h1>
                <span className="text-xs text-app-muted shrink-0">{doc.author_name} · {new Date(doc.updated_at).toLocaleDateString()}</span>
              </div>
              <WorkflowStatusBar doc={doc} onStatusChange={(updated) => setDoc(updated)} />
            </div>
            <div className="flex-1 min-h-0 flex flex-col">{renderContent()}</div>
          </>
        ) : (
          <>
            <button onClick={() => navigate('/knowledge-hub/documents')} className="flex items-center gap-1.5 text-sm text-app-muted hover:text-app-text mb-4 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <WorkflowStatusBar doc={doc} onStatusChange={(updated) => setDoc(updated)} />

            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: typeMeta?.color + '20', color: typeMeta?.color }}>{typeMeta?.label}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: statusMeta?.color + '20', color: statusMeta?.color }}>{statusMeta?.label}</span>
              {doc.category_name && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-app-card text-app-muted">{doc.category_name}</span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-app-text mb-2">{doc.title}</h1>

            <div className="flex items-center gap-4 text-sm text-app-muted mb-6">
              <span>By {doc.author_name}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {new Date(doc.updated_at).toLocaleDateString()}</span>
              <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {doc.view_count} views</span>
            </div>

            {doc.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-6">
                {doc.tags.map(tag => (
                  <span key={tag.id} className="text-xs px-2 py-1 rounded-full bg-app-card text-app-muted">
                    <Tag className="w-3 h-3 inline mr-1" />{tag.name}
                  </span>
                ))}
              </div>
            )}

            <div className="border-t border-app-border pt-6">{renderContent()}</div>
          </>
        )}
      </div>

      {/* Right sidebar */}
      <div className="w-72 shrink-0 relative z-10 border-l border-app-border bg-app-sidebar overflow-y-auto p-4 space-y-6 flex flex-col">
        <div className="flex flex-col gap-2">
          <button onClick={toggleBookmark} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors', bookmarked ? 'bg-yellow-500/10 text-yellow-400' : 'bg-app-card text-app-muted hover:bg-app-hover')}>
            {bookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            {bookmarked ? 'Bookmarked' : 'Bookmark'}
          </button>
          {isAuthor && (
            <button onClick={() => navigate(`/knowledge-hub/documents/${doc.id}/edit`)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-app-card text-app-muted hover:bg-app-hover transition-colors">
              <Edit className="w-4 h-4" /> Edit
            </button>
          )}
          <button onClick={() => setShowComments(!showComments)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-app-card text-app-muted hover:bg-app-hover transition-colors">
            <MessageSquare className="w-4 h-4" /> Comments ({comments.length})
          </button>
          <button onClick={() => navigate(`/knowledge-hub/documents/${doc.id}/versions`)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-app-card text-app-muted hover:bg-app-hover transition-colors">
            <Clock className="w-4 h-4" /> Versions ({versions.length})
          </button>
        </div>

        {/* Attachments (sidebar) */}
        {getAttachments().length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-app-muted uppercase tracking-wider mb-2">Attachments</h3>
            <div className="space-y-1">
              {getAttachments().map((a) => {
                const href = a.url.startsWith('http') ? a.url : `${origin}${a.url}`;
                const ft = (a.fileType || '').toLowerCase();
                const isImage = ['image', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ft);
                const isVideo = ['video', 'mp4', 'webm', 'mov', 'avi', 'ogg'].includes(ft);
                const isAudio = ['audio', 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ft);
                const isPdf = ft === 'pdf';
                const Icon = isImage ? Image : isVideo ? Video : isAudio ? Music : isPdf ? FileText : File;
                return (
                  <a key={a.url} href={href} target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-app-muted hover:text-app-text hover:bg-app-hover transition-colors">
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{a.fileName}</span>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Backlinks */}
        {backlinks.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-app-muted uppercase tracking-wider mb-2">Linked From</h3>
            <div className="space-y-1">
              {backlinks.map(bl => (
                <button key={bl.id} onClick={() => navigate(`/knowledge-hub/documents/${bl.slug}`)} className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-sm text-app-muted hover:text-app-text hover:bg-app-hover transition-colors">
                  <Link2 className="w-3.5 h-3.5" /> <span className="truncate">{bl.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Version history preview */}
        {versions.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-app-muted uppercase tracking-wider mb-2">Recent Versions</h3>
            <div className="space-y-1">
              {versions.map(v => (
                <div key={v.id} className="text-xs text-app-muted px-2 py-1">
                  <span className="text-app-muted">v{v.version_number}</span> · {v.author_name} · {new Date(v.created_at).toLocaleDateString()}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Comments panel */}
      {showComments && (
        <InlineCommentThread
          documentId={doc.id}
          comments={comments}
          onClose={() => setShowComments(false)}
          onCommentsChange={setComments}
        />
      )}
    </div>
  );
}

function TipTapRenderer({ content }: { content: unknown }) {
  if (!content || typeof content !== 'object') return null;
  const node = content as { type: string; content?: unknown[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[]; attrs?: Record<string, unknown> };

  if (node.type === 'text') {
    let text: React.ReactNode = node.text ?? '';
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === 'bold') text = <strong>{text}</strong>;
        else if (mark.type === 'italic') text = <em>{text}</em>;
        else if (mark.type === 'code') text = <code>{text}</code>;
        else if (mark.type === 'link') text = <a href={String(mark.attrs?.href ?? '#')} target="_blank" rel="noopener noreferrer">{text}</a>;
        else if (mark.type === 'strike') text = <s>{text}</s>;
      }
    }
    return <>{text}</>;
  }

  const children = (node.content ?? []).map((child, i) => <TipTapRenderer key={i} content={child} />);

  switch (node.type) {
    case 'doc': return <>{children}</>;
    case 'paragraph': return <p>{children}</p>;
    case 'heading': {
      const level = Math.min(6, Math.max(1, (node.attrs?.level as number) ?? 2));
      switch (level) {
        case 1:
          return <h1>{children}</h1>;
        case 2:
          return <h2>{children}</h2>;
        case 3:
          return <h3>{children}</h3>;
        case 4:
          return <h4>{children}</h4>;
        case 5:
          return <h5>{children}</h5>;
        default:
          return <h6>{children}</h6>;
      }
    }
    case 'bulletList': return <ul>{children}</ul>;
    case 'orderedList': return <ol>{children}</ol>;
    case 'listItem': return <li>{children}</li>;
    case 'blockquote': return <blockquote>{children}</blockquote>;
    case 'codeBlock': return <pre><code>{children}</code></pre>;
    case 'horizontalRule': return <hr />;
    case 'image': return <img src={String(node.attrs?.src ?? '')} alt={String(node.attrs?.alt ?? '')} />;
    case 'table': return <table>{children}</table>;
    case 'tableRow': return <tr>{children}</tr>;
    case 'tableCell': return <td>{children}</td>;
    case 'tableHeader': return <th>{children}</th>;
    case 'hardBreak': return <br />;
    default: return <div>{children}</div>;
  }
}

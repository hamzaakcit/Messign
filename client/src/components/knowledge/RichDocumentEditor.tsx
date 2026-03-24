import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Save, X, Upload, FileText, Trash2 } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { common, createLowlight } from 'lowlight';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { knowledgeAPI } from '@/lib/api';
import { EditorToolbar } from './EditorToolbar';

const lowlight = createLowlight(common);

interface KbCategory {
  id: string;
  name: string;
  slug: string;
}

export interface DocumentEditorData {
  title: string;
  description: string;
  content: string;
  categoryId: string;
  tags: string[];
  type: string;
  is_required_reading: boolean;
  file?: File;
}

interface RichDocumentEditorProps {
  initialDoc?: Partial<DocumentEditorData> & { id?: string };
  onSave: (data: DocumentEditorData) => void;
  onCancel: () => void;
}

export function RichDocumentEditor({
  initialDoc,
  onSave,
  onCancel,
}: RichDocumentEditorProps) {
  const userId = useAuthStore((s) => s.user?.id ?? '');

  const [title, setTitle] = useState(initialDoc?.title ?? '');
  const [description, setDescription] = useState(initialDoc?.description ?? '');
  const [content, setContent] = useState(initialDoc?.content ?? '<p></p>');
  const [categoryId, setCategoryId] = useState(initialDoc?.categoryId ?? '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(initialDoc?.tags ?? []);
  const [type, setType] = useState(initialDoc?.type ?? 'wiki');
  const [isRequiredReading, setIsRequiredReading] = useState(
    initialDoc?.is_required_reading ?? false,
  );
  const [categories, setCategories] = useState<KbCategory[]>([]);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({ placeholder: 'Start writing content...' }),
      Highlight,
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-blue-400 underline cursor-pointer' },
      }),
      Image.configure({
        HTMLAttributes: { class: 'rounded-lg max-w-full' },
      }),
      CodeBlockLowlight.configure({ lowlight }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: initialDoc?.content ?? '<p></p>',
    editorProps: {
      attributes: {
        class:
          'prose prose-invert max-w-none min-h-[400px] px-6 py-4 focus:outline-none ' +
          'text-app-text prose-headings:text-app-text prose-p:text-app-muted ' +
          'prose-strong:text-app-text prose-em:text-app-muted ' +
          'prose-a:text-blue-400 prose-blockquote:text-app-muted prose-blockquote:border-gray-600 ' +
          'prose-code:text-emerald-400 prose-code:bg-app-card prose-code:px-1 prose-code:py-0.5 prose-code:rounded ' +
          'prose-pre:bg-app-card prose-pre:border prose-pre:border-app-border ' +
          'prose-li:text-app-muted prose-hr:border-app-border ' +
          'prose-img:rounded-lg',
      },
    },
    onUpdate: ({ editor: e }) => {
      setContent(e.getHTML());
    },
  });

  useEffect(() => {
    if (!userId) return;
    knowledgeAPI.categories
      .list(userId)
      .then((res) => {
        const data = (res as { data?: KbCategory[] }).data ?? (res as KbCategory[]);
        if (Array.isArray(data)) setCategories(data);
      })
      .catch(() => {});
  }, [userId]);

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  }, [tagInput, tags]);

  const handleRemoveTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleFileSelect = (file: File) => {
    setAttachedFile(file);
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (['pdf'].includes(ext)) setType('pdf');
    else if (['doc', 'docx'].includes(ext)) setType('document');
    else if (['ppt', 'pptx'].includes(ext)) setType('presentation');
    else if (['xls', 'xlsx'].includes(ext)) setType('spreadsheet');
    else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) setType('image');
    else if (['mp4', 'webm', 'mov'].includes(ext)) setType('video');
  };

  const handleSave = () => {
    onSave({
      title,
      description,
      content,
      categoryId,
      tags,
      type,
      is_required_reading: isRequiredReading,
      file: attachedFile ?? undefined,
    });
  };

  return (
    <div className="min-h-screen bg-app-bg flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-app-border bg-app-bg/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4 flex-1">
            <button
              onClick={onCancel}
              className="p-2 rounded-lg hover:bg-app-hover text-app-muted hover:text-app-text transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document Title..."
              className="flex-1 text-xl font-semibold text-app-text bg-transparent border-none outline-none placeholder:text-gray-600"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X className="w-4 h-4" />
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              <Save className="w-4 h-4" />
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* Editor + Metadata */}
      <div className="flex-1 flex">
        {/* Editor area */}
        <div className="flex-1 min-w-0 flex flex-col">
          <EditorToolbar editor={editor} />
          <div className="flex-1 overflow-auto">
            <div className="bg-app-bg rounded-lg border border-app-border m-4 overflow-hidden">
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>

        {/* Metadata panel */}
        <div className="w-80 shrink-0 border-l border-app-border bg-app-sidebar overflow-y-auto">
          <div className="p-5 space-y-5">
            <h3 className="text-sm font-semibold text-app-text">Document Info</h3>

            <div>
              <label className="block text-xs font-medium text-app-muted mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Short description..."
                className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text placeholder:text-gray-600 focus:outline-none focus:border-primary-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-app-muted mb-1.5">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text focus:outline-none focus:border-primary-500"
              >
                <option value="">Select category...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-app-muted mb-1.5">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text focus:outline-none focus:border-primary-500"
              >
                <option value="wiki">Wiki</option>
                <option value="guide">Guide</option>
                <option value="announcement">Announcement</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-app-muted mb-1.5">Tags</label>
              <div className="flex gap-2 mb-2 flex-wrap">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary-500/20 text-primary-300 border border-primary-500/30"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-app-text transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Add tag..."
                  className="flex-1 rounded-lg border border-app-border bg-app-bg px-3 py-1.5 text-sm text-app-text placeholder:text-gray-600 focus:outline-none focus:border-primary-500"
                />
                <Button variant="ghost" size="sm" onClick={handleAddTag}>Add</Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-app-muted">Required Reading</label>
              <button
                type="button"
                onClick={() => setIsRequiredReading(!isRequiredReading)}
                className={cn(
                  'relative w-10 h-5 rounded-full transition-colors',
                  isRequiredReading ? 'bg-primary-500' : 'bg-app-hover',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                    isRequiredReading && 'translate-x-5',
                  )}
                />
              </button>
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-xs font-medium text-app-muted mb-1.5">Upload File</label>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.svg,.mp4,.webm,.mov"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />
              {attachedFile ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-app-border bg-app-bg">
                  <FileText className="w-4 h-4 text-primary-400 shrink-0" />
                  <span className="text-sm text-app-text truncate flex-1">{attachedFile.name}</span>
                  <button
                    onClick={() => setAttachedFile(null)}
                    className="p-0.5 rounded hover:bg-app-hover text-app-muted hover:text-app-text transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-gray-600 hover:border-primary-500 bg-app-bg hover:bg-app-hover text-app-muted hover:text-app-text transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">Upload from computer</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

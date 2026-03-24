import { useEffect, useRef, useCallback } from 'react';
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

const lowlight = createLowlight(common);

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
}

export function TipTapEditor({
  content,
  onChange,
  editable = true,
  placeholder = 'Start writing content...',
}: TipTapEditorProps) {
  const lastSavedRef = useRef(content);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({ placeholder }),
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
    content,
    editable,
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
  });

  const saveContent = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    if (html !== lastSavedRef.current) {
      lastSavedRef.current = html;
      onChange(html);
    }
  }, [editor, onChange]);

  useEffect(() => {
    if (!editable) return;
    intervalRef.current = setInterval(saveContent, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [saveContent, editable]);

  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      onChange(editor.getHTML());
    };
    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
    };
  }, [editor, onChange]);

  useEffect(() => {
    if (editor && !editable) {
      editor.setEditable(false);
    } else if (editor && editable) {
      editor.setEditable(true);
    }
  }, [editor, editable]);

  return (
    <div className="bg-app-bg rounded-lg border border-app-border overflow-hidden">
      <EditorContent editor={editor} />
    </div>
  );
}

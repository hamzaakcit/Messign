"use client";

import { useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { common, createLowlight } from "lowlight";
import { EditorToolbar } from "./EditorToolbar";

const lowlight = createLowlight(common);

const AUTO_SAVE_INTERVAL = 30_000;

interface TipTapEditorProps {
  content?: JSONContent;
  onChange?: (content: JSONContent) => void;
  editable?: boolean;
  placeholder?: string;
}

export function TipTapEditor({
  content,
  onChange,
  editable = true,
  placeholder = "Yazmaya başlayın...",
}: TipTapEditorProps) {
  const lastSavedRef = useRef<string>("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
        autolink: true,
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      CodeBlockLowlight.configure({ lowlight }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: content ?? { type: "doc", content: [{ type: "paragraph" }] },
    editable,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose-base dark:prose-invert max-w-none focus:outline-none px-8 py-6",
      },
    },
  });

  const getSnapshot = useCallback(() => {
    if (!editor) return "";
    return JSON.stringify(editor.getJSON());
  }, [editor]);

  useEffect(() => {
    if (!editor || !editable) return;

    lastSavedRef.current = getSnapshot();

    const interval = setInterval(() => {
      const current = getSnapshot();
      if (current !== lastSavedRef.current) {
        lastSavedRef.current = current;
        onChangeRef.current?.(editor.getJSON());
      }
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [editor, editable, getSnapshot]);

  if (!editor) return null;

  return (
    <div className="rounded-lg border bg-background">
      {editable && <EditorToolbar editor={editor} />}
      <div className="min-h-[500px]">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

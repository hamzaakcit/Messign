import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Quote,
  Minus,
  ImageIcon,
  Link2,
  Undo,
  Redo,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditorToolbarProps {
  editor: Editor | null;
}

interface ToolbarButton {
  icon: React.ElementType;
  label: string;
  action: () => void;
  isActive: () => boolean;
}

function Divider() {
  return <div className="w-px h-6 bg-app-hover" />;
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null;

  const handleImage = () => {
    const url = window.prompt('Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const handleLink = () => {
    const url = window.prompt('Enter link URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const groups: (ToolbarButton | 'divider')[][] = [
    [
      {
        icon: Bold,
        label: 'Bold',
        action: () => editor.chain().focus().toggleBold().run(),
        isActive: () => editor.isActive('bold'),
      },
      {
        icon: Italic,
        label: 'Italic',
        action: () => editor.chain().focus().toggleItalic().run(),
        isActive: () => editor.isActive('italic'),
      },
      {
        icon: UnderlineIcon,
        label: 'Underline',
        action: () => editor.chain().focus().toggleUnderline().run(),
        isActive: () => editor.isActive('underline'),
      },
      {
        icon: Strikethrough,
        label: 'Strikethrough',
        action: () => editor.chain().focus().toggleStrike().run(),
        isActive: () => editor.isActive('strike'),
      },
    ],
    [
      {
        icon: Heading1,
        label: 'Heading 1',
        action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        isActive: () => editor.isActive('heading', { level: 1 }),
      },
      {
        icon: Heading2,
        label: 'Heading 2',
        action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        isActive: () => editor.isActive('heading', { level: 2 }),
      },
      {
        icon: Heading3,
        label: 'Heading 3',
        action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        isActive: () => editor.isActive('heading', { level: 3 }),
      },
    ],
    [
      {
        icon: List,
        label: 'Bullet list',
        action: () => editor.chain().focus().toggleBulletList().run(),
        isActive: () => editor.isActive('bulletList'),
      },
      {
        icon: ListOrdered,
        label: 'Numbered list',
        action: () => editor.chain().focus().toggleOrderedList().run(),
        isActive: () => editor.isActive('orderedList'),
      },
      {
        icon: CheckSquare,
        label: 'Task list',
        action: () => editor.chain().focus().toggleTaskList().run(),
        isActive: () => editor.isActive('taskList'),
      },
    ],
    [
      {
        icon: Code,
        label: 'Code block',
        action: () => editor.chain().focus().toggleCodeBlock().run(),
        isActive: () => editor.isActive('codeBlock'),
      },
      {
        icon: Quote,
        label: 'Blockquote',
        action: () => editor.chain().focus().toggleBlockquote().run(),
        isActive: () => editor.isActive('blockquote'),
      },
      {
        icon: Minus,
        label: 'Horizontal rule',
        action: () => editor.chain().focus().setHorizontalRule().run(),
        isActive: () => false,
      },
    ],
    [
      {
        icon: ImageIcon,
        label: 'Image',
        action: handleImage,
        isActive: () => false,
      },
      {
        icon: Link2,
        label: 'Link',
        action: handleLink,
        isActive: () => editor.isActive('link'),
      },
    ],
    [
      {
        icon: Undo,
        label: 'Undo',
        action: () => editor.chain().focus().undo().run(),
        isActive: () => false,
      },
      {
        icon: Redo,
        label: 'Redo',
        action: () => editor.chain().focus().redo().run(),
        isActive: () => false,
      },
    ],
  ];

  return (
    <div className="border-b border-app-border bg-app-sidebar p-2 flex flex-wrap gap-1 sticky top-0 z-10">
      {groups.map((group, gi) => (
        <div key={gi} className="flex items-center gap-1">
          {gi > 0 && <Divider />}
          {group.map((btn, bi) => {
            if (btn === 'divider') return <Divider key={bi} />;
            const Icon = btn.icon;
            const active = btn.isActive();
            return (
              <button
                key={bi}
                type="button"
                onClick={btn.action}
                title={btn.label}
                className={cn(
                  'p-2 rounded hover:bg-app-hover text-app-muted transition-colors',
                  active && 'bg-blue-600/20 text-blue-400',
                )}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

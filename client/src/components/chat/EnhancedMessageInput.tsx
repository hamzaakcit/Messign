import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from 'react';
import { Send, Paperclip, Smile, AtSign, X, Slash } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import { useSlashCommands, SLASH_COMMANDS } from '@/hooks/useSlashCommands';
import { SlashCommandPalette } from './SlashCommandPalette';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

const EMOJI_CATEGORIES = {
  'Smileys': ['😀', '😂', '😊', '🥰', '😅', '🤔', '😎', '🤗', '😤', '🥺', '😭', '🤯'],
  'Gestures': ['👍', '👎', '👋', '🙏', '💪', '🤝', '✌️', '🫡', '👀', '💯', '✅', '❌'],
  'Objects': ['🔥', '⭐', '❤️', '🎉', '✨', '💡', '🎯', '🚀', '⚡', '🏆', '📌', '🔗'],
};

interface EnhancedMessageInputProps {
  channelName: string;
}

export function EnhancedMessageInput({ channelName }: EnhancedMessageInputProps) {
  const [content, setContent] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionPickerRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const sendMessage = useChatStore((s) => s.sendMessage);
  const user = useAuthStore((s) => s.user);
  const users = useUsersStore((s) => s.users);
  const otherUsers = users.filter((u) => u.id !== user?.id);
  const slash = useSlashCommands();

  const insertAtCursor = useCallback((text: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd ?? start;
    const before = content.slice(0, start);
    const after = content.slice(end);
    const next = before + text + after;
    setContent(next);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  }, [content]);

  const MAX_EMBED_IMAGE_SIZE = 1024 * 1024;

  const fileToAttachment = (file: File, index: number): Promise<{ id: string; name: string; type: string; url: string; size: number }> => {
    const id = `att-${Date.now()}-${index}`;
    const base = { id, name: file.name, type: file.type || 'application/octet-stream', url: '', size: file.size };
    if (!file.type.startsWith('image/') || file.size > MAX_EMBED_IMAGE_SIZE) {
      return Promise.resolve(base);
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ ...base, url: reader.result as string });
      reader.onerror = () => resolve(base);
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async () => {
    if (!user) return;
    const hasContent = content.trim().length > 0;
    const hasAttachments = pendingFiles.length > 0;
    if (!hasContent && !hasAttachments) return;
    const attachments = pendingFiles.length ? await Promise.all(pendingFiles.map((f, i) => fileToAttachment(f, i))) : [];
    sendMessage(content.trim(), user.id, { attachments, mentions: [] });
    setContent('');
    setPendingFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slash.isOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); slash.moveSelection('down'); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); slash.moveSelection('up'); return; }
      if (e.key === 'Escape') { e.preventDefault(); slash.close(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!slash.activeCommand) {
          const cmd = SLASH_COMMANDS[slash.selectedIndex];
          if (cmd) {
            slash.open(cmd);
            setContent(cmd.trigger + ' ');
          }
        }
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    // Detect slash commands
    const trimmed = value.trim();
    if (trimmed === '/') {
      slash.open();
    } else {
      const cmd = slash.detectSlashCommand(trimmed);
      if (cmd) {
        const searchPart = trimmed.slice(cmd.trigger.length).trim();
        if (!slash.isOpen || slash.activeCommand?.trigger !== cmd.trigger) {
          slash.open(cmd);
        }
        if (searchPart) slash.search(searchPart);
      } else if (slash.isOpen && !trimmed.startsWith('/')) {
        slash.close();
      }
    }
  };

  const handleSlashSelect = (item: { type: string; id: string; title: string }) => {
    const embedRef = `[${item.type}:${item.id}]`;
    setContent(embedRef + ' ');
    slash.close();
    textareaRef.current?.focus();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) setPendingFiles((prev) => [...prev, ...Array.from(files)]);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) setPendingFiles((prev) => [...prev, ...files]);
  };

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (mentionPickerOpen && mentionPickerRef.current && !mentionPickerRef.current.contains(target)) setMentionPickerOpen(false);
      if (emojiPickerOpen && emojiPickerRef.current && !emojiPickerRef.current.contains(target)) setEmojiPickerOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [mentionPickerOpen, emojiPickerOpen]);

  return (
    <div
      className="p-3 border-t border-app"
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="mb-2 p-4 border-2 border-dashed border-primary-500/50 rounded-xl bg-primary-500/5 text-center text-sm text-primary-400">
          Drop files to attach
        </div>
      )}

      {/* Slash command palette */}
      {slash.isOpen && (
        <SlashCommandPalette
          slash={slash}
          onSelect={handleSlashSelect}
          onClose={slash.close}
        />
      )}

      <div
        className={cn(
          'flex items-end gap-2 p-3 rounded-xl border transition-all duration-200',
          isFocused ? 'border-primary-500 ring-1 ring-primary-500/30 shadow-sm shadow-primary-500/10' : 'border-app-inputBorder',
          'bg-app-inputBg',
        )}
      >
        <input ref={fileInputRef} type="file" multiple className="hidden" accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.csv" onChange={handleFileChange} aria-label="Attach files" />

        <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors" aria-label="Attach file">
          <Paperclip className="w-4.5 h-4.5" />
        </button>

        <button type="button" onClick={() => { slash.open(); textareaRef.current?.focus(); }} className="p-2 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors" aria-label="Slash commands" title="Slash commands">
          <Slash className="w-4.5 h-4.5" />
        </button>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={`Message #${channelName} — type / for commands`}
          aria-label={`Message in channel ${channelName}`}
          rows={1}
          className="flex-1 bg-transparent text-app text-sm placeholder:text-app-muted resize-none focus:outline-none min-h-[24px] max-h-[120px]"
        />

        <div className="flex items-center gap-0.5 relative">
          <div className="relative" ref={mentionPickerRef}>
            <button type="button" onClick={() => { setEmojiPickerOpen(false); setMentionPickerOpen((o) => !o); }} className="p-2 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors" aria-label="Mention someone">
              <AtSign className="w-4.5 h-4.5" />
            </button>
            {mentionPickerOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-56 max-h-48 overflow-y-auto rounded-xl border border-app bg-app-sidebar shadow-xl z-50 py-1">
                {otherUsers.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-app-muted">No other users</p>
                ) : (
                  otherUsers.map((u) => (
                    <button key={u.id} type="button" onClick={() => { insertAtCursor(`@${u.name} `); setMentionPickerOpen(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-app hover:bg-app-hover flex items-center gap-2">
                      <span className="font-medium">{u.name}</span>
                      {u.jobTitle && <span className="text-xs text-app-muted">{u.jobTitle}</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="relative" ref={emojiPickerRef}>
            <button type="button" onClick={() => { setMentionPickerOpen(false); setEmojiPickerOpen((o) => !o); }} className="p-2 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors" aria-label="Insert emoji">
              <Smile className="w-4.5 h-4.5" />
            </button>
            {emojiPickerOpen && (
              <div className="absolute bottom-full right-0 mb-1 w-72 rounded-xl border border-app bg-app-sidebar shadow-xl z-50 p-3 max-h-64 overflow-y-auto">
                {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
                  <div key={category} className="mb-2">
                    <p className="text-[10px] font-semibold text-app-muted uppercase mb-1">{category}</p>
                    <div className="flex flex-wrap gap-0.5">
                      {emojis.map((emoji) => (
                        <button key={emoji} type="button" onClick={() => { insertAtCursor(emoji); setEmojiPickerOpen(false); }}
                          className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-app-hover transition-transform hover:scale-110">
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button onClick={handleSubmit} disabled={!content.trim() && pendingFiles.length === 0} size="sm" className="ml-1">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Pending files */}
      {pendingFiles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {pendingFiles.map((file, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-app-hover text-app text-sm border border-app">
              {file.name}
              <button type="button" onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))} className="p-0.5 hover:text-red-400" aria-label="Remove">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="mt-1.5 text-[11px] text-app-muted text-center">
        <kbd className="px-1 py-0.5 bg-app-hover rounded text-[10px]">Enter</kbd> to send · <kbd className="px-1 py-0.5 bg-app-hover rounded text-[10px]">Shift+Enter</kbd> new line · <kbd className="px-1 py-0.5 bg-app-hover rounded text-[10px]">/</kbd> commands
      </p>
    </div>
  );
}

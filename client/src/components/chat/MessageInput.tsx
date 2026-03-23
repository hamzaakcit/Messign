import { useState, useRef, KeyboardEvent, useEffect } from 'react';
import { Send, Paperclip, Smile, AtSign, X } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

const COMMON_EMOJIS = ['😀', '😂', '👍', '❤️', '🎉', '🔥', '✨', '👋', '🙏', '😊', '😅', '🤔', '👀', '💯', '✅'];

interface MessageInputProps {
  channelName: string;
}

export function MessageInput({ channelName }: MessageInputProps) {
  const [content, setContent] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionPickerRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const sendMessage = useChatStore((s) => s.sendMessage);
  const user = useAuthStore((s) => s.user);
  const users = useUsersStore((s) => s.users);
  const otherUsers = users.filter((u) => u.id !== user?.id);

  const insertAtCursor = (text: string) => {
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
  };

  const MAX_EMBED_IMAGE_SIZE = 1024 * 1024; // 1MB

  const fileToAttachment = (file: File, index: number): Promise<{ id: string; name: string; type: string; url: string; size: number }> => {
    const id = `att-${Date.now()}-${index}`;
    const base = { id, name: file.name, type: file.type || 'application/octet-stream', url: '', size: file.size };
    if (!file.type.startsWith('image/')) {
      return Promise.resolve({ ...base, url: '' });
    }
    if (file.size > MAX_EMBED_IMAGE_SIZE) {
      return Promise.resolve({ ...base, url: '' }); // too large, send metadata only
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ ...base, url: reader.result as string });
      reader.onerror = () => resolve({ ...base, url: '' });
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async () => {
    if (!user) return;
    const hasContent = content.trim().length > 0;
    const hasAttachments = pendingFiles.length > 0;
    if (!hasContent && !hasAttachments) return;
    const attachments = pendingFiles.length
      ? await Promise.all(pendingFiles.map((f, i) => fileToAttachment(f, i)))
      : [];
    sendMessage(content.trim(), user.id, { attachments, mentions: [] });
    setContent('');
    setPendingFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) setPendingFiles((prev) => [...prev, ...Array.from(files)]);
    e.target.value = '';
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
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
    <div className="p-4 border-t border-app">
      <div
        className={cn(
          'flex items-end gap-2 p-3 rounded-xl border transition-all duration-200',
          isFocused ? 'border-primary-500 ring-1 ring-primary-500' : 'border-app-inputBorder',
          'bg-app-inputBg'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.txt"
          onChange={handleFileChange}
          aria-label="Attach files"
        />
        {/* Attachment Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors"
          aria-label="Attach file"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={`Message #${channelName}`}
          aria-label={`Message in channel ${channelName}`}
          rows={1}
          className="flex-1 bg-transparent text-app placeholder:text-app-muted resize-none focus:outline-none min-h-[24px] max-h-[120px]"
        />

        {/* Action Buttons */}
        <div className="flex items-center gap-1 relative">
          <div className="relative" ref={mentionPickerRef}>
            <button
              type="button"
              onClick={() => { setEmojiPickerOpen(false); setMentionPickerOpen((o) => !o); }}
              className="p-2 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors"
              aria-label="Mention someone"
            >
              <AtSign className="w-5 h-5" />
            </button>
            {mentionPickerOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-56 max-h-48 overflow-y-auto rounded-lg border border-app bg-app-sidebar shadow-lg z-50 py-1">
                {otherUsers.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-app-muted">No other users</p>
                ) : (
                  otherUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { insertAtCursor(`@${u.name} `); setMentionPickerOpen(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-app hover:bg-app-hover flex items-center gap-2"
                    >
                      <span className="font-medium">{u.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="relative" ref={emojiPickerRef}>
            <button
              type="button"
              onClick={() => { setMentionPickerOpen(false); setEmojiPickerOpen((o) => !o); }}
              className="p-2 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors"
              aria-label="Insert emoji"
            >
              <Smile className="w-5 h-5" />
            </button>
            {emojiPickerOpen && (
              <div className="absolute bottom-full right-0 mb-1 w-64 rounded-lg border border-app bg-app-sidebar shadow-lg z-50 p-2 flex flex-wrap gap-1">
                {COMMON_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => { insertAtCursor(emoji); setEmojiPickerOpen(false); }}
                    className="w-8 h-8 flex items-center justify-center text-lg rounded hover:bg-app-hover"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!content.trim() && pendingFiles.length === 0}
            size="sm"
            className="ml-1"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {pendingFiles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {pendingFiles.map((file, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-app-hover text-app text-sm"
            >
              {file.name}
              <button type="button" onClick={() => removePendingFile(i)} className="p-0.5 hover:text-danger-500" aria-label="Remove">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Hint */}
      <p className="mt-2 text-xs text-app-muted text-center">
        Press <kbd className="px-1 py-0.5 bg-app-hover rounded text-app-muted">Enter</kbd> to send,{' '}
        <kbd className="px-1 py-0.5 bg-app-hover rounded text-app-muted">Shift + Enter</kbd> for new line
      </p>
    </div>
  );
}

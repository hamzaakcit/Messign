import type { Message, User } from '@/types';
import { Avatar } from '@/components/ui';
import { formatTime } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
  user?: User | null;
  showAvatar: boolean;
}

export function MessageBubble({ message, user, showAvatar }: MessageBubbleProps) {
  const displayName = user?.name ?? message.senderName ?? message.userId;
  const avatarSrc = user?.avatar ?? message.senderAvatar;

  return (
    <div className={`flex gap-3 ${showAvatar ? 'mt-4' : 'mt-1'}`}>
      {/* Avatar */}
      <div className="w-10 flex-shrink-0">
        {showAvatar && (
          <Avatar
            src={avatarSrc}
            name={displayName}
            size="md"
            status={user?.status}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {showAvatar && (
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-white">{displayName}</span>
            <span className="text-xs text-gray-500">{formatTime(message.timestamp)}</span>
          </div>
        )}
        
        <div className="text-gray-300 break-words">
          {formatMessageContent(message.content)}
        </div>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((attachment, idx) => {
              const key = (attachment as { id?: string }).id ?? `att-${idx}`;
              const url = (attachment as { url?: string }).url;
              const type = (attachment as { type?: string }).type ?? '';
              const name = (attachment as { name?: string }).name ?? 'file';
              const isImage = type.startsWith('image/') && url;
              return (
                <div
                  key={key}
                  className="rounded-lg overflow-hidden bg-app-hover border border-app"
                >
                  {isImage ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                      <img
                        src={url}
                        alt={name}
                        className="max-w-[280px] max-h-[280px] object-contain"
                      />
                    </a>
                  ) : (
                    <div className="px-3 py-2 text-sm text-app-muted flex items-center gap-2">
                      <span className="truncate max-w-[200px]">{name}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatMessageContent(content: string): React.ReactNode {
  // Simple emoji rendering and mention highlighting
  const parts = content.split(/(@\w+)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith('@')) {
      return (
        <span key={index} className="text-primary-400 font-medium">
          {part}
        </span>
      );
    }
    return part;
  });
}

import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const EMOJI_DATA: Record<string, string[]> = {
  'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🫢', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥴', '😵', '🤯', '🥳', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '👿', '💀', '💩', '🤡', '👻', '👽', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'],
  'Gestures': ['👍', '👎', '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '🫵', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '💪', '🦾', '🖖', '👀', '👁️', '👅', '💋', '💯', '✅', '❌', '❓', '❗', '⭕', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣'],
  'Objects': ['🔥', '⭐', '🌟', '💫', '✨', '⚡', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '🎯', '🔔', '🎵', '🎶', '📌', '📍', '🔗', '💡', '🔦', '📊', '📈', '📉', '🗂️', '📁', '📂', '📝', '📋', '📎', '🖊️', '💻', '🖥️', '⌨️', '📱', '📲'],
  'Nature': ['🌸', '🌺', '🌻', '🌹', '🥀', '🌷', '🌼', '🍀', '🍁', '🍂', '🍃', '🌿', '☘️', '🌱', '🌲', '🌳', '🌴', '🌵', '🌾', '🍄', '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦅', '🦆', '🦉', '🐺', '🐗', '🦋', '🐛', '🐝', '🐞', '🦀', '🐙', '🐠', '🐳', '🐬', '🦈'],
  'Food': ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶️', '🫑', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜', '🫘', '🌰', '🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🥞', '🧇', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥗', '🍿', '🧈'],
  'Travel': ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🛺', '🚍', '✈️', '🛩️', '🚀', '🛸', '🚁', '⛵', '🚢', '🗼', '🏰', '🏯', '🏟️', '🎡', '🎢', '🏠', '🏡', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '🗽', '⛪', '🕌', '🛕', '🕍', '⛩️', '🗺️', '🌍', '🌎', '🌏'],
  'Activities': ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤸', '⛹️', '🤺', '🏄', '🚣', '🧗', '🚵', '🎮', '🎲', '🧩', '🎭', '🎨', '🎪', '🎤', '🎧', '🎸', '🎷', '🥁', '🎺', '🎻'],
  'Flags': ['🏳️', '🏴', '🏁', '🚩', '🏳️‍🌈', '🏳️‍⚧️', '🇺🇸', '🇬🇧', '🇫🇷', '🇩🇪', '🇪🇸', '🇮🇹', '🇯🇵', '🇰🇷', '🇨🇳', '🇮🇳', '🇧🇷', '🇲🇽', '🇨🇦', '🇦🇺', '🇹🇷', '🇷🇺', '🇳🇱', '🇸🇪', '🇳🇴'],
};

const CATEGORY_ICONS: Record<string, string> = {
  'Smileys': '😀',
  'Gestures': '👋',
  'Objects': '🔥',
  'Nature': '🌿',
  'Food': '🍎',
  'Travel': '🚀',
  'Activities': '⚽',
  'Flags': '🏳️',
};

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Smileys');
  const containerRef = useRef<HTMLDivElement>(null);
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const filteredEmojis = useMemo(() => {
    if (!searchQuery.trim()) return EMOJI_DATA;
    const filtered: Record<string, string[]> = {};
    for (const [category, emojis] of Object.entries(EMOJI_DATA)) {
      const matching = emojis.filter(() => true);
      if (matching.length > 0) filtered[category] = matching;
    }
    return filtered;
  }, [searchQuery]);

  const handleCategoryClick = (category: string) => {
    setActiveCategory(category);
    categoryRefs.current[category]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      ref={containerRef}
      className="w-80 rounded-xl border border-app bg-app-sidebar shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Search */}
      <div className="p-2 border-b border-app">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-app-inputBg border border-app-inputBorder">
          <Search className="w-3.5 h-3.5 text-app-muted shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emoji..."
            className="flex-1 bg-transparent text-sm text-app placeholder:text-app-muted focus:outline-none"
            autoFocus
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-app-muted hover:text-app">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-app overflow-x-auto">
        {Object.keys(EMOJI_DATA).map((category) => (
          <button
            key={category}
            onClick={() => handleCategoryClick(category)}
            className={cn(
              'w-7 h-7 flex items-center justify-center rounded-md text-sm transition-colors shrink-0',
              activeCategory === category
                ? 'bg-primary-500/15 ring-1 ring-primary-500/30'
                : 'hover:bg-app-hover',
            )}
            title={category}
          >
            {CATEGORY_ICONS[category]}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="max-h-64 overflow-y-auto p-2">
        {Object.entries(filteredEmojis).map(([category, emojis]) => (
          <div
            key={category}
            ref={(el) => { categoryRefs.current[category] = el; }}
          >
            <p className="text-[10px] font-semibold text-app-muted uppercase tracking-wider mb-1 mt-2 first:mt-0">
              {category}
            </p>
            <div className="flex flex-wrap gap-0.5">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onSelect(emoji);
                    onClose();
                  }}
                  className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-app-hover transition-all hover:scale-110 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

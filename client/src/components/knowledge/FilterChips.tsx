import { cn } from '@/lib/utils';

interface Category {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
  document_count?: number;
}

interface Props {
  categories: Category[];
  activeSlug: string | null; // null = "All"
  onSelect: (slug: string | null) => void;
}

export function FilterChips({ categories, activeSlug, onSelect }: Props) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          'shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-all',
          activeSlug === null
            ? 'bg-primary-500/20 text-primary-400 border-primary-500/30'
            : 'bg-app-sidebar text-app-muted border-app-border hover:border-app-border-hover hover:text-app'
        )}
      >
        All
      </button>
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.slug)}
          className={cn(
            'shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-all flex items-center gap-1.5',
            activeSlug === cat.slug
              ? 'border-opacity-50 text-app-text'
              : 'bg-app-sidebar text-app-muted border-app-border hover:border-app-border-hover hover:text-app'
          )}
          style={activeSlug === cat.slug && cat.color ? { backgroundColor: cat.color + '30', borderColor: cat.color + '60', color: cat.color } : undefined}
        >
          {cat.name}
          {cat.document_count !== undefined && (
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full',
              activeSlug === cat.slug ? 'bg-app-surface-tertiary' : 'bg-app-hover'
            )}>
              {cat.document_count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

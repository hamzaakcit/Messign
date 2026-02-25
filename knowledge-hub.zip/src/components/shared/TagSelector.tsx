"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

interface TagSelectorProps {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  tags: Tag[];
  className?: string;
}

export function TagSelector({
  selectedTags,
  onChange,
  tags,
  className,
}: TagSelectorProps) {
  const [open, setOpen] = useState(false);

  const toggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      onChange(selectedTags.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTags, tagId]);
    }
  };

  const removeTag = (tagId: string) => {
    onChange(selectedTags.filter((id) => id !== tagId));
  };

  const selectedTagObjects = tags.filter((t) => selectedTags.includes(t.id));

  return (
    <div className={cn("space-y-2", className)}>
      {selectedTagObjects.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTagObjects.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="gap-1 pr-1"
              style={tag.color ? { backgroundColor: `${tag.color}20`, color: tag.color } : undefined}
            >
              {tag.name}
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? "Etiketleri gizle" : "Etiket seç..."}
      </button>

      {open && (
        <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
          {tags.map((tag) => (
            <label
              key={tag.id}
              className="flex items-center gap-2 cursor-pointer hover:bg-accent/50 rounded px-2 py-1"
            >
              <Checkbox
                checked={selectedTags.includes(tag.id)}
                onCheckedChange={() => toggleTag(tag.id)}
              />
              <span className="text-sm">{tag.name}</span>
            </label>
          ))}
          {tags.length === 0 && (
            <p className="text-sm text-muted-foreground">Etiket bulunamadı</p>
          )}
        </div>
      )}
    </div>
  );
}

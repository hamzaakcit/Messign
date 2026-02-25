"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Filter, X } from "lucide-react";

interface Filters {
  category: string;
  documentType: string;
  tags: string[];
}

interface SearchFiltersProps {
  onFilterChange: (filters: Filters) => void;
  categories?: { id: string; name: string }[];
  tags?: { id: string; name: string }[];
}

const DOCUMENT_TYPES = [
  { value: "GUIDE", label: "Rehber" },
  { value: "API_DOC", label: "API Dokümanı" },
  { value: "TUTORIAL", label: "Tutorial" },
  { value: "FAQ", label: "SSS" },
  { value: "RUNBOOK", label: "Runbook" },
  { value: "OTHER", label: "Diğer" },
];

export function SearchFilters({
  onFilterChange,
  categories = [],
  tags = [],
}: SearchFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    category: "",
    documentType: "",
    tags: [],
  });

  const updateFilters = (partial: Partial<Filters>) => {
    const updated = { ...filters, ...partial };
    setFilters(updated);
    onFilterChange(updated);
  };

  const toggleTag = (tagId: string) => {
    const newTags = filters.tags.includes(tagId)
      ? filters.tags.filter((t) => t !== tagId)
      : [...filters.tags, tagId];
    updateFilters({ tags: newTags });
  };

  const clearFilters = () => {
    const cleared: Filters = { category: "", documentType: "", tags: [] };
    setFilters(cleared);
    onFilterChange(cleared);
  };

  const hasActiveFilters =
    filters.category || filters.documentType || filters.tags.length > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center gap-2">
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="w-4 h-4" />
            Filtreler
            <ChevronDown
              className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs text-muted-foreground"
            onClick={clearFilters}
          >
            <X className="w-3 h-3" />
            Temizle
          </Button>
        )}
      </div>

      <CollapsibleContent className="mt-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-4 border rounded-lg bg-muted/30">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Kategori</Label>
            <Select
              value={filters.category}
              onValueChange={(value) =>
                updateFilters({ category: value === "all" ? "" : value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Tümü" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Doküman Tipi</Label>
            <Select
              value={filters.documentType}
              onValueChange={(value) =>
                updateFilters({ documentType: value === "all" ? "" : value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Tümü" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                {DOCUMENT_TYPES.map((dt) => (
                  <SelectItem key={dt.value} value={dt.value}>
                    {dt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Etiketler</Label>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {tags.length > 0 ? (
                tags.map((tag) => (
                  <div key={tag.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`tag-${tag.id}`}
                      checked={filters.tags.includes(tag.id)}
                      onCheckedChange={() => toggleTag(tag.id)}
                    />
                    <Label
                      htmlFor={`tag-${tag.id}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {tag.name}
                    </Label>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  Etiket bulunamadı
                </p>
              )}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

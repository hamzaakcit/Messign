"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  FileText,
  Search,
  FolderTree,
  Bot,
  Plus,
  Settings,
  Shield,
} from "lucide-react";

interface SearchDoc {
  id: string;
  title: string;
  slug: string;
}

const PAGES = [
  { label: "Knowledge Hub", href: "/knowledge-hub", icon: FolderTree },
  { label: "Arama", href: "/knowledge-hub/search", icon: Search },
  { label: "Koleksiyonlar", href: "/knowledge-hub/collections", icon: FolderTree },
  { label: "AI Asistan", href: "/knowledge-hub/ai-assistant", icon: Bot },
  { label: "Admin Panel", href: "/admin", icon: Shield },
  { label: "Ayarlar", href: "/admin/categories", icon: Settings },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState<SearchDoc[]>([]);
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const searchDocs = useCallback(async (q: string) => {
    if (!q.trim()) {
      setDocs([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        const results = data.results ?? data.documents ?? [];
        setDocs(
          results.slice(0, 8).map((d: { id: string; title: string; slug: string }) => ({
            id: d.id,
            title: d.title,
            slug: d.slug,
          }))
        );
      }
    } catch {
      setDocs([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchDocs(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, searchDocs]);

  const navigate = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Komut Paleti"
      description="Doküman arayın veya sayfalar arasında gezinin"
    >
      <CommandInput
        placeholder="Doküman veya sayfa ara..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>

        {docs.length > 0 && (
          <CommandGroup heading="Dokümanlar">
            {docs.map((doc) => (
              <CommandItem
                key={doc.id}
                onSelect={() =>
                  navigate(`/knowledge-hub/documents/${doc.slug}`)
                }
              >
                <FileText className="w-4 h-4 mr-2" />
                {doc.title}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Sayfalar">
          {PAGES.map((page) => (
            <CommandItem
              key={page.href}
              onSelect={() => navigate(page.href)}
            >
              <page.icon className="w-4 h-4 mr-2" />
              {page.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="İşlemler">
          <CommandItem
            onSelect={() => navigate("/knowledge-hub/documents/new")}
          >
            <Plus className="w-4 h-4 mr-2" />
            Yeni Doküman
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
